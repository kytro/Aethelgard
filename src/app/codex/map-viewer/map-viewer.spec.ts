import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapViewerComponent } from './map-viewer.component';
import { CommonModule } from '@angular/common';

describe('MapViewerComponent', () => {
  let component: MapViewerComponent;
  let fixture: ComponentFixture<MapViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, MapViewerComponent] // standalone component
    }).compileComponents();

    fixture = TestBed.createComponent(MapViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render image and caption', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const img = compiled.querySelector('img');
    const caption = compiled.querySelector('figcaption');
    expect(img).toBeTruthy();
    expect(caption).toBeTruthy();
  });
});
