import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GoogleDocImportComponent, ImportNode } from './google-doc-import.component';
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
        expect(roots[0].pathString).toBe('Chapter_1');
        expect(roots[0].children.length).toBe(1); // Section A

        const child = roots[0].children[0];
        expect(child.text).toBe('Section A');
        expect(child.pathString).toBe('Chapter_1/Section_A'); // Default path
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

    // Moved inside main suite
    describe('Preview Generation (Step 3)', () => {
        it('should detect bold starts and convert to headings', () => {
            const rootNode: ImportNode = {
                id: 'root', text: 'Root', level: 0, content: [], children: [],
                isPage: true, isExcluded: false, pathString: 'Root', isManual: false, expanded: true
            };

            // Simulating content that comes from the parser
            rootNode.content = [
                { type: 'paragraph', text: 'Normal text' },
                { type: 'paragraph', text: '<b>Bold Title:</b> Description follows.' },
                { type: 'paragraph', text: '<strong>Strong Title</strong>' }
            ];

            component.rootNodes.set([rootNode]);
            component.existingPaths.set([]);

            component.generatePreview();

            const drafts = component.previewPages();
            expect(drafts.length).toBe(1);
            const content = drafts[0].content;

            expect(content.length).toBe(4); // Normal, Title (H), Description (P), Strong Title (H)

            expect(content[0].type).toBe('paragraph');
            expect(content[0].text).toBe('Normal text');

            // Split 1
            expect(content[1].type).toBe('heading');
            expect(content[1].text).toBe('Bold Title'); // Colon removed

            expect(content[2].type).toBe('paragraph');
            expect(content[2].text).toBe('Description follows.');

            // Split 2
            expect(content[3].type).toBe('heading');
            expect(content[3].text).toBe('Strong Title');
        });

        it('should exclude blocks from saved data', async () => {
            const rootNode: ImportNode = {
                id: 'root', text: 'Root', level: 0, content: [{ type: 'paragraph', text: 'To be excluded' }], children: [],
                isPage: true, isExcluded: false, pathString: 'Root', isManual: false, expanded: true
            };
            component.rootNodes.set([rootNode]);
            component.generatePreview();

            // Manually exclude the block
            const block = component.previewPages()[0].content[0];
            component.toggleBlockExclusion(block);
            expect(block.isExcluded).toBe(true);

            // Save
            const putSpy = jest.spyOn(component.http, 'put').mockReturnValue(Promise.resolve({}) as any);
            await component.saveImport();

            const savedPayload = putSpy.mock.calls[0][1] as any[];
            expect(savedPayload[0].content.length).toBe(0);
        });
        it('should add non-page items as paragraphs (not headings) to parent page', () => {
            const rootNode: ImportNode = {
                id: 'root', text: 'Page Title', level: 1, content: [], children: [],
                isPage: true, isExcluded: false, pathString: 'PageTitle', isManual: false, expanded: true
            };

            // Child node that is NOT a page (e.g. just a list item acting as content)
            const contentNode: ImportNode = {
                id: 'c1', text: 'Some content item', level: 2, content: [], children: [],
                isPage: false, isExcluded: false, pathString: 'PageTitle/Content', isManual: false, expanded: true
            };

            rootNode.children.push(contentNode);

            component.rootNodes.set([rootNode]);
            component.generatePreview();

            const drafts = component.previewPages();
            expect(drafts.length).toBe(1);

            const page = drafts[0];
            expect(page.content.length).toBe(1);

            // THE CRITICAL CHECK: Type should be 'paragraph', not 'heading'
            expect(page.content[0].text).toBe('Some content item');
            expect(page.content[0].type).toBe('paragraph');
        });
    });
});
