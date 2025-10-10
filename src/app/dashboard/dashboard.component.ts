import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

interface DashboardStats {
  entityCount: number;
  ruleCount: number;
  itemCound: number;
  spellCount: number;
  deityCount: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  http = inject(HttpClient);

  stats = signal<DashboardStats | null>(null);
  error = signal<string | null>(null);
  isLoading = signal<boolean>(true);

  constructor() {
    this.loadStats();
  }

  async loadStats() {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const data = await lastValueFrom(this.http.get<DashboardStats>('api/admin/dashboard-stats'));
      this.stats.set(data);
    } catch (err: any) {
      this.error.set(err.error?.error || 'Failed to load dashboard statistics.');
    } finally {
      this.isLoading.set(false);
    }
  }
}