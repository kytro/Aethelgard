import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { ModalService } from '../../shared/services/modal.service';

interface DocElement {
    type: string;
    text: string;
    style: any;
}

interface DocStructureHeader {
    title: string;
    docId: string;
    structure: DocElement[];
}

interface CodexPageDraft {
    name: string;
    type: 'page' | 'section';
    content: any[];
    path: string[];
    children: CodexPageDraft[];
}

@Component({
    selector: 'app-google-doc-import',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './google-doc-import.component.html',
    styles: [`
    .step-container { margin-bottom: 2rem; padding: 1rem; border: 1px solid #ccc; border-radius: 4px; }
    .heading-item { padding: 4px 8px; border-bottom: 1px solid #eee; display: flex; align-items: center; justify-content: space-between; }
    .preview-node { margin-left: 20px; border-left: 2px solid #ddd; padding-left: 10px; }
    .dropdown-list { max-height: 200px; overflow-y: auto; position: absolute; z-index: 10; width: 100%; background: white; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    .dropdown-item { padding: 8px; cursor: pointer; }
    .dropdown-item:hover { background-color: #f0f0f0; }
  `]
})
export class GoogleDocImportComponent implements OnInit {
    http = inject(HttpClient);
    modalService = inject(ModalService);

    // State
    step = signal<number>(1);
    isLoading = signal<boolean>(false);
    docIdInput = signal<string>('');

    // Fetched Data
    docStructure = signal<DocElement[]>([]);
    docTitle = signal<string>('');
    existingPaths = signal<string[]>([]);

    // Mapping
    mappingRules = signal<{ level: string }[]>([{ level: 'HEADING_1' }]);
    selectedParent = signal<string>('');
    pathSuffix = signal<string>('');

    // UI State
    showParentDropdown = signal<boolean>(false);

    // Computed
    filteredPaths = computed(() => {
        const query = this.selectedParent().toLowerCase();
        return this.existingPaths().filter(p => p.toLowerCase().includes(query)).slice(0, 50); // Limit results
    });

    // Preview
    previewPages = signal<CodexPageDraft[]>([]);

    constructor() { }

    ngOnInit() {
        this.fetchExistingPaths();
    }

    selectPath(path: string) {
        this.selectedParent.set(path);
        this.showParentDropdown.set(false);
    }

    onParentBlur() {
        // Delay hiding to allow click event to register
        setTimeout(() => {
            this.showParentDropdown.set(false);
        }, 200);
    }

    addMappingRule() {
        this.mappingRules.update(rules => [...rules, { level: 'HEADING_2' }]);
    }

    removeMappingRule(index: number) {
        this.mappingRules.update(rules => rules.filter((_, i) => i !== index));
    }

    async fetchExistingPaths() {
        try {
            const data: any[] = await lastValueFrom(this.http.get<any[]>('api/codex/data'));
            this.existingPaths.set(this.extractPaths(data));
        } catch (e) {
            console.error('Failed to load existing paths', e);
        }
    }

    extractPaths(nodes: any[], prefix: string = ''): string[] {
        let paths: string[] = [];
        if (!nodes) return paths;

        for (const node of nodes) {
            const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
            paths.push(currentPath);
            if (node.children && Array.isArray(node.children)) {
                paths = paths.concat(this.extractPaths(node.children, currentPath));
            }
        }
        return paths.sort();
    }

    async fetchDoc() {
        // Regex defaults to catching ID between /d/ and /
        const docId = this.docIdInput().match(/\/d\/([-\w]{25,})/)?.[1] || this.docIdInput().match(/([-\w]{25,})/)?.[0];

        if (!docId) {
            this.modalService.alert('Invalid Link', 'Could not parse Document ID from link.');
            return;
        }

        this.isLoading.set(true);
        try {
            const res = await lastValueFrom(this.http.get<DocStructureHeader>(`api/google-docs/fetch/${docId}`));

            this.docTitle.set(res.title);
            this.docStructure.set(res.structure);
            this.step.set(2);
        } catch (err: any) {
            console.error(err);
            this.modalService.alert('Fetch Error', err.error?.error || 'Failed to fetch document. Is it Public?');
        } finally {
            this.isLoading.set(false);
        }
    }

    getHeadingLevel(type: string): number {
        if (type.startsWith('HEADING_')) {
            return parseInt(type.split('_')[1], 10);
        }
        return 999;
    }

    isMapped(type: string): boolean {
        return this.mappingRules().some(r => r.level === type);
    }

