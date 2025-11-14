import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataBrowserComponent } from '../data-browser/data-browser.component';
import { BackupRestoreComponent } from '../backup-restore/backup-restore.component';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { DataIntegrityComponent } from '../data-integrity/data-integrity.component';
import { AiAssistantComponent } from '../ai-assistant/ai-assistant.component';
import { SettingsComponent } from '../settings/settings.component';

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
    SettingsComponent
  ],
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  // State for the Admin Panel's sidebar
  activeAdminView = signal<'dashboard' | 'data' | 'backup-restore' | 'data-integrity' | 'ai-assistant' | 'settings'>('dashboard');
}