import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GoogleDocImportComponent } from './google-doc-import.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ModalService } from '../../shared/services/modal.service';
import { provideZonelessChangeDetection } from '@angular/core';

describe('GoogleDocImportComponent', () => {
    let component: GoogleDocImportComponent;
    let fixture: ComponentFixture<GoogleDocImportComponent>;
    let httpMock: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [GoogleDocImportComponent, HttpClientTestingModule],
            providers: [
                ModalService,
                provideZonelessChangeDetection()
            ]
        })
            .compileComponents();

        fixture = TestBed.createComponent(GoogleDocImportComponent);
        component = fixture.componentInstance;
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should create and fetch existing paths', async () => {
        fixture.detectChanges();
        const req = httpMock.expectOne('api/codex/data');
        req.flush([
            { name: 'Locations', path_components: ['World', 'Locations'] }
        ]);
        await fixture.whenStable();
        expect(component.existingPaths()).toContain('World/Locations');
    });

    it('should build tree from flat doc structure', async () => {
        fixture.detectChanges();
        httpMock.expectOne('api/codex/data').flush([]);

        const mockStructure = [
            { type: 'HEADING_1', text: 'Chapter 1', style: {} },
            { type: 'NORMAL_TEXT', text: 'Intro', style: {} },
            { type: 'HEADING_2', text: 'Section A', style: {} }
        ];

        component.docIdInput.set('https://docs.google.com/document/d/1234567890123456789012345/edit');
        component.fetchDoc();

        const req = httpMock.expectOne('api/google-docs/fetch/1234567890123456789012345');
        req.flush({ title: 'Test Doc', structure: mockStructure });
        await fixture.whenStable();

        const roots = component.rootNodes();
        expect(roots.length).toBe(1); // One root: Chapter 1
        expect(roots[0].text).toBe('Chapter 1');
        expect(roots[0].pathString).toBe('Chapter 1');
        expect(roots[0].children.length).toBe(1); // Section A

        const child = roots[0].children[0];
        expect(child.text).toBe('Section A');
        expect(child.pathString).toBe('Chapter 1/Section A'); // Default path
    });

    it('should update child paths when parent path changes (unless manual)', async () => {
        fixture.detectChanges();
        httpMock.expectOne('api/codex/data').flush([]);

        // Setup tree manually to skip fetch
        // Root -> Child -> Grandchild
        const grandchild = { id: '3', text: 'GC', level: 3, content: [], children: [], isPage: true, pathString: 'Root/Child/GC', isManual: false, expanded: true, isExcluded: false };
        const child = { id: '2', text: 'Child', level: 2, content: [], children: [grandchild], isPage: true, pathString: 'Root/Child', isManual: false, expanded: true, isExcluded: false };
        const root = { id: '1', text: 'Root', level: 1, content: [], children: [child], isPage: true, pathString: 'Root', isManual: false, expanded: true, isExcluded: false };

        component.rootNodes.set([root]);

        // Change Root path
        component.onPathChange(root, 'NewRoot');

        expect(root.pathString).toBe('NewRoot');
        expect(child.pathString).toBe('NewRoot/Child');
        expect(grandchild.pathString).toBe('NewRoot/Child/GC');
    });

    it('should NOT update child path if child is manual', async () => {
        fixture.detectChanges();
        httpMock.expectOne('api/codex/data').flush([]);

        const child = { id: '2', text: 'Child', level: 2, content: [], children: [], isPage: true, pathString: 'Root/Child', isManual: true, expanded: true, isExcluded: false };
        const root = { id: '1', text: 'Root', level: 1, content: [], children: [child], isPage: true, pathString: 'Root', isManual: false, expanded: true, isExcluded: false };

        component.rootNodes.set([root]);

        // Change Root path
        component.onPathChange(root, 'NewRoot');

        expect(root.pathString).toBe('NewRoot');
        expect(child.pathString).toBe('Root/Child'); // Should not change
    });

    it('should propagate path updates even if parent is NOT a page', async () => {
        fixture.detectChanges();
        httpMock.expectOne('api/codex/data').flush([]);

        // Root is NOT a page, but has a custom path set acting as a folder/base
        const child = { id: '2', text: 'Child', level: 2, content: [], children: [], isPage: true, pathString: 'OriginalRoot/Child', isManual: false, expanded: true, isExcluded: false };
        const root = { id: '1', text: 'Root', level: 1, content: [], children: [child], isPage: false, pathString: 'OriginalRoot', isManual: false, expanded: true, isExcluded: false };

        component.rootNodes.set([root]);

        // Change Root path (e.g. user sets a specific folder for this section)
        component.onPathChange(root, 'NewBaseFolder');

        expect(root.pathString).toBe('NewBaseFolder');
        expect(child.pathString).toBe('NewBaseFolder/Child');
    });

    it('should correctly identify NEW vs EXISTING pages in preview', async () => {
        fixture.detectChanges();
        // Setup existing paths
        httpMock.expectOne('api/codex/data').flush([
            { name: 'ExistingPage', path_components: ['ExistingPage'] }
        ]);
        await fixture.whenStable();

        // Setup tree: One existing, one new
        const nodeExisting = { id: '1', text: 'ExistingPage', level: 1, content: [], children: [], isPage: true, pathString: 'ExistingPage', isManual: false, expanded: true, isExcluded: false };
        const nodeNew = { id: '2', text: 'NewPage', level: 1, content: [], children: [], isPage: true, pathString: 'NewPage', isManual: false, expanded: true, isExcluded: false };

        component.rootNodes.set([nodeExisting, nodeNew]);

        // Generate Preview
        component.generatePreview();

        const drafts = component.previewPages();
        expect(drafts.length).toBe(2);

        const existingDraft = drafts.find(d => d.name === 'ExistingPage');
        const newDraft = drafts.find(d => d.name === 'NewPage');

        expect(existingDraft?.isNew).toBe(false); // Should be existing
        expect(newDraft?.isNew).toBe(true);  // Should be new
    });
});
