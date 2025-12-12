const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();
// CHANGE: Import from new aiService
const { generateContent, getAvailableModels } = require('../services/aiService');

module.exports = function (db) {

    // List available models (Gemini + Ollama)
    router.get('/models', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        try {
            // Use the unified service to get all models
            const allModels = await getAvailableModels(db);
            const generalSettings = await db.collection('settings').findOne({ _id: 'general' });

            res.json({
                models: allModels,
                defaultModel: generalSettings?.default_ai_model || 'gemini-1.5-flash'
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
                const cleanedExamples = recentEntries.map(e => (e.path_components || [])
                    .filter(c => c !== 'Codex')
                    .map(c => c.replace(/ /g, '_'))
                );
                existingStructurePrompt = `\r\n                --- EXISTING STRUCTURE EXAMPLE ---\r\n                Match these path conventions:\r\n                ${JSON.stringify(cleanedExamples, null, 2)}\r\n`;
            }

            const systemPrompt = `
                You are a master architect for a MongoDB database used in a Pathfinder 1e campaign. 
                Task: Convert a natural language command into a sequence of MongoDB operations (JSON array).
                ${existingStructurePrompt}
                --- CRITICAL RULES ---
                1. 'entities_pf1e' collection is ONLY for Combat-Ready types (NPC, Monster, Creature).
                2. Types like Quest, Location, Item, Organization go into 'codex_entries' (NO entity_id).
                3. Path Components: Start with top-level category (e.g. ['Places', 'City']), NO 'Codex', NO spaces in tags (use underscores).
                4. Content: Parse into blocks (heading, paragraph, list, table).
                
                --- RESPONSE FORMAT ---
                Return ONLY a JSON Array:
                [ { "collection": "...", "insert": { ... } } ]

                User Query: ${query}
            `;

            // Service handles routing to Ollama/Gemini based on 'model'
            const proposedUpdate = await generateContent(db, systemPrompt, { model, jsonMode: true });
            res.json(proposedUpdate);

        } catch (error) {
            console.error('[AI] Error in /generate-update:', error);
            res.status(500).json({ error: `Failed to generate update: ${error.message}` });
        }
    });

    // ... execute-operation remains exactly the same ...
    router.post('/execute-operation', async (req, res) => {
        // (Keep the existing execute-operation code unchanged)
        const operations = req.body;
        if (!Array.isArray(operations) || operations.length === 0) return res.status(400).json({ error: 'Invalid payload.' });
        if (!db) return res.status(503).json({ error: 'Database not ready' });

        const newIdMap = new Map();
        const results = [];

        async function ensureCodexParents(pathComponents) {
            if (!Array.isArray(pathComponents) || pathComponents.length <= 1) return;
            const parentOps = [];
            for (let i = 1; i < pathComponents.length; i++) {
                const parentPath = pathComponents.slice(0, i);
                parentOps.push({
                    updateOne: {
                        filter: { path_components: parentPath },
                        update: { $setOnInsert: { name: parentPath[parentPath.length - 1], path_components: parentPath } },
                        upsert: true
                    }
                });
            }
            if (parentOps.length > 0) await db.collection('codex_entries').bulkWrite(parentOps, { ordered: false });
        }

        try {
            for (const op of operations) {
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
                    if (op.collection === 'codex_entries' && op.insert.path_components) await ensureCodexParents(op.insert.path_components);

                    const placeholderId = op.insert._id && typeof op.insert._id === 'string' && op.insert._id.startsWith('$NEW_ID') ? op.insert._id : null;
                    if (placeholderId) delete op.insert._id;

                    const result = await targetCollection.insertOne(op.insert);
                    if (placeholderId) newIdMap.set(placeholderId, result.insertedId);
                    results.push({ status: 'inserted', collection: op.collection, insertedId: result.insertedId });
                }

                if (op.update) {
                    if (!op.filter) continue;
                    if (op.filter._id && ObjectId.isValid(op.filter._id)) op.filter._id = new ObjectId(op.filter._id);
                    if (op.collection === 'codex_entries' && op.filter.path_components) await ensureCodexParents(op.filter.path_components);

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