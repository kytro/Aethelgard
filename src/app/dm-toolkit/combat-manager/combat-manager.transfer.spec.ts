import { TestBed, ComponentFixture } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CombatManagerComponent } from './combat-manager.component';
import { createMockCodex, createMockFight } from './combat-manager.component.spec.helpers';

describe('CombatManagerComponent Data Transfer', () => {
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

        // Minimal setup
        fixture.componentRef.setInput('codex', createMockCodex());
        fixture.componentRef.setInput('fights', []);
        fixture.componentRef.setInput('rulesCache', new Map());
        fixture.componentRef.setInput('equipmentCache', new Map());
        fixture.componentRef.setInput('magicItemsCache', new Map());
        fixture.componentRef.setInput('spellsCache', new Map());
        fixture.componentRef.setInput('effectsCache', new Map());
        fixture.componentRef.setInput('foundCreatures', []);
        fixture.componentRef.setInput('entitiesCache', []);

        fixture.detectChanges();
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should correctly transfer classes array from entity to combatant payload', async () => {
        try {
            // 1. Setup Fight
            const mockFight = createMockFight();
            component.currentFight.set(mockFight);
            fixture.detectChanges();

            // Wait for signal effects to trigger loadCombatants
            await new Promise(resolve => setTimeout(resolve, 50));

            // Handle any GET requests triggered by currentFight effect
            const getReqs = httpMock.match(`/codex/api/dm-toolkit/fights/${mockFight._id}/combatants`);
            getReqs.forEach(req => req.flush([]));

            // 2. Setup Entity in Cache with Classes
            const mockEntityId = 'ent-001';
            const mockEntity = {
                id: mockEntityId,
                name: 'Chidan Nyal',
                baseStats: {
                    Str: 16,
                    classes: [{ className: 'Fighter', level: 4 }]
                },
                classes: [{ className: 'Fighter', level: 4 }],
                level: 4,
                cr: 3
            };
            fixture.componentRef.setInput('entitiesCache', [mockEntity]);
            fixture.componentRef.setInput('foundCreatures', [{ id: mockEntityId, name: 'Chidan Nyal', hp: '30' }]);
            fixture.detectChanges();

            // 3. Simulate Selection
            component.addFormSource.set('Found');
            component.selectedFoundCreatureId.set(mockEntityId);

            // 4. Trigger Add
            const event = new Event('submit');
            component.handleAddCombatant(event);

            // 5. Verify HTTP Post Body (Add Combatant)
            const postReq = httpMock.expectOne(`/codex/api/dm-toolkit/fights/${mockFight._id}/combatants`);
            expect(postReq.request.method).toBe('POST');
            const body = postReq.request.body;

            // ASSERTION: classes should be an array, NOT a number
            expect(Array.isArray(body.baseStats.classes)).toBe(true);
            expect(body.baseStats.classes.length).toBe(1);
            expect(body.baseStats.classes[0]).toEqual({ className: 'Fighter', level: 4 });

            postReq.flush({ ...body, _id: 'new-c-001' });

            // 6. Handle the PATCH request triggered by logAction
            // Wait for microtasks to resolve (logAction is called after lastValueFrom)
            await new Promise(resolve => setTimeout(resolve, 50));

            const patchReqs = httpMock.match(`/codex/api/dm-toolkit/fights/${mockFight._id}`);
            if (patchReqs.length > 0) {
                patchReqs.forEach(r => r.flush({}));
            }

            // logAction also updates currentFight signal, which triggers the effect to reload combatants
            const finalGetReqs = httpMock.match(`/codex/api/dm-toolkit/fights/${mockFight._id}/combatants`);
            if (finalGetReqs.length > 0) {
                finalGetReqs.forEach(r => r.flush([]));
            }

            console.log('TEST_SUCCESS: Classes transferred correctly');
        } catch (e: any) {
            console.error('TEST_FAILURE:', e.message || e);
            throw e;
        }
    });
});
