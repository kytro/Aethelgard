import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AiAssistantComponent } from './ai-assistant.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';

describe('AiAssistantComponent', () => {
    let component: AiAssistantComponent;
    let fixture: ComponentFixture<AiAssistantComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [AiAssistantComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(AiAssistantComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);

        // ngOnInit triggers loadModels
        fixture.detectChanges();
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should load models on init', async () => {
        const req = httpMock.expectOne('/codex/api/ai-assistant/models');
        expect(req.request.method).toBe('GET');
        req.flush({ models: ['m1', 'm2'], defaultModel: 'm1' });

        await fixture.whenStable();

        expect(component.models()).toEqual(['m1', 'm2']);
        expect(component.selectedModel()).toBe('m1');
    });

    it('should generate update', async () => {
        // Satisfy init request
        httpMock.expectOne('/codex/api/ai-assistant/models').flush({});
        await fixture.whenStable();

        component.query.set('Do something');
        component.selectedModel.set('m1');

        component.generateUpdate();

        const req = httpMock.expectOne('/codex/api/ai-assistant/generate-update');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ query: 'Do something', model: 'm1' });

        const mockPlan = { description: 'Plan A' };
        req.flush(mockPlan);

        await fixture.whenStable();

        expect(component.proposedUpdate()).toEqual([mockPlan]);
    });

    it('should confirm update', async () => {
        // Satisfy init request
        httpMock.expectOne('/codex/api/ai-assistant/models').flush({});
        await fixture.whenStable();

        const mockPlan = [{ description: 'Plan A' }];
        component.proposedUpdate.set(mockPlan);

        component.confirmUpdate();

        const req = httpMock.expectOne('/codex/api/ai-assistant/execute-operation');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(mockPlan);

        req.flush({ message: 'Success' });

        await fixture.whenStable();

        expect(component.updateResult()?.message).toBe('Success');
        expect(component.proposedUpdate()).toBeNull();
    });
});
