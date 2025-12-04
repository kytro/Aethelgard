import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StoryPlannerComponent } from './story-planner.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';

describe('StoryPlannerComponent', () => {
    let component: StoryPlannerComponent;
    let fixture: ComponentFixture<StoryPlannerComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [StoryPlannerComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(StoryPlannerComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);

        // Mock inputs
        fixture.componentRef.setInput('codex', {});
        fixture.componentRef.setInput('sessions', []);

        fixture.detectChanges();
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should update context on input', () => {
        const input = { target: { value: 'The party enters a cave.' } } as any;
        component.onStoryContextChange(input);
        expect(component.storyContext()).toBe('The party enters a cave.');
    });

    it('should fetch suggestions successfully', async () => {
        component.storyContext.set('Context');
        component.getSuggestions();

        expect(component.isLoading()).toBe(true);
        expect(component.error()).toBeNull();

        const req = httpMock.expectOne('/codex/api/dm-toolkit/story-planner/suggest');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
            context: 'Context',
            sessionContext: '',
            codexContext: '',
            codexStructure: []
        });

        const mockSuggestions: any[] = [
            { type: 'Hook', name: 'Ambush!', description: 'Goblins attack.', path: 'Hooks', data: {} },
            { type: 'Quest', name: 'Treasure!', description: 'Find the gold.', path: 'Quests', data: {} }
        ];

        req.flush({ suggestions: mockSuggestions });
        await fixture.whenStable();

        expect(component.isLoading()).toBe(false);
        expect(component.suggestions()).toEqual(mockSuggestions);
    });

    it('should handle API errors', async () => {
        component.storyContext.set('Context');
        component.getSuggestions();

        const req = httpMock.expectOne('/codex/api/dm-toolkit/story-planner/suggest');
        req.flush({ error: 'AI unavailable' }, { status: 500, statusText: 'Server Error' });
        await fixture.whenStable();

        expect(component.isLoading()).toBe(false);
        expect(component.error()).toContain('AI unavailable');
        expect(component.suggestions().length).toBe(0);
    });

    it('should include session context in suggestions request', async () => {
        const sessions = [
            { number: 1, summary: 'Met a goblin.' },
            { number: 2, summary: 'Found a map.' }
        ];
        fixture.componentRef.setInput('sessions', sessions);
        fixture.detectChanges();

        component.storyContext.set('Context');
        component.getSuggestions();

        const req = httpMock.expectOne('/codex/api/dm-toolkit/story-planner/suggest');
        expect(req.request.body.sessionContext).toContain('Session 1: Met a goblin.');
        expect(req.request.body.sessionContext).toContain('Session 2: Found a map.');

        req.flush({ suggestions: [] });
    });

    it('should save NPC suggestion via generator', async () => {
        const suggestion: any = { type: 'NPC', name: 'Bob', description: 'A builder', path: 'NPCs', data: { role: 'Builder', context: 'Context' } };

        jest.spyOn(window, 'alert').mockImplementation(() => { });

        const promise = component.saveSuggestion(suggestion);

        // Expect call to generate-npcs
        const genReq = httpMock.expectOne('/codex/api/dm-toolkit-ai/generate-npcs');
        expect(genReq.request.method).toBe('POST');
        expect(genReq.request.body.query).toContain('A builder');

        // Mock generator response
        genReq.flush([{ name: 'Bob Generated', baseStats: { Str: 10 } }]);

        await new Promise(resolve => setTimeout(resolve, 0));

        // Expect call to create entry
        const req = httpMock.expectOne('/codex/api/codex/entry');
        expect(req.request.method).toBe('POST');
        expect(req.request.body.path).toBe('NPCs/bob');
        expect(req.request.body.content.type).toBe('NPC');
        // Should have merged data
        expect(req.request.body.content.baseStats.Str).toBe(10);

        req.flush({});
        await promise;

        expect(window.alert).toHaveBeenCalledWith('Saved Bob to Codex!');
    });

    it('should save Quest suggestion', async () => {
        const suggestion: any = { type: 'Quest', name: 'Find Gold', description: 'Go to cave', path: 'Quests', data: { reward: '100gp' } };

        jest.spyOn(window, 'alert').mockImplementation(() => { });

        const promise = component.saveSuggestion(suggestion);

        const req = httpMock.expectOne('/codex/api/codex/entry');
        expect(req.request.method).toBe('POST');
        expect(req.request.body.path).toBe('Quests/find_gold');
        expect(req.request.body.content.type).toBe('Quest');
        expect(req.request.body.content.reward).toBe('100gp');

        req.flush({});
        await promise;

        expect(window.alert).toHaveBeenCalledWith('Saved Find Gold to Codex!');
    });

    it('should preview NPC stats', async () => {
        const suggestion: any = { type: 'NPC', name: 'Bob', description: 'A builder', path: 'NPCs', data: { context: 'Context' } };

        const promise = component.previewStats(suggestion);

        const req = httpMock.expectOne('/codex/api/dm-toolkit-ai/generate-npcs');
        expect(req.request.method).toBe('POST');
        req.flush([{ name: 'Bob', baseStats: { Str: 10 } }]);

        await new Promise(resolve => setTimeout(resolve, 0));
        await promise;

        expect(suggestion.previewStats).toBeDefined();
        expect(suggestion.previewStats.baseStats.Str).toBe(10);
    });
});