import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalService } from '../../services/modal.service';

@Component({
    selector: 'app-modal',
    standalone: true,
    imports: [CommonModule],
    template: `
    @if (modalService.isOpen()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
           (click)="handleBackdropClick($event)">
        <div class="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-full max-w-md transform transition-all animate-scale-in"
             (click)="$event.stopPropagation()">
          
          <!-- Header -->
          <div class="px-6 py-4 border-b border-gray-700">
            <h3 class="text-xl font-bold text-white">{{ modalService.data()?.title }}</h3>
          </div>

          <!-- Body -->
          <div class="px-6 py-6">
            <p class="text-gray-300 text-base leading-relaxed whitespace-pre-wrap">{{ modalService.data()?.message }}</p>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-700 flex justify-end gap-3 bg-gray-800/50 rounded-b-lg">
            @if (modalService.data()?.type === 'confirm') {
              <button (click)="cancel()" 
                      class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md font-medium transition-colors focus:ring-2 focus:ring-gray-500 focus:outline-none">
                {{ modalService.data()?.cancelText || 'Cancel' }}
              </button>
            }
            <button (click)="confirm()" 
                    class="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black rounded-md font-bold transition-colors focus:ring-2 focus:ring-yellow-400 focus:outline-none shadow-lg shadow-yellow-900/20">
              {{ modalService.data()?.confirmText || 'OK' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
    styles: [`
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .animate-fade-in {
      animation: fadeIn 0.2s ease-out;
    }
    .animate-scale-in {
      animation: scaleIn 0.2s ease-out;
    }
  `]
})
export class ModalComponent {
    modalService = inject(ModalService);

    confirm() {
        this.modalService.close(true);
    }

    cancel() {
        this.modalService.close(false);
    }

    handleBackdropClick(event: MouseEvent) {
        if (this.modalService.data()?.type === 'alert') {
            // Alerts usually explicitly require clicking OK, but backdrops can sometimes dismiss.
            // For now, let's make it strict for alerts? Or standard? 
            // Let's standard: backdrop dismisses as cancel?
            // Actually for alert, it usually resolves.
            this.confirm(); // Alerts only have one outcome really.
        } else {
            this.cancel(); // Confirm dialogs cancel on backdrop
        }
    }
}
