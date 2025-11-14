import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DashboardComponent } from './dashboard.component';

// Define the interface based on the component's usage
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
        DashboardComponent, // Import the standalone component
        HttpClientTestingModule // Import the testing module for HttpClient
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Verify that no unhandled HTTP requests are left
    httpTestingController.verify();
  });

  it('should create', () => {
    // Trigger component initialization (which calls loadStats())
    fixture.detectChanges(); 
    // Expect the API call even in the create test
    httpTestingController.expectOne('api/admin/dashboard-stats').flush(null); 
    expect(component).toBeTruthy();
  });

  it('should load stats successfully on init', () => {
    // Define the mock data we expect from the API
    const mockStats: DashboardStats = {
      entityCount: 10,
      ruleCount: 20,
      itemCount: 30,
      spellCount: 40,
      deityCount: 5,
    };

    // Trigger ngOnInit(), which calls loadStats()
    fixture.detectChanges();

    // Expect a single request to the dashboard-stats API
    const req = httpTestingController.expectOne('api/admin/dashboard-stats');
    expect(req.request.method).toBe('GET');

    // Respond to the request with the mock data
    req.flush(mockStats);

    // Assert the component's state (signals)
    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBe(null);
    expect(component.stats()).toEqual(mockStats);
  });

  it('should set error signal if API fails', () => {
    // Trigger ngOnInit()
    fixture.detectChanges();

    // Expect the request
    const req = httpTestingController.expectOne('api/admin/dashboard-stats');
    expect(req.request.method).toBe('GET');

    // Respond with a 500 error
    req.flush({ error: 'Failed to load' }, { status: 500, statusText: 'Server Error' });

    // Assert the component's state
    expect(component.isLoading()).toBe(false);
    expect(component.stats()).toBe(null);
    expect(component.error()).toContain('Failed to load');
  });
});