import { Injectable, signal, computed } from '@angular/core';

export interface ModalData {
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    confirmText?: string;
    cancelText?: string;
}

@Injectable({
    providedIn: 'root'
})
export class ModalService {
    private modalState = signal<ModalData | null>(null);

    // Expose read-only signal for the component
    data = computed(() => this.modalState());
    isOpen = computed(() => !!this.modalState());

    private resolveRef: ((value: boolean) => void) | null = null;
    private resolveAlertRef: (() => void) | null = null;

    constructor() { }

    /**
     * Opens a confirmation modal. Returns a promise that resolves to true (confirmed) or false (cancelled).
     */
    confirm(title: string, message: string, confirmText = 'Confirm', cancelText = 'Cancel'): Promise<boolean> {
        this.modalState.set({
            title,
            message,
            type: 'confirm',
            confirmText,
            cancelText
        });

        return new Promise<boolean>((resolve) => {
            this.resolveRef = resolve;
        });
    }

    /**
     * Opens an alert modal. Returns a promise that resolves when closed.
     */
    alert(title: string, message: string, confirmText = 'OK'): Promise<void> {
        this.modalState.set({
            title,
            message,
            type: 'alert',
            confirmText
        });

        return new Promise<void>((resolve) => {
            this.resolveAlertRef = resolve;
        });
    }

    // Called by the component when user clicks a button
    close(result: boolean) {
        const currentState = this.modalState();
        if (!currentState) return;

        this.modalState.set(null);

        if (currentState.type === 'confirm' && this.resolveRef) {
            this.resolveRef(result);
            this.resolveRef = null;
        } else if (currentState.type === 'alert' && this.resolveAlertRef) {
            this.resolveAlertRef();
            this.resolveAlertRef = null;
        }
    }
}
