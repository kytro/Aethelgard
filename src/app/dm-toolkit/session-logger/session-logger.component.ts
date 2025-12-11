import { Component, signal, inject, HostListener, WritableSignal, effect, input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { formatTime } from '../dm-toolkit.utils';
import { ModalService } from '../../shared/services/modal.service';

interface Session { _id: string; title: string; notes: string; createdAt: any; }

@Component({
  selector: 'app-session-logger',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div id="session-logger">
      <h2 class="text-3xl font-bold text-white mb-6 text-yellow-500">Session Logger</h2>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-1 bg-gray-800/50 p-4 rounded-lg border border-gray-700">
          <h3 class="font-semibold text-xl mb-3">Sessions</h3>
          <button (click)="handleAddSession()" class="w-full bg-green-600 hover:bg-green-500 text-white font-bold p-2 rounded-md transition-colors mb-4">New Session</button>
          <div class="space-y-2">
            @for (s of sessions(); track s._id) {
              <div>
                <div
                  class="flex justify-between items-center p-2 rounded-md"
                  [ngClass]="{'bg-yellow-600 text-black': currentSession()?._id === s._id, 'bg-gray-700/50': currentSession()?._id !== s._id}">
                  <button (click)="setCurrentSession(s)" class="flex-grow text-left text-sm">
                    {{ s.title || formatTime(s.createdAt) }}
                  </button>
                  <button (click)="handleDeleteSession(s._id)" class="text-red-400 hover:text-red-300 font-bold">X</button>
                </div>
              </div>
            }
          </div>
        </div>
        <div class="lg:col-span-2">
          @if (currentSession(); as session) {
            <div>
              <h3 class="font-semibold text-2xl mb-4 text-yellow-400 flex items-center gap-3">
                <span>Session Notes for {{ session.title || formatTime(session.createdAt) }}</span>
                @if(saveStatus() !== 'Idle') {
                  <span class="text-sm px-2 py-0.5 rounded-full"
                    [ngClass]="{
                      'bg-blue-800 text-blue-300': saveStatus() === 'Unsaved',
                      'bg-yellow-800 text-yellow-300 animate-pulse': saveStatus() === 'Saving',
                      'bg-green-800 text-green-300': saveStatus() === 'Saved',
                      'bg-red-800 text-red-300': saveStatus() === 'Error'
                    }">
                    {{ saveStatus() }}
                  </span>
                }
              </h3>
              <textarea
                [ngModel]="sessionNotes()"
                (ngModelChange)="onNotesChange($event)"
                placeholder="Start typing your session notes here..."
                class="w-full h-[60vh] bg-gray-900 border border-gray-600 rounded-md p-4 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
              ></textarea>
            </div>
          } @else {
            <div class="flex items-center justify-center h-64 text-gray-500">Select or create a session.</div>
          }
        </div>
      </div>
    </div>
  `
})
export class SessionLoggerComponent {
  http = inject(HttpClient);
  modalService = inject(ModalService);

  @Output() sessionAdded = new EventEmitter<Session>();
  @Output() sessionUpdated = new EventEmitter<Session>();
  @Output() sessionDeleted = new EventEmitter<string>();

  sessions = input<Session[]>([]);
  currentSessionId = input<string | null>(null);
  currentSession: WritableSignal<Session | null> = signal(null);
  sessionNotes = signal('');
  saveStatus = signal<'Idle' | 'Unsaved' | 'Saving' | 'Saved' | 'Error'>('Idle');
  private autoSaveTimer: any;

  formatTime = formatTime;

  constructor() {
    // Sync current selection if list updates or input ID changes
    effect(() => {
      const list = this.sessions();
      const inputId = this.currentSessionId();

      // If input ID matches a session, select it
      if (inputId && list.length > 0) {
        const found = list.find(s => s._id === inputId);
        if (found && this.currentSession()?._id !== found._id) {
          this.setCurrentSession(found);
        }
      }

      // Cleanup if removed
      const current = this.currentSession();
      if (current && !list.some(s => s._id === current._id)) {
        this.currentSession.set(null);
      }
    }, { allowSignalWrites: true });
  }

  handleAddSession() {
    this.saveStatus.set('Saving');
    this.http.post<any>('/codex/api/dm-toolkit/sessions', {}).subscribe({
      next: (newSession) => {
        const session: Session = { ...newSession, _id: newSession._id, title: '', notes: '', createdAt: new Date() };
        this.sessionAdded.emit(session);
        this.setCurrentSession(session);
      },
      error: (e) => console.error(e)
    });
  }

  async handleDeleteSession(id: string) {
    if (!await this.modalService.confirm('Delete Session', 'Are you sure you want to delete this session?')) return;
    this.http.delete(`/codex/api/dm-toolkit/sessions/${id}`).subscribe({
      next: () => {
        this.sessionDeleted.emit(id);
        if (this.currentSession()?._id === id) this.currentSession.set(null);
      },
      error: (e) => console.error(e)
    });
  }

  setCurrentSession(session: Session) {
    this.currentSession.set(session);
    this.sessionNotes.set(session.notes || '');
    this.saveStatus.set('Idle');
  }

  onNotesChange(notes: string) {
    this.sessionNotes.set(notes);
    this.saveStatus.set('Unsaved');
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.saveCurrentSession();
    }, 5000);
  }

  saveCurrentSession() {
    const session = this.currentSession();
    const notes = this.sessionNotes();
    if (!session || this.saveStatus() !== 'Unsaved' || notes === (session.notes || '')) return;

    this.saveStatus.set('Saving');
    this.http.patch<Session>(`/codex/api/dm-toolkit/sessions/${session._id}`, { notes }).subscribe({
      next: (updatedSession) => {
        this.saveStatus.set('Saved');
        this.currentSession.set(updatedSession);
        this.sessionUpdated.emit(updatedSession);
      },
      error: (e) => {
        console.error("Failed to save session:", e);
        this.saveStatus.set('Error');
      }
    });
  }

  @HostListener('window:beforeunload')
  unloadNotification() {
    if (this.saveStatus() === 'Unsaved') this.saveCurrentSession();
  }
}