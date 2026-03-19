const spellcastingClasses = ['wizard', 'sorcerer', 'cleric', 'druid', 'bard', 'paladin', 'ranger', 'witch', 'oracle', 'inquisitor', 'summoner', 'magus', 'alchemist', 'arcanist', 'shaman', 'warpriest', 'bloodrager', 'skald', 'investigator', 'hunter', 'medium', 'mesmerist', 'occultist', 'psychic', 'spiritualist'];

/**
 * Gets specialized instructions for spellcasting classes.
 */
function getSpellInstructions(npcClass, level) {
    const cls = (npcClass || '').toLowerCase();
    const isSpellcaster = spellcastingClasses.some(sc => cls.includes(sc));

    if (!isSpellcaster) return '';

    return `
FOR SPELLCASTING CLASSES (${npcClass}):
- "spells": Object mapping spell levels to arrays of spell names. Example: {"0": ["Detect Magic", "Light", "Mage Hand"], "1": ["Magic Missile", "Shield", "Mage Armor"]}
- "spellSlots": Object mapping spell levels to number of slots per day. Example: {"0": 4, "1": 3, "2": 2}
- "spellSaveDc": Base spell save DC (10 + spell level + casting stat modifier)
Include appropriate spells for a level ${level} ${npcClass}. Choose thematically appropriate spells based on the character's description and backstory.`;
}

/**
 * Gets specialized instructions for creature types.
 */
function getTypeInstructions(typeOrRace) {
    const type = (typeOrRace || '').toLowerCase();

    if (type.includes('construct') || type.includes('golem')) {
        return `
CONSTRUCT TYPE RULES:
- "immune": MUST include "mind-affecting effects, bleed, disease, death effects, necromancy effects, paralysis, poison, sleep, stun, ability damage, ability drain, fatigue, exhaustion, energy drain, nonlethal damage"
- Constructs have no Constitution score (use "-" or 0)
- Constructs do not heal naturally but can be repaired
- Include appropriate slam/fist attacks based on size
- "dr": Use format "N/type" (e.g., "5/adamantine" for golems, or "-" if none)`;
    }

    if (type.includes('undead')) {
        return `
UNDEAD TYPE RULES:
- "immune": MUST include "mind-affecting effects, bleed, death effects, disease, paralysis, poison, sleep, stun"
- Undead have no Constitution score (use Charisma for HP/Fort saves)
- Include appropriate claw/bite attacks if corporeal
- "dr": Use format "N/type" (e.g., "5/bludgeoning" for skeletons)`;
    }

    if (type.includes('dragon')) {
        return `
DRAGON TYPE RULES:
- Include breath weapon in specialAbilities with damage, save DC, and recharge
- Include bite, claw, wing, and tail attacks appropriate to size
- Include "frightful presence" if age category warrants it
- "immune": Comma-separated list (e.g., "paralysis, sleep")
- "sr": Number only (e.g., 20)`;
    }

    if (type.includes('elemental')) {
        return `
ELEMENTAL TYPE RULES:
- "immune": MUST include "bleed, paralysis, poison, sleep, stun, critical hits, flanking"
- Include appropriate slam attacks and elemental-based abilities`;
    }

    if (type.includes('ooze')) {
        return `
OOZE TYPE RULES:
- "immune": MUST include "mind-affecting effects, bleed, paralysis, poison, sleep, stun, polymorph, critical hits, flanking"
- Oozes are typically blind but have blindsight
- "equipment": MUST be empty []
- "magicItems": MUST be empty []`;
    }

    if (type.includes('plant')) {
        return `
PLANT TYPE RULES:
- "immune": MUST include "mind-affecting effects, paralysis, poison, polymorph, sleep, stun"
- Plants breathe and eat, but do not sleep
- "equipment": MUST be empty [] (unless intelligent and humanoid-shaped)
- "magicItems": MUST be empty []`;
    }

    if (type.includes('vermin')) {
        return `
VERMIN TYPE RULES:
- "immune": MUST include "mind-affecting effects"
- Vermin are mindless (Int -)
- "equipment": MUST be empty []
- "magicItems": MUST be empty []`;
    }

    if (type.includes('animal') || type.includes('magical beast')) {
        return `
ANIMAL/BEAST TYPE RULES:
- "equipment": MUST be empty []
- "magicItems": MUST be empty [] (unless higher intelligence magical beast)
- Intelligence is usually 1 or 2 for animals`;
    }

    if (!type.includes('humanoid') && !type.includes('outsider')) {
        return `
MONSTER TYPE RULES:
- "inventory": MUST be empty [] (Monsters do not carry gear typically)
- "immune": Check PF1e rules for this creature type
- Natural Armor: Ensure "ac" reflects natural armor, not manufactured armor.`;
    }

    return '';
}

/**
 * Builds the comprehensive prompt for NPC details generation/completion.
 */
