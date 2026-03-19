// server.js
try { require('dotenv').config(); } catch (e) { console.warn('[Info] .env file not loaded or dotenv not installed.'); }
process.env.TZ = process.env.TZ || 'Australia/Brisbane';
const express = require('express');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');

// Route imports
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const dataIntegrityRoutes = require('./routes/data-integrity');
const settingsRoutes = require('./routes/settings');
const codexRoutes = require('./routes/codex');
const combatRoutes = require('./routes/combat');
const sessionRoutes = require('./routes/sessions');
const dmToolkitAiRoutes = require('./routes/dm-toolkit-ai');
const aiAssistantRoutes = require('./routes/ai-assistant');
const spellRoutes = require('./routes/spells');
const storyPlannerRoutes = require('./routes/story-planner');
const mediaRoutes = require('./routes/media');
const oglImportRoutes = require('./routes/ogl-import');
const collectionsRoutes = require('./routes/collections');
const googleDocsRoutes = require('./routes/google_docs'); // [NEW]
const codexApiV1Routes = require('./routes/codex-api'); // [NEW] Comprehensive validated API
const entitiesApiRoutes = require('./routes/entities-api'); // [NEW] Entities API
const spellsApiRoutes = require('./routes/spells-api'); // [NEW] Spells API
const rulesApiRoutes = require('./routes/rules-api'); // [NEW] Rules API
const equipmentApiRoutes = require('./routes/equipment-api'); // [NEW] Equipment API
const generationApiRoutes = require('./routes/generation-api'); // [NEW] Generation API
const apiKeysRoutes = require('./routes/api-keys'); // [NEW] API Keys API

const app = express();
const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'codex';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_only_for_local_testing';

if (!process.env.JWT_SECRET) {
  console.warn('[Warning] JWT_SECRET is not set in environment variables! Using development fallback.');
}

let db; // MongoDB handle

/* ---------- Middleware ---------- */
app.use(express.json({ limit: '50mb' }));

// Content Security Policy to allow Google Auth
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com; " +
    "style-src 'self' 'unsafe-inline' https://accounts.google.com; " +
    "frame-src 'self' https://accounts.google.com; " +
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com; " +
    "img-src 'self' data: https://lh3.googleusercontent.com;"
  );
  // Support for Google SSO popups
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

/* ---------- Bootstrap ---------- */
MongoClient.connect(DATABASE_URL)
  .then(async (client) => {
    console.log('[Mongo] Connected');
    db = client.db(DB_NAME);

    /* ---------- API Routes ---------- */
    const apiBase = '/codex/api';

    app.use(`${apiBase}/auth`, authRoutes(db, JWT_SECRET, GOOGLE_CLIENT_ID));
    app.use(`${apiBase}/admin`, adminRoutes(db));
    app.use(`${apiBase}/admin`, settingsRoutes(db));
    app.use(`${apiBase}/admin`, collectionsRoutes(db));
    app.use(`${apiBase}/data-integrity`, dataIntegrityRoutes(db));
    // app.use(`${apiBase}/codex`, codexRoutes(db)); // LEGACY REMOVED
    app.use(`${apiBase}/dm-toolkit`, combatRoutes(db));
    app.use(`${apiBase}/dm-toolkit`, sessionRoutes(db));
    // app.use(`${apiBase}/dm-toolkit-ai`, dmToolkitAiRoutes(db)); // LEGACY REMOVED
    app.use(`${apiBase}/ai-assistant`, aiAssistantRoutes(db));
    app.use(`${apiBase}/spells`, spellRoutes(db));
    // app.use(`${apiBase}/dm-toolkit/story-planner`, storyPlannerRoutes(db)); // LEGACY REMOVED
    app.use(`${apiBase}/media`, mediaRoutes(db));
    app.use(`${apiBase}/ogl-import`, oglImportRoutes(db));
    const verifyToken = require('./utils/auth-middleware')(db, JWT_SECRET);
    app.use(`${apiBase}/admin/api-keys`, apiKeysRoutes(db, verifyToken)); // [NEW] API Keys Management
    app.use(`${apiBase}/google-docs`, googleDocsRoutes(db)); // [NEW]
    app.use(`${apiBase}/v1`, codexApiV1Routes(db, verifyToken)); // [NEW] Comprehensive validated API
    app.use(`${apiBase}/v1/entities`, entitiesApiRoutes(db, verifyToken)); // [NEW] Entities API
    app.use(`${apiBase}/v1/spells`, spellsApiRoutes(db, verifyToken)); // [NEW] Spells API
    app.use(`${apiBase}/v1/rules`, rulesApiRoutes(db, verifyToken)); // [NEW] Rules API
    app.use(`${apiBase}/v1/equipment`, equipmentApiRoutes(db, verifyToken)); // [NEW] Equipment API
    app.use(`${apiBase}/v1/generation`, generationApiRoutes(db, verifyToken)); // [NEW] Generation API

    // Swagger Documentation
    const swaggerUi = require('swagger-ui-express');
    const swaggerSpec = require('./swagger');
    app.use(`${apiBase}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    /* ---------- Static Files (SPA) ---------- */
    const distPath = path.join(__dirname, 'dist/codex-admin/browser');
    const publicPath = path.join(__dirname, 'public');
    const staticPath = fs.existsSync(distPath) ? distPath : publicPath;

    console.log(`[Server] Serving static files from: ${staticPath}`);

    app.use('/codex', express.static(staticPath));

    // ✅ Fixed regex
    app.get(/^\/codex(\/(?!api).*)?$/, (req, res) => {
      const indexFile = path.join(staticPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('SPA index.html not found. Environment: ' + (fs.existsSync(distPath) ? 'Local (dist)' : 'Docker (public)'));
      }
    });

    /* ---------- Health Probe ---------- */
    // UPDATED: Now accessible via /codex/api/health
    app.get(`${apiBase}/health`, (_, res) => res.json({ status: 'ok', db: !!db }));

    /* ---------- Start Listener ---------- */
    app.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}`);
      console.log(`[Routes] Mounted:
        ${apiBase}/auth/*
        ${apiBase}/admin/*
        ${apiBase}/data-integrity/*
        ${apiBase}/dm-toolkit/*
        ${apiBase}/ai-assistant/*
        ${apiBase}/spells/*
        ${apiBase}/media/*
        ${apiBase}/ogl-import/*
        ${apiBase}/google-docs/*
        ${apiBase}/v1/* (Codex API v1)
        ${apiBase}/health`);
    });
  })
  .catch((err) => {
    console.error('[Mongo] Failed to connect', err);
    process.exit(1);
  });