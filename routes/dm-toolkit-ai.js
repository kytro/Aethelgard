const express = require('express');
const router = express.Router();
// CHANGE: Import from new aiService
const { generateContent, getAvailableModels } = require('../services/aiService');

module.exports = function (db) {

    router.post('/:type', async (req, res) => {
        const { type } = req.params;
        const { query, model, options, type: bodyType } = req.body;

        if (!db) return res.status(503).json({ error: 'Database not ready' });

        let prompt = '';
        let jsonMode = false;

        // ... (Keep the Switch Case logic exactly the same as before) ...
        switch (type) {
            case 'lookup':
                jsonMode = true;
                if (bodyType === 'effect') {
                    prompt = `Provide the official description and a JSON object of game rule modifiers for the Pathfinder 1st Edition condition or status effect: "${query}".
The modifiers object should use keys for stats (e.g., "AC", "Attack", "Str") and a value that is another object containing 'value' (number) and 'type' (string).
Return JSON object with keys "description" and "modifiers".`;
                } else {
                    return res.status(400).json({ error: `Unknown lookup type: ${bodyType}` });
                }
                break;

            case 'assistant':
                jsonMode = false;
                prompt = `You are a helpful assistant for a Game Master. Answer based ONLY on the provided JSON data context. Question: "${query}"\n\nContext:\n${JSON.stringify(options.codex)}`;
                break;

            case 'generate-npcs':
                jsonMode = true;
                let nameConstraint = '';
                if (options.existingEntityNames?.length > 0) nameConstraint = `Avoid these names: ${options.existingEntityNames.slice(0, 20).join(', ')}.`;
                let worldContext = options.codex ? `Context: ${JSON.stringify(options.codex)}` : '';

                prompt = `You are a Pathfinder 1e NPC generator. ${nameConstraint} ${worldContext}
Based on: "${query}"
Generate a JSON array of NPCs: [{ "name": "...", "race": "...", "type": "...", "class": "...", "level": number, "alignment": "...", "description": "...", "backstory": "..." }]`;
                break;

            case 'generate-npc-details':
                jsonMode = true;
                const npc = options.npc;
                if (!npc || !npc.name) return res.status(400).json({ error: 'NPC data required' });

                prompt = `You are a Pathfinder 1e stat calculator. Generate complete stats for:
Name: ${npc.name}, Race: ${npc.race}, Class: ${npc.class}, Level: ${npc.level}.
${npc.description ? "Desc: " + npc.description : ""}
${npc.description ? "Desc: " + npc.description : ""}
Return a valid JSON object matching the standard stat block format (baseStats, hp, ac, skills, feats, equipment, etc.).
IMPORTANT: 'hp', 'ac', 'bab', 'cmb', 'cmd' must be simple numbers or strings, NOT objects. 'specialAbilities' must be an array of strings.`;
                break;

            default:
                return res.status(404).json({ error: 'Invalid route parameter.' });
        }

        try {
            // Service handles Ollama/Gemini routing
            const response = await generateContent(db, prompt, { model, jsonMode, systemInstruction: "You are a Pathfinder 1e Expert Assistant." });

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

    // Endpoint for frontend model selection (UPDATED)
    router.get('/models', async (req, res) => {
        try {
            // Use unified service
            const allModels = await getAvailableModels(db);
            const generalSettings = await db.collection('settings').findOne({ _id: 'general' });

            res.json({
                models: allModels,
                defaultModel: generalSettings?.default_ai_model
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    return router;
};