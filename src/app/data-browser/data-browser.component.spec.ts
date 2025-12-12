import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataBrowserComponent } from './data-browser.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';

describe('DataBrowserComponent', () => {
    let component: DataBrowserComponent;
    let fixture: ComponentFixture<DataBrowserComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [DataBrowserComponent, HttpClientTestingModule],
            providers: [provideZonelessChangeDetection()]
        }).compileComponents();

        fixture = TestBed.createComponent(DataBrowserComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);

        // loadCollections is called in constructor
        const req = httpMock.expectOne('api/admin/collections');
        req.flush(['col1', 'col2']);

        fixture.detectChanges();
        await fixture.whenStable();
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should load collections on init', () => {
        expect(component.collections()).toEqual(['col1', 'col2']);
    });

    it('should select collection and load docs', async () => {
        component.selectCollection('col1');

        const req = httpMock.expectOne('api/admin/collections/col1');
        expect(req.request.method).toBe('GET');
        req.flush([{ _id: 'doc1', name: 'Test Doc' }]);

        await fixture.whenStable();

        expect(component.selectedCollection()).toBe('col1');
        expect(component.documents().length).toBe(1);
    });

    it('should filter documents', () => {
        component.documents.set([
            { _id: '1', name: 'Alpha' },
            { _id: '2', name: 'Beta' }
        ]);

        component.filterTerm.set('al');
        expect(component.filteredDocuments().length).toBe(1);
        expect(component.filteredDocuments()[0].name).toBe('Alpha');
    });

    it('should edit and save document', async () => {
        component.selectedCollection.set('col1');
        const doc = { _id: 'doc1', name: 'Original' };
        component.documents.set([doc]);

        component.editDocument(doc, new MouseEvent('click'));
        expect(component.editingDocument()).toEqual(doc);

        // Simulate change
        const edited = { ...doc, name: 'Updated' };
        component.editedJson.set(JSON.stringify(edited));

        component.saveDocument();

        const req = httpMock.expectOne('api/admin/collections/col1/doc1');
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual(edited);
        req.flush({});

        await fixture.whenStable();

        expect(component.documents()[0].name).toBe('Updated');
        expect(component.editingDocument()).toBeNull();
    });

    it('should handle document rename (change _id): POST new then DELETE old', async () => {
        component.selectedCollection.set('col1');
        const doc = { _id: 'old-id', name: 'Original' };
        component.documents.set([doc]);

        component.editDocument(doc, new MouseEvent('click'));

        // Simulate change of _id
        const renamed = { _id: 'new-id', name: 'Renamed' };
        component.editedJson.set(JSON.stringify(renamed));

        component.saveDocument();

        // 1. Should call POST with new doc
        const postReq = httpMock.expectOne('api/admin/collections/col1');
        expect(postReq.request.method).toBe('POST');
        expect(postReq.request.body).toEqual(renamed);
        postReq.flush({ message: 'Created', insertedId: 'new-id' });

        await fixture.whenStable();

        // 2. Should call DELETE with old ID
        const delReq = httpMock.expectOne('api/admin/collections/col1/old-id');
        expect(delReq.request.method).toBe('DELETE');
        delReq.flush({});

        await fixture.whenStable();

        // Verify local state
        const docs = component.documents();
        expect(docs.length).toBe(1);
        expect(docs[0]._id).toBe('new-id');
        expect(docs[0].name).toBe('Renamed');
        expect(component.editingDocument()).toBeNull();
    });

    it('should handle updates where ID is a string but looks like ObjectId (backend fallback test)', async () => {
        // This test primarily checks frontend behavior mimics backend needs: keeping ID consistent
        component.selectedCollection.set('col1');
        // Use a valid hex string that is NOT an ObjectId in the "DB" (mocked behavior)
        const stringId = '677e3f3b9a2d4b76f0cde1a1';
        const doc = { _id: stringId, name: 'StringID Doc' };
        component.documents.set([doc]);

        component.editDocument(doc, new MouseEvent('click'));

        const updated = { ...doc, name: 'Updated Name' };
        component.editedJson.set(JSON.stringify(updated));

        component.saveDocument();

        // Should call PUT with the string ID
        const req = httpMock.expectOne(`api/admin/collections/col1/${stringId}`);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual(updated);
        req.flush({});

        await fixture.whenStable();

        expect(component.documents()[0].name).toBe('Updated Name');
    });

    it('should delete collection with confirmation', async () => {
        // First click - confirm
        component.deleteCollection('col1', new MouseEvent('click'));
        expect(component.confirmingDeleteCollection()).toBe('col1');
        // Request should NOT happen yet
        httpMock.expectNone('api/admin/collections/col1');

        // Second click - action
        component.deleteCollection('col1', new MouseEvent('click'));

        const req = httpMock.expectOne('api/admin/collections/col1');
        expect(req.request.method).toBe('DELETE');
        req.flush({});

        await fixture.whenStable();
        expect(component.collections()).not.toContain('col1');
    });

    it('should create new document', async () => {
        component.selectedCollection.set('col1');
        component.startNewDocument();
        expect(component.isCreating()).toBe(true);
        expect(component.newDocumentJson()).toContain('New Document');

        const newDocJson = { name: 'Brand New Doc' };
        component.newDocumentJson.set(JSON.stringify(newDocJson));

        component.createDocument();

        const req = httpMock.expectOne('api/admin/collections/col1');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(newDocJson);
        req.flush({ message: 'Created', insertedId: 'new-id-123' });

        await fixture.whenStable();

        expect(component.isCreating()).toBe(false);
        expect(component.documents().length).toBe(1);
        expect(component.documents()[0]._id).toBe('new-id-123');
        expect(component.documents()[0].name).toBe('Brand New Doc');
    });
});