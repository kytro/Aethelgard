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

        it('should save size and combat stats (bab, cmb, cmd) to entity baseStats', async () => {
            // Set up NPC with combat stats
            component.lastGeneratedNpcs.set([
                createMockGeneratedNpc({
                    name: 'Warrior',
                    size: 'Large',
                    bab: 5,
                    cmb: 8,
                    cmd: 20
                })
            ]);
            component.lastGeneratedGroupName.set('People/TestCombat');
            await fixture.whenStable();

            component.handleSaveNpcsToCodex();

            const entityReq = httpMock.expectOne('/codex/api/admin/collections/entities_pf1e');
            expect(entityReq.request.method).toBe('POST');

            const body = entityReq.request.body;
            expect(body.baseStats.size).toBe('Large');
            expect(body.baseStats.combat).toBeDefined();
            expect(body.baseStats.combat.bab).toBe(5);
            expect(body.baseStats.combat.cmb).toBe(8);
            expect(body.baseStats.combat.cmd).toBe(20);

            entityReq.flush({ insertedId: 'combat-test-entity' });

            await fixture.whenStable();

            const codexReq = httpMock.expectOne('/codex/api/codex/data');
            codexReq.flush({});

            await fixture.whenStable();
            expect(component.npcSaveSuccessMessage()).toContain('1 NPCs saved');
        });

        it('should save dragon/monster stats including HP, AC, saves, DR, SR, resist, immune', async () => {
            // Set up a dragon with full monster stats
            component.lastGeneratedNpcs.set([
                createMockGeneratedNpc({
                    name: 'Young Red Dragon',
                    type: 'Dragon',
                    race: 'Dragon',
                    size: 'Large',
                    class: 'Dragon',
                    level: 10,
                    hp: '115 (11d12+44)',
                    ac: 22,
                    acTouch: 9,
                    acFlatFooted: 22,
                    bab: 11,
                    cmb: 19,
                    cmd: 28,
                    fortSave: 11,
                    refSave: 7,
                    willSave: 9,
                    dr: '5/magic',
                    sr: 21,
                    resist: 'fire 30',
                    immune: 'fire, sleep, paralysis'
                })
            ]);
            component.lastGeneratedGroupName.set('Creatures/Dragons');
            await fixture.whenStable();

            component.handleSaveNpcsToCodex();

            const entityReq = httpMock.expectOne('/codex/api/admin/collections/entities_pf1e');
            const body = entityReq.request.body;

            // Verify HP and AC
            expect(body.baseStats.HP).toBe('115 (11d12+44)');
            expect(body.baseStats.armorClass.total).toBe(22);
            expect(body.baseStats.armorClass.touch).toBe(9);
            expect(body.baseStats.armorClass.flatFooted).toBe(22);

            // Verify saves
            expect(body.baseStats.saves.fortitude).toBe(11);
            expect(body.baseStats.saves.reflex).toBe(7);
            expect(body.baseStats.saves.will).toBe(9);

            // Verify defenses
            expect(body.baseStats.DR).toBe('5/magic');
            expect(body.baseStats.SR).toBe(21);
            expect(body.baseStats.Resist).toBe('fire 30');
            expect(body.baseStats.Immune).toBe('fire, sleep, paralysis');

            entityReq.flush({ insertedId: 'dragon-entity' });
            await fixture.whenStable();

            const codexReq = httpMock.expectOne('/codex/api/codex/data');
            codexReq.flush({});
            await fixture.whenStable();

            expect(component.npcSaveSuccessMessage()).toContain('1 NPCs saved');
        });
    });
    describe('Detail Generation', () => {
        it('should pass extended context (description, backstory, etc.) to generate-npc-details API', async () => {
            component.lastGeneratedNpcs.set([
                createMockGeneratedNpc({
                    name: 'Cleric',
                    race: 'Human',
                    class: 'Cleric',
                    description: 'Has a mechanical arm',
                    backstory: 'Exiled from the city of brass',
                    gender: 'Female',
                    alignment: 'Lawful Neutral',
                    deity: 'Brigh'
                })
            ]);
            await fixture.whenStable();

            component.handleGenerateDetails(0);

            const req = httpMock.expectOne('/codex/api/dm-toolkit-ai/generate-npc-details');
            expect(req.request.method).toBe('POST');

            const body = req.request.body;
            expect(body.options.npc).toEqual(expect.objectContaining({
                name: 'Cleric',
                description: 'Has a mechanical arm',
                backstory: 'Exiled from the city of brass',
                gender: 'Female',
                alignment: 'Lawful Neutral',
                deity: 'Brigh'
            }));

            req.flush({ baseStats: { Str: 14 } });
        });
    });

    describe('Individual Save', () => {
        beforeEach(async () => {
            component.lastGeneratedNpcs.set([
                createMockGeneratedNpc({ name: 'Loner' })
            ]);
            component.lastGeneratedGroupName.set('People/Deep/Cave');
            await fixture.whenStable();
        });

        it('should create parent paths and save valid entity/entry when saving individual NPC', async () => {
            component.handleSaveNpc(0);

            const entityReq = httpMock.expectOne('/codex/api/admin/collections/entities_pf1e');
            expect(entityReq.request.method).toBe('POST');

            const entityBody = entityReq.request.body;
            // Validate Entity Payload
            expect(entityBody.name).toBe('Loner');
            expect(entityBody.baseStats.HP).toBe('10 (1d10)');

            entityReq.flush({ insertedId: 'loner-id' });
            await fixture.whenStable();

            const createReq = httpMock.expectOne('/codex/api/codex/create-entries');
            expect(createReq.request.method).toBe('POST');

            const entries = createReq.request.body;
            expect(entries.length).toBeGreaterThan(1);

            const deepEntry = entries.find((e: any) => e.name === 'Deep');
            const caveEntry = entries.find((e: any) => e.name === 'Cave');
            const npcEntry = entries.find((e: any) => e.name === 'Loner');

            expect(deepEntry).toBeTruthy();
            expect(caveEntry).toBeTruthy();
            expect(npcEntry).toBeTruthy();
            expect(npcEntry.entity_id).toBe('loner-id');
            // Validate Codex Entry Content
            expect(npcEntry.content).toEqual(expect.arrayContaining([
                { type: 'heading', text: 'Loner' },
                { type: 'paragraph', text: 'A test npc.' }
            ]));
        });
    });
    describe('Normalization', () => {
        it('should normalize HP object to string', () => {
            const input = { hp: { value: 45, type: 'hp' } };
            const result = component.normalizeNpcDetails(input);
            expect(result.hp).toBe('45');
        });

        it('should normalize AC object to number', () => {
            const input = { ac: { total: 18, touch: 12 } };
            const result = component.normalizeNpcDetails(input);
            expect(result.ac).toBe(18);
        });

        it('should normalize Special Abilities objects to strings', () => {
            const input = { specialAbilities: [{ name: 'Darkvision' }, 'Scent'] };
            const result = component.normalizeNpcDetails(input);
            expect(result.specialAbilities).toEqual(['Darkvision', 'Scent']);
        });

        it('should fix double plus in BAB', () => {
            const input = { bab: '++5' };
            const result = component.normalizeNpcDetails(input);
            expect(result.bab).toBe(5);
        });

        it('should fix double plus in CMB', () => {
            const input = { cmb: '++6' };
            const result = component.normalizeNpcDetails(input);
            expect(result.cmb).toBe(6);
        });
    });
});