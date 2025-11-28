# Copilot Instructions for CodexAdmin

## Project Overview
- **CodexAdmin** is a full-stack Angular + Express/MongoDB application for managing D&D codex data, DM tools, and AI-powered features.
- The frontend is in `src/` (Angular 20), backend API routes in `routes/`, and the main server in `server.js`.
- Data is stored in MongoDB (`codex` database by default).

## Architecture & Data Flow
- **Frontend**: Angular SPA served from `public/` via Express. Entry: `src/main.ts`, config: `angular.json`.
- **Backend**: Express server (`server.js`) mounts API routes under `/codex/api/*`:
  - `/auth`, `/admin`, `/data-integrity`, `/codex`, `/dm-toolkit`, `/dm-toolkit-ai`, `/ai-assistant`, `/spells`
  - Each route module receives a MongoDB handle and (where needed) secrets/configs.
- **Static Files**: Served from `/codex` (maps to `public/`). SPA fallback to `public/index.html`.
- **Health Check**: `/health` endpoint returns `{ status: 'ok', db: true/false }`.

## Developer Workflows
- **Start Frontend**: `npm start` or `ng serve` (Angular dev server, port 4200)
- **Start Backend**: `node server.js` (Express API, port 8080 by default)
- **Build Frontend**: `npm run build` (output to `dist/`)
- **Unit Tests**: `npm test` or `ng test` (Karma/Jasmine)
- **E2E Tests**: `ng e2e` (no default framework, must be configured)
- **Lint/Format**: Prettier config in `package.json` (HTML uses Angular parser)

## Conventions & Patterns
- **API Route Pattern**: Each route in `routes/` exports a function accepting `(db, ...config)` and returns an Express router.
- **Angular Components**: Organized by feature in `src/app/`, with dedicated CSS/HTML/TS files per component.
- **Environment Variables**: `DATABASE_URL`, `JWT_SECRET`, etc. (see `server.js`). Defaults provided for local dev.
- **SPA Routing**: All non-API `/codex/*` requests serve `public/index.html`.
- **Settings**: Some admin/settings routes are mounted after `/admin` for correct API-key handling.

## Integration Points
- **MongoDB**: Used for all persistent data. Connection established at server startup.
- **Google Auth**: Client ID hardcoded in `server.js` for OAuth flows.
- **AI Features**: `/ai-assistant` and `/dm-toolkit-ai` routes integrate with external AI services (see respective route files).
- **File Uploads**: Uses `multer` for handling uploads (see dependencies).

## Key Files & Directories
- `server.js`: Main Express server, API route mounting, MongoDB connection
- `routes/`: All backend API logic, organized by feature
- `src/app/`: Angular components, feature modules
- `public/`: Static assets and SPA entry
- `package.json`: Scripts, dependencies, Prettier config
- `angular.json`: Angular build and serve config

## Example Patterns
- **Route Export**: `module.exports = (db, config) => { const router = express.Router(); ... return router; }`
- **Component Structure**: `feature/feature.component.ts`, `.html`, `.css` in `src/app/feature/`

---
_If any section is unclear or missing, please provide feedback for further refinement._
