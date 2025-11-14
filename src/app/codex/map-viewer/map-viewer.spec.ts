import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapViewerComponent } from './map-viewer';
import { CommonModule } from '@angular/common';

// Mock Panzoom
jest.mock('@panzoom/panzoom', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    reset: jest.fn(),
    destroy: jest.fn(),
    zoomWithWheel: jest.fn(),
  }))
}));

describe('MapViewerComponent', () => {
  let component: MapViewerComponent;
  let fixture: ComponentFixture<MapViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, MapViewerComponent], // standalone component goes in imports
    }).compileComponents();

    fixture = TestBed.createComponent(MapViewerComponent);
    component = fixture.componentInstance;

    component.imageUrl.set('test.png');
    component.caption.set('Test caption');

    const img = fixture.nativeElement.querySelector('img');
    if (img) {
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      Object.defineProperty(img, 'complete', { value: true });
    }

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render image and caption', () => {
    const img = fixture.nativeElement.querySelector('img');
    expect(img.src).toContain('test.png');

    const caption = fixture.nativeElement.querySelector('p');
    expect(caption.textContent).toBe('Test caption');
  });
});
