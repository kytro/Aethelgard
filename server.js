// server.js
const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const dataIntegrityRoutes = require('./routes/data-integrity');
const settingsRoutes = require('./routes/settings');  
const codexRoutes = require('./routes/codex');
const dmToolkitRoutes = require('./routes/dm-toolkit');
const dmToolkitAiRoutes = require('./routes/dm-toolkit-ai');
const aiAssistantRoutes = require('./routes/ai-assistant');
const spellRoutes = require('./routes/spells');

const app = express();
const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017';
const DB_NAME = 'codex';

const GOOGLE_CLIENT_ID = '283129050747-a8f87leqdi94b5fc6bat9v6o1go6joc8.apps.googleusercontent.com';
const JWT_SECRET = process.env.JWT_SECRET || 'lxp2qKj7X9e4RzT8vM5nFb3YgH1wP6sA0cD8rS7tU2mQ4wE6yL9oI3aZ5bC1dF';

let db; // will hold mongo db handle

/*  ----------  middleware (BEFORE routes)  ----------  */
app.use(express.json({ limit: '50mb' }));

/*  ----------  async boot strap  ----------  */
MongoClient.connect(DATABASE_URL)
  .then(async (client) => {
    console.log('[Mongo] Connected');
    db = client.db(DB_NAME);

    /*  ----------  API routes  ----------  */
    const apiBase = '/codex/api';                       // root of every API call

    app.use(`${apiBase}/auth`, authRoutes(db, JWT_SECRET, GOOGLE_CLIENT_ID));
    app.use(`${apiBase}/admin`, adminRoutes(db));       // dashboard, collections, backup, restore
    app.use(`${apiBase}/admin`, settingsRoutes(db));    // /settings/api-keys  (must be AFTER /admin mount)
    app.use(`${apiBase}/data-integrity`, dataIntegrityRoutes(db));
    app.use(`${apiBase}/codex`, codexRoutes(db));
    app.use(`${apiBase}/dm-toolkit`, dmToolkitRoutes(db));
    app.use(`${apiBase}/dm-toolkit-ai`, dmToolkitAiRoutes(db));
    app.use(`${apiBase}/ai-assistant`, aiAssistantRoutes(db));
    app.use(`${apiBase}/spells`, spellRoutes(db));

    /*  ----------  SPA static files  ----------  */
    app.use('/codex', express.static(path.join(__dirname, 'public')));
    app.get(/^\/codex(\/(?!api).*)?$/, (req, res) => {
      res.sendFile(path.join(__dirname, 'public/index.html'));
    });

    /*  ----------  health probe  ----------  */
    app.get('/health', (_, res) => res.json({ status: 'ok', db: !!db }));

    /*  ----------  start listener  ----------  */
    app.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}`);
console.log(`[Routes] Mounted:\n        ${apiBase}/auth/*,\n        ${apiBase}/admin/*,\n        ${apiBase}/data-integrity/*,\n        ${apiBase}/codex/*,\n        ${apiBase}/dm-toolkit/*,\n        ${apiBase}/dm-toolkit-ai/*,\n        ${apiBase}/ai-assistant/*,\n        ${apiBase}/spells/*`);
    });
  })
  .catch((err) => {
    console.error('[Mongo] Failed to connect', err);
    process.exit(1);
  });