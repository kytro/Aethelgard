import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataBrowserComponent } from '../data-browser/data-browser.component';
import { BackupRestoreComponent } from '../backup-restore/backup-restore.component';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { DataIntegrityComponent } from '../data-integrity/data-integrity.component';
import { AiAssistantComponent } from '../ai-assistant/ai-assistant.component';
import { SettingsComponent } from '../settings/settings.component';
import { OglImportComponent } from './ogl-import/ogl-import.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule,
    DataBrowserComponent,
    BackupRestoreComponent,
    DashboardComponent,
    DataIntegrityComponent,
    AiAssistantComponent,
    SettingsComponent,
    OglImportComponent
  ],
  templateUrl: './admin.component.html',
  styles: [`
        :host {
        display: block;
        height: 100%;
        width: 100%;
        }
    `]
})
export class AdminComponent {
  // State for the Admin Panel's sidebar
  activeAdminView = signal<'dashboard' | 'data' | 'backup-restore' | 'data-integrity' | 'ai-assistant' | 'settings' | 'ogl-import'>('dashboard');
}