function buildNpcDetailsPrompt(npc, options = {}) {
    const spellInstructions = getSpellInstructions(npc.class, npc.level);
    const typeInstructions = getTypeInstructions(npc.type || npc.race);

    const generationPrompt = options.generationPrompt ? `\nOriginal Request: "${options.generationPrompt}"` : '';
    const generationContext = options.generationContext ? `\nWorld Context: ${options.generationContext}` : '';
    const currentEntity = options.currentEntity ? `\nEXISTING DATA (Suggest completions for missing fields):\n${JSON.stringify(options.currentEntity, null, 2)}` : '';

    return `You are a Pathfinder 1e Expert NPC Generator.
${spellInstructions}
${typeInstructions}
${generationPrompt}
${generationContext}
${currentEntity}

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
10. "classes": Array of objects: [{"className": "string", "level": number}] - For multiclassing. Also populate for single-class.
11. "skills": Object mapping skill names to total bonuses (e.g., {"Diplomacy": 16, "Bluff": 13})
12. "feats": Array of strings
13. "inventory": Array of objects: [{"name": "string", "type": "weapon/armor/shield/gear/magic/loot", "quantity": number, "equipped": boolean, "properties": {"damage_m": "1d8", "critical": "19-20/x2", "range": 0, "weight": "string"}}]
    - IMPORTANT: For Weapons, include "properties" with "damage_m" (medium damage) and "critical".
    - IMPORTANT: For Armor/Shields, include "properties" with "armorBonus", "maxDex", "checkPenalty".
14. "specialAbilities": Array of strings (Special Qualities, SQ, Ex/Su/Sp abilities)
15. "specialAttacks": Array of strings (e.g., "Constrict (1d4+4)", "Sneak Attack +2d6", "Trample")
16. "attacks": Array of attack objects. Include NATURAL ATTACKS (Bite, Claw, Slam) for monsters if applicable. Example: [{"name": "Longsword", "bonus": "+7", "damage": "1d8+4", "type": "slashing"}, {"name": "Slam", "bonus": "+5", "damage": "1d6+3", "type": "bludgeoning"}]
17. "immune": String of immunities (e.g., "fire, poison, sleep") - REQUIRED for constructs/undead/elementals
18. "resist": String of resistances (e.g., "cold 10, electricity 10")
19. "dr": String of damage reduction (e.g., "5/magic", "10/adamantine")
20. "sr": Number for spell resistance (e.g., 18)
21. "vulnerabilities": Array of strings (e.g., ["cold", "sonic"])
22. "speed": String (e.g., "30 ft., fly 60 ft. (good), swim 20 ft.") - INCLUDE ALL MODES
23. "space": String (e.g., "5 ft.") - Default 5 ft. for Medium/Small, 10 ft. for Large, etc.
24. "reach": String (e.g., "5 ft." or "10 ft. with bite")
25. "aura": String (e.g., "fear aura (30 ft., DC 17)") - optional
26. "senses": String (e.g., "darkvision 60 ft., low-light vision") - REQUIRED

IMPORTANT:
- Feats: Include ALL standard feats for a creature of this HD/Type. If using Weapon Focus, ensure it matches a weapon in "attacks" (e.g., "Weapon Focus (Bite)").
- Special Attacks: Separate offensive abilities (Sneak Attack, Breath Weapon) from Special Qualities.
- Special Qualities: Include (Ex), (Su), (Sp) tags if known.
- Monster Rules: Ensure Speed, Immunities, and Attacks match specific creature type. Include standard Natural Attacks (Bite/Claw/Slam) for beasts/monsters unless humanoid/equipped.
- RESTRICTIONS: Do NOT use "Laser", "Plasma", "Railgun", or other high-sci-fi terms. Use "Revolver", "Musket", "Clockwork", or "Steam" for technology.

IMPORTANT: All numeric fields MUST be simple numbers, NOT objects. Calculate values accurately for ${npc.class} level ${npc.level}. 
If "class" is "None" or "Monster", simply provide Hit Dice appropriate for the creature type (e.g., "${npc.level}d8") in the HP field description, but keep the level number in "level".
If the Original Request mentions specific equipment, abilities, or traits, ensure they are included in the appropriate fields.`;
}

/**
 * Builds a prompt specifically for completing missing fields in an existing entity.
 * This prompt specifies the "additions" structure the UI expects.
 */
function buildAiCompletePrompt(npc, options = {}) {
    const currentEntity = options.currentEntity ? `\nEXISTING ENTITY DATA:\n${JSON.stringify(options.currentEntity, null, 2)}` : '';

    return `You are a Pathfinder 1e Expert. Analyze the following partially complete entity and suggest logical completions for MISSING or WEAK fields.

${currentEntity}

CRITICAL - Return a JSON object with this EXACT structure:
{
  "baseStats": {
    "class": "string",
    "level": number,
    "alignment": "string",
    "race": "string",
    "ac": number,
    "bab": number,
    "hp": "string",
    "saves": "string"
  },
  "skills": {
    "Skill Name": number
  },
  "equipment": ["item_id_1", "item_id_2"],
  "spells": {
    "0": ["spell_id_1"],
    "1": ["spell_id_2"]
  },
  "spellSlots": {
    "0": number,
    "1": number
  },
  "notes": "A brief explanation of the suggestions"
}

IMPORTANT:
- Only include fields that are actually missing or need improvement in the existing data.
- For equipment and spells, use lowercase IDs like "eq_longsword" or "sp_haste" if possible, or descriptive names.
- Calculate skill bonuses and spell slots accurately for a level ${npc.level} ${npc.class}.
- DO NOT repeat data that is already correctly populated in the EXISTING ENTITY DATA.`;
}

module.exports = {
    spellcastingClasses,
    getSpellInstructions,
    getTypeInstructions,
    buildNpcDetailsPrompt,
    buildAiCompletePrompt
};
