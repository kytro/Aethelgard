import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapViewerComponent } from './map-viewer.component';
import { provideZonelessChangeDetection } from '@angular/core';

// Mock Panzoom
const mockPanzoomInstance = {
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    reset: jest.fn(),
    destroy: jest.fn(),
    zoomWithWheel: jest.fn()
};

jest.mock('@panzoom/panzoom', () => ({
    __esModule: true,
    default: jest.fn(() => mockPanzoomInstance)
}));

import Panzoom from '@panzoom/panzoom';

describe('MapViewerComponent', () => {
    let component: MapViewerComponent;
    let fixture: ComponentFixture<MapViewerComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [MapViewerComponent],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(MapViewerComponent);
        component = fixture.componentInstance;

        fixture.componentRef.setInput('imageUrl', 'test.jpg');
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should initialize panzoom on image load', () => {
        // Mock dimensions
        Object.defineProperty(component.targetRef.nativeElement, 'naturalWidth', { value: 1000, configurable: true });
        Object.defineProperty(component.targetRef.nativeElement, 'naturalHeight', { value: 800, configurable: true });
        Object.defineProperty(component.sceneRef.nativeElement, 'clientWidth', { value: 500, configurable: true });
        Object.defineProperty(component.sceneRef.nativeElement, 'clientHeight', { value: 400, configurable: true });

        component.onImageLoad();

        expect(Panzoom).toHaveBeenCalled();
    });

    it('should call zoom methods', () => {
        // Initialize first
        Object.defineProperty(component.targetRef.nativeElement, 'naturalWidth', { value: 1000, configurable: true });
        Object.defineProperty(component.targetRef.nativeElement, 'naturalHeight', { value: 800, configurable: true });
        component.onImageLoad();

        component.zoomIn();
        expect(mockPanzoomInstance.zoomIn).toHaveBeenCalled();

        component.zoomOut();
        expect(mockPanzoomInstance.zoomOut).toHaveBeenCalled();

        component.reset();
        expect(mockPanzoomInstance.reset).toHaveBeenCalled();
    });

    it('should cleanup on destroy', () => {
        Object.defineProperty(component.targetRef.nativeElement, 'naturalWidth', { value: 1000, configurable: true });
        Object.defineProperty(component.targetRef.nativeElement, 'naturalHeight', { value: 800, configurable: true });
        component.onImageLoad();

        component.ngOnDestroy();
        expect(mockPanzoomInstance.destroy).toHaveBeenCalled();
    });
});