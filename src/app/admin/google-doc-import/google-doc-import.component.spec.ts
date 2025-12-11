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
        // fixture.detectChanges(); // Removed to allow tests to handle ngOnInit
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should create', () => {
        fixture.detectChanges();
        httpMock.expectOne('api/codex/data').flush([]);
        expect(component).toBeTruthy();
    });

    it('should fetch existing paths on init', async () => {
        fixture.detectChanges();
        const req = httpMock.expectOne('api/codex/data');
        req.flush([
            { name: 'World', children: [{ name: 'Locations' }] },
            { name: 'Rules' }
        ]);

        await fixture.whenStable();

        expect(component.existingPaths()).toContain('World/Locations');
        expect(component.existingPaths()).toContain('Rules');
    });

    it('filteredPaths should return matches based on selectedParent', () => {
        component.existingPaths.set(['World', 'World/Locations', 'Rules', 'Heroes']);

        component.selectedParent.set('wor');
        expect(component.filteredPaths()).toEqual(['World', 'World/Locations']);

        component.selectedParent.set('loc');
        expect(component.filteredPaths()).toEqual(['World/Locations']);

        component.selectedParent.set('z');
        expect(component.filteredPaths()).toEqual([]);
    });

    it('fetchDoc should call API with doc ID', async () => {
        fixture.detectChanges();
        httpMock.expectOne('api/codex/data').flush([]);

        component.docIdInput.set('https://docs.google.com/document/d/1234567890123456789012345/edit');
        component.fetchDoc();

        const req = httpMock.expectOne('api/google-docs/fetch/1234567890123456789012345');
        expect(req.request.method).toBe('GET');
        req.flush({ title: 'Test Doc', structure: [] });

        await fixture.whenStable();

        expect(component.step()).toBe(2);
        expect(component.docTitle()).toBe('Test Doc');
    });

    it('preview generation should respect parent and suffix paths', () => {
        fixture.detectChanges();
        httpMock.expectOne('api/codex/data').flush([]);

        const mockStructure = [
            { type: 'HEADING_1', text: 'Page 1', style: {} }
        ];

        component.docStructure.set(mockStructure);
        component.mappingRules.set([{ level: 'HEADING_1' }]);
        component.selectedParent.set('World');
        component.pathSuffix.set('New/Zone');

        component.generatePreview();

        const pages = component.previewPages();
        expect(pages[0].path).toEqual(['World', 'New', 'Zone', 'Page 1']);
    });

    it('preview generation should handle hierarchical mapping (H1 and H2 both pages)', () => {
        fixture.detectChanges();
        httpMock.expectOne('api/codex/data').flush([]);

        const mockStructure = [
            { type: 'HEADING_1', text: 'Chapter 1', style: {} },
            { type: 'NORMAL_TEXT', text: 'Intro', style: {} },
            { type: 'HEADING_2', text: 'Section A', style: {} },
            { type: 'NORMAL_TEXT', text: 'Detail', style: {} }
        ];

        component.docStructure.set(mockStructure);
        // Map H1 and H2. Both should be pages. H2 nested under H1.
        component.mappingRules.set([
            { level: 'HEADING_1' },
            { level: 'HEADING_2' }
        ]);
        component.generatePreview();

        const pages = component.previewPages();
        expect(pages.length).toBe(2);

        // Page 1: Chapter 1
        expect(pages[0].name).toBe('Chapter 1');
        expect(pages[0].path).toEqual(['Chapter 1']);
        expect(pages[0].content.length).toBe(1);
        expect(pages[0].content[0].text).toBe('Intro');

        // Page 2: Section A
        expect(pages[1].name).toBe('Section A');
        expect(pages[1].path).toEqual(['Chapter 1', 'Section A']);
        expect(pages[1].content.length).toBe(1);
        expect(pages[1].content[0].text).toBe('Detail');
    });

    it('should discard page from preview', () => {
        fixture.detectChanges();
        httpMock.expectOne('api/codex/data').flush([]);

        component.previewPages.set([
            { name: 'P1', type: 'page', content: [], path: [], children: [] },
            { name: 'P2', type: 'page', content: [], path: [], children: [] }
        ]);

        component.discardPage(0);

        expect(component.previewPages().length).toBe(1);
        expect(component.previewPages()[0].name).toBe('P2');
    });
});
