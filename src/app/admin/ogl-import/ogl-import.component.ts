import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OglImportService } from './ogl-import.service';

@Component({
  selector: 'app-ogl-import',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="h-full flex flex-col p-6 bg-slate-900 text-slate-100 overflow-y-auto">
      <h1 class="text-3xl font-bold mb-6 text-amber-500">OGL Data Import</h1>
      
      <div class="bg-slate-800 rounded-lg p-6 shadow-lg max-w-2xl border border-slate-700">
        <h2 class="text-xl font-semibold mb-4 text-slate-200">Import from PSRD-Data ZIP</h2>
        <p class="text-slate-400 mb-6 text-sm leading-relaxed">
          Upload a ZIP archive of the 'devonjones/PSRD-Data' repository (release branch).
          The system will parse JSON files from known rulebook directories (Core, APG, Ultimate Equipment/Combat/Magic) 
          and add them to your Codex database.
        </p>

        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-slate-300">Select ZIP File</label>
            <input 
              type="file" 
              accept=".zip"
              (change)="onFileSelected($event)"
              class="block w-full text-sm text-slate-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-amber-600 file:text-white
                hover:file:bg-amber-700
                cursor-pointer"
            />
          </div>

          <div *ngIf="isUploading" class="mt-4">
             <div class="flex items-center gap-2 text-amber-400 mb-2">
                <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Processing ZIP archive... large files may take a minute.</span>
             </div>
          </div>

          <button 
            [disabled]="!selectedFile || isUploading"
            (click)="upload()"
            class="mt-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded transition-colors w-fit"
          >
            Upload & Import
          </button>
        </div>

        <div *ngIf="result" class="mt-8 p-4 bg-slate-900 rounded border border-slate-700">
           <h3 class="text-lg font-bold text-green-400 mb-2">Import Complete</h3>
           <dl class="grid grid-cols-2 gap-4 text-sm">
             <div>
               <dt class="text-slate-500">Processed Files</dt>
               <dd class="text-slate-200 font-mono">{{result.processed}}</dd>
             </div>
             <div>
               <dt class="text-slate-500">Errors</dt>
               <dd class="text-red-400 font-mono">{{result.errors}}</dd>
             </div>
             <div class="col-span-2 border-t border-slate-700 my-2"></div>
              <div>
                <dt class="text-slate-500">Rules / Feats</dt>
                <dd class="text-amber-400 font-mono text-lg">{{result.rules}}</dd>
              </div>
              <div>
                <dt class="text-slate-500">Equipment</dt>
                <dd class="text-blue-400 font-mono text-lg">{{result.equipment}}</dd>
              </div>
              <div>
                <dt class="text-slate-500">Hazards / Traps</dt>
                <dd class="text-red-400 font-mono text-lg">{{result.hazards}}</dd>
              </div>
              <div>
                <dt class="text-slate-500">Spells</dt>
                <dd class="text-purple-400 font-mono text-lg">{{result.spells}}</dd>
              </div>
              <div>
                <dt class="text-slate-500">Other Entities</dt>
                <dd class="text-slate-400 font-mono text-lg">{{result.entities}}</dd>
              </div>
           </dl>
        </div>
        
        <div *ngIf="error" class="mt-8 p-4 bg-red-900/20 border border-red-800 rounded">
            <h3 class="text-red-400 font-bold mb-1">Error</h3>
            <p class="text-red-300 text-sm">{{error}}</p>
        </div>

      </div>
    </div>
  `
})
export class OglImportComponent {
  selectedFile: File | null = null;
  isUploading = false;
  result: any = null;
  error: string | null = null;

  constructor(private service: OglImportService) { }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0] || null;
    this.result = null;
    this.error = null;
  }

  upload() {
    if (!this.selectedFile) return;

    this.isUploading = true;
    this.error = null;
    this.result = null;

    this.service.uploadZip(this.selectedFile).subscribe({
      next: (res) => {
        this.result = res;
        this.isUploading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.error || err.message || 'Upload failed';
        this.isUploading = false;
      }
    });
  }
}
