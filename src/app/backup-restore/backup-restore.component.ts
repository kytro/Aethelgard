import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-backup-restore',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './backup-restore.component.html',
  styleUrls: ['./backup-restore.component.css']
})
export class BackupRestoreComponent {
  http = inject(HttpClient);

  // State for Backup
  isBackingUp = signal<boolean>(false);
  backupMessage = signal<string>('');
  isBackupError = signal<boolean>(false);

  // State for Restore
  selectedFile = signal<File | null>(null);
  isRestoring = signal<boolean>(false);
  restoreMessage = signal<string>('');
  isRestoreError = signal<boolean>(false);
  isPartialRestore = false; // Checkbox state for partial restore mode

  async handleBackup() {
    this.isBackingUp.set(true);
    this.backupMessage.set('Generating backup...');
    this.isBackupError.set(false);
    try {
      const data = await lastValueFrom(this.http.get('api/admin/backup', { responseType: 'blob' }));

      // Update blob type to zip
      const blob = new Blob([data], { type: 'application/zip' });

      // Create a temporary link to trigger the download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // [UPDATE] Use .zip extension
      a.download = `codex_backup_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      this.backupMessage.set('Backup downloaded successfully.');
    } catch (err: any) {
      this.backupMessage.set(err.error?.error || 'Failed to generate backup.');
      this.isBackupError.set(true);
    } finally {
      this.isBackingUp.set(false);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
      this.restoreMessage.set('');
      this.isRestoreError.set(false);
    }
  }

  async handleRestore(fileInput: HTMLInputElement) {
    const file = this.selectedFile();
    if (!file) {
      this.restoreMessage.set('Please select a file to restore.');
      this.isRestoreError.set(true);
      return;
    }

    this.isRestoring.set(true);
    const mode = this.isPartialRestore ? 'Merging' : 'Restoring';
    this.restoreMessage.set(`${mode} backup data...`);
    this.isRestoreError.set(false);

    const formData = new FormData();
    formData.append('backupFile', file);

    try {
      // Add partial restore query parameter if checkbox is checked
      const url = this.isPartialRestore ? 'api/admin/restore?partial=true' : 'api/admin/restore';
      const res = await lastValueFrom(this.http.post<any>(url, formData));
      this.restoreMessage.set(res.message || `${mode} completed successfully!`);
    } catch (err: any) {
      const errorMessage = err.error?.error || 'An unknown error occurred during restore.';
      this.restoreMessage.set(`Error: ${errorMessage}`);
      this.isRestoreError.set(true);
      console.error(err);
    } finally {
      this.isRestoring.set(false);
      this.selectedFile.set(null);
      if (fileInput) {
        fileInput.value = '';
      }
    }
  }
}