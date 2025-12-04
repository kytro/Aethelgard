import { Component, inject, signal, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';

interface Suggestion {
  type: 'NPC' | 'Quest' | 'Location' | 'Event' | 'Hook';
  name: string;
  description: string;
  path: string;
  data: any;
  previewStats?: any;
}

@Component({
  selector: 'app-story-planner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './story-planner.component.html',
  styleUrls: ['./story-planner.component.css']
})
export class StoryPlannerComponent {
  http = inject(HttpClient);
  codex = input<any>();
  sessions = input<any[]>([]);

  storyContext = signal<string>('');
  suggestions = signal<Suggestion[]>([]);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  savingItem = signal<string | null>(null);
  generatingStatsForItem = signal<string | null>(null);

  onStoryContextChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target) {
      this.storyContext.set(target.value);
    }
  }

  async getSuggestions() {
    this.isLoading.set(true);
    this.error.set(null);
    this.suggestions.set([]);

    // 1. Gather Context
    const recentSessions = this.sessions().slice(0, 3).map(s => `Session ${s.number}: ${s.summary}`).join('\n');

    // 2. Gather Codex Structure
    const codexStructure = this.getCodexStructure(this.codex());

    // Simple Codex Context (could be improved with vector search later)
    // For now, just sending a high-level summary if available or relying on user input
    const codexContext = '';

    try {
      const response = await lastValueFrom(this.http.post<any>('/codex/api/dm-toolkit/story-planner/suggest', {
        context: this.storyContext(),
        sessionContext: recentSessions,
        codexContext: codexContext,
        codexStructure: codexStructure
      }));
      this.suggestions.set(response.suggestions);
    } catch (err: any) {
      this.error.set(err.error?.error || 'Failed to get suggestions.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async previewStats(suggestion: Suggestion) {
    if (suggestion.type !== 'NPC') return;

    this.generatingStatsForItem.set(suggestion.name);
    try {
      const prompt = `${suggestion.description} ${suggestion.data?.context || ''}`;
      const npcs = await lastValueFrom(this.http.post<any[]>('/codex/api/dm-toolkit-ai/generate-npcs', {
        query: prompt,
        options: {
          codex: { userContext: 'Generated from Story Planner' },
          existingEntityNames: []
        }
      }));

      if (npcs && npcs.length > 0) {
        suggestion.previewStats = npcs[0];
        this.suggestions.update(s => [...s]);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Failed to generate stats: ${e.message}`);
    } finally {
      this.generatingStatsForItem.set(null);
    }
  }

  async saveSuggestion(suggestion: Suggestion) {
    this.savingItem.set(suggestion.name);
    try {
      if (suggestion.type === 'NPC') {
        let npcStats = suggestion.previewStats;

        if (!npcStats) {
          const prompt = `${suggestion.description} ${suggestion.data?.context || ''}`;
          const npcs = await lastValueFrom(this.http.post<any[]>('/codex/api/dm-toolkit-ai/generate-npcs', {
            query: prompt,
            options: {
              codex: { userContext: 'Generated from Story Planner' },
              existingEntityNames: []
            }
          }));
          if (npcs && npcs.length > 0) {
            npcStats = npcs[0];
          } else {
            throw new Error('Failed to generate NPC stats.');
          }
        }

        npcStats.name = suggestion.name;

        await this.createCodexEntry({
          ...suggestion,
          data: { ...suggestion.data, ...npcStats }
        });

      } else {
        // Quests, Locations, etc.
        await this.createCodexEntry(suggestion);
      }

      alert(`Saved ${suggestion.name} to Codex!`);

    } catch (e: any) {
      console.error(e);
      alert(`Failed to save: ${e.message}`);
    } finally {
      this.savingItem.set(null);
    }
  }

  private getCodexStructure(node: any, path: string = ''): string[] {
    let paths: string[] = [];
    if (!node || typeof node !== 'object') return [];

    for (const key in node) {
      if (key === 'content' || key === 'path_components' || key === 'isCompleted') continue;

      const currentPath = path ? `${path}/${key}` : key;
      paths.push(currentPath);

      // Recurse
      paths = paths.concat(this.getCodexStructure(node[key], currentPath));
    }
    return paths;
  }

  private async createCodexEntry(suggestion: Suggestion) {
    const path = suggestion.path || 'Unsorted';
    const filename = suggestion.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fullPath = `${path}/${filename}`;

    const content = {
      name: suggestion.name,
      type: suggestion.type,
      description: suggestion.description,
      ...suggestion.data
    };

    // Use the codex API to create/update
    // Note: This assumes an endpoint exists to create arbitrary codex entries or we use the file API
    // We will use the standard file creation endpoint if available, or just POST to a generic codex endpoint

    // Using a hypothetical endpoint based on standard patterns in this app
    await lastValueFrom(this.http.post('/codex/api/codex/entry', {
      path: fullPath,
      content: content
    }));
  }
}