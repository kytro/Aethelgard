import { Component, signal, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { calculateCompleteBaseStats } from '../dm-toolkit.utils';

interface GeneratedNpc {
    name: string;
    race: string;
    description: string;
    baseStats?: { [key: string]: number };
    class?: string;
    level?: number;
    skills?: { [key: string]: number };
    equipment?: string[];
    magicItems?: string[];
    spells?: { [level: string]: string[] };
    backstory?: string;
    gender?: string;
    alignment?: string;
    deity?: string;
    hitDice?: string;
    feats?: string[];
    specialAbilities?: string[];
    spellSlots?: { [level: string]: number };
    type?: string;
    size?: string;
    hp?: string;
    ac?: number;
    acTouch?: number;
    acFlatFooted?: number;
    bab?: number;
    cmb?: number;
    cmd?: number;
    fortSave?: number;
    refSave?: number;
    willSave?: number;
    dr?: string;
    sr?: number;
    resist?: string;
    immune?: string;
    spellSaveDc?: number;
}

@Component({
    selector: 'app-npc-generator',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div id="npc-generator">
      <h2 class="text-3xl font-bold text-white mb-6 text-yellow-500">NPC Generator</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div class="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-400 mb-1">Codex Path</label>
              <input type="text" [(ngModel)]="npcGenGroupName" placeholder="e.g., People/MyCity/Tavern" class="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500">
            </div>
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-400 mb-1">Generation Prompt</label>
              <textarea [(ngModel)]="npcGenQuery" placeholder="e.g., Three human bandits, one is the leader" class="w-full h-24 bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"></textarea>
            </div>
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-400 mb-1">Context</label>
              <textarea [(ngModel)]="npcGenContext" placeholder="e.g., They are operating in the Whisperwood Forest, known for their ruthless ambushes." class="w-full h-32 bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"></textarea>
            </div>
            <button (click)="handleGenerateNpcs()" [disabled]="isGeneratingNpcs()" class="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-gray-500">
              {{ isGeneratingNpcs() ? 'Generating...' : 'Generate NPCs' }}
            </button>

            @if (npcSaveSuccessMessage()) {
              <div class="mt-4 bg-green-800/50 border border-green-700 text-green-300 p-4 rounded-md">
                  {{ npcSaveSuccessMessage() }}
              </div>
            }
          </div>
        </div>
        <div>
          @if (lastGeneratedNpcs().length > 0) {
            <div class="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
              <div class="flex justify-between items-center mb-3">
                <h3 class="font-semibold text-xl text-yellow-400">Generated NPCs for "{{ lastGeneratedGroupName() }}"</h3>
                <button (click)="handleSaveNpcsToCodex()" [disabled]="isSavingNpcs()" class="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-gray-500">
                  {{ isSavingNpcs() ? 'Saving...' : 'Save to Codex' }}
                </button>
              </div>
              <div class="space-y-4">
                @for (npc of lastGeneratedNpcs(); track npc.name) {
                  <div class="bg-gray-900/50 p-4 rounded-md border border-gray-700">
                    <h4 class="font-bold text-lg text-yellow-400">{{ npc.name }} <span class="text-sm font-normal text-gray-400">({{ npc.race }})</span></h4>
                    
                    @if (npc.class && npc.level) {
                        <p class="text-purple-400 text-sm font-semibold">{{ npc.class }} {{ npc.level }}</p>
                    }
            
                    <p class="text-gray-300 mt-2">{{ npc.description }}</p>
                    
                    @if (npc.baseStats) {
                        <div class="grid grid-cols-6 gap-2 mt-3 mb-3">
                            @for(stat of ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha']; track stat) {
                                <div class="text-center bg-black/30 p-1 rounded">
                                    <span class="block font-semibold text-xs text-gray-500 uppercase">{{stat}}</span>
                                    <span class="block font-bold text-white">{{npc.baseStats[stat] || 10}}</span>
                                </div>
                            }
                        </div>
                    }
            
                    <div class="space-y-3 mt-3 text-sm">
                        @if (npc.backstory) {
                            <div>
                                <h5 class="font-semibold text-gray-300">Backstory</h5>
                                <p class="text-gray-400 text-sm italic">{{ npc.backstory }}</p>
                            </div>
                        }
            
                        @if (npc.skills && objectKeys(npc.skills).length > 0) {
                            <div>
                                <h5 class="font-semibold text-gray-300">Skills</h5>
                                <div class="flex flex-wrap gap-x-4 gap-y-1">
                                    @for(skill of objectKeys(npc.skills); track skill) {
                                        <span class="text-gray-400">{{ skill }}: <span class="font-mono text-green-400">{{ npc.skills[skill] }}</span></span>
                                    }
                                </div>
                            </div>
                        }
            
                        @if (npc.feats && npc.feats.length > 0) {
                            <div>
                                <h5 class="font-semibold text-gray-300">Feats</h5>
                                <p class="text-gray-400">{{ npc.feats.join(', ') }}</p>
                            </div>
                        }
            
                        @if (npc.specialAbilities && npc.specialAbilities.length > 0) {
                            <div>
                                <h5 class="font-semibold text-gray-300">Special Abilities</h5>
                                <p class="text-gray-400">{{ npc.specialAbilities.join(', ') }}</p>
                            </div>
                        }
            
                        @if (npc.equipment && npc.equipment.length > 0) {
                            <div>
                                <h5 class="font-semibold text-gray-300">Equipment</h5>
                                <p class="text-gray-400">{{ npc.equipment.join(', ') }}</p>
                            </div>
                        }
            
                        @if (npc.magicItems && npc.magicItems.length > 0) {
                            <div>
                                <h5 class="font-semibold text-gray-300">Magic Items</h5>
                                <p class="text-gray-400">{{ npc.magicItems.join(', ') }}</p>
                            </div>
                        }
            
                        @if (npc.spells && objectKeys(npc.spells).length > 0) {
                            <div>
                                <h5 class="font-semibold text-gray-300">Spells</h5>
                                @for(level of objectKeys(npc.spells); track level) {
                                    @if(npc.spells[level].length > 0) {
                                        <p class="text-gray-400"><b class="text-gray-300">Level {{level}}:</b> {{ npc.spells[level].join(', ') }}</p>
                                    }
                                }
                            </div>
                        }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export class NpcGeneratorComponent {
    codex = input<any>();
    existingEntityNames = input<string[]>([]);
    rulesCache = input<Map<string, any>>(new Map());
    equipmentCache = input<Map<string, any>>(new Map());
    magicItemsCache = input<Map<string, any>>(new Map());
    spellsCache = input<Map<string, any>>(new Map());

    http = inject(HttpClient);

    npcGenQuery = '';
    npcGenContext = '';
    npcGenGroupName = 'People/';
    isGeneratingNpcs = signal(false);
    isSavingNpcs = signal(false);
    lastGeneratedNpcs = signal<GeneratedNpc[]>([]);
    lastGeneratedGroupName = signal('');
    npcSaveSuccessMessage = signal('');

    objectKeys = Object.keys;

    private mapToIds(names: string[], cache: Map<string, any>, idPrefix: string): string[] {
        if (!names || !Array.isArray(names)) return [];
        return names.map(name => {
            for (const [id, item] of cache.entries()) {
                if (item.name.toLowerCase() === name.toLowerCase()) {
                    return id;
                }
            }
            return '';
        }).filter(id => id !== '');
    }

    async handleGenerateNpcs() {
        if (!this.npcGenQuery.trim() || !this.npcGenContext.trim() || !this.npcGenGroupName.trim()) return;

        if (this.codex()?.['Generated Characters']?.[this.npcGenGroupName]) {
            console.error("Group name already exists");
            this.npcSaveSuccessMessage.set('Error: Group name already exists in Codex.');
            return;
        }

        this.isGeneratingNpcs.set(true);
        this.lastGeneratedNpcs.set([]);
        this.npcSaveSuccessMessage.set('');

        try {
            const codexData = this.codex();

            // Build broader world context from multiple codex sections
            const worldContext: any = {
                userContext: this.npcGenContext,
                targetPath: this.npcGenGroupName // Where the NPCs will be placed
            };

            // Include key world-building sections if they exist
            if (codexData) {
                if (codexData['Places']) worldContext.places = codexData['Places'];
                if (codexData['Factions']) worldContext.factions = codexData['Factions'];
                if (codexData['Organizations']) worldContext.organizations = codexData['Organizations'];
                if (codexData['History']) worldContext.history = codexData['History'];
                if (codexData['Lore']) worldContext.lore = codexData['Lore'];
                if (codexData['Religions']) worldContext.religions = codexData['Religions'];
                if (codexData['Deities']) worldContext.deities = codexData['Deities'];
                if (codexData['People']) worldContext.existingPeople = codexData['People'];
            }

            const npcs = await lastValueFrom(this.http.post<GeneratedNpc[]>('/codex/api/dm-toolkit-ai/generate-npcs', {
                query: this.npcGenQuery,
                options: {
                    codex: worldContext,
                    existingEntityNames: this.existingEntityNames()
                }
            }));

            this.lastGeneratedNpcs.set(npcs);
            this.lastGeneratedGroupName.set(this.npcGenGroupName);
        } catch (e: any) {
            console.error("Error generating NPCs:", e);
            this.npcSaveSuccessMessage.set(`Error: ${e.error?.error || e.message}`);
        } finally {
            this.isGeneratingNpcs.set(false);
        }
    }

    async handleSaveNpcsToCodex() {
        if (this.lastGeneratedNpcs().length === 0 || !this.lastGeneratedGroupName()) return;

        this.isSavingNpcs.set(true);
        this.npcSaveSuccessMessage.set('');
        const pathString = this.lastGeneratedGroupName();
        const npcCount = this.lastGeneratedNpcs().length;

        try {
            const basePath = pathString.replace(/\\/g, '/').split('/').filter(p => p.trim() !== '').map(p => p.trim().replace(/ /g, '_'));
            const allNewEntries: any[] = [];

            // Create parent folder entries if they don't exist
            const codex = this.codex();
            if (codex) {
                for (let i = 0; i < basePath.length; i++) {
                    const currentPath = basePath.slice(0, i + 1);

                    let node = codex;
                    let pathExists = true;
                    for (const component of currentPath) {
                        if (node && typeof node === 'object' && node.hasOwnProperty(component)) {
                            node = node[component];
                        } else {
                            pathExists = false;
                            break;
                        }
                    }

                    if (!pathExists) {
                        const pathName = currentPath[currentPath.length - 1];
                        const parentEntry = {
                            path_components: currentPath,
                            name: pathName.replace(/_/g, ' '),
                            content: null,
                            category: null,
                            summary: null
                        };
                        allNewEntries.push(parentEntry);

                        // Simulate the creation in the local codex object to prevent duplicates in this run
                        let tempNode = codex;
                        for (const p of currentPath) {
                            if (!tempNode[p]) tempNode[p] = {};
                            tempNode = tempNode[p];
                        }
                    }
                }
            }

            for (const npc of this.lastGeneratedNpcs()) {
                const completeBaseStats = calculateCompleteBaseStats(npc.baseStats);

                const linkedEquipment = this.mapToIds(npc.equipment || [], this.equipmentCache(), 'eq_');
                const linkedMagicItems = this.mapToIds(npc.magicItems || [], this.magicItemsCache(), 'mi_');
                const rulesToLink = [...(npc.feats || []), ...(npc.specialAbilities || [])];
                const linkedRules = this.mapToIds(rulesToLink, this.rulesCache(), 'feat_');

                const linkedSpells: { [level: string]: string[] } = {};
                if (npc.spells) {
                    for (const level of Object.keys(npc.spells)) {
                        linkedSpells[level] = this.mapToIds(npc.spells[level], this.spellsCache(), 'sp_');
                    }
                }

                const entity: any = {
                    name: npc.name,
                    baseStats: completeBaseStats,
                    description: npc.description,
                    sourceCodexPath: [...basePath, npc.name.replace(/ /g, '_')],
                    rules: linkedRules,
                    equipment: linkedEquipment,
                    magicItems: linkedMagicItems,
                    spells: linkedSpells,
                    deity: npc.deity || '',
                };

                if (npc.type) entity.baseStats.type = npc.type;
                if (npc.class) entity.baseStats.Class = npc.class;
                if (npc.level) entity.baseStats.Level = npc.level;
                if (npc.gender) entity.baseStats.Gender = npc.gender;
                if (npc.alignment) entity.baseStats.Alignment = npc.alignment;
                if (npc.size) entity.baseStats.size = npc.size;
                if (npc.hp) entity.baseStats.HP = npc.hp;
                if (npc.hitDice) entity.baseStats.HitDice = npc.hitDice;

                // AC values
                if (npc.ac !== undefined) {
                    entity.baseStats.armorClass = entity.baseStats.armorClass || {};
                    entity.baseStats.armorClass.total = npc.ac;
                    entity.baseStats.armorClass.touch = npc.acTouch ?? npc.ac;
                    entity.baseStats.armorClass.flatFooted = npc.acFlatFooted ?? npc.ac;
                }

                // Combat stats
                entity.baseStats.combat = entity.baseStats.combat || {};
                if (npc.bab !== undefined) entity.baseStats.combat.bab = npc.bab;
                if (npc.cmb !== undefined) entity.baseStats.combat.cmb = npc.cmb;
                if (npc.cmd !== undefined) entity.baseStats.combat.cmd = npc.cmd;

                // Saves
                entity.baseStats.saves = entity.baseStats.saves || {};
                if (npc.fortSave !== undefined) entity.baseStats.saves.fortitude = npc.fortSave;
                if (npc.refSave !== undefined) entity.baseStats.saves.reflex = npc.refSave;
                if (npc.willSave !== undefined) entity.baseStats.saves.will = npc.willSave;

                if (npc.spellSlots) entity.spellSlots = npc.spellSlots;
                if (npc.spellSaveDc !== undefined) entity.baseStats.spellSaveDc = npc.spellSaveDc;

                // Defenses
                if (npc.dr && npc.dr !== '-') entity.baseStats.DR = npc.dr;
                if (npc.sr) entity.baseStats.SR = npc.sr;
                if (npc.resist && npc.resist !== '-') entity.baseStats.Resist = npc.resist;
                if (npc.immune && npc.immune !== '-') entity.baseStats.Immune = npc.immune;
                if (npc.skills) entity.baseStats.skills = npc.skills;

                const newEntity = await lastValueFrom(this.http.post<any>('/codex/api/admin/collections/entities_pf1e', entity));

                const codexContent = [
                    { type: 'heading', text: 'Description' },
                    { type: 'paragraph', text: npc.description }
                ];

                if (npc.backstory) {
                    codexContent.push({ type: 'heading', text: 'Backstory' });
                    codexContent.push({ type: 'paragraph', text: npc.backstory });
                }

                const codexEntry = {
                    path_components: [...basePath, npc.name.replace(/ /g, '_')],
                    name: npc.name.replace(/ /g, '_'),
                    content: codexContent,
                    summary: `Auto-generated entry for NPC: ${npc.name}`,
                    entityId: newEntity.insertedId
                };
                allNewEntries.push(codexEntry);
            }

            if (allNewEntries.length > 0) {
                await lastValueFrom(this.http.put('/codex/api/codex/data', allNewEntries));
            }

            this.lastGeneratedNpcs.set([]);
            this.lastGeneratedGroupName.set('');
            this.npcSaveSuccessMessage.set(`${npcCount} NPCs saved to codex under "${pathString}"!`);

        } catch (error: any) {
            console.error('Error saving NPCs:', error);
            this.npcSaveSuccessMessage.set(`Failed to save: ${error.message}`);
        } finally {
            this.isSavingNpcs.set(false);
        }
    }
}