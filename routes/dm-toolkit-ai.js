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

                // OPTIMIZATION: RAG-lite instead of full Codex dump
                // 1. Extract keywords (longer than 2 chars) to filter noise
                const keywords = query.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);

                let contextDocs = [];
                if (keywords.length > 0) {
                    const regex = new RegExp(keywords.join('|'), 'i');

                    // Search Entities (NPCs, Monsters)
                    const entityDocs = await db.collection('entities_pf1e').find({
                        name: regex
                    }).limit(5).project({ name: 1, description: 1, baseStats: 1, race: 1, type: 1, _id: 0 }).toArray();

                    // Search Codex (Lore, Places) - Search name and path tags
                    const codexDocs = await db.collection('codex_entries').find({
                        $or: [{ name: regex }, { path_components: regex }]
                    }).limit(5).project({ name: 1, content: 1, path_components: 1, _id: 0 }).toArray();

                    contextDocs = [...entityDocs, ...codexDocs];
                }

                // Fallback: If no keywords or no results, use recent entries (context of what's active)
                if (contextDocs.length === 0) {
                    contextDocs = await db.collection('codex_entries').find({}).sort({ _id: -1 }).limit(3).project({ name: 1, content: 1, _id: 0 }).toArray();
                }

                // Hard limit context size to ~20k characters to save tokens
                const contextString = JSON.stringify(contextDocs).substring(0, 20000);

                prompt = `You are a helpful assistant for a Game Master. Answer based ONLY on the provided JSON data context. Question: "${query}"\n\nContext:\n${contextString}`;
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

                // Determine if this is a spellcasting class
                const spellcastingClasses = ['wizard', 'sorcerer', 'cleric', 'druid', 'bard', 'paladin', 'ranger', 'witch', 'oracle', 'inquisitor', 'summoner', 'magus', 'alchemist', 'arcanist', 'shaman', 'warpriest', 'bloodrager', 'skald', 'investigator', 'hunter', 'medium', 'mesmerist', 'occultist', 'psychic', 'spiritualist'];
                const npcClass = (npc.class || '').toLowerCase();
                const isSpellcaster = spellcastingClasses.some(sc => npcClass.includes(sc));

                let spellInstructions = '';
                if (isSpellcaster) {
                    spellInstructions = `
FOR SPELLCASTING CLASSES (${npc.class}):
- "spells": Object mapping spell levels to arrays of spell names. Example: {"0": ["Detect Magic", "Light", "Mage Hand"], "1": ["Magic Missile", "Shield", "Mage Armor"]}
- "spellSlots": Object mapping spell levels to number of slots per day. Example: {"0": 4, "1": 3, "2": 2}
- "spellSaveDc": Base spell save DC (10 + spell level + casting stat modifier)
Include appropriate spells for a level ${npc.level} ${npc.class}. Choose thematically appropriate spells based on the character's description and backstory.`;
                }

                // Determine creature type and add type-specific instructions
                const creatureType = (npc.type || npc.race || '').toLowerCase();
                let typeInstructions = '';

                if (creatureType.includes('construct') || creatureType.includes('golem')) {
                    typeInstructions = `
CONSTRUCT TYPE RULES:
- "immune": MUST include "mind-affecting effects, bleed, disease, death effects, necromancy effects, paralysis, poison, sleep, stun, ability damage, ability drain, fatigue, exhaustion, energy drain, nonlethal damage"
- Constructs have no Constitution score (use "-" or 0)
- Constructs do not heal naturally but can be repaired
- Include appropriate slam/fist attacks based on size
- "dr": Use format "N/type" (e.g., "5/adamantine" for golems, or "-" if none)`;
                } else if (creatureType.includes('undead')) {
                    typeInstructions = `
UNDEAD TYPE RULES:
- "immune": MUST include "mind-affecting effects, bleed, death effects, disease, paralysis, poison, sleep, stun"
- Undead have no Constitution score (use Charisma for HP/Fort saves)
- Include appropriate claw/bite attacks if corporeal
- "dr": Use format "N/type" (e.g., "5/bludgeoning" for skeletons)`;
                } else if (creatureType.includes('dragon')) {
                    typeInstructions = `
DRAGON TYPE RULES:
- Include breath weapon in specialAbilities with damage, save DC, and recharge
- Include bite, claw, wing, and tail attacks appropriate to size
- Include "frightful presence" if age category warrants it
- "immune": Comma-separated list (e.g., "paralysis, sleep")
- "sr": Number only (e.g., 20)`;
                } else if (creatureType.includes('elemental')) {
                    typeInstructions = `
ELEMENTAL TYPE RULES:
- "immune": MUST include "bleed, paralysis, poison, sleep, stun, critical hits, flanking"
- Include appropriate slam attacks and elemental-based abilities`;
                } else if (creatureType.includes('ooze')) {
                    typeInstructions = `
OOZE TYPE RULES:
- "immune": MUST include "mind-affecting effects, bleed, paralysis, poison, sleep, stun, polymorph, critical hits, flanking"
- Oozes are typically blind but have blindsight
- "equipment": MUST be empty []
- "magicItems": MUST be empty []`;
                } else if (creatureType.includes('plant')) {
                    typeInstructions = `
PLANT TYPE RULES:
- "immune": MUST include "mind-affecting effects, paralysis, poison, polymorph, sleep, stun"
- Plants breathe and eat, but do not sleep
- "equipment": MUST be empty [] (unless intelligent and humanoid-shaped)
- "magicItems": MUST be empty []`;
                } else if (creatureType.includes('vermin')) {
                    typeInstructions = `
VERMIN TYPE RULES:
- "immune": MUST include "mind-affecting effects"
- Vermin are mindless (Int -)
- "equipment": MUST be empty []
- "magicItems": MUST be empty []`;
                } else if (creatureType.includes('animal') || creatureType.includes('magical beast')) {
                    typeInstructions = `
ANIMAL/BEAST TYPE RULES:
- "equipment": MUST be empty []
- "magicItems": MUST be empty [] (unless higher intelligence magical beast)
- Intelligence is usually 1 or 2 for animals`;
                }

                // Generic Fallback for non-humanoids if no specific type matched above
                if (!typeInstructions && !creatureType.includes('humanoid') && !creatureType.includes('outsider')) {
                    typeInstructions = `
MONSTER TYPE RULES:
- "equipment": MUST be empty [] (Monsters do not carry gear)
- "magicItems": MUST be empty []
- "immune": Check PF1e rules for this creature type
- Natural Armor: Ensure "ac" reflects natural armor, not manufactured armor.`;
                }

                // Include generation prompt and context if provided
                const generationPrompt = options.generationPrompt ? `\nOriginal Request: "${options.generationPrompt}"` : '';
                const generationContext = options.generationContext ? `\nWorld Context: ${options.generationContext}` : '';

                prompt = `You are a Pathfinder 1e Expert NPC Generator.
${spellInstructions}
${typeInstructions}

CRITICAL - Return a JSON object with these REQUIRED fields:
1. "baseStats": Object with Str, Dex, Con, Int, Wis, Cha as NUMBERS
2. "hp": Number or string (e.g., 33 or "33 (5d8+5)")
3. "ac": Number (e.g., 12)
4. "acTouch": Number
5. "acFlatFooted": Number  
6. "bab": Number (e.g., 3)
7. "cmb": Number
8. "cmd": Number
9. "fortSave", "refSave", "willSave": Numbers
10. "skills": Object mapping skill names to total bonuses (e.g., {"Diplomacy": 16, "Bluff": 13})
11. "feats": Array of strings
12. "equipment": Array of strings (mundane gear)
13. "magicItems": Array of strings (magic items)
14. "specialAbilities": Array of strings (Special Qualities, SQ, Ex/Su/Sp abilities)
15. "specialAttacks": Array of strings (e.g., "Constrict (1d4+4)", "Sneak Attack +2d6", "Trample")
16. "attacks": Array of attack objects. Include NATURAL ATTACKS (Bite, Claw, Slam) for monsters if applicable. Example: [{"name": "Longsword", "bonus": "+7", "damage": "1d8+4", "type": "slashing"}, {"name": "Slam", "bonus": "+5", "damage": "1d6+3", "type": "bludgeoning"}]
16. "immune": String of immunities (e.g., "fire, poison, sleep") - REQUIRED for constructs/undead/elementals
17. "resist": String of resistances (e.g., "cold 10, electricity 10")
18. "dr": String of damage reduction (e.g., "5/magic", "10/adamantine")
19. "sr": Number for spell resistance (e.g., 18)
20. "vulnerabilities": Array of strings (e.g., ["cold", "sonic"])
19. "sr": Number for spell resistance (e.g., 18)
20. "vulnerabilities": Array of strings (e.g., ["cold", "sonic"])
21. "speed": String (e.g., "30 ft., fly 60 ft. (good), swim 20 ft.") - INCLUDE ALL MODES
22. "space": String (e.g., "5 ft.") - Default 5 ft. for Medium/Small, 10 ft. for Large, etc.
23. "reach": String (e.g., "5 ft." or "10 ft. with bite")
24. "aura": String (e.g., "fear aura (30 ft., DC 17)") - optional
25. "senses": String (e.g., "darkvision 60 ft., low-light vision") - REQUIRED
${spellInstructions}

IMPORTANT:
- Feats: Include ALL standard feats for a creature of this HD/Type. If using Weapon Focus, ensure it matches a weapon in "attacks" (e.g., "Weapon Focus (Bite)").
- Special Attacks: Separate offensive abilities (Sneak Attack, Breath Weapon) from Special Qualities.
- Special Qualities: Include (Ex), (Su), (Sp) tags if known.
- Monster Rules: Ensure Speed, Immunities, and Attacks match specific creature type. Include standard Natural Attacks (Bite/Claw/Slam) for beasts/monsters unless humanoid/equipped.

Example baseStats for a social Expert: {"Str": 10, "Dex": 12, "Con": 12, "Int": 14, "Wis": 12, "Cha": 16}
Example baseStats for a Fighter: {"Str": 16, "Dex": 14, "Con": 14, "Int": 10, "Wis": 12, "Cha": 10}
Example baseStats for a Wizard: {"Str": 8, "Dex": 14, "Con": 12, "Int": 18, "Wis": 12, "Cha": 10}
Example baseStats for a Golem: {"Str": 24, "Dex": 9, "Con": "-", "Int": "-", "Wis": 11, "Cha": 1}

IMPORTANT: All numeric fields MUST be simple numbers, NOT objects. Calculate values accurately for ${npc.class} level ${npc.level}. 
If "class" is "None" or "Monster", simply provide Hit Dice appropriate for the creature type (e.g., "${npc.level}d8") in the HP field description, but keep the level number in "level".
If the Original Request mentions specific equipment, abilities, or traits, ensure they are included in the appropriate fields.`;
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