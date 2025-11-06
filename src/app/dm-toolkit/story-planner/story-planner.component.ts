import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-story-planner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './story-planner.component.html',
  styleUrls: ['./story-planner.component.css']
})
export class StoryPlannerComponent {
  http = inject(HttpClient);
  storyContext = signal<string>('');
  suggestions = signal<string[]>([]);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  onStoryContextChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target) {
      this.storyContext.set(target.value);
    }
  }

  async getSuggestions() {
    if (!this.storyContext()) return;

    this.isLoading.set(true);
    this.error.set(null);
    this.suggestions.set([]);

    try {
      const response = await lastValueFrom(this.http.post<any>('/codex/api/dm-toolkit/story-planner/suggest', {
        context: this.storyContext()
      }));
      this.suggestions.set(response.suggestions);
    } catch (err: any) {
      this.error.set(err.error?.error || 'Failed to get suggestions.');
    } finally {
      this.isLoading.set(false);
    }
  }
}