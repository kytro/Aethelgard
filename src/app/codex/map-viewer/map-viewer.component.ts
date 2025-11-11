import { Component, ElementRef, ViewChild, AfterViewInit, input, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import Panzoom, { type PanzoomObject } from '@panzoom/panzoom';

@Component({
  selector: 'app-map-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-container" #scene>
        <div class="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
            <button (click)="zoomIn()" class="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-full shadow-lg">+</button>
            <button (click)="reset()" class="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-full shadow-lg text-xs">Rx</button>
            <button (click)="zoomOut()" class="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-full shadow-lg">-</button>
        </div>
        <img [src]="imageUrl()" [alt]="caption() || 'Map'" #target (load)="onImageLoad()" draggable="false">
    </div>
    @if(caption()) {
        <p class="text-center text-gray-400 text-sm mt-2 italic">{{ caption() }}</p>
    }
  `,
  styles: [`
    .map-container {
      overflow: hidden;
      position: relative;
      background-color: #030712; /* bg-gray-950 */
      border: 1px solid #374151; /* border-gray-700 */
      border-radius: 0.5rem; /* rounded-lg */
      width: 100%;
      height: 75vh;
      cursor: grab;
    }
    .map-container:active {
      cursor: grabbing;
    }
    .map-container img {
      max-width: none;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); /* shadow-2xl */
    }
  `]
})
export class MapViewerComponent implements AfterViewInit, OnDestroy {
  imageUrl = input.required<string>();
  caption = input<string>('');

  @ViewChild('scene') sceneRef!: ElementRef<HTMLElement>;
  @ViewChild('target') targetRef!: ElementRef<HTMLImageElement>;

  private panzoom!: PanzoomObject;

  ngAfterViewInit() {
    if (this.targetRef.nativeElement.complete) {
      this.onImageLoad();
    }
  }

  onImageLoad() {
    if (this.panzoom) {
      this.panzoom.destroy();
    }

    const image = this.targetRef.nativeElement;
    const scene = this.sceneRef.nativeElement;

    const sceneWidth = scene.clientWidth;
    const sceneHeight = scene.clientHeight;
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;

    const scaleX = sceneWidth / imageWidth;
    const scaleY = sceneHeight / imageHeight;
    const startScale = Math.min(scaleX, scaleY);

    this.panzoom = Panzoom(image, {
      maxScale: 10,
      minScale: 0.1,
      contain: 'outside',
      startScale: startScale,
    });

    scene.addEventListener('wheel', this.panzoom.zoomWithWheel);
  }

  zoomIn() { this.panzoom?.zoomIn(); }
  zoomOut() { this.panzoom?.zoomOut(); }
  reset() { this.panzoom?.reset(); }

  ngOnDestroy() {
    if (this.panzoom) {
      if (this.sceneRef?.nativeElement) {
        this.sceneRef.nativeElement.removeEventListener('wheel', this.panzoom.zoomWithWheel);
      }
      this.panzoom.destroy();
    }
  }
}