import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

// No providers here. Zone.js must stay during tests.
getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting()
);
