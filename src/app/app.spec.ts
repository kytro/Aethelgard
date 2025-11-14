import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app';
import { HttpClientTestingModule } from '@angular/common/http/testing'; // <-- IMPORT
import { RouterTestingModule } from '@angular/router/testing'; // <-- IMPORT

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AppComponent,
        HttpClientTestingModule, // <-- ADD
        RouterTestingModule      // <-- ADD
      ],
      // The global setup in test-setup.ts already provides zoneless
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);;
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    // The login screen H1 is "Codex Admin"
    expect(compiled.querySelector('h1')?.textContent).toContain('Codex Admin');
  });
});