import { Component, signal, inject, computed, effect, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, KeyValuePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { MapViewerComponent } from './map-viewer/map-viewer.component';

// --- TYPE INTERFACES ---
interface CodexEntry {
  name: string;
  path_components: string[];
  content?: any[];
  isCompleted?: boolean;
}
interface Pf1eRule { name: string; description: string; }
interface Pf1eEquipment { name: string; description: string; cost: string; weight: string; }
interface Pf1eSpell { name: string; description: string; }
interface Pf1eEntity {
  _id: string;
  name: string;
  rules: string[];
  equipment: string[];
  spells?: { [level: string]: string[] };
  deity?: string;
  [key: string]: any;
}
interface TooltipContent { title: string; description: string; }

@Component({
  selector: 'app-codex',
  standalone: true,
  imports: [CommonModule, MapViewerComponent],
  templateUrl: './codex.component.html',
  styleUrls: ['./codex.component.css'],
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }
  `]
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
  private codexDataBackup = signal<CodexEntry[] | null>(null);  // Backup for cancel
  currentPath = signal<string[]>([]);
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);
  isEditMode = signal<boolean>(false);
  @ViewChild('mapUpload') mapUploadInput!: ElementRef<HTMLInputElement>;

  linkedEntities = signal<Pf1eEntity[]>([]);
  private linkedEntitiesBackup = signal<Pf1eEntity[]>([]);  // Backup for cancel
  modifiedEntities = signal<Set<string>>(new Set());

  rulesCache = signal<Map<string, Pf1eRule>>(new Map());
  equipmentCache = signal<Map<string, Pf1eEquipment>>(new Map());
  spellsCache = signal<Map<string, Pf1eSpell>>(new Map());
  tooltipContent = signal<TooltipContent | null>(null);
  tooltipPosition = signal({ top: '0px', left: '0px' });

  // AI Complete state
  aiCompleteLoading = signal<boolean>(false);
  aiCompletePreview = signal<any>(null);
  aiCompletingEntityId = signal<string | null>(null);

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
        const spellIds = entities.flatMap(e => {
          if (!e.spells || typeof e.spells !== 'object') return [];
          return Object.values(e.spells).flat();
        }).filter(id => id); // Get all spell IDs from all levels

        if (ruleIds.length > 0 || equipmentIds.length > 0 || spellIds.length > 0) {
          await this.fetchLinkedDetails(ruleIds, equipmentIds, spellIds);
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
      const [rules, equipment, spells] = await Promise.all([
        lastValueFrom(this.http.get<any[]>('api/admin/collections/rules_pf1e')),
        lastValueFrom(this.http.get<any[]>('api/admin/collections/equipment_pf1e')),
        lastValueFrom(this.http.get<any[]>('api/admin/collections/spells_pf1e'))
      ]);
      this.rulesCache.set(new Map(rules.map(item => [item._id, item])));
      this.equipmentCache.set(new Map(equipment.map(item => [item._id, item])));
      this.spellsCache.set(new Map(spells.map(item => [item._id, item])));
    } catch (err: any) {
      console.error("Failed to load caches for tooltips", err);
      this.error.set('Failed to load reference data (rules/equipment/spells). Tooltips may not work correctly.');
    }
  }

  async fetchLinkedEntities(entityIds: string[]) {
    try {
      const entities = await lastValueFrom(this.http.post<any[]>('api/codex/get-entities', { entityIds }));
      this.linkedEntities.set(entities);
    } catch (err) {
      console.error("Failed to fetch linked entities", err);
      this.linkedEntities.set([]);
    }
  }

  async fetchLinkedDetails(ruleIds: string[], equipmentIds: string[], spellIds: string[]) {
    try {
      const details = await lastValueFrom(this.http.post<any>('api/codex/get-linked-details', { ruleIds, equipmentIds, spellIds }));
      this.rulesCache.update(cache => new Map([...cache, ...details.rules.map((item: any) => [item._id, item])]));
      this.equipmentCache.update(cache => new Map([...cache, ...details.equipment.map((item: any) => [item._id, item])]));
      if (details.spells) {
        this.spellsCache.update(cache => new Map([...cache, ...details.spells.map((item: any) => [item._id, item])]));
      }
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
  enterEditMode() {
    // Create deep copy backups before entering edit mode
    this.codexDataBackup.set(JSON.parse(JSON.stringify(this.codexData())));
    this.linkedEntitiesBackup.set(JSON.parse(JSON.stringify(this.linkedEntities())));
    this.isEditMode.set(true);
  }

  cancelEditMode() {
    // Restore from backups
    const backup = this.codexDataBackup();
    if (backup) {
      this.codexData.set(backup);
    }
    const entitiesBackup = this.linkedEntitiesBackup();
    if (entitiesBackup) {
      this.linkedEntities.set(entitiesBackup);
    }
    this.modifiedEntities.set(new Set());
    this.isEditMode.set(false);
  }

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

      // Clear backups after successful save
      this.codexDataBackup.set(null);
      this.linkedEntitiesBackup.set([]);
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

  handleEntityUpdate(entity: Pf1eEntity, field: string, event: any) {
    if (!this.isEditMode()) return;
    const newText = event.target.innerText;

    const keys = field.split('.');
    let current = entity as any;
    for (let i = 0; i < keys.length - 1; i++) {
      // FIX: Case-insensitive traversal to find the right nested object
      let nextKey = Object.keys(current).find(k => k.toLowerCase() === keys[i].toLowerCase()) || keys[i];
      if (!current[nextKey]) current[nextKey] = {};
      current = current[nextKey];
    }

    // FIX: Case-insensitive lookup for the final property to overwrite existing keys regardless of case
    const finalKeyReq = keys[keys.length - 1];
    const actualKey = Object.keys(current).find(k => k.toLowerCase() === finalKeyReq.toLowerCase()) || finalKeyReq;
    current[actualKey] = newText;

    this.modifiedEntities.update(set => set.add(entity._id));
    this.linkedEntities.set([...this.linkedEntities()]); // Trigger view update
  }

  /**
   * Handles updates for numeric fields specifically to ensure they are saved as numbers, not strings.
   */
  handleNumericEntityUpdate(entity: Pf1eEntity, field: string, event: any) {
    if (!this.isEditMode()) return;

    // 1. Clean input: aggressive regex to find the first valid integer, ignoring extra text like "(-1)"
    const text = event.target.innerText;
    const match = text.match(/-?\d+/);

    if (!match) {
      // If invalid, revert UI to old value
      event.target.innerText = this.getDeepValue(entity, field) ?? '';
      return;
    }

    // 2. Parse to number
    const numVal = parseInt(match[0], 10);

    // 3. Update deeply nested property with case-sensitivity handling
    const keys = field.split('.');
    let current = entity as any;
    for (let i = 0; i < keys.length - 1; i++) {
      // FIX: Case-insensitive traversal
      let nextKey = Object.keys(current).find(k => k.toLowerCase() === keys[i].toLowerCase()) || keys[i];
      if (!current[nextKey]) current[nextKey] = {};
      current = current[nextKey];
    }

    // FIX: Case-insensitive setting of the final key
    const finalKeyReq = keys[keys.length - 1];
    const actualKey = Object.keys(current).find(k => k.toLowerCase() === finalKeyReq.toLowerCase()) || finalKeyReq;

    current[actualKey] = numVal;

    // 4. Update UI to show strictly the number (removes any pasted junk like modifiers)
    if (event.target.innerText !== String(numVal)) {
      event.target.innerText = String(numVal);
    }

    // 5. Mark as modified to ensure it gets sent to backend on 'Save Changes'
    this.modifiedEntities.update(set => set.add(entity._id));
    // Force trigger view update to recalculate modifiers immediately
    this.linkedEntities.set([...this.linkedEntities()]);
  }

  // Helper to get deep value for reverting invalid inputs
  private getDeepValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }

  addEntitySkill(entity: Pf1eEntity, nameInput: HTMLInputElement, valueInput: HTMLInputElement) {
    if (!this.isEditMode()) return;
    const name = nameInput.value.trim();
    const val = parseInt(valueInput.value.trim(), 10);

    if (!name || isNaN(val)) {
      alert('Please enter a valid skill name and numeric value.');
      return;
    }

    if (!entity['baseStats']) entity['baseStats'] = {};
    if (!entity['baseStats']['skills']) entity['baseStats']['skills'] = {};

    entity['baseStats']['skills'][name] = val;
    this.modifiedEntities.update(set => set.add(entity._id));
    this.linkedEntities.set([...this.linkedEntities()]); // Trigger view refresh

    // Clear inputs
    nameInput.value = '';
    valueInput.value = '';
  }

  removeEntitySkill(entity: Pf1eEntity, skillName: string) {
    if (!this.isEditMode() || !entity['baseStats']?.skills) return;
    if (confirm(`Remove skill '${skillName}'?`)) {
      delete entity['baseStats']['skills'][skillName];
      this.modifiedEntities.update(set => set.add(entity._id));
      this.linkedEntities.set([...this.linkedEntities()]);
    }
  }

  getSpellSlots(entity: Pf1eEntity): { level: number, slots: number }[] {
    const slots = [];
    for (let i = 0; i <= 9; i++) {
      slots.push({
        level: i,
        slots: entity['spell_slots']?.[i] || 0
      });
    }
    return slots;
  }

  private getLevelZeroSpellNomenclature(entity: Pf1eEntity): string {
    const classString = (this.getCaseInsensitiveProp(entity, 'class')
      || this.getCaseInsensitiveProp(entity['baseStats'], 'class')
      || '').toLowerCase();

    if (!classString) return 'Orisons';

    const arcaneClasses = ['wizard', 'sorcerer', 'bard', 'magus', 'arcanist', 'witch', 'summoner', 'investigator', 'alchemist'];
    const divineClasses = ['cleric', 'druid', 'inquisitor', 'paladin', 'oracle', 'shaman', 'warpriest', 'ranger'];

    if (arcaneClasses.some(c => classString.includes(c))) {
      return 'Cantrips';
    }
    if (divineClasses.some(c => classString.includes(c))) {
      return 'Orisons';
    }

    return 'Orisons'; // Default
  }

  getSpellLevels(entity: Pf1eEntity): { level: string, spellIds: string[] }[] {
    const spells = entity.spells;
    if (!spells || typeof spells !== 'object') {
      return [];
    }
    return Object.keys(spells)
      .sort((a, b) => parseInt(a) - parseInt(b)) // Sort by level
      .map(level => ({
        level: level === '0' ? this.getLevelZeroSpellNomenclature(entity) : `Level ${level}`,
        spellIds: spells[level] || []
      }));
  }

  handleSpellSlotUpdate(entity: Pf1eEntity, level: string, event: any) {
    if (!this.isEditMode()) return;
    const newText = event.target.innerText;
    const newValue = parseInt(newText, 10);

    if (!entity['spell_slots']) {
      entity['spell_slots'] = {};
    }

    if (!isNaN(newValue) && newValue > 0) {
      entity['spell_slots'][level] = newValue;
    } else {
      delete entity['spell_slots'][level];
    }

    this.modifiedEntities.update(set => set.add(entity._id));
    this.linkedEntities.set([...this.linkedEntities()]); // Trigger view update
  }

  addLinkedItem(entity: Pf1eEntity, inputElement: HTMLInputElement, type: 'rules' | 'equipment' | 'spells') {
    if (!this.isEditMode() || !inputElement.value) return;

    const newItemId = inputElement.value;
    let cache: Map<string, any>;
    switch (type) {
      case 'rules':
        cache = this.rulesCache();
        break;
      case 'equipment':
        cache = this.equipmentCache();
        break;
      case 'spells':
        cache = this.spellsCache();
        break;
    }

    if (type === 'spells') {
      const parts = newItemId.split(':'); // Expect "level:id" format, e.g., "0:sp_detect_magic"
      if (parts.length !== 2) {
        alert('Invalid format. Use "level:spellId" (e.g., "0:sp_detect_magic")');
        return;
      }
      const [level, spellId] = parts;
      if (!cache.has(spellId)) {
        alert(`Invalid Spell ID: ${spellId}`);
        return;
      }
      if (!entity.spells) {
        entity.spells = {};
      }
      if (!entity.spells[level]) {
        entity.spells[level] = [];
      }
      if (!entity.spells[level].includes(spellId)) {
        entity.spells[level].push(spellId);
        this.modifiedEntities.update(set => set.add(entity._id));
        this.linkedEntities.set([...this.linkedEntities()]);
        inputElement.value = '';
      }
    } else {
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
  }

  removeLinkedItem(entity: Pf1eEntity, itemId: string, type: 'rules' | 'equipment' | 'spells') {
    if (!this.isEditMode()) return;

    if (type === 'spells') {
      if (!entity.spells) return;
      for (const level in entity.spells) {
        const index = entity.spells[level].indexOf(itemId);
        if (index > -1) {
          entity.spells[level].splice(index, 1);
          if (entity.spells[level].length === 0) {
            delete entity.spells[level];
          }
          this.modifiedEntities.update(set => set.add(entity._id));
          this.linkedEntities.set([...this.linkedEntities()]);
          return;
        }
      }
    } else {
      const index = entity[type]?.indexOf(itemId);
      if (index > -1) {
        entity[type].splice(index, 1);
        this.modifiedEntities.update(set => set.add(entity._id));
        this.linkedEntities.set([...this.linkedEntities()]); // Trigger view update
      }
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

  addMapBlock() {
    // Trigger the hidden file input
    this.mapUploadInput.nativeElement.click();
  }

  async handleMapUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('mapFile', file);

    this.isLoading.set(true);
    try {
      // Upload the file
      const res = await lastValueFrom(this.http.post<any>('/codex/api/media/upload', formData));

      // Add the new map block with the returned URL
      const data = this.codexData();
      const path = this.currentPath();
      const node = this.getNode(path);
      if (node) {
        if (!node.content) node.content = [];
        node.content.push({
          type: 'map',
          imageUrl: res.url,
          caption: file.name.replace(/\.[^/.]+$/, "") // Default caption is filename without extension
        });
        // Trigger change detection by creating a new object reference
        this.codexData.set(JSON.parse(JSON.stringify(data)));
      }
      this.saveChanges();
    } catch (e) {
      console.error('Map upload failed', e);
      alert('Failed to upload map image.');
    } finally {
      this.isLoading.set(false);
      // Clear input so same file can be selected again if needed
      event.target.value = '';
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

  moveBlock(block: any, direction: 'up' | 'down') {
    const data = this.codexData();
    const path = this.currentPath();
    const node = this.getNode(path);
    if (node && node.content) {
      const blockIndex = node.content.findIndex((b: any) => b === block);
      if (blockIndex === -1) return;

      const newIndex = direction === 'up' ? blockIndex - 1 : blockIndex + 1;
      if (newIndex < 0 || newIndex >= node.content.length) return;

      // Swap blocks
      [node.content[blockIndex], node.content[newIndex]] = [node.content[newIndex], node.content[blockIndex]];
      this.codexData.set(JSON.parse(JSON.stringify(data)));
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

  getSkills(skills: { [key: string]: number } | undefined): { name: string, value: number }[] {
    if (!skills) {
      return [];
    }
    return Object.entries(skills).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
  }

  formatItemId = (id: string) => this.formatName(id.replace(/^(feat_|sa_|cond_|eq_|spell_)/, ''));

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
  showTooltip(event: MouseEvent, itemId: string, type?: 'rule' | 'equipment' | 'spell') {
    let title = '';
    let description = 'Item not found in cache.';
    const cleanedItemId = itemId.replace(/[^\w_]/g, '');

    const itemType = type || (cleanedItemId.startsWith('eq_') ? 'equipment' : cleanedItemId.startsWith('sp_') ? 'spell' : 'rule');

    if (itemType === 'equipment') {
      const item = this.equipmentCache().get(cleanedItemId);
      title = item?.name || this.formatName(cleanedItemId.replace('eq_', ''));
      if (item) description = `${item.description}\nCost: ${item.cost} | Weight: ${item.weight}`;
    } else if (itemType === 'spell') {
      const item = this.spellsCache().get(cleanedItemId);
      title = item?.name || this.formatName(cleanedItemId.replace('sp_', ''));
      if (item) description = item.description;
    } else { // rule
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

  // --- AI Complete Methods ---
  async requestAiComplete(entity: Pf1eEntity) {
    this.aiCompleteLoading.set(true);
    this.aiCompletingEntityId.set(entity._id);
    this.aiCompletePreview.set(null);

    try {
      const response = await lastValueFrom(
        this.http.post<any>('api/codex/ai-complete', { entityId: entity._id })
      );
      this.aiCompletePreview.set(response);
    } catch (err: any) {
      console.error('AI Complete failed:', err);
      this.error.set(err.error?.error || 'AI Complete failed. Please try again.');
      this.aiCompletingEntityId.set(null);
    } finally {
      this.aiCompleteLoading.set(false);
    }
  }

  async applyAiComplete() {
    const preview = this.aiCompletePreview();
    if (!preview) return;

    const entity = this.linkedEntities().find(e => e._id === preview.entityId);
    if (!entity) return;

    const additions = preview.additions;

    // Apply baseStats (class, level, alignment, race)
    if (additions.baseStats) {
      if (!entity['baseStats']) entity['baseStats'] = {};
      if (additions.baseStats.class) {
        entity['baseStats']['class'] = additions.baseStats.class;
      }
      if (additions.baseStats.level) {
        entity['baseStats']['level'] = additions.baseStats.level;
      }
      if (additions.baseStats.alignment) {
        entity['baseStats']['alignment'] = additions.baseStats.alignment;
      }
      if (additions.baseStats.race) {
        entity['baseStats']['race'] = additions.baseStats.race;
      }
    }

    // Apply skill additions
    if (additions.skills) {
      if (!entity['baseStats']) entity['baseStats'] = {};
      if (!entity['baseStats']['skills']) entity['baseStats']['skills'] = {};
      for (const [name, value] of Object.entries(additions.skills)) {
        entity['baseStats']['skills'][name] = value;
      }
    }

    // Apply equipment additions
    if (additions.equipment?.length > 0) {
      if (!entity.equipment) entity.equipment = [];
      entity.equipment.push(...additions.equipment);
    }

    // Apply spell additions
    if (additions.spells) {
      if (!entity.spells) entity.spells = {};
      for (const [level, spellIds] of Object.entries(additions.spells)) {
        if (!entity.spells[level]) entity.spells[level] = [];
        entity.spells[level].push(...(spellIds as string[]));
      }
    }

    // Apply spell slots
    if (additions.spellSlots) {
      if (!entity['spell_slots']) entity['spell_slots'] = {};
      for (const [level, slots] of Object.entries(additions.spellSlots)) {
        entity['spell_slots'][level] = slots as number;
      }
    }

    // Update view immediately
    this.linkedEntities.set([...this.linkedEntities()]);

    // Save directly to database
    try {
      await lastValueFrom(this.http.put(`api/codex/entities/${entity._id}`, entity));
      console.log('[AI Complete] Entity saved successfully');
    } catch (err) {
      console.error('[AI Complete] Failed to save entity', err);
      this.error.set('Failed to save AI suggestions.');
    }

    // Clear preview
    this.cancelAiComplete();
  }

  cancelAiComplete() {
    this.aiCompletePreview.set(null);
    this.aiCompletingEntityId.set(null);
  }

  getPreviewSkills(): { name: string, value: number }[] {
    const preview = this.aiCompletePreview();
    if (!preview?.additions?.skills) return [];
    return Object.entries(preview.additions.skills).map(([name, value]) => ({ name, value: value as number }));
  }

  getPreviewSpellLevels(): { level: string, spellIds: string[] }[] {
    const preview = this.aiCompletePreview();
    if (!preview?.additions?.spells) return [];
    return Object.entries(preview.additions.spells).map(([level, spellIds]) => ({ level, spellIds: spellIds as string[] }));
  }

  getPreviewSpellSlots(): { level: string, slots: number }[] {
    const preview = this.aiCompletePreview();
    if (!preview?.additions?.spellSlots) return [];
    return Object.entries(preview.additions.spellSlots).map(([level, slots]) => ({ level, slots: slots as number }));
  }

  // --- FIX STATS LOGIC ---
  fixStatsModal = signal<{ isOpen: boolean; entity: Pf1eEntity | null; suggested: any; current: any; loading: boolean }>({
    isOpen: false,
    entity: null,
    suggested: null,
    current: null,
    loading: false
  });

  async openFixStatsModal(entity: Pf1eEntity) {
    this.fixStatsModal.set({ isOpen: true, entity, suggested: null, current: null, loading: true });

    try {
      const response: any = await lastValueFrom(this.http.post('api/data-integrity/calculate-fixes', { entity }));

      const bs = entity['baseStats'] || {};
      const current = {
        bab: bs?.combat?.bab ?? (bs.BAB ?? 0),
        cmb: bs?.combat?.cmb ?? (bs.CMB ?? '-'),
        cmd: bs?.combat?.cmd ?? (bs.CMD ?? '-'),
        fort: bs?.saves?.fortitude ?? (bs?.saves?.fort ?? 0),
        ref: bs?.saves?.reflex ?? (bs?.saves?.ref ?? 0),
        will: bs?.saves?.will ?? 0
      };

      const suggested = {
        bab: response.bab,
        cmb: response.cmb,
        cmd: response.cmd,
        fort: response.saves.fort.total,
        ref: response.saves.ref.total,
        will: response.saves.will.total,
        _raw: response
      };

      this.fixStatsModal.set({ isOpen: true, entity, suggested, current, loading: false });

    } catch (err: any) {
      console.error('Failed to calculate fixes:', err);
      this.error.set('Failed to calculate stats: ' + (err.error?.error || err.message));
      this.fixStatsModal.update(s => ({ ...s, isOpen: false }));
    }
  }

  closeFixStatsModal() {
    this.fixStatsModal.set({ isOpen: false, entity: null, suggested: null, current: null, loading: false });
  }

  async applyFixStats() {
    const state = this.fixStatsModal();
    if (!state.entity || !state.suggested) return;

    const entity = state.entity;
    const newStats = state.suggested;

    let babStr = String(newStats.bab);
    if (newStats.bab >= 6) {
      babStr = `+${newStats.bab}/+${newStats.bab - 5}`;
      if (newStats.bab >= 11) babStr += `/+${newStats.bab - 10}`;
      if (newStats.bab >= 16) babStr += `/+${newStats.bab - 15}`;
    } else {
      babStr = `+${newStats.bab}`;
    }

    try {
      const updates = {
        'baseStats.combat.bab': babStr,
        'baseStats.combat.cmb': newStats.cmb,
        'baseStats.combat.cmd': newStats.cmd,
        'baseStats.saves.fortitude': newStats.fort,
        'baseStats.saves.reflex': newStats.ref,
        'baseStats.saves.will': newStats.will,
        'baseStats.saves.fort': newStats.fort,
        'baseStats.saves.ref': newStats.ref
      };

      await lastValueFrom(this.http.put(`api/codex/entities/${entity._id}`, updates));

      this.closeFixStatsModal();
      this.linkedEntities.set([...this.linkedEntities()]);

    } catch (err: any) {
      console.error('Failed to apply fixes:', err);
      this.error.set('Failed to save fixes: ' + (err.error?.error || err.message));
    }
  }

  updateSuggested(field: string, value: any) {
    this.fixStatsModal.update(s => {
      if (!s.suggested) return s;
      return { ...s, suggested: { ...s.suggested, [field]: parseInt(value, 10) } };
    });
  }
}