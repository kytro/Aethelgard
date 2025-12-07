import { Component, signal, inject, input, computed, WritableSignal, effect, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import {
  formatTime, getAbilityModifierAsNumber, calculateCompleteBaseStats, getCaseInsensitiveProp,
  formatName, calculateAverageHp, getAbilityModifier, SKILL_ABILITY_MAP, SIZE_DATA,
  CONSTRUCT_HP_BONUS, calculateSkillBonus, CalculateStatsOptions,
  getArmorMaxDex, getArmorCheckPenalty, classifyNaturalAttack, isLightWeapon, LIGHT_WEAPONS
} from '../dm-toolkit.utils';

interface Fight { _id: string; name: string; createdAt: any; combatStartTime?: any; roundCounter?: number; currentTurnIndex?: number; log?: string[]; }
interface Combatant { _id: string; fightId: string; name: string; initiative: number | null; hp: number; maxHp: number; tempHp?: number; baseStats: any; effects: CombatantEffect[]; tempMods: { [key: string]: number }; activeFeats?: string[]; type?: string; entityId?: string; preparedSpells?: any[]; castSpells?: any[]; spellSlots?: { [level: string]: number }; }
interface CombatantEffect { name: string; duration: number; unit: 'rounds' | 'minutes' | 'permanent' | 'hours' | 'days'; startRound: number; remainingRounds: number; }
interface ParsedAttack { name: string; bonus: string; damage: string; }
interface Spell { id: string; name: string; level: number; school: string; castingTime: string; range: string; duration: string; savingThrow: string; spellResistance: string; description: string; }
interface CombatantWithModifiers extends Combatant { baseStats: any; modifiedStats: any; initiativeMod: number; attacks: ParsedAttack[]; allFeats: any[]; equipment: any[]; magicItems: any[]; spells: Spell[]; skills: { [key: string]: number }; }
interface FoundCreature { id: string; name: string; cr: string; stats: string; hp: string; }
interface CacheEntry { status: 'idle' | 'loading' | 'loaded' | 'error'; data: any; }
interface CascadingDropdown { level: number; options: string[]; }

@Component({
  selector: 'app-combat-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './combat-manager.html',
  styleUrls: []
})
export class CombatManagerComponent {
  @Output() fightAdded = new EventEmitter<Fight>();
  @Output() fightDeleted = new EventEmitter<string>();
  fights = input<Fight[]>([]);
  codex = input<any>();
  rulesCache = input<Map<string, any>>(new Map());
  equipmentCache = input<Map<string, any>>(new Map());
  magicItemsCache = input<Map<string, any>>(new Map());
  spellsCache = input<Map<string, any>>(new Map());
  effectsCache = input<Map<string, CacheEntry>>(new Map());
  entitiesCache = input<any[]>([]);
  foundCreatures = input<FoundCreature[]>([]);

  http = inject(HttpClient);

  currentFight: WritableSignal<Fight | null> = signal(null);
  combatants = signal<Combatant[]>([]);

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

  addFormSource = signal<string>('Custom');
  selectedCodexPath = signal<string[]>([]);
  selectedTemplate = signal('');
  templateOptions = signal<string[]>([]);
  selectedFoundCreatureId = signal<string | null>(null);

  showCustomEffectModal: string | null = null;
  customEffectName: string = '';
  customEffectDuration: number = 3;
  customEffectUnit: 'rounds' | 'minutes' | 'hours' | 'days' | 'permanent' = 'rounds';

  editingCombatantStats = signal<CombatantWithModifiers | null>(null);
  editingCombatantResistances = signal<CombatantWithModifiers | null>(null);
  editingCombatantSkills = signal<CombatantWithModifiers | null>(null);
  newSkill = signal<{ name: string; rank: number }>({ name: '', rank: 0 });
  editingCombatantSpellSlots = signal<CombatantWithModifiers | null>(null);

  METADATA_KEYS = [
    'summary', 'content', 'category', 'isCombatManagerSource',
    'enableCompletionTracking', 'isCompleted', 'path_components',
    'baseStats', 'entityId', 'id', 'rules', 'equipment',
    'magicItems', 'spells'
  ];

  commonEffects = [
    'Blinded', 'Bleed', 'Confused', 'Cowering', 'Dazed', 'Dazzled', 'Deafened',
    'Entangled', 'Exhausted', 'Fascinated', 'Fatigued', 'Flat-Footed', 'Frightened',
    'Grappled', 'Helpless', 'Invisible', 'Nauseated', 'Panicked', 'Paralyzed',
    'Petrified', 'Pinned', 'Prone', 'Shaken', 'Sickened', 'Staggered', 'Stunned',
    'Unconscious', 'Haste', 'Slow', 'Bless', 'Bane', 'Enlarged', 'Reduced'
  ].sort();

  // Exposed helpers for template
  formatTime = formatTime;
  getCaseInsensitiveProp = getCaseInsensitiveProp;
  getAbilityModifier = getAbilityModifier;
  formatName = formatName;
  objectKeys = Object.keys;

  constructor() {
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

    // Reset template on source change
    effect(() => {
      const source = this.addFormSource();
      const path = this.selectedCodexPath();
      // Always reset template selection and options when path changes
      this.selectedTemplate.set('');
      this.templateOptions.set([]);

      if (!source || ['Custom', 'Found', 'Find'].includes(source)) {
        return;
      }

      const fullPath = [source, ...path];
      const node = this.getNodeFromCodex(fullPath);

      if (!node) return;

      let optionsFromContent: string[] = [];

      // Case 1: Node has a 'content' array (simple list of templates)
      // Check if content exists and is NOT rich text (which contains blocks with 'type')
      if (Array.isArray(node.content)) {
        const isRichText = node.content.some((c: any) => c.type === 'heading' || c.type === 'paragraph' || c.type === 'statblock' || c.type === 'table');
        if (!isRichText) {
          optionsFromContent = node.content.map((item: any) => typeof item === 'string' ? item : item.name).filter(Boolean);
        }
      }

      // Case 2: Node is an object that might contain templates (leaf nodes)
      let optionsFromChildren: string[] = [];
      if (typeof node === 'object') {
        const templateKeys = Object.keys(node).filter(key => {
          const child = node[key];
          // A child is a template if it's a valid object but not a navigable category itself.
          return typeof child === 'object' &&
            child !== null &&
            !this.METADATA_KEYS.includes(key) &&
            !this._isNavigable(child);
        });
        optionsFromChildren = templateKeys;
      }

      // Combine and set
      const allOptions = [...new Set([...optionsFromContent, ...optionsFromChildren])];
      if (allOptions.length > 0) {
        this.templateOptions.set(allOptions.sort().map(formatName));
      }
    });
  }

  private _isNavigable(node: any): boolean {
    if (typeof node !== 'object' || node === null) return false;

    // Logic changed: Don't exclude items just because they have an ID. 
    // If they have children, they are navigable categories (e.g. a City with residents).

    const childKeys = Object.keys(node).filter(key =>
      typeof node[key] === 'object' &&
      node[key] !== null &&
      !this.METADATA_KEYS.includes(key)
    );

    if (childKeys.length === 0) return false;

    // It IS navigable if it contains at least one navigable sub-category OR if it contains templates.
    return true;
  }

  async loadCombatants(fightId: string) {
    try {
      const combatants = await lastValueFrom(this.http.get<Combatant[]>(`/codex/api/dm-toolkit/fights/${fightId}/combatants`));
      this.combatants.set(combatants);
    } catch (e) { console.error(e); }
  }

  async logAction(message: string) {
    const fight = this.currentFight();
    if (!fight) return;
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = `[${timestamp}] ${message}`;
    const updatedLog = [...(fight.log || []), entry];
    this.currentFight.update(f => f ? ({ ...f, log: updatedLog }) : null);
    try {
      await lastValueFrom(this.http.patch(`/codex/api/dm-toolkit/fights/${fight._id}`, { log: updatedLog }));
    } catch (e) { console.error("Failed to save log entry:", e); }
  }

  async handleAddFight() {
    if (!this.newFightName.trim()) return;
    this.isSavingFight.set(true);
    try {
      const newFight = await lastValueFrom(this.http.post<any>('/codex/api/dm-toolkit/fights', { name: this.newFightName }));
      this.fightAdded.emit(newFight);
      this.newFightName = '';
    } catch (e) { console.error(e); }
    finally { this.isSavingFight.set(false); }
  }

  async handleDeleteFight(id: string) {
    if (!confirm('Are you sure you want to delete this fight?')) return;
    try {
      await lastValueFrom(this.http.delete(`/codex/api/dm-toolkit/fights/${id}`));
      this.fightDeleted.emit(id);
      if (this.currentFight()?._id === id) this.currentFight.set(null);
    } catch (e) { console.error(e); }
  }

  setCurrentFight(fight: Fight) {

    this.currentFight.set(fight);
  }

  updateCustomCombatant(field: 'name' | 'hp' | 'initiative', val: any) {
    this.customCombatant.update(c => ({ ...c, [field]: val }));
  }

  // --- NEW HELPER: Roll Initiative ---
  private rollInitiative(baseStats: any, rules: string[] = []): number {
    const dex = getCaseInsensitiveProp(baseStats, 'Dex') || 10;
    const dexMod = getAbilityModifierAsNumber(dex);

    let miscMod = 0;
    // Check for Improved Initiative in cached rules
    if (rules && rules.length > 0) {
      const hasImprovedInit = rules.some(ruleId => {
        const rule = this.rulesCache().get(ruleId);
        return rule && rule.name && rule.name.toLowerCase() === 'improved initiative';
      });
      if (hasImprovedInit) miscMod += 4;
    }

    const roll = Math.floor(Math.random() * 20) + 1;
    return roll + dexMod + miscMod;
  }

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
        if (!custom.name) throw new Error("Name required.");
        combatantData = {
          name: custom.name,
          initiative: +custom.initiative,
          hp: +custom.hp,
          maxHp: +custom.hp,
          type: 'Custom',
          baseStats: {}
        };
      } else {
        // Logic for Found/Bestiary/Templates
        let entityId: string | null = null;
        let hpVal = 10;
        let baseStats = {};
        let rules: string[] = [];

        if (source === 'Found') {
          entityId = this.selectedFoundCreatureId();
          if (!entityId) throw new Error("Select a creature.");
          const found = this.foundCreatures().find(f => f.id === entityId);
          if (found && found.hp) hpVal = this.computeHpFromString(String(found.hp), this.monsterHpOption);

          // Try to find cached entity for stats
          const cached = this.entitiesCache().find(e => e.id === entityId);
          if (cached) {
            baseStats = cached.baseStats || {};
            rules = cached.rules || [];
          }
        } else {
          const templateName = this.selectedTemplate();
          if (!templateName) throw new Error("Select a template.");

          // Resolve Codex Node
          const fullPath = [source, ...this.selectedCodexPath(), templateName].filter(Boolean);
          const node = this.getNodeFromCodex(fullPath);

          if (node) {
            if ((node as any).entityId) entityId = (node as any).entityId;
            else if ((node as any).id) entityId = (node as any).id;

            const hpField = getCaseInsensitiveProp((node as any).baseStats || node, 'hp') || getCaseInsensitiveProp((node as any).baseStats || node, 'HP');
            if (hpField) hpVal = this.computeHpFromString(String(hpField), this.monsterHpOption);

            baseStats = (node as any).baseStats || node;
          }

          if (!entityId) {
            // Fallback to cache search by name
            const entities = this.entitiesCache();
            const resolvedEntity = entities.find((e: any) => e.name === templateName || e.name === formatName(templateName));
            if (resolvedEntity) {
              entityId = resolvedEntity.id;
              baseStats = resolvedEntity.baseStats || {};
              rules = resolvedEntity.rules || [];
              if (hpVal === 10) { // Only recalc HP if we didn't find it in the node
                const hpField = getCaseInsensitiveProp(baseStats, 'hp');
                if (hpField) hpVal = this.computeHpFromString(String(hpField), this.monsterHpOption);
              }
            }
          }
        }

        if (!entityId && source !== 'Found') throw new Error(`Template not found.`);

        // Calculate Initiative
        const initRoll = this.rollInitiative(baseStats, rules);

        combatantData = {
          type: source,
          entityId: entityId || undefined,
          hp: hpVal,
          maxHp: hpVal,
          initiative: initRoll // Explicitly set initiative
        };
      }

      const newCombatant = await lastValueFrom(this.http.post<Combatant>(`/codex/api/dm-toolkit/fights/${fight._id}/combatants`, combatantData));

      // Update local state immediately
      this.combatants.update(c => [...c, newCombatant].sort((a, b) => (b.initiative || 0) - (a.initiative || 0) || a.name.localeCompare(b.name)));
      this.logAction(`${newCombatant.name} added. HP: ${newCombatant.hp}, Init: ${newCombatant.initiative}`);

      this.customCombatant.set({ name: '', initiative: 10, hp: 10 });
      // Don't clear source to allow rapid adding of same type
      this.selectedTemplate.set('');
      this.selectedFoundCreatureId.set(null);

    } catch (e: any) {
      console.error(e);
      alert(e.error?.message || e.message);
    } finally { this.isSavingCombatant.set(false); }
  }

  async handleRemoveCombatant(id: string) {
    const combatant = this.combatants().find(c => c._id === id);
    if (!combatant) return;
    this.logAction(`${combatant.name} removed.`);
    await lastValueFrom(this.http.delete(`/codex/api/dm-toolkit/combatants/${id}`));
    this.combatants.update(c => c.filter(cb => cb._id !== id));
  }

  async handleUpdateCombatant(id: string, field: keyof Combatant, val: any) {
    const combatant = this.combatants().find(c => c._id === id);
    if (!combatant) return;
    const valueToPatch = (typeof val === 'number' || !isNaN(+val)) && field !== 'effects' ? +val : val;
    await lastValueFrom(this.http.patch(`/codex/api/dm-toolkit/combatants/${id}`, { [field]: valueToPatch }));
    this.combatants.update(c => c.map(cb => cb._id === id ? { ...cb, [field]: valueToPatch } : cb));

    // Log the action
    const combatantName = combatant.name;
    const action = `Updated ${field} for ${combatantName} to ${valueToPatch}`;
    this.logAction(action);
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
      this.roundCounter.set(updatedFight.roundCounter || 1);
      this.currentTurnIndex.set(updatedFight.currentTurnIndex || 0);
      await this.loadCombatants(fight._id);
      const active = this.modifiedCombatants()[updatedFight.currentTurnIndex || 0];
      if (active) this.logAction(`Turn: ${active.name}.`);
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
      this.roundCounter.set(updatedFight.roundCounter || 1);
      this.currentTurnIndex.set(updatedFight.currentTurnIndex || 0);
      await this.loadCombatants(fight._id);
    } finally {
      this.isAdvancingTurn.set(false);
    }
  }

  // --- UPDATED: Swap Logic for cleaner integers ---
  async moveCombatant(combatantId: string, direction: 'up' | 'down') {
    const combatants = this.modifiedCombatants(); // Uses current sorted view
    const currentIndex = combatants.findIndex(c => c._id === combatantId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= combatants.length) return;

    const current = combatants[currentIndex];
    const target = combatants[targetIndex];

    const currentInit = current.initiative || 0;
    const targetInit = target.initiative || 0;

    // Swap initiatives
    await Promise.all([
      this.handleUpdateCombatant(current._id, 'initiative', targetInit),
      this.handleUpdateCombatant(target._id, 'initiative', currentInit)
    ]);
  }

  async handleFindCreature() {
    if (!this.findCreatureTerm) return;
    this.isFindingCreature.set(true);
    try {
      const creatures = await lastValueFrom(this.http.post<FoundCreature[]>('/codex/api/dm-toolkit-ai/creature', {
        query: this.findCreatureTerm, options: { pcCount: this.pcCount(), pcLevel: this.pcLevel() }
      }));
      // Logic handled by component binding or parent
    } catch (e) { console.error(e); }
    finally { this.isFindingCreature.set(false); }
  }

  selectFoundCreature(creature: FoundCreature) {
    this.selectedTemplate.set(creature.name);
    this.foundCreatureFilter.set(creature.name);
    this.selectedFoundCreatureId.set(creature.id);
    this.showFoundCreaturesList.set(false);
    this.addFormSource.set('Found');
  }

  filteredFoundCreatures = computed(() => this.foundCreatures().filter(c => c.name.toLowerCase().includes(this.foundCreatureFilter().toLowerCase())));

  // --- Logic Helpers ---

  computeHpFromString = (hpString: string, option: 'average' | 'rolled' | 'max'): number => {
    if (!hpString) return 10;
    const diceMatch = hpString.match(/(\d+)d(\d+)(?:\s*([+-]\s*\d+))?/i);
    if (!diceMatch) return parseInt(hpString.replace(/[^0-9-]/g, ''), 10) || 10;
    const numDice = parseInt(diceMatch[1], 10);
    const dieSize = parseInt(diceMatch[2], 10);
    const modifier = diceMatch[3] ? parseInt(diceMatch[3].replace(/\s/g, ''), 10) : 0;
    if (option === 'average') return Math.max(1, Math.floor(numDice * (dieSize + 1) / 2) + modifier);
    if (option === 'max') return Math.max(1, numDice * dieSize + modifier);
    let total = 0;
    for (let i = 0; i < numDice; i++) total += Math.floor(Math.random() * dieSize) + 1;
    return Math.max(1, total + modifier);
  }

  getNodeFromCodex(path: string[]): any {
    let node = this.codex();
    for (const key of path) { if (node && node[key]) { node = node[key]; } else { return null; } }
    return node;
  }

  // --- Modals & Tooltips ---
  toggleDetails(id: string) { this.expandedCombatant.update(c => c === id ? null : id); }
  hideFoundCreaturesListWithDelay() { setTimeout(() => this.showFoundCreaturesList.set(false), 200); }
  openTempModModal(id: string, stat: string) {
    const c = this.combatants().find(c => c._id === id);
    this.tempModValue.set(getCaseInsensitiveProp(c?.tempMods, stat) || 0);
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
    await this.handleUpdateCombatant(modInfo.combatantId, 'tempMods', updatedMods);
    this.closeTempModModal();
  }

  openStatEditModal(combatant: CombatantWithModifiers) { this.editingCombatantStats.set(combatant); }
  closeStatEditModal() { this.editingCombatantStats.set(null); }
  async handleUpdateCombatantStat(combatantId: string, statName: string, value: any) {
    const combatant = this.combatants().find(c => c._id === combatantId);
    if (!combatant) return;
    const newStats = { ...combatant.baseStats, [statName]: Number(value) };
    await this.handleUpdateCombatant(combatantId, 'baseStats', newStats);
  }

  openResistancesModal(combatant: CombatantWithModifiers) { this.editingCombatantResistances.set(combatant); }
  closeResistancesModal() { this.editingCombatantResistances.set(null); }
  async handleUpdateResistances(combatant: CombatantWithModifiers, resistances: any) {
    const newStats = { ...combatant.baseStats, ...resistances };
    await this.handleUpdateCombatant(combatant._id, 'baseStats', newStats);
    this.closeResistancesModal();
  }

  openSkillsModal(combatant: CombatantWithModifiers) { this.editingCombatantSkills.set(combatant); }
  closeSkillsModal() { this.editingCombatantSkills.set(null); this.newSkill.set({ name: '', rank: 0 }); }
  async handleUpdateSkill(combatant: CombatantWithModifiers, skillName: string, rank: number) {
    if (!skillName) return;
    const skills = getCaseInsensitiveProp(combatant.baseStats, 'skills') || {};
    const newSkills = { ...skills, [skillName]: rank };
    await this.handleUpdateCombatant(combatant._id, 'baseStats', { ...combatant.baseStats, skills: newSkills });
  }
  async handleRemoveSkill(combatant: CombatantWithModifiers, skillName: string) {
    const skills = getCaseInsensitiveProp(combatant.baseStats, 'skills') || {};
    const newSkills = { ...skills };
    delete newSkills[skillName];
    await this.handleUpdateCombatant(combatant._id, 'baseStats', { ...combatant.baseStats, skills: newSkills });
  }

  openSpellSlotsModal(combatant: CombatantWithModifiers) { this.editingCombatantSpellSlots.set(combatant); }
  closeSpellSlotsModal() { this.editingCombatantSpellSlots.set(null); }
  async handleUpdateSpellSlots(combatantId: string, spellSlots: any) {
    await this.handleUpdateCombatant(combatantId, 'spellSlots', spellSlots);
    this.closeSpellSlotsModal();
  }

  // --- Complex Computed ---
  modifiedCombatants = computed<CombatantWithModifiers[]>(() => {
    return this.combatants().map(c => {
      const entity = c.entityId ? this.entitiesCache().find(e => e.id === c.entityId) : null;
      const baseStats = calculateCompleteBaseStats(c.baseStats);
      // Saves parsing
      const savesStr = getCaseInsensitiveProp(baseStats, 'Saves');
      const resSaves = { Fort: 0, Ref: 0, Will: 0 };
      if (typeof savesStr === 'string') {
        resSaves.Fort = parseInt(savesStr.match(/Fort\s*([+-]?\d+)/i)?.[1] || '0', 10);
        resSaves.Ref = parseInt(savesStr.match(/Ref\s*([+-]?\d+)/i)?.[1] || '0', 10);
        resSaves.Will = parseInt(savesStr.match(/Will\s*([+-]?\d+)/i)?.[1] || '0', 10);
      } else {
        resSaves.Fort = getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Con'));
        resSaves.Ref = getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Dex'));
        resSaves.Will = getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Wis'));
      }
      baseStats.SavesObject = resSaves;

      const allFeats = entity ? (entity.rules || []).map((id: string) => ({ id, ...this.rulesCache().get(id) })).filter((f: any) => f.name) : [];

      const mappedEquipment = entity ? (entity.equipment || []).map((id: string) => ({ id, ...this.equipmentCache().get(id), isMagic: false })).filter((e: any) => e.name) : [];
      const mappedMagicItems = entity ? (entity.magicItems || []).map((id: string) => ({ id, ...this.magicItemsCache().get(id), isMagic: true })).filter((mi: any) => mi.name) : [];

      // Combine equipment
      const combinedItemsMap = new Map<string, any>();
      [...mappedEquipment, ...mappedMagicItems].forEach(item => {
        if (item.id) {
          if (combinedItemsMap.has(item.id) && !item.isMagic) return;
          combinedItemsMap.set(item.id, item);
        }
      });
      const uniqueItems = Array.from(combinedItemsMap.values());
      const equipment = uniqueItems.filter(item => !item.isMagic);
      const magicItems = uniqueItems.filter(item => item.isMagic);

      let spellIds: string[] = [];
      if (entity && entity.spells && typeof entity.spells === 'object') {
        spellIds = Object.values(entity.spells).flat() as string[];
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
            if (['dodge', 'untyped', 'penalty', 'circumstance'].includes(type)) finalBonuses[stat] += numVals.reduce((s, v) => s + v, 0);
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

      for (const stat in finalBonuses) {
        const bonus = finalBonuses[stat];
        if (stat === 'Saves') { modifiedSaves.Fort += bonus; modifiedSaves.Ref += bonus; modifiedSaves.Will += bonus; }
        else if (['Reflex', 'Ref'].includes(stat)) modifiedSaves.Ref += bonus;
        else if (['Fortitude', 'Fort'].includes(stat)) modifiedSaves.Fort += bonus;
        else if (stat === 'Will') modifiedSaves.Will += bonus;
        else if (typeof getCaseInsensitiveProp(modifiedStats, stat) !== 'undefined') {
          const baseVal = parseInt(String(getCaseInsensitiveProp(modifiedStats, stat)).match(/-?\d+/)?.[0] || '0', 10);
          if (!isNaN(baseVal)) modifiedStats[stat] = baseVal + bonus;
        }
      }
      (stringyMods['Speed'] || []).forEach(v => { if (v === 'half') modifiedStats['Speed'] = `${Math.floor(parseInt(String(getCaseInsensitiveProp(modifiedStats, 'Speed')).match(/\d+/)?.[0] || '30', 10) / 2)} ft.`; });

      const dexModDiff = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Dex')) - getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Dex'));
      const conModDiff = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Con')) - getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Con'));
      const wisModDiff = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Wis')) - getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Wis'));
      modifiedSaves.Ref += dexModDiff; modifiedSaves.Fort += conModDiff; modifiedSaves.Will += wisModDiff;

      // PF1e: Cap Dex bonus to AC based on armor's Max Dex
      const armorItems = [...equipment, ...magicItems];
      const armorMaxDex = getArmorMaxDex(armorItems);
      const currentDexMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Dex'));
      const baseDexMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Dex'));

      // Effective Dex mod for AC is capped by armor
      const effectiveDexMod = armorMaxDex !== null ? Math.min(currentDexMod, armorMaxDex) : currentDexMod;
      const baseEffectiveDexMod = armorMaxDex !== null ? Math.min(baseDexMod, armorMaxDex) : baseDexMod;
      const cappedDexModDiff = effectiveDexMod - baseEffectiveDexMod;

      modifiedStats['AC'] = (getCaseInsensitiveProp(modifiedStats, 'AC') || 10) + cappedDexModDiff;
      modifiedStats['Touch'] = (getCaseInsensitiveProp(modifiedStats, 'Touch') || 10) + dexModDiff; // Touch ignores armor cap
      if (conModDiff !== 0) {
        const lvl = getCaseInsensitiveProp(baseStats, 'Level') || parseInt(String(getCaseInsensitiveProp(baseStats, 'HP') || '1d8').match(/\((\d+)d\d+/)?.[1] || '1', 10);
        modifiedStats['maxHp'] = (c.maxHp || 10) + (conModDiff * lvl);
        if (modifiedStats['maxHp'] < 1) modifiedStats['maxHp'] = 1;
      } else modifiedStats['maxHp'] = c.maxHp || getCaseInsensitiveProp(baseStats, 'maxHp');
      const formatSaves = (s: { Fort: number; Ref: number; Will: number }) => `Fort ${s.Fort >= 0 ? '+' : ''}${s.Fort}, Ref ${s.Ref >= 0 ? '+' : ''}${s.Ref}, Will ${s.Will >= 0 ? '+' : ''}${s.Will}`;
      modifiedStats['Saves'] = formatSaves(modifiedSaves);
      modifiedStats['SavesObject'] = modifiedSaves;

      const initiativeMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Dex'));

      const parseAttacks = (s: any) => {
        const attacks: ParsedAttack[] = [];
        const melee = getCaseInsensitiveProp(s, 'Melee') || '';
        const ranged = getCaseInsensitiveProp(s, 'Ranged') || '';
        const parse = (str: string) => {
          const regex = /(.+?)\s*([+-]\d+(?:\/[+-]\d+)*)\s*\((.+?)\)/g;
          let m; while ((m = regex.exec(str)) !== null) attacks.push({ name: m[1].trim(), bonus: m[2].trim(), damage: m[3].trim() });
        };
        parse(melee); parse(ranged);
        return attacks;
      }
      const rawNaturalAttacks = parseAttacks(baseStats);

      // PF1e: Apply secondary natural attack penalties (-5 to hit, 0.5x Str to damage)
      const strMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Str'));
      const hasMultiattack = allFeats.some((f: any) => f.name === 'Multiattack');

      const naturalAttacks: ParsedAttack[] = rawNaturalAttacks.map((attack, index) => {
        const attackType = classifyNaturalAttack(attack.name);
        // First attack is always primary unless explicitly secondary type
        const isSecondary = index > 0 && attackType === 'secondary';

        if (isSecondary) {
          // Apply -5 penalty (or -2 with Multiattack feat)
          const penalty = hasMultiattack ? -2 : -5;
          const currentBonus = parseInt(attack.bonus.match(/[+-]?\d+/)?.[0] || '0', 10);
          const newBonus = currentBonus + penalty;
          const formattedBonus = newBonus >= 0 ? `+${newBonus}` : `${newBonus}`;

          // Adjust damage for 0.5x Str (if Str was added)
          // This is approximate - we check if damage has a + modifier
          let newDamage = attack.damage;
          if (strMod > 0) {
            const damageMatch = attack.damage.match(/^(\d+d\d+)([+-]\d+)?/);
            if (damageMatch) {
              const dice = damageMatch[1];
              const halfStr = Math.floor(strMod / 2);
              newDamage = halfStr > 0 ? `${dice}+${halfStr}` : dice;
            }
          }

          return {
            name: `${attack.name} (Secondary)`,
            bonus: formattedBonus,
            damage: newDamage
          };
        }
        return attack;
      });

      // Weapon attack generation logic
      const weaponAttacks: ParsedAttack[] = [];
      const allItems = [...equipment, ...magicItems];
      const weapons = allItems.filter(item => item.type === 'weapon' && item.properties);
      const hasWeaponFinesse = allFeats.some((f: any) => f.name === 'Weapon Finesse');
      const powerAttackFeat = allFeats.find((f: any) => f.name === 'Power Attack');
      const hasPowerAttack = powerAttackFeat && (c.activeFeats || []).includes(powerAttackFeat.id);

      // PF1e: Two-Weapon Fighting detection
      const equippedMeleeWeapons = weapons.filter(w => {
        const props = w.properties || {};
        const lower = (w.name || '').toLowerCase();
        const isRanged = props.range || lower.includes('bow') || lower.includes('crossbow') || lower.includes('sling');
        return !isRanged && w.equipped !== false;
      });
      const isTWF = equippedMeleeWeapons.length >= 2;
      const hasTWFFeat = allFeats.some((f: any) =>
        f.name?.toLowerCase().includes('two-weapon fighting') || f.name === 'Two-Weapon Fighting');
      const hasDoubleSlice = allFeats.some((f: any) => f.name === 'Double Slice');

      for (const [weaponIndex, weapon] of weapons.entries()) {
        const props = weapon.properties || {};
        const weaponName = weapon.name || 'Unknown Weapon';
        const lowerWeaponName = weaponName.toLowerCase();
        const isRanged = props.range || lowerWeaponName.includes('bow') || lowerWeaponName.includes('crossbow') || lowerWeaponName.includes('sling');
        const isThrown = props.range && parseInt(props.range) > 0 && !lowerWeaponName.includes('bow') && !lowerWeaponName.includes('crossbow');
        const isLightW = props.light || isLightWeapon(weaponName);

        let attackAbilityMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Str'));
        let damageAbilityMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Str'));

        if (isRanged && !isThrown) {
          attackAbilityMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Dex'));
          const isComposite = lowerWeaponName.includes('composite');
          damageAbilityMod = isComposite ? getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Str')) : 0;
        } else if (hasWeaponFinesse && isLightW) {
          attackAbilityMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Dex'));
        }

        const enhancementBonusMatch = weaponName.match(/^(\+\d+)/);
        const enhancementBonus = enhancementBonusMatch ? parseInt(enhancementBonusMatch[1], 10) : 0;

        let powerAttackPenalty = 0;
        let powerAttackDamage = 0;
        if (hasPowerAttack && !isRanged) {
          const bab = getCaseInsensitiveProp(modifiedStats, 'BAB') || 0;
          powerAttackPenalty = bab >= 12 ? -4 : bab >= 8 ? -3 : bab >= 4 ? -2 : -1;
          powerAttackDamage = Math.abs(powerAttackPenalty) * 2;
        }

        // PF1e: TWF penalties
        let twfPenalty = 0;
        let twfDamageMult = 1;
        if (isTWF && !isRanged) {
          const meleeIndex = equippedMeleeWeapons.findIndex(w => w === weapon);
          const isOffHand = meleeIndex > 0;
          const offHandWeapon = equippedMeleeWeapons[1];
          const offHandIsLight = offHandWeapon ? isLightWeapon(offHandWeapon.name || '') : false;

          if (hasTWFFeat) {
            // With TWF feat: -2/-2 if off-hand is light, else -4/-4
            twfPenalty = offHandIsLight ? -2 : -4;
          } else {
            // Without feat: -4/-4 if off-hand light, else -6/-10
            if (offHandIsLight) {
              twfPenalty = -4;
            } else {
              twfPenalty = isOffHand ? -10 : -6;
            }
          }

          // Off-hand gets 0.5x Str to damage (unless has Double Slice)
          if (isOffHand && !hasDoubleSlice && damageAbilityMod > 0) {
            twfDamageMult = 0.5;
          }
        }

        const sizeMod = SIZE_DATA[baseStats.size]?.mod || 0;
        const totalAttackBonus = (getCaseInsensitiveProp(modifiedStats, 'BAB') || 0) + attackAbilityMod + enhancementBonus + powerAttackPenalty + twfPenalty + (finalBonuses['Attack'] || 0) + sizeMod;
        const formattedAttackBonus = totalAttackBonus >= 0 ? `+${totalAttackBonus}` : `${totalAttackBonus}`;

        // Add damage bonus from effects (e.g., Prayer, Bardic Inspiration)
        const effectDamageBonus = finalBonuses['Damage'] || 0;
        let totalDamageBonus = Math.floor(damageAbilityMod * twfDamageMult) + enhancementBonus + powerAttackDamage + effectDamageBonus;
        let damageString = props.damage_m || '1d6';
        if (totalDamageBonus !== 0) damageString += totalDamageBonus > 0 ? `+${totalDamageBonus}` : ` ${totalDamageBonus}`;
        const critString = props.critical ? ` (${props.critical})` : '';

        // Add TWF indicator to name if applicable
        const displayName = isTWF && !isRanged && equippedMeleeWeapons.findIndex(w => w === weapon) > 0
          ? `${weaponName} (Off-Hand)`
          : weaponName;

        weaponAttacks.push({ name: displayName, bonus: formattedAttackBonus, damage: `${damageString}${critString}`.trim() });
      }

      let allAttacks = [...naturalAttacks, ...weaponAttacks];
      if (!allAttacks.some(a => a.name.toLowerCase().includes('unarmed strike'))) {
        const strMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Str'));
        const bab = getCaseInsensitiveProp(modifiedStats, 'BAB') || 0;
        const hasImprovedUnarmedStrike = allFeats.some((f: any) => f.name === 'Improved Unarmed Strike');
        const sizeMod = SIZE_DATA[baseStats.size]?.mod || 0;
        const unarmedAttackBonus = bab + strMod + (finalBonuses['Attack'] || 0) + sizeMod;
        const formattedBonus = unarmedAttackBonus >= 0 ? `+${unarmedAttackBonus}` : `${unarmedAttackBonus}`;
        const totalUnarmedDamage = strMod + (finalBonuses['Damage'] || 0);
        const damageBonus = totalUnarmedDamage > 0 ? `+${totalUnarmedDamage}` : totalUnarmedDamage !== 0 ? `${totalUnarmedDamage}` : '';
        const unarmedDamage = `1d3${damageBonus}${hasImprovedUnarmedStrike ? '' : ' (nonlethal)'}`;
        allAttacks.push({ name: 'Unarmed Strike', bonus: formattedBonus, damage: unarmedDamage });
      }

      // Skills parsing
      const skills: { [key: string]: number } = {};
      const skillsObject = getCaseInsensitiveProp(baseStats, 'skills');
      if (skillsObject && typeof skillsObject === 'object' && Object.keys(skillsObject).length > 0) {
        // Apply size modifiers to skills from object
        Object.entries(skillsObject).forEach(([skillName, baseValue]) => {
          let finalValue = Number(baseValue) || 0;
          const dexMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Dex'));

          // Add Dex modifier for Dex-based skills
          if (SKILL_ABILITY_MAP[skillName] === 'Dex') {
            finalValue += dexMod;
          }

          // Apply size modifiers
          if (skillName === 'Stealth') finalValue += SIZE_DATA[baseStats.size]?.stealth || 0;
          if (skillName === 'Fly') finalValue += SIZE_DATA[baseStats.size]?.fly || 0;

          // Specific skill bonus from effects (e.g., +4 Stealth from Invisibility)
          finalValue += finalBonuses[skillName] || 0;

          // Generic skill checks penalty/bonus
          finalValue += finalBonuses['Skill Checks'] || 0;

          skills[skillName] = finalValue;
        });
      } else {
        const skillsString = getCaseInsensitiveProp(baseStats, 'Skills') || '';
        if (skillsString && typeof skillsString === 'string') {
          skillsString.split(',').forEach((entry: string) => {
            const match = entry.trim().match(/^(.*?)\s*([+-]\d+)/);
            if (match) {
              let skillName = match[1].trim();
              const originalBonus = parseInt(match[2], 10);
              const simpleSkillName = skillName.startsWith('Knowledge') ? 'Knowledge (arcana)' : skillName;
              const governingAbility = SKILL_ABILITY_MAP[simpleSkillName];

              if (governingAbility) {
                const baseAbilityMods = {
                  'Str': getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Str')),
                  'Dex': getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Dex')),
                  'Con': getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Con')),
                  'Int': getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Int')),
                  'Wis': getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Wis')),
                  'Cha': getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Cha'))
                };
                const baseAbilityMod = baseAbilityMods[governingAbility] || 0;
                const ranksAndMisc = originalBonus - baseAbilityMod;
                const modifiedAbilityMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, governingAbility));
                const genericSkillPenalty = finalBonuses['Skill Checks'] || 0;

                // Specific skill bonus from effects (e.g., +4 Stealth from Invisibility)
                const specificSkillBonus = finalBonuses[skillName] || 0;

                // Size modifiers for skills
                let sizeSkillMod = 0;
                if (skillName === 'Stealth') sizeSkillMod = SIZE_DATA[baseStats.size]?.stealth || 0;
                if (skillName === 'Fly') sizeSkillMod = SIZE_DATA[baseStats.size]?.fly || 0;

                skills[skillName] = ranksAndMisc + modifiedAbilityMod + genericSkillPenalty + sizeSkillMod + specificSkillBonus;
              } else {
                skills[skillName] = originalBonus;
              }
            }
          });
        }
      }


      return { ...c, baseStats, modifiedStats, initiativeMod, attacks: allAttacks, allFeats, equipment, magicItems, spells, skills };
    }).sort((a, b) => {
      const initA = a.initiative || 0;
      const initB = b.initiative || 0;
      if (initA !== initB) return initB - initA;
      const modA = a.initiativeMod || 0;
      const modB = b.initiativeMod || 0;
      if (modA !== modB) return modB - modA;
      return a.name.localeCompare(b.name);
    });
  });

  toggleActiveFeat(id: string, featId: string) {
    const combatant = this.combatants().find(c => c._id === id); if (!combatant) return;
    const active = combatant.activeFeats || [];
    const newActive = active.includes(featId) ? active.filter(f => f !== featId) : [...active, featId];
    this.handleUpdateCombatant(id, 'activeFeats', newActive);
  }

  newEffectForCombatant(id: string) { return this.newEffects().get(id) || { name: '', duration: 3, unit: 'rounds' }; }
  updateNewEffect(id: string, field: keyof CombatantEffect, val: any) {
    this.newEffects.update(m => {
      const current = m.get(id) || { name: '', duration: 3, unit: 'rounds' };
      const updated = { ...current, [field]: val };
      if (field === 'unit' && val === 'permanent') updated.duration = 0;
      return m.set(id, updated);
    });
  }
  showEffectList(id: string) { this.activeEffectDropdown.set(id); }
  hideEffectListWithDelay(id: string) { setTimeout(() => { if (this.activeEffectDropdown() === id) this.activeEffectDropdown.set(null); }, 200); }
  filteredEffects(id: string) {
    const term = (this.newEffects().get(id)?.name || '').toLowerCase();
    return this.commonEffects.filter(e => e.toLowerCase().includes(term));
  }
  selectEffect(id: string, name: string) { this.updateNewEffect(id, 'name', name); this.activeEffectDropdown.set(null); }

  handleAddEffect(id: string) {
    const effect = this.newEffects().get(id);
    const combatant = this.combatants().find(c => c._id === id);
    if (!effect?.name || !combatant) return;
    const toAdd: CombatantEffect = { name: effect.name, duration: effect.duration || 0, unit: effect.unit || 'rounds', startRound: this.roundCounter(), remainingRounds: effect.unit === 'permanent' ? 999 : (effect.duration || 0) };
    const updatedEffects = [...(combatant.effects || []), toAdd];
    this.handleUpdateCombatant(id, 'effects', updatedEffects);
    this.newEffects.update(m => { m.delete(id); return m; });
  }

  handleRemoveEffect(id: string, index: number) {
    const c = this.combatants().find(c => c._id === id);
    if (!c?.effects) return;
    const updated = c.effects.filter((_, i) => i !== index);
    this.handleUpdateCombatant(id, 'effects', updated);
  }

  handleCastSpell(caster: CombatantWithModifiers, spell: Spell, targetId: string) {
    // Cast logic placeholder
  }

  // Tooltips logic
  showTooltip(e: MouseEvent, id: string, type: 'rule' | 'equipment' | 'magic-item' | 'effect' | 'spell') {
    let cache: any;
    switch (type) {
      case 'rule': cache = this.rulesCache(); break;
      case 'equipment': cache = this.equipmentCache(); break;
      case 'magic-item': cache = this.magicItemsCache(); break;
      case 'spell': cache = this.spellsCache(); break;
      case 'effect': cache = this.effectsCache(); break;
    }
    const item = cache.get(id);
    const data = (type === 'effect') ? item?.data : item;
    this.tooltipContent.set({ title: data?.name || 'Unknown', data: data, status: data ? 'loaded' : 'error' });
    this.tooltipPosition.set({ top: `${e.clientY + 15}px`, left: `${e.clientX + 15}px` });
  }

  showSkillsTooltip(e: MouseEvent, combatant: CombatantWithModifiers) {
    if (!combatant.skills || Object.keys(combatant.skills).length === 0) {
      this.tooltipContent.set({ title: 'Skills', data: { description: 'None' }, status: 'loaded' });
    } else {
      const description = Object.entries(combatant.skills).map(([n, v]) => `${n} ${v >= 0 ? '+' : ''}${v}`).join('\n');
      this.tooltipContent.set({ title: `${combatant.name}'s Skills`, data: { description }, status: 'loaded' });
    }
    this.tooltipPosition.set({ top: `${e.clientY + 15}px`, left: `${e.clientX + 15}px` });
  }
  hideTooltip() { this.tooltipContent.set(null); }

  topLevelCategoryOptions = computed<string[]>(() => {
    const codexData = this.codex();
    if (!codexData) return ['Custom', 'Find'];
    const sources = Object.keys(codexData).filter(key => {
      const node = codexData[key];
      return typeof node === 'object' && node !== null && node.isCombatManagerSource === true;
    });
    return ['Custom', 'Find', ...sources.sort()];
  });

  cascadingDropdowns = computed<CascadingDropdown[]>(() => {
    const source = this.addFormSource();
    if (!source || ['Custom', 'Found', 'Find', ''].includes(source)) return [];
    const dropdowns: CascadingDropdown[] = [];
    let currentPath = [source];
    let pathIdx = 0;
    while (true) {
      const node = this.getNodeFromCodex(currentPath);
      if (!node || typeof node !== 'object' || !this._isNavigable(node)) { break; }

      // Find navigable children (subcategories) - these become dropdown options
      const options = Object.keys(node).filter(key => {
        const child = node[key];
        return typeof child === 'object' &&
          child !== null &&
          !this.METADATA_KEYS.includes(key) &&
          this._isNavigable(child);
      });

      // If no navigable children, stop building dropdowns (we're at a leaf category)
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

  /**
   * Apply damage to a combatant, reducing temp HP first (PF1e rules)
   * @param combatantId - ID of the combatant
   * @param damage - Amount of damage to apply
   */
  applyDamage(combatantId: string, damage: number) {
    const c = this.combatants().find(x => x._id === combatantId);
    if (!c || damage <= 0) return;

    let remainingDamage = damage;
    let newTempHp = c.tempHp || 0;
    let newHp = c.hp;

    // Temp HP absorbs damage first
    if (newTempHp > 0) {
      if (remainingDamage <= newTempHp) {
        newTempHp -= remainingDamage;
        remainingDamage = 0;
      } else {
        remainingDamage -= newTempHp;
        newTempHp = 0;
      }
    }

    // Remaining damage goes to HP
    newHp -= remainingDamage;

    // Update combatant (batch updates)
    this.handleUpdateCombatant(combatantId, 'hp', newHp);
    if (c.tempHp !== undefined || newTempHp !== (c.tempHp || 0)) {
      this.handleUpdateCombatant(combatantId, 'tempHp', newTempHp);
    }
  }

  /**
   * Apply healing to a combatant (does not restore temp HP, only regular HP)
   * @param combatantId - ID of the combatant
   * @param healing - Amount of healing to apply
   */
  applyHealing(combatantId: string, healing: number) {
    const c = this.combatants().find(x => x._id === combatantId);
    if (!c || healing <= 0) return;

    // Healing caps at maxHp
    const maxHp = c.maxHp || c.baseStats?.maxHp || 100;
    const newHp = Math.min(c.hp + healing, maxHp);
    this.handleUpdateCombatant(combatantId, 'hp', newHp);
  }
}