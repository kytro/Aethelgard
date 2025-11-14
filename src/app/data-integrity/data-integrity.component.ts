import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';

interface LogEntry {
  message: string;
  isError: boolean;
  time: string;
}

@Component({
  selector: 'app-data-integrity',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './data-integrity.component.html',
  styleUrls: ['./data-integrity.component.css'],
  styles: [`
    :host {
      display: block;
      height: 100%;
    }
  `]
})
export class DataIntegrityComponent {
  private http = inject(HttpClient);

  /* ----------  state  ----------  */
  isLoading = signal<boolean>(false);
  logs = signal<LogEntry[]>([]);
  reconciliationIterations = signal<number>(5);
  reconciliationBatchSize = signal<number>(20);
  dryRun = signal<boolean>(true);
  forceMigration = signal<boolean>(false);
  orphanAction = signal<'delete' | 'create'>('delete');

  /* ----------  lifecycle  ----------  */
  ngOnInit(): void {
    this.getDataIntegrityStatus();
  }

  /* ----------  public API  ----------  */
  async migrateCodex(): Promise<void> {
    const confirmed = window.confirm(
      'Are you sure you want to migrate the codex data? This is a major, one-way operation. The old codex collection will be backed up.'
    );
    if (!confirmed) {
      this.log('Codex migration cancelled by user.');
      return;
    }

    await this.triggerBackendJob('data-integrity', 'migrate-codex', { force: this.forceMigration() });
  }

  async getDataIntegrityStatus(): Promise<void> {
    this.isLoading.set(true);
    this.log('Getting data integrity status...');

    const url = '/codex/api/data-integrity/status';

    try {
      const res = await lastValueFrom(this.http.get<any>(url));
      this.log(`Unlinked Statblocks: ${res.unlinkedStatblocks}`, false);
      this.log(`Orphaned Entities: ${res.orphanedEntities}`, false);
      this.log(`Broken Rule Links: ${res.brokenRuleLinks}`, false);
      this.log(`Broken Equipment Links: ${res.brokenEquipmentLinks}`, false);
    } catch (err: any) {
      this.log(`Error getting status: ${err.error?.error || err.message}`, true);
    } finally {
      this.isLoading.set(false);
    }
  }

  async normalizeStatblocks(): Promise<void> {
    await this.triggerBackendJob('data-integrity', 'normalize-statblocks');
  }

  /* ----------  public API  ----------  */
  async triggerBackendJob(routePrefix: string, jobName: string, params: any = {}, method: 'POST' | 'GET' = 'POST'): Promise<void> {
    this.isLoading.set(true);
    this.log(`Starting job: ${jobName}...`);

    const url = `/codex/api/${routePrefix}/${jobName}`;

    try {
      let response$;
      if (method === 'GET') {
        response$ = this.http.get<any>(url, { params });
      } else {
        response$ = this.http.post<any>(url, params);
      }
      const res = await lastValueFrom(response$);
      this.log(res.message || `Job '${jobName}' completed successfully.`, false);
      if (method === 'GET') {
        this.log(JSON.stringify(res, null, 2));
      }
    } catch (err: any) {
      this.log(`Error running job '${jobName}': ${err.error?.error || err.message}`, true);
    } finally {
      this.isLoading.set(false);
    }
  }

  log(message: string, isError: boolean = false): void {
    const time = new Date().toLocaleTimeString();
    this.logs.update(current => [{ message, isError, time }, ...current]);
  }

  clearLogs(): void {
    this.logs.set([]);
  }
}