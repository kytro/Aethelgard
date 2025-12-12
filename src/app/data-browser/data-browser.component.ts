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
  styleUrls: ['./data-browser.component.css'],
  styles: [`
    :host {
      display: block;
      height: 100%;
    }
  `]
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

  // Edit state
  editingDocument = signal<any | null>(null);
  editedJson = signal<string>('');

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
    this.cancelEdit(); // Ensure we're not in edit mode when selecting a new doc
  }

  backToCollections() {
    this.selectedCollection.set(null);
    this.documents.set([]);
    this.selectedDocument.set(null);
    this.filterTerm.set('');
    this.cancelEdit();
  }

  // --- Edit Logic ---
  editDocument(doc: any, event: MouseEvent) {
    event.stopPropagation();
    this.editingDocument.set(JSON.parse(JSON.stringify(doc))); // Deep copy for editing
    this.editedJson.set(JSON.stringify(doc, null, 2));
    this.selectedDocument.set(doc); // Also select the document to show the edit view
  }

  cancelEdit() {
    this.editingDocument.set(null);
    this.editedJson.set('');
    // We don't reset selectedDocument here, so the user can go back to the read-only view
  }

  async saveDocument() {
    const collectionName = this.selectedCollection();
    const docToSave = this.editingDocument();
    if (!collectionName || !docToSave) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const updatedDoc = JSON.parse(this.editedJson());
      const originalId = docToSave._id;
      const newId = updatedDoc._id;

      if (newId !== originalId) {
        // ID changed: Treat as Rename (Create New + Delete Old)

        // 1. Create New
        await lastValueFrom(this.http.post<{ message: string, insertedId: string }>(
          `api/admin/collections/${collectionName}`,
          updatedDoc
        ));

        // 2. Delete Old
        await lastValueFrom(this.http.delete(`api/admin/collections/${collectionName}/${originalId}`));

        // 3. Update Local State: Remove old, Add new
        this.documents.update(docs => {
          const filetered = docs.filter(d => d._id !== originalId);
          return [...filetered, updatedDoc];
        });

        this.selectDocument(updatedDoc); // Select the new doc
        this.cancelEdit();

      } else {
        // ID unchanged: Standard Update
        await lastValueFrom(this.http.put(`api/admin/collections/${collectionName}/${originalId}`, updatedDoc));

        // Update local state
        this.documents.update(docs => docs.map(d => d._id === originalId ? updatedDoc : d));
        this.selectDocument(updatedDoc); // Reselect the doc to show the updated, non-edit view
        this.cancelEdit(); // Exit edit mode
      }

    } catch (err: any) {
      if (err instanceof SyntaxError) {
        this.error.set('Invalid JSON format.');
      } else {
        this.error.set(err.error?.error || `Failed to save document. ${err.message || ''}`);
      }
    } finally {
      this.isLoading.set(false);
    }
  }


  // --- Create Logic ---
  isCreating = signal<boolean>(false);
  newDocumentJson = signal<string>('');

  startNewDocument() {
    this.isCreating.set(true);
    this.newDocumentJson.set('{\n  "name": "New Document"\n}');
  }

  cancelNewDocument() {
    this.isCreating.set(false);
    this.newDocumentJson.set('');
  }

  async createDocument() {
    const collectionName = this.selectedCollection();
    if (!collectionName) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const newDoc = JSON.parse(this.newDocumentJson());

      const res = await lastValueFrom(this.http.post<{ message: string, insertedId: string }>(
        `api/admin/collections/${collectionName}`,
        newDoc
      ));

      // If the backend returned an insertedId, make sure the local doc has it
      if (res.insertedId) {
        newDoc._id = res.insertedId;
      }

      // Update local state
      this.documents.update(docs => [...docs, newDoc]);
      this.isCreating.set(false);

      // Optionally select the new doc
      this.selectDocument(newDoc);

    } catch (err: any) {
      if (err instanceof SyntaxError) {
        this.error.set('Invalid JSON format.');
      } else {
        this.error.set(err.error?.error || 'Failed to create document.');
      }
    } finally {
      this.isLoading.set(false);
    }
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