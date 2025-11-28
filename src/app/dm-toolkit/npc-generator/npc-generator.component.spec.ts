import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NpcGeneratorComponent } from './npc-generator.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
    createMockCodexForNpcGen,
    createMockGeneratedNpc,
    MOCK_NPC_EQUIPMENT_CACHE,
    MOCK_NPC_RULES_CACHE
} from './npc-generator.component.spec.helpers';

describe('NpcGeneratorComponent', () => {
    let component: NpcGeneratorComponent;
    let fixture: ComponentFixture<NpcGeneratorComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [NpcGeneratorComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(NpcGeneratorComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);

        // Setup Inputs
        fixture.componentRef.setInput('codex', createMockCodexForNpcGen());
        fixture.componentRef.setInput('rulesCache', MOCK_NPC_RULES_CACHE);
        fixture.componentRef.setInput('equipmentCache', MOCK_NPC_EQUIPMENT_CACHE);

        fixture.detectChanges();
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    describe('Generation', () => {
        it('should validate inputs before generating', () => {
            component.npcGenQuery = '';
            component.handleGenerateNpcs();
            httpMock.expectNone('/codex/api/dm-toolkit-ai/generate-npcs');
        });

        it('should prevent duplicates in "Generated Characters" path', () => {
            component.npcGenQuery = 'Test';
            component.npcGenContext = 'Context';
            component.npcGenGroupName = 'ExistingGroup'; // Exists in mock helper

            component.handleGenerateNpcs();

            expect(component.npcSaveSuccessMessage()).toContain('already exists');
            httpMock.expectNone('/codex/api/dm-toolkit-ai/generate-npcs');
        });

        it('should call generate API on valid input', async () => {
            component.npcGenQuery = '3 Bandits';
            component.npcGenContext = 'Woods';
            component.npcGenGroupName = 'People/Woods';

            component.handleGenerateNpcs();

            const req = httpMock.expectOne('/codex/api/dm-toolkit-ai/generate-npcs');
            expect(req.request.method).toBe('POST');
            expect(req.request.body.query).toBe('3 Bandits');

            const mockResponse = [createMockGeneratedNpc(), createMockGeneratedNpc({ name: 'Bandit 2' })];
            req.flush(mockResponse);

            await fixture.whenStable(); // Wait for signal update

            expect(component.lastGeneratedNpcs().length).toBe(2);
            expect(component.lastGeneratedGroupName()).toBe('People/Woods');
        });
    });

    describe('Saving', () => {
        beforeEach(async () => {
            // Pre-load some generated NPCs to simulate a "Post-Generation" state
            component.lastGeneratedNpcs.set([
                createMockGeneratedNpc({ name: 'Hero', equipment: ['Longsword'] })
            ]);
            component.lastGeneratedGroupName.set('People/NewGroup');
            await fixture.whenStable();
        });

        it('should create parent paths, map IDs, and save entities', async () => {
            component.handleSaveNpcsToCodex();

            // 1. Expect Entity Creation POST (one per NPC)
            const entityReq = httpMock.expectOne('/codex/api/admin/collections/entities_pf1e');
            expect(entityReq.request.method).toBe('POST');
            expect(entityReq.request.body.name).toBe('Hero');

            // Check mapping logic: 'Longsword' in equipment list should map to 'eq_longsword' from MOCK_NPC_EQUIPMENT_CACHE
            expect(entityReq.request.body.equipment).toContain('eq_longsword');

            entityReq.flush({ insertedId: 'new-entity-id-123' });

            await fixture.whenStable();

            // 2. Expect Codex Data PUT (bulk update containing new parents + npc entry)
            const codexReq = httpMock.expectOne('/codex/api/codex/data');
            expect(codexReq.request.method).toBe('PUT');

            const payload = codexReq.request.body;
            // Expected hierarchy creation:
            // 1. 'People' (doesn't exist in mock)
            // 2. 'People/NewGroup' (doesn't exist)
            // 3. 'People/NewGroup/Hero' (The NPC)

            const peopleEntry = payload.find((e: any) => e.name === 'People');
            const groupEntry = payload.find((e: any) => e.name === 'NewGroup');
            const heroEntry = payload.find((e: any) => e.name === 'Hero');

            expect(peopleEntry).toBeTruthy();
            expect(groupEntry).toBeTruthy();
            expect(heroEntry).toBeTruthy();
            expect(heroEntry.entityId).toBe('new-entity-id-123');

            codexReq.flush({});

            await fixture.whenStable();

            expect(component.npcSaveSuccessMessage()).toContain('1 NPCs saved');
            expect(component.lastGeneratedNpcs().length).toBe(0);
        });
    });
});