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
                // QUICK GENERATION: Only basic identity for all NPCs in one call
                jsonMode = true;
                let nameConstraint = '';
                if (options.existingEntityNames && options.existingEntityNames.length > 0) {
                    nameConstraint = `Avoid these existing names: ${options.existingEntityNames.slice(0, 20).join(', ')}.`;
                }

                let worldContext = '';
                if (options.codex) {
                    const ctx = options.codex;
                    if (ctx.targetPath) worldContext += `Location: ${ctx.targetPath}. `;
                    if (ctx.userContext) worldContext += `Context: ${ctx.userContext}. `;
                }

                prompt = `You are a Pathfinder 1e NPC generator. ${nameConstraint}

${worldContext}

Based on this request: "${query}"

Generate a JSON array of NPCs with these identity fields:
[{
  "name": "string",
  "race": "string (Human, Elf, Dragon, etc.)",
  "type": "string (NPC, Monster, Dragon, Outsider, Undead, etc.)",
  "gender": "string",
  "size": "string (Fine, Diminutive, Tiny, Small, Medium, Large, Huge, Gargantuan, Colossal)",
  "class": "string (Fighter, Wizard, Dragon, etc. - for monsters use type)",
  "level": number (HD/CR for monsters),
  "alignment": "string (Lawful Good, Chaotic Evil, etc.)",
  "description": "string (brief physical description)",
  "backstory": "string (brief background)"
}]

Respond with ONLY a valid JSON array.`;
                break;

            case 'generate-npc-details':
                // ON-DEMAND: Generate detailed stats for a single NPC
                jsonMode = true;
                const npc = options.npc;
                if (!npc || !npc.name) {
                    return res.status(400).json({ error: 'NPC data required' });
                }

                prompt = `You are a Pathfinder 1e stat calculator. Generate complete stats for this NPC:

Name: ${npc.name}
Race: ${npc.race || 'Human'}
Type: ${npc.type || 'NPC'}
Class: ${npc.class || 'Commoner'}
Level/CR: ${npc.level || 1}
Size: ${npc.size || 'Medium'}
Gender: ${npc.gender || 'Not specified'}
Alignment: ${npc.alignment || 'Neutral'}
Deity: ${npc.deity || 'None'}

Context:
Description: "${npc.description || ''}"
Backstory: "${npc.backstory || ''}"

Important: Incorporate specific details from the description and backstory (such as domains, prepared spells, signature items, or physical traits) into the generated stats. For example, if the description mentions a mechanical arm, include it in equipment or special abilities. If it mentions specific spells, include them. If deity/domains are implied, use them.

Generate accurate PF1e stats. Return a JSON object:
{
  "baseStats": { "Str": number, "Dex": number, "Con": number, "Int": number, "Wis": number, "Cha": number },
  "hp": "string like '45 (6d10+12)' - calculate properly based on HD and Con",
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
  "dr": "string like '10/magic' or null",
  "sr": number or null,
  "resist": "string like 'fire 10' or null",
  "immune": "string like 'fire, sleep' or null",
  "skills": { "Perception": number, "Stealth": number, etc. },
  "classSkills": ["Perception", "Stealth", "Climb"] - list of class skill names,
  "feats": ["Feat Name", "Another Feat"],
  "specialAbilities": ["Ability 1", "Ability 2"],
  "equipment": [
    { 
      "name": "Longsword", 
      "type": "weapon", 
      "weight": 4,
      "properties": { "damage_m": "1d8", "critical": "19-20/x2", "range": null }
    },
    {
      "name": "Full Plate",
      "type": "armor",
      "weight": 50,
      "maxDex": 1,
      "checkPenalty": -6,
      "armorBonus": 9
    },
    {
      "name": "Heavy Shield",
      "type": "shield", 
      "weight": 15,
      "shieldBonus": 2,
      "checkPenalty": -2
    }
  ],
  "magicItems": [
    {
      "name": "Ring of Protection +1",
      "type": "ring",
      "deflectionBonus": 1
    },
    {
      "name": "+1 Longsword",
      "type": "weapon",
      "weight": 4,
      "properties": { "damage_m": "1d8", "critical": "19-20/x2" }
    }
  ],
  "spells": { "0": ["Detect Magic"], "1": ["Magic Missile"] } or null if non-caster,
  "spellSlots": { "0": 4, "1": 3 } or null if non-caster
}

Equipment Rules:
- Weapons need: name, type:"weapon", weight, properties (damage_m, critical, range for ranged, light:true for light weapons)
- Armor needs: name, type:"armor", weight, maxDex, checkPenalty, armorBonus
- Shields need: name, type:"shield", weight, shieldBonus, checkPenalty
- Magic items with AC bonuses specify: deflectionBonus, naturalArmor, etc.
- TWF builds: include two melee weapons, mark light weapons with properties.light:true
- Include weight for encumbrance calculation

Class Rules: 
- Dragons get high Str/Con/Cha, d12 HD, natural armor, often DR/SR
- Fighters get full BAB progression, heavy armor proficiency
- Rogues get light armor, TWF is common, check for Weapon Finesse
- Wizards get 1/2 BAB, spells, no armor
- Calculate HP = HD count × (die average + Con mod)
- Include appropriate class skills

Respond with ONLY a valid JSON object.`;
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