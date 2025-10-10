import { Component, signal, inject, computed, effect, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';

// --- TYPE INTERFACES ---
interface Fight { _id: string; name: string; createdAt: any; combatStartTime?: any; roundCounter?: number; currentTurnIndex?: number; }
interface Combatant { _id: string; fightId: string; name: string; initiative: number | null; hp: number; maxHp: number; stats: any; effects: CombatantEffect[]; tempMods: { [key: string]: number }; activeFeats?: string[]; type?: string; entityId?: string; }
interface CombatantEffect { name: string; duration: number; unit: 'rounds' | 'minutes' | 'permanent' | 'hours' | 'days'; startRound: number; remainingRounds: number; }
interface ParsedAttack { name: string; bonus: string; damage: string; }
interface CombatantWithModifiers extends Combatant { baseStats: any; modifiedStats: any; attacks: ParsedAttack[]; allFeats: any[]; equipment: any[]; magicItems: any[]; }
interface Session { _id: string; title: string; notes: string; createdAt: any; }
interface Pf1eEntity { id: string; name: string; sourceCodexPath: string[]; baseStats: any; rules: string[]; equipment?: string[]; magicItems?: string[]; }
interface FoundCreature { id: string; name: string; cr: string; stats: string; hp: string; }
interface GeneratedNpc { name: string; race: string; description: string; stats: { [key: string]: number }; }
interface CacheEntry { status: 'idle' | 'loading' | 'loaded' | 'error'; data: any; }

const GOOD_SAVES = [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17];
const POOR_SAVES = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10];

@Component({
  selector: 'app-dm-toolkit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dm-toolkit.component.html',
  styleUrls: ['./dm-toolkit.component.css']
})
export class DmToolkitComponent {
  http = inject(HttpClient);

  // --- STATE SIGNALS ---
  activeTool = signal<'assistant' | 'npc-generator' | 'combat' | 'session'>('assistant');
  
  fights = signal<Fight[]>([]);
  sessions = signal<Session[]>([]);
  codex = signal<any | null>(null);
  entitiesCache = signal<Pf1eEntity[]>([]);
  rulesCache = signal<Map<string, any>>(new Map());
  equipmentCache = signal<Map<string, any>>(new Map());
  magicItemsCache = signal<Map<string, any>>(new Map());
  effectsCache = signal<Map<string, CacheEntry>>(new Map());
  
  currentFight: WritableSignal<Fight | null> = signal(null);
  currentSession: WritableSignal<Session | null> = signal(null);
  sessionNotes = signal('');
  combatants = signal<Combatant[]>([]);

  fightCount = computed(() => this.fights().length);
  sessionCount = computed(() => this.sessions().length);

  // Assistant
  assistantQuery = signal('');
  assistantResponse = signal('');
  isAskingAssistant = signal(false);
  
  // NPC Gen
  npcGenQuery = '';
  npcGenContext = '';
  npcGenGroupName = '';
  isGeneratingNpcs = signal(false);
  lastGeneratedNpcs = signal<GeneratedNpc[]>([]);
  lastGeneratedGroupName = signal('');

  // Combat
  newFightName = '';
  isSavingFight = signal(false);
  isSavingCombatant = signal(false);
  isTogglingCombatState = signal(false);
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
  addFormSource: WritableSignal<'Custom' | 'PC' | 'NPC' | 'Bestiary' | 'Find' | 'Found'> = signal('Custom');
  selectedTemplate = signal('');
  customCombatant = signal({ name: '', initiative: 10, hp: 10 });
  tooltipContent = signal<{ title: string, data: any, status: 'loading' | 'loaded' | 'error' } | null>(null);
  tooltipPosition = signal({ top: '0px', left: '0px' });
  
  commonEffects = [
    'Blinded', 'Bleed', 'Confused', 'Cowering', 'Dazed', 'Dazzled', 'Deafened',
    'Entangled', 'Exhausted', 'Fascinated', 'Fatigued', 'Flat-Footed', 'Frightened',
    'Grappled', 'Helpless', 'Invisible', 'Nauseated', 'Panicked', 'Paralyzed',
    'Petrified', 'Pinned', 'Prone', 'Shaken', 'Sickened', 'Staggered', 'Stunned',
    'Unconscious', 'Haste', 'Slow', 'Bless', 'Bane', 'Enlarged', 'Reduced'
  ].sort();
  
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
        const session = this.currentSession();
        const notes = this.sessionNotes();
        if(!session) return;

