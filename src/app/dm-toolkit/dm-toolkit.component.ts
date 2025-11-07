import { Component, signal, inject, computed, effect, WritableSignal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { StoryPlannerComponent } from './story-planner/story-planner.component';

// --- TYPE INTERFACES ---
interface Fight { _id: string; name: string; createdAt: any; combatStartTime?: any; roundCounter?: number; currentTurnIndex?: number; log?: string[]; }
interface Combatant { _id: string; fightId: string; name: string; initiative: number | null; hp: number; maxHp: number; stats: any; effects: CombatantEffect[]; tempMods: { [key: string]: number }; activeFeats?: string[]; type?: string; entityId?: string; preparedSpells?: any[]; castSpells?: any[]; spellSlots?: { [level: string]: number }; }
interface CombatantEffect { name: string; duration: number; unit: 'rounds' | 'minutes' | 'permanent' | 'hours' | 'days'; startRound: number; remainingRounds: number; }
interface ParsedAttack { name: string; bonus: string; damage: string; }
interface Spell { id: string; name: string; level: number; school: string; castingTime: string; range: string; duration: string; savingThrow: string; spellResistance: string; description: string; }
interface CombatantWithModifiers extends Combatant { baseStats: any; modifiedStats: any; initiativeMod: number; attacks: ParsedAttack[]; allFeats: any[]; equipment: any[]; magicItems: any[]; spells: Spell[]; skills: { [key: string]: number }; }
interface Session { _id: string; title: string; notes: string; createdAt: any; }
interface Pf1eEntity { id: string; name: string; sourceCodexPath: string[]; baseStats: any; rules: string[]; equipment?: string[]; magicItems?: string[]; spells?: { [level: string]: string[] }; }
interface FoundCreature { id: string; name: string; cr: string; stats: string; hp: string; }
interface GeneratedNpc { name: string; race: string; description: string; stats: { [key: string]: number }; }
interface CacheEntry { status: 'idle' | 'loading' | 'loaded' | 'error'; data: any; }
interface CascadingDropdown { level: number; options: string[]; }

const SKILL_ABILITY_MAP: { [key: string]: 'Str' | 'Dex' | 'Con' | 'Int' | 'Wis' | 'Cha' } = {
  'Acrobatics': 'Dex', 'Appraise': 'Int', 'Bluff': 'Cha', 'Climb': 'Str', 'Craft': 'Int',
  'Diplomacy': 'Cha', 'Disable Device': 'Dex', 'Disguise': 'Cha', 'Escape Artist': 'Dex',
  'Fly': 'Dex', 'Handle Animal': 'Cha', 'Heal': 'Wis', 'Intimidate': 'Cha',
  'Knowledge (arcana)': 'Int', 'Knowledge (dungeoneering)': 'Int', 'Knowledge (engineering)': 'Int',
  'Knowledge (geography)': 'Int', 'Knowledge (history)': 'Int', 'Knowledge (local)': 'Int',
  'Knowledge (nature)': 'Int', 'Knowledge (nobility)': 'Int', 'Knowledge (planes)': 'Int',
  'Knowledge (religion)': 'Int', 'Linguistics': 'Int', 'Perception': 'Wis', 'Perform': 'Cha',
  'Profession': 'Wis', 'Ride': 'Dex', 'Sense Motive': 'Wis', 'Sleight of Hand': 'Dex',
  'Spellcraft': 'Int', 'Stealth': 'Dex', 'Survival': 'Wis', 'Swim': 'Str', 'Use Magic Device': 'Cha'
};

const GOOD_SAVES = [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17];
const POOR_SAVES = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10];

@Component({
  selector: 'app-dm-toolkit',
  standalone: true,
  imports: [CommonModule, FormsModule, StoryPlannerComponent],
  templateUrl: './dm-toolkit.component.html',
  styleUrls: ['./dm-toolkit.component.css']
})
export class DmToolkitComponent {
  http = inject(HttpClient);

  // --- STATE SIGNALS ---
  activeTool = signal<'assistant' | 'npc-generator' | 'session' | 'combat-manager' | 'story-planner'>('assistant');
  
  fights = signal<Fight[]>([]);
  sessions = signal<Session[]>([]);
  codex = signal<any | null>(null);
  entitiesCache = signal<Pf1eEntity[]>([]);
  rulesCache = signal<Map<string, any>>(new Map());
  equipmentCache = signal<Map<string, any>>(new Map());
  magicItemsCache = signal<Map<string, any>>(new Map());
  effectsCache = signal<Map<string, CacheEntry>>(new Map());
  spellsCache = signal<Map<string, any>>(new Map());
  
  currentFight: WritableSignal<Fight | null> = signal(null);
  currentSession: WritableSignal<Session | null> = signal(null);
  sessionNotes = signal('');
  saveStatus = signal<'Idle' | 'Unsaved' | 'Saving' | 'Saved' | 'Error'>('Idle');
  combatants = signal<Combatant[]>([]);

  fightCount = computed(() => this.fights().length);
  sessionCount = computed(() => this.sessions().length);

  // Assistant
  assistantQuery = signal('');
  assistantResponse = signal('');
  isAskingAssistant = signal(false);
  availableModels = signal<string[]>([]);
  selectedModel = signal<string>('');
  
  // NPC Gen
  npcGenQuery = '';
  npcGenContext = '';
  npcGenGroupName = 'People/';
  isGeneratingNpcs = signal(false);
  isSavingNpcs = signal(false);
  lastGeneratedNpcs = signal<GeneratedNpc[]>([]);
  lastGeneratedGroupName = signal('');
  npcSaveSuccessMessage = signal('');

  // Combat
  newFightName = '';
  isSavingFight = signal(false);
  isSavingCombatant = signal(false);
  isTogglingCombatState = signal(false);
  isAdvancingTurn = signal(false);
  isCombatActive = signal(false);
  roundCounter = signal(1);
  currentTurnIndex = signal(0);
  findCreatureTerm = '';
  isFindingCreature = signal(false);
  foundCreatures = signal<FoundCreature[]>([]);
  foundCreatureFilter = signal('');
  showFoundCreaturesList = signal(false);
  expandedCombatant = signal<string | null>(null);
  newEffects = signal<Map<string, Partial<CombatantEffect>>>(new Map());
  activeEffectDropdown = signal<string | null>(null);
  editingTempMod = signal<{ combatantId: string, stat: string } | null>(null);
  tempModValue = signal(0);
  pcCount = signal(4);
  pcLevel = signal(1);
  customCombatant = signal({ name: '', initiative: 10, hp: 10 });
  monsterHpOption: 'average' | 'rolled' | 'max' = 'average';
  hpAdjustment = signal<Map<string, number>>(new Map());
  tooltipContent = signal<{ title: string, data: any, status: 'loading' | 'loaded' | 'error' } | null>(null);
  tooltipPosition = signal({ top: '0px', left: '0px' });
  isLogVisible = signal<boolean>(false);
  private autoSaveTimer: any;
  
  addFormSource = signal<string>('Custom');
  selectedCodexPath = signal<string[]>([]);
  selectedTemplate = signal('');
  selectedFoundCreatureId = signal<string | null>(null);


  commonEffects = [
    'Blinded', 'Bleed', 'Confused', 'Cowering', 'Dazed', 'Dazzled', 'Deafened',
    'Entangled', 'Exhausted', 'Fascinated', 'Fatigued', 'Flat-Footed', 'Frightened',
    'Grappled', 'Helpless', 'Invisible', 'Nauseated', 'Panicked', 'Paralyzed',
    'Petrified', 'Pinned', 'Prone', 'Shaken', 'Sickened', 'Staggered', 'Stunned',
    'Unconscious', 'Haste', 'Slow', 'Bless', 'Bane', 'Enlarged', 'Reduced'
  ].sort();
  
  showCustomEffectModal: string | null = null;
  customEffectName: string = '';
  customEffectDuration: number = 3;
  customEffectUnit: 'rounds' | 'minutes' | 'hours' | 'days' | 'permanent' = 'rounds';

  constructor() {
    this.loadInitialData();
    effect(() => {
      const fight = this.currentFight();
      if (fight) {
        this.loadCombatants(fight._id);
        this.isCombatActive.set(!!fight.combatStartTime);
        this.roundCounter.set(fight.roundCounter || 1);
        this.currentTurnIndex.set(fight.currentTurnIndex || 0);
      } else {
        this.combatants.set([]);
      }
    });
    effect(() => {
      const source = this.addFormSource();
      const path = this.selectedCodexPath();
      if (!source || ['Custom', 'Found', 'Find'].includes(source)) {
        // For 'Found', template name is set by `selectFoundCreature`, so we don't clear it here.
        if (source !== 'Found') this.selectedTemplate.set('');
        return;
      }
      const fullPath = [source, ...path];
      const node = this.getNodeFromCodex(fullPath);
      if (node && Array.isArray(node.content)) {
        this.selectedTemplate.set(fullPath[fullPath.length - 1]);
      } else {
        this.selectedTemplate.set('');
      }
    });
  }

