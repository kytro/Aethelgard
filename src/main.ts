import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app';
import { appConfig } from './app/app.config';

// The bootstrapApplication function should ONLY take the AppComponent and the appConfig.
// The duplicate providers array has been removed.
bootstrapApplication(AppComponent, appConfig)
  .catch(err => console.error(err));