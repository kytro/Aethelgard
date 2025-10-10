import { Component, signal, inject } from '@angular/core';
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
export class AiAssistantComponent {
  http = inject(HttpClient);

  query = signal<string>('');
  isLoading = signal<boolean>(false);
  proposedUpdate = signal<any | null>(null);
  updateResult = signal<{ message: string, isError: boolean } | null>(null);

  async generateUpdate() {
    if (!this.query()) return;
    this.isLoading.set(true);
    this.updateResult.set(null);
    this.proposedUpdate.set(null);
    try {
      const result = await lastValueFrom(this.http.post<any>('api/ai-assistant/generate-update', { query: this.query() }));
      this.proposedUpdate.set(result);
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
      const result = await lastValueFrom(this.http.post<any>('api/ai-assistant/execute-operation', this.proposedUpdate()));
      this.updateResult.set({ message: result.message, isError: false });
    } catch (err: any) {
      this.updateResult.set({ message: err.error?.error || 'Failed to execute update.', isError: true });
    } finally {
      this.isLoading.set(false);
      this.proposedUpdate.set(null);
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