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
        expect(req.request.body).toEqual({ context: 'Context' });

        req.flush({ suggestions: ['Ambush!', 'Treasure!'] });
        await fixture.whenStable();

        expect(component.isLoading()).toBe(false);
        expect(component.suggestions()).toEqual(['Ambush!', 'Treasure!']);
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
});