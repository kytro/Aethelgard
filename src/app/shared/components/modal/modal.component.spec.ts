import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';
import { ModalService } from '../../services/modal.service';
import { provideZonelessChangeDetection } from '@angular/core';

describe('ModalComponent', () => {
    let component: ModalComponent;
    let fixture: ComponentFixture<ModalComponent>;
    let modalService: ModalService;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ModalComponent],
            providers: [ModalService, provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(ModalComponent);
        component = fixture.componentInstance;
        modalService = TestBed.inject(ModalService);
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should not show modal content by default', () => {
        const element: HTMLElement = fixture.nativeElement;
        // The @if block prevents rendering if not open
        expect(element.querySelector('.fixed')).toBeNull();
    });

    it('should show modal content when service is open', async () => {
        modalService.confirm('Test Title', 'Test Message');
        fixture.detectChanges();
        await fixture.whenStable();

        const element: HTMLElement = fixture.nativeElement;
        expect(element.textContent).toContain('Test Title');
        expect(element.textContent).toContain('Test Message');
    });

    it('should close modal (isOpen=false) when confirm button is clicked', async () => {
        modalService.confirm('Test', 'Message');
        fixture.detectChanges();
        await fixture.whenStable();

        component.confirm();
        // Check that the service state is now closed
        expect(modalService.isOpen()).toBe(false);
    });

    it('should close modal (isOpen=false) when cancel button is clicked', async () => {
        modalService.confirm('Test', 'Message');
        fixture.detectChanges();
        await fixture.whenStable();

        component.cancel();
        expect(modalService.isOpen()).toBe(false);
    });
});
