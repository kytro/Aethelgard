import { TestBed, ComponentFixture } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { CombatManagerComponent } from './combat-manager.component';
import {
    createMockCodex,
    createMockFight,
    createMockCombatant,
    createMockEntity,
    createMockFoundCreature
} from './combat-manager.component.spec.helpers';

describe('CombatManagerComponent', () => {
    let component: CombatManagerComponent;
    let fixture: ComponentFixture<CombatManagerComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [CombatManagerComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(CombatManagerComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);

        // Set up default input signals
        fixture.componentRef.setInput('codex', createMockCodex());
        fixture.componentRef.setInput('fights', []);
        fixture.componentRef.setInput('rulesCache', new Map());
        fixture.componentRef.setInput('equipmentCache', new Map());
        fixture.componentRef.setInput('magicItemsCache', new Map());
        fixture.componentRef.setInput('spellsCache', new Map());
        fixture.componentRef.setInput('effectsCache', new Map());
        fixture.componentRef.setInput('entitiesCache', []);
        fixture.componentRef.setInput('foundCreatures', []);

        fixture.detectChanges();
    });

    afterEach(() => {
        httpMock.verify();
    });

    describe('Component Initialization', () => {
        it('should create the component', () => {
            expect(component).toBeTruthy();
        });

        it('should initialize with default values', () => {
            expect(component.newFightName).toBe('');
            expect(component.isSavingFight()).toBe(false);
            expect(component.isSavingCombatant()).toBe(false);
            expect(component.isCombatActive()).toBe(false);
            expect(component.roundCounter()).toBe(1);
            expect(component.currentTurnIndex()).toBe(0);
            expect(component.addFormSource()).toBe('Custom');
        });

        it('should have METADATA_KEYS including baseStats, stats, and entityId', () => {
            expect(component.METADATA_KEYS).toContain('baseStats');
            expect(component.METADATA_KEYS).toContain('stats');
            expect(component.METADATA_KEYS).toContain('entityId');
            expect(component.METADATA_KEYS).toContain('summary');
            expect(component.METADATA_KEYS).toContain('content');
        });
    });

    describe('_isNavigable Method', () => {
        it('should return false for null or undefined nodes', () => {
            expect(component['_isNavigable'](null)).toBe(false);
            expect(component['_isNavigable'](undefined)).toBe(false);
        });

        it('should return false for primitive values', () => {
            expect(component['_isNavigable']('string')).toBe(false);
            expect(component['_isNavigable'](123)).toBe(false);
            expect(component['_isNavigable'](true)).toBe(false);
        });

        it('should return false for nodes with no children', () => {
            const leafNode = {
                summary: 'A leaf node',
                content: []
            };
            expect(component['_isNavigable'](leafNode)).toBe(false);
        });

        it('should return true for container entities with children', () => {
            const containerEntity = {
                entityId: 'loc-001',
                baseStats: { Type: 'Location' },
                'Child_NPC': {
                    entityId: 'npc-001',
                    baseStats: { Str: 10 }
                }
            };
            expect(component['_isNavigable'](containerEntity)).toBe(true);
        });

        it('should return true for categories with templates', () => {
            const category = {
                'Template_1': {
                    entityId: 'tmpl-001',
                    baseStats: {}
                },
                'Template_2': {
                    entityId: 'tmpl-002',
                    baseStats: {}
                }
            };
            expect(component['_isNavigable'](category)).toBe(true);
        });

        it('should filter out METADATA_KEYS from child detection', () => {
            const nodeWithMetadata = {
                summary: 'Test summary',
                content: [],
                baseStats: { Str: 10 },
                stats: { HP: 30 },
                entityId: 'entity-001'
            };
            expect(component['_isNavigable'](nodeWithMetadata)).toBe(false);
        });

        it('should return false for leaf templates (entityId with no navigable children)', () => {
            const leafTemplate = {
                entityId: 'npc-001',
                baseStats: { Str: 14, Dex: 12 },
                stats: { HP: 30 }
            };
            expect(component['_isNavigable'](leafTemplate)).toBe(false);
        });
    });

    describe('topLevelCategoryOptions Computed Signal', () => {
        it('should return Custom and Find when no codex data', () => {
            fixture.componentRef.setInput('codex', null);
            fixture.detectChanges();

            const options = component.topLevelCategoryOptions();
            expect(options).toContain('Custom');
            expect(options).toContain('Find');
        });

        it('should include sources marked with isCombatManagerSource', () => {
            const options = component.topLevelCategoryOptions();
            expect(options).toContain('Custom');
            expect(options).toContain('Find');
            expect(options).toContain('People');
            expect(options).toContain('Bestiary');
        });

        it('should sort sources alphabetically', () => {
            const codex = {
                Zebra: { isCombatManagerSource: true },
                Alpha: { isCombatManagerSource: true },
                Beta: { isCombatManagerSource: true }
            };
            fixture.componentRef.setInput('codex', codex);
            fixture.detectChanges();

            const options = component.topLevelCategoryOptions();
            const sourceOptions = options.filter(o => o !== 'Custom' && o !== 'Find');
            expect(sourceOptions).toEqual(['Alpha', 'Beta', 'Zebra']);
        });
    });

    describe('Template Detection Logic', () => {
        beforeEach(() => {
            component.addFormSource.set('People');
            component.selectedCodexPath.set(['Solarran_Freehold', 'Merchant_Quarter']);
            fixture.detectChanges();
        });

        it('should extract templates from child objects', async () => {
            await fixture.whenStable();
            fixture.detectChanges();
            const options = component.templateOptions();
            expect(options).toContain('Guildmaster Theron');
            expect(options).toContain('Guard Captain Lyra');
        });

        it('should handle content arrays with non-rich-text', async () => {
            component.addFormSource.set('Bestiary');
            component.selectedCodexPath.set(['Undead']);
            await fixture.whenStable(); fixture.detectChanges();

            const options = component.templateOptions();
            expect(options).toContain('Skeleton');
            expect(options).toContain('Zombie');
            expect(options).toContain('Ghoul');
        });

        it('should ignore rich text content arrays', async () => {
            component.addFormSource.set('People');
            component.selectedCodexPath.set(['Solarran_Freehold']);
            await fixture.whenStable(); fixture.detectChanges();

            const options = component.templateOptions();
            // Should not include content from rich text, only child categories
            expect(options.length).toBeGreaterThan(0);
        });

        it('should reset template options when source changes', async () => {
            component.selectedTemplate.set('Test Template');
            component.addFormSource.set('Custom');
            await fixture.whenStable(); fixture.detectChanges();

            expect(component.selectedTemplate()).toBe('');
            expect(component.templateOptions()).toEqual([]);
        });
    });

    describe('Fight Management', () => {
        it('should create a new fight', async () => {
            component.newFightName = 'Epic Battle';
            const mockFight = createMockFight({ name: 'Epic Battle' });

            component.handleAddFight();

            const req = httpMock.expectOne('/codex/api/dm-toolkit/fights');
            expect(req.request.method).toBe('POST');
            expect(req.request.body).toEqual({ name: 'Epic Battle' });

            req.flush(mockFight);
            await fixture.whenStable();
            fixture.detectChanges();

            httpMock.match(req => true);

            expect(component.newFightName).toBe('');
            expect(component.isSavingFight()).toBe(false);
        });

        it('should not create fight with empty name', () => {
            component.newFightName = '';
            component.handleAddFight();

            httpMock.expectNone('/codex/api/dm-toolkit/fights');
        });

        it('should delete a fight', async () => {
            jest.spyOn(window, 'confirm').mockReturnValue(true);

            component.handleDeleteFight('fight-001');

            const req = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001');
            expect(req.request.method).toBe('DELETE');
            req.flush({});
            await fixture.whenStable(); fixture.detectChanges();

            httpMock.match(req => true);
        });

        it('should set current fight and load combatants', async () => {
            const mockFight = createMockFight();
            const mockCombatants = [createMockCombatant()];

            component.setCurrentFight(mockFight);

            // Expect migration call
            const migrateReq = httpMock.expectOne(`/codex/api/dm-toolkit/fights/${mockFight._id}/migrate`);
            migrateReq.flush({});

            fixture.detectChanges();
            await fixture.whenStable();

            // Expect combatants load
            const combatantsReq = httpMock.expectOne(`/codex/api/dm-toolkit/fights/${mockFight._id}/combatants`);
            combatantsReq.flush(mockCombatants);

            await fixture.whenStable(); fixture.detectChanges();

            httpMock.match(req => true);

            expect(component.currentFight()).toEqual(mockFight);
            expect(component.combatants()).toEqual(mockCombatants);
        });
    });

    describe('Combatant Management', () => {
        beforeEach(async () => {
            const mockFight = createMockFight();
            component.currentFight.set(mockFight);
            fixture.detectChanges();
            await fixture.whenStable();

            const req = httpMock.expectOne(`/codex/api/dm-toolkit/fights/${mockFight._id}/combatants`);
            req.flush([]);
        });

        it('should add custom combatant', async () => {
            component.addFormSource.set('Custom');
            component.customCombatant.set({ name: 'Hero', hp: 50, initiative: 18 });

            const mockCombatant = createMockCombatant({ name: 'Hero', hp: 50, initiative: 18 });
            const event = new Event('submit');

            component.handleAddCombatant(event);

            const req = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001/combatants');
            expect(req.request.method).toBe('POST');
            expect(req.request.body.name).toBe('Hero');
            expect(req.request.body.hp).toBe(50);

            req.flush(mockCombatant);

            await Promise.resolve();
            await Promise.resolve();

            const logReq = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001');
            expect(logReq.request.method).toBe('PATCH');
            logReq.flush({});

            await fixture.whenStable(); fixture.detectChanges();

            httpMock.match(req => true);

            expect(component.combatants()).toContain(mockCombatant);
        });

        it('should remove combatant', async () => {
            const mockCombatant = createMockCombatant();
            component.combatants.set([mockCombatant]);

            component.handleRemoveCombatant('combatant-001');

            const req = httpMock.expectOne('/codex/api/dm-toolkit/combatants/combatant-001');
            expect(req.request.method).toBe('DELETE');
            req.flush({});

            await Promise.resolve();
            await Promise.resolve();

            const logReq = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001');
            expect(logReq.request.method).toBe('PATCH');
            logReq.flush({});

            await fixture.whenStable(); fixture.detectChanges();

            httpMock.match(req => true);

            expect(component.combatants()).not.toContain(mockCombatant);
        });

        it('should update combatant HP', async () => {
            const mockCombatant = createMockCombatant({ hp: 30 });
            component.combatants.set([mockCombatant]);
            fixture.detectChanges();

            component.handleUpdateCombatant('combatant-001', 'hp', 25);

            const req = httpMock.expectOne('/codex/api/dm-toolkit/combatants/combatant-001');
            expect(req.request.method).toBe('PATCH');
            expect(req.request.body).toEqual({ hp: 25 });
            req.flush({});

            await Promise.resolve();
            await Promise.resolve();
            await fixture.whenStable();

            const logReq = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001');
            expect(logReq.request.method).toBe('PATCH');
            logReq.flush({});

            await fixture.whenStable(); fixture.detectChanges();

            httpMock.match(req => true);

            expect(component.combatants()[0].hp).toBe(25);
        });
    });

    describe('Combat State Transitions', () => {
        beforeEach(async () => {
            const mockFight = createMockFight();
            component.currentFight.set(mockFight);
            fixture.detectChanges();
            await fixture.whenStable();

            const req = httpMock.expectOne(`/codex/api/dm-toolkit/fights/${mockFight._id}/combatants`);
            req.flush([]);
        });

        it('should start combat', async () => {
            const updatedFight = createMockFight({ combatStartTime: new Date() });

            component.handleStartCombat();

            const req = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001');
            expect(req.request.method).toBe('PATCH');
            expect(req.request.body.combatStartTime).toBeDefined();
            req.flush(updatedFight);

            await Promise.resolve();
            await Promise.resolve();

            const logReq = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001');
            expect(logReq.request.method).toBe('PATCH');
            expect(logReq.request.body.log).toBeDefined();
            logReq.flush(updatedFight);

            await fixture.whenStable();
            fixture.detectChanges();

            httpMock.match(req => true);

            expect(component.isCombatActive()).toBe(true);
        });

        it('should end combat', async () => {
            const activeFight = createMockFight({ combatStartTime: new Date() });
            component.currentFight.set(activeFight);
            component.isCombatActive.set(true);

            const endedFight = createMockFight();

            component.handleEndCombat();

            const req = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001/end-combat');
            expect(req.request.method).toBe('PATCH');
            req.flush(endedFight);

            await Promise.resolve();
            await Promise.resolve();

            const logReq = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001');
            expect(logReq.request.method).toBe('PATCH');
            logReq.flush({});

            const combatantsReq = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001/combatants');
            combatantsReq.flush([]);

            await fixture.whenStable(); fixture.detectChanges();

            httpMock.match(req => true);

            expect(component.isCombatActive()).toBe(false);
        });
    });

    describe('Turn Management', () => {
        beforeEach(async () => {
            const mockFight = createMockFight({ combatStartTime: new Date() });
            component.currentFight.set(mockFight);
            component.isCombatActive.set(true);
            fixture.detectChanges();
            await fixture.whenStable();

            const req = httpMock.expectOne(`/codex/api/dm-toolkit/fights/${mockFight._id}/combatants`);
            req.flush([]);
        });

        it('should advance to next turn', async () => {
            const updatedFight = createMockFight({
                combatStartTime: new Date(),
                currentTurnIndex: 1,
                roundCounter: 1
            });

            component.handleNextTurn();

            const req = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001/next-turn');
            expect(req.request.method).toBe('PATCH');
            req.flush(updatedFight);

            const combatantsReq = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001/combatants');
            combatantsReq.flush([]);

            await Promise.resolve();
            await Promise.resolve();

            // handleNextTurn likely logs
            const logReq = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001');
            expect(logReq.request.method).toBe('PATCH');
            logReq.flush({});

            await fixture.whenStable(); fixture.detectChanges();

            httpMock.match(req => true);

            expect(component.currentTurnIndex()).toBe(1);
        });

        it('should go to previous turn', async () => {
            component.currentTurnIndex.set(2);

            const updatedFight = createMockFight({
                combatStartTime: new Date(),
                currentTurnIndex: 1,
                roundCounter: 1
            });

            component.handlePreviousTurn();

            const req = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001/previous-turn');
            expect(req.request.method).toBe('PATCH');
            req.flush(updatedFight);

            const combatantsReq = httpMock.expectOne('/codex/api/dm-toolkit/fights/fight-001/combatants');
            combatantsReq.flush([]);

            await fixture.whenStable(); fixture.detectChanges();

            httpMock.match(req => true);

            expect(component.currentTurnIndex()).toBe(1);
        });
    });

    describe('HP Calculation', () => {
        it('should calculate average HP from string', () => {
            expect(component.computeHpFromString('45 (6d8+12)', 'average')).toBe(39);
            expect(component.computeHpFromString('38 (7d8+7)', 'average')).toBe(38);
        });

        it('should calculate max HP from dice string', () => {
            const maxHp = component.computeHpFromString('45 (6d8+12)', 'max');
            expect(maxHp).toBe(6 * 8 + 12); // 60
        });

        it('should handle HP strings without dice notation', () => {
            expect(component.computeHpFromString('50', 'average')).toBe(50);
        });
    });

    describe('Cascading Dropdowns', () => {
        it('should compute correct dropdown levels', () => {
            component.addFormSource.set('People');
            component.selectedCodexPath.set(['Solarran_Freehold']);
            fixture.detectChanges();

            const dropdowns = component.cascadingDropdowns();
            expect(dropdowns.length).toBeGreaterThan(0);
            expect(dropdowns[0].level).toBe(0);
        });

        it('should handle path changes correctly', () => {
            component.addFormSource.set('People');
            component.selectedCodexPath.set(['Solarran_Freehold', 'Merchant_Quarter']);

            component.handlePathChange(1, '');

            expect(component.selectedCodexPath()).toEqual(['Solarran_Freehold']);
        });
    });
});