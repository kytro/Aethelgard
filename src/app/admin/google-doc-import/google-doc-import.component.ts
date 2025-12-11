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

export interface ImportNode {
    id: string;
    text: string;
    level: number; // 1-6 for Headings, 999 for root context
    content: any[];
    children: ImportNode[];

    // Mapping configuration
    isPage: boolean;        // If true, this node becomes a codex entry
    isExcluded: boolean;    // If true, skip this node and children
    pathString: string;     // Editable path string
    isManual: boolean;      // If true, path doesn't auto-update when parent changes

    // UI
    expanded: boolean;
    isNew?: boolean;
}

export interface PageContentBlock {
    type: 'heading' | 'paragraph' | 'table';
    text?: string;
    title?: string;
    headers?: string[];
    rows?: any[];
    style?: string;
    html?: string;
    isExcluded?: boolean; // NEW
}

export interface CodexPageDraft {
    name: string;
    path_components: string[];
    content: PageContentBlock[];
    type: 'page';
    isNew: boolean;
}

// ... existing code ...

// --- Preview Generation (Step 2 -> 3) ---


@Component({
    selector: 'app-google-doc-import',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './google-doc-import.component.html',
    styles: [`
    .step-container { margin-bottom: 2rem; padding: 1rem; border: 1px solid #374151; border-radius: 0.5rem; background-color: #1f2937; }
    .tree-node { border-left: 1px solid #4b5563; margin-left: 1rem; padding-left: 0.5rem; position: relative; }
    .tree-node::before { content: ''; position: absolute; top: 1rem; left: -1px; width: 0.5rem; height: 1px; background-color: #4b5563; }
    .dropdown-list { max-height: 200px; overflow-y: auto; position: absolute; z-index: 50; width: 100%; background: #1f2937; border: 1px solid #4b5563; border-radius: 0.25rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .dropdown-item { padding: 0.5rem; cursor: pointer; color: #d1d5db; }
    .dropdown-item:hover { background-color: #374151; color: white; }
    .excluded-node { opacity: 0.5; }
  `]
})
export class GoogleDocImportComponent implements OnInit {
    http = inject(HttpClient);
    modalService = inject(ModalService);

    // State
    step = signal<number>(1);
    isLoading = signal<boolean>(false);
    docIdInput = signal<string>('');

    // Data
    docTitle = signal<string>('');
    existingPaths = signal<string[]>([]);

    // The Tree
    rootNodes = signal<ImportNode[]>([]);

    // Preview Data (Step 3)
    previewPages = signal<CodexPageDraft[]>([]);

    // Search/Autocomplete State
    activeNodeId = signal<string | null>(null);
    filteredPaths = signal<string[]>([]);

    constructor() { }

    ngOnInit() {
        this.fetchExistingPaths();
    }

    async fetchExistingPaths() {
        try {
            const data: any[] = await lastValueFrom(this.http.get<any[]>('api/codex/data'));
            this.existingPaths.set(this.extractPaths(data));
        } catch (e) {
            console.error('Failed to load existing paths', e);
        }
    }

    extractPaths(entries: any[]): string[] {
        if (!entries || !Array.isArray(entries)) return [];

        return entries
            .map(entry => {
                if (Array.isArray(entry.path_components) && entry.path_components.length > 0) {
                    return entry.path_components.join('/');
                }
                return entry.name || '';
            })
            .filter(p => !!p)
            .sort();
    }

    async fetchDoc() {
        // Simple regex to extract ID
        const docId = this.docIdInput().match(/\/d\/([-\w]{25,})/)?.[1] || this.docIdInput().match(/([-\w]{25,})/)?.[0];

        if (!docId) {
            this.modalService.alert('Invalid Link', 'Could not parse Document ID.');
            return;
        }

        this.isLoading.set(true);
        try {
            const res = await lastValueFrom(this.http.get<DocStructureHeader>(`api/google-docs/fetch/${docId}`));
            this.docTitle.set(res.title);

            // Build the tree
            const tree = this.buildTree(res.structure);
            this.rootNodes.set(tree);

            this.step.set(2);
        } catch (err: any) {
            console.error(err);
            this.modalService.alert('Fetch Error', err.error?.error || 'Failed to fetch document.');
        } finally {
            this.isLoading.set(false);
        }
    }

