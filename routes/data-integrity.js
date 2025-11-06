const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

// This function allows us to pass the database connection (db) from server.js
module.exports = function(db) {
    
    // -----------------------------------------------------------
    // FIX: Robust Gemini Helper Functions for Reconciliation
    // -----------------------------------------------------------
    
    /**
     * Retrieves the active Gemini API key from the settings collection.
     * @returns {Promise<string>} The active API key.
     */
    async function getActiveApiKey() {
        const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
        const activeKey = apiKeysDoc?.keys?.find(k => k.id === apiKeysDoc.active_key_id);
        if (!activeKey?.key) {
            throw new Error('Gemini API key not configured in settings collection.');
        }
        return activeKey.key;
    }

    /**
     * Fetches a batch of full item objects for reconciliation from the Gemini API.
     * This is a single, highly effective API call, replacing the old multi-step process.
     */
    async function fetchReconciliationBatch(apiKey, itemType, existingNames, batchSize) {
        // FIX: Using the reliable Gemini 1.5 Flash model for production stability
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        const prompt = `You are a Pathfinder 1st Edition rules expert. 
Provide a list of up to ${batchSize} official ${itemType} objects (including ALL required keys like name, description, stats, etc., as appropriate for the type) that are NOT in the provided JSON array of names. 
The response MUST be a single, clean JSON array of FULL objects. If no more items are found, return an empty JSON array: [].

Existing item names:
${JSON.stringify(existingNames)}`;

        const payload = { contents: [{ parts: [{ text: prompt }] }] };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`Gemini API Error (Status ${response.status}): ${errorBody.error?.message || 'Unknown Gemini API Error'}`);
        }

        const result = await response.json();
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        
        // FIX: Robust JSON parsing (removing markdown fences and trimming)
        try {
            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
            const jsonString = jsonMatch ? jsonMatch[1] : responseText.trim();
            return JSON.parse(jsonString);
        } catch (e) {
            console.error('Failed to parse JSON from Gemini response:', responseText);
            throw new Error('Invalid JSON response from AI.');
        }
    }

    /**
     * Core logic for iterative AI reconciliation of a collection (Items, Spells, Deities, Hazards).
     */
    async function reconcileCollection(collectionName, itemType, idPrefix, maxIterations, batchSize) {
        if (!db) { throw new Error('Database not ready for reconciliation.'); } 
        
        const apiKey = await getActiveApiKey();
        const existingDocs = await db.collection(collectionName).find({}).project({ name: 1 }).toArray();
        let knownNames = existingDocs.map(d => d.name).filter(Boolean);
        let totalAdded = 0;

        for (let i = 0; i < maxIterations; i++) {
            console.log(`[RECONCILE ${collectionName}] Iteration ${i + 1}/${maxIterations}. Fetching ${batchSize} new items...`);
            
            const newItemsBatch = await fetchReconciliationBatch(apiKey, itemType, knownNames, batchSize);

            if (!newItemsBatch || newItemsBatch.length === 0) {
                console.log(`[RECONCILE ${collectionName}] Fetch complete. No new items found.`);
                break;
            }

            const bulkOps = [];
            const newNames = [];

            for (const item of newItemsBatch) {
                if (item.name) {
                    const itemId = `${idPrefix}${item.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                    
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: itemId },
                            update: { $set: { ...item, _id: itemId } },
                            upsert: true
                        }
                    });
                    
                    newNames.push(item.name);
                }
            }
            
            if (bulkOps.length > 0) {
                await db.collection(collectionName).bulkWrite(bulkOps, { ordered: false });
                totalAdded += newNames.length;
                knownNames.push(...newNames);
                console.log(`[RECONCILE ${collectionName}] Stored ${newNames.length} new ${itemType}(s).`);
            }
        }
        return totalAdded;
    }
    // -----------------------------------------------------------
    
    // --- PARSER LOGIC (Helper functions - original code starts here) ---

    // Helper function to escape special characters for use in a regular expression
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& = whole match
    }
    function getAbilityModifierAsNumber(score) {
        const numScore = parseInt(String(score).match(/-?\d+/)?.[0] || '10', 10);
        if (isNaN(numScore)) return 0;
        return Math.floor((numScore - 10) / 2);
    }

    // This function is still used by the /process-codex route
    async function parseStatBlockToEntity(statBlock, name, path, content) {
        const baseStats = {};
        const abilityVariations = { str: ['str', 'strength'], dex: ['dex', 'dexterity'], con: ['con', 'constitution'], int: ['int', 'intelligence'], wis: ['wis', 'wisdom'], cha: ['cha', 'charisma'] };

        const getAllStats = () => {
            let all = [];
            (content || []).filter(b => b.type === 'statblock' && b.stats).forEach(block => {
                if (Array.isArray(block.stats)) {
                    all.push(...block.stats);
                } else if (typeof block.stats === 'object') {
                    // Handle object format, convert to array format
                    for (const key in block.stats) {
                        all.push({ label: key, value: block.stats[key] });
                    }
                }
            });
            return all;
        }

        const allStats = getAllStats();
        for (const ability in abilityVariations) {
            for (const variation of abilityVariations[ability]) {
                const stat = allStats.find(s => s.label && s.label.toLowerCase() === variation);
                if (stat && stat.value) {
                    const match = String(stat.value).match(/-?\d+/);
                    if (match) {
                        baseStats[ability] = parseInt(match[0], 10);
                        break;
                    }
                }
            }
        }

        if (Object.keys(baseStats).length < 6) {
            return null;
        }

        const getStat = (label) => {
            const stat = allStats.find(s => s.label && s.label.toLowerCase() === label.toLowerCase());
            return stat ? stat.value : null;
        }

        baseStats.hp = getStat('HP');
        baseStats.ac = getStat('AC');

        const combat = { bab: null, cmb: null, cmd: null };

        const babString = getStat('Base Atk');
        const cmbString = getStat('CMB');
        const cmdString = getStat('CMD');

        if (babString) {
            combat.bab = parseInt(babString.match(/[+-]?\d+/)?.[0] || '0', 10);
        }
        if (cmbString) {
            combat.cmb = cmbString;
        }
        if (cmdString) {
            combat.cmd = cmdString;
        }

        const strMod = getAbilityModifierAsNumber(baseStats.str);
        const dexMod = getAbilityModifierAsNumber(baseStats.dex);

        const crString = getStat('cr') || '1';
        let level = 1;
        if (crString.includes('/')) {
            const parts = crString.split('/');
            level = parseInt(parts[0], 10) / parseInt(parts[1], 10);
        } else {
            level = parseInt(crString, 10);
        }
        if (isNaN(level) || level < 1) level = 1;
        const levelInt = Math.floor(level);

        if (combat.bab === null) {
            combat.bab = levelInt;
        }
        if (combat.cmb === null && combat.bab !== null) {
            combat.cmb = combat.bab + strMod;
        }
        if (combat.cmd === null && combat.bab !== null) {
            combat.cmd = 10 + combat.bab + strMod + dexMod;
        }

        baseStats.combat = combat;
        baseStats.saves = getStat('Saves');

        const rules = [];
        const featsTables = content.filter(b => b.type === 'table' && b.title && b.title.toLowerCase() === 'feats');
        const featNames = [];
        featsTables.forEach(table => {
            (table.rows || []).forEach(row => {
                if (row.Feat) featNames.push(row.Feat.trim());
            });
        });
        if (featNames.length > 0) {
            const ruleDocs = await db.collection('rules_pf1e').find({ name: { $in: featNames.map(n => new RegExp(`^${escapeRegExp(n)}$`, 'i')) } }).project({ _id: 1 }).toArray();
            rules.push(...ruleDocs.map(d => d._id.toString()));
        }

        const equipment = [];
        const equipmentHeadingIndex = content.findIndex(b => b.type === 'heading' && b.text && b.text.toLowerCase() === 'equipment');
        if (equipmentHeadingIndex > -1) {
            const equipmentParagraph = content.find((b, i) => i > equipmentHeadingIndex && b.type === 'paragraph');
            if (equipmentParagraph && equipmentParagraph.text) {
                const itemNames = equipmentParagraph.text.split(/[,.]+/).map(item => item.trim()).filter(Boolean);
                if (itemNames.length > 0) {
                    const equipDocs = await db.collection('equipment_pf1e').find({ name: { $in: itemNames.map(n => new RegExp(`^${escapeRegExp(n)}$`, 'i')) } }).project({ _id: 1 }).toArray();
                    equipment.push(...equipDocs.map(d => d._id.toString()));
                }
            }
        }

        const skills = [];
        const skillsTables = content.filter(b => b.type === 'table' && b.title && b.title.toLowerCase() === 'skills');
        const skillNames = [];
        skillsTables.forEach(table => {
            (table.rows || []).forEach(row => {
                if (row.Skill) { // Assuming the column is named 'Skill'
                    const skillNameMatch = row.Skill.match(/^([a-zA-Z\s()]+)/);
                    if (skillNameMatch && skillNameMatch[1]) {
                        skillNames.push(skillNameMatch[1].trim());
                    }
                }
            });
        });
        if (skillNames.length > 0) {
            const skillDocs = await db.collection('skills_pf1e').find({ name: { $in: skillNames.map(n => new RegExp(`^${escapeRegExp(n)}$`, 'i')) } }).project({ _id: 1 }).toArray();
            skills.push(...skillDocs.map(d => d._id.toString()));
        }

        return {
            _id: statBlock.entityId,
            name,
            sourceCodexPath: path,
            baseStats,
            rules,
            equipment,
            skills,
        };
    }

    // Helper function to get node data from codex
    function getNodeData(codexDoc, path) {
        let node = codexDoc;
        for (const p of path) {
            node = node?.[p];
        }
        return node;
    }

    // --- DATA INTEGRITY ENDPOINTS ---

    // ---------------------------------------------
    // ROUTE 1: PROCESS CODEX (Kept as is)
    // ---------------------------------------------
    router.post('/process-codex', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[PROCESS CODEX] Job initiated.`);
        try {
            const codexEntries = await db.collection('codex_entries').find({}).toArray();
            if (!codexEntries || codexEntries.length === 0) {
                return res.status(404).json({ error: 'No entries found in codex_entries collection.' });
            }

            let entities = [];
            for (const entry of codexEntries) {
                if (entry.content && Array.isArray(entry.content)) {
                    const statBlock = entry.content.find(b => b.type === 'statblock');
                    if (statBlock && statBlock.entityId) {
                        const name = entry.name.replace(/_/g, ' ');
                        const entity = await parseStatBlockToEntity(statBlock, name, entry.path_components, entry.content);
                        if (entity) entities.push(entity);
                    }
                }
            }

            const entitiesCollection = db.collection('entities_pf1e');
            await entitiesCollection.deleteMany({});
            if (entities.length > 0) await entitiesCollection.insertMany(entities);

            res.status(200).json({ message: `Codex processing complete. Found and processed ${entities.length} entities.` });
        } catch (error) {
            console.error('[PROCESS CODEX] Error:', error);
            res.status(500).json({ error: `Codex processing failed: ${error.message}` });
        }
    });


    // -------------------------------------------------------------
    // ROUTE 2: LINK EQUIPMENT (Gemini-assisted with PF1e Prompt)
    // -------------------------------------------------------------
    router.post('/link-equipment', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[LINK EQUIPMENT] Job started.`);

        try {
            // 1. Grab Gemini key
            // FIX: Uses robust helper function
            const apiKey = await getActiveApiKey();
            

            // 2. Fetch entities and Codex data
            const entsToProcess = await db.collection('entities_pf1e')
                                            .find({ equipment: { $size: 0 } })
                                            .toArray();
            // Fetch all codex entries
            const codexEntries = await db.collection('codex_entries').find({}).toArray();

            if (entsToProcess.length === 0) {
                return res.json({ message: 'No entities need equipment linking (equipment array is non-empty for all).' });
            }
            console.log(`[LINK EQUIPMENT] Found ${entsToProcess.length} entities to process.`);


            // 3. Helper: ask Gemini to extract item names from free text
            async function extractItemNames(text) {
                const systemPrompt = `
You are an expert Pathfinder 1st Edition (PF1e) ruleset parser.
Your task is to analyze a short English sentence describing a character's gear and extract only the official, core PF1e equipment names.
Constraints:
1.  **Ignore** descriptive adjectives like 'fine', 'masterwork', 'loaded', 'various', 'set of', 'hidden', etc., unless the adjective is part of an official magic item name (e.g., '+1 Longsword' is kept).
2.  **Ignore** generic, non-game-rule items like 'keys', 'ledgers', 'pouch', 'spectacles', 'coins', 'trinkets', 'small constructs', 'fine clothes', 'uniform', 'robes', 'maps', or 'scrolls'.
3.  **Return ONLY** a clean JSON array of extracted item names (no explanations, no markdown formatting).
`;
                const prompt = `${systemPrompt}\nInput: \"${text}\"`;

                // Exponential backoff logic for retry
                const maxRetries = 3;
                let attempt = 0;
                while (attempt < maxRetries) {
                    try {
                        // FIX: Use the reliable Gemini 1.5 Flash model for production stability
                        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                        const body = { contents: [{ parts: [{ text: prompt }] }] };

                        const r = await fetch(url, { 
                            method: 'POST', 
                            headers: { 'Content-Type': 'application/json' }, 
                            body: JSON.stringify(body) 
                        });
                        
                        if (!r.ok) {
                            if (r.status === 429) {
                                throw new Error('429 Rate Limit Hit');
                            }
                            throw new Error(`Gemini request failed with status: ${r.status} ${r.statusText}`);
                        }

                        const json = await r.json();
                        const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
                        
                        try {
                            // FIX: Robust JSON parsing (removing markdown fences and trimming)
                            const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
                            const jsonString = jsonMatch ? jsonMatch[1] : raw.trim();
                            return JSON.parse(jsonString);
                        } catch (e) {
                            console.error(`[LINK EQUIPMENT] Failed to parse JSON from Gemini. Raw response: ${raw.substring(0, 100)}...`, e);
                            return []; 
                        }

                    } catch (error) {
                        attempt++;
                        if (attempt >= maxRetries) {
                            throw error;
                        }
                        const delay = Math.pow(2, attempt) * 1000;
                        console.log(`[LINK EQUIPMENT] Retrying in ${delay / 1000}s due to error: ${error.message}`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }
            
            // 4. Batch Processing Loop (Rate Limit Fix)
            const BATCH_SIZE = 5; 
            const THROTTLE_MS = 1000; 

            let linked = 0;
            
            for (let i = 0; i < entsToProcess.length; i += BATCH_SIZE) {
                const batch = entsToProcess.slice(i, i + BATCH_SIZE);
                
                const batchPromises = batch.map(async (ent) => {
                    try {
                        const entityName = ent.name || 'Unknown Entity';

                        // 4a. Reconstruct the free-text equipment sentence from codex
                        const node = codexEntries.find(e => JSON.stringify(e.path_components) === JSON.stringify(ent.sourceCodexPath));
                        if (!node?.content) return;

                        const equipmentHeadingIndex = node.content.findIndex(c => c.type === 'heading' && c.text?.toLowerCase() === 'equipment');
                        const equipParagraph = node.content.find((c, i) => i > equipmentHeadingIndex && c.type === 'paragraph');

                        if (!equipParagraph?.text) return;

                        console.log(`[LINK EQUIPMENT] Processing ${entityName}. Text: "${equipParagraph.text.substring(0, 50)}"...`);
                        
                        // 4b. Ask Gemini for clean item names
                        const names = await extractItemNames(equipParagraph.text);
                        
                        if (!names || names.length === 0) {
                            console.log(`[LINK EQUIPMENT] No item names extracted by Gemini for ${entityName}.`);
                            return;
                        }
                        
                        // 4c. Match names -> equipment_pf1e
                        const escaped = names.map(n => escapeRegExp(n));
                        const regexes = escaped.map(n => new RegExp(`^${n}$`, 'i'));
                        
                        const matches = await db.collection('equipment_pf1e')
                                                    .find({ name: { $in: regexes } })
                                                    .project({ _id: 1, name: 1 })
                                                    .toArray();
                        
                        if (matches.length === 0) {
                            console.log(`[LINK EQUIPMENT] No database matches found for ${entityName} with names: ${names.join(', ')}`);
                            return;
                        }
                        
                        // 4d. Write the _id array back to the entity
                        const ids = matches.map(m => m._id.toString());
                        const updateResult = await db.collection('entities_pf1e').updateOne(
                            { _id: ent._id },
                            { $set: { equipment: ids } }
                        );

                        if (updateResult.modifiedCount > 0) {
                             console.log(`[LINK EQUIPMENT] SUCCESS: ${entityName} updated with ${ids.length} item links.`);
                             linked++; 
                        }
                    } catch (error) {
                        console.error(`[LINK EQUIPMENT] ERROR processing entity ${ent.name || 'Unknown'}: ${error.message}`);
                    }
                });

                // Wait for the entire batch to complete
                await Promise.all(batchPromises);

                // Throttle: Pause execution between batches to avoid rate limits
                if (i + BATCH_SIZE < entsToProcess.length) {
                    await new Promise(resolve => setTimeout(resolve, THROTTLE_MS));
                }
            }

            res.json({ message: `Equipment linking complete. ${linked} entities updated.` });

        } catch (e) {
            console.error('[LINK EQUIPMENT] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during processing.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 3: LINK RULES (Feats, etc.)
    // -------------------------------------------------------------
    router.post('/link-rules', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[LINK RULES] Job started.`);

        try {
            const entsToProcess = await db.collection('entities_pf1e')
                                            .find({ rules: { $size: 0 } })
                                            .toArray();
            const codexEntries = await db.collection('codex_entries').find({}).toArray();

            if (entsToProcess.length === 0) {
                return res.json({ message: 'No entities need rule linking.' });
            }
            console.log(`[LINK RULES] Found ${entsToProcess.length} entities to process.`);

            let linked = 0;
            for (const ent of entsToProcess) {
                try {
                    const entityName = ent.name || 'Unknown Entity';
                    const node = codexEntries.find(e => JSON.stringify(e.path_components) === JSON.stringify(ent.sourceCodexPath));
                    if (!node?.content) continue;

                    const featsTables = node.content.filter(b => b.type === 'table' && b.title?.toLowerCase() === 'feats');
                    const featNames = [];
                    featsTables.forEach(table => {
                        (table.rows || []).forEach(row => {
                            if (row.Feat) featNames.push(row.Feat.trim());
                        });
                    });

                    if (featNames.length === 0) continue;

                    console.log(`[LINK RULES] Processing ${entityName}. Feats found: ${featNames.join(', ')}`);

                    const escaped = featNames.map(n => escapeRegExp(n));
                    const regexes = escaped.map(n => new RegExp(`^${n}$`, 'i'));

                    const matches = await db.collection('rules_pf1e')
                                                .find({ name: { $in: regexes } })
                                                .project({ _id: 1, name: 1 })
                                                .toArray();

                    if (matches.length === 0) {
                        console.log(`[LINK RULES] No database matches found for ${entityName}.`);
                        continue;
                    }

                    const ids = matches.map(m => m._id.toString());
                    const updateResult = await db.collection('entities_pf1e').updateOne(
                        { _id: ent._id },
                        { $set: { rules: ids } }
                    );

                    if (updateResult.modifiedCount > 0) {
                        console.log(`[LINK RULES] SUCCESS: ${entityName} updated with ${ids.length} rule links.`);
                        linked++;
                    }
                } catch (error) {
                    console.error(`[LINK RULES] ERROR processing entity ${ent.name || 'Unknown'}: ${error.message}`);
                }
            }

            res.json({ message: `Rule linking complete. ${linked} entities updated.` });

        } catch (e) {
            console.error('[LINK RULES] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during processing.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 4: CLEANUP ORPHANED DATA
    // -------------------------------------------------------------
    router.post('/cleanup-orphans', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        const { dryRun = true, action = 'delete' } = req.body;
        console.log(`[CLEANUP ORPHANS] Job started. Action: ${action}. ${dryRun ? '(Dry Run)' : '(LIVE RUN)'}`);

        try {
            const results = {
                orphanedEntities: [],
                brokenRuleLinks: { count: 0, details: [] },
                brokenEquipmentLinks: { count: 0, details: [] },
            };

            // 1. Find all entity IDs from the codex
            const codexEntries = await db.collection('codex_entries').find({}).toArray();
            const validEntityIds = new Set();
            codexEntries.forEach(entry => {
                if (entry.content && Array.isArray(entry.content)) {
                    entry.content.forEach(block => {
                        if (block.type === 'statblock' && block.entityId) {
                            validEntityIds.add(block.entityId);
                        }
                    });
                }
            });

            // 2. Find orphaned entities
            const allDbEntities = await db.collection('entities_pf1e').find({}, { projection: { _id: 1, name: 1 } }).toArray();
            const entitiesToProcess = allDbEntities.filter(ent => !validEntityIds.has(ent._id.toString()));
            results.orphanedEntities = entitiesToProcess.map(e => ({ id: e._id, name: e.name }));

            if (!dryRun && entitiesToProcess.length > 0) {
                if (action === 'delete') {
                    const deleteIds = entitiesToProcess.map(e => e._id);
                    await db.collection('entities_pf1e').deleteMany({ _id: { $in: deleteIds } });
                } else if (action === 'create') {
                    const bulkOps = entitiesToProcess.map(entity => {
                        const entryName = entity.name.replace(/\s+/g, '_');
                        const path = ['Orphaned_Entries', entryName];
                        return {
                            updateOne: {
                                filter: { path_components: path },
                                update: {
                                    $setOnInsert: {
                                        name: entryName,
                                        path_components: path,
                                        content: [{ type: 'statblock', entityId: entity._id.toString() }],
                                        summary: `Auto-generated entry for orphaned entity: ${entity.name}`
                                    }
                                },
                                upsert: true
                            }
                        };
                    });
                    if (bulkOps.length > 0) {
                        await db.collection('codex_entries').bulkWrite(bulkOps);
                    }
                }
            }

            // 3. Find broken links in remaining entities
            const entitiesToKeepIds = allDbEntities.filter(ent => validEntityIds.has(ent._id.toString())).map(e => e._id);
            const entitiesToCheck = await db.collection('entities_pf1e').find({ _id: { $in: entitiesToKeepIds } }).toArray();

            const allRuleIds = new Set((await db.collection('rules_pf1e').find({}, { projection: { _id: 1 } }).toArray()).map(r => r._id.toString()));
            const allEquipmentIds = new Set((await db.collection('equipment_pf1e').find({}, { projection: { _id: 1 } }).toArray()).map(e => e._id.toString()));

            for (const entity of entitiesToCheck) {
                const validRules = [];
                const brokenRules = [];
                for (const ruleId of (entity.rules || [])) {
                    if (allRuleIds.has(ruleId)) {
                        validRules.push(ruleId);
                    } else {
                        brokenRules.push(ruleId);
                    }
                }

                if (brokenRules.length > 0) {
                    results.brokenRuleLinks.count += brokenRules.length;
                    results.brokenRuleLinks.details.push({ entity: { id: entity._id, name: entity.name }, brokenIds: brokenRules });
                    if (!dryRun) {
                        await db.collection('entities_pf1e').updateOne({ _id: entity._id }, { $set: { rules: validRules } });
                    }
                }

                const validEquipment = [];
                const brokenEquipment = [];
                for (const equipId of (entity.equipment || [])) {
                    if (allEquipmentIds.has(equipId)) {
                        validEquipment.push(equipId);
                    } else {
                        brokenEquipment.push(equipId);
                    }
                }

                if (brokenEquipment.length > 0) {
                    results.brokenEquipmentLinks.count += brokenEquipment.length;
                    results.brokenEquipmentLinks.details.push({ entity: { id: entity._id, name: entity.name }, brokenIds: brokenEquipment });
                    if (!dryRun) {
                        await db.collection('entities_pf1e').updateOne({ _id: entity._id }, { $set: { equipment: validEquipment } });
                    }
                }
            }

            const summary = `
Cleanup ${dryRun ? '(Dry Run)' : '(LIVE RUN)'} Summary:
- Found ${results.orphanedEntities.length} orphaned entities to delete.
- Found ${results.brokenRuleLinks.count} broken rule links across ${results.brokenRuleLinks.details.length} entities.
- Found ${results.brokenEquipmentLinks.count} broken equipment links across ${results.brokenEquipmentLinks.details.length} entities.
${dryRun ? 'No changes were made to the database.' : 'Database has been updated.'}
            `;

            console.log(summary);
            res.status(200).json({ summary, details: results });

        } catch (e) {
            console.error('[CLEANUP ORPHANS] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during cleanup.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 5: GET UNLINKED STATBLOCKS
    // -------------------------------------------------------------
    router.get('/unlinked-statblocks', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[UNLINKED STATBLOCKS] Job started.`);

        try {
            const codexEntries = await db.collection('codex_entries').find({}).toArray();
            const statblocksInCodex = [];
            codexEntries.forEach(entry => {
                if (entry.content && Array.isArray(entry.content)) {
                    entry.content.forEach(block => {
                        if (block.type === 'statblock' && block.entityId) {
                            statblocksInCodex.push({ entityId: block.entityId, path: entry.path_components });
                        }
                    });
                }
            });

            const allEntityIds = new Set((await db.collection('entities_pf1e').find({}, { projection: { _id: 1 } }).toArray()).map(e => e._id.toString()));

            const unlinkedStatblocks = statblocksInCodex.filter(sb => !allEntityIds.has(sb.entityId));

            res.status(200).json(unlinkedStatblocks);

        } catch (e) {
            console.error('[UNLINKED STATBLOCKS] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 6: CREATE MISSING ENTITIES
    // -------------------------------------------------------------
    router.post('/create-missing-entities', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[CREATE MISSING ENTITIES] Job started.`);

        try {
            const codexEntries = await db.collection('codex_entries').find({}).toArray();
            const allEntities = await db.collection('entities_pf1e').find({}).toArray();

            const entitiesById = new Map(allEntities.map(e => [e._id.toString(), e]));
            const entitiesByPath = new Map(allEntities.map(e => e.sourceCodexPath ? [JSON.stringify(e.sourceCodexPath), e] : null).filter(Boolean));

            let createdCount = 0;
            let linkedCount = 0;
            const bulkCodexUpdates = [];
            const entitiesToInsert = [];

            for (const entry of codexEntries) {
                // Skip if already has a valid top-level entityId
                if (entry.entityId && entitiesById.has(entry.entityId)) {
                    continue;
                }

                const pathString = JSON.stringify(entry.path_components);
                let entityForThisCodex = null;
                let entityIdForThisCodex = null;

                // Find entity
                const mainStatblock = entry.content?.find(b => b.type === 'statblock' && b.entityId);
                if (entry.entityId && entitiesById.has(entry.entityId)) { // Check top-level first
                    entityForThisCodex = entitiesById.get(entry.entityId);
                    entityIdForThisCodex = entityForThisCodex._id.toString();
                } else if (mainStatblock && entitiesById.has(mainStatblock.entityId)) { // Then check statblock
                    entityForThisCodex = entitiesById.get(mainStatblock.entityId);
                    entityIdForThisCodex = entityForThisCodex._id.toString();
                } else if (entitiesByPath.has(pathString)) { // Then check by path
                    entityForThisCodex = entitiesByPath.get(pathString);
                    entityIdForThisCodex = entityForThisCodex._id.toString();
                }

                // Create if not found
                if (!entityForThisCodex) {
                    // Continue if there is no statblock to parse
                    if (!entry.content?.some(b => b.type === 'statblock')) {
                        continue;
                    }
                    const newEntityId = new ObjectId();
                    entityIdForThisCodex = newEntityId.toString();
                    const name = (entry.path_components[entry.path_components.length - 1] || 'Unknown').replace(/_/g, ' ');
                    const entityData = await parseStatBlockToEntity({ entityId: entityIdForThisCodex }, name, entry.path_components, entry.content);
                    if (entityData) {
                        entitiesToInsert.push({ ...entityData, _id: newEntityId });
                        createdCount++;
                    }
                }

                // If we have an entityId, update the codex entry
                if (entityIdForThisCodex) {
                    // Clean up content: remove all statblocks
                    const newContent = entry.content.filter(block => block.type !== 'statblock');
                    
                    // Check if update is needed
                    if (entry.entityId !== entityIdForThisCodex || JSON.stringify(entry.content) !== JSON.stringify(newContent)) {
                        bulkCodexUpdates.push({
                            updateOne: {
                                filter: { _id: entry._id },
                                update: { 
                                    $set: { 
                                        entityId: entityIdForThisCodex,
                                        content: newContent 
                                    } 
                                }
                            }
                        });
                        linkedCount++;
                    }
                }
            }

            if (bulkCodexUpdates.length > 0) {
                console.log(`[CREATE MISSING ENTITIES] Updating ${bulkCodexUpdates.length} codex entries.`);
                await db.collection('codex_entries').bulkWrite(bulkCodexUpdates);
            }
            if (entitiesToInsert.length > 0) {
                console.log(`[CREATE MISSING ENTITIES] Creating ${entitiesToInsert.length} new entities.`);
                await db.collection('entities_pf1e').insertMany(entitiesToInsert);
            }

            res.status(200).json({ message: `Entity creation and linking complete. Created ${createdCount} entities, linked ${linkedCount} codex entries.` });

        } catch (e) {
            console.error('[CREATE MISSING ENTITIES] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 7: GET DATA INTEGRITY STATUS
    // -------------------------------------------------------------
    router.get('/status', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[DATA INTEGRITY STATUS] Job started.`);

        try {
            const codexEntries = await db.collection('codex_entries').find({}).toArray();
            if (!codexEntries || codexEntries.length === 0) return res.status(404).json({ error: 'Codex entries not found.' });

            // 1. Get unlinked statblocks
            const statblocksInCodex = [];
            codexEntries.forEach(entry => {
                if (entry.content && Array.isArray(entry.content)) {
                    entry.content.forEach(block => {
                        if (block.type === 'statblock' && block.entityId) {
                            statblocksInCodex.push({ entityId: block.entityId, path: entry.path_components });
                        }
                    });
                }
            });
            const allEntityIds = new Set((await db.collection('entities_pf1e').find({}, { projection: { _id: 1 } }).toArray()).map(e => e._id.toString()));
            const unlinkedStatblocks = statblocksInCodex.filter(sb => !allEntityIds.has(sb.entityId));

            // 2. Get orphaned entities and broken links
            const validEntityIds = new Set(statblocksInCodex.map(sb => sb.entityId));
            const allDbEntities = await db.collection('entities_pf1e').find({}, { projection: { _id: 1, name: 1 } }).toArray();
            const orphanedEntities = allDbEntities.filter(ent => !validEntityIds.has(ent._id.toString()));

            const entitiesToKeepIds = allDbEntities.filter(ent => validEntityIds.has(ent._id.toString())).map(e => e._id);
            const entitiesToCheck = await db.collection('entities_pf1e').find({ _id: { $in: entitiesToKeepIds } }).toArray();

            const allRuleIds = new Set((await db.collection('rules_pf1e').find({}, { projection: { _id: 1 } }).toArray()).map(r => r._id.toString()));
            const allEquipmentIds = new Set((await db.collection('equipment_pf1e').find({}, { projection: { _id: 1 } }).toArray()).map(e => e._id.toString()));

            let brokenRuleLinks = 0;
            let brokenEquipmentLinks = 0;

            for (const entity of entitiesToCheck) {
                for (const ruleId of (entity.rules || [])) {
                    if (!allRuleIds.has(ruleId)) {
                        brokenRuleLinks++;
                    }
                }
                for (const equipId of (entity.equipment || [])) {
                    if (!allEquipmentIds.has(equipId)) {
                        brokenEquipmentLinks++;
                    }
                }
            }

            res.status(200).json({
                unlinkedStatblocks: unlinkedStatblocks.length,
                orphanedEntities: orphanedEntities.length,
                brokenRuleLinks,
                brokenEquipmentLinks,
            });

        } catch (e) {
            console.error('[DATA INTEGRITY STATUS] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred.' });
        }
    });


    // -------------------------------------------------------------
    // ROUTE 8: SMART SPELL LINKER
    // -------------------------------------------------------------
    router.post('/smart-spell-link', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[SMART SPELL LINK] Job started.`);

        try {
            const apiKey = await getActiveApiKey();

            async function fetchFromGemini(prompt) {
                // FIX: Use the reliable Gemini 1.5 Flash model for reliability
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                const body = { contents: [{ parts: [{ text: prompt }] }] };
                const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (!r.ok) throw new Error(`Gemini request failed with status: ${r.status} ${r.statusText}`);
                const json = await r.json();
                const responseText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
                
                // FIX: Robust JSON parsing
                const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
                const jsonString = jsonMatch ? jsonMatch[1] : responseText.trim();
                return jsonString;
            }

            const allSpells = await db.collection('spells_pf1e').find({}).toArray();
            const entities = await db.collection('entities_pf1e').find({ 'baseStats.caster_level': { $gt: 0 } }).toArray();
            let updatedCount = 0;

            for (const entity of entities) {
                const casterLevel = entity.baseStats.caster_level;
                const casterClass = entity.baseStats.caster_class; // Assuming this field exists
                const castingStat = 'Int'; // Assuming Int for now, this should be derived from class
                const castingScore = entity.baseStats[castingStat.toLowerCase()];

                if (!casterClass) continue;

                const prompt = `You are a Pathfinder 1st Edition Game Master. For a ${casterClass} of level ${casterLevel} with a casting score of ${castingScore}, select a thematic and effective list of prepared spells for one day.\n- You must select from the provided list of available spells only.\n- Return your selection as a single, valid JSON object where keys are the spell levels (e.g., "0", "1", "2") and values are arrays of the chosen spell names.\n\nAvailable spells: ${JSON.stringify(allSpells.map(s => s.name))}`;

                const jsonString = await fetchFromGemini(prompt);
                const selectedSpells = JSON.parse(jsonString);

                const spellLinks = {};
                for (const level in selectedSpells) {
                    const spellNames = selectedSpells[level];
                    const spellDocs = await db.collection('spells_pf1e').find({ name: { $in: spellNames } }).project({ _id: 1 }).toArray();
                    spellLinks[level] = spellDocs.map(d => d._id.toString());
                }

                await db.collection('entities_pf1e').updateOne({ _id: entity._id }, { $set: { spells: spellLinks } });
                updatedCount++;
                console.log(`[SMART SPELL LINK] Updated spells for ${entity.name}`);
            }

            res.status(200).json({ message: `Smart spell linking complete. Updated ${updatedCount} entities.` });

        } catch (e) {
            console.error('[SMART SPELL LINK] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during smart spell linking.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 9: ITEM PREFIX NORMALIZATION
    // -------------------------------------------------------------
    router.post('/prefix-normalization', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[PREFIX NORMALIZATION] Job started.`);

        try {
            const idMigrationMap = new Map();
            const finalEquipmentData = new Map();

            // 1. Ingest magic items
            const magicItemsSnapshot = await db.collection('magic_items_pf1e').find({}).toArray();
            magicItemsSnapshot.forEach(doc => {
                if (doc.name) {
                    const correctId = `eq_${doc.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                    finalEquipmentData.set(correctId, { ...doc, _id: correctId });
                    idMigrationMap.set(doc._id.toString(), correctId);
                }
            });
            console.log(`[PREFIX NORMALIZATION] Ingested ${magicItemsSnapshot.length} magic items.`);

            // 2. Ingest equipment items, overwriting magic items with the same name
            const equipmentSnapshot = await db.collection('equipment_pf1e').find({}).toArray();
            equipmentSnapshot.forEach(doc => {
                if (doc.name) {
                    const correctId = `eq_${doc.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                    finalEquipmentData.set(correctId, { ...doc, _id: correctId });
                    if (doc._id.toString() !== correctId) {
                        idMigrationMap.set(doc._id.toString(), correctId);
                    }
                }
            });
            console.log(`[PREFIX NORMALIZATION] Ingested and reconciled ${equipmentSnapshot.length} equipment items. Final count: ${finalEquipmentData.size}.`);

            // 3. Clear old collections and write the new one
            await db.collection('magic_items_pf1e').deleteMany({});
            await db.collection('equipment_pf1e').deleteMany({});
            if (finalEquipmentData.size > 0) {
                await db.collection('equipment_pf1e').insertMany(Array.from(finalEquipmentData.values()));
            }
            console.log(`[PREFIX NORMALIZATION] Wrote ${finalEquipmentData.size} normalized items to equipment_pf1e.`);

            // 4. Update entity references
            const entitiesSnapshot = await db.collection('entities_pf1e').find({}).toArray();
            let entitiesUpdatedCount = 0;
            for (const entityDoc of entitiesSnapshot) {
                let changed = false;
                const oldItemIds = new Set([...(entityDoc.equipment || []), ...(entityDoc.magicItems || [])]);
                const newItemIds = new Set();
                oldItemIds.forEach(oldId => {
                    newItemIds.add(idMigrationMap.get(oldId.toString()) || oldId.toString());
                });

                const finalEquipmentList = Array.from(newItemIds);
                const originalEquipmentList = entityDoc.equipment || [];

                if (finalEquipmentList.length !== originalEquipmentList.length || 
                    !finalEquipmentList.every(id => originalEquipmentList.includes(id)) || 
                    (entityDoc.magicItems && entityDoc.magicItems.length > 0)) {
                    changed = true;
                }

                if (changed) {
                    await db.collection('entities_pf1e').updateOne(
                        { _id: entityDoc._id },
                        { $set: { equipment: finalEquipmentList, magicItems: [] } }
                    );
                    entitiesUpdatedCount++;
                }
            }
            console.log(`[PREFIX NORMALIZATION] Updated item references in ${entitiesUpdatedCount} entities.`);

            res.status(200).json({ message: `Prefix normalization complete. ${finalEquipmentData.size} items normalized, ${entitiesUpdatedCount} entities updated.` });

        } catch (e) {
            console.error('[PREFIX NORMALIZATION] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during prefix normalization.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 10: SCAN FOR DUPLICATES
    // -------------------------------------------------------------
    router.post('/scan-for-duplicates', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[SCAN FOR DUPLICATES] Job started.`);

        try {
            const results = {
                duplicateContent: [],
                duplicateEntities: [],
                duplicateRules: [],
                duplicateEquipment: [],
                duplicateSpells: [],
                duplicateDeities: [],
                duplicateHazards: [],
            };

            // 1. Scan for duplicate content in the codex
            const codexEntries = await db.collection('codex_entries').find({}).toArray();
            if (codexEntries && codexEntries.length > 0) {
                const contentMap = new Map();
                codexEntries.forEach(entry => {
                    if (entry.content && Array.isArray(entry.content)) {
                        const contentKey = JSON.stringify(entry.content);
                        if (!contentMap.has(contentKey)) {
                            contentMap.set(contentKey, []);
                        }
                        contentMap.get(contentKey).push(entry.path_components);
                    }
                });
                for (const [content, paths] of contentMap.entries()) {
                    if (paths.length > 1) {
                        results.duplicateContent.push({ contentPreview: content.substring(0, 150) + (content.length > 150 ? '...' : ''), paths });
                    }
                }
            }

            // 2. Scan for duplicates by name in collections
            async function scanCollectionForDuplicatesByName(collectionName, resultKey) {
                const nameMap = new Map();
                const cursor = db.collection(collectionName).find({});
                await cursor.forEach(doc => {
                    if (doc.name) {
                        if (!nameMap.has(doc.name)) {
                            nameMap.set(doc.name, []);
                        }
                        nameMap.get(doc.name).push(doc._id.toString());
                    }
                });

                for (const [name, docIds] of nameMap.entries()) {
                    if (docIds.length > 1) {
                        results[resultKey].push({ name, docIds });
                    }
                }
            }

            await scanCollectionForDuplicatesByName('entities_pf1e', 'duplicateEntities');
            await scanCollectionForDuplicatesByName('rules_pf1e', 'duplicateRules');
            await scanCollectionForDuplicatesByName('equipment_pf1e', 'duplicateEquipment');
            await scanCollectionForDuplicatesByName('spells_pf1e', 'duplicateSpells');
            await scanCollectionForDuplicatesByName('deities_pf1e', 'duplicateDeities');
            await scanCollectionForDuplicatesByName('hazards_pf1e', 'duplicateHazards');

            res.status(200).json(results);

        } catch (e) {
            console.error('[SCAN FOR DUPLICATES] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during duplicate scan.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 11: RECONCILE ITEMS, SPELLS, DEITIES, HAZARDS (Generic)
    // -------------------------------------------------------------

    // The following routes now call the fixed reconcileCollection:

    router.post('/reconcile-items', async (req, res) => {
        // Use default batch parameters if not provided in the request body
        const { reconciliationIterations: maxIterations = 5, reconciliationBatchSize: batchSize = 20 } = req.body; 

        try {
            const equipmentAdded = await reconcileCollection('equipment_pf1e', 'equipment', 'eq_', maxIterations, batchSize);
            const magicItemsAdded = await reconcileCollection('magic_items_pf1e', 'magic item', 'mi_', maxIterations, batchSize);
            
            res.status(200).json({ message: `Item reconciliation complete. Added ${equipmentAdded} equipment and ${magicItemsAdded} magic items.` });
        } catch (e) {
            console.error('[RECONCILE ITEMS] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during item reconciliation.' });
        }
    });

    router.post('/reconcile-spells', async (req, res) => {
        const { reconciliationIterations: maxIterations = 5, reconciliationBatchSize: batchSize = 20 } = req.body; 
        
        try {
            const spellsAdded = await reconcileCollection('spells_pf1e', 'spell', 'sp_', maxIterations, batchSize);
            res.status(200).json({ message: `Spell reconciliation complete. Added ${spellsAdded} spells.` });
        } catch (e) {
            console.error('[RECONCILE SPELLS] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during spell reconciliation.' });
        }
    });

    router.post('/reconcile-deities', async (req, res) => {
        const { reconciliationIterations: maxIterations = 5, reconciliationBatchSize: batchSize = 20 } = req.body; 
        
        try {
            const deitiesAdded = await reconcileCollection('deities_pf1e', 'deity', 'de_', maxIterations, batchSize);
            res.status(200).json({ message: `Deity reconciliation complete. Added ${deitiesAdded} deities.` });
        } catch (e) {
            console.error('[RECONCILE DEITIES] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during deity reconciliation.' });
        }
    });

    // FIX: This route was the original source of the error. It now uses the robust logic.
    router.post('/reconcile-hazards', async (req, res) => {
        const { reconciliationIterations: maxIterations = 5, reconciliationBatchSize: batchSize = 20 } = req.body; 

        try {
            const hazardsAdded = await reconcileCollection('hazards_pf1e', 'hazard', 'hz_', maxIterations, batchSize);
            res.status(200).json({ message: `Hazard reconciliation complete. Added ${hazardsAdded} hazards.` });
        } catch (e) {
            console.error('[RECONCILE HAZARDS] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during hazard reconciliation.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 12: RECONCILE RULES
    // -------------------------------------------------------------
    // Note: The logic for reconciling rules is different as it explicitly fetches a list of names first. 
    // We update the Gemini model and add robust parsing here too.
    router.post('/reconcile-rules', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[RECONCILE RULES] Job started.`);

        try {
            const apiKey = await getActiveApiKey();

            async function fetchFromGemini(prompt) {
                // FIX: Use the reliable Gemini 1.5 Flash model
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                const body = { contents: [{ parts: [{ text: prompt }] }] };
                const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (!r.ok) throw new Error(`Gemini request failed with status: ${r.status} ${r.statusText}`);
                const json = await r.json();
                const responseText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
                
                // FIX: Robust JSON parsing
                const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
                const jsonString = jsonMatch ? jsonMatch[1] : responseText.trim();
                return jsonString;
            }

            async function reconcileRuleType(ruleType, idPrefix) {
                console.log(`[RECONCILE RULES] Reconciling ${ruleType}s...`);
                const existingDocs = await db.collection('rules_pf1e').find({ type: ruleType }).project({ name: 1 }).toArray();
                const existingNames = existingDocs.map(d => d.name).filter(Boolean);

                // Step 1: Get list of names
                const prompt = `You are a Pathfinder 1st Edition rules expert. Provide a comprehensive list of all official ${ruleType}s from the Pathfinder Core Rulebook that are NOT in the provided JSON array. The response must be a single, clean JSON array of strings. Example: ["Dodge", "Power Attack"].\n\nExisting ${ruleType} names:\n${JSON.stringify(existingNames)}`;

                const jsonString = await fetchFromGemini(prompt);
                const names = JSON.parse(jsonString);

                if (names.length === 0) {
                    console.log(`[RECONCILE RULES] No new ${ruleType}s to add.`);
                    return 0;
                }

                console.log(`[RECONCILE RULES] Found ${names.length} new ${ruleType}s. Fetching details...`);

                const newRules = [];
                for (const name of names) {
                    // Step 2: Get details for each name
                    const detailPrompt = `You are a Pathfinder 1st Edition rules parser. Provide a JSON object representing the mechanical effects of the ${ruleType}: \"${name}\". The response must be a single, valid JSON object with the following keys: \"name\", \"type\" (which should be \"${ruleType}\"), \"description\", and \"effects\". The \"effects\" key must be an array of objects, where each object has \"target\" (e.g., \"attackRoll\"), \"value\" (a number or string), \"type\" (e.g., \"penalty\"), and an optional \"condition\" string.`;
                    const detailJsonString = await fetchFromGemini(detailPrompt);
                    const ruleData = JSON.parse(detailJsonString);
                    
                    if (ruleData.name) {
                        ruleData._id = `${idPrefix}${ruleData.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                        newRules.push(ruleData);
                    }
                }

                if (newRules.length > 0) {
                    // Use upsert to handle potential conflicts safely
                    const bulkOps = newRules.map(r => ({
                        updateOne: {
                            filter: { _id: r._id },
                            update: { $set: r },
                            upsert: true
                        }
                    }));
                    await db.collection('rules_pf1e').bulkWrite(bulkOps, { ordered: false });
                }
                return newRules.length;
            }

            const featsAdded = await reconcileRuleType('feat', 'feat_');
            const conditionsAdded = await reconcileRuleType('condition', 'cond_');

            res.status(200).json({ message: `Rule reconciliation complete. Added ${featsAdded} feats and ${conditionsAdded} conditions.` });

        } catch (e) {
            console.error('[RECONCILE RULES] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during rule reconciliation.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 16: SCAN AND FIX DATA
    // -------------------------------------------------------------
    router.post('/scan-and-fix-data', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[SCAN AND FIX DATA] Job started.`);

        try {
            const codexEntries = await db.collection('codex_entries').find({}).toArray();
            if (!codexEntries || codexEntries.length === 0) {
                return res.status(404).json({ error: 'Codex entries not found.' });
            }

            let changesMade = 0;
            for (const entry of codexEntries) {
                let changed = false;
                if (entry.content && Array.isArray(entry.content)) {
                    const newContent = entry.content.map(block => {
                        if (block.type === 'table' && Array.isArray(block.rows)) {
                            const newRows = block.rows.map(row => {
                                if (Array.isArray(row)) {
                                    const rowObj = {};
                                    (block.headers || []).forEach((h, i) => {
                                        const headerKey = h.replace(/\s+/g, '');
                                        rowObj[headerKey] = row[i] ?? null;
                                    });
                                    changed = true;
                                    return rowObj;
                                }
                                return row;
                            });
                            return { ...block, rows: newRows };
                        }
                        return block;
                    });
                    if (changed) {
                        await db.collection('codex_entries').updateOne(
                            { path_components: entry.path_components },
                            { $set: { content: newContent } }
                        );
                        changesMade++;
                    }
                }
            }
            if (changesMade === 0) {
                res.status(200).json({ message: 'Scan complete. No formatting changes were necessary.' });
            } else {
                res.status(200).json({ message: `Successfully scanned and fixed data formatting in ${changesMade} entries.` });
            }

        } catch (e) {
            console.error('[SCAN AND FIX DATA] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during scan and fix.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 13: NORMALIZE STATBLOCKS
    // -------------------------------------------------------------
    router.post('/normalize-statblocks', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[NORMALIZE STATBLOCKS] Job started.`);

        try {
            // Part 1: Normalize statblocks in codex_entries
            const codexEntries = await db.collection('codex_entries').find({}).toArray();
            const bulkOps = [];
            let codexModifiedCount = 0;

            for (const entry of codexEntries) {
                if (!entry.content || !Array.isArray(entry.content)) {
                    continue;
                }

                let hasChanged = false;
                const newContent = entry.content.map(block => {
                    if (block.type === 'statblock' && block.entityId) {
                        // Check if there are any extra keys besides 'type' and 'entityId'
                        const keys = Object.keys(block);
                        if (keys.length > 2 || !keys.includes('type') || !keys.includes('entityId')) {
                            hasChanged = true;
                            return {
                                type: 'statblock',
                                entityId: block.entityId
                            };
                        }
                    }
                    return block;
                });

                if (hasChanged) {
                    codexModifiedCount++;
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: entry._id },
                            update: { $set: { content: newContent } }
                        }
                    });
                }
            }

            if (bulkOps.length > 0) {
                await db.collection('codex_entries').bulkWrite(bulkOps);
            }
            console.log(`[NORMALIZE STATBLOCKS] Scanned ${codexEntries.length} codex entries and normalized ${codexModifiedCount}.`);

            // Part 2: Rename 'stats' to 'baseStats' in entities_pf1e
            const entityUpdateResult = await db.collection('entities_pf1e').updateMany(
                { stats: { $exists: true } },
                { $rename: { stats: 'baseStats' } }
            );

            const entitiesModifiedCount = entityUpdateResult.modifiedCount;
            console.log(`[NORMALIZE STATBLOCKS] Renamed 'stats' to 'baseStats' in ${entitiesModifiedCount} entities.`);

            // Part 3: Ensure all entities have a combat object with bab, cmb, and cmd
            const allEntities = await db.collection('entities_pf1e').find({}).toArray();
            const entityBulkOps = [];
            let entitiesUpdatedCount = 0;
            
            function getHdFromHpString(hp) {
                if (!hp || typeof hp !== 'string') return null;
                const match = hp.match(/\((\d+)d\d+/);
                if (match && match[1]) {
                    return parseInt(match[1], 10);
                }
                return null;
            }

            for (const entity of allEntities) {
                let needsUpdate = false;
                if (!entity.baseStats) {
                    entity.baseStats = {};
                    needsUpdate = true;
                }
                if (!entity.baseStats.combat) {
                    entity.baseStats.combat = { bab: '-', cmb: '-', cmd: '-' };
                    needsUpdate = true;
                }

                const combat = entity.baseStats.combat;
                const baseStats = entity.baseStats;

                // Check if calculation is needed
                if (combat.bab === '-' || combat.cmb === '-' || combat.cmd === '-' || combat.bab === null || combat.cmb === null || combat.cmd === null || typeof combat.bab === 'undefined' || typeof combat.cmb === 'undefined' || typeof combat.cmd === 'undefined') {
                    const strMod = getAbilityModifierAsNumber(baseStats.str);
                    const dexMod = getAbilityModifierAsNumber(baseStats.dex);

                    let level = null;
                    if (baseStats.hp) {
                        level = getHdFromHpString(baseStats.hp);
                    }

                    if (!level && baseStats.level) level = parseInt(baseStats.level, 10);
                    if (!level && baseStats.hd) level = parseInt(baseStats.hd, 10);
                    if (!level || isNaN(level)) level = 1;

                    let calculatedBab = 0;
                    if (combat.bab === '-' || combat.bab === null || typeof combat.bab === 'undefined') {
                        // Assume 3/4 BAB as a generic baseline.
                        calculatedBab = Math.floor(level * 0.75); 
                        combat.bab = calculatedBab;
                        needsUpdate = true;
                    } else {
                        calculatedBab = parseInt(combat.bab, 10) || 0;
                    }

                    if (combat.cmb === '-' || combat.cmb === null || typeof combat.cmb === 'undefined') {
                        // CMB = Base Attack Bonus + Strength Modifier
                        combat.cmb = calculatedBab + strMod;
                        needsUpdate = true;
                    }

                    if (combat.cmd === '-' || combat.cmd === null || typeof combat.cmd === 'undefined') {
                        // CMD = 10 + Base Attack Bonus + Strength Modifier + Dexterity Modifier
                        combat.cmd = 10 + calculatedBab + strMod + dexMod;
                        needsUpdate = true;
                    }
                }


                if (needsUpdate) {
                    entitiesUpdatedCount++;
                    entityBulkOps.push({
                        updateOne: {
                            filter: { _id: entity._id },
                            update: { $set: { baseStats: entity.baseStats } }
                        }
                    });
                }
            }

            if (entityBulkOps.length > 0) {
                await db.collection('entities_pf1e').bulkWrite(entityBulkOps);
            }
            console.log(`[NORMALIZE STATBLOCKS] Ensured and calculated combat stats for ${entitiesUpdatedCount} entities.`);

            res.status(200).json({
                message: `Statblock normalization complete.`,
                codexUpdates: `Scanned ${codexEntries.length} entries and updated ${codexModifiedCount}.`,
                entityUpdates: `Renamed 'stats' to 'baseStats' in ${entitiesModifiedCount} entities and ensured/calculated combat stats on ${entitiesUpdatedCount} entities.`
            });

        } catch (e) {
            console.error('[NORMALIZE STATBLOCKS] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during statblock normalization.' });
        }
    });

    // -------------------------------------------------------------
    // NEW ROUTE: MIGRATE DM TOOLKIT
    // -------------------------------------------------------------
    router.post('/migrate-dm-toolkit', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log(`[MIGRATE DM TOOLKIT] Job started.`);

        try {
            const fightsToMigrate = await db.collection('dm_toolkit_fights').find({ 
                initialCombatants: { $exists: true, $ne: [] } 
            }).toArray();

            if (fightsToMigrate.length === 0) {
                return res.status(200).json({ message: 'No DM Toolkit fights require migration.' });
            }

            let migratedFightsCount = 0;
            let migratedCombatantsCount = 0;

            for (const fight of fightsToMigrate) {
                console.log(`[MIGRATE DM TOOLKIT] Migrating fight: ${fight.name || fight._id}`);
                const combatantsToInsert = fight.initialCombatants.map(c => ({
                    ...c,
                    fightId: fight._id.toString(),
                    initiative: c.initiative || 10,
                    effects: c.effects || [],
                    tempMods: c.tempMods || {},
                    activeFeats: c.activeFeats || []
                }));

                if (combatantsToInsert.length > 0) {
                    await db.collection('dm_toolkit_combatants').insertMany(combatantsToInsert);
                    await db.collection('dm_toolkit_fights').updateOne(
                        { _id: fight._id },
                        { $unset: { initialCombatants: "" } }
                    );
                    migratedFightsCount++;
                    migratedCombatantsCount += combatantsToInsert.length;
                    console.log(`[MIGRATE DM TOOLKIT] Migrated ${combatantsToInsert.length} combatants for fight: ${fight.name || fight._id}`);
                }
            }

            res.status(200).json({ 
                message: `DM Toolkit migration successful. Migrated ${migratedCombatantsCount} combatants across ${migratedFightsCount} fights.` 
            });

        } catch (e) {
            console.error('[MIGRATE DM TOOLKIT] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during DM Toolkit migration.' });
        }
    });

    // -------------------------------------------------------------
    // ROUTE 17: MIGRATE CODEX TO HIERARCHICAL FORMAT
    // -------------------------------------------------------------
    router.post('/migrate-codex', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        const { force = false } = req.body;
        console.log(`[MIGRATE CODEX] Job started. ${force ? '(FORCE RUN)' : ''}`);

        try {
            // 1. Check if migration has already been run
            const newCollectionName = 'codex_entries';
            const newCollection = db.collection(newCollectionName);
            const count = await newCollection.countDocuments();

            if (count > 0 && !force) {
                return res.status(400).json({ message: `Migration already complete. The '${newCollectionName}' collection contains ${count} documents. Use 'force: true' to re-run.` });
            }

            // 2. Fetch the old single-document codex
            const oldCollection = db.collection('codex');
            const codexDoc = await oldCollection.findOne({ _id: 'world_data' });
            if (!codexDoc) {
                return res.status(404).json({ error: 'Original codex document (_id: \'world_data\') not found.' });
            }

            // 3. Recursively traverse and create new documents
            const entries = [];
            function traverse(node, path) {
                if (!node || typeof node !== 'object') return;

                const newEntryData = {};
                const childNodes = {};

                for(const key in node) {
                    if(Object.prototype.hasOwnProperty.call(node, key)) {
                        const value = node[key];
                        // Child nodes are identified as non-null, non-array objects, excluding the 'content' field itself.
                        if(typeof value === 'object' && value !== null && !Array.isArray(value) && key !== 'content') {
                            childNodes[key] = value;
                        } else {
                            newEntryData[key] = value;
                        }
                    }
                }

                // Only add an entry if it has some data or is the root.
                if (Object.keys(newEntryData).length > 0 || path.length === 0) {
                    entries.push({
                        name: path.length > 0 ? path[path.length - 1] : 'Root',
                        path_components: path,
                        ...newEntryData
                    });
                }

                for (const key in childNodes) {
                    traverse(childNodes[key], [...path, key]);
                }
            }

            console.log('[MIGRATE CODEX] Starting traversal of world_data...');
            traverse(codexDoc, []); // Start with an empty path for the root

            if (entries.length === 0) {
                return res.status(500).json({ error: 'No entries were generated from the codex document.' });
            }
            
            console.log(`[MIGRATE CODEX] Traversal complete. Generated ${entries.length} entries.`);

            // 4. Clear the new collection if forcing, and insert new data
            if (force) {
                await newCollection.deleteMany({});
            }
            await newCollection.insertMany(entries);
            console.log(`[MIGRATE CODEX] Successfully inserted ${entries.length} documents into '${newCollectionName}'.`);

            // 5. Rename the old collection to back it up
            try {
                await db.renameCollection('codex', `codex_backup_${Date.now()}`);
                console.log(`[MIGRATE CODEX] Renamed old 'codex' collection to a backup.`);
            } catch (renameError) {
                if (renameError.codeName === 'NamespaceNotFound') {
                     console.log(`[MIGRATE CODEX] Old 'codex' collection not found, skipping rename.`);
                } else {
                    // ignore other errors, like collection already exists
                    console.warn(`[MIGRATE CODEX] Could not rename old 'codex' collection: ${renameError.message}`);
                }
            }

            res.status(200).json({ message: `Codex migration successful. Migrated ${entries.length} documents.` });

        } catch (e) {
            console.error('[MIGRATE CODEX] Fatal error:', e);
            res.status(500).json({ error: e.message || 'An unknown error occurred during codex migration.' });
        }
    });

    return router;
};