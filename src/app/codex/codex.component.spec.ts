import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CodexComponent } from './codex.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Component, Input, provideZonelessChangeDetection } from '@angular/core';
import { MapViewerComponent } from './map-viewer/map-viewer.component';
import {
    createMockCodexData,
    MOCK_ENTITY,
    MOCK_RULES_CACHE,
    MOCK_EQUIPMENT_CACHE,
    MOCK_SPELLS_CACHE
} from './codex.component.spec.helpers';

// Mock the child MapViewer component
@Component({
    selector: 'app-map-viewer',
    standalone: true,
    template: '<div>Map Viewer Mock</div>'
})
class MockMapViewerComponent {
    @Input() imageUrl: string = '';
    @Input() caption: string = '';
}

describe('CodexComponent', () => {
    let component: CodexComponent;
    let fixture: ComponentFixture<CodexComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [CodexComponent, HttpClientTestingModule, MockMapViewerComponent],
            providers: [provideZonelessChangeDetection()]
        })
            .overrideComponent(CodexComponent, {
                remove: { imports: [MapViewerComponent] },
                add: { imports: [MockMapViewerComponent] }
            })
            .compileComponents();

        fixture = TestBed.createComponent(CodexComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);

        // Initial data load triggers (ngOnInit)
        fixture.detectChanges();
    });

    afterEach(() => {
        httpMock.verify();
    });

    describe('Initialization & Data Loading', () => {
        it('should load codex data and caches on init', async () => {
            // 1. Handle Codex Data request
            const dataReq = httpMock.expectOne('api/codex/data');
            expect(dataReq.request.method).toBe('GET');
            dataReq.flush(createMockCodexData());

            // 2. Handle Cache requests
            const rulesReq = httpMock.expectOne('api/admin/collections/rules_pf1e');
            const equipReq = httpMock.expectOne('api/admin/collections/equipment_pf1e');
            const spellsReq = httpMock.expectOne('api/admin/collections/spells_pf1e');

            rulesReq.flush(MOCK_RULES_CACHE);
            equipReq.flush(MOCK_EQUIPMENT_CACHE);
            spellsReq.flush(MOCK_SPELLS_CACHE);

            // FIX: Ensure Promises from loadCaches have fully resolved and signals updated
            await fixture.whenStable();
            await new Promise(resolve => setTimeout(resolve, 0));
            fixture.detectChanges();

            expect(component.rulesCache().size).toBe(1);
            expect(component.equipmentCache().size).toBe(1);
        });

        it('should handle data load errors gracefully', async () => {
            const dataReq = httpMock.expectOne('api/codex/data');
            // Return a specific error structure
            dataReq.flush({ error: 'Server Error' }, { status: 500, statusText: 'Server Error' });

            // Clear pending cache requests (we don't care about them for this error test)
            httpMock.expectOne('api/admin/collections/rules_pf1e').flush([]);
            httpMock.expectOne('api/admin/collections/equipment_pf1e').flush([]);
            httpMock.expectOne('api/admin/collections/spells_pf1e').flush([]);

            await fixture.whenStable();
            fixture.detectChanges();

            expect(component.error()).toContain('Server Error');
            expect(component.isLoading()).toBe(false);
        });
    });

    describe('Navigation & View Logic', () => {
        beforeEach(async () => {
            httpMock.expectOne('api/codex/data').flush(createMockCodexData());
            httpMock.expectOne('api/admin/collections/rules_pf1e').flush([]);
            httpMock.expectOne('api/admin/collections/equipment_pf1e').flush([]);
            httpMock.expectOne('api/admin/collections/spells_pf1e').flush([]);
            await fixture.whenStable();
            fixture.detectChanges();
        });

        it('should start at root view', () => {
            expect(component.currentPath()).toEqual([]);
            const view = component.currentView();
            expect(view.entries.length).toBe(2);
            expect(view.activeEntry).toBeNull();
        });

        it('should navigate to a category', () => {
            const categoryEntry = createMockCodexData()[0];
            component.navigateTo(categoryEntry);
            fixture.detectChanges();

            expect(component.currentPath()).toEqual(['Locations']);
            expect(component.isCategoryNode()).toBe(true);
        });

        it('should navigate to a leaf node', async () => {
            const leafEntry = createMockCodexData()[1]; // Town Square
            component.navigateTo(leafEntry);
            fixture.detectChanges();

            expect(component.currentPath()).toEqual(['Locations', 'Town_Square']);
            expect(component.isCategoryNode()).toBe(false);

            // FIX: Expect the side-effect request because Town Square has an entity_id
            const entityReq = httpMock.expectOne('api/codex/get-entities');
            entityReq.flush([]);
            await fixture.whenStable();
        });
    });

    describe('Entity Linking & Effects', () => {
        beforeEach(async () => {
            httpMock.expectOne('api/codex/data').flush(createMockCodexData());
            httpMock.expectOne('api/admin/collections/rules_pf1e').flush([]);
            httpMock.expectOne('api/admin/collections/equipment_pf1e').flush([]);
            httpMock.expectOne('api/admin/collections/spells_pf1e').flush([]);
            await fixture.whenStable();
            fixture.detectChanges();
        });

        it('should fetch linked entities when navigating to a node with entityId', async () => {
            component.currentPath.set(['Bestiary', 'Goblin']);
            fixture.detectChanges(); // Trigger first effect

            const req = httpMock.expectOne('api/codex/get-entities');
            expect(req.request.body.entityIds).toContain('ent-goblin-001');
            req.flush([MOCK_ENTITY]);

            await fixture.whenStable();
            fixture.detectChanges(); // Trigger second effect

            const detailsReq = httpMock.expectOne('api/codex/get-linked-details');
            detailsReq.flush({ rules: MOCK_RULES_CACHE, equipment: [], spells: [] });

            await fixture.whenStable();

            expect(component.linkedEntities().length).toBe(1);
        });
    });

    describe('Edit Mode & Data Manipulation', () => {
        beforeEach(async () => {
            // 1. Satisfy initial requests
            httpMock.expectOne('api/codex/data').flush(createMockCodexData());
            httpMock.expectOne('api/admin/collections/rules_pf1e').flush([]);
            httpMock.expectOne('api/admin/collections/equipment_pf1e').flush([]);
            httpMock.expectOne('api/admin/collections/spells_pf1e').flush([]);

            await fixture.whenStable();
            fixture.detectChanges();

            // 2. Navigate to a node that has content
            component.currentPath.set(['Locations', 'Town_Square']);
            fixture.detectChanges();

            // 3. Handle the entity fetch triggered by this navigation
            const entityReq = httpMock.expectOne('api/codex/get-entities');
            entityReq.flush([]);
            await fixture.whenStable();
            fixture.detectChanges();
        });

        it('should toggle edit mode', () => {
            component.isEditMode.set(true);
            fixture.detectChanges();
            expect(component.isEditMode()).toBe(true);
        });

        it('should add a new content block', () => {
            const initialLength = component.currentView().content?.length || 0;
            component.addBlock('paragraph');
            const newLength = component.currentView().content?.length || 0;
            expect(newLength).toBe(initialLength + 1);
        });

        it('should save changes to server', async () => {
            component.isEditMode.set(true);
            component.saveChanges();

            const req = httpMock.expectOne('api/codex/data');
            expect(req.request.method).toBe('PUT');
            req.flush({});

            await fixture.whenStable();
            fixture.detectChanges(); // Update UI

            expect(component.isEditMode()).toBe(false);
        });

        it('should update entity skills', () => {
            component.linkedEntities.set([JSON.parse(JSON.stringify(MOCK_ENTITY))]);
            component.isEditMode.set(true);

            const mockNameInput = { value: 'Acrobatics' } as HTMLInputElement;
            const mockValueInput = { value: '5' } as HTMLInputElement;

            component.addEntitySkill(component.linkedEntities()[0], mockNameInput, mockValueInput);

            expect(component.linkedEntities()[0]['baseStats'].skills['Acrobatics']).toBe(5);
            expect(component.modifiedEntities().has(MOCK_ENTITY._id)).toBe(true);
        });
    });

    describe('Completion Tracking', () => {
        beforeEach(async () => {
            httpMock.expectOne('api/codex/data').flush(createMockCodexData());
            httpMock.expectOne('api/admin/collections/rules_pf1e').flush([]);
            httpMock.expectOne('api/admin/collections/equipment_pf1e').flush([]);
            httpMock.expectOne('api/admin/collections/spells_pf1e').flush([]);
            await fixture.whenStable();
            fixture.detectChanges();
        });

        it('should toggle completion status for an entry', async () => {
            component.currentPath.set(['Bestiary']);
            fixture.detectChanges();

            const goblinEntry = component.currentView().entries[0];
            component.toggleCompletion(goblinEntry);

            const req = httpMock.expectOne('api/codex/item');
            expect(req.request.method).toBe('PATCH');
            req.flush({});
        });
    });
});