    generatePreview() {
        const structure = this.docStructure();
        const rules = this.mappingRules();

        const pages: CodexPageDraft[] = [];
        let currentPage: CodexPageDraft | null = null;

        // Stack to track path components from mapped levels
        let docPathStack: { level: number, text: string }[] = [];

        const prefixComponents = [
            ...(this.selectedParent() ? this.selectedParent().split('/') : []),
            ...(this.pathSuffix() ? this.pathSuffix().split('/').filter(p => !!p) : [])
        ];

        for (const el of structure) {
            const currentLevel = this.getHeadingLevel(el.type);
            const isMapped = rules.some(r => r.level === el.type);

            if (isMapped) {
                // Update Stack: Pop anything deeper or equal to current level
                // Standard hierarchy: H2 is under H1. H1 replaces previous H1.
                docPathStack = docPathStack.filter(item => item.level < currentLevel);

                // Construct path for THIS page (it sits under the current stack)
                const pathFromStack = docPathStack.map(i => i.text);

                currentPage = {
                    name: el.text,
                    type: 'page',
                    content: [],  // Content will accumulate here
                    path: [...prefixComponents, ...pathFromStack, el.text], // Full Path including self
                    children: []
                };
                pages.push(currentPage);

                // Push THIS page to stack so children can nest under it
                docPathStack.push({ level: currentLevel, text: el.text });
            } else {
                // Content
                if (currentPage) {
                    currentPage.content.push({ type: 'paragraph', text: el.text, style: el.type });
                }
            }
        }

        this.previewPages.set(pages);
        this.step.set(3);
    }

    discardPage(index: number) {
        this.previewPages.update(pages => pages.filter((_, i) => i !== index));
    }

    async saveImport() {
        if (this.previewPages().length === 0) return;
        if (!await this.modalService.confirm('Import', `Import ${this.previewPages().length} pages into Codex?`)) return;

        this.isLoading.set(true);
        try {
            // 1. Fetch current Codex Data
            const currentData = await lastValueFrom(this.http.get<any[]>('api/codex/data')) || [];

            // 2. Merge pages
            let updatedData = JSON.parse(JSON.stringify(currentData)); // Deep copy

            // Helper to find or create node at path
            const findOrCreateNode = (nodes: any[], pathStack: string[]): any => {
                if (pathStack.length === 0) return nodes;

                const part = pathStack[0];
                let existingNode = nodes.find(n => n.name === part);

                if (!existingNode) {
                    existingNode = {
                        name: part,
                        type: 'page', // Default container type
                        content: [],
                        path_components: [], // Should be filled if we were strict, but we let backend/frontend handle it?
                        // Actually, we usually don't need path_components in the tree data itself if it's implicit
                        children: []
                    };
                    nodes.push(existingNode);
                }

                if (!existingNode.children) existingNode.children = [];

                if (pathStack.length === 1) {
                    return existingNode;
                }

                return findOrCreateNode(existingNode.children, pathStack.slice(1));
            };

            // If we have a selected parent/suffix, we need to graft our pages there
            const parentPathStr = [
                ...(this.selectedParent() ? this.selectedParent().split('/') : []),
                ...(this.pathSuffix() ? this.pathSuffix().split('/').filter(p => !!p) : [])
            ].join('/');

            // For each preview page, we attach it to the tree
            for (const page of this.previewPages()) {
                const destPathParts = page.path.slice(0, -1); // Parent path components
                // e.g. ['World', 'Locations']

                // Find the parent array to push to
                // If destPathParts is empty, we push to root (updatedData)
                // If not empty, we traverse
                let targetChildren: any[] = updatedData;

                if (destPathParts.length > 0) {
                    // Find the parent node
                    // However, `findOrCreateNode` above returns a Node, not an array.
                    // Let's adjust helper or logic.
                    // We need to find the *node* that represents the last part of destPathParts
                    // And then access its .children

                    // Let's do iterative traversal
                    let currentLevel = updatedData;
                    for (const part of destPathParts) {
                        let node = currentLevel.find((n: any) => n.name === part);
                        if (!node) {
                            node = { name: part, type: 'page', content: [], children: [] };
                            currentLevel.push(node);
                        }
                        if (!node.children) node.children = [];
                        currentLevel = node.children;
                    }
                    targetChildren = currentLevel;
                }

                // Now push the page (avoid duplicate names?)
                // If page with same name exists, we append content or skip?
                // Let's just push for now, or maybe uniquify name
                targetChildren.push(page);
            }

            // 3. Save back
            await lastValueFrom(this.http.put('api/codex/data', updatedData));

            this.modalService.alert('Success', 'Pages imported successfully!');
            this.reset();
        } catch (err) {
            console.error(err);
            this.modalService.alert('Error', 'Failed to save imported pages.');
        } finally {
            this.isLoading.set(false);
        }
    }

    reset() {
        this.step.set(1);
        this.docStructure.set([]);
        this.previewPages.set([]);
        this.docIdInput.set('');
        // Keep selected parent/suffix? Maybe reset them too?
        // this.selectedParent.set(''); 
        // this.pathSuffix.set('');
    }
}