    // --- Tree Construction ---

    private checkIsNew(path: string): boolean {
        // Normalize path: split by /, trim, join by /
        const normalized = path.split('/').map(p => p.trim()).filter(p => !!p).join('/');
        return !this.existingPaths().includes(normalized);
    }

    private getLevel(type: string): number {
        if (type.startsWith('HEADING_')) return parseInt(type.split('_')[1], 10);
        return 999;
    }

    private buildTree(elements: DocElement[]): ImportNode[] {
        const roots: ImportNode[] = [];
        const stack: ImportNode[] = [];

        // Helper to get current context
        const getCurrentParent = (level: number) => {
            while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }
            return stack.length > 0 ? stack[stack.length - 1] : null;
        };

        let idCounter = 0;

        for (const el of elements) {
            const level = this.getLevel(el.type);

            if (level < 999) {
                // It's a Heading -> New Node
                const parent = getCurrentParent(level);

                // Determine default path
                const parentPath = parent ? parent.pathString : '';
                const defaultPath = parentPath ? `${parentPath}/${el.text}` : el.text;

                const newNode: ImportNode = {
                    id: `node-${idCounter++}`,
                    text: el.text,
                    level: level,
                    content: [],
                    children: [],
                    isPage: true,
                    isExcluded: false,
                    pathString: defaultPath,
                    isManual: false,
                    expanded: true,
                    isNew: this.checkIsNew(defaultPath)
                };

                if (parent) {
                    parent.children.push(newNode);
                } else {
                    roots.push(newNode);
                }
                stack.push(newNode);

            } else {
                // Content -> Add to current active node
                if (stack.length > 0) {
                    stack[stack.length - 1].content.push({ type: 'paragraph', text: el.text });
                }
            }
        }

