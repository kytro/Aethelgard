import { TestBed } from '@angular/core/testing';
import { ModalService } from './modal.service';
import { provideZonelessChangeDetection } from '@angular/core';

describe('ModalService', () => {
    let service: ModalService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [ModalService, provideZonelessChangeDetection()]
        });
        service = TestBed.inject(ModalService);
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should verify initial state is closed', () => {
        expect(service.isOpen()).toBeFalsy();
        expect(service.data()).toBeNull();
    });

    it('should open confirm modal and return promise resolving to true on confirm', async () => {
        const promise = service.confirm('Title', 'Message');

        expect(service.isOpen()).toBeTruthy();
        expect(service.data()).toEqual({
            title: 'Title',
            message: 'Message',
            type: 'confirm',
            confirmText: 'Confirm',
            cancelText: 'Cancel'
        });

        service.close(true);
        const result = await promise;
        expect(result).toBe(true);
        expect(service.isOpen()).toBeFalsy();
    });

    it('should open confirm modal and return promise resolving to false on cancel', async () => {
        const promise = service.confirm('Title', 'Message');
        service.close(false);
        const result = await promise;
        expect(result).toBe(false);
    });

    it('should open alert modal and return promise resolving on close', async () => {
        const promise = service.alert('Title', 'Alert Message');

        expect(service.isOpen()).toBeTruthy();
        expect(service.data()).toEqual({
            title: 'Title',
            message: 'Alert Message',
            type: 'alert',
            confirmText: 'OK'
        });

        service.close(true); // Argument ignored for alert, but signals completion
        await promise;
        expect(service.isOpen()).toBeFalsy();
    });
});
