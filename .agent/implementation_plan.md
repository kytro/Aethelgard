# Implementation Plan - Unit Testing

## Goal
Implement comprehensive unit tests for the Codex Admin application to ensure reliability and prevent regressions.

## Components Tested
1. **Combat Manager**: Complex logic for turn management, HP calculation, and state updates.
2. **Codex**: Navigation, data loading, and editing of codex entries.
3. **NPC Generator**: AI generation integration and saving to Codex.
4. **Session Logger**: CRUD operations for session notes.
5. **Codex Assistant**: AI chat interface.
6. **Dashboard**: Statistics loading.
7. **Data Browser**: Collection viewing and document editing.
8. **Settings**: Configuration management (API keys, models).
9. **Admin**: Navigation and view switching.
10. **Backup/Restore**: File handling for backups.
11. **Data Integrity**: Database maintenance jobs.
12. **App**: Authentication and Google Sign-In.

## Testing Strategy
- **Mocking**: Extensive use of `HttpTestingController` to mock API calls.
- **Component Mocks**: Used mock child components in `AdminComponent` to isolate unit tests.
- **Fake Timers**: Used for testing time-dependent logic (e.g., auto-save, authentication timeouts).
- **Zoneless Support**: Configured tests to work with `provideZonelessChangeDetection()`.

## Status
All 13 test suites are passing.
