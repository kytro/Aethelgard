import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

// Child Components
import { CodexAssistantComponent } from './codex-assistant/codex-assistant.component';
import { NpcGeneratorComponent } from './npc-generator/npc-generator.component';
import { SessionLoggerComponent } from './session-logger/session-logger.component';
import { CombatManagerComponent } from './combat-manager/combat-manager.component';
import { StoryPlannerComponent } from './story-planner/story-planner.component';

@Component({
  selector: 'app-dm-toolkit',
  standalone: true,
  imports: [
    CommonModule, 
    CodexAssistantComponent, 
    NpcGeneratorComponent, 
    SessionLoggerComponent, 
    CombatManagerComponent,
    StoryPlannerComponent
  ],
  templateUrl: './dm-toolkit.component.html',
  styleUrls: ['./dm-toolkit.component.css'],
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }
  `]
})
export class DmToolkitComponent implements OnInit {
  http = inject(HttpClient);

  activeTool = signal<'assistant' | 'npc-generator' | 'session' | 'combat-manager' | 'story-planner'>('assistant');
  
  fights = signal<any[]>([]);
  sessions = signal<any[]>([]);
  codex = signal<any>(null);
  
  // Caches passed down to children
  rulesCache = signal<Map<string, any>>(new Map());
  equipmentCache = signal<Map<string, any>>(new Map());
  magicItemsCache = signal<Map<string, any>>(new Map());
  spellsCache = signal<Map<string, any>>(new Map());
  effectsCache = signal<Map<string, any>>(new Map());
  entitiesCache = signal<any[]>([]);
  foundCreatures = signal<any[]>([]);

  sessionCount = computed(() => this.sessions().length);
  fightCount = computed(() => this.fights().length);
  entityNames = computed(() => this.entitiesCache().map(e => e.name));

  ngOnInit() {
    this.loadInitialData();
    // TODO: Set up real-time listeners (onSnapshot) for a production app
  }

  async loadInitialData() {
    try {
      const [fights, sessions, codex, entitiesData, rules, equipment, magicItems, effects, spells] = await Promise.all([
        lastValueFrom(this.http.get<any[]>('/codex/api/dm-toolkit/fights')),
        lastValueFrom(this.http.get<any[]>('/codex/api/dm-toolkit/sessions')),
        lastValueFrom(this.http.get<any>('/codex/api/codex/data')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/entities_pf1e')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/rules_pf1e')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/equipment_pf1e')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/magic_items_pf1e')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/dm_toolkit_effects')),
        lastValueFrom(this.http.get<any[]>('/codex/api/admin/collections/spells_pf1e')),
      ]);

      this.fights.set(fights);
      this.sessions.set(sessions);
      this.codex.set(this.buildCodexObject(codex));
      this.entitiesCache.set(entitiesData.map(e => ({ ...e, id: e._id })));

      this.rulesCache.set(new Map(rules.map(item => [item._id, item])));
      this.equipmentCache.set(new Map(equipment.map(item => [item._id, item])));
      this.magicItemsCache.set(new Map(magicItems.map(item => [item._id, item])));
      this.effectsCache.set(new Map(effects.map(item => [item._id, { data: item, status: 'loaded' }])));
      this.spellsCache.set(new Map(spells.map(item => [item._id, item])));

    } catch (error) {
      console.error("Failed to load DM Toolkit data", error);
    }
  }

  private buildCodexObject(entries: any[]): any {
    const root: Record<string, any> = {};
    if (!Array.isArray(entries)) return root;
    entries.sort((a, b) => (a.path_components?.length || 0) - (b.path_components?.length || 0));
    for (const entry of entries) {
      if (!entry.path_components) continue;
      let target: Record<string, any> = root;
      for (const key of entry.path_components as string[]) {
        if (!target[key]) target[key] = {};
        target = target[key];
      }
      Object.assign(target, entry);
    }
    return root;
  }

  onFightAdded(fight: any) {
    this.fights.update(fights => [fight, ...fights]);
  }

  onFightDeleted(fightId: string) {
    this.fights.update(fights => fights.filter(f => f._id !== fightId));
  }

  onSessionAdded(session: any) {
    this.sessions.update(sessions => [...sessions, session]);
  }

  onSessionUpdated(session: any) {
    this.sessions.update(sessions => {
      const index = sessions.findIndex(s => s._id === session._id);
      if (index !== -1) {
        sessions[index] = session;
      }
      return [...sessions];
    });
  }

  onSessionDeleted(sessionId: string) {
    this.sessions.update(sessions => sessions.filter(s => s._id !== sessionId));
  }
}