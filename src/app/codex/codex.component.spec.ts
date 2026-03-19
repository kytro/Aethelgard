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
            const dataReq = httpMock.expectOne('api/v1/entries?limit=10000');
            expect(dataReq.request.method).toBe('GET');
            dataReq.flush({ data: createMockCodexData() });

            // 2. Handle Cache requests
            const rulesReq = httpMock.expectOne('api/v1/rules');
            const equipReq = httpMock.expectOne('api/v1/equipment');
            const spellsReq = httpMock.expectOne('api/v1/spells');

            rulesReq.flush({ data: MOCK_RULES_CACHE });
            equipReq.flush({ data: MOCK_EQUIPMENT_CACHE });
            spellsReq.flush({ data: MOCK_SPELLS_CACHE });

            // FIX: Ensure Promises from loadCaches have fully resolved and signals updated
            await fixture.whenStable();
            await new Promise(resolve => setTimeout(resolve, 0));
            fixture.detectChanges();

            expect(component.rulesCache().size).toBe(1);
            expect(component.equipmentCache().size).toBe(1);
        });

        it('should handle data load errors gracefully', async () => {
            const dataReq = httpMock.expectOne('api/v1/entries?limit=10000');
            // Return a specific error structure
            dataReq.flush({ error: 'Server Error' }, { status: 500, statusText: 'Server Error' });

            // Clear pending cache requests (we don't care about them for this error test)
            httpMock.expectOne('api/v1/rules').flush({ data: [] });
            httpMock.expectOne('api/v1/equipment').flush({ data: [] });
            httpMock.expectOne('api/v1/spells').flush({ data: [] });

            await fixture.whenStable();
            fixture.detectChanges();

            expect(component.error()).toContain('Server Error');
            expect(component.isLoading()).toBe(false);
        });
    });

    describe('Navigation & View Logic', () => {
        beforeEach(async () => {
            httpMock.expectOne('api/v1/entries?limit=10000').flush({ data: createMockCodexData() });
            httpMock.expectOne('api/v1/rules').flush({ data: [] });
            httpMock.expectOne('api/v1/equipment').flush({ data: [] });
            httpMock.expectOne('api/v1/spells').flush({ data: [] });
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
            const entityReq = httpMock.expectOne('api/v1/entities/batch');
            entityReq.flush({ data: [] });
            await fixture.whenStable();
        });
    });

    describe('Entity Linking & Effects', () => {
        beforeEach(async () => {
            httpMock.expectOne('api/v1/entries?limit=10000').flush({ data: createMockCodexData() });
            httpMock.expectOne('api/v1/rules').flush({ data: [] });
            httpMock.expectOne('api/v1/equipment').flush({ data: [] });
            httpMock.expectOne('api/v1/spells').flush({ data: [] });
            await fixture.whenStable();
            fixture.detectChanges();
        });

        it('should fetch linked entities when navigating to a node with entityId', async () => {
            component.currentPath.set(['Bestiary', 'Goblin']);
            fixture.detectChanges(); // Trigger first effect

            const req = httpMock.expectOne('api/v1/entities/batch');
            expect(req.request.body.ids).toContain('ent-goblin-001');
            req.flush({ data: [MOCK_ENTITY] });

            await fixture.whenStable();
            fixture.detectChanges(); // Trigger second effect

            const detailsReq = httpMock.expectOne('api/v1/linked-details');
            detailsReq.flush({ data: { rules: MOCK_RULES_CACHE, equipment: [], spells: [] } });

            await fixture.whenStable();

            expect(component.linkedEntities().length).toBe(1);
        });
    });

    describe('Edit Mode & Data Manipulation', () => {
        beforeEach(async () => {
            // 1. Satisfy initial requests
            httpMock.expectOne('api/v1/entries?limit=10000').flush({ data: createMockCodexData() });
            httpMock.expectOne('api/v1/rules').flush({ data: [] });
            httpMock.expectOne('api/v1/equipment').flush({ data: [] });
            httpMock.expectOne('api/v1/spells').flush({ data: [] });

            await fixture.whenStable();
            fixture.detectChanges();

            // 2. Navigate to a node that has content
            component.currentPath.set(['Locations', 'Town_Square']);
            fixture.detectChanges();

            // 3. Handle the entity fetch triggered by this navigation
            const entityReq = httpMock.expectOne('api/v1/entities/batch');
            entityReq.flush({ data: [] });
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

            const req = httpMock.expectOne('api/v1/entries/bulk');
            expect(req.request.method).toBe('POST');
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
            httpMock.expectOne('api/v1/entries?limit=10000').flush({ data: createMockCodexData() });
            httpMock.expectOne('api/v1/rules').flush({ data: [] });
            httpMock.expectOne('api/v1/equipment').flush({ data: [] });
            httpMock.expectOne('api/v1/spells').flush({ data: [] });
            await fixture.whenStable();
            fixture.detectChanges();
        });

        it('should toggle completion status for an entry', async () => {
            component.currentPath.set(['Bestiary']);
            fixture.detectChanges();

            const goblinEntry = component.currentView().entries[0];
            component.toggleCompletion(goblinEntry);

            const req = httpMock.expectOne(req => req.url.includes('api/v1/entries/by-path') && req.method === 'PATCH');
            expect(req.request.body).toEqual({ isCompleted: false });
            req.flush({});
        });
    });

    describe('AI Complete Feature', () => {
        const MOCK_AI_PREVIEW = {
            entityId: 'ent-goblin-001',
            entityName: 'Goblin Grunt',
            additions: {
                skills: { 'Perception': 4, 'Acrobatics': 2 },
                equipment: ['eq-dagger'],
                spells: { '0': ['sp-light'] },
                spellSlots: { '0': 3 },
                feats: ['Weapon Finesse'],
                notes: 'Added basic class skills for a warrior.'
            },
            original: {
                skills: { 'Stealth': 6 },
                equipment: ['eq-shortsword'],
                spells: { '0': ['sp-daze'] },
                spellSlots: {}
            }
        };

        beforeEach(async () => {
            httpMock.expectOne('api/v1/entries?limit=10000').flush({ data: createMockCodexData() });
            httpMock.expectOne('api/v1/rules').flush({ data: MOCK_RULES_CACHE });
            httpMock.expectOne('api/v1/equipment').flush({
                data: [
                    ...MOCK_EQUIPMENT_CACHE,
                    { _id: 'eq-dagger', name: 'Dagger', description: 'A small blade.', cost: '2gp', weight: '1lb' }
                ]
            });
            httpMock.expectOne('api/v1/spells').flush({
                data: [
                    ...MOCK_SPELLS_CACHE,
                    { _id: 'sp-light', name: 'Light', description: 'Creates light.' }
                ]
            });
            await fixture.whenStable();
            fixture.detectChanges();

            // Set up linked entity - this triggers an effect that fetches linked details
            component.linkedEntities.set([JSON.parse(JSON.stringify(MOCK_ENTITY))]);
            fixture.detectChanges();

            // Handle the get-linked-details request triggered by the linkedEntities effect
            const detailsReq = httpMock.expectOne('api/v1/linked-details');
            detailsReq.flush({
                data: {
                    rules: MOCK_RULES_CACHE,
                    equipment: MOCK_EQUIPMENT_CACHE,
                    spells: MOCK_SPELLS_CACHE
                }
            });
            await fixture.whenStable();
        });

        it('should request AI complete and set loading state', async () => {
            const entity = component.linkedEntities()[0];

            // Start the request (don't await yet)
            const requestPromise = component.requestAiComplete(entity);

            // Check loading state is set immediately
            expect(component.aiCompleteLoading()).toBe(true);
            expect(component.aiCompletingEntityId()).toBe(entity._id);

            // Handle the API request
            const req = httpMock.expectOne(`api/v1/entities/${entity._id}/ai-complete`);
            expect(req.request.method).toBe('POST');
            // Check that no body required or empty
            req.flush(MOCK_AI_PREVIEW);

            await requestPromise;
            await fixture.whenStable();

            // Verify loading is complete and preview is set
            expect(component.aiCompleteLoading()).toBe(false);
            expect(component.aiCompletePreview()).toEqual(MOCK_AI_PREVIEW);
        });

        it('should handle AI complete API errors gracefully', async () => {
            const entity = component.linkedEntities()[0];

            const requestPromise = component.requestAiComplete(entity);

            const req = httpMock.expectOne(`api/v1/entities/${entity._id}/ai-complete`);
            req.flush({ error: 'AI service unavailable' }, { status: 500, statusText: 'Server Error' });

            await requestPromise;
            await fixture.whenStable();

            expect(component.aiCompleteLoading()).toBe(false);
            expect(component.aiCompletePreview()).toBeNull();
            // The error message could be the API error or the fallback
            expect(component.error()).toBeTruthy();
        });

        it('should apply AI suggestions to entity', async () => {
            const entity = component.linkedEntities()[0];
            component.aiCompletePreview.set(MOCK_AI_PREVIEW);
            component.aiCompletingEntityId.set(entity._id);

            // applyAiComplete is now async and makes an HTTP call
            const applyPromise = component.applyAiComplete();

            // Handle the PUT request to save the entity
            const saveReq = httpMock.expectOne(`api/v1/entities/${entity._id}`);
            expect(saveReq.request.method).toBe('PUT');
            saveReq.flush({});

            await applyPromise;
            await fixture.whenStable();

            // Handle any triggered get-linked-details request from updating linkedEntities
            const pendingReqs = httpMock.match('api/v1/linked-details');
            pendingReqs.forEach(req => req.flush({ data: { rules: [], equipment: [], spells: [] } }));

            // Check skills were added
            expect(entity['baseStats'].skills['Perception']).toBe(4);
            expect(entity['baseStats'].skills['Acrobatics']).toBe(2);
            // Original skill should still exist
            expect(entity['baseStats'].skills['Stealth']).toBe(6);

            // Check equipment was added
            expect(entity.equipment).toContain('eq-dagger');
            expect(entity.equipment).toContain('eq-shortsword'); // Original

            // Check spells were added
            expect(entity.spells!['0']).toContain('sp-light');
            expect(entity.spells!['0']).toContain('sp-daze'); // Original

            // Check spell slots were added
            expect(entity['spell_slots']['0']).toBe(3);

            // Check preview was cleared
            expect(component.aiCompletePreview()).toBeNull();
            expect(component.aiCompletingEntityId()).toBeNull();
        });

        it('should cancel AI complete and clear preview', () => {
            component.aiCompletePreview.set(MOCK_AI_PREVIEW);
            component.aiCompletingEntityId.set('ent-goblin-001');

            component.cancelAiComplete();

            expect(component.aiCompletePreview()).toBeNull();
            expect(component.aiCompletingEntityId()).toBeNull();
        });

        it('should return typed preview skills', () => {
            component.aiCompletePreview.set(MOCK_AI_PREVIEW);

            const skills = component.getPreviewSkills();

            expect(skills).toEqual([
                { name: 'Perception', value: 4 },
                { name: 'Acrobatics', value: 2 }
            ]);
        });

        it('should return empty array when no preview', () => {
            component.aiCompletePreview.set(null);

            expect(component.getPreviewSkills()).toEqual([]);
            expect(component.getPreviewSpellLevels()).toEqual([]);
            expect(component.getPreviewSpellSlots()).toEqual([]);
        });

        it('should return typed preview spell levels', () => {
            component.aiCompletePreview.set(MOCK_AI_PREVIEW);

            const spellLevels = component.getPreviewSpellLevels();

            expect(spellLevels).toEqual([
                { level: '0', spellIds: ['sp-light'] }
            ]);
        });

        it('should return typed preview spell slots', () => {
            component.aiCompletePreview.set(MOCK_AI_PREVIEW);

            const spellSlots = component.getPreviewSpellSlots();

            expect(spellSlots).toEqual([
                { level: '0', slots: 3 }
            ]);
        });
    });

    describe('Fix Stats Feature', () => {
        beforeEach(async () => {
            httpMock.expectOne('api/v1/entries?limit=10000').flush({ data: createMockCodexData() });
            httpMock.expectOne('api/v1/rules').flush({ data: [] });
            httpMock.expectOne('api/v1/equipment').flush({ data: [] });
            httpMock.expectOne('api/v1/spells').flush({ data: [] });
            await fixture.whenStable();
            fixture.detectChanges();
        });

        it('should apply fixes and update local model', async () => {
            // Setup an entity with old stats
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            entity.baseStats = {
                combat: { bab: 0, cmb: '-', cmd: '-' },
                saves: { fort: 0, ref: 0, will: 0 }
            };
            component.linkedEntities.set([entity]);

            // Setup the modal state
            const suggested = {
                bab: 5, cmb: 5, cmd: 15,
                fort: 2, ref: 2, will: 2,
                _raw: { saves: { fort: { total: 2 }, ref: { total: 2 }, will: { total: 2 } } }
            };
            component.fixStatsModal.set({
                isOpen: true,
                entity,
                current: { bab: 0, cmb: '-', cmd: '-', fort: 0, ref: 0, will: 0 },
                suggested,
                loading: false
            });

            // Call apply
            const applyPromise = component.applyFixStats();

            // Expect PUT request
            const req = httpMock.expectOne(`api/v1/entities/${entity._id}`);
            expect(req.request.method).toBe('PUT');
            // Verify payload contains new stats
            // The updates object uses dot-notation keys for MongoDB, so we access them as such
            expect(req.request.body['baseStats.combat'].bab).toBe('+5');
            expect(req.request.body['baseStats.saves'].fort).toBe(2);

            req.flush({}); // Success response

            await applyPromise;
            await fixture.whenStable();
            fixture.detectChanges();

            // The update to linkedEntities triggers the effect to fetch details again
            const detailsReq = httpMock.expectOne('api/v1/linked-details');
            detailsReq.flush({ data: { rules: [], equipment: [], spells: [] } });

            // Verify Local Model Update
            const updatedEntity = component.linkedEntities()[0];
            expect(updatedEntity['baseStats'].combat.bab).toBe('+5');
            expect(updatedEntity['baseStats'].saves.fort).toBe(2);

            // Modal should be closed
            expect(component.fixStatsModal().isOpen).toBe(false);
        });
    });

    describe('Reciprocal Page Linking', () => {
        beforeEach(async () => {
            httpMock.expectOne('api/v1/entries?limit=10000').flush({ data: createMockCodexData() });
            httpMock.expectOne('api/v1/rules').flush({ data: [] });
            httpMock.expectOne('api/v1/equipment').flush({ data: [] });
            httpMock.expectOne('api/v1/spells').flush({ data: [] });
            await fixture.whenStable();
            fixture.detectChanges();
        });

        it('should add reciprocal link', () => {
            const entry1 = (component as any).codexData()![0]; // Locations
            const entry2 = (component as any).codexData()![1]; // Town Square

            component.addRelatedPage(entry1, component.formatPath(entry2.path_components));

            expect(entry1.relatedPages).toContain(JSON.stringify(entry2.path_components));
            expect(entry2.relatedPages).toContain(JSON.stringify(entry1.path_components));
        });

        it('should remove reciprocal link', () => {
            const entry1 = (component as any).codexData()![0];
            const entry2 = (component as any).codexData()![1];

            // Setup
            component.addRelatedPage(entry1, component.formatPath(entry2.path_components));

            // Action
            // Re-fetch after add setup
            const dataAfterAdd = (component as any).codexData();
            const u1setup = dataAfterAdd[0];

            // Action
            component.removeRelatedPage(u1setup, component.formatPath(entry2.path_components));

            // Re-fetch after remove
            const finalData = (component as any).codexData();
            const finalEntry1 = finalData[0];
            const finalEntry2 = finalData[1];

            expect(finalEntry1.relatedPages).not.toContain(JSON.stringify(entry2.path_components));
            expect(finalEntry2.relatedPages).not.toContain(JSON.stringify(entry1.path_components));
        });

        it('should get available pages filtering self and existing links', () => {
            const entry1 = (component as any).codexData()![0];
            const entry2 = (component as any).codexData()![1];

            // Set current page to entry1
            component.navigateTo(entry1);
            fixture.detectChanges();

            let available = component.getAvailablePages();
            let availablePaths = available.map(e => component.formatPath(e.path_components));

            // Should contain entry2
            expect(availablePaths).toContain(component.formatPath(entry2.path_components));
            // Should not contain self (entry1)
            expect(availablePaths).not.toContain(component.formatPath(entry1.path_components));

            // Now link them
            // Re-fetch to be safe
            const freshEntry1 = (component as any).codexData()![0];
            component.addRelatedPage(freshEntry1, component.formatPath(entry2.path_components));
            fixture.detectChanges();

            available = component.getAvailablePages();
            availablePaths = available.map(e => component.formatPath(e.path_components));

            // Should NOT contain entry2 anymore
            expect(availablePaths).not.toContain(component.formatPath(entry2.path_components));
        });

        it('should add new page', async () => {
            // Mock initial state
            component.enterEditMode();
            component.startAddPage();
            expect(component.isAddingPage()).toBe(true);

            component.newPageName.set('New Test Page');

            component.createPage();

            const req = httpMock.expectOne('api/v1/entries');
            expect(req.request.method).toBe('POST');
            expect(req.request.body.name).toBe('New Test Page');
            req.flush({ data: { _id: 'new-page-id' } });

            await fixture.whenStable();

            expect(component.isAddingPage()).toBe(false);
        });
    });

    describe('Special Abilities', () => {
        beforeEach(async () => {
            httpMock.expectOne('api/v1/entries?limit=10000').flush({ data: createMockCodexData() });
            httpMock.expectOne('api/v1/rules').flush({ data: [] });
            httpMock.expectOne('api/v1/equipment').flush({ data: [] });
            httpMock.expectOne('api/v1/spells').flush({ data: [] });
            await fixture.whenStable();
            fixture.detectChanges();
        });

        it('should return empty array when entity has no special abilities', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            delete entity['special_abilities'];

            const abilities = component.getSpecialAbilities(entity);

            expect(abilities).toEqual([]);
        });

        it('should return special abilities from entity', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            entity['special_abilities'] = ['Darkvision 60 ft.', 'Scent'];

            const abilities = component.getSpecialAbilities(entity);

            expect(abilities).toEqual(['Darkvision 60 ft.', 'Scent']);
        });

        it('should add a new special ability', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            entity['special_abilities'] = [];
            component.linkedEntities.set([entity]);
            component.isEditMode.set(true);

            const mockInput = { value: 'Tremorsense 30 ft.' } as HTMLTextAreaElement;
            component.addSpecialAbility(entity, mockInput);

            expect(entity['special_abilities']).toContain('Tremorsense 30 ft.');
            expect(component.modifiedEntities().has(entity._id)).toBe(true);
            expect(mockInput.value).toBe('');
        });

        it('should create special_abilities array if not exists', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            delete entity['special_abilities'];
            component.linkedEntities.set([entity]);
            component.isEditMode.set(true);

            const mockInput = { value: 'Blindsense 20 ft.' } as HTMLTextAreaElement;
            component.addSpecialAbility(entity, mockInput);

            expect(entity['special_abilities']).toEqual(['Blindsense 20 ft.']);
        });

        it('should not add empty special ability', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            entity['special_abilities'] = [];
            component.linkedEntities.set([entity]);
            component.isEditMode.set(true);

            const mockInput = { value: '   ' } as HTMLTextAreaElement;
            component.addSpecialAbility(entity, mockInput);

            expect(entity['special_abilities'].length).toBe(0);
        });

        it('should remove special ability by index', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            entity['special_abilities'] = ['Darkvision 60 ft.', 'Scent', 'Tremorsense 30 ft.'];
            component.linkedEntities.set([entity]);
            component.isEditMode.set(true);

            component.removeSpecialAbility(entity, 1);

            expect(entity['special_abilities']).toEqual(['Darkvision 60 ft.', 'Tremorsense 30 ft.']);
            expect(component.modifiedEntities().has(entity._id)).toBe(true);
        });

        it('should update special ability text', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            entity['special_abilities'] = ['Old Ability Text'];
            component.linkedEntities.set([entity]);
            component.isEditMode.set(true);

            const mockEvent = { target: { innerText: 'New Ability Text' } };
            component.handleSpecialAbilityUpdate(entity, 0, mockEvent);

            expect(entity['special_abilities'][0]).toBe('New Ability Text');
            expect(component.modifiedEntities().has(entity._id)).toBe(true);
        });
    });

    describe('Vulnerabilities', () => {
        beforeEach(async () => {
            httpMock.expectOne('api/v1/entries?limit=10000').flush({ data: createMockCodexData() });
            httpMock.expectOne('api/v1/rules').flush({ data: [] });
            httpMock.expectOne('api/v1/equipment').flush({ data: [] });
            httpMock.expectOne('api/v1/spells').flush({ data: [] });
            await fixture.whenStable();
            fixture.detectChanges();
        });

        it('should return empty array when entity has no vulnerabilities', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            delete entity['vulnerabilities'];

            const vulns = component.getVulnerabilities(entity);

            expect(vulns).toEqual([]);
        });

        it('should return vulnerabilities from entity', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            entity['vulnerabilities'] = ['Cold', 'Fire'];

            const vulns = component.getVulnerabilities(entity);

            expect(vulns).toEqual(['Cold', 'Fire']);
        });

        it('should add a new vulnerability', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            entity['vulnerabilities'] = [];
            component.linkedEntities.set([entity]);
            component.isEditMode.set(true);

            const mockInput = { value: 'Electricity' } as HTMLInputElement;
            component.addVulnerability(entity, mockInput);

            expect(entity['vulnerabilities']).toContain('Electricity');
            expect(component.modifiedEntities().has(entity._id)).toBe(true);
            expect(mockInput.value).toBe('');
        });

        it('should create vulnerabilities array if not exists', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            delete entity['vulnerabilities'];
            component.linkedEntities.set([entity]);
            component.isEditMode.set(true);

            const mockInput = { value: 'Sonic' } as HTMLInputElement;
            component.addVulnerability(entity, mockInput);

            expect(entity['vulnerabilities']).toEqual(['Sonic']);
        });

        it('should remove vulnerability by index', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            entity['vulnerabilities'] = ['Cold', 'Fire', 'Acid'];
            component.linkedEntities.set([entity]);
            component.isEditMode.set(true);

            component.removeVulnerability(entity, 1);

            expect(entity['vulnerabilities']).toEqual(['Cold', 'Acid']);
            expect(component.modifiedEntities().has(entity._id)).toBe(true);
        });

        it('should update vulnerability text', () => {
            const entity = JSON.parse(JSON.stringify(MOCK_ENTITY));
            entity['vulnerabilities'] = ['Cold'];
            component.linkedEntities.set([entity]);
            component.isEditMode.set(true);

            const mockEvent = { target: { innerText: 'Cold (double damage)' } };
            component.handleVulnerabilityUpdate(entity, 0, mockEvent);

            expect(entity['vulnerabilities'][0]).toBe('Cold (double damage)');
            expect(component.modifiedEntities().has(entity._id)).toBe(true);
        });
    });
});