        const handler = setTimeout(async () => {
            if (notes !== (session.notes || "")) {
                 try {
                    await lastValueFrom(this.http.patch(`api/dm-toolkit/sessions/${session._id}`, { notes }));
                 } catch(e) { console.error("Failed to auto-save notes:", e); }
            }
        }, 500);
        return () => clearTimeout(handler);
    });
  }

  async loadInitialData() {
    try {
      const [fights, sessions, codex, entities, rules, equipment, magicItems, effects] = await Promise.all([
        lastValueFrom(this.http.get<Fight[]>('api/dm-toolkit/fights')),
        lastValueFrom(this.http.get<Session[]>('api/dm-toolkit/sessions')),
        lastValueFrom(this.http.get<any>('api/codex/data')),
        lastValueFrom(this.http.get<Pf1eEntity[]>('api/admin/collections/entities_pf1e')),
        lastValueFrom(this.http.get<any[]>('api/admin/collections/rules_pf1e')),
        lastValueFrom(this.http.get<any[]>('api/admin/collections/equipment_pf1e')),
        lastValueFrom(this.http.get<any[]>('api/admin/collections/magic_items_pf1e')),
        lastValueFrom(this.http.get<any[]>('api/admin/collections/dm_toolkit_effects')),
      ]);
      
      this.fights.set(fights);
      this.sessions.set(sessions);
      this.codex.set(codex);
      this.entitiesCache.set(entities);
      this.rulesCache.set(new Map(rules.map(item => [item._id, item])));
      this.equipmentCache.set(new Map(equipment.map(item => [item._id, item])));
      this.magicItemsCache.set(new Map(magicItems.map(item => [item._id, item])));
      this.effectsCache.set(new Map(effects.map(item => [item._id, { data: item, status: 'loaded' }])));

    } catch (error) {
      console.error("Failed to load initial DM Toolkit data", error);
    }
  }

  async loadCombatants(fightId: string) {
    try {
        const combatants = await lastValueFrom(this.http.get<Combatant[]>(`api/dm-toolkit/fights/${fightId}/combatants`));
        this.combatants.set(combatants);
    } catch(e) { console.error(e); }
  }
  
  // --- UI HANDLERS ---
  async handleAskAssistant() {
    if (!this.assistantQuery()) return;
    this.isAskingAssistant.set(true);
    this.assistantResponse.set('');
    try {
      const res = await lastValueFrom(this.http.post<any>('api/dm-toolkit-ai/assistant', { 
        query: this.assistantQuery(),
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
    try {
        const npcs = await lastValueFrom(this.http.post<GeneratedNpc[]>('api/dm-toolkit-ai/generate-npcs', {
            query: this.npcGenQuery,
            groupName: this.npcGenGroupName,
            context: this.npcGenContext
        }));
        this.lastGeneratedNpcs.set(npcs);
        this.lastGeneratedGroupName.set(this.npcGenGroupName);
        // Optionally, refresh codex data here if the backend adds the NPCs to it
    } catch (e: any) { console.error("Error generating NPCs:", e); } 
    finally { this.isGeneratingNpcs.set(false); }
  }

  // --- COMBAT MANAGER ---
  async handleAddFight() {
    if (!this.newFightName.trim()) return;
    this.isSavingFight.set(true);
    try {
      const newFight = await lastValueFrom(this.http.post<any>('api/dm-toolkit/fights', { name: this.newFightName }));
      this.fights.update(f => [{ _id: newFight.id, name: this.newFightName, createdAt: new Date() }, ...f]);
      this.newFightName = '';
    } catch(e) { console.error(e); }  
    finally { this.isSavingFight.set(false); }
  }

  async handleDeleteFight(id: string) {
    if (!confirm('Are you sure you want to delete this fight?')) return;
    try {
      await lastValueFrom(this.http.delete(`api/dm-toolkit/fights/${id}`));
      this.fights.update(fights => fights.filter(f => f._id !== id));
      if (this.currentFight()?._id === id) this.currentFight.set(null);
    } catch(e) { console.error(e); }
  }

  async setCurrentFight(fight: Fight) {
    try {
        await lastValueFrom(this.http.post(`api/dm-toolkit/fights/${fight._id}/migrate`, {}));
    } catch (e) {
        console.error("Failed to run migration for fight:", fight._id, e);
    }
    this.currentFight.set(fight);
  }
  
  onSourceChange(source: any) { this.addFormSource.set(source); this.selectedTemplate.set(''); }
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
            combatantData = { name: custom.name, initiative: +custom.initiative, hp: +custom.hp, maxHp: +custom.hp, type: 'Custom', stats: {}, effects: [], tempMods: {}, activeFeats: [] };
        } else {
            const entity = this.entitiesCache().find(e => e.name === this.selectedTemplate());
            if (!entity) throw new Error("Entity template not found.");
            combatantData = { 
                name: entity.name, 
                type: source, 
                entityId: entity.id,
                // The backend will calculate the rest of the stats
            } as Partial<Combatant>;
        }

        const newCombatant = await lastValueFrom(this.http.post<Combatant>(`api/dm-toolkit/fights/${fight._id}/combatants`, combatantData));
        this.combatants.update(c => [...c, newCombatant].sort((a, b) => (b.initiative || 0) - (a.initiative || 0) || a.name.localeCompare(b.name)));
        this.customCombatant.set({ name: '', initiative: 10, hp: 10 });
        this.selectedTemplate.set('');
    } catch (e) { console.error("Error adding combatant:", e); } 
    finally { this.isSavingCombatant.set(false); }
  }

  async handleRemoveCombatant(id: string) {
    const fightId = this.currentFight()?._id;
    if (!fightId) return;
    await lastValueFrom(this.http.delete(`api/dm-toolkit/combatants/${id}`));
    this.combatants.update(c => c.filter(cb => cb._id !== id));
  }

  async handleUpdateCombatant(id: string, field: keyof Combatant, val: any) {
     if (isNaN(+val) && (field==='hp'||field==='initiative'||field==='maxHp')) return;
     await lastValueFrom(this.http.patch(`api/dm-toolkit/combatants/${id}`, { [field]: +val }));
     this.combatants.update(c => c.map(cb => cb._id === id ? {...cb, [field]: +val} : cb));
  }

  async handleStartCombat() {
    const fight = this.currentFight();
    if (!fight) return;
    this.isTogglingCombatState.set(true);
    const updatedFight = await lastValueFrom(this.http.patch<Fight>(`api/dm-toolkit/fights/${fight._id}`, { combatStartTime: new Date() }));
    this.currentFight.set(updatedFight);
    this.isTogglingCombatState.set(false);
  }

  async handleEndCombat() {
    const fight = this.currentFight();
    if (!fight) return;
    this.isTogglingCombatState.set(true);
    const updatedFight = await lastValueFrom(this.http.patch<Fight>(`api/dm-toolkit/fights/${fight._id}/end-combat`, {}));
    this.currentFight.set(updatedFight);
    this.loadCombatants(fight._id); // Reload to see updated effects
    this.isTogglingCombatState.set(false);
  }

  async handleNextTurn() {
    const fight = this.currentFight();
    if (!fight) return;
    const updatedFight = await lastValueFrom(this.http.patch<Fight>(`api/dm-toolkit/fights/${fight._id}/next-turn`, {}));
    this.currentFight.set(updatedFight);
  }

  async handleFindCreature() {
    if (!this.findCreatureTerm) return;
    this.isFindingCreature.set(true);
    try {
        const creatures = await lastValueFrom(this.http.post<FoundCreature[]>('api/dm-toolkit-ai/find-creatures', {
            term: this.findCreatureTerm,
            pcCount: this.pcCount(),
            pcLevel: this.pcLevel()
        }));
        this.foundCreatures.set(creatures);
        this.findCreatureTerm = '';
    } catch(e) { console.error("Error finding creatures:", e); } 
    finally { this.isFindingCreature.set(false); }
  }
  
  hideFoundCreaturesListWithDelay() { setTimeout(() => this.showFoundCreaturesList.set(false), 200); }
  selectFoundCreature(name: string) { this.selectedTemplate.set(name); this.foundCreatureFilter.set(name); this.showFoundCreaturesList.set(false); }
  toggleDetails(id: string) { this.expandedCombatant.update(c => c === id ? null : id); }

  // --- SESSION LOGGER ---
  async handleAddSession() {
      const newSession = await lastValueFrom(this.http.post<any>('api/dm-toolkit/sessions', {}));
      const sessionToAdd = { _id: newSession.id, title: '', notes: '', createdAt: new Date() };
      this.sessions.update(s => [sessionToAdd, ...s]);
      this.setCurrentSession(sessionToAdd);
  }

  async handleDeleteSession(id: string) {
      if (!confirm('Are you sure you want to delete this session?')) return;
      await lastValueFrom(this.http.delete(`api/dm-toolkit/sessions/${id}`));
      this.sessions.update(s => s.filter(session => session._id !== id));
      if (this.currentSession()?._id === id) this.currentSession.set(null);
  }

  setCurrentSession(session: Session) {
    this.currentSession.set(session);
    this.sessionNotes.set(session.notes || '');
  }
  
  onNotesChange(notes: string) { this.sessionNotes.set(notes); }
  
  // --- DYNAMIC LOOKUP & EFFECTS ---
  async lookupTerm(term: string, type: 'effect') {
    if (!term || this.effectsCache().has(term)) return;

    this.effectsCache.update(c => c.set(term, { status: 'loading', data: { description: 'Loading...' } }));
    try {
        const result = await lastValueFrom(this.http.post<any>('api/dm-toolkit-ai/lookup', { term, type }));
        this.effectsCache.update(c => c.set(term, { status: 'loaded', data: result }));
    } catch (e) {
        this.effectsCache.update(c => c.set(term, { status: 'error', data: { description: `Error fetching.` } }));
    }
  }
  
  async toggleActiveFeat(id: string, featId: string) {
    const combatant = this.combatants().find(c => c._id === id); if (!combatant) return;
    const active = combatant.activeFeats || [];
    const newActive = active.includes(featId) ? active.filter(f => f !== featId) : [...active, featId];
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
    await this.handleUpdateCombatant(id, 'effects', updatedEffects);
    this.newEffects.update(m => { m.delete(id); return m; });
  }

  async handleRemoveEffect(id: string, index: number) {
    this.hideTooltip();
    const c = this.combatants().find(c => c._id === id);
    if (!c?.effects) return;
    const updated = c.effects.filter((_, i) => i !== index);
    await this.handleUpdateCombatant(id, 'effects', updated);
  }
  
  openTempModModal(id: string, stat: string) {
    const c = this.combatants().find(c => c._id === id);
    this.tempModValue.set(c?.tempMods?.[stat] || 0);
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
  
  // --- COMPUTED & HELPERS ---
  templateOptions = computed(() => {
    const source = this.addFormSource();
    if (source === 'Custom' || source === 'Find' || source === 'Found') return [];
    
    return this.entitiesCache()
      .filter(e => {
          const cat = e.sourceCodexPath[0] || '';
          if (source === 'PC') return ['Player Characters', 'Player_Characters', 'PCs'].includes(cat);
          if (source === 'NPC') return ['People', 'NPCs', 'Persons'].includes(cat);
          if (source === 'Bestiary') return ['Bestiary', 'Monsters'].includes(cat);
          return false;
      })
      .map(e => e.name)
      .sort();
  });

  filteredFoundCreatures = computed(() => this.foundCreatures().filter(c => c.name.toLowerCase().includes(this.foundCreatureFilter().toLowerCase())));

  modifiedCombatants = computed<CombatantWithModifiers[]>(() => {
    return this.combatants().map(c => {
        const entity = c.entityId ? this.entitiesCache().find(e => e.id === c.entityId) : null;
        const baseStats = this.calculateCompleteBaseStats(c.stats);
        baseStats.SavesObject = this.parseSaves(baseStats.Saves, baseStats);
        
        const allFeats = entity ? (entity.rules || []).map(id => ({ id, ...this.rulesCache().get(id) })).filter(f => f.name) : [];
        const equipment = entity ? (entity.equipment || []).map(id => ({ id, ...this.equipmentCache().get(id) })).filter(e => e.name) : [];
        const magicItems = entity ? (entity.magicItems || []).map(id => ({ id, ...this.magicItemsCache().get(id) })).filter(mi => mi.name) : [];

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
                    if (type === 'dodge' || type === 'untyped' || type === 'penalty' || type === 'circumstance' || type === 'morale' || type === 'competence') finalBonuses[stat] += numVals.reduce((s, v) => s + v, 0);
                    else { // Stacking rules for other types
                        const pos = numVals.filter(v => v > 0);
                        const neg = numVals.filter(v => v < 0);
                        if (pos.length > 0) finalBonuses[stat] += Math.max(...pos);
                        if (neg.length > 0) finalBonuses[stat] += Math.min(...neg);
                    }
                }
            }
        }
        
        const modifiedStats = { ...baseStats };
        const modifiedSaves = { ...baseStats.SavesObject };

        for(const stat in finalBonuses) {
            const bonus = finalBonuses[stat];
            if (stat === 'Saves') { modifiedSaves.Fort += bonus; modifiedSaves.Ref += bonus; modifiedSaves.Will += bonus; }
            else if (['Reflex', 'Ref'].includes(stat)) modifiedSaves.Ref += bonus;
            else if (['Fortitude', 'Fort'].includes(stat)) modifiedSaves.Fort += bonus;
            else if (stat === 'Will') modifiedSaves.Will += bonus;
            else if (typeof modifiedStats[stat] !== 'undefined') {
                const baseVal = parseInt(String(modifiedStats[stat]).match(/-?\d+/)?.[0] || '0', 10);
                if (!isNaN(baseVal)) modifiedStats[stat] = baseVal + bonus;
            }
        }
        (stringyMods['Speed'] || []).forEach(v => { if (v === 'half') modifiedStats.Speed = `${Math.floor(parseInt(String(modifiedStats.Speed).match(/\d+/)?.[0] || '30', 10) / 2)} ft.`; });

        const dexModDiff = this.getAbilityModifierAsNumber(modifiedStats.Dex) - this.getAbilityModifierAsNumber(baseStats.Dex);
        const conModDiff = this.getAbilityModifierAsNumber(modifiedStats.Con) - this.getAbilityModifierAsNumber(baseStats.Con);
        const wisModDiff = this.getAbilityModifierAsNumber(modifiedStats.Wis) - this.getAbilityModifierAsNumber(baseStats.Wis);
        modifiedSaves.Ref += dexModDiff; modifiedSaves.Fort += conModDiff; modifiedSaves.Will += wisModDiff;
        modifiedStats.AC += dexModDiff; modifiedStats.Touch += dexModDiff;
        if (conModDiff !== 0) {
            const lvl = baseStats.Level || parseInt(String(baseStats.HP || baseStats.hp || '1d8').match(/\((\d+)d\d+/)?.[1] || '1', 10);
            modifiedStats.maxHp = (c.maxHp || 10) + (conModDiff * lvl);
            if (modifiedStats.maxHp < 1) modifiedStats.maxHp = 1;
        } else modifiedStats.maxHp = c.maxHp || baseStats.maxHp;
        modifiedStats.Saves = this.formatSaves(modifiedSaves);
        modifiedStats.SavesObject = modifiedSaves;
        
        const naturalAttacks = this.parseAttacks(baseStats);
        const weaponAttacks = this.generateAttacksFromWeapons(c, baseStats, modifiedStats, allFeats, equipment, magicItems);
        
        return { ...c, baseStats, modifiedStats, attacks: [...naturalAttacks, ...weaponAttacks], allFeats, equipment, magicItems };
    }).sort((a, b) => (b.initiative || 0) - (a.initiative || 0) || a.name.localeCompare(b.name));
  });
  
  getAbilityModifierAsNumber = (score: any): number => {
    const numScore = parseInt(String(score).match(/-?\d+/)?.[0] || '10', 10);
    if (isNaN(numScore)) return 0;
    return Math.floor((numScore - 10) / 2);
  };

  calculateAverageHp = (diceString: string): number => {
    const match = diceString.match(/(\d+)d(\d+)\s*([+-]\s*\d+)?/);
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

  calculateCompleteBaseStats = (stats: any): any => {
    const newStats = { ...(stats || {}) };
    const abilities = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
    abilities.forEach(ability => { if (typeof newStats[ability] === 'undefined') newStats[ability] = 10; });

    const strMod = this.getAbilityModifierAsNumber(newStats.Str);
    const dexMod = this.getAbilityModifierAsNumber(newStats.Dex);
    const conMod = this.getAbilityModifierAsNumber(newStats.Con);
    const wisMod = this.getAbilityModifierAsNumber(newStats.Wis);

    if (typeof newStats.AC === 'string') {
        const acMatch = newStats.AC.match(/^(\d+)/);
        const touchMatch = newStats.AC.match(/touch\s*(\d+)/);
        const ffMatch = newStats.AC.match(/flat-footed\s*(\d+)/);
        if (acMatch) newStats.AC = parseInt(acMatch[1], 10);
        if (touchMatch) newStats.Touch = parseInt(touchMatch[1], 10);
        if (ffMatch) newStats['Flat-Footed'] = parseInt(ffMatch[1], 10);
    }
    if (typeof newStats.AC !== 'number') newStats.AC = 10 + dexMod;
    if (typeof newStats.Touch !== 'number') newStats.Touch = 10 + dexMod;
    if (typeof newStats['Flat-Footed'] !== 'number') newStats['Flat-Footed'] = newStats.AC - dexMod;

    if (!newStats.Saves) {
        const level = parseInt(String(newStats.Level || newStats.CR || 1), 10);
        const con = parseInt(String(newStats.Con).match(/-?\d+/)?.[0] || '10', 10);
        const dex = parseInt(String(newStats.Dex).match(/-?\d+/)?.[0] || '10', 10);
        const wis = parseInt(String(newStats.Wis).match(/-?\d+/)?.[0] || '10', 10);
        const isFortGood = con >= 14 || (con >= dex && con >= wis);
        const isRefGood = dex >= 14 || (dex >= con && dex >= wis);
        const isWillGood = wis >= 14 || (wis >= con && wis >= wis);
        const safeLevelIndex = Math.max(0, Math.min(level - 1, GOOD_SAVES.length - 1));
        const baseFort = isFortGood ? GOOD_SAVES[safeLevelIndex] : POOR_SAVES[safeLevelIndex];
        const baseRef = isRefGood ? GOOD_SAVES[safeLevelIndex] : POOR_SAVES[safeLevelIndex];
        const baseWill = isWillGood ? GOOD_SAVES[safeLevelIndex] : POOR_SAVES[safeLevelIndex];
        const formatMod = (mod: number) => mod >= 0 ? `+${mod}` : String(mod);
        newStats.Saves = `Fort ${formatMod(baseFort + conMod)}, Ref ${formatMod(baseRef + dexMod)}, Will ${formatMod(baseWill + wisMod)}`;
    }

    if (!newStats.Speed) newStats.Speed = '30 ft.';
    if (typeof newStats.BAB !== 'number') newStats.BAB = parseInt(String(newStats['Base Attack Bonus'] || newStats.BAB || 0).match(/-?\d+/)?.[0] || '0', 10);
    if (typeof newStats.CMB !== 'number') newStats.CMB = newStats.BAB + strMod;
    if (typeof newStats.CMD !== 'number') newStats.CMD = 10 + newStats.BAB + strMod + dexMod;
    
    const hpValue = newStats.hp || newStats.HP || '1d8';
    const avgHpMatch = String(hpValue).match(/^(\d+)/);
    const diceInParenMatch = String(hpValue).match(/\((\s*\d+d\d+[+-]?\s*\d*\s*)\)/);
    if (avgHpMatch) newStats.maxHp = parseInt(avgHpMatch[1], 10);
    else if (diceInParenMatch) newStats.maxHp = this.calculateAverageHp(diceInParenMatch[1]);
    else newStats.maxHp = this.calculateAverageHp(String(hpValue));
    if (isNaN(newStats.maxHp) || newStats.maxHp <= 0) newStats.maxHp = 10;

    return newStats;
  };
  
  getAbilityModifier(score: any): string {
    const mod = Math.floor((Number(score) - 10) / 2);
    return isNaN(mod) ? '' : (mod >= 0 ? `+${mod}` : `${mod}`);
  }

  parseSaves = (s: any, stats: any) => {
    const res = { Fort: 0, Ref: 0, Will: 0 };
    if (typeof s === 'string') {
        res.Fort = parseInt(s.match(/Fort\s*([+-]?\d+)/i)?.[1]||'0',10);
        res.Ref = parseInt(s.match(/Ref\s*([+-]?\d+)/i)?.[1]||'0',10);
        res.Will = parseInt(s.match(/Will\s*([+-]?\d+)/i)?.[1]||'0',10);
    } else {
        res.Fort=this.getAbilityModifierAsNumber(stats?.Con); res.Ref=this.getAbilityModifierAsNumber(stats?.Dex); res.Will=this.getAbilityModifierAsNumber(stats?.Wis);
    }
    return res;
  }
  formatSaves = (s: {Fort:number;Ref:number;Will:number}) => `Fort ${s.Fort>=0?'+':''}${s.Fort}, Ref ${s.Ref>=0?'+':''}${s.Ref}, Will ${s.Will>=0?'+':''}${s.Will}`;
  parseAttacks = (s: any) => {
    const attacks: ParsedAttack[] = [];
    const parse = (str: string) => {
      const regex = /(.+?)\s*([+-]\d+(?:\/[+-]\d+)*)\s*\((.+?)\)/g;
      let m; while ((m = regex.exec(str)) !== null) attacks.push({ name: m[1].trim(), bonus: m[2].trim(), damage: m[3].trim() });
    };
    parse(s.Melee||''); parse(s.Ranged||'');
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

        let attackAbilityMod = this.getAbilityModifierAsNumber(modifiedStats.Str);
        let damageAbilityMod = this.getAbilityModifierAsNumber(modifiedStats.Str);
        
        if (isRanged && !isThrown) {
            attackAbilityMod = this.getAbilityModifierAsNumber(modifiedStats.Dex);
            const isComposite = lowerWeaponName.includes('composite');
            damageAbilityMod = isComposite ? this.getAbilityModifierAsNumber(modifiedStats.Str) : 0; 
        } else if (hasWeaponFinesse && isLight) {
            attackAbilityMod = this.getAbilityModifierAsNumber(modifiedStats.Dex);
        }

        const enhancementBonusMatch = weaponName.match(/^\+(\d+)/);
        const enhancementBonus = enhancementBonusMatch ? parseInt(enhancementBonusMatch[1], 10) : 0;
        
        let powerAttackPenalty = 0;
        let powerAttackDamage = 0;
        if(hasPowerAttack && !isRanged) {
            const bab = modifiedStats.BAB || 0;
            powerAttackPenalty = bab >= 12 ? -4 : bab >= 8 ? -3 : bab >= 4 ? -2 : -1;
            powerAttackDamage = Math.abs(powerAttackPenalty) * 2;
        }

        const totalAttackBonus = modifiedStats.BAB + attackAbilityMod + enhancementBonus + powerAttackPenalty;
        const formattedAttackBonus = totalAttackBonus >= 0 ? `+${totalAttackBonus}` : `${totalAttackBonus}`;

        let totalDamageBonus = damageAbilityMod + enhancementBonus + powerAttackDamage;
        let damageString = props.damage_m || '1d6';
        if (totalDamageBonus !== 0) {
            damageString += totalDamageBonus > 0 ? `+${totalDamageBonus}` : ` ${totalDamageBonus}`;
        }
        
        const critString = props.critical ? ` (${props.critical})` : '';
        
        weaponAttacks.push({
            name: weaponName,
            bonus: formattedAttackBonus,
            damage: `${damageString}${critString}`.trim()
        });
    }

    return weaponAttacks;
  }

  getCacheForType = (t: 'rule' | 'equipment' | 'magic-item' | 'effect') => {
    if (t === 'rule') return this.rulesCache;
    if (t === 'equipment') return this.equipmentCache;
    if (t === 'magic-item') return this.magicItemsCache;
    return this.effectsCache;
  }

  showTooltip(e:MouseEvent, id: string, type: 'rule' | 'equipment' | 'magic-item' | 'effect') {
    const cache = this.getCacheForType(type)();
    const item = cache.get(id);

    this.tooltipContent.set({ 
      title: item?.name || 'Unknown', 
      data: item, 
      status: item ? 'loaded' : 'error' 
    });
    this.tooltipPosition.set({ top: `${e.clientY + 15}px`, left: `${e.clientX + 15}px` });
  }

  hideTooltip = () => this.tooltipContent.set(null);
  
  objectKeys = (obj: any) => obj ? Object.keys(obj) : [];
  formatTime = (t: any) => new Date(t).toLocaleString();
  formatName(name: string): string { return name ? name.replace(/_/g, ' ').replace(/-/g, ' ') : ''; }
}