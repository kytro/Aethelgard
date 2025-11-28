import { ApplicationConfig, LOCALE_ID, provideZonelessChangeDetection, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeEnAu from '@angular/common/locales/en-AU';

import { routes } from './app.routes';
import { authInterceptor } from './auth.interceptor';

registerLocaleData(localeEnAu);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(), // <-- This is the correct line for zoneless
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: LOCALE_ID, useValue: 'en-AU' }
  ]
};