const express = require('express');
const router = express.Router();
const { generateContent } = require('../services/geminiService');

module.exports = function (db) {

    router.post('/:type', async (req, res) => {
        const { type } = req.params;
        const { query, model, options, type: bodyType } = req.body;

        if (!db) return res.status(503).json({ error: 'Database not ready' });

        let prompt = '';
        let jsonMode = false;

        switch (type) {
            case 'lookup':
                jsonMode = true;
                if (bodyType === 'effect') {
                    prompt = `Provide the official description and a JSON object of game rule modifiers for the Pathfinder 1st Edition condition or status effect: "${query}".
The modifiers object should use keys for stats (e.g., "AC", "Attack", "Str") and a value that is another object containing 'value' (a number, or string for special cases like speed) and 'type' (a string like 'penalty', 'circumstance', etc.).
Return the entire response as a single, clean JSON object with keys "description" and "modifiers".
For example: {"description": "The creature is blinded...", "modifiers": {"AC": {"value": -2, "type": "penalty"}, "Attack": {"value": -2, "type": "penalty"}, "Speed": {"value": "half", "type": "untyped"}}}`;
                } else {
                    return res.status(400).json({ error: `Unknown lookup type: ${bodyType}` });
                }
                break;

            case 'assistant':
                // Assistant returns plain text, not JSON
                jsonMode = false;
                prompt = `You are a helpful assistant for a Game Master. Answer the following question based ONLY on the provided JSON data context. Do not use any outside knowledge. Question: "${query}"\n\nContext:\n${JSON.stringify(options.codex)}`;
                break;

            case 'generate-npcs':
                jsonMode = true;
                let nameConstraint = '';
                if (options.existingEntityNames && options.existingEntityNames.length > 0) {
                    nameConstraint = `The generated NPCs must have unique first names. Do not use a first name that is part of any of the following existing names: ${options.existingEntityNames.join(', ')}.`;
                }

                // Build world context summary for the prompt
                let worldContextSection = '';
                if (options.codex) {
                    const ctx = options.codex;
                    if (ctx.targetPath) {
                        worldContextSection += `\n--- TARGET LOCATION ---\nThese NPCs will be placed at: "${ctx.targetPath}". Make them appropriate for this location.\n`;
                    }
                    if (ctx.userContext) {
                        worldContextSection += `\n--- USER CONTEXT ---\n${ctx.userContext}\n`;
                    }
                    if (ctx.places) {
                        worldContextSection += `\n--- WORLD PLACES ---\n${JSON.stringify(ctx.places, null, 2)}\n`;
                    }
                    if (ctx.factions || ctx.organizations) {
                        worldContextSection += `\n--- FACTIONS & ORGANIZATIONS ---\n${JSON.stringify(ctx.factions || ctx.organizations, null, 2)}\n`;
                    }
                    if (ctx.religions || ctx.deities) {
                        worldContextSection += `\n--- RELIGIONS & DEITIES ---\n${JSON.stringify(ctx.religions || ctx.deities, null, 2)}\n`;
                    }
                    if (ctx.history || ctx.lore) {
                        worldContextSection += `\n--- WORLD HISTORY & LORE ---\n${JSON.stringify(ctx.history || ctx.lore, null, 2)}\n`;
                    }
                }

                prompt = `You are a fantasy world generator for a Pathfinder 1st Edition campaign. Generate NPCs that fit naturally within the established world lore and the specified location. ${nameConstraint}

Use the WORLD CONTEXT below to ensure NPCs have appropriate:
- Names that fit the local culture/region
- Alignments and deities that match local religions
- Affiliations with relevant factions or organizations  
- Backstories that reference world events or locations

Respond ONLY with a valid JSON array of objects. Each object must have:

"name", "race", "gender", "size" (e.g., "Small", "Medium", "Large" - based on race), "alignment" (e.g., "Chaotic Neutral"), "deity" (optional, from world religions if appropriate), "description", "backstory" (reference world lore where appropriate), "class" (e.g., "Fighter"), "level" (number).
"hitDice" (e.g., "d10" - appropriate for their class).
"bab" (Base Attack Bonus - number, calculate based on class and level: full BAB classes like Fighter get level, 3/4 BAB like Cleric get level*0.75, 1/2 BAB like Wizard get level*0.5).
"cmb" (Combat Maneuver Bonus - number, calculate as BAB + Str modifier + size modifier).
"cmd" (Combat Maneuver Defense - number, calculate as 10 + BAB + Str modifier + Dex modifier + size modifier).
"baseStats": object with Str, Dex, Con, Int, Wis, Cha (values 3-18).
"skills": object where keys are skill names and values are total bonuses (number).
"feats": array of strings (standard PF1e feat names).
"specialAbilities": array of strings (class features or racial traits).
"equipment": array of strings (mundane gear).
"magicItems": array of strings (magic gear).
"spells": object where keys are spell levels ("0", "1", etc.) and values are arrays of spell names. ONLY include this field if the character's class grants spellcasting. ONLY include spell levels the character can currently cast based on their class and level.
"spellSlots": object where keys are spell levels ("1", "2", etc.) and values are the number of slots per day. ONLY include this field if the character's class grants spellcasting.

--- USER REQUEST ---
"${query}"
${worldContextSection}`;
                break;

            default:
                return res.status(404).json({ error: 'Invalid route parameter.' });
        }

        try {
            const response = await generateContent(db, prompt, { model, jsonMode });

            // If type is assistant, wrap it in { response: text } to match frontend expectation
            if (type === 'assistant') {
                res.json({ response: response });
            } else {
                res.json(response);
            }
        } catch (error) {
            console.error(`[AI Toolkit Error - ${type}]:`, error);
            res.status(500).json({ error: error.message });
        }
    });

    // Endpoint for frontend model selection
    router.get('/models', async (req, res) => {
        try {
            const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
            const activeKey = apiKeysDoc?.keys?.find(k => k.id === apiKeysDoc.active_key_id);

            if (!activeKey?.key) return res.status(500).json({ error: 'No API key' });

            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${activeKey.key}`);
            const data = await resp.json();
            const filtered = (data.models || [])
                .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name);

            const generalSettings = await db.collection('settings').findOne({ _id: 'general' });
            res.json({ models: filtered, defaultModel: generalSettings?.default_ai_model });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    return router;
};