import { Component, signal, inject, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';

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

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent {
  http = inject(HttpClient);

  apiKeysDoc: WritableSignal<ApiKeysDoc | null> = signal(null);
  newKeyName = signal<string>('');
  newKeyValue = signal<string>('');

  isLoading = signal<boolean>(false);
  message = signal<{ text: string, isError: boolean } | null>(null);

  constructor() {
    this.loadApiKeys();
  }

  async loadApiKeys() {
    this.isLoading.set(true);
    this.message.set(null);
    try {
      const doc = await lastValueFrom(this.http.get<ApiKeysDoc>('api/admin/settings/api-keys'));
      this.apiKeysDoc.set(doc);
    } catch (err: any) {
      this.message.set({ text: err.error?.error || 'Failed to load API keys.', isError: true });
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
      const newKey = await lastValueFrom(this.http.post<ApiKey>('api/admin/settings/api-keys', { 
        name: this.newKeyName(), 
        key: this.newKeyValue() 
      }));
      
      // Optimistically update the UI
      this.apiKeysDoc.update(doc => {
        if (!doc) return null;
        doc.keys.push(newKey);
        // If it's the first key, it becomes active automatically on the backend
        if (doc.keys.length === 1) {
            doc.active_key_id = newKey.id;
        }
        return doc;
      });

      this.newKeyName.set('');
      this.newKeyValue.set('');
      this.message.set({ text: `API Key '${newKey.name}' added successfully!`, isError: false });

    } catch (err: any) {
      this.message.set({ text: err.error?.error || 'Failed to add API key.', isError: true });
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteApiKey(id: string) {
    if (!confirm('Are you sure you want to delete this API key?')) return;

    this.isLoading.set(true);
    this.message.set(null);
    try {
      await lastValueFrom(this.http.delete(`api/admin/settings/api-keys/${id}`));
      
      // After deletion, reload the keys to get the new active key if it changed
      await this.loadApiKeys();

      this.message.set({ text: 'API Key deleted successfully.', isError: false });
    } catch (err: any) {
      this.message.set({ text: err.error?.error || 'Failed to delete API key.', isError: true });
    } finally {
      this.isLoading.set(false);
    }
  }

  async setActiveKey() {
    const doc = this.apiKeysDoc();
    if (!doc) return;

    this.isLoading.set(true);
    this.message.set(null);
    try {
        await lastValueFrom(this.http.post('api/admin/settings/set-active', { id: doc.active_key_id }));
        this.message.set({ text: 'Active key updated successfully.', isError: false });
    } catch (err: any) {
        this.message.set({ text: err.error?.error || 'Failed to set active key.', isError: true });
        // If setting fails, reload to revert the change in the UI
        await this.loadApiKeys();
    } finally {
        this.isLoading.set(false);
    }
  }
}
