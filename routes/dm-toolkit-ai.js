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
                    nameConstraint = `Avoid these existing names: ${options.existingEntityNames.slice(0, 20).join(', ')}.`;
                }

                // Build condensed world context
                let worldContext = '';
                if (options.codex) {
                    const ctx = options.codex;
                    if (ctx.targetPath) worldContext += `Location: ${ctx.targetPath}. `;
                    if (ctx.userContext) worldContext += `Context: ${ctx.userContext}. `;
                }

                // PHASE 1: Generate basic identity for each NPC
                const phase1Prompt = `You are a Pathfinder 1e NPC generator. ${nameConstraint}

${worldContext}

Based on this request: "${query}"

Generate a JSON array of NPCs with ONLY these identity fields:
[{
  "name": "string",
  "race": "string (Human, Elf, Dragon, etc.)",
  "type": "string (NPC, Monster, Dragon, Outsider, Undead, etc.)",
  "gender": "string",
  "size": "string (Fine, Diminutive, Tiny, Small, Medium, Large, Huge, Gargantuan, Colossal)",
  "class": "string (Fighter, Wizard, Dragon, etc. - for monsters use type)",
  "level": "number (HD/CR for monsters)",
  "alignment": "string (Lawful Good, Chaotic Evil, etc.)",
  "description": "string (brief physical description)",
  "backstory": "string (brief background)"
}]

Respond with ONLY a valid JSON array.`;

                let phase1Result;
                try {
                    phase1Result = await generateContent(db, phase1Prompt, { model, jsonMode: true });
                    if (!Array.isArray(phase1Result)) phase1Result = [phase1Result];
                    console.log('[NPC Gen] Phase 1 complete:', phase1Result.length, 'NPCs');
                } catch (e) {
                    console.error('[NPC Gen] Phase 1 failed:', e);
                    throw new Error('Failed to generate NPC identities: ' + e.message);
                }

                // Short delay between phases
                await new Promise(resolve => setTimeout(resolve, 500));

                // PHASE 2: Generate ability scores and combat stats for each NPC
                const phase2Prompt = `You are a Pathfinder 1e stat calculator. For these NPCs, generate their ability scores and combat statistics:

${JSON.stringify(phase1Result.map(n => ({ name: n.name, race: n.race, type: n.type, class: n.class, level: n.level, size: n.size })))}

For EACH NPC, calculate accurate PF1e stats:
[{
  "name": "string (must match above)",
  "baseStats": { "Str": number, "Dex": number, "Con": number, "Int": number, "Wis": number, "Cha": number },
  "hp": "string like '45 (6d10+12)' - calculate: HD × (die avg + Con mod)",
  "ac": number,
  "acTouch": number,
  "acFlatFooted": number,
  "bab": number,
  "cmb": number,
  "cmd": number,
  "hitDice": "string like 'd10'",
  "fortSave": number,
  "refSave": number,
  "willSave": number,
  "dr": "string like '10/magic' or '-'",
  "sr": "number or null",
  "resist": "string like 'fire 10' or '-'",
  "immune": "string like 'fire, sleep' or '-'"
}]

Rules: Dragons get high Str/Con/Cha, d12 HD, natural armor, often DR/SR. Fighters get full BAB. Wizards get 1/2 BAB.
Respond with ONLY a valid JSON array.`;

                let phase2Result;
                try {
                    phase2Result = await generateContent(db, phase2Prompt, { model, jsonMode: true });
                    if (!Array.isArray(phase2Result)) phase2Result = [phase2Result];
                    console.log('[NPC Gen] Phase 2 complete');
                } catch (e) {
                    console.error('[NPC Gen] Phase 2 failed:', e);
                    // Continue with defaults if phase 2 fails
                    phase2Result = [];
                }

                await new Promise(resolve => setTimeout(resolve, 500));

                // PHASE 3: Generate skills, feats, abilities, and gear
                const phase3Prompt = `You are a Pathfinder 1e ability/gear expert. For these NPCs, generate their skills, feats, abilities, and equipment:

${JSON.stringify(phase1Result.map(n => ({ name: n.name, class: n.class, level: n.level, type: n.type })))}

For EACH NPC:
[{
  "name": "string (must match above)",
  "skills": { "Perception": number, "Stealth": number, etc. - include class skills with proper bonuses },
  "feats": ["Feat Name", "Another Feat"],
  "specialAbilities": ["Breath Weapon", "Darkvision 60 ft.", etc.],
  "equipment": ["Longsword", "Chain mail", etc.],
  "magicItems": ["Ring of Protection +1", etc.],
  "spells": { "0": ["Detect Magic"], "1": ["Magic Missile"] } OR null if non-caster,
  "spellSlots": { "0": 4, "1": 3 } OR null if non-caster
}]

Respond with ONLY a valid JSON array.`;

                let phase3Result;
                try {
                    phase3Result = await generateContent(db, phase3Prompt, { model, jsonMode: true });
                    if (!Array.isArray(phase3Result)) phase3Result = [phase3Result];
                    console.log('[NPC Gen] Phase 3 complete');
                } catch (e) {
                    console.error('[NPC Gen] Phase 3 failed:', e);
                    phase3Result = [];
                }

                // SYNTHESIZE: Merge all phases into complete NPCs
                const synthesizedNpcs = phase1Result.map(npc => {
                    const stats = phase2Result.find(s => s.name === npc.name) || {};
                    const abilities = phase3Result.find(a => a.name === npc.name) || {};

                    return {
                        // Phase 1: Identity
                        name: npc.name,
                        race: npc.race,
                        type: npc.type,
                        gender: npc.gender,
                        size: npc.size,
                        class: npc.class,
                        level: npc.level,
                        alignment: npc.alignment,
                        description: npc.description,
                        backstory: npc.backstory,

                        // Phase 2: Stats
                        baseStats: stats.baseStats || { Str: 10, Dex: 10, Con: 10, Int: 10, Wis: 10, Cha: 10 },
                        hp: stats.hp || `${npc.level || 1} (${npc.level || 1}d8)`,
                        ac: stats.ac || 10,
                        acTouch: stats.acTouch || 10,
                        acFlatFooted: stats.acFlatFooted || 10,
                        bab: stats.bab || 0,
                        cmb: stats.cmb || 0,
                        cmd: stats.cmd || 10,
                        hitDice: stats.hitDice || 'd8',
                        fortSave: stats.fortSave || 0,
                        refSave: stats.refSave || 0,
                        willSave: stats.willSave || 0,
                        dr: stats.dr || '-',
                        sr: stats.sr || null,
                        resist: stats.resist || '-',
                        immune: stats.immune || '-',

                        // Phase 3: Abilities & Gear
                        skills: abilities.skills || {},
                        feats: abilities.feats || [],
                        specialAbilities: abilities.specialAbilities || [],
                        equipment: abilities.equipment || [],
                        magicItems: abilities.magicItems || [],
                        spells: abilities.spells || null,
                        spellSlots: abilities.spellSlots || null
                    };
                });

                console.log('[NPC Gen] Synthesis complete:', synthesizedNpcs.length, 'NPCs');
                return res.json(synthesizedNpcs);

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