        return roots;
    }

    // --- Tree Interaction ---

    toggleNode(node: ImportNode) {
        node.expanded = !node.expanded;
    }

    toggleIsPage(node: ImportNode) {
        if (node.isExcluded) return;
        node.isPage = !node.isPage;
    }

    toggleIsExcluded(node: ImportNode) {
        node.isExcluded = !node.isExcluded;
        // If excluded, it can't be a page (visually disabled, but logic handled in generatePreview)
    }

    onPathChange(node: ImportNode, newPath: string) {
        node.pathString = newPath;
        node.isManual = true;
        node.isNew = this.checkIsNew(newPath);
        this.updateChildrenPaths(node);
        // Force signal update to ensure UI reflects changes in children
        this.rootNodes.update(nodes => [...nodes]);
    }

    private updateChildrenPaths(parentNode: ImportNode) {
        for (const child of parentNode.children) {
            if (!child.isManual) {
                child.pathString = `${parentNode.pathString}/${child.text}`;
                child.isNew = this.checkIsNew(child.pathString);
                this.updateChildrenPaths(child);
            }
        }
    }

    // --- Search / Autocomplete ---

    onFocusPath(node: ImportNode) {
        this.activeNodeId.set(node.id);
        this.filterPaths(node.pathString);
    }

    onSearchInput(event: Event) {
        const val = (event.target as HTMLInputElement).value;
        this.filterPaths(val);
    }

    selectPathSuggestion(node: ImportNode, path: string) {
        this.onPathChange(node, path);
        this.activeNodeId.set(null);
    }

    private filterPaths(query: string) {
        const lower = query.toLowerCase();
        const matches = this.existingPaths()
            .filter(p => p.toLowerCase().includes(lower))
            .slice(0, 20);
        this.filteredPaths.set(matches);
    }

    // --- Preview Generation (Step 2 -> 3) ---

    generatePreview() {
        const drafts: CodexPageDraft[] = [];

        // Recursive processor
        const processNode = (node: ImportNode, activePage: CodexPageDraft | null) => {
            if (node.isExcluded) return; // Skip excluded subtrees

            let currentPage = activePage;

            if (node.isPage) {
                // Start a new page
                const pathParts = node.pathString.split('/').map(p => p.trim()).filter(p => !!p);
                const name = pathParts[pathParts.length - 1];
                const fullPath = pathParts.join('/');

                const newPage: CodexPageDraft = {
                    name: name,
                    path_components: pathParts,
                    content: [], // Start fresh content
                    type: 'page',
                    isNew: !this.existingPaths().includes(fullPath)
                };

                // Add own content
                if (node.content && node.content.length > 0) {
                    this.processContentForPreview(newPage.content, node.content);
                }

                drafts.push(newPage);
                currentPage = newPage;
            } else {
                // Not a page, append to parent page as a Heading + Content
                if (currentPage) {
                    currentPage.content.push({ type: 'heading', text: node.text, isExcluded: false });
                    if (node.content && node.content.length > 0) {
                        this.processContentForPreview(currentPage.content, node.content);
                    }
                }
            }

            // Recurse
            for (const child of node.children) {
                processNode(child, currentPage);
            }
        };

        for (const root of this.rootNodes()) {
            processNode(root, null);
        }

        this.previewPages.set(drafts);
        this.step.set(3);
    }

    // --- Step 3 Actions ---

    backToMapping() {
        this.step.set(2);
    }

    // --- Save / Export ---

    async saveImport() {
        if (this.previewPages().length === 0) return;

        this.isLoading.set(true);

        try {
            // Filter excluded content blocks
            const entriesToSave = this.previewPages().map(page => ({
                ...page,
                content: page.content.filter(block => !block.isExcluded)
            }));

            await lastValueFrom(this.http.put('api/codex/data', entriesToSave));
            this.modalService.alert('Success', `Imported ${entriesToSave.length} entries.`);
            this.reset();

        } catch (e: any) {
            console.error(e);
            this.modalService.alert('Error', 'Failed to save import.');
        } finally {
            this.isLoading.set(false);
        }
    }

    reset() {
        this.step.set(1);
        this.docIdInput.set('');
        this.rootNodes.set([]);
        this.previewPages.set([]);
    }
    private processContentForPreview(targetArray: PageContentBlock[], sourceContent: any[]) {
        for (const block of sourceContent) {
            // Check for Bold List Pattern in Paragraphs
            // Pattern: Starts with <b>Text</b> or <strong>Text</strong>
            if (block.type === 'paragraph' && block.text) {
                const boldMatch = block.text.match(/^(\*\*|<b>|<strong>)(.*?)(\*\*|<\/b>|<\/strong>)(.*)/);
                if (boldMatch) {
                    const headingText = boldMatch[2].replace(/:$/, '').trim(); // Remove trailing colon
                    const remainingText = boldMatch[4].trim();

                    // Add as heading
                    targetArray.push({ type: 'heading', text: headingText, isExcluded: false });

                    // If there is substantial text after the bold part, add it as a paragraph
                    if (remainingText.length > 0) {
                        targetArray.push({ type: 'paragraph', text: remainingText, isExcluded: false });
                    }
                    continue; // Skip adding the original block
                }
            }

            // Default add
            targetArray.push({ ...block, isExcluded: false });
        }
    }

    // --- Preview Actions ---

    toggleBlockType(block: PageContentBlock) {
        if (block.type === 'heading') {
            block.type = 'paragraph';
        } else if (block.type === 'paragraph') {
            block.type = 'heading';
        }
    }

    toggleBlockExclusion(block: PageContentBlock) {
        block.isExcluded = !block.isExcluded;
    }
}
