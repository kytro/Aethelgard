import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SessionLoggerComponent } from './session-logger.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';

describe('SessionLoggerComponent', () => {
    let component: SessionLoggerComponent;
    let fixture: ComponentFixture<SessionLoggerComponent>;
    let httpMock: HttpTestingController;

    const mockSessions = [
        { _id: 's1', title: 'Session 1', notes: 'Notes 1', createdAt: new Date() },
        { _id: 's2', title: 'Session 2', notes: 'Notes 2', createdAt: new Date() }
    ];

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SessionLoggerComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(SessionLoggerComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);

        // Set initial input
        fixture.componentRef.setInput('sessions', mockSessions);
        fixture.componentRef.setInput('currentSessionId', 's1'); // Also set ID as I added the input
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    });

    afterEach(() => {
        httpMock.verify();
        jest.useRealTimers(); // Ensure timers are reset after every test
    });

    it('should create and list sessions', () => {
        try {
            expect(component).toBeTruthy();
            const sessionButtons = fixture.nativeElement.querySelectorAll('button.text-left');
            expect(sessionButtons.length).toBe(2);
            expect(sessionButtons[0].textContent).toContain('Session 1');
        } catch (e) {
            console.error('ASSERTION FAILED:', e);
            throw e;
        }
    });

    it('should create a new session', async () => {
        const emitSpy = jest.spyOn(component.sessionAdded, 'emit');

        component.handleAddSession();

        const req = httpMock.expectOne('/codex/api/dm-toolkit/sessions');
        expect(req.request.method).toBe('POST');

        const newSession = { _id: 's3', createdAt: new Date() };
        req.flush(newSession);

        await fixture.whenStable();

        expect(emitSpy).toHaveBeenCalled();
        expect(component.currentSession()?._id).toBe('s3');
    });

    it('should delete a session', async () => {
        const confirmSpy = jest.spyOn(component.modalService, 'confirm').mockResolvedValue(true);
        const emitSpy = jest.spyOn(component.sessionDeleted, 'emit');

        component.setCurrentSession(mockSessions[0]);
        fixture.detectChanges();

        component.handleDeleteSession('s1');

        // Wait for modal confirm promise to resolve
        await new Promise(resolve => setTimeout(resolve, 0));
        await fixture.whenStable();

        const req = httpMock.expectOne('/codex/api/dm-toolkit/sessions/s1');
        expect(req.request.method).toBe('DELETE');
        req.flush({});

        await fixture.whenStable();

        expect(emitSpy).toHaveBeenCalledWith('s1');
        expect(component.currentSession()).toBeNull();
    });

    it('should auto-save notes after delay', async () => {
        jest.useFakeTimers(); // Enable fake timers for this test

        component.setCurrentSession(mockSessions[0]);
        fixture.detectChanges();

        // Simulate typing
        component.onNotesChange('Updated Notes');

        expect(component.saveStatus()).toBe('Unsaved');

        // Fast-forward time to trigger the debounce
        jest.advanceTimersByTime(5000);

        // The HTTP request should now be pending
        const req = httpMock.expectOne(`/codex/api/dm-toolkit/sessions/s1`);
        expect(req.request.method).toBe('PATCH');
        expect(req.request.body).toEqual({ notes: 'Updated Notes' });

        // Resolve the request
        req.flush({ ...mockSessions[0], notes: 'Updated Notes' });

        // Flush microtasks (Promises) to let the component process the response
        await Promise.resolve();
        await Promise.resolve(); // Sometimes needed for nested promises/effects

        expect(component.saveStatus()).toBe('Saved');
    });
});