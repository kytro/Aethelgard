const express = require('express');
const router = express.Router();

module.exports = function(db) {

    async function fetchFromGemini(apiKey, model, query, type, options = {}) {
        const generalSettings = await db.collection('settings').findOne({ _id: 'general' });
        const defaultModel = generalSettings?.default_ai_model || 'models/gemini-pro';

        // Always use the model from settings, ignore the one from the request.
        const modelId = defaultModel.replace('models/', ''); 
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

        let prompt = '';
        
        // FIX: Added 'lookup' case to handle dynamic term lookups (like effects)
        switch(type) {
            case 'lookup':
                // We expect options.lookupType to be something like 'effect'
                if (options.lookupType === 'effect') {
                     prompt = `Provide the official description and a JSON object of game rule modifiers for the Pathfinder 1st Edition condition or status effect: "${query}".
The modifiers object should use keys for stats (e.g., "AC", "Attack", "Str") and a value that is another object containing 'value' (a number, or string for special cases like speed) and 'type' (a string like 'penalty', 'circumstance', etc.).
Return the entire response as a single, clean JSON object with keys "description" and "modifiers".
For example: {"description": "The creature is blinded...", "modifiers": {"AC": {"value": -2, "type": "penalty"}, "Attack": {"value": -2, "type": "penalty"}, "Speed": {"value": "half", "type": "untyped"}}}`;
                } else {
                    throw new Error(`Unknown lookup type: ${options.lookupType}`);
                }
                break;
            case 'assistant':
                prompt = `You are a helpful assistant for a Game Master. Answer the following question based ONLY on the provided JSON data context. Do not use any outside knowledge. Question: "${query}"\n\nContext:\n${JSON.stringify(options.codex)}`;
                break;
            case 'generate-npcs':
                let nameConstraint = '';
                if (options.existingEntityNames && options.existingEntityNames.length > 0) {
                    const nameList = options.existingEntityNames.join(', ');
                    nameConstraint = `The generated NPCs must have unique first names. Do not use a first name that is part of any of the following existing names: ${nameList}.`;
                }
                prompt = `You are a fantasy world generator for a Pathfinder 1st Edition campaign. Based on the following context, generate NPCs for the user's request. ${nameConstraint} Respond ONLY with a valid JSON array of objects.
Each object must have:
- "name", "race", "gender", "alignment" (e.g., "Chaotic Neutral"), "deity" (optional), "description", "backstory", "class" (e.g., "Fighter"), "level" (number).
- "hitDice" (e.g., "d10" - appropriate for their class).
- "baseAttackBonus" (number - appropriate for their class/level).
- "baseStats": object with EXACT keys: "Str", "Dex", "Con", "Int", "Wis", "Cha" (values 3-20).
- "skills": object where keys are skill names and values are total bonuses (number).
- "feats": array of strings (standard PF1e feat names).
- "specialAbilities": array of strings (class features or racial traits).
- "equipment": array of strings (mundane gear).
- "magicItems": array of strings (magic gear).
- "spells": object where keys are spell levels ("0", "1", etc.) and values are arrays of spell names.
- "spellSlots": object where keys are spell levels and values are the number of slots (optional).
- "cmb": number (optional).
- "cmd": number (optional).
- "dr": string, e.g., "5/magic" (optional).
- "sr": number (optional).
- "resist": string, e.g., "fire 10, cold 5" (optional).
- "immune": string, e.g., "poison, disease" (optional).
Ensure all fields are present, even if empty.
\n\nUser Request: "${query}"\n\nContext:\n${JSON.stringify(options.codex)}`;
                break;
            case 'creature':
                prompt = `Find up to 5 Pathfinder 1st Edition creatures matching "${query}". They should be suitable for a party of ${options.pcCount} characters of level ${options.pcLevel}. Respond ONLY with a valid JSON array of objects. Each object must have "name", "cr", "hp", and "baseStats" (as a string like "Str 12, Dex 14...").`;
                break;
        }

        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorBody = await response.json();
            const errorMessage = errorBody.error?.message || 'Unknown Gemini API Error';
            throw new Error(`Gemini API Error: ${errorMessage}`);
        }
        
        const result = await response.json();
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (type === 'assistant') {
            return { response: responseText };
        } else {
            try {
                const jsonStart = responseText.indexOf('```json');
                const jsonEnd = responseText.lastIndexOf('```');
                if (jsonStart !== -1 && jsonEnd > jsonStart) {
                    const jsonString = responseText.substring(jsonStart + 7, jsonEnd).trim();
                    return JSON.parse(jsonString);
                } else {
                    return JSON.parse(responseText.trim());
                }
            } catch (e) {
                console.error('Failed to parse JSON from Gemini response:', responseText);
                throw new Error('Invalid JSON response from AI.');
            }
        }
    }

    router.get('/models', async (req, res) => {
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
                throw new Error('Failed to fetch models from Gemini API.');
            }

            const data = await response.json();
            
            const filteredModels = data.models
                .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name);

            const generalSettings = await db.collection('settings').findOne({ _id: 'general' });
            const defaultModel = generalSettings?.default_ai_model || 'models/gemini-pro';

            res.json({
                models: filteredModels,
                defaultModel: defaultModel
            });

        } catch (error) {
            console.error('[AI Toolkit Error - listModels]:', error);
            res.status(500).json({ error: error.message });
        }
    });


    router.post('/:type', async (req, res) => {
        const { type } = req.params;
        const { query, model, options, type: bodyType } = req.body;

        try {
            const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
            const activeKeyId = apiKeysDoc?.active_key_id;
            const activeKey = apiKeysDoc?.keys?.find(k => k.id === activeKeyId);
            const apiKey = activeKey?.key;
            if (!apiKey) {
                return res.status(500).json({ error: 'Gemini API key not found in database.' });
            }

            const finalOptions = { ...options, lookupType: bodyType };
            
            const response = await fetchFromGemini(apiKey, model, query, type, finalOptions);
            
            res.json(response);

        } catch (error) {
            console.error(`[AI Toolkit Error - ${type}]:`, error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};
