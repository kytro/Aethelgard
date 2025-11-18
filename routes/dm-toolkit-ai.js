const express = require('express');
const router = express.Router();
const { generateContent } = require('../services/geminiService');

module.exports = function(db) {

    router.post('/:type', async (req, res) => {
        const { type } = req.params;
        const { query, model, options, type: bodyType } = req.body;

        if (!db) return res.status(503).json({ error: 'Database not ready' });

        let prompt = '';
        let jsonMode = false;

        switch(type) {
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
                // FULL PROMPT RESTORED
                prompt = `You are a fantasy world generator for a Pathfinder 1st Edition campaign. Based on the following context, generate NPCs for the user's request. ${nameConstraint} Respond ONLY with a valid JSON array of objects. Each object must have:

"name", "race", "gender", "alignment" (e.g., "Chaotic Neutral"), "deity" (optional), "description", "backstory", "class" (e.g., "Fighter"), "level" (number).
"hitDice" (e.g., "d10" - appropriate for their class).
"baseAttackBonus" (number - appropriate for their class/level).
"baseStats": object with Str, Dex, Con, Int, Wis, Cha (values 3-18).
"skills": object where keys are skill names and values are total bonuses (number).
"feats": array of strings (standard PF1e feat names).
"specialAbilities": array of strings (class features or racial traits).
"equipment": array of strings (mundane gear).
"magicItems": array of strings (magic gear).
"spells": object where keys are spell levels ("0", "1", etc.) and values are arrays of spell names. Ensure all fields are present, even if empty.
\n\nUser Request: "${query}"\n\nContext:\n${JSON.stringify(options.codex)}`;
                break;

            case 'creature':
                jsonMode = true;
                prompt = `Find up to 5 Pathfinder 1st Edition creatures matching "${query}". They should be suitable for a party of ${options.pcCount} characters of level ${options.pcLevel}. Respond ONLY with a valid JSON array of objects. Each object must have "name", "cr", "hp", and "baseStats" (as a string like "Str 12, Dex 14...").`;
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