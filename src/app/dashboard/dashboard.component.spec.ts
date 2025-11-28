import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';

describe('DashboardComponent', () => {
    let component: DashboardComponent;
    let fixture: ComponentFixture<DashboardComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [DashboardComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(DashboardComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should load stats on init', async () => {
        fixture.detectChanges(); // triggers ngOnInit

        const req = httpMock.expectOne('api/admin/dashboard-stats');
        expect(req.request.method).toBe('GET');
        req.flush({
            entityCount: 10,
            ruleCount: 5,
            itemCount: 3,
            spellCount: 2,
            deityCount: 1
        });

        await fixture.whenStable();

        expect(component.stats()).toEqual({
            entityCount: 10,
            ruleCount: 5,
            itemCount: 3,
            spellCount: 2,
            deityCount: 1
        });
        expect(component.isLoading()).toBe(false);
    });

    it('should handle errors', async () => {
        fixture.detectChanges();

        const req = httpMock.expectOne('api/admin/dashboard-stats');
        req.flush({ error: 'Fail' }, { status: 500, statusText: 'Server Error' });

        await fixture.whenStable();

        expect(component.error()).toBe('Fail');
        expect(component.isLoading()).toBe(false);
    });
});