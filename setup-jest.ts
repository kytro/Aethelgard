// Minimal Jest setup for zoneless Angular
// DO NOT import jest-preset-angular/setup-jest as it requires zone.js

import { getTestBed } from '@angular/core/testing';
import {
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

// Initialize Angular testing environment without zone.js
getTestBed().initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
    {
        errorOnUnknownElements: true,
        errorOnUnknownProperties: true
    }
);

// Set up DOM environment
Object.defineProperty(globalThis, 'CSS', { value: null });
Object.defineProperty(globalThis, 'getComputedStyle', {
    value: () => ({
        display: 'none',
        appearance: ['-webkit-appearance']
    })
});

Object.defineProperty(document, 'doctype', {
    value: '<!DOCTYPE html>'
});

Object.defineProperty(document.body.style, 'transform', {
    value: () => {
        return {
            enumerable: true,
            configurable: true
        };
    }
});

// Mock Zone for zoneless apps
(global as any).Zone = undefined;
