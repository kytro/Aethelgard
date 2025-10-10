import { ChangeDetectionStrategy, Component, signal, inject, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { DataBrowserComponent } from './data-browser/data-browser.component';
import { BackupRestoreComponent } from './backup-restore/backup-restore.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DataIntegrityComponent } from './data-integrity/data-integrity.component';
import { AiAssistantComponent } from './ai-assistant/ai-assistant.component';
import { SettingsComponent } from './settings/settings.component';
import { CodexComponent } from './codex/codex.component';
import { DmToolkitComponent } from './dm-toolkit/dm-toolkit.component';

// Declare the 'google' variable provided by the GSI script
declare const google: any;

interface User {
  name: string;
  email: string;
  picture: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, DataBrowserComponent, BackupRestoreComponent, DashboardComponent, DataIntegrityComponent, AiAssistantComponent, SettingsComponent, CodexComponent, DmToolkitComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements AfterViewInit {
  http = inject(HttpClient);
  ngZone = inject(NgZone);

  // --- State Signals ---
  isAuthenticated = signal<boolean>(false);
  user = signal<User | null>(null);
  authMessage = signal<string>('');
  isAuthError = signal<boolean>(false);

  // --- Top-level navigation state ---
  activeAppSection = signal<'admin' | 'codex' | 'dm-toolkit'>('admin');
  
  // State for the Admin Panel's sidebar
  activeAdminView = signal<'dashboard' | 'data' | 'backup-restore' | 'data-integrity' | 'ai-assistant' | 'settings'>('dashboard');

  constructor() {
    // Check for an existing session on startup
    const token = localStorage.getItem('app_token');
    const storedUser = localStorage.getItem('app_user');
    if (token && storedUser) {
      this.isAuthenticated.set(true);
      this.user.set(JSON.parse(storedUser));
    }
  }

  ngAfterViewInit(): void {
    if (!this.isAuthenticated()) {
      this.waitForGoogleLibrary();
    }
  }

  private waitForGoogleLibrary(): void {
    const maxRetries = 10;
    let retries = 0;
    const interval = setInterval(() => {
      if (typeof google !== 'undefined') {
        clearInterval(interval);
        this.initializeGoogleSignIn();
      } else {
        retries++;
        if (retries >= maxRetries) {
          clearInterval(interval);
          this.ngZone.run(() => {
              this.setAuthMessage('Google Sign-In failed to load. Check your connection or ad blocker.', true);
          });
        }
      }
    }, 500);
  }

  initializeGoogleSignIn(): void {
    if (typeof google === 'undefined') {
      this.setAuthMessage('Google Sign-In library not ready.', true);
      return;
    }
    google.accounts.id.initialize({
      client_id: '283129050747-a8f87leqdi94b5fc6bat9v6o1go6joc8.apps.googleusercontent.com',
      callback: this.handleGoogleSignIn.bind(this),
    });
    google.accounts.id.renderButton(
      document.getElementById('google-btn')!,
      { theme: 'outline', size: 'large', width: '280' } 
    );
  }

  async handleGoogleSignIn(response: any) {
    if (!response.credential) {
      this.setAuthMessage('Failed to get credential from Google.', true);
      return;
    }
    this.setAuthMessage('Verifying with server...');
    try {
      const res = await lastValueFrom(this.http.post<any>('api/auth/google/callback', { credential: response.credential }));
      if (res.token && res.user) {
        localStorage.setItem('app_token', res.token);
        localStorage.setItem('app_user', JSON.stringify(res.user));
        this.ngZone.run(() => {
          this.isAuthenticated.set(true);
          this.user.set(res.user);
          this.setAuthMessage('');
        });
      }
    } catch (err) {
      this.ngZone.run(() => this.setAuthMessage('Authentication failed on the server.', true));
      console.error(err);
    }
  }

  handleLogout(): void {
    if (typeof google !== 'undefined') {
        google.accounts.id.disableAutoSelect();
    }
    localStorage.removeItem('app_token');
    localStorage.removeItem('app_user');
    this.isAuthenticated.set(false);
    this.user.set(null);
    this.waitForGoogleLibrary();
  }
  
  private setAuthMessage(message: string, isError: boolean = false) {
    this.authMessage.set(message);
    this.isAuthError.set(isError);
  }
}