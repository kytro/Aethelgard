import { Component, signal, inject, input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { calculateCompleteBaseStats } from '../dm-toolkit.utils';

// Equipment can be strings (old format) or objects (new PF1e format)
interface EquipmentItem {
    name: string;
    type?: 'weapon' | 'armor' | 'shield' | 'ring' | 'wondrous' | 'potion' | 'other';
    weight?: number;
    maxDex?: number;
    checkPenalty?: number;
    armorBonus?: number;
    shieldBonus?: number;
    deflectionBonus?: number;
    properties?: {
        damage_m?: string;
        critical?: string;
        range?: number | null;
        light?: boolean;
    };
}

interface GeneratedNpc {
    name: string;
    race: string;
    description: string;
    baseStats?: { [key: string]: number };
    class?: string;
    level?: number;
    skills?: { [key: string]: number };
    classSkills?: string[];
    equipment?: (string | EquipmentItem)[];
    magicItems?: (string | EquipmentItem)[];
    spells?: { [level: string]: string[] };
    backstory?: string;
    gender?: string;
    alignment?: string;
    deity?: string;
    hitDice?: string;
    feats?: string[];
    specialAbilities?: string[];
    specialAttacks?: string[];
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
    attacks?: { name: string; bonus: string; damage: string; type?: string }[];
    vulnerabilities?: string[];
    spellSaveDc?: number;
    // UI state flags
    detailsGenerated?: boolean;
    isGeneratingDetails?: boolean;
    isSaving?: boolean;
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
            <div class="mb-4 relative">
              <label class="block text-sm font-medium text-gray-400 mb-1">Context Page (Optional)</label>
              <input type="text" 
                     [ngModel]="npcGenContextSource"
                     (input)="searchContextPaths($event)"
                     (focus)="searchContextPaths($event)"
                     (blur)="closeDropdown()"
                     placeholder="Search Codex for context..." 
                     class="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                     autocomplete="off">
              
              @if (showContextDropdown) {
                <ul class="absolute z-10 w-full bg-gray-800 border border-gray-600 rounded-md mt-1 max-h-48 overflow-y-auto shadow-lg">
                    @for (path of filteredPaths; track path) {
                        <li (click)="selectContextPath(path)" class="p-2 hover:bg-gray-700 cursor-pointer text-gray-200 text-sm border-b border-gray-700 last:border-b-0">
                            {{ path }}
                        </li>
                    }
                </ul>
              }
              <p class="text-xs text-gray-500 mt-1">Select a Codex page to include its content and links as context.</p>
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
              </div>
              <div class="space-y-4">
                @for (npc of lastGeneratedNpcs(); track $index) {
                  <div class="bg-gray-900/50 p-4 rounded-md border border-gray-700">
                    <!-- Editable Name -->
                    <div class="flex items-center gap-2 mb-2">
                      <input 
                        type="text" 
                        [value]="npc.name" 
                        (input)="updateNpcName($index, $event)"
                        class="font-bold text-lg text-yellow-400 bg-transparent border-b border-gray-600 focus:border-yellow-500 focus:outline-none px-1"
                      />
                      <span class="text-sm text-gray-400">({{ npc.race }})</span>
                    </div>
                    
                    @if (npc.class && npc.level) {
                        <p class="text-purple-400 text-sm font-semibold">{{ npc.class }} {{ npc.level }} | {{ npc.size || 'Medium' }} | {{ npc.alignment }}</p>
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

                    @if (npc.hp || npc.ac) {
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 mb-2 text-sm">
                            @if (npc.hp) {
                                <div class="bg-red-900/30 p-2 rounded text-center">
                                    <span class="block text-xs text-gray-400">HP</span>
                                    <span class="font-bold text-red-400">{{npc.hp}}</span>
                                </div>
                            }
                            @if (npc.ac) {
                                <div class="bg-blue-900/30 p-2 rounded text-center">
                                    <span class="block text-xs text-gray-400">AC</span>
                                    <span class="font-bold text-blue-400">{{npc.ac}}</span>
                                    <span class="text-xs text-gray-500"> (T{{npc.acTouch}}, FF{{npc.acFlatFooted}})</span>
                                </div>
                            }
                            @if (npc.bab !== undefined) {
                                <div class="bg-orange-900/30 p-2 rounded text-center">
                                    <span class="block text-xs text-gray-400">BAB</span>
                                    <span class="font-bold text-orange-400">+{{npc.bab}}</span>
                                </div>
                            }
                            @if (npc.cmb !== undefined || npc.cmd !== undefined) {
                                <div class="bg-purple-900/30 p-2 rounded text-center">
                                    <span class="block text-xs text-gray-400">CMB/CMD</span>
                                    <span class="font-bold text-purple-400">+{{npc.cmb}}/{{npc.cmd}}</span>
                                </div>
                            }
                        </div>
                    }

                    @if (npc.fortSave !== undefined || npc.refSave !== undefined || npc.willSave !== undefined) {
                        <div class="flex gap-4 mt-2 text-sm">
                            <span class="text-gray-400">Saves: 
                                <span class="text-green-400">Fort +{{npc.fortSave}}</span>,
                                <span class="text-blue-400">Ref +{{npc.refSave}}</span>,
                                <span class="text-purple-400">Will +{{npc.willSave}}</span>
                            </span>
                        </div>
                    }

                    @if (npc.baseStats && npc.baseStats['Speed']) {
                        <div class="mt-2 text-sm">
                             <p class="text-gray-400"><span class="text-white font-semibold">Speed:</span> {{ npc.baseStats['Speed'] }}</p>
                        </div>
                    }
                    
                    @if ((npc.dr && npc.dr !== '-') || npc.sr || (npc.resist && npc.resist !== '-') || (npc.immune && npc.immune !== '-')) {
                        <div class="mt-2 text-sm space-y-1">
                            @if (npc.dr && npc.dr !== '-') {
                                <p class="text-gray-400"><span class="text-yellow-500 font-semibold">DR:</span> {{npc.dr}}</p>
                            }
                            @if (npc.sr) {
                                <p class="text-gray-400"><span class="text-cyan-500 font-semibold">SR:</span> {{npc.sr}}</p>
                            }
                            @if (npc.resist && npc.resist !== '-') {
                                <p class="text-gray-400"><span class="text-orange-500 font-semibold">Resist:</span> {{npc.resist}}</p>
                            }
                            @if (npc.immune && npc.immune !== '-') {
                                <p class="text-gray-400"><span class="text-red-500 font-semibold">Immune:</span> {{npc.immune}}</p>
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
            
                        @if (npc.specialAttacks && npc.specialAttacks.length > 0) {
                            <div>
                                <h5 class="font-semibold text-red-500">Special Attacks</h5>
                                <p class="text-gray-400">{{ npc.specialAttacks.join(', ') }}</p>
                            </div>
                        }

                        @if (npc.specialAbilities && npc.specialAbilities.length > 0) {
                            <div>
                                <h5 class="font-semibold text-gray-300">Special Qualities</h5>
                                <p class="text-gray-400">{{ npc.specialAbilities.join(', ') }}</p>
                            </div>
                        }
            
                        @if (npc.equipment && npc.equipment.length > 0) {
                            <div>
                                <h5 class="font-semibold text-gray-300">Equipment</h5>
                                <p class="text-gray-400">{{ formatItems(npc.equipment) }}</p>
                            </div>
                        }
            
                        @if (npc.magicItems && npc.magicItems.length > 0) {
                            <div>
                                <h5 class="font-semibold text-gray-300">Magic Items</h5>
                                <p class="text-gray-400">{{ formatItems(npc.magicItems) }}</p>
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

                        @if (npc.spellSlots && objectKeys(npc.spellSlots).length > 0) {
                            <div class="mt-2">
                                <h5 class="font-semibold text-gray-300">Spell Slots</h5>
                                <div class="flex flex-wrap gap-2">
                                    @for(level of objectKeys(npc.spellSlots); track level) {
                                        <span class="text-gray-400">L{{level}}: <span class="text-blue-400 font-bold">{{ npc.spellSlots[level] }}</span></span>
                                    }
                                </div>
                            </div>
                        }
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex gap-2 mt-4 pt-3 border-t border-gray-700">
                      @if (!npc.detailsGenerated) {
                        <button 
                          (click)="handleGenerateDetails($index)" 
                          [disabled]="npc.isGeneratingDetails"
                          class="bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold py-2 px-3 rounded-md transition-colors disabled:bg-gray-500">
                          {{ npc.isGeneratingDetails ? 'Generating...' : '✨ Generate Details' }}
                        </button>
                      } @else {
                        <span class="text-green-400 text-sm py-2">✓ Details Generated</span>
                      }
                      <button 
                        (click)="handleSaveNpc($index)" 
                        [disabled]="npc.isSaving"
                        class="bg-green-600 hover:bg-green-500 text-white text-sm font-bold py-2 px-3 rounded-md transition-colors disabled:bg-gray-500">
                        {{ npc.isSaving ? 'Saving...' : '💾 Save to Codex' }}
                      </button>
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
    npcGenContextSource = '';

    // Type-ahead state
    codexPaths: string[] = [];
    filteredPaths: string[] = [];
    showContextDropdown = false;

    npcGenGroupName = 'People/';
    isGeneratingNpcs = signal(false);
    isSavingNpcs = signal(false);
    lastGeneratedNpcs = signal<GeneratedNpc[]>([]);
    lastGeneratedGroupName = signal('');
    npcSaveSuccessMessage = signal('');

    objectKeys = Object.keys;

    constructor() {
        effect(() => {
            if (this.codex()) {
                this.updateCodexPaths();
            }
        });
    }

    formatItems(items: (string | EquipmentItem)[]): string {
        return items.map(item => typeof item === 'string' ? item : item.name).join(', ');
    }

    private mapToIds(items: (string | EquipmentItem)[], cache: Map<string, any>, idPrefix: string): string[] {
        if (!items || !Array.isArray(items)) return [];
        return items.map(item => {
            // Get name from string or object
            const itemName = typeof item === 'string' ? item : item.name;
            for (const [id, cacheItem] of cache.entries()) {
                if (cacheItem.name?.toLowerCase() === itemName?.toLowerCase()) {
                    return id;
                }
            }
            return '';
        }).filter(id => id !== '');
    }

    updateNpcName(index: number, event: Event) {
        const input = event.target as HTMLInputElement;
        const npcs = [...this.lastGeneratedNpcs()];
        if (npcs[index]) {
            npcs[index] = { ...npcs[index], name: input.value };
            this.lastGeneratedNpcs.set(npcs);
        }
    }

    async handleGenerateDetails(index: number) {
        const npcs = [...this.lastGeneratedNpcs()];
        const npc = npcs[index];
        if (!npc) return;

        // Set loading state
        npcs[index] = { ...npc, isGeneratingDetails: true };
        this.lastGeneratedNpcs.set(npcs);

        try {
            const details = await lastValueFrom(this.http.post<any>('/codex/api/dm-toolkit-ai/generate-npc-details', {
                query: 'Generate details',
                options: {
                    npc: {
                        name: npc.name,
                        race: npc.race,
                        type: npc.type,
                        class: npc.class,
                        level: npc.level,
                        size: npc.size,
                        description: npc.description,
                        backstory: npc.backstory,
                        gender: npc.gender,
                        alignment: npc.alignment,
                        deity: npc.deity
                    },
                    generationPrompt: this.npcGenQuery,
                    generationContext: this.npcGenContext
                }
            }));

            // Merge details into NPC
            // Manual Map of Speed if present (ensure it lands in baseStats)
            if (details.speed && !details.baseStats?.Speed) {
                if (!details.baseStats) details.baseStats = {};
                details.baseStats.Speed = details.speed;
            }

            const normalizedDetails = this.normalizeNpcDetails(details);
            const updatedNpcs = [...this.lastGeneratedNpcs()];
            updatedNpcs[index] = {
                ...updatedNpcs[index],
                ...normalizedDetails,
                detailsGenerated: true,
                isGeneratingDetails: false
            };
            this.lastGeneratedNpcs.set(updatedNpcs);

        } catch (e: any) {
            console.error('Error generating NPC details:', e);
            const updatedNpcs = [...this.lastGeneratedNpcs()];
            updatedNpcs[index] = { ...updatedNpcs[index], isGeneratingDetails: false };
            this.lastGeneratedNpcs.set(updatedNpcs);
            this.npcSaveSuccessMessage.set(`Error: ${e.error?.error || e.message}`);
        }
    }

    async handleSaveNpc(index: number) {
        const npcs = [...this.lastGeneratedNpcs()];
        const npc = npcs[index];
        if (!npc) return;

        // Set saving state
        npcs[index] = { ...npc, isSaving: true };
        this.lastGeneratedNpcs.set(npcs);

        try {
            await this.saveIndividualNpc(npc);

            const updatedNpcs = [...this.lastGeneratedNpcs()];
            updatedNpcs[index] = { ...updatedNpcs[index], isSaving: false };
            this.lastGeneratedNpcs.set(updatedNpcs);
            this.npcSaveSuccessMessage.set(`Saved "${npc.name}" to Codex!`);

        } catch (e: any) {
            console.error('Error saving NPC:', e);
            const updatedNpcs = [...this.lastGeneratedNpcs()];
            updatedNpcs[index] = { ...updatedNpcs[index], isSaving: false };
            this.lastGeneratedNpcs.set(updatedNpcs);
            this.npcSaveSuccessMessage.set(`Error saving: ${e.error?.error || e.message}`);
        }
    }

    private async saveIndividualNpc(npc: GeneratedNpc) {
        const pathString = this.lastGeneratedGroupName();
        const basePath = pathString.replace(/\\/g, '/').split('/').filter(p => p.trim() !== '').map(p => p.trim().replace(/ /g, '_'));
        const entriesToSave: any[] = [];

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
                    entriesToSave.push(parentEntry);

                    // Simulate the creation in the local codex object to prevent duplicates
                    let tempNode = codex;
                    for (const p of currentPath) {
                        if (!tempNode[p]) tempNode[p] = {};
                        tempNode = tempNode[p];
                    }
                }
            }
        }

        // Link to database items
        // Link to database items
        const linkedRules = this.mapToIds(npc.feats || [], this.rulesCache(), 'feat-');

        // Handle Equipment (string array, object array, or comma-separated string)
        let equipmentList: string[] = [];
        if (Array.isArray(npc.equipment)) {
            equipmentList = npc.equipment.map(e => typeof e === 'string' ? e : e.name);
        } else if (typeof npc.equipment === 'string') {
            equipmentList = (npc.equipment as string).split(',').map(s => s.trim()).filter(s => s !== '');
        }
        const linkedEquipment = this.mapToIds(equipmentList, this.equipmentCache(), 'eq-');

        // Handle Magic Items
        let magicItemsList: string[] = [];
        if (Array.isArray(npc.magicItems)) {
            magicItemsList = npc.magicItems.map(m => typeof m === 'string' ? m : m.name);
        } else if (typeof npc.magicItems === 'string') {
            magicItemsList = (npc.magicItems as string).split(',').map(s => s.trim()).filter(s => s !== '');
        }
        const linkedMagicItems = this.mapToIds(magicItemsList, this.magicItemsCache(), 'mi-');

        // Handle Spells - Preserve Levels
        let linkedSpells: any = {}; // Default to object structure

        if (npc.spells) {
            // Helper to find ID and Level from cache
            const findSpellInfo = (name: string): { id: string, level: string } | null => {
                const searchName = name.trim().toLowerCase();
                for (const [id, spell] of this.spellsCache().entries()) {
                    if (spell.name.toLowerCase() === searchName) {
                        let lvl = '0';
                        if (spell.level && typeof spell.level === 'object') {
                            const levels = Object.values(spell.level);
                            if (levels.length > 0) lvl = String(levels[0]);
                        }
                        return { id, level: lvl };
                    }
                }
                return null;
            };

            if (typeof npc.spells === 'object' && !Array.isArray(npc.spells)) {
                Object.entries(npc.spells).forEach(([level, spells]) => {
                    if (Array.isArray(spells)) {
                        const ids = spells.map(name => {
                            const info = findSpellInfo(name);
                            return info ? info.id : '';
                        }).filter(id => id !== '');
                        if (ids.length > 0) linkedSpells[level] = ids;
                    }
                });
            } else if (Array.isArray(npc.spells)) {
                npc.spells.forEach((name: string) => {
                    const info = findSpellInfo(name);
                    if (info) {
                        if (!linkedSpells[info.level]) linkedSpells[info.level] = [];
                        if (!linkedSpells[info.level].includes(info.id)) linkedSpells[info.level].push(info.id);
                    }
                });
            } else if (typeof npc.spells === 'string') {
                const info = findSpellInfo(npc.spells);
                if (info) {
                    if (!linkedSpells[info.level]) linkedSpells[info.level] = [];
                    linkedSpells[info.level].push(info.id);
                }
            }
        }

        const sanitizedName = npc.name.replace(/ /g, '_');
        const fullPath = [...basePath, sanitizedName];

        // Create Codex entry
        const newEntry = {
            path_components: fullPath,
            name: npc.name,
            content: [
                { type: 'heading', text: npc.name },
                { type: 'paragraph', text: npc.description }
            ]
        };

        if (npc.backstory) {
            newEntry.content.push({ type: 'heading', text: 'Backstory' });
            newEntry.content.push({ type: 'paragraph', text: npc.backstory });
        }

        // Create linked entity
        const entity: any = {
            name: npc.name,
            baseStats: npc.baseStats ? calculateCompleteBaseStats(npc.baseStats) : {},
            rules: linkedRules,
            equipment: linkedEquipment,
            magicItems: linkedMagicItems,
            spells: linkedSpells,
            deity: npc.deity || '',
        };

        // Add all stats
        if (npc.type) entity.baseStats.type = npc.type;
        if (npc.race) entity.baseStats.race = npc.race;
        if (npc.class) entity.baseStats.Class = npc.class;
        if (npc.level) entity.baseStats.Level = npc.level;
        if (npc.gender) entity.baseStats.Gender = npc.gender;
        if (npc.alignment) entity.baseStats.Alignment = npc.alignment;
        if (npc.size) entity.baseStats.size = npc.size;
        if (npc.hp) entity.baseStats.HP = npc.hp;
        if (npc.hitDice) entity.baseStats.HitDice = npc.hitDice;

        if (npc.ac !== undefined) {
            entity.baseStats.armorClass = {
                total: npc.ac,
                touch: npc.acTouch ?? npc.ac,
                flatFooted: npc.acFlatFooted ?? npc.ac
            };
        }

        entity.baseStats.combat = entity.baseStats.combat || {};
        if (npc.bab !== undefined) entity.baseStats.combat.bab = npc.bab;
        if (npc.cmb !== undefined) entity.baseStats.combat.cmb = npc.cmb;
        if (npc.cmd !== undefined) entity.baseStats.combat.cmd = npc.cmd;

        if (npc.fortSave !== undefined || npc.refSave !== undefined || npc.willSave !== undefined) {
            entity.baseStats.saves = {
                fortitude: npc.fortSave ?? 0,
                reflex: npc.refSave ?? 0,
                will: npc.willSave ?? 0
            };
        }

        if (npc.dr && npc.dr !== '-') entity.baseStats.DR = npc.dr;
        if (npc.sr) entity.baseStats.SR = npc.sr;
        if (npc.resist && npc.resist !== '-') entity.baseStats.Resist = npc.resist;
        if (npc.immune && npc.immune !== '-') entity.baseStats.Immune = npc.immune;

        if (npc.skills && Object.keys(npc.skills).length > 0) {
            entity.baseStats.skills = npc.skills;
        }

        // Class skills for +3 trained bonus
        if (npc.classSkills?.length) {
            entity.baseStats.classSkills = npc.classSkills;
        }

        if (npc.spellSlots) entity.spell_slots = npc.spellSlots;
        if (npc.specialAbilities?.length) entity.special_abilities = npc.specialAbilities;
        if (npc.specialAttacks?.length) entity.special_attacks = npc.specialAttacks;
        if (npc.attacks?.length) entity.attacks = npc.attacks;
        if (npc.vulnerabilities?.length) entity.vulnerabilities = npc.vulnerabilities;

        // Save entity first
        const entityResult = await lastValueFrom(this.http.post<any>('/codex/api/admin/collections/entities_pf1e', entity));
        const newEntityId = entityResult._id || entityResult.insertedId;

        // Save codex entry with entity link
        (newEntry as any).entity_id = newEntityId;
        entriesToSave.push(newEntry);
        await lastValueFrom(this.http.post('/codex/api/codex/create-entries', entriesToSave));
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
            // Build broader world context
            let smartContext = '';
            if (this.npcGenContextSource.trim()) {
                smartContext = this.buildSmartContext(this.npcGenContextSource.trim(), this.codex());
            }

            const worldContext: any = {
                userContext: this.npcGenContext + (smartContext ? `\n\n--- EXTRACTED KNOWLEDGE ---\n${smartContext}` : ''),
                targetPath: this.npcGenGroupName
            };

            const npcs = await lastValueFrom(this.http.post<GeneratedNpc[]>('/codex/api/dm-toolkit-ai/generate-npcs', {
                query: this.npcGenQuery,
                options: worldContext
            }));

            this.lastGeneratedNpcs.set(npcs);
            this.lastGeneratedGroupName.set(this.npcGenGroupName);
            this.isGeneratingNpcs.set(false);
            this.npcSaveSuccessMessage.set(`Generated ${npcs.length} NPCs.`);

        } catch (error) {
            console.error('Error generating NPCs:', error);
            this.isGeneratingNpcs.set(false);
            this.npcSaveSuccessMessage.set('Error generating NPCs. See console.');
        }
    }

    // --- Smart Context Builder ---
    private buildSmartContext(sourcePath: string, codex: any): string {
        const rootNode = this.findNodeByPath(sourcePath, codex);
        if (!rootNode) return `Could not find context source: ${sourcePath}`;

        const visited = new Set<string>();
        const contextParts: string[] = [];

        this.traverseContext(rootNode, sourcePath, visited, contextParts, 0);

        return contextParts.join('\n\n');
    }

    private findNodeByPath(path: string, codex: any): any {
        // Handle "Category/Item" or "Category" paths
        const parts = path.split('/').filter(p => p);
        let node = codex;
        for (const part of parts) {
            if (node && node[part]) {
                node = node[part];
            } else {
                return null;
            }
        }
        return node;
    }

    private traverseContext(node: any, path: string, visited: Set<string>, output: string[], depth: number) {
        if (!node || visited.has(path) || depth > 2) return; // Limit depth to 2 (Page -> Linked Page -> Nothing else)
        visited.add(path);

        // 1. Add this node's description/content
        let summary = node.description || node.summary || node.content || '';
        if (typeof summary !== 'string') summary = String(summary);

        if (summary) {
            output.push(`[Source: ${path}]\n${summary.substring(0, 1000)}...`); // Limit length per item
        }

        // 2. Find WikiLinks [[Link]]
        // Regex to find [[Link]] inside the content
        const linkRegex = /\[\[(.*?)\]\]/g;
        let match;
        while ((match = linkRegex.exec(summary)) !== null) {
            const linkName = match[1];
            // Try to find this linked item in the codex (Basic search)
            const linkedPath = this.findPathForName(linkName, this.codex());
            if (linkedPath) {
                const linkedNode = this.findNodeByPath(linkedPath, this.codex());
                if (linkedNode && !visited.has(linkedPath)) {
                    this.traverseContext(linkedNode, linkedPath, visited, output, depth + 1);
                }
            }
        }

        // 3. Go down the branch (Children) - Only if it's the Root or depth 0
        if (depth === 0) {
            const children = Object.keys(node).filter(k => typeof node[k] === 'object' && k !== 'baseStats' && k !== 'rules');
            for (const childKey of children) {
                this.traverseContext(node[childKey], `${path}/${childKey}`, visited, output, depth + 1);
            }
        }
    }

    private findPathForName(name: string, node: any, currentPath: string = ''): string | null {
        // DFS search for a node with matching key (name)
        if (!node) return null;
        for (const key of Object.keys(node)) {
            if (key.toLowerCase() === name.toLowerCase()) return currentPath ? `${currentPath}/${key}` : key;
            if (typeof node[key] === 'object') {
                const found = this.findPathForName(name, node[key], currentPath ? `${currentPath}/${key}` : key);
                if (found) return found;
            }
        }
        return null;
    }

    // --- Type-ahead Logic ---

    // Call this when codex input changes or on init
    updateCodexPaths() {
        if (this.codex()) {
            this.codexPaths = this.flattenCodexPaths(this.codex());
        }
    }

    private flattenCodexPaths(node: any, currentPath = ''): string[] {
        let paths: string[] = [];
        if (!node) return paths;

        for (const key of Object.keys(node)) {
            // Skip system keys
            if (key === 'baseStats' || key === 'rules' || key === 'spells' || key === 'equipment') continue;

            // Null check - skip if node[key] is null or undefined
            if (!node[key]) continue;

            const newPath = currentPath ? `${currentPath}/${key}` : key;

            // If it has content/description/summary, it's a valid page
            if (node[key].description || node[key].content || node[key].summary) {
                paths.push(newPath);
            }

            // Recurse regardless (categories might not have content but contain pages)
            if (typeof node[key] === 'object') {
                paths = [...paths, ...this.flattenCodexPaths(node[key], newPath)];
            }
        }
        return paths;
    }

    searchContextPaths(event: Event) {
        const query = (event.target as HTMLInputElement).value.toLowerCase();
        this.npcGenContextSource = (event.target as HTMLInputElement).value;

        if (!query) {
            this.filteredPaths = [];
            this.showContextDropdown = false;
            return;
        }

        if (this.codexPaths.length === 0) this.updateCodexPaths();

        this.filteredPaths = this.codexPaths
            .filter(path => path.toLowerCase().includes(query))
            .slice(0, 10); // Limit results

        this.showContextDropdown = this.filteredPaths.length > 0;
    }

    selectContextPath(path: string) {
        this.npcGenContextSource = path;
        this.showContextDropdown = false;
    }

    closeDropdown() {
        // Small delay to allow click event to register
        setTimeout(() => this.showContextDropdown = false, 200);
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
                if (npc.race) entity.baseStats.race = npc.race;
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

                if (npc.spellSlots) entity.spell_slots = npc.spellSlots;
                if (npc.spellSaveDc !== undefined) entity.baseStats.spellSaveDc = npc.spellSaveDc;

                // Defenses
                if (npc.dr && npc.dr !== '-') entity.baseStats.DR = npc.dr;
                if (npc.sr) entity.baseStats.SR = npc.sr;
                if (npc.resist && npc.resist !== '-') entity.baseStats.Resist = npc.resist;
                if (npc.immune && npc.immune !== '-') entity.baseStats.Immune = npc.immune;
                if (npc.skills) entity.baseStats.skills = npc.skills;
                if (npc.specialAbilities?.length) entity.special_abilities = npc.specialAbilities;
                if (npc.attacks?.length) entity.attacks = npc.attacks;
                if (npc.vulnerabilities?.length) entity.vulnerabilities = npc.vulnerabilities;

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

    public normalizeNpcDetails(details: any): any {
        const normalized = { ...details };

        // Recursive helper to extract values
        const extractValue = (val: any): any => {
            if (val === null || val === undefined) return val;
            if (Array.isArray(val)) return val.map(extractValue);
            if (typeof val === 'object') {
                // Known specific keys to prefer
                if (val.total !== undefined) return val.total;
                if (val.value !== undefined) return val.value;
                if (val.text !== undefined) return val.text;
                // If it's just a wrapper (e.g. { Str: { value: 18 } })
                const keys = Object.keys(val);
                if (keys.length === 1 && (keys[0] === 'value' || keys[0] === 'total')) return val[keys[0]];

                // Otherwise return object as is (it might be a map like spells)
                return val;
            }
            return val;
        };

        // Normalize Base Stats (Ability Scores often come as objects)
        if (normalized.baseStats) {
            Object.keys(normalized.baseStats).forEach(key => {
                const val = normalized.baseStats[key];
                if (key === 'hp' || key === 'HP') {
                    // HP might be a string "45 (5d8...)" or object { value: 45, formula: "..." }
                    normalized.baseStats[key] = String(extractValue(val));
                } else if (typeof val === 'object') {
                    // Try to extract primitive for things like Str, Dex
                    const extracted = extractValue(val);
                    if (typeof extracted !== 'object') {
                        normalized.baseStats[key] = extracted;
                    }
                }
            });
        }

        // Normalize HP (root level if exists)
        if (normalized.hp) normalized.hp = String(extractValue(normalized.hp));

        // Normalize AC
        if (normalized.ac) {
            if (typeof normalized.ac === 'object') {
                const acObj = normalized.ac;
                // Extract main value
                normalized.ac = extractValue(acObj);

                // Preserve side components if they exist in the object
                if (acObj.touch !== undefined) normalized.acTouch = extractValue(acObj.touch);
                if (acObj.flatFooted !== undefined) normalized.acFlatFooted = extractValue(acObj.flatFooted);

                // Fallback: If extractValue returned an object (no total/value), try parsing or default
                if (typeof normalized.ac === 'object') {
                    normalized.ac = parseInt(String(Object.values(normalized.ac)[0])) || 10;
                }
            } else {
                normalized.ac = parseInt(String(normalized.ac)) || 10;
            }
        }

        // Normalize Special Abilities
        if (normalized.specialAbilities && Array.isArray(normalized.specialAbilities)) {
            normalized.specialAbilities = normalized.specialAbilities.map((ab: any) => {
                if (typeof ab === 'string') return ab;
                return ab.name || ab.value || JSON.stringify(ab);
            });
        }

        // Normalize BAB/CMB/CMD - Fix double '+'
        const cleanSign = (val: any) => {
            if (typeof val === 'string') {
                return val.replace(/\+\+/g, '+').replace(/^\++/, '+');
            }
            return val;
        };

        if (normalized.bab !== undefined) normalized.bab = typeof normalized.bab === 'string' ? parseInt(cleanSign(normalized.bab)) : normalized.bab;
        if (normalized.cmb !== undefined) normalized.cmb = typeof normalized.cmb === 'string' ? parseInt(cleanSign(normalized.cmb)) : normalized.cmb;

        return normalized;
    }
}