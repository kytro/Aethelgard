const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();
const { generateContent } = require('../services/geminiService');

module.exports = function (db) {

    // List available models
    router.get('/models', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        try {
            const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
            const activeKey = apiKeysDoc?.keys?.find(k => k.id === apiKeysDoc.active_key_id);

            if (!activeKey?.key) return res.status(500).json({ error: 'Gemini API key not found.' });

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey.key}`);
            const data = await response.json();

            const filteredModels = (data.models || [])
                .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name);

            const generalSettings = await db.collection('settings').findOne({ _id: 'general' });

            res.json({
                models: filteredModels,
                defaultModel: generalSettings?.default_ai_model || 'models/gemini-1.5-flash'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Generate DB Update Plan
    router.post('/generate-update', async (req, res) => {
        const { query, model } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required.' });
        if (!db) return res.status(503).json({ error: 'Database not ready' });

        try {
            // Fetch context
            const recentEntries = await db.collection('codex_entries').find().sort({ _id: -1 }).limit(5).project({ path_components: 1, _id: 0 }).toArray();
            let existingStructurePrompt = '';
            if (recentEntries.length > 0) {
                const examplesString = JSON.stringify(recentEntries.map(e => e.path_components), null, 2);
                existingStructurePrompt = `\r\n                --- EXISTING STRUCTURE EXAMPLE ---\r\n                Pay close attention to the existing path structures. Match capitalization and use of underscores precisely. When creating new entries, use the same conventions as these recent entries from the database:\r\n                ${examplesString}\r\n`;
            }

            // FULL PROMPT RESTORED
            const systemPrompt = `
                You are a master architect for a MongoDB database used in a Pathfinder 1e campaign. Your task is to convert a natural language command into a sequence of MongoDB operations.
                You MUST respond ONLY with a valid JSON array of operation objects. Do not include explanations or markdown formatting.
${existingStructurePrompt}
                The database has two main types of collections:
                1.  A structural collection: 'codex_entries'. This collection defines the hierarchical tree structure the user sees. Each document is a node in the tree.
                2.  Data collections: ['entities_pf1e', 'spells_pf1e', 'deities_pf1e', etc.]. These collections store the detailed information for the items listed in the codex.

                --- CRITICAL RULES ---
                1. The 'entities_pf1e' collection is ONLY for combat-ready entities. The correct 'type' for these are 'NPC', 'Monster', 'Creature', or 'Character'.
                2. NEVER create an 'entities_pf1e' document for types like 'Quest', 'Location', 'Item', or 'Organization'. All data for these non-combatant types belongs in a single 'codex_entries' document. These entries MUST NOT have an 'entity_id'.

                --- RESPONSE FORMAT ---
                Your response must be a JSON array, where each object is a distinct database operation.
                [
                  { "collection": "...", "insert": { ... } },
                  { "collection": "...", "filter": { ... }, "update": { ... } }
                ]

                --- CORE LOGIC: LINKING CODEX AND DATA ---
                - **Folder/Category Nodes**: Organizational containers (e.g., "Quests"). 'codex_entries' doc with NO 'entity_id'.
                - **Content Nodes**:
                  - **Combatant (NPC, Monster)**: Two docs. One in 'entities_pf1e', linked by 'entity_id' in 'codex_entries'.
                  - **Non-Combatant (Quest, Location)**: One doc in 'codex_entries' ONLY.

                --- STRUCTURED CONTENT ---
                The 'content' field must be a JSON array of blocks:
                - { "type": "heading", "text": "..." }
                - { "type": "paragraph", "text": "..." }
                - { "type": "list", "items": ["...", "..." ] }
                - { "type": "table", "title": "...", "headers": ["...", "..."], "rows": [{ "Header1": "...", "Header2": "..." }] }

                --- DATA FIELDS BY TYPE ---

                **Quest (stored in codex_entries):**
                {
                  "path_components": ["...", "Quest Name"],
                  "name": "Quest Name",
                  "category": "Quest",
                  "summary": "...",
                  "content": [ ... ],
                  "createdAt": "$NOW"
                }

                **NPC/Character (entity in entities_pf1e):**
                {
                  "_id": "$NEW_ID_...",
                  "name": "Character Name",
                  "type": "NPC",
                  "alignment": "...",
                  "class": "...",
                  "baseStats": { "ac": "...", "hp": "...", "str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10, "combat": { "bab": "-", "cmb": "-", "cmd": "-" } },
                  "skills": "...",
                  "feats": "...",
                  "gear": "...",
                  "content": [ ... ]
                }

                **Location (stored in codex_entries):**
                {
                  "path_components": ["...", "Location Name"],
                  "name": "Location Name",
                  "category": "Location",
                  "summary": "...",
                  "content": [ ... ],
                  "createdAt": "$NOW"
                }

                **Item (stored in codex_entries):**
                {
                  "path_components": ["...", "Item Name"],
                  "name": "Item Name",
                  "category": "Item",
                  "summary": "...",
                  "content": [ ... ],
                  "createdAt": "$NOW"
                }

                --- AVAILABLE COLLECTIONS ---
                ["codex_entries", "entities_pf1e", "equipment_pf1e", "rules_pf1e", "spells_pf1e", "deities_pf1e", "hazards_pf1e", "dm_toolkit_sessions", "dm_toolkit_fights", "dm_toolkit_combatants", "settings"]
                
                User Query: ${query}
            `;

            const proposedUpdate = await generateContent(db, systemPrompt, { model, jsonMode: true });
            res.json(proposedUpdate);

        } catch (error) {
            console.error('[AI] Error in /generate-update:', error);
            res.status(500).json({ error: `Failed to generate update: ${error.message}` });
        }
    });

    // execute-operation remains unchanged
    router.post('/execute-operation', async (req, res) => {
        const operations = req.body;
        if (!Array.isArray(operations) || operations.length === 0) return res.status(400).json({ error: 'Invalid payload.' });
        if (!db) return res.status(503).json({ error: 'Database not ready' });

        const newIdMap = new Map();
        const results = [];

        // Helper to ensure parent paths exist for codex_entries
        async function ensureCodexParents(pathComponents) {
            if (!Array.isArray(pathComponents) || pathComponents.length <= 1) return;

            const parentOps = [];
            for (let i = 1; i < pathComponents.length; i++) {
                const parentPath = pathComponents.slice(0, i);
                parentOps.push({
                    updateOne: {
                        filter: { path_components: parentPath },
                        update: {
                            $setOnInsert: {
                                name: parentPath[parentPath.length - 1],
                                path_components: parentPath
                            }
                        },
                        upsert: true
                    }
                });
            }
            if (parentOps.length > 0) {
                await db.collection('codex_entries').bulkWrite(parentOps, { ordered: false });
                console.log(`[AI Execute] Created ${parentOps.length} parent entries for path: ${pathComponents.join('/')}`);
            }
        }

        try {
            for (const op of operations) {
                // Replace placeholders
                const sectionsToScan = [op.filter, op.update];
                for (const section of sectionsToScan) {
                    if (!section) continue;
                    for (const key in section) {
                        const subObject = section[key];
                        if (typeof subObject !== 'object' || subObject === null) continue;
                        for (const field in subObject) {
                            const value = subObject[field];
                            if (typeof value === 'string' && value.startsWith('$NEW_ID') && newIdMap.has(value)) {
                                subObject[field] = newIdMap.get(value);
                            }
                        }
                    }
                }

                const targetCollection = db.collection(op.collection);

                if (op.insert) {
                    if (op.collection === 'codex_entries' && typeof op.insert.content === 'undefined') op.insert.content = [];
                    if (op.insert.createdAt === '$NOW') op.insert.createdAt = new Date();

                    // Auto-create parent entries for codex_entries
                    if (op.collection === 'codex_entries' && op.insert.path_components) {
                        await ensureCodexParents(op.insert.path_components);
                    }

                    const placeholderId = op.insert._id && typeof op.insert._id === 'string' && op.insert._id.startsWith('$NEW_ID') ? op.insert._id : null;
                    if (placeholderId) delete op.insert._id;

                    const result = await targetCollection.insertOne(op.insert);
                    if (placeholderId) newIdMap.set(placeholderId, result.insertedId);

                    results.push({ status: 'inserted', collection: op.collection, insertedId: result.insertedId });
                }

                if (op.update) {
                    if (!op.filter) continue;
                    if (op.filter._id && ObjectId.isValid(op.filter._id)) op.filter._id = new ObjectId(op.filter._id);

                    // Auto-create parent entries for codex_entries updates with path_components in filter
                    if (op.collection === 'codex_entries' && op.filter.path_components) {
                        await ensureCodexParents(op.filter.path_components);
                    }

                    const result = await targetCollection.updateOne(op.filter, op.update, { upsert: true });
                    results.push({ status: 'updated', collection: op.collection, matchedCount: result.matchedCount, upsertedId: result.upsertedId });
                }
            }
            res.status(200).json({ message: `Executed ${operations.length} operations.`, details: results });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};