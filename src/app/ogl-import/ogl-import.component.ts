import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

interface OglSource {
    key: string;
    name: string;
    description: string;
    collection: string;
}

interface ImportResult {
    source: string;
    collection: string;
    mode: string;
    itemsProcessed: number;
    inserted: number;
    updated: number;
}

@Component({
    selector: 'app-ogl-import',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="p-6 bg-gray-800 rounded-lg">
      <h2 class="text-xl font-bold text-yellow-400 mb-4">OGL Data Import</h2>
      <p class="text-gray-400 mb-6">Import Pathfinder 1e Open Game License data from trusted sources.</p>
      
      <!-- Source Selection -->
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-300 mb-2">Data Source</label>
        <select [(ngModel)]="selectedSource" 
                class="w-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 text-white">
          <option value="">Select a source...</option>
          @for (source of sources(); track source.key) {
            <option [value]="source.key">{{ source.name }} ({{ source.collection }})</option>
          }
        </select>
        @if (getSelectedSource(); as source) {
          <p class="text-gray-500 text-sm mt-1">{{ source.description }}</p>
        }
      </div>
      
      <!-- Import Mode -->
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-300 mb-2">Import Mode</label>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 text-gray-300">
            <input type="radio" name="mode" value="merge" [(ngModel)]="importMode"
                   class="text-yellow-400 focus:ring-yellow-400">
            <span>Merge</span>
            <span class="text-gray-500 text-sm">(keep existing, add new)</span>
          </label>
          <label class="flex items-center gap-2 text-gray-300">
            <input type="radio" name="mode" value="replace" [(ngModel)]="importMode"
                   class="text-yellow-400 focus:ring-yellow-400">
            <span>Replace</span>
            <span class="text-gray-500 text-sm">(clear OGL items first)</span>
          </label>
        </div>
      </div>
      
      <!-- Import Button -->
      <button (click)="handleImport()" 
              [disabled]="!selectedSource || isImporting()"
              class="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed 
                     text-white font-bold py-2 px-6 rounded-md transition-colors">
        @if (isImporting()) {
          <span class="flex items-center gap-2">
            <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            Importing...
          </span>
        } @else {
          Import Data
        }
      </button>
      
      <!-- Result -->
      @if (lastResult(); as result) {
        <div class="mt-6 p-4 bg-gray-900 rounded-md border border-gray-700">
          <h3 class="font-bold text-green-400 mb-2">Import Complete</h3>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <span class="text-gray-400">Source:</span>
            <span class="text-white">{{ result.source }}</span>
            <span class="text-gray-400">Collection:</span>
            <span class="text-white">{{ result.collection }}</span>
            <span class="text-gray-400">Items Processed:</span>
            <span class="text-white">{{ result.itemsProcessed }}</span>
            <span class="text-gray-400">Inserted:</span>
            <span class="text-green-400">{{ result.inserted }}</span>
            <span class="text-gray-400">Updated:</span>
            <span class="text-yellow-400">{{ result.updated }}</span>
          </div>
        </div>
      }
      
      @if (error()) {
        <div class="mt-6 p-4 bg-red-900/50 rounded-md border border-red-700">
          <p class="text-red-400">{{ error() }}</p>
        </div>
      }
      
      <!-- Custom URL Import -->
      <div class="mt-8 pt-6 border-t border-gray-700">
        <h3 class="text-lg font-bold text-gray-300 mb-4">Custom Import</h3>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm text-gray-400 mb-1">JSON URL</label>
            <input type="text" [(ngModel)]="customUrl" placeholder="https://..."
                   class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white">
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">Collection</label>
            <select [(ngModel)]="customCollection" 
                    class="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white">
              <option value="spells_pf1e">spells_pf1e</option>
              <option value="rules_pf1e">rules_pf1e</option>
              <option value="equipment_pf1e">equipment_pf1e</option>
              <option value="magic_items_pf1e">magic_items_pf1e</option>
            </select>
          </div>
        </div>
        <button (click)="handleCustomImport()"
                [disabled]="!customUrl || !customCollection || isImporting()"
                class="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed
                       text-white font-bold py-2 px-4 rounded-md">
          Import Custom URL
        </button>
      </div>
    </div>
  `
})
export class OglImportComponent {
    private http: HttpClient;

    sources = signal<OglSource[]>([]);
    isImporting = signal(false);
    lastResult = signal<ImportResult | null>(null);
    error = signal<string | null>(null);

    selectedSource = '';
    importMode: 'merge' | 'replace' = 'merge';

    customUrl = '';
    customCollection = 'spells_pf1e';

    constructor(http: HttpClient) {
        this.http = http;
        this.loadSources();
    }

    async loadSources() {
        try {
            const sources = await lastValueFrom(this.http.get<OglSource[]>('/codex/api/ogl-import/sources'));
            this.sources.set(sources);
        } catch (e) {
            console.error('Failed to load OGL sources:', e);
        }
    }

    getSelectedSource(): OglSource | null {
        return this.sources().find(s => s.key === this.selectedSource) || null;
    }

    async handleImport() {
        if (!this.selectedSource) return;

        this.isImporting.set(true);
        this.error.set(null);
        this.lastResult.set(null);

        try {
            const result = await lastValueFrom(this.http.post<ImportResult>('/codex/api/ogl-import/import', {
                sourceKey: this.selectedSource,
                mode: this.importMode
            }));
            this.lastResult.set(result);
        } catch (e: any) {
            this.error.set(e.error?.error || e.message || 'Import failed');
        } finally {
            this.isImporting.set(false);
        }
    }

    async handleCustomImport() {
        if (!this.customUrl || !this.customCollection) return;

        this.isImporting.set(true);
        this.error.set(null);
        this.lastResult.set(null);

        try {
            const result = await lastValueFrom(this.http.post<ImportResult>('/codex/api/ogl-import/import/custom', {
                url: this.customUrl,
                collection: this.customCollection,
                mode: this.importMode
            }));
            this.lastResult.set(result);
        } catch (e: any) {
            this.error.set(e.error?.error || e.message || 'Custom import failed');
        } finally {
            this.isImporting.set(false);
        }
    }
}
