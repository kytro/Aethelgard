import { Component, signal, inject, input, computed, WritableSignal, effect, Output, EventEmitter, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { lastValueFrom, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  formatTime, getAbilityModifierAsNumber, calculateCompleteBaseStats, getCaseInsensitiveProp,
  formatName, calculateAverageHp, getAbilityModifier, SKILL_ABILITY_MAP, SIZE_DATA,
  CONSTRUCT_HP_BONUS, calculateSkillBonus, CalculateStatsOptions,
  getArmorMaxDex, getArmorCheckPenalty, classifyNaturalAttack, isLightWeapon, LIGHT_WEAPONS,
  calculateLoad, calculateTotalWeight, LOAD_PENALTIES,
  ARMOR_DATA, SHIELD_DATA, getClassBaseStats
} from '../dm-toolkit.utils';
import { ModalService } from '../../shared/services/modal.service';

interface Fight { _id: string; name: string; createdAt: any; combatStartTime?: any; roundCounter?: number; currentTurnIndex?: number; log?: string[]; }
interface Combatant { _id: string; fightId: string; name: string; initiative: number | null; initiativeMod?: number; hp: number; maxHp: number; tempHp?: number; nonLethalDamage?: number; baseStats: any; effects: CombatantEffect[]; tempMods: { [key: string]: number }; activeFeats?: string[]; type?: string; entity_id?: string; entityId?: string; preparedSpells?: any[]; castSpells?: any[]; spellSlots?: { [level: string]: number }; specialAbilities?: string[]; specialAttacks?: string[]; vulnerabilities?: string[]; equipment?: any[]; magicItems?: any[]; inventory?: any[]; classes?: any[]; rules?: any[]; spells?: any; }
interface CombatantEffect { name: string; duration: number; unit: 'rounds' | 'minutes' | 'permanent' | 'hours' | 'days'; startRound: number; remainingRounds: number; }
interface ParsedAttack { name: string; bonus: string; damage: string; }
interface Spell { id: string; name: string; level: number; school: string; castingTime: string; range: string; duration: string; savingThrow: string; spellResistance: string; description: string; }
interface CombatantWithModifiers extends Combatant { baseStats: any; modifiedStats: any; initiativeMod: number; attacks: ParsedAttack[]; allFeats: any[]; equipment: any[]; magicItems: any[]; spells: Spell[]; skills: { [key: string]: number }; specialAbilities: string[]; specialAttacks: string[]; vulnerabilities: string[]; }
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
  foundCreatures = input<any[]>([]);

  private http = inject(HttpClient);
  private modalService = inject(ModalService);
  private ngZone = inject(NgZone);
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
  templateOptions = signal<{ key: string; name: string }[]>([]);
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

  // Damage/Healing Modal State
  damageModalTarget = signal<string | null>(null);
  healModalTarget = signal<string | null>(null);
  damageHealAmount = signal<number>(0);
  isNonLethalDamage = signal(false);

  METADATA_KEYS = [
    'summary', 'content', 'category', 'isCombatManagerSource',
    'enableCompletionTracking', 'isCompleted', 'path_components',
    'baseStats', 'entityId', 'entity_id', 'id', 'rules', 'equipment',
    'magicItems', 'spells', 'relatedPages'
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
    effect((onCleanup) => {
      const fight = this.currentFight();
      if (fight) {
        const sub = this.loadCombatants(fight._id).subscribe();
        onCleanup(() => sub.unsubscribe());

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

      // Combine and set
      const allOptions: { key: string; name: string }[] = [];

      const seen = new Set<string>();

      // Case 1: Node has a 'content' array
      if (Array.isArray(node.content)) {
        const isRichText = node.content.some((c: any) => c.type === 'heading' || c.type === 'paragraph' || c.type === 'statblock' || c.type === 'table');
        if (!isRichText) {
          node.content.forEach((item: any) => {
            const key = typeof item === 'string' ? item : item.name;
            if (key && !seen.has(key)) {
              seen.add(key);
              allOptions.push({ key, name: formatName(key) });
            }
          });
        }
      }

      // Case 2: Node is an object that might contain templates
      if (typeof node === 'object') {
        Object.keys(node).filter(key => {
          const child = node[key];
          return typeof child === 'object' &&
            child !== null &&
            !this.METADATA_KEYS.includes(key) &&
            !this._isNavigable(child);
        }).forEach(key => {
          if (!seen.has(key)) {
            seen.add(key);
            allOptions.push({ key, name: formatName(key) });
          }
        });
      }

      if (allOptions.length > 0) {
        this.templateOptions.set(allOptions.sort((a, b) => a.name.localeCompare(b.name)));
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

  loadCombatants(fightId: string): Observable<Combatant[]> {
    return this.http.get<Combatant[]>(`/codex/api/dm-toolkit/fights/${fightId}/combatants`).pipe(
      tap({
        next: (combatants) => this.combatants.set(combatants),
        error: (e) => console.error(e)
      })
    );
  }

  logAction(message: string) {
    const fight = this.currentFight();
    if (!fight) return;
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = `[${timestamp}] ${message}`;
    const updatedLog = [...(fight.log || []), entry];
    this.currentFight.update(f => f ? ({ ...f, log: updatedLog }) : null);
    this.http.patch(`/codex/api/dm-toolkit/fights/${fight._id}`, { log: updatedLog }).subscribe({
      error: (e) => console.error("Failed to save log entry:", e)
    });
  }

  handleAddFight() {
    if (!this.newFightName.trim()) return;
    this.isSavingFight.set(true);
    this.http.post<any>('/codex/api/dm-toolkit/fights', { name: this.newFightName }).subscribe({
      next: (newFight) => {
        this.fightAdded.emit(newFight);
        this.newFightName = '';
        this.isSavingFight.set(false);
      },
      error: (e) => {
        console.error(e);
        this.isSavingFight.set(false);
      }
    });
  }

  async handleDeleteFight(id: string) {
    const confirmed = await this.modalService.confirm('Delete Fight', 'Are you sure you want to delete this fight? This cannot be undone.');
    if (!confirmed) return;
    this.http.delete(`/codex/api/dm-toolkit/fights/${id}`).subscribe({
      next: () => {
        this.fightDeleted.emit(id);
        if (this.currentFight()?._id === id) this.currentFight.set(null);
      },
      error: (e) => console.error(e)
    });
  }

  setCurrentFight(fight: Fight) {

    this.currentFight.set(fight);
  }

  updateCustomCombatant(field: 'name' | 'hp' | 'initiative', val: any) {
    this.customCombatant.update(c => ({ ...c, [field]: val }));
  }

  // --- NEW HELPER: Roll Initiative ---
  private rollInitiative(baseStats: any, rules: string[] = []): { total: number, mod: number } {
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
    return {
      total: roll + dexMod + miscMod,
      mod: dexMod + miscMod
    };
  }

  async handleAddCombatant(event: Event) {
    event.preventDefault();
    const fight = this.currentFight();
    if (!fight) return;
    this.isSavingCombatant.set(true);
    let combatantData: Partial<Combatant> = {};
    let resolvedNode: any = null;
    let rules: any[] = [];

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
          baseStats: {
            hp: +custom.hp,
            initiative: +custom.initiative
          }
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
            resolvedNode = cached; // <--- ADD THIS LINE
          }
        } else {
          const templateKey = this.selectedTemplate();
          if (!templateKey) throw new Error("Select a template.");

          // Resolve Codex Node
          const fullPath = [source, ...this.selectedCodexPath(), templateKey].filter(Boolean);
          console.log(`[CombatManager] Resolving template: ${templateKey} with path: ${fullPath.join('/')}`);
          let node = this.getNodeFromCodex(fullPath);

          // Fallback Recursive Search in Codex
          if (!node) {
            console.warn(`[CombatManager] Path resolution failed for ${fullPath.join('/')}. Attempting recursive search...`);
            node = this.findNodeRecursive(this.codex()[source], templateKey);
          }

          if (node) {
            console.log(`[CombatManager] Node found:`, (node as any).name || templateKey);
            const n = node as any;

            // Robust ID resolution supporting camelCase, snake_case, and nested metadata
            entityId = n.entity_id || n.entityId || n.baseStats?.entity_id || n.baseStats?.entityId || n.id || n._id || n.metadata?.id || n.metadata?.entityId;

            const hpField = getCaseInsensitiveProp(n.baseStats || node, 'hp') || getCaseInsensitiveProp(n.baseStats || node, 'HP');
            if (hpField) hpVal = this.computeHpFromString(String(hpField), this.monsterHpOption);

            baseStats = n.baseStats || node;
            resolvedNode = n;
          }

          if (!entityId) {
            // Fallback to cache search by name/key with aggressive normalization
            console.warn(`[CombatManager] No entityId in node. Checking entitiesCache fallback for: ${templateKey}`);

            const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

            const targetNorm = normalize(templateKey);
            const targetNameNorm = normalize(formatName(templateKey));

            console.log(`[CombatManager] Normalization: targetKey='${templateKey}'->'${targetNorm}', targetName='${formatName(templateKey)}'->'${targetNameNorm}'`);

            const entities = this.entitiesCache();
            const resolvedEntity = entities.find((e: any) => {
              const eNameNorm = normalize(e.name);
              const eIdNorm = normalize(e.id || e._id || '');
              return eNameNorm === targetNorm || eNameNorm === targetNameNorm || eIdNorm === targetNorm;
            });

            if (resolvedEntity) {
              console.log(`[CombatManager] Fallback found entity:`, resolvedEntity.name, `(ID: ${resolvedEntity.id || resolvedEntity._id})`);
              entityId = resolvedEntity.id || resolvedEntity._id;
              baseStats = resolvedEntity.baseStats || {};
              resolvedNode = resolvedEntity;
              rules = resolvedEntity.rules || [];
              if (hpVal === 10) {
                const hpField = getCaseInsensitiveProp(baseStats, 'hp');
                if (hpField) hpVal = this.computeHpFromString(String(hpField), this.monsterHpOption);
              }
            }
          }
        }

        if (!entityId && source !== 'Found') {
          console.error(`[CombatManager] Resolution Failed! Template: "${this.selectedTemplate()}" Source: ${source} Path: ${this.selectedCodexPath().join('/')}`);
          console.log(`[CombatManager] entitiesCache count: ${this.entitiesCache().length}`);
          throw new Error(`Template "${this.selectedTemplate()}" not found in database. Try using 'Find Creature' instead.`);
        }

        // Calculate Initiative
        const { total: initRoll, mod: initMod } = this.rollInitiative(baseStats, rules);

        // Normalize: Merge top-level stats provided by AI into baseStats
        const finalBaseStats = {
          ...baseStats,
          // Prefer top-level fields if present (common in AI generations or imports)
          ac: (resolvedNode as any)?.ac ?? (resolvedNode as any)?.AC ?? (baseStats as any).ac ?? (baseStats as any).AC,
          bab: (resolvedNode as any)?.bab ?? (resolvedNode as any)?.BAB ?? (baseStats as any).bab ?? (baseStats as any).BAB,
          hp: (resolvedNode as any)?.hp ?? (resolvedNode as any)?.HP ?? (baseStats as any).hp ?? (baseStats as any).HP,
          saves: (resolvedNode as any)?.saves ?? (resolvedNode as any)?.Saves ?? (baseStats as any).saves ?? (baseStats as any).Saves,
          senses: (resolvedNode as any)?.senses ?? (resolvedNode as any)?.Senses ?? (baseStats as any).senses ?? (baseStats as any).Saves,
          classes: (resolvedNode as any)?.classes ?? (baseStats as any).classes ?? []
        };

        combatantData = {
          type: source,
          entityId: entityId || undefined,
          hp: hpVal,
          maxHp: hpVal,
          initiative: initRoll,
          initiativeMod: initMod, // PERSISTED MODIFIER FOR TIE-BREAKING
          baseStats: finalBaseStats,
          // classes: Handled above
          // Robust equipment lookup (check items, gear, inventory, baseStats too)
          equipment: (resolvedNode as any)?.equipment
            ?? (resolvedNode as any)?.Equipment
            ?? (resolvedNode as any)?.items
            ?? (resolvedNode as any)?.Items
            ?? (resolvedNode as any)?.gear
            ?? (resolvedNode as any)?.Gear
            ?? (resolvedNode as any)?.inventory
            ?? (resolvedNode as any)?.Inventory
            ?? (baseStats as any)?.equipment
            ?? (baseStats as any)?.items
            ?? [],
          magicItems: (resolvedNode as any)?.magicItems || [],
          rules: (resolvedNode as any)?.rules || rules,
          spells: (resolvedNode as any)?.spells || {},
          specialAbilities: (resolvedNode as any)?.specialAbilities || (resolvedNode as any)?.special_abilities || [],
          specialAttacks: (resolvedNode as any)?.specialAttacks || (resolvedNode as any)?.special_attacks || [],
          vulnerabilities: (resolvedNode as any)?.vulnerabilities || []
        };
      }

      const newCombatant = await lastValueFrom(this.http.post<Combatant>(`/codex/api/dm-toolkit/fights/${fight._id}/combatants`, combatantData));

      // Update local state immediately with Dex tie-breaker
      this.combatants.update(c => [...c, newCombatant].sort((a, b) => {
        const initDiff = (b.initiative || 0) - (a.initiative || 0);
        if (initDiff !== 0) return initDiff;

        // Use persisted mods for tie-breaking
        const modA = a.initiativeMod ?? getAbilityModifierAsNumber(getCaseInsensitiveProp(a.baseStats, 'Dex') || 10);
        const modB = b.initiativeMod ?? getAbilityModifierAsNumber(getCaseInsensitiveProp(b.baseStats, 'Dex') || 10);
        if ((modB - modA) !== 0) return modB - modA;

        return a.name.localeCompare(b.name);
      }));
      this.logAction(`${newCombatant.name} added. HP: ${newCombatant.hp}, Init: ${newCombatant.initiative}`);

      this.customCombatant.set({ name: '', initiative: 10, hp: 10 });
      // Don't clear source to allow rapid adding of same type
      this.selectedTemplate.set('');
      this.selectedFoundCreatureId.set(null);

    } catch (e: any) {
      console.error(e);
      await this.modalService.alert('Error Adding Combatant', e.error?.message || e.message);
    } finally { this.isSavingCombatant.set(false); }
  }

  handleRemoveCombatant(id: string) {
    const combatant = this.combatants().find(c => c._id === id);
    if (!combatant) return;

    // Calculate the index of the combatant being removed in the current sorted list
    const sorted = this.modifiedCombatants();
    const removedIndex = sorted.findIndex(c => c._id === id);
    const fight = this.currentFight();

    this.logAction(`${combatant.name} removed.`);
    this.http.delete(`/codex/api/dm-toolkit/combatants/${id}`).subscribe({
      next: () => {
        this.combatants.update(c => c.filter(cb => cb._id !== id));
        
        // Adjust currentTurnIndex if this combatant was before or at the current turn
        if (fight && fight.combatStartTime && fight.currentTurnIndex !== undefined) {
          let newTurnIndex = fight.currentTurnIndex;
          if (removedIndex < newTurnIndex) {
            newTurnIndex--;
          } else if (removedIndex === newTurnIndex) {
            // If the active person is deleted, stay on same index (next person slides in)
            // but ensure we don't go out of bounds if they were the last one
            if (newTurnIndex >= sorted.length - 1) {
              newTurnIndex = 0;
            }
          }
          
          if (newTurnIndex !== fight.currentTurnIndex) {
            this.http.patch<Fight>(`/codex/api/dm-toolkit/fights/${fight._id}`, { currentTurnIndex: newTurnIndex }).subscribe({
              next: (updated) => this.currentFight.set(updated)
            });
          }
        }
      },
      error: (e) => console.error(e)
    });
  }

  handleUpdateCombatant(id: string, field: keyof Combatant, val: any) {
    const combatant = this.combatants().find(c => c._id === id);
    if (!combatant) return;
    const valueToPatch = (typeof val === 'number' || !isNaN(+val)) && field !== 'effects' ? +val : val;
    const updates: any = { [field]: valueToPatch };

    // If stats or effects change, we should also update the persisted initiativeMod
    // to keep the backend in sync for tie-breaking.
    if (['baseStats', 'tempMods', 'effects', 'rules', 'activeFeats'].includes(field)) {
      // Find the fully computed version of this combatant to get the latest modifier
      const modified = this.modifiedCombatants().find(m => m._id === id);
      if (modified) {
        updates.initiativeMod = modified.initiativeMod;
      }
    }

    this.http.patch(`/codex/api/dm-toolkit/combatants/${id}`, updates).subscribe({
      error: (e) => console.error(e)
    });
    this.combatants.update(c => c.map(cb => cb._id === id ? { ...cb, ...updates } : cb));

    // Log the action (optimistic)
    const combatantName = combatant.name;
    const action = `Updated ${field} for ${combatantName} to ${valueToPatch}`;
    this.logAction(action);
  }

  handleStartCombat() {
    const fight = this.currentFight(); if (!fight) return;
    this.isTogglingCombatState.set(true);
    this.http.patch<Fight>(`/codex/api/dm-toolkit/fights/${fight._id}`, { combatStartTime: new Date() }).subscribe({
      next: (updatedFight) => {
        this.currentFight.set(updatedFight);
        this.logAction('Combat started.');
        this.isTogglingCombatState.set(false);
      },
      error: (e) => {
        console.error(e);
        this.isTogglingCombatState.set(false);
      }
    });
  }

  handleEndCombat() {
    const fight = this.currentFight(); if (!fight) return;
    this.isTogglingCombatState.set(true);
    this.http.patch<Fight>(`/codex/api/dm-toolkit/fights/${fight._id}/end-combat`, {}).subscribe({
      next: (updatedFight) => {
        this.currentFight.set(updatedFight);
        this.loadCombatants(fight._id).subscribe(() => {
          this.logAction('Combat ended.');
          this.isTogglingCombatState.set(false);
        });
      },
      error: (e) => {
        console.error(e);
        this.isTogglingCombatState.set(false);
      }
    });
  }

  handleNextTurn() {
    if (this.isAdvancingTurn()) return;
    const fight = this.currentFight(); if (!fight) return;
    this.isAdvancingTurn.set(true);
    this.http.patch<Fight>(`/codex/api/dm-toolkit/fights/${fight._id}/next-turn`, {}).subscribe({
      next: (updatedFight) => {
        this.currentFight.set(updatedFight);
        this.roundCounter.set(updatedFight.roundCounter || 1);
        this.currentTurnIndex.set(updatedFight.currentTurnIndex || 0);

        this.loadCombatants(fight._id).subscribe({
          next: () => {
            const active = this.modifiedCombatants()[updatedFight.currentTurnIndex || 0];
            if (active) this.logAction(`Turn: ${active.name}.`);
            this.isAdvancingTurn.set(false);
          },
          error: () => this.isAdvancingTurn.set(false)
        });
      },
      error: (e) => {
        console.error(e);
        this.isAdvancingTurn.set(false);
      }
    });
  }

  handlePreviousTurn() {
    if (this.isAdvancingTurn()) return;
    const fight = this.currentFight(); if (!fight) return;
    this.isAdvancingTurn.set(true);
    this.http.patch<Fight>(`/codex/api/dm-toolkit/fights/${fight._id}/previous-turn`, {}).subscribe({
      next: (updatedFight) => {
        this.currentFight.set(updatedFight);
        this.roundCounter.set(updatedFight.roundCounter || 1);
        this.currentTurnIndex.set(updatedFight.currentTurnIndex || 0);

        this.loadCombatants(fight._id).subscribe({
          next: () => this.isAdvancingTurn.set(false),
          error: () => this.isAdvancingTurn.set(false)
        });
      },
      error: (e) => {
        console.error(e);
        this.isAdvancingTurn.set(false);
      }
    });
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

    let currentInit = current.initiative || 0;
    let targetInit = target.initiative || 0;
    let currentMod = current.initiativeMod || 0;
    let targetMod = target.initiativeMod || 0;

    // Standard Swap
    const updatesCurrent: any = { initiative: targetInit, initiativeMod: targetMod };
    const updatesTarget: any = { initiative: currentInit, initiativeMod: currentMod };

    // If they are tied on both numerical score and modifier, we must force a difference
    // to guarantee the UI re-orders them.
    if (currentInit === targetInit && currentMod === targetMod) {
      if (direction === 'up') {
        updatesCurrent.initiative = targetInit + 1;
      } else {
        updatesCurrent.initiative = targetInit - 1;
      }
    }

    await Promise.all([
      lastValueFrom(this.http.patch(`/codex/api/dm-toolkit/combatants/${current._id}`, updatesCurrent)),
      lastValueFrom(this.http.patch(`/codex/api/dm-toolkit/combatants/${target._id}`, updatesTarget))
    ]);

    // Update local state (optimistic or refresh)
    this.combatants.update(list => list.map(c => {
      if (c._id === current._id) return { ...c, ...updatesCurrent };
      if (c._id === target._id) return { ...c, ...updatesTarget };
      return c;
    }));
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

  private findNodeRecursive(root: any, targetKey: string): any {
    if (!root || typeof root !== 'object') return null;
    if (root[targetKey]) return root[targetKey];

    const childKeys = Object.keys(root).filter(k => !this.METADATA_KEYS.includes(k));
    for (const key of childKeys) {
      const found = this.findNodeRecursive(root[key], targetKey);
      if (found) return found;
    }
    return null;
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
      const actualEntityId = c.entity_id || c.entityId;
      const entity = actualEntityId ? this.entitiesCache().find(e => e.id === actualEntityId) : null;
      const targetEntity = entity || c as any;

      // --- ADD THIS BLOCK ---
      // Merge top-level saves from backend transfer to prevent auto-generation overwrite
      const preppedBaseStats = {
          ...(c.baseStats || {}),
          Saves: (c as any).Saves || (c as any).saves || c.baseStats?.Saves || c.baseStats?.saves,
          Fort: (c as any).Fort || (c as any).fort || c.baseStats?.Fort || c.baseStats?.fort,
          Ref: (c as any).Ref || (c as any).ref || c.baseStats?.Ref || c.baseStats?.ref,
          Will: (c as any).Will || (c as any).will || c.baseStats?.Will || c.baseStats?.will,
      };
      // ----------------------

      // --- UPDATE the first argument from c.baseStats to preppedBaseStats ---
      const baseStats = calculateCompleteBaseStats(preppedBaseStats, {
        classes: c.classes,
        type: c.type,
        specialAbilities: c.specialAbilities,
        level: (targetEntity as any)?.level || (targetEntity as any)?.Level,
        cr: (targetEntity as any)?.cr || (targetEntity as any)?.CR,
        // Ensure the class string is caught if transferred to the top level
        classString: (targetEntity as any)?.class || (targetEntity as any)?.Class || (targetEntity as any)?.type || (targetEntity as any)?.Type
      });
      // Saves parsing
      const savesStr = getCaseInsensitiveProp(baseStats, 'Saves');
      const resSaves = { Fort: 0, Ref: 0, Will: 0 };
      if (typeof savesStr === 'string') {
        resSaves.Fort = parseInt(savesStr.match(/Fort\s*([+-]?\d+)/i)?.[1] || '0', 10);
        resSaves.Ref = parseInt(savesStr.match(/Ref\s*([+-]?\d+)/i)?.[1] || '0', 10);
        resSaves.Will = parseInt(savesStr.match(/Will\s*([+-]?\d+)/i)?.[1] || '0', 10);
      } else if (savesStr && typeof savesStr === 'object') {
        resSaves.Fort = Number(getCaseInsensitiveProp(savesStr, 'Fort') || getCaseInsensitiveProp(savesStr, 'Fortitude') || 0);
        resSaves.Ref = Number(getCaseInsensitiveProp(savesStr, 'Ref') || getCaseInsensitiveProp(savesStr, 'Reflex') || 0);
        resSaves.Will = Number(getCaseInsensitiveProp(savesStr, 'Will') || 0);
      } else {
        // Check for individual properties transferred by backend or in baseStats (Bug Fix)
        const fortVal = getCaseInsensitiveProp(baseStats, 'Fort') || getCaseInsensitiveProp(baseStats, 'Fortitude');
        const refVal = getCaseInsensitiveProp(baseStats, 'Ref') || getCaseInsensitiveProp(baseStats, 'Reflex');
        const willVal = getCaseInsensitiveProp(baseStats, 'Will');
        
        if (fortVal !== undefined || refVal !== undefined || willVal !== undefined) {
          resSaves.Fort = parseInt(String(fortVal || '0').match(/-?\d+/)?.[0] || '0', 10);
          resSaves.Ref = parseInt(String(refVal || '0').match(/-?\d+/)?.[0] || '0', 10);
          resSaves.Will = parseInt(String(willVal || '0').match(/-?\d+/)?.[0] || '0', 10);
        } else {
          // Final Fallback to raw mods ONLY if no save data found at all
          resSaves.Fort = getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Con'));
          resSaves.Ref = getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Dex'));
          resSaves.Will = getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Wis'));
        }
      }
      baseStats.SavesObject = resSaves;

      // Baseline Enforcement: Ensure saves never drop below Class Base + Ability Mod 
      // This is the CRITICAL safety net for Fighter 8 characters with empty/invalid saves data.
      const classBase = getClassBaseStats(targetEntity.classes || c.classes || []);
      const conModBase = getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Con'));
      const dexModBase = getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Dex'));
      const wisModBase = getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Wis'));
      
      baseStats.SavesObject.Fort = Math.max(baseStats.SavesObject.Fort, classBase.fort + conModBase);
      baseStats.SavesObject.Ref = Math.max(baseStats.SavesObject.Ref, classBase.ref + dexModBase);
      baseStats.SavesObject.Will = Math.max(baseStats.SavesObject.Will, classBase.will + wisModBase);

      const allFeats = (targetEntity.rules || []).map((id: string) => ({ id, ...this.rulesCache().get(id) })).filter((f: any) => f.name) || [];

      // Merge string-based feats from baseStats if available (for monsters)
      const rawFeats: string[] = getCaseInsensitiveProp(baseStats, 'Feats') || [];
      rawFeats.forEach(featName => {
        if (!allFeats.some((f: any) => f.name === featName)) {
          // Create a dummy feat object for display
          allFeats.push({ id: 'custom-' + featName, name: featName, description: 'Monster Feat' });
        }
      });

      let equipment: any[] = [];
      let magicItems: any[] = [];

      // Unified Inventory Logic
      if (targetEntity.inventory && Array.isArray(targetEntity.inventory)) {
        targetEntity.inventory.forEach((item: any) => {
          // Construct item object with defaults, spread properties
          const processed = {
            id: item.itemId, // Might be undefined
            ...item,
            // Ensure properties are accessible
            ...(item.properties || {})
          };
          if (item.type === 'magic' || item.isMagic) {
            magicItems.push(processed);
          } else {
            equipment.push(processed);
          }
        });
      } else {
        // Legacy Fallback / Explicit IDs or Objects
        const mappedEquipment = (targetEntity.equipment || []).map((ref: any) => {
          if (typeof ref === 'object') return { ...ref, ...(ref.properties || {}) };
          return this.resolveItem(ref, this.equipmentCache(), false);
        }).filter((e: any) => e.name);

        const mappedMagicItems = (targetEntity.magicItems || []).map((ref: any) => {
          if (typeof ref === 'object') return { ...ref, ...(ref.properties || {}) };
          return this.resolveItem(ref, this.magicItemsCache(), true);
        }).filter((mi: any) => mi.name);

        // Combine equipment
        const combinedItemsMap = new Map<string, any>();
        [...mappedEquipment, ...mappedMagicItems].forEach(item => {
          if (item.id) {
            if (combinedItemsMap.has(item.id) && !item.isMagic) return;
            combinedItemsMap.set(item.id, item);
          } else {
            const uniqueKey = item.name + (item.isMagic ? '_magic' : '_equip');
            combinedItemsMap.set(uniqueKey, item);
          }
        });
        const uniqueItems = Array.from(combinedItemsMap.values());
        equipment = uniqueItems.filter(item => !item.isMagic);
        magicItems = uniqueItems.filter(item => item.isMagic);
      }

      // Final pass: Heuristically type items that look like weapons but are marked as 'equipment'
      // This fixes the issue where migration set everything to 'equipment'
      equipment.forEach(item => {
        if ((item.type === 'equipment' || item.type === 'gear' || !item.type) && !item.properties?.damage_m) {
          const lowerName = (item.name || '').toLowerCase();
          // Check for known weapon keywords
          if (['sword', 'blade', 'dagger', 'axe', 'mace', 'hammer', 'spear', 'bow', 'crossbow', 'sling', 'cutlass', 'rapier', 'scimitar', 'falchion', 'glaive'].some(k => lowerName.includes(k))) {
            console.warn(`[CombatManager] Heuristic correction: Promoting ${item.name} to weapon`);
            item.type = 'weapon';
            // Safe copy of properties
            const newProps = { ...(item.properties || {}) };
            if (!newProps.damage_m) newProps.damage_m = '1d6'; // Fallback
            if (!newProps.critical) newProps.critical = '20/x2';
            item.properties = newProps;
          }
        }
      });

      // Extract Special Abilities
      // const specialAbilities = ... (Removed redeclaration)
      const extractedAbilities = (entity && entity.special_abilities) ? entity.special_abilities : (c.specialAbilities || []);
      const extractedSpecialAttacks = (entity && entity.special_attacks) ? entity.special_attacks : (c.specialAttacks || []);

      let spellData: { id: string, level: number }[] = [];
      if (entity && entity.spells && typeof entity.spells === 'object') {
        Object.entries(entity.spells).forEach(([lvl, ids]) => {
          const level = parseInt(lvl, 10);
          if (Array.isArray(ids)) {
            ids.forEach(id => spellData.push({ id: String(id), level: isNaN(level) ? 0 : level }));
          }
        });
      }

      const spells = entity ? spellData.map(s => {
        const cached = this.spellsCache().get(s.id);
        return {
          id: s.id,
          ...cached,
          level: cached?.level ?? s.level // Prefer cached level, fallback to source level
        };
      }).filter(s => s.name) : [];

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

      // Heuristic: Apply modifiers from equipped items
      [...equipment, ...magicItems].forEach(item => {
        if (item.equipped === false) return; // Skip unequipped

        // 1. Explicit Modifiers (Future proofing)
        if (item.modifiers) {
          Object.entries(item.modifiers).forEach(([s, m]: [string, any]) => addMod(s, m.type, m.value));
        }

        // 2. Name-based Heuristics for common PF1e items
        // Only if no explicit modifiers found (to avoid double counting if data improves)
        if (!item.modifiers) {
          const name = (item.name || '').toLowerCase();
          const bonusMatch = name.match(/[+-]\s*(\d+)/); // Matches "+1" or "+ 1"
          const bonus = bonusMatch ? parseInt(bonusMatch[1], 10) : 0;

          if (bonus > 0) {
            if (name.includes('cloak of resistance')) {
              addMod('Saves', 'resistance', bonus);
            } else if (name.includes('ring of protection')) {
              addMod('AC', 'deflection', bonus);
            } else if (name.includes('amulet of natural armor')) {
              addMod('AC', 'natural', bonus);
            } else if (name.includes('bracers of armor')) {
              addMod('AC', 'armor', bonus);
            } else if (name.includes('belt of giant strength')) {
              addMod('Str', 'enhancement', bonus);
            } else if (name.includes('belt of incredible dexterity')) {
              addMod('Dex', 'enhancement', bonus);
            } else if (name.includes('belt of mighty constitution')) {
              addMod('Con', 'enhancement', bonus);
            } else if (name.includes('headband of vast intelligence')) {
              addMod('Int', 'enhancement', bonus);
            } else if (name.includes('headband of inspired wisdom')) {
              addMod('Wis', 'enhancement', bonus);
            } else if (name.includes('headband of alluring charisma')) {
              addMod('Cha', 'enhancement', bonus);
            }
          }
        }
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
            // PF1e: Dodge, Untyped, Penalty, and Circumstance bonuses stack
            if (['dodge', 'untyped', 'penalty', 'circumstance'].includes(type.toLowerCase())) {
              finalBonuses[stat] += numVals.reduce((s, v) => s + v, 0);
            } else {
              const pos = numVals.filter(v => v > 0);
              const neg = numVals.filter(v => v < 0);
              // Typed bonuses: Only max applies from positive
              if (pos.length > 0) finalBonuses[stat] += Math.max(...pos);
              // Penalties (negative values) also typically stack if untyped, but if typed (rare), might not.
              // For robustness, we assume typed penalties don't stack with same source (handled by cache dedupe?) 
              // or same type. Sticking to max for consistency with "typed don't stack".
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

      // PF1e: Cap Dex bonus to AC based on armor's Max Dex AND Encumbrance
      const armorItems = [...equipment, ...magicItems];
      const armorMaxDex = getArmorMaxDex(armorItems);

      // Calculate Load Max Dex
      const strScore = getCaseInsensitiveProp(modifiedStats, 'Str') || 10;
      const totalWeight = calculateTotalWeight(armorItems); // armorItems contains all equipment+magic items
      const loadStatus = calculateLoad(strScore, totalWeight);
      const loadMaxDex = LOAD_PENALTIES[loadStatus]?.maxDex ?? 99;

      // Determine limiting Max Dex (Strict lower of Armor vs Load)
      let overallMaxDex = loadMaxDex;
      if (armorMaxDex !== null) {
        overallMaxDex = Math.min(overallMaxDex, armorMaxDex);
      }

      const currentDexMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(modifiedStats, 'Dex'));
      const baseDexMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(baseStats, 'Dex'));

      // Effective Dex mod for AC is capped by permissible Max Dex
      const effectiveDexMod = Math.min(currentDexMod, overallMaxDex);
      // Base is also capped to ensure Diff calculation is correct relative to restricted potential
      const baseEffectiveDexMod = Math.min(baseDexMod, overallMaxDex);
      const cappedDexModDiff = effectiveDexMod - baseEffectiveDexMod;

      // --- AC Bonus Typing Logic ---
      let touchAcBonus = 0;
      let ffAcBonus = 0;

      if (allMods['AC']) {
        for (const type in allMods['AC']) {
          const values = allMods['AC'][type].filter(v => typeof v === 'number') as number[];
          if (values.length === 0) continue;

          let typeBonus = 0;
          if (['dodge', 'untyped', 'penalty', 'circumstance'].includes(type.toLowerCase())) {
            typeBonus = values.reduce((a, b) => a + b, 0);
          } else {
            const pos = values.filter(v => v > 0);
            const neg = values.filter(v => v < 0);
            if (pos.length > 0) typeBonus += Math.max(...pos);
            if (neg.length > 0) typeBonus += Math.min(...neg);
          }

          // AC: Apply to modifiedStats total
          const currentAc = getCaseInsensitiveProp(modifiedStats, 'AC') || 10;
          modifiedStats['AC'] = currentAc + typeBonus;

          // Touch: Exclude armor, shield, natural
          if (!['armor', 'shield', 'natural', 'natural armor', 'natural_armor'].includes(type.toLowerCase())) {
            touchAcBonus += typeBonus;
          }

          // Flat-Footed: Exclude dodge
          if (type.toLowerCase() !== 'dodge') {
            ffAcBonus += typeBonus;
          }
        }
      }

      let heuristicArmorBonus = 0;
      let heuristicShieldBonus = 0;

      [...equipment, ...magicItems].forEach(item => {
        // If explicitly unequipped, skip
        if (item.equipped === false) return;

        const name = (item.name || '').toLowerCase();
        const armor = ARMOR_DATA[name] || Object.values(ARMOR_DATA).find((a: any) =>
          name.includes(a.id || '') || (a.name && name.includes(a.name.toLowerCase()))
        );
        const shield = SHIELD_DATA[name] || Object.values(SHIELD_DATA).find((s: any) =>
          name.includes(s.id || s.name?.toLowerCase() || '')
        );

        if (armor && !allMods['AC']?.['armor']) {
          const bonus = armor.acBonus || 0;
          // Take the best armor bonus found (non-stacking)
          if (bonus > heuristicArmorBonus) heuristicArmorBonus = bonus;
        }

        if (shield && !allMods['AC']?.['shield']) {
          const bonus = shield.acBonus || 0;
          // Take the best shield bonus found (non-stacking)
          if (bonus > heuristicShieldBonus) heuristicShieldBonus = bonus;
        }
      });

      if (heuristicArmorBonus > 0) {
        const currentAc = getCaseInsensitiveProp(modifiedStats, 'AC') || 10;
        modifiedStats['AC'] = currentAc + heuristicArmorBonus;
        // Flat-footed includes armor
        ffAcBonus += heuristicArmorBonus;
      }

      if (heuristicShieldBonus > 0) {
        const currentAc = getCaseInsensitiveProp(modifiedStats, 'AC');
        modifiedStats['AC'] = currentAc + heuristicShieldBonus;
        // Flat-footed includes shield
        ffAcBonus += heuristicShieldBonus;
      }

      modifiedStats['AC'] = (modifiedStats['AC'] || 10) + cappedDexModDiff;
      modifiedStats['Touch'] = (getCaseInsensitiveProp(modifiedStats, 'Touch') || 10) + dexModDiff + touchAcBonus;
      modifiedStats['Flat-Footed'] = (getCaseInsensitiveProp(modifiedStats, 'Flat-Footed') ||
        getCaseInsensitiveProp(modifiedStats, 'FlatFooted') || 10) + ffAcBonus;

      if (conModDiff !== 0) {
        const lvl = getCaseInsensitiveProp(baseStats, 'Level') || parseInt(String(getCaseInsensitiveProp(baseStats, 'HP') || '1d8').match(/\((\d+)d\d+/)?.[1] || '1', 10);
        modifiedStats['maxHp'] = (c.maxHp || 10) + (conModDiff * lvl);
        if (modifiedStats['maxHp'] < 1) modifiedStats['maxHp'] = 1;
      } else modifiedStats['maxHp'] = c.maxHp || getCaseInsensitiveProp(baseStats, 'maxHp');
      const formatSaves = (s: { Fort: number; Ref: number; Will: number }) => `Fort ${s.Fort >= 0 ? '+' : ''}${s.Fort}, Ref ${s.Ref >= 0 ? '+' : ''}${s.Ref}, Will ${s.Will >= 0 ? '+' : ''}${s.Will}`;
      modifiedStats['Saves'] = formatSaves(modifiedSaves);
      modifiedStats['SavesObject'] = modifiedSaves;

      const dexScore = getCaseInsensitiveProp(modifiedStats, 'Dex') || 10;
      const dexMod = getAbilityModifierAsNumber(dexScore);
      let featMod = 0;
      if (allFeats.some((f: any) => f.name && f.name.toLowerCase() === 'improved initiative')) {
        featMod = 4;
      }
      const initiativeMod = dexMod + featMod;

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
          if (skillName.toLowerCase() === 'stealth') {
            console.log(`[DEBUG] Stealth Calc: Base=${baseValue}, DexMod=${dexMod}, Size=${baseStats.size}, SizeMod=${SIZE_DATA[baseStats.size]?.stealth}`);
          }
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


      return {
        ...c,
        baseStats,
        modifiedStats,
        initiativeMod,
        attacks: allAttacks,
        allFeats,
        equipment,
        magicItems,
        spells,
        specialAbilities: extractedAbilities,
        specialAttacks: extractedSpecialAttacks,
        skills: skills,
        vulnerabilities: entity?.vulnerabilities || c.vulnerabilities || []
      };
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

  async handleCastSpell(caster: CombatantWithModifiers, spell: Spell, targetId: string) {
    const level = spell.level || 0;
    const slots = caster.spellSlots || {};
    const currentSlots = slots[level] || 0;

    // Check spell slots for level 1+ spells
    if (level > 0 && currentSlots <= 0) {
      this.logAction(`${caster.name} has no level ${level} spell slots remaining!`);
      return;
    }

    // Consume spell slot for level 1+ spells
    if (level > 0) {
      const newSlots = { ...slots, [level]: currentSlots - 1 };
      await this.handleUpdateCombatant(caster._id, 'spellSlots', newSlots);
    }

    // Find target
    const target = this.combatants().find(c => c._id === targetId);
    const targetName = target ? target.name : 'self';

    // Calculate Caster Level (Hoisted)
    const casterLevel = parseInt(String(getCaseInsensitiveProp(caster.baseStats, 'Level') || getCaseInsensitiveProp(caster.baseStats, 'CR') || 1), 10);

    // Calculate DC if saving throw applies
    let dcInfo = '';
    if (spell.savingThrow && spell.savingThrow.toLowerCase() !== 'none') {
      const classLower = (caster.baseStats?.Class || '').toLowerCase();
      let castingAbility = 'Int'; // Default: Wizard, Magus, Witch
      if (['cleric', 'druid', 'ranger', 'inquisitor'].some(c => classLower.includes(c))) {
        castingAbility = 'Wis';
      } else if (['sorcerer', 'bard', 'oracle', 'paladin', 'summoner'].some(c => classLower.includes(c))) {
        castingAbility = 'Cha';
      }
      const casterMod = getAbilityModifierAsNumber(caster.modifiedStats[castingAbility] || 10);
      const dc = 10 + level + casterMod;
      dcInfo = ` (DC ${dc} ${spell.savingThrow})`;
    }

    // SR Check Check (Target Only)
    if (target) {
      const targetSR = getCaseInsensitiveProp(target.baseStats, 'SR');
      if (targetSR && targetSR > 0) {
        const clRoll = Math.floor(Math.random() * 20) + 1;
        const clTotal = clRoll + casterLevel;
        const srSuccess = clTotal >= targetSR ? 'Success' : 'Failure';
        dcInfo += `. SR Check: ${clRoll}+${casterLevel} = ${clTotal} vs SR ${targetSR} (${srSuccess})`;
      }

      // --- Auto-Apply Effect Logic ---
      if (spell.duration && spell.duration.toLowerCase() !== 'instantaneous' && !spell.duration.toLowerCase().includes('concentration')) {
        let duration = 0;
        let unit: 'rounds' | 'minutes' | 'hours' | 'days' | 'permanent' = 'rounds';
        const durLower = spell.duration.toLowerCase();

        // Regex for "X unit/level" or "X unit"
        const match = durLower.match(/(\d+)?\s*(round|min|minute|hour|day)s?(\/level)?/);
        if (match) {
          const baseVal = parseInt(match[1] || '1', 10);
          const u = match[2];
          const perLevel = !!match[3];

          let multiplier = 1;
          if (perLevel) multiplier = casterLevel;

          let calculatedDuration = baseVal * multiplier;

          // Normalize to rounds/common units
          if (u.startsWith('min')) { unit = 'minutes'; }
          else if (u.startsWith('hour')) { unit = 'hours'; }
          else if (u.startsWith('day')) { unit = 'days'; }
          else { unit = 'rounds'; } // default

          duration = calculatedDuration;

          // Auto-add effect
          const effect: CombatantEffect = {
            name: spell.name,
            duration: duration,
            unit: unit,
            startRound: this.roundCounter(),
            remainingRounds: duration // Approximation for non-rounds logic
          };
          this.logAction(`Auto-applied effect: ${spell.name} (${duration} ${unit}) to ${target.name}`);
          const updatedEffects = [...(target.effects || []), effect];
          this.handleUpdateCombatant(target._id, 'effects', updatedEffects);
        }
      }
    }

    // Log the cast
    this.logAction(`${caster.name} casts ${spell.name} on ${targetName}${dcInfo}.`);

    // Track cast spell
    const castSpells = [...(caster.castSpells || []), spell.id];
    await this.handleUpdateCombatant(caster._id, 'castSpells', castSpells);
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
   * @param isNonLethal - Whether the damage is non-lethal
   */
  applyDamage(combatantId: string, damage: number, isNonLethal: boolean = false) {
    const c = this.combatants().find(x => x._id === combatantId);
    if (!c || damage <= 0) return;

    if (isNonLethal) {
      const currentNL = c.nonLethalDamage || 0;
      this.handleUpdateCombatant(combatantId, 'nonLethalDamage', currentNL + damage);
      return;
    }

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

  // --- Damage/Healing Modal Methods ---
  openDamageModal(combatantId: string) {
    this.damageModalTarget.set(combatantId);
    this.damageHealAmount.set(0);
  }

  openHealModal(combatantId: string) {
    this.healModalTarget.set(combatantId);
    this.damageHealAmount.set(0);
    this.isNonLethalDamage.set(false);
  }

  confirmDamage() {
    const target = this.damageModalTarget();
    if (target && this.damageHealAmount() > 0) {
      this.applyDamage(target, this.damageHealAmount(), this.isNonLethalDamage());
    }
    this.damageModalTarget.set(null);
    this.isNonLethalDamage.set(false);
  }

  confirmHeal() {
    const target = this.healModalTarget();
    if (target && this.damageHealAmount() > 0) {
      this.applyHealing(target, this.damageHealAmount());
    }
    this.healModalTarget.set(null);
  }

  closeDamageHealModal() {
    this.damageModalTarget.set(null);
    this.healModalTarget.set(null);
    this.isNonLethalDamage.set(false);
  }
  getClasses(c: Combatant): { className: string, level: number }[] {
    return c.baseStats?.classes || [];
  }

  getClassSummary(c: Combatant): string {
    const classes = this.getClasses(c);
    if (classes.length > 0) {
      return classes.map(cl => `${cl.className} ${cl.level}`).join(' / ');
    }
    // Fallback to legacy
    const cls = getCaseInsensitiveProp(c.baseStats, 'class') || (getCaseInsensitiveProp(c.baseStats, 'Level') === undefined ? getCaseInsensitiveProp(c.baseStats, 'Class') : undefined);
    const lvl = getCaseInsensitiveProp(c.baseStats, 'level') || getCaseInsensitiveProp(c.baseStats, 'Level');
    const cr = getCaseInsensitiveProp(c.baseStats, 'CR');

    if (cls) return `${cls} ${lvl || ''}`.trim();
    if (cr) return String(cr);
    return lvl ? String(lvl) : '?';
  }

  private resolveItem(ref: string, cache: Map<string, any>, isMagic: boolean): any {
    // 1. Try explicit ID match (standard behavior)
    if (cache.has(ref)) {
      return { id: ref, ...cache.get(ref), isMagic };
    }

    // 2. If it's a string name (e.g., "+1 Cutlass"), try to find the base item in cache
    // This supports entities that simply list equipment/loot as text strings
    const lowerRef = ref.toLowerCase();

    // Naively iterate - cache size is usually small enough (~hundreds)
    for (const [id, item] of cache.entries()) {
      if (item.name && lowerRef.includes(item.name.toLowerCase())) {
        // Match found!
        // We use the Cache's stats (type, properties) but keep the Custom Name
        // This allows "+1 Cutlass" to act like a "Cutlass" but show as "+1 Cutlass"
        return { id: id, ...item, name: ref, isMagic };
      }
    }

    // 3. Fallback: Return raw string object
    // It won't have 'type=weapon' or properties, so it won't generate attacks, but it shows in inventory
    return { name: ref, isMagic, type: 'misc' };
  }
}