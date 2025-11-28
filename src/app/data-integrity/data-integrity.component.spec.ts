import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataIntegrityComponent } from './data-integrity.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';

describe('DataIntegrityComponent', () => {
    let component: DataIntegrityComponent;
    let fixture: ComponentFixture<DataIntegrityComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [DataIntegrityComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(DataIntegrityComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);

        // Trigger ngOnInit
        fixture.detectChanges();

        // Handle initial status check
        const req = httpMock.expectOne('/codex/api/data-integrity/status');
        expect(req.request.method).toBe('GET');
        req.flush({
            unlinkedStatblocks: 5,
            orphanedEntities: 2,
            brokenRuleLinks: 0,
            brokenEquipmentLinks: 1
        });
        await fixture.whenStable();
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should create and log initial status', () => {
        expect(component).toBeTruthy();
        const logs = component.logs();
        expect(logs.length).toBeGreaterThan(0);

        // Verify content exists in the logs array (order might be reversed due to prepend)
        const hasStatblockLog = logs.some(l => l.message.includes('Unlinked Statblocks: 5'));
        expect(hasStatblockLog).toBe(true);
    });

    it('should trigger codex migration when confirmed', async () => {
        jest.spyOn(window, 'confirm').mockReturnValue(true);

        component.forceMigration.set(true);
        component.migrateCodex();

        const req = httpMock.expectOne('/codex/api/data-integrity/migrate-codex');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ force: true });

        req.flush({ message: 'Migration started' });
        await fixture.whenStable();

        expect(component.logs()[0].message).toContain('Migration started');
    });

    it('should NOT trigger codex migration when cancelled', () => {
        jest.spyOn(window, 'confirm').mockReturnValue(false);

        component.migrateCodex();

        httpMock.expectNone('/codex/api/data-integrity/migrate-codex');
        expect(component.logs()[0].message).toContain('cancelled');
    });

    it('should trigger normalize statblocks job', async () => {
        component.normalizeStatblocks();

        const req = httpMock.expectOne('/codex/api/data-integrity/normalize-statblocks');
        expect(req.request.method).toBe('POST');

        req.flush({ message: 'Normalization complete' });
        await fixture.whenStable();

        expect(component.logs()[0].message).toContain('Normalization complete');
    });

    it('should handle job errors', async () => {
        component.normalizeStatblocks();

        const req = httpMock.expectOne('/codex/api/data-integrity/normalize-statblocks');
        req.flush({ error: 'Database locked' }, { status: 500, statusText: 'Error' });
        await fixture.whenStable();

        const lastLog = component.logs()[0];
        expect(lastLog.isError).toBe(true);
        expect(lastLog.message).toContain('Database locked');
    });

    it('should clear logs', () => {
        expect(component.logs().length).toBeGreaterThan(0); // Has init logs
        component.clearLogs();
        expect(component.logs().length).toBe(0);
    });
});