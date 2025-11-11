import { Component, ElementRef, ViewChild, AfterViewInit, input, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import Panzoom from 'panzoom';

@Component({
  selector: 'app-map-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-container overflow-hidden relative bg-gray-950 border border-gray-700 rounded-lg" style="height: 600px;">
        <div class="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
            <button (click)="zoomIn()" class="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-full shadow-lg">+</button>
            <button (click)="reset()" class="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-full shadow-lg text-xs">Rx</button>
            <button (click)="zoomOut()" class="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-full shadow-lg">-</button>
        </div>

        <div class="w-full h-full flex items-center justify-center" #scene>
            <img [src]="imageUrl()" [alt]="caption() || 'Map'" #target class="max-w-none shadow-2xl" (load)="onImageLoad()">
        </div>
    </div>
    @if(caption()) {
        <p class="text-center text-gray-400 text-sm mt-2 italic">{{ caption() }}</p>
    }
  `,
  styles: [`
    .map-container { cursor: grab; }
    .map-container:active { cursor: grabbing; }
  `]
})
export class MapViewerComponent implements AfterViewInit, OnDestroy {
  imageUrl = input.required<string>();
  caption = input<string>('');

  @ViewChild('scene') sceneRef!: ElementRef<HTMLElement>;
  @ViewChild('target') targetRef!: ElementRef<HTMLImageElement>;

  private panzoom!: PanzoomObject;

  ngAfterViewInit() {
      // Initialize Panzoom but wait for image load to set sensible start positions if needed
  }

  onImageLoad() {
       if (this.panzoom) this.panzoom.destroy();

       this.panzoom = Panzoom(this.targetRef.nativeElement, {
           maxScale: 5,
           minScale: 0.1,
           contain: 'outside', // Keeps the map from being dragged completely out of view
           startScale: 0.8, // Start slightly zoomed out to show context
       });

       // Enable mouse wheel zooming
       this.sceneRef.nativeElement.addEventListener('wheel', this.panzoom.zoomWithWheel);
  }

  zoomIn() { this.panzoom?.zoomIn(); }
  zoomOut() { this.panzoom?.zoomOut(); }
  reset() { this.panzoom?.reset(); }

  ngOnDestroy() {
      // Cleanup event listeners
      if (this.sceneRef?.nativeElement && this.panzoom) {
          this.sceneRef.nativeElement.removeEventListener('wheel', this.panzoom.zoomWithWheel);
      }
  }
}