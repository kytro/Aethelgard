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
});