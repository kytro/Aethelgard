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

interface ImportNode {
    id: string;
    text: string;
    level: number; // 1-6 for Headings, 999 for root context
    content: any[];
    children: ImportNode[];

    // Mapping configuration
    isPage: boolean;        // If true, this node becomes a codex entry
    pathString: string;     // Editable path string (e.g. "Locations/City/Tavern")
    isManual: boolean;      // If true, path doesn't auto-update when parent changes

    // UI
    expanded: boolean;
}

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
                // If parent exists, ParentPath/ThisText
                // If root, just ThisText (or we could default to a "New Import" folder)
                const parentPath = parent ? parent.pathString : '';
                const defaultPath = parentPath ? `${parentPath}/${el.text}` : el.text;

                const newNode: ImportNode = {
                    id: `node-${idCounter++}`,
                    text: el.text,
                    level: level,
                    content: [],
                    children: [],
                    isPage: true, // Default to importing headings as pages
                    pathString: defaultPath,
                    isManual: false,
                    expanded: true
                };

                if (parent) {
                    parent.children.push(newNode);
                } else {
                    roots.push(newNode);
                }
                stack.push(newNode);

            } else {
                // Content -> Add to current active node
                // If no active node (content before first heading), maybe ignore or attach to a dummy?
                // Let's attach to the last item on stack if exists
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
        node.isPage = !node.isPage;
    }

    // Called when user types in the path input
    onPathChange(node: ImportNode, newPath: string) {
        node.pathString = newPath;
        node.isManual = true; // User touched it, stop auto-updates
        this.updateChildrenPaths(node);
    }

    // Recursive update for children
    private updateChildrenPaths(parentNode: ImportNode) {
        for (const child of parentNode.children) {
            if (!child.isManual) {
                child.pathString = `${parentNode.pathString}/${child.text}`;
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

    handlePathInput(node: ImportNode, event: Event) {
        const val = (event.target as HTMLInputElement).value;
        this.onSearchInput(event);
        this.onPathChange(node, val);
    }

    selectPathSuggestion(node: ImportNode, path: string) {
        this.onPathChange(node, path);
        this.activeNodeId.set(null);
    }

    private filterPaths(query: string) {
        const lower = query.toLowerCase();
        // Simple filter
        const matches = this.existingPaths()
            .filter(p => p.toLowerCase().includes(lower))
            .slice(0, 20);
        this.filteredPaths.set(matches);
    }

    // --- Save / Export ---

    async saveImport() {
        if (!await this.modalService.confirm('Import', 'Import these pages into Codex?')) return;
        this.isLoading.set(true);

        try {
            // Flatten tree into CodexEntries
            const entriesToSave: any[] = [];

            const processNode = (node: ImportNode, parentContentCollector: any[] | null) => {
                const pathParts = node.pathString.split('/').map(p => p.trim()).filter(p => !!p);
                const name = pathParts[pathParts.length - 1];

                if (node.isPage) {
                    // It's a Page. Create an Entry.
                    // Content includes its own content + flattened content of non-page children
                    const pageContent = [...node.content];

                    for (const child of node.children) {
                        processNode(child, pageContent);
                    }

                    entriesToSave.push({
                        name: name,
                        path_components: pathParts,
                        content: pageContent,
                        type: 'page' // or generic
                    });

                } else {
                    // Not a page. Append content to parent collector if exists.
                    if (parentContentCollector) {
                        // Add heading for visual separation?
                        parentContentCollector.push({ type: 'heading', text: node.text });
                        parentContentCollector.push(...node.content);

                        for (const child of node.children) {
                            processNode(child, parentContentCollector);
                        }
                    } else {
                        // Orphaned non-page content (root level non-page). 
                        if (node.content.length > 0) {
                            // Fallback: create page anyway
                            const pageContent = [...node.content];
                            for (const child of node.children) processNode(child, pageContent);
                            entriesToSave.push({ name: name, path_components: pathParts, content: pageContent });
                        }
                    }
                }
            };

            for (const root of this.rootNodes()) {
                processNode(root, null);
            }

            // Save
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
    }
}
