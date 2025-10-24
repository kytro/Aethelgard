import { Component, signal, inject, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

// --- TYPE INTERFACES ---
interface CodexEntry {
  name: string;
  path_components: string[];
  content?: any[];
  isCompleted?: boolean;
}
interface Pf1eRule { name: string; description: string; }
interface Pf1eEquipment { name: string; description: string; cost: string; weight: string; }
interface TooltipContent { title: string; description: string; }

@Component({
  selector: 'app-codex',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './codex.component.html',
  styleUrls: ['./codex.component.css']
})
export class CodexComponent implements OnInit {
  /**
   * Returns the full path to a leaf entry for template use.
   */
  getFullLeafPath(leafPath: string[]): string[] {
    return [...this.currentPath(), ...leafPath];
  }
  /**
   * Returns an array of objects for hierarchical leaf display:
   * [{ category: string, leaves: string[][] }]
   */
  get leafDisplayGroups() {
    const node = this.currentCategoryNode();
    if (!node) return [];
    const entries = this.currentView().entries;
    return entries.map((entry: any) => {
      const entryNode = this.getNode([...this.currentPath(), entry]);
      if (!entryNode) return null;
      if (Array.isArray(entryNode.content)) {
        // Direct leaf
        return { category: entry, leaves: [[entry]] };
      } else {
        // Category: collect all leaf paths under this entry
        const leafPaths = this.getAllLeafEntries(entryNode);
        return { category: entry, leaves: leafPaths };
      }
    }).filter(Boolean);
  }
  /**
   * Safely checks if the leaf entry at a given path is completed.
   */
  safeIsCompletedPath(path: string[]): boolean {
    const node = this.getNode(path);
    return node && typeof node.isCompleted !== 'undefined' ? node.isCompleted : false;
  }

  /**
   * Toggles completion for a leaf entry at a given path.
   */
  async toggleCompletionPath(path: string[]) {
    const node = this.getNode(path);
    if (!node) return;
    const isCompleted = !node.isCompleted;
    try {
      node.isCompleted = isCompleted;
      this.codexData.set(JSON.parse(JSON.stringify(this.codexData())));
      await lastValueFrom(this.http.patch('api/codex/item', { path, isCompleted }));
    } catch (err) {
      node.isCompleted = !isCompleted;
      this.codexData.set(JSON.parse(JSON.stringify(this.codexData())));
      console.error('Failed to update completion status', err);
      this.error.set('Failed to update completion status.');
    }
  }
  /**
   * Recursively collects all leaf entry keys under a given node.
   */
  getAllLeafEntries(node: any, path: string[] = []): string[][] {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node.content)) {
      return [path];
    }
    let leaves: string[][] = [];
    for (const key of Object.keys(node)) {
      if (['content', 'summary', 'category', 'isCompleted', 'enableCompletionTracking', 'isCombatManagerSource'].includes(key)) continue;
      leaves = leaves.concat(this.getAllLeafEntries(node[key], [...path, key]));
    }
    return leaves;
  }
  /**
   * Safely checks if the entry is completed for template binding.
   */
  safeIsCompleted(entry: CodexEntry): boolean {
    return entry && typeof entry.isCompleted !== 'undefined' ? entry.isCompleted : false;
  }
  http = inject(HttpClient);

  private codexData = signal<CodexEntry[] | null>(null);
  currentPath = signal<string[]>([]);
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);
  isEditMode = signal<boolean>(false);
  
  linkedEntities = signal<any[]>([]);
  modifiedEntities = signal<Set<string>>(new Set());
  rulesCache = signal<Map<string, Pf1eRule>>(new Map());
  equipmentCache = signal<Map<string, Pf1eEquipment>>(new Map());
  tooltipContent = signal<TooltipContent | null>(null);
  tooltipPosition = signal({ top: '0px', left: '0px' });

  currentView = computed(() => {
    const data = this.codexData();
    const path = this.currentPath();
    if (!data) return { entries: [], content: null, activeEntry: null };

    // Find the current entry based on the path
    const currentNode = this.getNode(path);
    const content = currentNode?.content || null;

    // Find child entries
    const children = data.filter((entry: CodexEntry) => 
        entry.path_components.length === path.length + 1 &&
        path.every((p, i) => entry.path_components[i] === p)
    );

    // Determine the active entry if the current node is a leaf
    const isLeaf = currentNode && Array.isArray(currentNode.content);
    const activeEntry = isLeaf ? currentNode : null;

    return { entries: children, content, activeEntry };
  });

  isCategoryNode = computed(() => {
    const path = this.currentPath();
    const currentNode = this.getNode(path);
    // It's a category node if it's an object that doesn't have a 'content' array.
    return currentNode && typeof currentNode === 'object' && !Array.isArray(currentNode.content);
  });

  currentCategoryNode = computed(() => {
    const path = this.currentPath();
    if (path.length === 0) {
      // At the root, the codexData itself is the category node
      return this.codexData();
    }
  
    const currentNode = this.getNode(path);
  
    // Check if the current node is a leaf (has content). If so, the parent is the category.
    const isLeafNode = currentNode && Array.isArray(currentNode.content);
  
    if (isLeafNode) {
      return this.getNode(path.slice(0, -1));
    } else {
      // Otherwise, the current node is the category.
      return currentNode;
    }
  });

  isCompletionTrackingActive = computed(() => {
    const path = this.currentPath();
    const isCurrentNodeCategory = this.isCategoryNode();
    let checkPath = isCurrentNodeCategory ? path : path.slice(0, -1);

    // Check from current node up to the root
    for (let i = checkPath.length; i >= 0; i--) {
        const node = this.getNode(checkPath.slice(0, i));
        if (typeof node?.enableCompletionTracking === 'boolean') {
            return node.enableCompletionTracking;
        }
    }

    return false; // Default to false if not set anywhere
  });
  
  // --- NEW ---
  isCombatManagerSourceActive = computed(() => {
    const path = this.currentPath();
    const isCurrentNodeCategory = this.isCategoryNode();
    let checkPath = isCurrentNodeCategory ? path : path.slice(0, -1);

    // Check from current node up to the root
    for (let i = checkPath.length; i >= 0; i--) {
        const node = this.getNode(checkPath.slice(0, i));
        if (typeof node?.isCombatManagerSource === 'boolean') {
            return node.isCombatManagerSource;
        }
    }
    return false; // Default to false if not set anywhere
  });

  constructor() {
    effect(async () => {
      const path = this.currentPath();
      const currentNode = this.getNode(path);
      
      // Always reset when the current node changes.
      this.linkedEntities.set([]);

      if (!currentNode) return;

      const entityIds = new Set<string>();

      // Case 1: The entry itself has an entityId
      const entityId = currentNode.entity_id || currentNode.entityId;
      if (entityId) {
        entityIds.add(entityId);
      }

      // Case 2: Blocks within the content have entityIds
      const content = currentNode.content;
      if (content && Array.isArray(content)) {
        for (const block of content) {
          const blockEntityId = block.entity_id || block.entityId;
          if (blockEntityId) {
            entityIds.add(blockEntityId);
          }
        }
      }

      if (entityIds.size > 0) {
        await this.fetchLinkedEntities(Array.from(entityIds));
      }
    });
    
    effect(async () => {
        const entities = this.linkedEntities();
        if (entities.length > 0) {
            const ruleIds = entities.flatMap(e => e.rules || []);
            const equipmentIds = entities.flatMap(e => e.equipment || []);
            
            if (ruleIds.length > 0 || equipmentIds.length > 0) {
                await this.fetchLinkedDetails(ruleIds, equipmentIds);
            }
        }
    });
  }

  ngOnInit(): void {
    this.loadCodexData();
    this.loadCaches();
  }

  async loadCodexData() {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      // Fetch codex_entries array from backend
      const entries: CodexEntry[] = await lastValueFrom(this.http.get<CodexEntry[]>('api/codex/data'));
      this.codexData.set(entries);
    } catch (err: any) {
      this.error.set(err.error?.error || 'Failed to load Codex data.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadCaches() {
    try {
        const [rules, equipment] = await Promise.all([
            lastValueFrom(this.http.get<any[]>('api/admin/collections/rules_pf1e')),
            lastValueFrom(this.http.get<any[]>('api/admin/collections/equipment_pf1e'))
        ]);
        this.rulesCache.set(new Map(rules.map(item => [item._id, item])));
        this.equipmentCache.set(new Map(equipment.map(item => [item._id, item])));
    } catch (err: any) {
        console.error("Failed to load caches for tooltips", err);
        this.error.set('Failed to load reference data (rules/equipment). Tooltips may not work correctly.');
    }
  }
  
  async fetchLinkedEntities(entityIds: string[]) {
    try {
      const entities = await lastValueFrom(this.http.post<any[]>('api/codex/get-entities', { entityIds }));
      this.linkedEntities.set(entities);
    } catch(err) {
      console.error("Failed to fetch linked entities", err);
      this.linkedEntities.set([]);
    }
  }

  async fetchLinkedDetails(ruleIds: string[], equipmentIds: string[]) {
    try {
        const details = await lastValueFrom(this.http.post<any>('api/codex/get-linked-details', { ruleIds, equipmentIds }));
        this.rulesCache.update(cache => new Map([...cache, ...details.rules.map((item: any) => [item._id, item])]));
        this.equipmentCache.update(cache => new Map([...cache, ...details.equipment.map((item: any) => [item._id, item])]));
    } catch (err) {
        console.error("Failed to fetch linked details", err);
    }
  }

  navigateTo(entry: CodexEntry) {
    this.currentPath.set(entry.path_components);
  }

  navigateToBreadcrumb(index: number) { this.currentPath.update(path => path.slice(0, index + 1)); }
  goHome() { this.currentPath.set([]); }

  // --- Editing ---
  async saveChanges() {
    if (!this.isEditMode()) return;
    try {
      await lastValueFrom(this.http.put('api/codex/data', this.codexData()));
      
      const modifiedEntityIds = this.modifiedEntities();
      if (modifiedEntityIds.size > 0) {
        const entitiesToSave = this.linkedEntities().filter(e => modifiedEntityIds.has(e._id));
        for (const entity of entitiesToSave) {
          await lastValueFrom(this.http.put(`api/codex/entities/${entity._id}`, entity));
        }
        this.modifiedEntities.set(new Set());
      }

      this.isEditMode.set(false);
    } catch (err) {
      console.error("Failed to save data", err);
      this.error.set('Failed to save changes.');
    }
  }

  handleContentUpdate(block: any, field: string, event: any) {
    if (!this.isEditMode()) return;
    const newText = event.target.innerText;
    
    const data = this.codexData();
    const path = this.currentPath();
    const node = this.getNode(path);
    if (node && node.content) {
      const blockIndex = node.content.findIndex((b: any) => b === block);
      if (blockIndex !== -1) {
        node.content[blockIndex][field] = newText;
        this.codexData.set(JSON.parse(JSON.stringify(data))); // Deep copy to trigger change detection
      }
    }
  }

  handleHeaderUpdate(block: any, headerIndex: number, event: any) {
    if (!this.isEditMode()) return;
    const newText = event.target.innerText;

    const data = this.codexData();
    const path = this.currentPath();
    const node = this.getNode(path);
    if (node && node.content) {
      const blockIndex = node.content.findIndex((b: any) => b === block);
      if (blockIndex !== -1) {
        const oldHeader = node.content[blockIndex].headers[headerIndex];
        node.content[blockIndex].headers[headerIndex] = newText;
        // Also update the keys in all rows
        node.content[blockIndex].rows.forEach((row: any) => {
          row[newText] = row[oldHeader];
          delete row[oldHeader];
        });
        this.codexData.set(JSON.parse(JSON.stringify(data))); // Deep copy to trigger change detection
      }
    }
  }

  handleCellUpdate(row: any, header: string, event: any) {
    if (!this.isEditMode()) return;
    const newText = event.target.innerText;

    const data = this.codexData();
    const path = this.currentPath();
    const node = this.getNode(path);
    if (node && node.content) {
        // This is not efficient, but it's the simplest way to ensure the change is detected.
        row[header] = newText;
        this.codexData.set(JSON.parse(JSON.stringify(data))); // Deep copy to trigger change detection
    }
  }

  handleEntityUpdate(entity: any, field: string, event: any) {
    if (!this.isEditMode()) return;
    const newText = event.target.innerText;

    const keys = field.split('.');
    let current = entity;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = newText;

    this.modifiedEntities.update(set => set.add(entity._id));
    this.linkedEntities.set([...this.linkedEntities()]); // Trigger view update
  }

  addLinkedItem(entity: any, inputElement: HTMLInputElement, type: 'rules' | 'equipment') {
    if (!this.isEditMode() || !inputElement.value) return;

    const newItemId = inputElement.value;
    const cache = type === 'rules' ? this.rulesCache() : this.equipmentCache();

    if (cache.has(newItemId)) {
      if (!entity[type]) {
        entity[type] = [];
      }
      if (!entity[type].includes(newItemId)) {
        entity[type].push(newItemId);
        this.modifiedEntities.update(set => set.add(entity._id));
        this.linkedEntities.set([...this.linkedEntities()]); // Trigger view update
        inputElement.value = '';
      }
    } else {
      alert(`Invalid ID: ${newItemId}`);
    }
  }

  removeLinkedItem(entity: any, itemId: string, type: 'rules' | 'equipment') {
    if (!this.isEditMode()) return;

    const index = entity[type]?.indexOf(itemId);
    if (index > -1) {
      entity[type].splice(index, 1);
      this.modifiedEntities.update(set => set.add(entity._id));
      this.linkedEntities.set([...this.linkedEntities()]); // Trigger view update
    }
  }

  addBlock(type: string) {
    const data = this.codexData();
    const path = this.currentPath();
    const node = this.getNode(path);
    if (node) {
      if (!node.content) {
        node.content = [];
      }
      let newBlock: any;
      switch (type) {
        case 'heading':
          newBlock = { type: 'heading', text: 'New Heading' };
          break;
        case 'paragraph':
          newBlock = { type: 'paragraph', text: 'New paragraph.' };
          break;
        case 'table':
          newBlock = { type: 'table', title: 'New Table', headers: ['Header 1', 'Header 2'], rows: [{ 'Header 1': 'Cell 1', 'Header 2': 'Cell 2' }] };
          break;
      }
      node.content.push(newBlock);
      this.codexData.set(JSON.parse(JSON.stringify(data)));
    }
  }

  removeBlock(block: any) {
    const data = this.codexData();
    const path = this.currentPath();
    const node = this.getNode(path);
    if (node && node.content) {
      const blockIndex = node.content.findIndex((b: any) => b === block);
      if (blockIndex !== -1) {
        node.content.splice(blockIndex, 1);
        this.codexData.set(JSON.parse(JSON.stringify(data)));
      }
    }
  }

  addRow(block: any) {
    const newRow: any = {};
    block.headers.forEach((header: string) => {
      newRow[header] = 'New Cell';
    });
    block.rows.push(newRow);
    const data = this.codexData();
    this.codexData.set(JSON.parse(JSON.stringify(data)));
  }

  removeRow(block: any, rowIndex: number) {
    block.rows.splice(rowIndex, 1);
    const data = this.codexData();
    this.codexData.set(JSON.parse(JSON.stringify(data)));
  }

  addColumn(block: any) {
    const newHeader = prompt('Enter new column header:');
    if (newHeader) {
      block.headers.push(newHeader);
      block.rows.forEach((row: any) => {
        row[newHeader] = 'New Cell';
      });
      const data = this.codexData();
      this.codexData.set(JSON.parse(JSON.stringify(data)));
    }
  }
  
  public getNode(path: string[]): any {
    // Find the entry in codex_entries with matching path_components
    const entries = this.codexData();
    if (!Array.isArray(entries)) return null;
    return entries.find(e => JSON.stringify(e.path_components) === JSON.stringify(path)) || null;
  }

  // --- Formatting Helpers ---
  formatName(name: string): string { return name ? name.replace(/_/g, ' ') : ''; }
  formatModifier(val: number | string | null | undefined): string {
    if (val == null) return '-';
    const num = Number(val);
    if (isNaN(num)) return String(val);
    return num >= 0 ? `+${num}` : String(num);
  }
  getAbilityModifier(score: any): string {
    const numScore = parseInt(String(score).match(/-?\d+/)?.[0] || '10', 10);
    if (isNaN(numScore)) return '+0';
    const mod = Math.floor((numScore - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }
  formatSaves(saves: string): { name: string, value: string }[] {
    if (!saves) return [];
    return saves.split(',').map(part => {
      const [name, value] = part.trim().split(' ');
      return { name, value };
    });
  }
  getCaseInsensitiveProp(obj: any, key: string): any {
    if (!obj || typeof obj !== 'object' || !key) return undefined;
    const objKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    return objKey ? obj[objKey] : undefined;
  }
  formatItemId = (id: string) => this.formatName(id.replace(/^(feat_|sa_|cond_|eq_)/, ''));

  async toggleCompletion(entry: CodexEntry) {
    const path = entry.path_components;
    const node = this.getNode(path);
    if (!node) return;

    const isCompleted = !node.isCompleted;
    try {
      // Optimistically update the UI
      node.isCompleted = isCompleted;
      this.codexData.set(JSON.parse(JSON.stringify(this.codexData())));

      await lastValueFrom(this.http.patch('api/codex/item', { path, isCompleted }));
    } catch (err) {
      // Revert on error
      node.isCompleted = !isCompleted;
      this.codexData.set(JSON.parse(JSON.stringify(this.codexData())));
      console.error('Failed to update completion status', err);
      this.error.set('Failed to update completion status.');
    }
  }

  async toggleCompletionTracking() {
    const path = this.currentPath();
    const categoryNode = this.getNode(path);
    if (!categoryNode) return;

    const enableCompletionTracking = !categoryNode.enableCompletionTracking;
    try {
      // Optimistically update the UI
      categoryNode.enableCompletionTracking = enableCompletionTracking;
      this.codexData.set(JSON.parse(JSON.stringify(this.codexData())));

      const categoryPath = path.join('.');
      await lastValueFrom(this.http.patch('api/codex/category', { category: categoryPath, enableCompletionTracking }));
    } catch (err) {
      // Revert on error
      categoryNode.enableCompletionTracking = !enableCompletionTracking;
      this.codexData.set(JSON.parse(JSON.stringify(this.codexData())));
      console.error('Failed to update completion tracking setting', err);
      this.error.set('Failed to update completion tracking setting.');
    }
  }

  // --- NEW ---
  async toggleCombatManagerSource() {
    const path = this.currentPath();
    const categoryNode = this.getNode(path);
    if (!categoryNode) return;

    const isCombatManagerSource = !categoryNode.isCombatManagerSource;
    try {
      // Optimistically update the UI
      categoryNode.isCombatManagerSource = isCombatManagerSource;
      this.codexData.set(JSON.parse(JSON.stringify(this.codexData())));

      const categoryPath = path.join('.');
      await lastValueFrom(this.http.patch('api/codex/category', { category: categoryPath, isCombatManagerSource }));
    } catch (err) {
      // Revert on error
      categoryNode.isCombatManagerSource = !isCombatManagerSource;
      this.codexData.set(JSON.parse(JSON.stringify(this.codexData())));
      console.error('Failed to update Combat Manager Source setting', err);
      this.error.set('Failed to update Combat Manager Source setting.');
    }
  }

  /**
   * Checks if the entry is a leaf node (has content array).
   */
  isLeaf(entry: CodexEntry): boolean {
    return entry && Array.isArray(entry.content);
  }

  // --- Tooltip Logic ---
  showTooltip(event: MouseEvent, itemId: string) {
    let title = '';
    let description = 'Item not found in cache.';

    // Aggressively clean the string to remove any non-word characters except underscore.
    const cleanedItemId = itemId.replace(/[^\w_]/g, '');

    if (cleanedItemId.startsWith('eq_')) {
        const item = this.equipmentCache().get(cleanedItemId);
        title = item?.name || this.formatName(cleanedItemId.replace('eq_', ''));
        if(item) description = `${item.description}\nCost: ${item.cost} | Weight: ${item.weight}`;
    } else {
        const item = this.rulesCache().get(cleanedItemId);
        title = item?.name || this.formatName(cleanedItemId.replace(/^(feat_|sa_|cond_)/, ''));
        if (item) description = item.description;
    }
    this.tooltipContent.set({ title, description });
    this.tooltipPosition.set({ top: `${event.clientY + 15}px`, left: `${event.clientX + 15}px` });
  }

  hideTooltip() {
    this.tooltipContent.set(null);
  }
}