  async loadInitialData() {
    try {
      const [fights, sessions, codex, entitiesData, rules, equipment, magicItems, effects, spells, modelsResult] = await Promise.all([
        lastValueFrom(this.http.get<Fight[]>('/codex/api/dm-toolkit/fights')),
        lastValueFrom(this.http.get<Session[]>('/codex/api/dm-toolkit/sessions')),
        lastValueFrom(this.http.get<any>('/codex/api/codex/data')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/entities_pf1e')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/rules_pf1e')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/equipment_pf1e')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/magic_items_pf1e')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/dm_toolkit_effects')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/spells_pf1e')),
        lastValueFrom(this.http.get<{models: string[], defaultModel: string}>('/codex/api/dm-toolkit-ai/models')),
      ]);
      this.fights.set(fights);
      this.sessions.set(sessions);
      this.codex.set(this.buildCodexObject(codex));
      
      const entities = entitiesData.map(e => ({ ...e, id: e._id }));
      this.entitiesCache.set(entities);

      this.rulesCache.set(new Map(rules.map(item => [item._id, item])));
      this.equipmentCache.set(new Map(equipment.map(item => [item._id, item])));
      this.magicItemsCache.set(new Map(magicItems.map(item => [item._id, item])));
      this.effectsCache.set(new Map(effects.map(item => [item._id, { data: item, status: 'loaded' }])));
      this.spellsCache.set(new Map(spells.map(item => [item._id, item])));
      this.availableModels.set(modelsResult.models);
      if (modelsResult.defaultModel && modelsResult.models.includes(modelsResult.defaultModel)) {
        this.selectedModel.set(modelsResult.defaultModel);
      } else if (modelsResult.models.length > 0) {
        this.selectedModel.set(modelsResult.models[0]);
      }
    } catch (error) {
      console.error("Failed to load initial DM Toolkit data", error);
    }
  }

  async loadCombatants(fightId: string) {
    try {
        const combatants = await lastValueFrom(this.http.get<Combatant[]>(`/codex/api/dm-toolkit/fights/${fightId}/combatants`));
        this.combatants.set(combatants);
    } catch(e) { console.error(e); }
  }
  
  private async logAction(message: string) {
    const fight = this.currentFight();
    if (!fight) return;
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit'});
    const entry = `[${timestamp}] ${message}`;
    const updatedLog = [...(fight.log || []), entry];
    this.currentFight.update(f => f ? ({ ...f, log: updatedLog }) : null);
    try {
        await lastValueFrom(this.http.patch(`/codex/api/dm-toolkit/fights/${fight._id}`, { log: updatedLog }));
    } catch(e) {
        console.error("Failed to save log entry:", e);
    }
  }
  
  async handleAskAssistant() {
    if (!this.assistantQuery()) return;
    this.isAskingAssistant.set(true);
    this.assistantResponse.set('');
    try {
      const res = await lastValueFrom(this.http.post<any>('/codex/api/dm-toolkit-ai/assistant', { 
        query: this.assistantQuery(),
        model: this.selectedModel(),
        options: { codex: this.codex() }
      }));
      this.assistantResponse.set(res.response);
    } catch (err: any) {
      this.assistantResponse.set(`Error: ${err.error?.error || err.message}`);
    } finally {
      this.isAskingAssistant.set(false);
    }
  }
  
  async handleGenerateNpcs() {
    if (!this.npcGenQuery.trim() || !this.npcGenContext.trim() || !this.npcGenGroupName.trim()) return;
    this.isGeneratingNpcs.set(true);
    this.lastGeneratedNpcs.set([]);
    this.npcSaveSuccessMessage.set('');
    try {
        const codexData = this.codex();
        const places = codexData ? codexData['Places'] : null;

        const npcs = await lastValueFrom(this.http.post<GeneratedNpc[]>('/codex/api/dm-toolkit-ai/generate-npcs', {
            query: this.npcGenQuery,
            options: {
                codex: {
                    userContext: this.npcGenContext,
                    worldPlaces: places
                },
                existingEntityNames: this.entitiesCache().map(e => e.name)
            }
        }));
        this.lastGeneratedNpcs.set(npcs);
        this.lastGeneratedGroupName.set(this.npcGenGroupName);
    } catch (e: any) { console.error("Error generating NPCs:", e); } 
    finally { this.isGeneratingNpcs.set(false); }
  }

  async handleSaveNpcsToCodex() {
    if (this.lastGeneratedNpcs().length === 0 || !this.lastGeneratedGroupName()) {
        return;
    }

    this.isSavingNpcs.set(true);
    this.npcSaveSuccessMessage.set('');
    const pathString = this.lastGeneratedGroupName();
    const npcCount = this.lastGeneratedNpcs().length;

    try {
        const basePath = pathString.split('/').filter(p => p.trim() !== '').map(p => p.trim().replace(/ /g, '_'));
        const codexEntries: any[] = [];

        // Ensure parent folders exist
        let cumulativePath: string[] = [];
        for (let i = 0; i < basePath.length; i++) {
            cumulativePath.push(basePath[i]);
            const node = this.getNodeFromCodex(cumulativePath);
            if (!node || Object.keys(node).length === 0) {
                const folderEntry = {
                    path_components: [...cumulativePath],
                    name: basePath[i],
                    summary: `Category folder`,
                    content: []
                };
                if (!codexEntries.some(e => JSON.stringify(e.path_components) === JSON.stringify(folderEntry.path_components))) {
                    codexEntries.push(folderEntry);
                }
            }
        }

        for (const npc of this.lastGeneratedNpcs()) {
            // Calculate the full baseStats object from the simple AI-generated stats
            const completeBaseStats = this.calculateCompleteBaseStats(npc.stats);

            const entity = {
                name: npc.name,
                baseStats: completeBaseStats, // <-- This is the fix
                description: npc.description,
                sourceCodexPath: [...basePath, npc.name.replace(/ /g, '_')],
                rules: [],
                equipment: [],
                magicItems: [],
                spells: []
            };
            const newEntity = await lastValueFrom(this.http.post<any>('/codex/api/admin/collections/entities_pf1e', entity));

            const codexEntry = {
                path_components: [...basePath, npc.name.replace(/ /g, '_')],
                name: npc.name.replace(/ /g, '_'),
                content: [
                    { type: 'statblock', entityId: newEntity.insertedId },
                    { type: 'heading', text: 'Description' },
                    { type: 'paragraph', text: npc.description }
                ],
                summary: `Auto-generated entry for NPC: ${npc.name}`
            };
            codexEntries.push(codexEntry);
        }

        if (codexEntries.length > 0) {
            await lastValueFrom(this.http.put('/codex/api/codex/data', codexEntries));
        }

        // Refresh data
        await this.loadInitialData();

        this.lastGeneratedNpcs.set([]);
        this.lastGeneratedGroupName.set('');
        this.npcSaveSuccessMessage.set(`${npcCount} NPCs saved to codex under "${pathString}"!`);

    } catch (error) {
        console.error('Error saving NPCs to codex:', error);
        this.npcSaveSuccessMessage.set('Failed to save NPCs. See console for details.');
    } finally {
        this.isSavingNpcs.set(false);
    }
  }

  async handleAddFight() {
    if (!this.newFightName.trim()) return;
    this.isSavingFight.set(true);
    try {
      const newFight = await lastValueFrom(this.http.post<any>('/codex/api/dm-toolkit/fights', { name: this.newFightName }));
      this.fights.update(f => [newFight, ...f]);
      this.newFightName = '';
    } catch(e) { console.error(e); }  
    finally { this.isSavingFight.set(false); }
  }

  async handleDeleteFight(id: string) {
    if (!confirm('Are you sure you want to delete this fight?')) return;
    try {
      await lastValueFrom(this.http.delete(`/codex/api/dm-toolkit/fights/${id}`));
      this.fights.update(fights => fights.filter(f => f._id !== id));
      if (this.currentFight()?._id === id) this.currentFight.set(null);
    } catch(e) { console.error(e); }
  }

  async setCurrentFight(fight: Fight) {
    try { await lastValueFrom(this.http.post(`/codex/api/dm-toolkit/fights/${fight._id}/migrate`, {})); } catch (e) { console.error("Failed to run migration for fight:", fight._id, e); }
    this.currentFight.set(fight);
  }
  
  updateCustomCombatant(field: 'name'|'hp'|'initiative', val: any) { this.customCombatant.update(c => ({...c, [field]: val})); }

  async handleAddCombatant(event: Event) {
    event.preventDefault();
    const fight = this.currentFight();
    if (!fight) return;
    this.isSavingCombatant.set(true);
    let combatantData: Partial<Combatant> = {};

    try {
        const source = this.addFormSource();
        if (source === 'Custom') {
            const custom = this.customCombatant();
            if (!custom.name) throw new Error("Custom combatant must have a name.");
            combatantData = { 
                name: custom.name, 
                initiative: +custom.initiative, 
                hp: +custom.hp, 
                maxHp: +custom.hp, 
                type: 'Custom', 
                stats: {}
            };
    } else if (source === 'Found') {
      const entityId = this.selectedFoundCreatureId();
      if (!entityId) throw new Error("Please select a creature from the 'Found' list.");
      // Try to find the found creature details locally
      const foundList = this.foundCreatures();
      const found = foundList.find((f: FoundCreature) => f.id === entityId);
      let hpVal = 10;
      if (found && found.hp) {
        hpVal = this.computeHpFromString(String(found.hp), this.monsterHpOption);
      }
      combatantData = {
        type: 'Bestiary', // Treat found creatures as bestiary entries
        entityId: entityId,
        hp: hpVal,
        maxHp: hpVal
      };
        } else {
            const templateName = this.selectedTemplate();
            if (!templateName) throw new Error("Please select a final creature/NPC from the dropdowns.");
            
      // Resolve the codex node for the selected template. Support the newer codex shape where
      // templates may be nested objects, nodes with 'content' arrays, or direct references to entity ids.
      const fullPath = [source, ...this.selectedCodexPath(), templateName].filter(Boolean);
      const node = this.getNodeFromCodex(fullPath);

      let resolvedEntityId: string | undefined;
      let resolvedEntity: any | undefined;
      let hpVal = 10;

      if (node) {
        // If node directly references an entityId or id, use that
        if ((node as any).entityId) resolvedEntityId = (node as any).entityId;
        else if ((node as any).id) resolvedEntityId = (node as any).id;

        // If node has baseStats or hp info, compute hp from that
        const hpFieldNode = this.getCaseInsensitiveProp((node as any).baseStats || node, 'hp') || this.getCaseInsensitiveProp((node as any).baseStats || node, 'HP') || this.getCaseInsensitiveProp((node as any).baseStats || node, 'maxHp');
        if (hpFieldNode) hpVal = this.computeHpFromString(String(hpFieldNode), this.monsterHpOption);

        // If node contains a content array, try to resolve an item inside it
        if (Array.isArray((node as any).content) && (node as any).content.length > 0) {
          const match = (node as any).content.find((it: any) => it && (it.name === templateName || it.id === templateName || it._id === templateName)) || (node as any).content[0];
          if (match) {
            if (match.entityId) resolvedEntityId = match.entityId;
            else if (match.id) resolvedEntityId = match.id;
            else if (match._id) resolvedEntityId = match._id;
            const hpFieldMatch = this.getCaseInsensitiveProp(match.baseStats || match, 'hp') || this.getCaseInsensitiveProp(match.baseStats || match, 'HP') || this.getCaseInsensitiveProp(match.baseStats || match, 'maxHp');
            if (hpFieldMatch) hpVal = this.computeHpFromString(String(hpFieldMatch), this.monsterHpOption);
          }
        }
      }

      // Fallback: search entities cache by name
      if (!resolvedEntityId) {
        const entities = this.entitiesCache();
        resolvedEntity = entities.find((e: any) => e.name === templateName) || entities.find((e: any) => e.name === this.formatName(templateName));
        resolvedEntityId = resolvedEntity?.id;
        if (resolvedEntity && (!hpVal || hpVal === 10)) {
          const hpField = this.getCaseInsensitiveProp(resolvedEntity.baseStats || {}, 'hp') || this.getCaseInsensitiveProp(resolvedEntity.baseStats || {}, 'HP') || this.getCaseInsensitiveProp(resolvedEntity.baseStats || {}, 'maxHp');
          if (hpField) hpVal = this.computeHpFromString(String(hpField), this.monsterHpOption);
        }
      }

      if (!resolvedEntityId) throw new Error(`Entity template '${this.formatName(templateName)}' not found in codex or cache.`);

      combatantData = {
        type: source,
        entityId: resolvedEntityId,
        hp: hpVal,
        maxHp: hpVal
      };
        }

        const newCombatant = await lastValueFrom(this.http.post<Combatant>(`/codex/api/dm-toolkit/fights/${fight._id}/combatants`, combatantData));
        this.combatants.update(c => [...c, newCombatant].sort((a, b) => (b.initiative || 0) - (a.initiative || 0) || a.name.localeCompare(b.name)));
        
        // --- Create formatted log message ---
        const stats = newCombatant.stats || {};
        const logStats: { [key: string]: any } = {};
        const statKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha', 'hp', 'ac', 'saves'];

        statKeys.forEach(key => {
            const value = this.getCaseInsensitiveProp(stats, key);
            if (value !== undefined) {
                logStats[key] = value;
            }
        });

        const statsSummary = Object.keys(logStats).length > 0
            ? JSON.stringify(logStats, null, 2)
            : '(No detailed stats)';

        const logMessage = `${newCombatant.name} added to the fight.\n  - HP: ${newCombatant.hp}, Init: ${newCombatant.initiative}\n  - Stats:\n${statsSummary}`;

        this.logAction(logMessage);

        // Reset form state
        this.customCombatant.set({ name: '', initiative: 10, hp: 10 });
        this.selectedCodexPath.set([]);
        this.selectedTemplate.set('');
        this.selectedFoundCreatureId.set(null);
        this.foundCreatureFilter.set('');
        this.addFormSource.set('Custom');

    } catch (e: any) { 
        console.error("Error adding combatant:", e); 
        const errorMessage = e.error?.message || e.message || "An unknown error occurred while adding the combatant.";
        alert(errorMessage);
    } 
    finally { this.isSavingCombatant.set(false); }
  }

  async handleRemoveCombatant(id: string) {
    const combatant = this.combatants().find(c => c._id === id);
    if (!combatant) return;
    this.logAction(`${combatant.name} removed from the fight.`);
    await lastValueFrom(this.http.delete(`/codex/api/dm-toolkit/combatants/${id}`));
    this.combatants.update(c => c.filter(cb => cb._id !== id));
  }

  async handleUpdateCombatant(id: string, field: keyof Combatant, val: any) {
     if (isNaN(+val) && (field==='hp'||field==='initiative'||field==='maxHp')) return;
     const combatant = this.combatants().find(c => c._id === id);
     if (!combatant) return;
     const oldValue = combatant[field];
     if (!['effects', 'activeFeats', 'tempMods'].includes(field)) {
         this.logAction(`${combatant.name}'s ${field} changed from ${oldValue} to ${val}.`);
     }
     const valueToPatch = (typeof val === 'number' || !isNaN(+val)) && field !== 'effects' ? +val : val;
     await lastValueFrom(this.http.patch(`/codex/api/dm-toolkit/combatants/${id}`, { [field]: valueToPatch }));
   this.combatants.update(c => {
     const updated = c.map(cb => cb._id === id ? {...cb, [field]: valueToPatch} : cb);
     // If initiative changed, re-sort to maintain initiative order and tie-break by initiative modifier
     if (field === 'initiative') {
       return updated.slice().sort((a, b) => {
         const initA = (a.initiative || 0);
         const initB = (b.initiative || 0);
         if (initA !== initB) return initB - initA;
         const aMod = this.modifiedCombatants().find(m => m._id === a._id)?.initiativeMod || 0;
         const bMod = this.modifiedCombatants().find(m => m._id === b._id)?.initiativeMod || 0;
         if (aMod !== bMod) return bMod - aMod;
         return a.name.localeCompare(b.name);
       });
     }
     return updated;
   });
  }

  async handleStartCombat() {
    const fight = this.currentFight(); if (!fight) return;
    this.isTogglingCombatState.set(true);
    const updatedFight = await lastValueFrom(this.http.patch<Fight>(`/codex/api/dm-toolkit/fights/${fight._id}`, { combatStartTime: new Date() }));
    this.currentFight.set(updatedFight);
    this.logAction('Combat started.');
    this.isTogglingCombatState.set(false);
  }

  async handleEndCombat() {
    const fight = this.currentFight(); if (!fight) return;
    this.isTogglingCombatState.set(true);
    const updatedFight = await lastValueFrom(this.http.patch<Fight>(`/codex/api/dm-toolkit/fights/${fight._id}/end-combat`, {}));
    this.currentFight.set(updatedFight);
    this.loadCombatants(fight._id);
    this.logAction('Combat ended.');
    this.isTogglingCombatState.set(false);
  }

  async handleNextTurn() {
    if (this.isAdvancingTurn()) return;
    const fight = this.currentFight(); if (!fight) return;
    this.isAdvancingTurn.set(true);
    try {
      const updatedFight = await lastValueFrom(this.http.patch<Fight>(`/codex/api/dm-toolkit/fights/${fight._id}/next-turn`, {}));
      this.currentFight.set(updatedFight);
      this.roundCounter.set(updatedFight.roundCounter || this.roundCounter());
      this.currentTurnIndex.set(updatedFight.currentTurnIndex || 0);
      await this.loadCombatants(fight._id);
      const combatants = this.modifiedCombatants();
      if (combatants.length > 0) {
          const nextCombatant = combatants[updatedFight.currentTurnIndex || 0];
          if (nextCombatant) {
            if (updatedFight.currentTurnIndex === 0) {
              this.logAction(`Round ${updatedFight.roundCounter} started. It is ${nextCombatant.name}'s turn.`);
            } else {
              this.logAction(`It is now ${nextCombatant.name}'s turn.`);
            }
          }
      }
    } catch (err) {
      console.error('Failed to advance to next turn', err);
    } finally {
      this.isAdvancingTurn.set(false);
    }
  }

  async handlePreviousTurn() {
    if (this.isAdvancingTurn()) return;
    const fight = this.currentFight(); if (!fight) return;
    this.isAdvancingTurn.set(true);
    try {
      const updatedFight = await lastValueFrom(this.http.patch<Fight>(`/codex/api/dm-toolkit/fights/${fight._id}/previous-turn`, {}));
      this.currentFight.set(updatedFight);
      this.roundCounter.set(updatedFight.roundCounter || this.roundCounter());
      this.currentTurnIndex.set(updatedFight.currentTurnIndex || 0);
      await this.loadCombatants(fight._id);
      const combatants = this.modifiedCombatants();
      if (combatants.length > 0) {
          const previousCombatant = combatants[updatedFight.currentTurnIndex || 0];
          if (previousCombatant) {
              this.logAction(`Moved back to ${previousCombatant.name}'s turn.`);
          }
      }
    } catch (err) {
      console.error('Failed to move to previous turn', err);
    } finally {
      this.isAdvancingTurn.set(false);
    }
  }

  async moveCombatant(combatantId: string, direction: 'up' | 'down') {
    const combatants = this.modifiedCombatants();
    const currentIndex = combatants.findIndex(c => c._id === combatantId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= combatants.length) return;

    const currentCombatant = combatants[currentIndex];
    const targetCombatant = combatants[targetIndex];

    const targetInitiative = targetCombatant.initiative || 0;

    let newCurrentInitiative;
    if (direction === 'up') {
      newCurrentInitiative = targetInitiative + 0.5;
    } else {
      newCurrentInitiative = targetInitiative - 0.5;
    }

    await this.handleUpdateCombatant(currentCombatant._id, 'initiative', newCurrentInitiative);
  }


  async handleFindCreature() {
    if (!this.findCreatureTerm) return;
    this.isFindingCreature.set(true);
    try {
        const creatures = await lastValueFrom(this.http.post<FoundCreature[]>('/codex/api/dm-toolkit-ai/find-creatures', {
            term: this.findCreatureTerm, pcCount: this.pcCount(), pcLevel: this.pcLevel()
        }));
        this.foundCreatures.set(creatures);
        this.findCreatureTerm = '';
        if (creatures.length > 0) {
            this.addFormSource.set('Found'); // Switch to 'Found' tab on successful search
        }
    } catch(e) { console.error("Error finding creatures:", e); } 
    finally { this.isFindingCreature.set(false); }
  }
  
  hideFoundCreaturesListWithDelay() { setTimeout(() => this.showFoundCreaturesList.set(false), 200); } 
  
  selectFoundCreature(creature: FoundCreature) { 
    this.selectedTemplate.set(creature.name); 
    this.foundCreatureFilter.set(creature.name); 
    this.selectedFoundCreatureId.set(creature.id);
    this.showFoundCreaturesList.set(false);
    this.addFormSource.set('Found');
  }

  toggleDetails(id: string) { this.expandedCombatant.update(c => c === id ? null : id); }

  async handleAddSession() {
      const newSession = await lastValueFrom(this.http.post<any>('/codex/api/dm-toolkit/sessions', {}));
      const sessionToAdd = { _id: newSession._id, title: '', notes: '', createdAt: new Date() };
      this.sessions.update(s => [sessionToAdd, ...s]);
      this.setCurrentSession(sessionToAdd);
  }

  async handleDeleteSession(id: string) {
      if (!confirm('Are you sure you want to delete this session?')) return;
      await lastValueFrom(this.http.delete(`/codex/api/dm-toolkit/sessions/${id}`));
      this.sessions.update(s => s.filter(session => session._id !== id));
      if (this.currentSession()?._id === id) this.currentSession.set(null);
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any): void {
    if (this.saveStatus() === 'Unsaved') {
      this.saveCurrentSession();
    }
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (document.visibilityState === 'hidden' && this.saveStatus() === 'Unsaved') {
      this.saveCurrentSession();
    }
  }

  async selectSession(session: Session) {
    if (this.saveStatus() === 'Unsaved') {
      await this.saveCurrentSession();
    }
    this.setCurrentSession(session);
  }

  async saveCurrentSession() {
    const session = this.currentSession();
    const notes = this.sessionNotes();
    if (!session || this.saveStatus() !== 'Unsaved' || notes === (session.notes || '')) {
      return;
    }

    this.saveStatus.set('Saving');
    try {
      const updatedSession = await lastValueFrom(this.http.patch<Session>(`/codex/api/dm-toolkit/sessions/${session._id}`, { notes }));
      this.saveStatus.set('Saved');
      this.currentSession.set(updatedSession);
      this.sessions.update(sessions => {
        const index = sessions.findIndex(s => s._id === session._id);
        if (index > -1) {
          const newSessions = [...sessions];
          newSessions[index] = updatedSession;
          return newSessions;
        }
        return sessions;
      });
    } catch (e) {
      console.error("Failed to save session:", e);
      this.saveStatus.set('Error');
    }
  }

  setCurrentSession(session: Session) {
    this.currentSession.set(session);
    this.sessionNotes.set(session.notes || '');
    this.saveStatus.set('Idle');
  }
  
  onNotesChange(notes: string) {
    this.sessionNotes.set(notes);
    this.saveStatus.set('Unsaved');

    // Clear the existing timer to debounce
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    // Set a new timer
    this.autoSaveTimer = setTimeout(() => {
      this.saveCurrentSession();
    }, 5000); // 5 seconds debounce
  }
  
  async lookupTerm(term: string, type: 'effect') {
    if (!term || this.effectsCache().has(term)) return;
    this.effectsCache.update(c => c.set(term, { status: 'loading', data: { description: 'Loading...' } }));
    try {
        const result = await lastValueFrom(this.http.post<any>('/codex/api/dm-toolkit-ai/lookup', { term, type }));
        this.effectsCache.update(c => c.set(term, { status: 'loaded', data: result }));
    } catch (e) {
        this.effectsCache.update(c => c.set(term, { status: 'error', data: { description: `Error fetching.` } }));
    }
  }
  
  async toggleActiveFeat(id: string, featId: string) {
    const combatant = this.combatants().find(c => c._id === id); if (!combatant) return;
    const active = combatant.activeFeats || [];
    const newActive = active.includes(featId) ? active.filter(f => f !== featId) : [...active, featId];
    const featData = this.rulesCache().get(featId);
    const featName = featData?.name || featId;
    this.logAction(`${newActive.includes(featId) ? 'Activated' : 'Deactivated'} feat '${featName}' for ${combatant.name}.`);
    await this.handleUpdateCombatant(id, 'activeFeats', newActive);
  }

  newEffectForCombatant = (id: string) => this.newEffects().get(id) || { name: '', duration: 3, unit: 'rounds' };
  updateNewEffect(id: string, field: keyof CombatantEffect, val: any) {
    this.newEffects.update(m => {
      const current = m.get(id) || { name: '', duration: 3, unit: 'rounds' };
      const updated = { ...current, [field]: val };
      if (field === 'unit' && val === 'permanent') updated.duration = 0;
      return m.set(id, updated);
    });
  }
  showEffectList = (id: string) => this.activeEffectDropdown.set(id);
  hideEffectListWithDelay = (id: string) => setTimeout(() => { if (this.activeEffectDropdown() === id) this.activeEffectDropdown.set(null); }, 200);
  filteredEffects = (id: string) => {
    const term = (this.newEffects().get(id)?.name || '').toLowerCase();
    return this.commonEffects.filter(e => e.toLowerCase().includes(term));
  };
  selectEffect(id: string, name: string) { this.updateNewEffect(id, 'name', name); this.activeEffectDropdown.set(null); }

  async handleAddEffect(id: string) {
    const effect = this.newEffects().get(id);
    const combatant = this.combatants().find(c => c._id === id);
    if (!effect?.name || !combatant) return;
    const toAdd: CombatantEffect = { name: effect.name, duration: effect.duration || 0, unit: effect.unit || 'rounds', startRound: this.roundCounter(), remainingRounds: effect.unit === 'permanent' ? 999 : (effect.duration || 0) };
    const updatedEffects = [...(combatant.effects || []), toAdd];
    this.logAction(`Applied effect '${toAdd.name}' to ${combatant.name} for ${toAdd.duration} ${toAdd.unit}.`);
    await this.handleUpdateCombatant(id, 'effects', updatedEffects);
    this.newEffects.update(m => { m.delete(id); return m; });
  }

  async handleRemoveEffect(id: string, index: number) {
    this.hideTooltip();
    const c = this.combatants().find(c => c._id === id);
    if (!c?.effects) return;
    const effectName = c.effects[index]?.name || 'Unknown Effect';
    const updated = c.effects.filter((_, i) => i !== index);
    this.logAction(`Removed effect '${effectName}' from ${c.name}.`);
    await this.handleUpdateCombatant(id, 'effects', updated);
  }
  
  openTempModModal(id: string, stat: string) {
    const c = this.combatants().find(c => c._id === id);
    this.tempModValue.set(this.getCaseInsensitiveProp(c?.tempMods, stat) || 0);
    this.editingTempMod.set({ combatantId: id, stat });
  }
  closeTempModModal = () => this.editingTempMod.set(null);
  setTempModValue = (val: any) => this.tempModValue.set(Number(val));
  async handleSetTempMod() {
    const modInfo = this.editingTempMod(); if (!modInfo) return;
    const val = this.tempModValue();
    const combatant = this.combatants().find(c => c._id === modInfo.combatantId);
    if (!combatant) return;
    const updatedMods = { ...(combatant.tempMods || {}), [modInfo.stat]: val };
    if (val === 0) delete updatedMods[modInfo.stat];
    this.logAction(`Set temporary modifier for ${modInfo.stat} on ${combatant.name} to ${val}.`);
    await this.handleUpdateCombatant(modInfo.combatantId, 'tempMods', updatedMods);
    this.closeTempModModal();
  }
  
  topLevelCategoryOptions = computed<string[]>(() => {
    const codexData = this.codex();
    if (!codexData) return ['Custom', 'Find', 'Found'];
    const sources = Object.keys(codexData).filter(key => {
      const node = codexData[key];
      return typeof node === 'object' && node !== null && node.isCombatManagerSource === true;
    });
    return ['Custom', 'Find', 'Found', ...sources.sort()];
  });

  cascadingDropdowns = computed<CascadingDropdown[]>(() => {
    const source = this.addFormSource();
    if (!source || ['Custom', 'Found', 'Find', ''].includes(source)) return [];
    const dropdowns: CascadingDropdown[] = [];
    let currentPath = [source];
    let pathIdx = 0;
    while(true) {
      const node = this.getNodeFromCodex(currentPath);
      if (!node || typeof node !== 'object' || Array.isArray(node.content)) { break; }
      const options = Object.keys(node).filter(key => {
        const child = node[key];
        return typeof child === 'object' && child !== null && !['summary', 'content', 'category', 'isCombatManagerSource', 'enableCompletionTracking', 'isCompleted', 'path_components'].includes(key);
      });
      if (options.length === 0) break;
      dropdowns.push({ level: pathIdx, options: options.sort() });
      const nextSegment = this.selectedCodexPath()[pathIdx];
      if (nextSegment) { currentPath.push(nextSegment); pathIdx++; } else { break; }
    }
    return dropdowns;
  });

  handleSourceChange(source: string) {
    this.addFormSource.set(source);
    this.selectedCodexPath.set([]);
    this.selectedFoundCreatureId.set(null);
  }

  handlePathChange(index: number, value: string) {
    this.selectedCodexPath.update(currentPath => {
      const newPath = currentPath.slice(0, index);
      if (value) { newPath.push(value); }
      return newPath;
    });
  }

