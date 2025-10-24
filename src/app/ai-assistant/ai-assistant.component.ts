import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-assistant.component.html',
  styleUrls: ['./ai-assistant.component.css']
})
export class AiAssistantComponent implements OnInit {
  http = inject(HttpClient);

  query = signal<string>('');
  isLoading = signal<boolean>(false);
  proposedUpdate = signal<any | null>(null);
  updateResult = signal<{ message: string, isError: boolean } | null>(null);
  models = signal<string[]>([]);
  selectedModel = signal<string>('');

  ngOnInit() {
    this.loadModels();
  }

  async loadModels() {
    this.isLoading.set(true);
    try {
      const result = await lastValueFrom(this.http.get<any>('/codex/api/ai-assistant/models'));
      const models = result.models || [];
      this.models.set(models);

      const defaultModel = result.defaultModel;
      if (defaultModel && models.includes(defaultModel)) {
        this.selectedModel.set(defaultModel);
      } else if (models.length > 0) {
        this.selectedModel.set(models[0]);
      } else {
        this.selectedModel.set('');
      }
    } catch (err) {
      console.error('Failed to load AI models', err);
      this.updateResult.set({ message: 'Failed to load AI models.', isError: true });
      this.models.set([]);
      this.selectedModel.set('');
    } finally {
      this.isLoading.set(false);
    }
  }

  async generateUpdate() {
    if (!this.query()) return;
    this.isLoading.set(true);
    this.updateResult.set(null);
    this.proposedUpdate.set(null);
    try {
      const result = await lastValueFrom(this.http.post<any>('/codex/api/ai-assistant/generate-update', { 
        query: this.query(),
        model: this.selectedModel()
      }));
      this.proposedUpdate.set(Array.isArray(result) ? result : [result]);
    } catch (err: any) {
      this.updateResult.set({ message: err.error?.error || 'Failed to generate update.', isError: true });
    } finally {
      this.isLoading.set(false);
    }
  }

  async confirmUpdate() {
    if (!this.proposedUpdate()) return;
    this.isLoading.set(true);
    this.updateResult.set(null);
    try {
      // The backend now returns a detailed object with a message and details array
      const result = await lastValueFrom(this.http.post<any>('/codex/api/ai-assistant/execute-operation', this.proposedUpdate()));
      this.updateResult.set({ message: result.message || 'Operations executed successfully.', isError: false });
    } catch (err: any) {
      this.updateResult.set({ message: err.error?.error || 'Failed to execute update.', isError: true });
    } finally {
      this.isLoading.set(false);
      this.proposedUpdate.set(null); // Clear the plan after execution
    }
  }

  cancelUpdate() {
    this.proposedUpdate.set(null);
  }

  objectToJson(obj: any): string {
    if (!obj) return '';
    return JSON.stringify(obj, null, 2);
  }
}