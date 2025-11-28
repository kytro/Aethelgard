import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CodexAssistantComponent } from './codex-assistant.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';

describe('CodexAssistantComponent', () => {
    let component: CodexAssistantComponent;
    let fixture: ComponentFixture<CodexAssistantComponent>;
    let httpMock: HttpTestingController;

    const mockModels = {
        models: ['models/gemini-pro', 'models/gemini-flash'],
        defaultModel: 'models/gemini-flash'
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [CodexAssistantComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(CodexAssistantComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);

        // Setup input
        fixture.componentRef.setInput('codex', { 'Lore': 'Some lore' });

        // Trigger ngOnInit which calls loadModels()
        fixture.detectChanges();

        // Handle the initialization request here so it doesn't leak into individual tests
        const req = httpMock.expectOne('/codex/api/ai-assistant/models');
        req.flush(mockModels);
        await fixture.whenStable();
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should load models on init', () => {
        // Request handled in beforeEach, just check state
        expect(component.availableModels()).toEqual(mockModels.models);
        expect(component.selectedModel()).toBe('models/gemini-flash');
    });

    it('should format model names correctly', () => {
        expect(component.formatModelName('models/gemini-1.5-flash')).toBe('Gemini 1.5 Flash');
    });

    it('should ask assistant and display response', async () => {
        component.assistantQuery = 'Who is the king?';
        component.handleAskAssistant();

        expect(component.isAskingAssistant()).toBe(true);

        const req = httpMock.expectOne('/codex/api/dm-toolkit-ai/assistant');
        expect(req.request.method).toBe('POST');
        expect(req.request.body.query).toBe('Who is the king?');
        expect(req.request.body.model).toBe('models/gemini-flash');

        req.flush({ response: 'The king is Aragorn.' });

        await fixture.whenStable();

        expect(component.isAskingAssistant()).toBe(false);
        expect(component.assistantResponse()).toBe('The king is Aragorn.');
    });

    it('should handle API errors', async () => {
        component.assistantQuery = 'Crash test';
        component.handleAskAssistant();

        const req = httpMock.expectOne('/codex/api/dm-toolkit-ai/assistant');
        req.flush({ error: 'API Error' }, { status: 500, statusText: 'Server Error' });

        await fixture.whenStable();

        expect(component.assistantResponse()).toContain('Error: API Error');
        expect(component.isAskingAssistant()).toBe(false);
    });
});