private buildCodexObject(entries: any[]): any {
    // Define `root` with a type that allows string keys.
    const root: Record<string, any> = {};

    if (!Array.isArray(entries)) {
      console.error("Codex data is not an array:", entries);
      return root;
    }

    entries.sort((a, b) => (a.path_components?.length || 0) - (b.path_components?.length || 0));

    for (const entry of entries) {
      if (!entry.path_components) continue;

      // Start target at the root for each entry.
      let target: Record<string, any> = root;

      // The 'as string[]' cast helps ensure keys are strings.
      for (const key of entry.path_components as string[]) {
        // Check if the next level exists, if not, create it.
        if (!target[key]) {
          target[key] = {};
        }
        // Move to the next level in the object.
        target = target[key];
      }
      // Once at the correct location, merge the entry's data.
      Object.assign(target, entry);
    }
    return root;
  }

  private getNodeFromCodex(path: string[]): any {
    let node = this.codex();
    for (const key of path) { if (node && node[key]) { node = node[key]; } else { return null; } }
    return node;
  }

  filteredFoundCreatures = computed(() => this.foundCreatures().filter(c => c.name.toLowerCase().includes(this.foundCreatureFilter().toLowerCase())));

  modifiedCombatants = computed<CombatantWithModifiers[]>(() => {
    return this.combatants().map(c => {
        const entity = c.entityId ? this.entitiesCache().find(e => e.id === c.entityId) : null;
        const baseStats = this.calculateCompleteBaseStats(c.stats);
        baseStats.SavesObject = this.parseSaves(this.getCaseInsensitiveProp(baseStats, 'Saves'), baseStats);
        
        const allFeats = entity ? (entity.rules || []).map(id => ({ id, ...this.rulesCache().get(id) })).filter(f => f.name) : [];
        
        const mappedEquipment = entity ? (entity.equipment || []).map(id => ({ id, ...this.equipmentCache().get(id), isMagic: false })).filter(e => e.name) : [];
        const mappedMagicItems = entity ? (entity.magicItems || []).map(id => ({ id, ...this.magicItemsCache().get(id), isMagic: true })).filter(mi => mi.name) : [];

        const combinedItemsMap = new Map<string, any>();
        [...mappedEquipment, ...mappedMagicItems].forEach(item => {
            if (item.id) { // Ensure item has an ID
                // Prioritize magic item version if an item with the same ID exists
                if (combinedItemsMap.has(item.id) && !item.isMagic) {
                    return; 
                }
                combinedItemsMap.set(item.id, item);
            }
        });
        const uniqueItems = Array.from(combinedItemsMap.values());

        const equipment = uniqueItems.filter(item => !item.isMagic);
        const magicItems = uniqueItems.filter(item => item.isMagic);
        let spellIds: string[] = [];
        if (entity && entity.spells && typeof entity.spells === 'object') {
          spellIds = Object.values(entity.spells).flat();
        }
        const spells = entity ? (spellIds).map(id => ({ id, ...this.spellsCache().get(id) })).filter(s => s.name) : [];

        const allMods: { [stat: string]: { [type: string]: (number | string)[] } } = {};
        const addMod = (stat: string, type: string, value: number | string) => {
            if (!allMods[stat]) allMods[stat] = {};
            if (!allMods[stat][type]) allMods[stat][type] = [];
            allMods[stat][type].push(value);
        };

        (c.effects || []).forEach(effect => {
            const cached = this.effectsCache().get(effect.name);
            if (cached?.data?.modifiers) Object.entries(cached.data.modifiers).forEach(([s, m]: [string, any]) => addMod(s, m.type, m.value));
        });
        Object.entries(c.tempMods || {}).forEach(([s, v]) => addMod(s, 'untyped', v));
        (c.activeFeats || []).forEach(featId => {
            const featData = this.rulesCache().get(featId);
            if (featData?.effects) featData.effects.forEach((eff: any) => addMod(eff.target, eff.type, eff.value));
        });

        const finalBonuses: { [key: string]: number } = {};
        const stringyMods: { [key: string]: string[] } = {};

        for (const stat in allMods) {
            finalBonuses[stat] = 0;
            stringyMods[stat] = [];
            for (const type in allMods[stat]) {
                const numVals = allMods[stat][type].filter((v): v is number => typeof v === 'number');
                stringyMods[stat].push(...allMods[stat][type].filter((v): v is string => typeof v === 'string'));
                if (numVals.length > 0) {
                    if (['dodge', 'untyped', 'penalty', 'circumstance', 'morale', 'competence'].includes(type)) finalBonuses[stat] += numVals.reduce((s, v) => s + v, 0);
                    else {
                        const pos = numVals.filter(v => v > 0);
                        const neg = numVals.filter(v => v < 0);
                        if (pos.length > 0) finalBonuses[stat] += Math.max(...pos);
                        if (neg.length > 0) finalBonuses[stat] += Math.min(...neg);
                    }
                }
            }
        }
        
        const modifiedStats: { [key: string]: any } = { ...baseStats };
        const modifiedSaves = { ...baseStats.SavesObject };

        for(const stat in finalBonuses) {
            const bonus = finalBonuses[stat];
            if (stat === 'Saves') { modifiedSaves.Fort += bonus; modifiedSaves.Ref += bonus; modifiedSaves.Will += bonus; }
            else if (['Reflex', 'Ref'].includes(stat)) modifiedSaves.Ref += bonus;
            else if (['Fortitude', 'Fort'].includes(stat)) modifiedSaves.Fort += bonus;
            else if (stat === 'Will') modifiedSaves.Will += bonus;
            else if (typeof this.getCaseInsensitiveProp(modifiedStats, stat) !== 'undefined') {
                const baseVal = parseInt(String(this.getCaseInsensitiveProp(modifiedStats, stat)).match(/-?\\d+/)?.[0] || '0', 10);
                if (!isNaN(baseVal)) modifiedStats[stat] = baseVal + bonus;
            }
        }
        (stringyMods['Speed'] || []).forEach(v => { if (v === 'half') modifiedStats['Speed'] = `${Math.floor(parseInt(String(this.getCaseInsensitiveProp(modifiedStats, 'Speed')).match(/\\d+/)?.[0] || '30', 10) / 2)} ft.`; });

        const dexModDiff = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(modifiedStats, 'Dex')) - this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(baseStats, 'Dex'));
        const conModDiff = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(modifiedStats, 'Con')) - this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(baseStats, 'Con'));
        const wisModDiff = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(modifiedStats, 'Wis')) - this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(baseStats, 'Wis'));
        modifiedSaves.Ref += dexModDiff; modifiedSaves.Fort += conModDiff; modifiedSaves.Will += wisModDiff;
        modifiedStats['AC'] = (this.getCaseInsensitiveProp(modifiedStats, 'AC') || 10) + dexModDiff;
        modifiedStats['Touch'] = (this.getCaseInsensitiveProp(modifiedStats, 'Touch') || 10) + dexModDiff;
        if (conModDiff !== 0) {
            const lvl = this.getCaseInsensitiveProp(baseStats, 'Level') || parseInt(String(this.getCaseInsensitiveProp(baseStats, 'HP') || '1d8').match(/\((\d+)d\d+/)?.[1] || '1', 10);
            modifiedStats['maxHp'] = (c.maxHp || 10) + (conModDiff * lvl);
            if (modifiedStats['maxHp'] < 1) modifiedStats['maxHp'] = 1;
        } else modifiedStats['maxHp'] = c.maxHp || this.getCaseInsensitiveProp(baseStats, 'maxHp');
        modifiedStats['Saves'] = this.formatSaves(modifiedSaves);
        modifiedStats['SavesObject'] = modifiedSaves;
        
        const initiativeMod = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(modifiedStats, 'Dex'));
        
        const naturalAttacks = this.parseAttacks(baseStats);
        const weaponAttacks = this.generateAttacksFromWeapons(c, baseStats, modifiedStats, allFeats, equipment, magicItems);
        let allAttacks = [...naturalAttacks, ...weaponAttacks];

        if (!allAttacks.some(a => a.name.toLowerCase().includes('unarmed strike'))) {
            const strMod = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(modifiedStats, 'Str'));
            const bab = this.getCaseInsensitiveProp(modifiedStats, 'BAB') || 0;
            const hasImprovedUnarmedStrike = allFeats.some(f => f.name === 'Improved Unarmed Strike');
    
            const unarmedAttackBonus = bab + strMod;
            const formattedBonus = unarmedAttackBonus >= 0 ? `+${unarmedAttackBonus}` : `${unarmedAttackBonus}`;
            
            const strDamageBonus = strMod > 0 ? `+${strMod}` : strMod !== 0 ? ` ${strMod}` : '';
            const unarmedDamage = `1d3${strDamageBonus}${hasImprovedUnarmedStrike ? '' : ' (nonlethal)'}`;
    
            allAttacks.push({ name: 'Unarmed Strike', bonus: formattedBonus, damage: unarmedDamage });
        }

        const skills = this.parseAndRecalculateSkills(baseStats, modifiedStats, finalBonuses);

        return { ...c, baseStats, modifiedStats, initiativeMod, attacks: allAttacks, allFeats, equipment, magicItems, spells, skills };
    }).sort((a, b) => {
      const initA = a.initiative || 0;
      const initB = b.initiative || 0;
      if (initA !== initB) {
        return initB - initA;
      }
      const modA = a.initiativeMod || 0;
      const modB = b.initiativeMod || 0;
      if (modA !== modB) {
        return modB - modA;
      }
      return a.name.localeCompare(b.name);
    });
  });
  
  getCaseInsensitiveProp(obj: any, key: string): any {
    if (!obj || typeof obj !== 'object' || !key) return undefined;
    const objKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    return objKey ? obj[objKey] : undefined;
  }

  getAbilityModifierAsNumber = (score: any): number => {
    const numScore = parseInt(String(score).match(/-?\d+/)?.[0] || '10', 10);
    if (isNaN(numScore)) return 0;
    return Math.floor((numScore - 10) / 2);
  };

  calculateAverageHp = (diceString: string): number => {
    const match = String(diceString).match(/(\d+)d(\d+)\s*([+-]\s*\d+)?/);
    if (!match) {
        const singleNumber = parseInt(diceString, 10);
        return isNaN(singleNumber) ? 10 : singleNumber;
    }
    const numDice = parseInt(match[1], 10);
    const dieSize = parseInt(match[2], 10);
    const modifier = parseInt((match[3] || '0').replace(/\s/g, ''), 10);

    const averageRoll = (dieSize + 1) / 2;
    return Math.floor(numDice * averageRoll) + modifier;
  };

  // Compute HP according to option: 'average' | 'rolled' | 'max'
  computeHpFromString = (hpString: string, option: 'average' | 'rolled' | 'max'): number => {
    if (!hpString) return 10;
    const diceMatch = hpString.match(/(\d+)d(\d+)(?:\s*([+-]\s*\d+))?/i);
    if (!diceMatch) {
      const num = parseInt(hpString.replace(/[^0-9-]/g, ''), 10);
      return isNaN(num) ? 10 : num;
    }
    const numDice = parseInt(diceMatch[1], 10);
    const dieSize = parseInt(diceMatch[2], 10);
      const modifier = diceMatch[3] ? parseInt(diceMatch[3].replace(/\s/g, ''), 10) : 0;
    if (option === 'average') {
      const averageRoll = (dieSize + 1) / 2;
      return Math.max(1, Math.floor(numDice * averageRoll) + modifier);
    } else if (option === 'max') {
      return Math.max(1, numDice * dieSize + modifier);
    } else { // rolled
      let total = 0;
      for (let i = 0; i < numDice; i++) total += this.rollDice(dieSize);
      total += modifier;
      return Math.max(1, total);
    }
  }

  rollDice = (sides: number) => Math.floor(Math.random() * sides) + 1;

  // Damage / healing helpers
  setHpAdjustment = (combatantId: string, val: number) => {
    this.hpAdjustment.update(m => m.set(combatantId, Number(val)));
  }

  getHpAdjustment = (combatantId: string) => this.hpAdjustment().get(combatantId) || 0;

  async applyDamage(combatantId: string) {
    const dmg = this.getHpAdjustment(combatantId);
    if (!dmg || isNaN(dmg)) return;
    const c = this.combatants().find(x => x._id === combatantId);
    if (!c) return;
    const newHp = Math.max(0, (c.hp || 0) - Math.abs(dmg));
    await this.handleUpdateCombatant(combatantId, 'hp', newHp);
    this.hpAdjustment.update(m => { m.set(combatantId, 0); return m; });
  }

  async applyHeal(combatantId: string) {
    const heal = this.getHpAdjustment(combatantId);
    if (!heal || isNaN(heal)) return;
    const c = this.combatants().find(x => x._id === combatantId);
    if (!c) return;
  const modified = this.modifiedCombatants().find(m => m._id === combatantId);
  const maxHp = c.maxHp || (modified ? (modified.modifiedStats?.maxHp || 0) : 0);
    const newHp = Math.min(maxHp, (c.hp || 0) + Math.abs(heal));
    await this.handleUpdateCombatant(combatantId, 'hp', newHp);
    this.hpAdjustment.update(m => { m.set(combatantId, 0); return m; });
  }

  calculateCompleteBaseStats = (stats: any): any => {
    const newStats: { [key: string]: any } = { ...(stats || {}) };
    const abilities = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
    abilities.forEach(ability => { if (this.getCaseInsensitiveProp(newStats, ability) === undefined) newStats[ability] = 10; });

    const strMod = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(newStats, 'Str'));
    const dexMod = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(newStats, 'Dex'));
    const conMod = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(newStats, 'Con'));
    const wisMod = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(newStats, 'Wis'));

    let acValue = this.getCaseInsensitiveProp(newStats, 'AC');
    if (typeof acValue === 'string') {
        const acMatch = acValue.match(/^(\d+)/);
        const touchMatch = acValue.match(/touch\s*(\d+)/);
        const ffMatch = acValue.match(/flat-footed\s*(\d+)/);
        if (acMatch) newStats['AC'] = parseInt(acMatch[1], 10);
        if (touchMatch) newStats['Touch'] = parseInt(touchMatch[1], 10);
        if (ffMatch) newStats['Flat-Footed'] = parseInt(ffMatch[1], 10);
    }
    if (typeof this.getCaseInsensitiveProp(newStats, 'AC') !== 'number') newStats['AC'] = 10 + dexMod;
    if (typeof this.getCaseInsensitiveProp(newStats, 'Touch') !== 'number') newStats['Touch'] = 10 + dexMod;
    if (typeof this.getCaseInsensitiveProp(newStats, 'Flat-Footed') !== 'number') newStats['Flat-Footed'] = (newStats['AC'] || 10) - dexMod;

    if (!this.getCaseInsensitiveProp(newStats, 'Saves')) {
        const level = parseInt(String(this.getCaseInsensitiveProp(newStats, 'Level') || this.getCaseInsensitiveProp(newStats, 'CR') || 1), 10);
        const safeLevelIndex = Math.max(0, Math.min(level - 1, GOOD_SAVES.length - 1));
        const baseFort = POOR_SAVES[safeLevelIndex] + conMod;
        const baseRef = POOR_SAVES[safeLevelIndex] + dexMod;
        const baseWill = POOR_SAVES[safeLevelIndex] + wisMod;
        const formatMod = (mod: number) => mod >= 0 ? `+${mod}` : String(mod);
        newStats['Saves'] = `Fort ${formatMod(baseFort)}, Ref ${formatMod(baseRef)}, Will ${formatMod(baseWill)}`;
    }

    if (!this.getCaseInsensitiveProp(newStats, 'Speed')) newStats['Speed'] = '30 ft.';
    newStats['BAB'] = parseInt(String(this.getCaseInsensitiveProp(newStats, 'Base Attack Bonus') || this.getCaseInsensitiveProp(newStats, 'BAB') || 0).match(/-?\d+/)?.[0] || '0', 10);
    if (typeof this.getCaseInsensitiveProp(newStats, 'CMB') !== 'number') newStats['CMB'] = newStats['BAB'] + strMod;
    if (typeof this.getCaseInsensitiveProp(newStats, 'CMD') !== 'number') newStats['CMD'] = 10 + newStats['BAB'] + strMod + dexMod;
    
    const hpValue = this.getCaseInsensitiveProp(newStats, 'hp') || this.getCaseInsensitiveProp(newStats, 'HP') || '1d8';
    const avgHpMatch = String(hpValue).match(/^(\d+)/);
    const diceInParenMatch = String(hpValue).match(/\(\s*(\d+d\d+[+-]?\s*\d*\s*)\)/);
    if (avgHpMatch) newStats['maxHp'] = parseInt(avgHpMatch[1], 10);
    else if (diceInParenMatch) newStats['maxHp'] = this.calculateAverageHp(diceInParenMatch[1]);
    else newStats['maxHp']= this.calculateAverageHp(String(hpValue));
    if (isNaN(newStats['maxHp']) || newStats['maxHp'] <= 0) newStats['maxHp'] = 10;

    return newStats;
  };
  
  getAbilityModifier(score: any): string {
    const mod = this.getAbilityModifierAsNumber(score);
    return isNaN(mod) ? '' : (mod >= 0 ? `+${mod}` : `${mod}`);
  }

  parseSaves = (s: any, stats: any) => {
    const res = { Fort: 0, Ref: 0, Will: 0 };
    if (typeof s === 'string') {
        res.Fort = parseInt(s.match(/Fort\s*([+-]?\d+)/i)?.[1]||'0',10);
        res.Ref = parseInt(s.match(/Ref\s*([+-]?\d+)/i)?.[1]||'0',10);
        res.Will = parseInt(s.match(/Will\s*([+-]?\d+)/i)?.[1]||'0',10);
    } else {
        res.Fort=this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(stats, 'Con')); 
        res.Ref=this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(stats, 'Dex')); 
        res.Will=this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(stats, 'Wis'));
    }
    return res;
  }
  formatSaves = (s: {Fort:number;Ref:number;Will:number}) => `Fort ${s.Fort>=0?'+':''}${s.Fort}, Ref ${s.Ref>=0?'+':''}${s.Ref}, Will ${s.Will>=0?'+':''}${s.Will}`;
  parseAttacks = (s: any) => {
    const attacks: ParsedAttack[] = [];
    const melee = this.getCaseInsensitiveProp(s, 'Melee') || '';
    const ranged = this.getCaseInsensitiveProp(s, 'Ranged') || '';
    const parse = (str: string) => {
      const regex = /(.+?)\s*([+-]\d+(?:\/[+-]\d+)*)\s*\((.+?)\)/g;
      let m; while ((m = regex.exec(str)) !== null) attacks.push({ name: m[1].trim(), bonus: m[2].trim(), damage: m[3].trim() });
    };
    parse(melee); parse(ranged);
    return attacks;
  }
  
  private generateAttacksFromWeapons(
    c: Combatant, 
    baseStats: any, 
    modifiedStats: any, 
    allFeats: any[],
    equipment: any[],
    magicItems: any[]
): ParsedAttack[] {
    const weaponAttacks: ParsedAttack[] = [];
    const allItems = [...equipment, ...magicItems];
    const weapons = allItems.filter(item => item.type === 'weapon' && item.properties);

    const hasWeaponFinesse = allFeats.some(f => f.name === 'Weapon Finesse');
    const powerAttackFeat = allFeats.find(f => f.name === 'Power Attack');
    const hasPowerAttack = powerAttackFeat && (c.activeFeats || []).includes(powerAttackFeat.id);

    for (const weapon of weapons) {
        const props = weapon.properties || {};
        const weaponName = weapon.name || 'Unknown Weapon';
        const lowerWeaponName = weaponName.toLowerCase();
        
        const isRanged = props.range || lowerWeaponName.includes('bow') || lowerWeaponName.includes('crossbow') || lowerWeaponName.includes('sling');
        const isThrown = props.range && parseInt(props.range) > 0 && !lowerWeaponName.includes('bow') && !lowerWeaponName.includes('crossbow');
        const isLight = props.light || lowerWeaponName.includes('dagger') || lowerWeaponName.includes('shortsword') || lowerWeaponName.includes('handaxe');

        let attackAbilityMod = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(modifiedStats, 'Str'));
        let damageAbilityMod = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(modifiedStats, 'Str'));
        
        if (isRanged && !isThrown) {
            attackAbilityMod = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(modifiedStats, 'Dex'));
            const isComposite = lowerWeaponName.includes('composite');
            damageAbilityMod = isComposite ? this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(modifiedStats, 'Str')) : 0; 
        } else if (hasWeaponFinesse && isLight) {
            attackAbilityMod = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(modifiedStats, 'Dex'));
        }

        const enhancementBonusMatch = weaponName.match(/^(\+\d+)/);
        const enhancementBonus = enhancementBonusMatch ? parseInt(enhancementBonusMatch[1], 10) : 0;
        
        let powerAttackPenalty = 0;
        let powerAttackDamage = 0;
        if(hasPowerAttack && !isRanged) {
            const bab = this.getCaseInsensitiveProp(modifiedStats, 'BAB') || 0;
            powerAttackPenalty = bab >= 12 ? -4 : bab >= 8 ? -3 : bab >= 4 ? -2 : -1;
            powerAttackDamage = Math.abs(powerAttackPenalty) * 2;
        }

        const totalAttackBonus = (this.getCaseInsensitiveProp(modifiedStats, 'BAB') || 0) + attackAbilityMod + enhancementBonus + powerAttackPenalty;
        const formattedAttackBonus = totalAttackBonus >= 0 ? `+${totalAttackBonus}` : `${totalAttackBonus}`;

        let totalDamageBonus = damageAbilityMod + enhancementBonus + powerAttackDamage;
        let damageString = props.damage_m || '1d6';
        if (totalDamageBonus !== 0) {
            damageString += totalDamageBonus > 0 ? `+${totalDamageBonus}` : ` ${totalDamageBonus}`;
        }
        
        const critString = props.critical ? ` (${props.critical})` : '';
        
        weaponAttacks.push({ name: weaponName, bonus: formattedAttackBonus, damage: `${damageString}${critString}`.trim() });
    }
    return weaponAttacks;
  }

  private parseAndRecalculateSkills(baseStats: any, modifiedStats: any, finalBonuses: { [key: string]: number }): { [key: string]: number } {
    const skills: { [key: string]: number } = {};
    const skillsObject = this.getCaseInsensitiveProp(baseStats, 'skills');
    if (skillsObject && typeof skillsObject === 'object' && Object.keys(skillsObject).length > 0) {
        return skillsObject;
    }
    const skillsString = this.getCaseInsensitiveProp(baseStats, 'Skills') || '';
    if (!skillsString) return {};
    const skillEntries = skillsString.split(',');

    const baseAbilityMods = {
        'Str': this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(baseStats, 'Str')),
        'Dex': this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(baseStats, 'Dex')),
        'Con': this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(baseStats, 'Con')),
        'Int': this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(baseStats, 'Int')),
        'Wis': this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(baseStats, 'Wis')),
        'Cha': this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(baseStats, 'Cha'))
    };

    for (const entry of skillEntries) {
        const match = entry.trim().match(/^(.*?)\s*([+-]\d+)/);
        if (match) {
            let skillName = match[1].trim();
            const originalBonus = parseInt(match[2], 10);
            
            // Normalize Knowledge skills for mapping
            const simpleSkillName = skillName.startsWith('Knowledge') ? 'Knowledge (arcana)' : skillName;
            
            const governingAbility = SKILL_ABILITY_MAP[simpleSkillName];
            
            if (governingAbility) {
                const baseAbilityMod = baseAbilityMods[governingAbility] || 0;
                const ranksAndMisc = originalBonus - baseAbilityMod;

                const modifiedAbilityMod = this.getAbilityModifierAsNumber(this.getCaseInsensitiveProp(modifiedStats, governingAbility));
                const genericSkillPenalty = finalBonuses['Skill Checks'] || 0;

                const finalBonus = ranksAndMisc + modifiedAbilityMod + genericSkillPenalty;
                skills[skillName] = finalBonus;
            } else {
                skills[skillName] = originalBonus; 
            }
        }
    }
    return skills;
  }

  getCacheForType = (t: 'rule' | 'equipment' | 'magic-item' | 'effect' | 'spell') => {
    if (t === 'rule') return this.rulesCache;
    if (t === 'equipment') return this.equipmentCache;
    if (t === 'magic-item') return this.magicItemsCache;
    if (t === 'spell') return this.spellsCache;
    return this.effectsCache;
  }

  showTooltip(e:MouseEvent, id: string, type: 'rule' | 'equipment' | 'magic-item' | 'effect' | 'spell') {
    const cache = this.getCacheForType(type)();
    const item = cache.get(id);
    this.tooltipContent.set({ title: item?.name || 'Unknown', data: item, status: item ? 'loaded' : 'error' });
    this.tooltipPosition.set({ top: `${e.clientY + 15}px`, left: `${e.clientX + 15}px` });
  }
  showSkillsTooltip(e: MouseEvent, combatant: CombatantWithModifiers) {
      if (!combatant.skills || Object.keys(combatant.skills).length === 0) {
          this.tooltipContent.set({ title: 'Skills', data: { description: 'This combatant has no listed skills.' }, status: 'loaded' });
      } else {
          const description = Object.entries(combatant.skills)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, bonus]) => `${name} ${bonus >= 0 ? '+' : ''}${bonus}`)
              .join('\n');
          this.tooltipContent.set({ title: `${combatant.name}'s Skills`, data: { description }, status: 'loaded' });
      }
      this.tooltipPosition.set({ top: `${e.clientY + 15}px`, left: `${e.clientX + 15}px` });
  }

  hideTooltip = () => this.tooltipContent.set(null);
  
  objectKeys = (obj: any) => obj ? Object.keys(obj) : [];
  formatTime = (t: any) => {
    if (!t) return '';
    
    let date;
    // Check if 't' is a Firebase Timestamp object
    if (t && typeof t.toDate === 'function') {
      date = t.toDate();
    } else {
      date = new Date(t);
    }

    if (isNaN(date.getTime())) {
      return ''; // Handle invalid date
    }

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // getMonth() is 0-indexed
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };
  formatName(name: string): string { return name ? name.replace(/_/g, ' ').replace(/-/g, ' ') : ''; } 
  
  formatModelName(name: string): string {
    if (!name) return '';
    return name.replace('models/', '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  trackFight(index: number, fight: Fight) { return fight._id; }

  editingCombatantStats = signal<CombatantWithModifiers | null>(null);
  openStatEditModal(combatant: CombatantWithModifiers) { this.editingCombatantStats.set(combatant); }
  closeStatEditModal() { this.editingCombatantStats.set(null); }
  async handleUpdateCombatantStat(combatantId: string, statName: string, value: any) {
    const combatant = this.combatants().find(c => c._id === combatantId);
    if (!combatant) return;

    const newStats = { ...combatant.stats, [statName]: Number(value) };
    await this.handleUpdateCombatant(combatantId, 'stats', newStats);

    const updatedCombatantInModal = this.modifiedCombatants().find(c => c._id === combatantId);
    if (updatedCombatantInModal) {
        this.editingCombatantStats.set(updatedCombatantInModal);
    }
  }


  editingCombatantResistances = signal<CombatantWithModifiers | null>(null);
  editingCombatantSkills = signal<CombatantWithModifiers | null>(null);
  editingCombatantSpellSlots = signal<CombatantWithModifiers | null>(null);
  newSkill = signal<{name: string, rank: number}>({name: '', rank: 0});
  
  openResistancesModal(combatant: CombatantWithModifiers) { this.editingCombatantResistances.set(combatant); }
  closeResistancesModal() { this.editingCombatantResistances.set(null); }
  async handleUpdateResistances(combatant: CombatantWithModifiers, resistances: any) {
      const newStats = { ...combatant.stats, ...resistances };
      await this.handleUpdateCombatant(combatant._id, 'stats', newStats);
      this.closeResistancesModal();
  }
  
  openSkillsModal(combatant: CombatantWithModifiers) { this.editingCombatantSkills.set(combatant); }
  closeSkillsModal() { this.editingCombatantSkills.set(null); this.newSkill.set({name: '', rank: 0}); }
  async handleUpdateSkill(combatant: CombatantWithModifiers, skillName: string, rank: number) {
      if (!skillName) return;
      const skills = this.getCaseInsensitiveProp(combatant.stats, 'skills') || {};
      const newSkills = { ...skills, [skillName]: rank };
      const newStats = { ...combatant.stats, skills: newSkills };
      await this.handleUpdateCombatant(combatant._id, 'stats', newStats);
      combatant.stats = newStats; // Refresh the modal view
      this.editingCombatantSkills.set({...combatant});
  }
  async handleRemoveSkill(combatant: CombatantWithModifiers, skillName: string) {
      const skills = this.getCaseInsensitiveProp(combatant.stats, 'skills') || {};
      const newSkills = { ...skills };
      delete newSkills[skillName];
      const newStats = { ...combatant.stats, skills: newSkills };
      await this.handleUpdateCombatant(combatant._id, 'stats', newStats);
      combatant.stats = newStats; // Refresh the modal view
      this.editingCombatantSkills.set({...combatant});
  }

  openSpellSlotsModal(combatant: CombatantWithModifiers) { this.editingCombatantSpellSlots.set(combatant); }
  closeSpellSlotsModal() { this.editingCombatantSpellSlots.set(null); }
  async handleUpdateSpellSlots(combatantId: string, spellSlots: any) {
      await this.handleUpdateCombatant(combatantId, 'spellSlots', spellSlots);
      this.closeSpellSlotsModal();
  }

  isSelfCast(spell: Spell): boolean {
    if (!spell || !spell.range) return false;
    const range = spell.range.toLowerCase();
    return range === 'personal' || range.includes('self');
  }

  parseSpellDuration(durationStr: string): { value: number, unit: 'rounds' | 'minutes' | 'hours' | 'days' | 'permanent' } {
      if (!durationStr) return { value: 1, unit: 'minutes' };
      const d = durationStr.toLowerCase();

      if (d.includes('permanent')) return { value: 999, unit: 'permanent' };
      if (d.includes('instantaneous')) return { value: 1, unit: 'rounds' };

      const timeRegex = /(\d+)\s*(round|minute|hour|day)/;
      const match = d.match(timeRegex);

      if (match) {
          const value = parseInt(match[1], 10);
          const unitStr = match[2];
          let unit: 'rounds' | 'minutes' | 'hours' | 'days' = 'rounds';
          if (unitStr === 'minute') unit = 'minutes';
          else if (unitStr === 'hour') unit = 'hours';
          else if (unitStr === 'day') unit = 'days';
          
          return { value, unit };
      }
      
      return { value: 1, unit: 'minutes' };
  }

  async deductSpellSlot(combatantId: string, spellLevel: number) {
    const combatant = this.combatants().find(c => c._id === combatantId);
    if (!combatant || !combatant.spellSlots || combatant.spellSlots[spellLevel] === undefined) {
      return;
    }

    const currentSlots = combatant.spellSlots[spellLevel];
    if (currentSlots > 0) {
      const newSlots = { ...combatant.spellSlots, [spellLevel]: currentSlots - 1 };
      await this.handleUpdateCombatant(combatantId, 'spellSlots', newSlots);
      this.logAction(`Used a level ${spellLevel} spell slot for ${combatant.name}.`);
    } else {
      this.logAction(`Attempted to use a level ${spellLevel} spell slot for ${combatant.name}, but none were available.`);
    }
  }

  async handleCastSpell(caster: CombatantWithModifiers, spell: Spell, targetId: string) {
    // 1. Determine Target
    const target = this.combatants().find(c => c._id === targetId) || caster;

    // 2. Find Effect Data
    const effectName = spell.name;
    let effectData = this.effectsCache().get(effectName)?.data;

    if (!effectData) {
      // Try to auto-lookup if missing
      await this.lookupTerm(effectName, 'effect');
      effectData = this.effectsCache().get(effectName)?.data;
    }

    if (!effectData || !effectData.modifiers) {
      alert(`Spell cast, but no mechanical effect found for "${spell.name}". Please create this effect in the Toolkit first.`);
      this.logAction(`${caster.name} cast '${spell.name}' on ${target.name}, but no effect applied.`);
      return;
    }

    // 3. Calculate Duration
    // Use caster's level if available, otherwise default to 1
    const casterLevel = this.getCaseInsensitiveProp(caster.baseStats, 'Level') || this.getCaseInsensitiveProp(caster.baseStats, 'CR') || 1;
    // You might want to improve parseSpellDuration to accept casterLevel for accurate rounds/level calculation
    const duration = this.parseSpellDuration(spell.duration); 

    const newEffect: CombatantEffect = {
      name: effectName,
      duration: duration.value, // NOTE: To make this accurate per-level, you'd need to enhance parseSpellDuration
      unit: duration.unit,
      startRound: this.roundCounter(),
      remainingRounds: duration.unit === 'permanent' ? 999 : duration.value
    };

    // 4. Apply to Target
    const updatedEffects = [...(target.effects || []), newEffect];
    this.logAction(`${caster.name} cast '${spell.name}' on ${target.name}.`);
    await this.handleUpdateCombatant(target._id, 'effects', updatedEffects);

    // 5. Deduct Slot from Caster
    if (spell.level !== undefined) {
      this.deductSpellSlot(caster._id, spell.level);
    }
  }


  addCustomEffect(combatantId: string) {
    if (!this.customEffectName.trim()) return;
    const effect: CombatantEffect = {
      name: this.customEffectName.trim(),
      duration: this.customEffectUnit === 'permanent' ? 0 : this.customEffectDuration,
      unit: this.customEffectUnit,
      startRound: this.roundCounter(),
      remainingRounds: this.customEffectUnit === 'permanent' ? 999 : (this.customEffectDuration)
    };
    const combatant = this.combatants().find(c => c._id === combatantId);
    if (!combatant) return;
    const updatedEffects = [...(combatant.effects || []), effect];
    this.handleUpdateCombatant(combatantId, 'effects', updatedEffects);
    this.showCustomEffectModal = null;
    this.customEffectName = '';
    this.customEffectDuration = 3;
    this.customEffectUnit = 'rounds';
  }
}
