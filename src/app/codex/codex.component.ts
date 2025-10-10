import { Component, signal, inject, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

// --- TYPE INTERFACES ---
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
  http = inject(HttpClient);

  private codexData = signal<any | null>(null);
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
    
    const currentNode = this.getNode(path);
    const content = currentNode?.content || null;
    const hasChildEntries = currentNode && Object.keys(currentNode).some(k => typeof currentNode[k] === 'object' && k !== 'content');
    
    let entriesNode;
    let activeEntry = null;

    if (hasChildEntries) {
      entriesNode = currentNode;
    } else {
      entriesNode = this.getNode(path.slice(0, -1));
      activeEntry = path[path.length - 1];
    }

    const entries = entriesNode ? Object.keys(entriesNode).filter(k => typeof entriesNode[k] === 'object' && k !== 'content' && k !== 'summary' && k !== 'category') : [];

    return { entries, content, activeEntry };
  });

  currentCategoryNode = computed(() => {
    const path = this.currentPath();
    if (path.length === 0) {
      return this.codexData();
    }
    // If we are at a leaf, we want the parent.
    const currentNode = this.getNode(path);
    const hasChildEntries = currentNode && Object.keys(currentNode).some(k => typeof currentNode[k] === 'object' && k !== 'content');
    if (hasChildEntries) {
        return currentNode;
    } else {
        return this.getNode(path.slice(0, -1));
    }
  });

  constructor() {
    effect(async () => {
      const content = this.currentView().content;
      this.linkedEntities.set([]);
      if (content && Array.isArray(content)) {
        const entityIds = content
          .filter(block => block.type === 'statblock' && block.entityId)
          .map(block => block.entityId);
        if (entityIds.length > 0) await this.fetchLinkedEntities(entityIds);
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
      const data = await lastValueFrom(this.http.get<any>('api/codex/data'));
      this.codexData.set(data);
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
    } catch (err) {
        console.error("Failed to load caches for tooltips", err);
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

  // --- Navigation ---
  navigateTo(key: string) {
    const path = this.currentPath();
    const currentNode = this.getNode(path);
    const hasChildEntries = currentNode && Object.keys(currentNode).some(k => typeof currentNode[k] === 'object' && k !== 'content');

    if (hasChildEntries) {
      // It's a category; append to the path to go deeper.
      this.currentPath.update(p => [...p, key]);
    } else {
      // It's a leaf; replace the last segment of the path to navigate to a sibling.
      this.currentPath.update(p => {
        const parentPath = p.slice(0, -1);
        return [...parentPath, key];
      });
    }
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
    let node = this.codexData();
    for (const key of path) {
      if (node && node[key]) node = node[key];
      else return null;
    }
    return node;
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
  formatItemId = (id: string) => this.formatName(id.replace(/^(feat_|sa_|cond_|equip_)/, ''));

  async toggleCompletion(entryKey: string) {
    const path = [...this.currentPath(), entryKey];
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

  isLeaf(entryKey: string): boolean {
    const path = [...this.currentPath(), entryKey];
    const node = this.getNode(path);
    if (!node) return false;
    const keys = Object.keys(node);
    return !keys.some(k => typeof node[k] === 'object' && k !== 'content' && k !== 'summary' && k !== 'category' && k !== 'isCompleted' && k !== 'enableCompletionTracking');
  }

  // --- Tooltip Logic ---
  showTooltip(event: MouseEvent, itemId: string) {
    let title = '';
    let description = 'Item not found in cache.';

    if (itemId.startsWith('equip_')) {
        const item = this.equipmentCache().get(itemId);
        title = item?.name || this.formatName(itemId.replace('equip_', ''));
        if(item) description = `${item.description}\nCost: ${item.cost} | Weight: ${item.weight}`;
    } else {
        const item = this.rulesCache().get(itemId);
        title = item?.name || this.formatName(itemId.replace(/^(feat_|sa_|cond_)/, ''));
        if (item) description = item.description;
    }
    this.tooltipContent.set({ title, description });
    this.tooltipPosition.set({ top: `${event.clientY + 15}px`, left: `${event.clientX + 15}px` });
  }

  hideTooltip() {
    this.tooltipContent.set(null);
  }
}
