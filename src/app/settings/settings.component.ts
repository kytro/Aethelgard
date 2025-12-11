import { Component, signal, inject, WritableSignal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ModalService } from '../shared/services/modal.service';

// Interfaces to match the backend data structure
export interface ApiKey {
  id: string;
  name: string;
  key: string;
}

export interface ApiKeysDoc {
  _id: 'api_keys';
  keys: ApiKey[];
  active_key_id: string | null;
}

// NEW: Interface for a general settings document
export interface GeneralSettingsDoc {
  _id: 'general';
  default_ai_model: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent {
  http = inject(HttpClient);
  modalService = inject(ModalService);

  apiKeysDoc: WritableSignal<ApiKeysDoc | null> = signal(null);
  generalSettingsDoc: WritableSignal<GeneralSettingsDoc | null> = signal(null); // NEW
  availableModels = signal<string[]>([]); // NEW

  newKeyName = signal<string>('');
  newKeyValue = signal<string>('');

  isLoading = signal<boolean>(false);
  isDirty = signal<boolean>(false);
  message = signal<{ text: string, isError: boolean } | null>(null);

  constructor() {
    this.loadAllSettings();
  }

  @HostListener('window:beforeunload', ['$event'])
  canDeactivate(event: BeforeUnloadEvent): void {
    if (this.isDirty()) {
      this.saveAllSettings();
      event.returnValue = true;
    }
  }

  async loadAllSettings() {
    this.isLoading.set(true);
    this.message.set(null);
    try {
      // Fetch all settings in parallel
      const [keysDoc, generalDoc, modelsResult] = await Promise.all([
        lastValueFrom(this.http.get<ApiKeysDoc>('/codex/api/admin/settings/api-keys')),
        lastValueFrom(this.http.get<GeneralSettingsDoc>('/codex/api/admin/settings/general')),
        lastValueFrom(this.http.get<{ models: string[] }>('/codex/api/ai-assistant/models'))
      ]);

      this.apiKeysDoc.set(keysDoc);
      this.generalSettingsDoc.set(generalDoc);
      this.availableModels.set(modelsResult.models);
      this.isDirty.set(false);

    } catch (err: any) {
      this.message.set({ text: err.error?.error || 'Failed to load settings.', isError: true });
    } finally {
      this.isLoading.set(false);
    }
  }

  async addApiKey() {
    if (!this.newKeyName() || !this.newKeyValue()) {
      this.message.set({ text: 'Key Name and Key Value cannot be empty.', isError: true });
      return;
    }
    this.isLoading.set(true);
    this.message.set(null);
    try {
      const newKey = await lastValueFrom(this.http.post<ApiKey>('/codex/api/admin/settings/api-keys', {
        name: this.newKeyName(),
        key: this.newKeyValue()
      }));

      this.apiKeysDoc.update(doc => {
        if (!doc) return null;
        doc.keys.push(newKey);
        if (doc.keys.length === 1) {
          doc.active_key_id = newKey.id;
        }
        return { ...doc };
      });

      this.newKeyName.set('');
      this.newKeyValue.set('');
      this.message.set({ text: `API Key '${newKey.name}' added successfully!`, isError: false });
      this.isDirty.set(true);

    } catch (err: any) {
      this.message.set({ text: err.error?.error || 'Failed to add API key.', isError: true });
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteApiKey(id: string) {
    const confirmed = await this.modalService.confirm('Delete API Key', 'Are you sure you want to delete this API key? This action cannot be undone.');
    if (!confirmed) return;

    this.isLoading.set(true);
    this.message.set(null);
    try {
      await lastValueFrom(this.http.delete(`/codex/api/admin/settings/api-keys/${id}`));

      // After deletion, reload all settings to get the new active key if it changed
      await this.loadAllSettings();

      this.message.set({ text: 'API Key deleted successfully.', isError: false });
    } catch (err: any) {
      this.message.set({ text: err.error?.error || 'Failed to delete API key.', isError: true });
    } finally {
      this.isLoading.set(false);
    }
  }

  onSettingsChange(): void {
    this.isDirty.set(true);
  }

  async saveAllSettings() {
    const keysDoc = this.apiKeysDoc();
    const generalDoc = this.generalSettingsDoc();
    if (!keysDoc || !generalDoc) return;

    this.isLoading.set(true);
    this.message.set(null);
    try {
      await Promise.all([
        lastValueFrom(this.http.post('/codex/api/admin/settings/set-active', { id: keysDoc.active_key_id })),
        lastValueFrom(this.http.post('/codex/api/admin/settings/general', { default_ai_model: generalDoc.default_ai_model }))
      ]);
      this.message.set({ text: 'Settings saved successfully.', isError: false });
      this.isDirty.set(false);
    } catch (err: any) {
      this.message.set({ text: err.error?.error || 'Failed to save settings.', isError: true });
      await this.loadAllSettings(); // Revert on failure
    } finally {
      this.isLoading.set(false);
    }
  }

  // Helper to format model names for the dropdown
  formatModelName(name: string): string {
    if (!name) return '';
    return name.replace('models/', '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
}
