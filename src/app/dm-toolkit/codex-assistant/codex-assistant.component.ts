import { Component, signal, inject, input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-codex-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div id="codex-assistant">
      <h2 class="text-3xl font-bold text-white mb-6 text-yellow-500">Codex Assistant</h2>
      <div class="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
        <p class="text-gray-400 mb-4">Ask a question about your world data. The assistant will answer based on the loaded codex content.</p>
        
        <div class="mb-4">
          <label for="model-select" class="block text-sm font-medium text-gray-400 mb-1">Select AI Model</label>
          <select id="model-select" [ngModel]="selectedModel()" (ngModelChange)="selectedModel.set($event)" name="selectedModel" class="w-full bg-gray-900 border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500">
            @if (availableModels().length === 0) {
              <option disabled>Loading models...</option>
            }
            @for (model of availableModels(); track model) {
              <option [value]="model">{{ formatModelName(model) }}</option>
            }
          </select>
        </div>

        <textarea [(ngModel)]="assistantQuery" placeholder="e.g., Who is Captain Valerius and what are his motivations?" class="w-full h-24 bg-gray-900 border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500 mb-4"></textarea>
        
        <button (click)="handleAskAssistant()" [disabled]="isAskingAssistant()" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-gray-500">
          {{ isAskingAssistant() ? 'Thinking...' : 'Ask Assistant' }}
        </button>
      </div>

      @if (assistantResponse() || isAskingAssistant()) {
        <div class="mt-6 bg-gray-800/50 p-6 rounded-lg border border-gray-700">
          <h3 class="font-semibold text-xl mb-3 text-yellow-400">Response</h3>
          @if(isAskingAssistant()) {
             <p class="text-gray-400">Loading response...</p>
          } @else {
             <p class="text-gray-300 whitespace-pre-wrap leading-relaxed">{{assistantResponse()}}</p>
          }
        </div>
      }
    </div>
  `
})
export class CodexAssistantComponent implements OnInit {
  codex = input<any>();
  http = inject(HttpClient);

  assistantQuery = '';
  assistantResponse = signal('');
  isAskingAssistant = signal(false);
  
  availableModels = signal<string[]>([]);
  selectedModel = signal<string>('');

  ngOnInit() {
    this.loadModels();
  }

  async loadModels() {
    try {
      const result = await lastValueFrom(this.http.get<any>('/codex/api/ai-assistant/models'));
      this.availableModels.set(result.models || []);
      if (result.defaultModel && this.availableModels().includes(result.defaultModel)) {
        this.selectedModel.set(result.defaultModel);
      } else if (this.availableModels().length > 0) {
        this.selectedModel.set(this.availableModels()[0]);
      }
    } catch (err) {
      console.error('Failed to load models', err);
    }
  }

  async handleAskAssistant() {
    if (!this.assistantQuery.trim() || !this.codex()) return;
    this.isAskingAssistant.set(true);
    this.assistantResponse.set('');
    try {
        const res = await lastValueFrom(this.http.post<any>('/codex/api/dm-toolkit-ai/assistant', { 
            query: this.assistantQuery,
            model: this.selectedModel(),
            options: { codex: this.codex() }
        }));
        this.assistantResponse.set(res.response);
    } catch (e: any) { 
        this.assistantResponse.set(`Error: ${e.error?.error || e.message}`); 
    } finally { 
        this.isAskingAssistant.set(false);
    }
  }

  formatModelName(name: string): string {
    if (!name) return '';
    return name.replace('models/', '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
}