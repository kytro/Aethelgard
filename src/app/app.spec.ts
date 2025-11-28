import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';

describe('AppComponent', () => {
    let component: AppComponent;
    let fixture: ComponentFixture<AppComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        jest.useFakeTimers();
        // Mock Google global
        (window as any).google = {
            accounts: {
                id: {
                    initialize: jest.fn(),
                    renderButton: jest.fn(),
                    disableAutoSelect: jest.fn()
                }
            }
        };

        await TestBed.configureTestingModule({
            imports: [AppComponent, HttpClientTestingModule],
            providers: [
                provideRouter([]),
                provideZonelessChangeDetection()
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(AppComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);
        fixture.detectChanges();
    });

    afterEach(() => {
        httpMock.verify();
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it('should create the app', () => {
        expect(component).toBeTruthy();
    });

    it('should initialize Google Sign-In if not authenticated', () => {
        // Advance timers to trigger the setInterval callback in waitForGoogleLibrary
        jest.advanceTimersByTime(1000);

        expect((window as any).google.accounts.id.initialize).toHaveBeenCalled();
        expect((window as any).google.accounts.id.renderButton).toHaveBeenCalled();
    });

    it('should handle login success', async () => {
        const mockResponse = { credential: 'abc' };
        const mockServerResponse = { token: 't1', user: { name: 'Test', email: 't@t.com' } };

        const loginPromise = component.handleGoogleSignIn(mockResponse);

        const req = httpMock.expectOne('api/auth/google/callback');
        expect(req.request.method).toBe('POST');
        req.flush(mockServerResponse);

        await loginPromise;

        expect(component.isAuthenticated()).toBe(true);
        expect(component.user()?.name).toBe('Test');
        expect(localStorage.getItem('app_token')).toBe('t1');
    });

    it('should handle logout', () => {
        component.isAuthenticated.set(true);
        localStorage.setItem('app_token', 't1');

        component.handleLogout();

        expect(component.isAuthenticated()).toBe(false);
        expect(localStorage.getItem('app_token')).toBeNull();
        expect((window as any).google.accounts.id.disableAutoSelect).toHaveBeenCalled();
    });
});
