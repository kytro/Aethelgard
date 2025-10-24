const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

// This function allows us to pass the database connection (db) from server.js
module.exports = function(db) {

    // --- NEW ENDPOINT to list available models ---
    router.get('/models', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });

        try {
            const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
            const activeKeyId = apiKeysDoc?.active_key_id;
            const activeKey = apiKeysDoc?.keys?.find(k => k.id === activeKeyId);
            const apiKey = activeKey?.key;

            if (!apiKey) {
                return res.status(500).json({ error: 'Gemini API key not found in database.' });
            }

            const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const response = await fetch(modelsUrl);

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Failed to fetch models from Gemini API: ${errorBody}`);
            }

            const data = await response.json();
            
            const filteredModels = data.models
                .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name); 

            const generalSettings = await db.collection('settings').findOne({ _id: 'general' });
            const defaultModel = generalSettings?.default_ai_model || 'models/gemini-pro';

            const responsePayload = {
                models: filteredModels,
                defaultModel: defaultModel
            };
            console.log('[AI /models] Sending response:', responsePayload); // DEBUG
            res.json(responsePayload);

        } catch (error) {
            console.error('[AI] Error listing models:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // --- MODIFIED ENDPOINT to generate a DB update command ---
    router.post('/generate-update', async (req, res) => {
        // Now expects 'model' in the body
        const { query, model } = req.body; 

        if (!query) {
            return res.status(400).json({ error: 'Query is required.' });
        }
        if (!db) return res.status(503).json({ error: 'Database not ready' });

        console.log(`[AI] Received query: "${query}" for model: ${model}`);

        try {
            const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
            const activeKeyId = apiKeysDoc?.active_key_id;
            const activeKey = apiKeysDoc?.keys?.find(k => k.id === activeKeyId);
            const apiKey = activeKey?.key;
            
            if (!apiKey) {
                console.error('[AI] Gemini API key not found in database.');
                return res.status(500).json({ error: 'Gemini API key is not configured in the database.' });
            }

            // Fetch the configured default model from general settings.
            const generalSettings = await db.collection('settings').findOne({ _id: 'general' });
            const defaultModel = generalSettings?.default_ai_model || 'models/gemini-pro'; // Fallback to a known stable model

            // If a model is passed in the request, use it, otherwise use the default from settings.
            const modelId = (model || defaultModel).replace('models/', '');

            // Use the correct, stable v1beta endpoint.
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

            const systemPrompt = `
                You are a master architect for a MongoDB database used in a Pathfinder 1e campaign. Your task is to convert a natural language command into a sequence of MongoDB operations.
                You MUST respond ONLY with a valid JSON array of operation objects. Do not include explanations or markdown formatting.

                The database has two main types of collections:
                1.  A structural collection: 'codex_entries'. This collection defines the hierarchical tree structure the user sees. Each document is a node in the tree.
                2.  Data collections: ['entities_pf1e', 'spells_pf1e', 'deities_pf1e', etc.]. These collections store the detailed information for the items listed in the codex.

                --- RESPONSE FORMAT ---
                Your response must be a JSON array, where each object is a distinct database operation.
                [
                  { "collection": "...", "insert": { ... } },
                  { "collection": "...", "filter": { ... }, "update": { ... } }
                ]

                --- CORE LOGIC: LINKING CODEX AND DATA ---
                Almost every piece of data (a person, place, quest) requires TWO documents:
                1.  A 'codex_entries' document to place it in the navigation tree. Its key field is "path_components", an array of strings.
                2.  A document in a data collection (e.g., 'entities_pf1e') containing the actual data.

                --- EXAMPLES OF COMMON OPERATIONS ---

                **1. TO CREATE a new entity from scratch (e.g., "Create a new character named Jax at 'People > Solarran Freehold > Riftwatch'"):**
                This always requires TWO 'insert' operations.
                [
                  {
                    "collection": "entities_pf1e",
                    "insert": { "_id": "$NEW_ID_JAX", "name": "Jax", "type": "NPC", "content": "# Jax\\n\\nA mysterious figure." }
                  },
                  {
                    "collection": "codex_entries",
                    "insert": {
                      "path_components": ["People", "Solarran Freehold", "Riftwatch", "Jax"],
                      "entity_id": "$NEW_ID_JAX",
                      "createdAt": "$NOW"
                    }
                  }
                ]
                - Use a placeholder like "$NEW_ID_<NAME>" for the new document's ID. The backend will replace this.

                **2. TO CREATE an entity FOR an EXISTING codex entry (e.g., "Update Silas and create and link entity with these stats..."):**
                This is for when a codex entry exists but is not yet linked. It requires an 'insert' for the new entity data and an 'update' to link the existing codex entry.
                [
                  {
                    "collection": "entities_pf1e",
                    "insert": {
                      "_id": "$NEW_ID_SILAS",
                      "name": "Lord Kaelen tra-Varr Silas",
                      "alignment": "Lawful Neutral",
                      "class": "Human Inquisitor (of Abadar) 4",
                      "content": "He is the son of the famous Lord Regent...",
                      "baseStats": {
                          "ac": "16 (touch 12, flat-footed 14)", "hp": "14 (4d8-4)",
                          "saves": "Fort +3, Ref +3, Will +6", "attack": "Masterwork rapier +6 (1d6/18-20)",
                          "str": 10, "dex": 14, "con": 8, "int": 16, "wis": 14, "cha": 15
                      },
                      "skills": "Sense Motive +10, Bluff +9, Intimidate +8, Diplomacy +8, Spellcraft +10, Disguise +9, Knowledge (Local) +7, Perception +6",
                      "feats": "Cunning Initiative, Persuasive, Combat Expertise",
                      "gear": "Masterwork chain shirt, masterwork rapier, Cipher Locket."
                    }
                  },
                  {
                    "collection": "codex_entries",
                    "filter": { "name": "Lord_Kaelen_tra-Varr_Silas" },
                    "update": { "$set": { "entity_id": "$NEW_ID_SILAS" } }
                  }
                ]

                **3. TO UPDATE an existing, linked entity's content (e.g., "Update the content for the 'Rift Hound' bestiary entry"):**
                This requires ONE 'update' on the data collection. The AI must infer the entity's ID to perform the update. If the ID cannot be determined from the user's query, it is correct to return an error.
                [
                  {
                    "collection": "entities_pf1e",
                    "filter": { "_id": "the_actual_id_of_the_rift_hound_entity" },
                    "update": { "$set": { "content": "New updated content about the Rift Hound." } }
                  }
                ]
                - If you cannot determine the entity ID, respond with: { "error": "Cannot determine the entity ID from the path alone. Please provide the ID for the update." }


                **4. TO MOVE or RENAME a codex entry (e.g., "Move 'Jax' from Riftwatch to Riftwatch > Key Figures And Transients"):**
                This requires ONE 'update' operation on the 'codex_entries' collection to change the 'path_components'.
                [
                  {
                    "collection": "codex_entries",
                    "filter": { "path_components": ["People", "Solarran Freehold", "Riftwatch", "Jax"] },
                    "update": { "$set": { "path_components": ["People", "Solarran Freehold", "Riftwatch", "Key Figures And Transients", "Jax"] } }
                  }
                ]

                --- AVAILABLE COLLECTIONS ---
                ["codex_entries", "entities_pf1e", "equipment_pf1e", "rules_pf1e", "spells_pf1e", "deities_pf1e", "hazards_pf1e", "dm_toolkit_sessions", "dm_toolkit_fights", "dm_toolkit_combatants", "settings"]
            `;

            const payload = {
                contents: [{
                    parts: [{ text: `${systemPrompt}\n\nUser Query: ${query}` }]
                }]
            };
                        
            console.log(`[AI] Sending request to Gemini API: ${apiUrl}`);
            const geminiResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!geminiResponse.ok) {
                const errorBody = await geminiResponse.text();
                throw new Error(`Gemini API request failed with status ${geminiResponse.status}: ${errorBody}`);
            }
            
            const result = await geminiResponse.json();
            
            const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) {
                throw new Error('Invalid response structure from Gemini API.');
            }
            
            const proposedUpdate = JSON.parse(responseText.replace(/```json|```/g, '').trim());
            
            console.log('[AI] Generated proposed update:', proposedUpdate);
            res.json(proposedUpdate);

        } catch (error) {
            console.error('[AI] Error in /generate-update:', error);
            res.status(500).json({ error: `Failed to generate update: ${error.message}` });
        }
    });
    
    // This endpoint takes the confirmed update object and executes it. 
    router.post('/execute-operation', async (req, res) => {
        const operations = req.body;

        if (!Array.isArray(operations) || operations.length === 0) {
            return res.status(400).json({ error: 'Invalid operation payload. An array of operations is expected.' });
        }
        if (!db) return res.status(503).json({ error: 'Database not ready' });

        const newIdMap = new Map();
        const results = [];

        try {
            for (const op of operations) {
                // --- START OF FIX ---
                // Replace any known placeholders in the current operation's filter or update fields
                // This must run BEFORE the operation is executed.
                const sectionsToScan = [op.filter, op.update];
                for (const section of sectionsToScan) {
                    if (!section) continue;
                    // Handles nested objects like { "$set": { "field": "value" } }
                    for (const key in section) {
                        const subObject = section[key];
                        if (typeof subObject !== 'object' || subObject === null) continue;

                        for (const field in subObject) {
                            const value = subObject[field];
                            if (typeof value === 'string' && value.startsWith('$NEW_ID') && newIdMap.has(value)) {
                                subObject[field] = newIdMap.get(value); // Replace with the real ObjectId
                            }
                        }
                    }
                }
                // --- END OF FIX ---

                const { collection, filter, update, insert } = op;
                const targetCollection = db.collection(collection);

                if (insert) {
                    if (insert.createdAt === '$NOW') insert.createdAt = new Date();

                    const placeholderId = insert._id && typeof insert._id === 'string' && insert._id.startsWith('$NEW_ID') ? insert._id : null;
                    if (placeholderId) delete insert._id; // Let MongoDB generate the new _id
                    
                    const result = await targetCollection.insertOne(insert);
                    
                    if (placeholderId) {
                        newIdMap.set(placeholderId, result.insertedId); // Map placeholder to the real new ID
                    }
                    results.push({ status: 'inserted', collection, insertedId: result.insertedId });
                }

                if (update) {
                    if (!filter) {
                         results.push({ status: 'failed', error: 'Filter is required for an update operation.' });
                         continue;
                    }
                    if (filter._id && ObjectId.isValid(filter._id)) {
                        filter._id = new ObjectId(filter._id);
                    }
                    
                    const result = await targetCollection.updateOne(filter, update);
                    
                    if (result.matchedCount === 0) {
                        results.push({ status: 'not_found', collection, filter });
                    } else {
                        results.push({ status: 'updated', collection, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
                    }
                }
            }
            
            const successMessage = `Successfully executed ${operations.length} operations.`;
            console.log(`[AI] ${successMessage}`);
            res.status(200).json({ message: successMessage, details: results });

        } catch (err) {
            console.error('[AI] Failed to execute operations:', err);
            res.status(500).json({ error: `Operation failed: ${err.message}` });
        }
    });

    return router;
};