import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminComponent } from './admin.component';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { By } from '@angular/platform-browser';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { DataBrowserComponent } from '../data-browser/data-browser.component';
import { BackupRestoreComponent } from '../backup-restore/backup-restore.component';
import { DataIntegrityComponent } from '../data-integrity/data-integrity.component';
import { AiAssistantComponent } from '../ai-assistant/ai-assistant.component';
import { SettingsComponent } from '../settings/settings.component';

// Mock Components
@Component({ selector: 'app-dashboard', standalone: true, template: '<div>Dashboard</div>' })
class MockDashboardComponent { }

@Component({ selector: 'app-data-browser', standalone: true, template: '<div>Data Browser</div>' })
class MockDataBrowserComponent { }

@Component({ selector: 'app-backup-restore', standalone: true, template: '<div>Backup Restore</div>' })
class MockBackupRestoreComponent { }

@Component({ selector: 'app-data-integrity', standalone: true, template: '<div>Data Integrity</div>' })
class MockDataIntegrityComponent { }

@Component({ selector: 'app-ai-assistant', standalone: true, template: '<div>AI Assistant</div>' })
class MockAiAssistantComponent { }

@Component({ selector: 'app-settings', standalone: true, template: '<div>Settings</div>' })
class MockSettingsComponent { }

describe('AdminComponent', () => {
    let component: AdminComponent;
    let fixture: ComponentFixture<AdminComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [AdminComponent],
            providers: [provideZonelessChangeDetection()]
        })
            .overrideComponent(AdminComponent, {
                remove: {
                    imports: [
                        DashboardComponent,
                        DataBrowserComponent,
                        BackupRestoreComponent,
                        DataIntegrityComponent,
                        AiAssistantComponent,
                        SettingsComponent
                    ]
                },
                add: {
                    imports: [
                        MockDashboardComponent,
                        MockDataBrowserComponent,
                        MockBackupRestoreComponent,
                        MockDataIntegrityComponent,
                        MockAiAssistantComponent,
                        MockSettingsComponent
                    ]
                }
            })
            .compileComponents();

        fixture = TestBed.createComponent(AdminComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should default to dashboard view', () => {
        expect(component.activeAdminView()).toBe('dashboard');
        const dashboard = fixture.debugElement.query(By.css('app-dashboard'));
        expect(dashboard).toBeTruthy();
        expect(dashboard.nativeElement.textContent).toContain('Dashboard');
    });

    it('should switch to data browser view', () => {
        component.activeAdminView.set('data');
        fixture.detectChanges();

        const dataBrowser = fixture.debugElement.query(By.css('app-data-browser'));
        expect(dataBrowser).toBeTruthy();
        expect(dataBrowser.nativeElement.textContent).toContain('Data Browser');

        const dashboard = fixture.debugElement.query(By.css('app-dashboard'));
        expect(dashboard).toBeNull();
    });

    it('should switch to backup view', () => {
        component.activeAdminView.set('backup-restore');
        fixture.detectChanges();
        expect(fixture.debugElement.query(By.css('app-backup-restore'))).toBeTruthy();
    });

    it('should switch to integrity view', () => {
        component.activeAdminView.set('data-integrity');
        fixture.detectChanges();
        expect(fixture.debugElement.query(By.css('app-data-integrity'))).toBeTruthy();
    });

    it('should switch to settings view', () => {
        component.activeAdminView.set('settings');
        fixture.detectChanges();
        expect(fixture.debugElement.query(By.css('app-settings'))).toBeTruthy();
    });
});