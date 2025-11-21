import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BackupRestoreComponent } from './backup-restore.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';

describe('BackupRestoreComponent', () => {
    let component: BackupRestoreComponent;
    let fixture: ComponentFixture<BackupRestoreComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [BackupRestoreComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(BackupRestoreComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);
        fixture.detectChanges();
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should trigger backup download', async () => {
        // Mock window URL methods to avoid jsdom errors
        window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
        window.URL.revokeObjectURL = jest.fn();

        component.handleBackup();

        const req = httpMock.expectOne('api/admin/backup');
        expect(req.request.method).toBe('GET');
        req.flush(new Blob(['{}']));

        await fixture.whenStable();
        expect(component.backupMessage()).toContain('success');
    });

    it('should upload file for restore', async () => {
        const file = new File(['{}'], 'backup.json');
        component.selectedFile.set(file);

        component.handleRestore({ value: '' } as HTMLInputElement);

        const req = httpMock.expectOne('api/admin/restore');
        expect(req.request.method).toBe('POST');
        req.flush({ message: 'Done' });

        await fixture.whenStable();
        expect(component.restoreMessage()).toBe('Done');
    });
});