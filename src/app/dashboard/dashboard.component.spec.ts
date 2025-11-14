import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DashboardComponent } from './dashboard.component';

interface DashboardStats {
  entityCount: number;
  ruleCount: number;
  itemCount: number;
  spellCount: number;
  deityCount: number;
}

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let httpTestingController: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DashboardComponent,
        HttpClientTestingModule
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should create', () => {
    fixture.detectChanges();

    httpTestingController
      .expectOne('api/admin/dashboard-stats')
      .flush(null);

    expect(component).toBeTruthy();
  });

  it('should load stats successfully on init', fakeAsync(() => {
    const mockStats: DashboardStats = {
      entityCount: 10,
      ruleCount: 20,
      itemCount: 30,
      spellCount: 40,
      deityCount: 5,
    };

    fixture.detectChanges();
    expect(component.isLoading()).toBe(true);

    const req = httpTestingController.expectOne('api/admin/dashboard-stats');
    expect(req.request.method).toBe('GET');
    req.flush(mockStats);

    tick();
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBe(null);
    expect(component.stats()).toEqual(mockStats);
  }));

  it('should set error signal if API fails', fakeAsync(() => {
    fixture.detectChanges();
    expect(component.isLoading()).toBe(true);

    const req = httpTestingController.expectOne('api/admin/dashboard-stats');
    expect(req.request.method).toBe('GET');
    req.flush(
      { error: 'Failed to load' },
      { status: 500, statusText: 'Server Error' }
    );

    tick();
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.stats()).toBe(null);
    expect(component.error()).toContain('Failed to load');
  }));
});
