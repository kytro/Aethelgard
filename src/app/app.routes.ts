import { Routes } from '@angular/router';
import { CodexComponent } from './codex/codex.component';
import { DmToolkitComponent } from './dm-toolkit/dm-toolkit.component';
import { AdminComponent } from './admin/admin.component';

export const routes: Routes = [
  { path: '', redirectTo: 'codex', pathMatch: 'full' },
  { path: 'codex', component: CodexComponent },
  { path: 'dm-toolkit', component: DmToolkitComponent },
  { path: 'admin', component: AdminComponent },
  // Fallback route
  { path: '**', redirectTo: 'codex' }
];