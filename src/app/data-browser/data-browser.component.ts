import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-data-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './data-browser.component.html',
  styleUrls: ['./data-browser.component.css']
})
export class DataBrowserComponent {
  http = inject(HttpClient);

  collections = signal<string[]>([]);
  selectedCollection = signal<string | null>(null);
  documents = signal<any[]>([]);
  selectedDocument = signal<any | null>(null);
  filterTerm = signal<string>('');
  error = signal<string | null>(null);
  isLoading = signal<boolean>(false);

  // Confirmation state for deletions
  confirmingDeleteCollection = signal<string | null>(null);
  confirmingDeleteDoc = signal<string | null>(null);

  filteredDocuments = computed(() => {
    const term = this.filterTerm().toLowerCase();
    if (!term) {
      return this.documents();
    }
    return this.documents().filter(doc => {
      const docId = doc._id?.toString().toLowerCase() || '';
      const docName = doc.name?.toString().toLowerCase() || '';
      return docId.includes(term) || docName.includes(term);
    });
  });

  constructor() {
    this.loadCollections();
  }

  async loadCollections() {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const collections = await lastValueFrom(this.http.get<string[]>('api/admin/collections'));
      this.collections.set(collections);
    } catch (err: any) {
      this.error.set(err.error?.error || 'Failed to load collections.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async selectCollection(name: string) {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    this.selectedCollection.set(name);
    this.selectedDocument.set(null);
    this.filterTerm.set('');
    this.error.set(null);
    try {
      const docs = await lastValueFrom(this.http.get<any[]>(`api/admin/collections/${name}`));
      this.documents.set(docs);
    } catch (err: any) {
      this.error.set(err.error?.error || `Failed to load documents for ${name}.`);
    } finally {
      this.isLoading.set(false);
    }
  }

  selectDocument(doc: any) {
    this.selectedDocument.set(doc);
  }

  backToCollections() {
    this.selectedCollection.set(null);
    this.documents.set([]);
    this.selectedDocument.set(null);
    this.filterTerm.set('');
  }
  
  // --- New Helper Function ---
  // This safely converts the selected document object to a formatted JSON string for display.
  objectToJson(obj: any): string {
    if (obj === null) return '';
    return JSON.stringify(obj, null, 2);
  }

  // --- Deletion Logic ---

  requestDeleteCollection(name: string, event: MouseEvent) {
    event.stopPropagation();
    this.confirmingDeleteCollection.set(name);
    setTimeout(() => {
      if (this.confirmingDeleteCollection() === name) {
        this.confirmingDeleteCollection.set(null);
      }
    }, 3000);
  }
  
  async deleteCollection(name: string, event: MouseEvent) {
    event.stopPropagation();
    if (this.confirmingDeleteCollection() !== name) {
      this.requestDeleteCollection(name, event);
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    try {
      await lastValueFrom(this.http.delete(`api/admin/collections/${name}`));
      this.collections.update(c => c.filter(col => col !== name));
      if (this.selectedCollection() === name) {
        this.backToCollections();
      }
    } catch (err: any) {
      this.error.set(err.error?.error || `Failed to delete collection ${name}.`);
    } finally {
      this.isLoading.set(false);
      this.confirmingDeleteCollection.set(null);
    }
  }

  requestDeleteDocument(docId: string, event: MouseEvent) {
    event.stopPropagation();
    this.confirmingDeleteDoc.set(docId);
     setTimeout(() => {
      if (this.confirmingDeleteDoc() === docId) {
        this.confirmingDeleteDoc.set(null);
      }
    }, 3000);
  }

  async deleteDocument(docId: string, event: MouseEvent) {
    event.stopPropagation();
     if (this.confirmingDeleteDoc() !== docId) {
      this.requestDeleteDocument(docId, event);
      return;
    }
    
    const collectionName = this.selectedCollection();
    if (!collectionName) return;

    this.isLoading.set(true);
    this.error.set(null);
    try {
      await lastValueFrom(this.http.delete(`api/admin/collections/${collectionName}/${docId}`));
      this.documents.update(docs => docs.filter(d => d._id !== docId));
      if (this.selectedDocument()?._id === docId) {
        this.selectedDocument.set(null);
      }
    } catch (err: any) {
      this.error.set(err.error?.error || `Failed to delete document ${docId}.`);
    } finally {
      this.isLoading.set(false);
      this.confirmingDeleteDoc.set(null);
    }
  }
}

