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
            { name: 'World', children: [{ name: 'Locations' }] }
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
        const grandchild = { id: '3', text: 'GC', level: 3, content: [], children: [], isPage: true, pathString: 'Root/Child/GC', isManual: false, expanded: true };
        const child = { id: '2', text: 'Child', level: 2, content: [], children: [grandchild], isPage: true, pathString: 'Root/Child', isManual: false, expanded: true };
        const root = { id: '1', text: 'Root', level: 1, content: [], children: [child], isPage: true, pathString: 'Root', isManual: false, expanded: true };

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

        const child = { id: '2', text: 'Child', level: 2, content: [], children: [], isPage: true, pathString: 'Root/Child', isManual: true, expanded: true };
        const root = { id: '1', text: 'Root', level: 1, content: [], children: [child], isPage: true, pathString: 'Root', isManual: false, expanded: true };

        component.rootNodes.set([root]);

        // Change Root path
        component.onPathChange(root, 'NewRoot');

        expect(root.pathString).toBe('NewRoot');
        expect(child.pathString).toBe('Root/Child'); // Should not change
    });
});
