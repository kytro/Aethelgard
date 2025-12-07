
export const SKILL_ABILITY_MAP: { [key: string]: 'Str' | 'Dex' | 'Con' | 'Int' | 'Wis' | 'Cha' } = {
    'Acrobatics': 'Dex', 'Appraise': 'Int', 'Bluff': 'Cha', 'Climb': 'Str', 'Craft': 'Int',
    'Diplomacy': 'Cha', 'Disable Device': 'Dex', 'Disguise': 'Cha', 'Escape Artist': 'Dex',
    'Fly': 'Dex', 'Handle Animal': 'Cha', 'Heal': 'Wis', 'Intimidate': 'Cha',
    'Knowledge (arcana)': 'Int', 'Knowledge (dungeoneering)': 'Int', 'Knowledge (engineering)': 'Int',
    'Knowledge (geography)': 'Int', 'Knowledge (history)': 'Int', 'Knowledge (local)': 'Int',
    'Knowledge (nature)': 'Int', 'Knowledge (nobility)': 'Int', 'Knowledge (planes)': 'Int',
    'Knowledge (religion)': 'Int', 'Linguistics': 'Int', 'Perception': 'Wis', 'Perform': 'Cha',
    'Profession': 'Wis', 'Ride': 'Dex', 'Sense Motive': 'Wis', 'Sleight of Hand': 'Dex',
    'Spellcraft': 'Int', 'Stealth': 'Dex', 'Survival': 'Wis', 'Swim': 'Str', 'Use Magic Device': 'Cha'
};

export const GOOD_SAVES = [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17];
export const POOR_SAVES = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10];

export const getAbilityModifierAsNumber = (score: any): number => {
    const numScore = parseInt(String(score).match(/-?\d+/)?.[0] || '10', 10);
    if (isNaN(numScore)) return 0;
    return Math.floor((numScore - 10) / 2);
};

export const getAbilityModifier = (score: any): string => {
    const mod = getAbilityModifierAsNumber(score);
    return isNaN(mod) ? '' : (mod >= 0 ? `+${mod}` : `${mod}`);
};

export const getCaseInsensitiveProp = (obj: any, key: string): any => {
    if (!obj || typeof obj !== 'object' || !key) return undefined;
    const objKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    return objKey ? obj[objKey] : undefined;
};

export const calculateAverageHp = (diceString: string): number => {
    const match = String(diceString).match(/(\d+)d(\d+)\s*([+-]\s*\d+)?/);
    if (!match) {
        const singleNumber = parseInt(diceString, 10);
        return isNaN(singleNumber) ? 10 : singleNumber;
    }
    const numDice = parseInt(match[1], 10);
    const dieSize = parseInt(match[2], 10);
    const modifier = parseInt((match[3] || '0').replace(/\s/g, ''), 10);

    const averageRoll = (dieSize + 1) / 2;
    return Math.floor(numDice * averageRoll) + modifier;
};

export const formatName = (name: string): string => {
    return name ? name.replace(/_/g, ' ').replace(/-/g, ' ') : '';
};

export const formatTime = (t: any): string => {
    if (!t) return '';
    let date;
    if (t && typeof t.toDate === 'function') {
        date = t.toDate();
    } else {
        date = new Date(t);
    }
    if (isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export const SIZE_DATA: { [key: string]: any } = {
    'Fine': { mod: 8, specialMod: -8, stealth: 16, fly: 8 },
    'Diminutive': { mod: 4, specialMod: -4, stealth: 12, fly: 6 },
    'Tiny': { mod: 2, specialMod: -2, stealth: 8, fly: 4 },
    'Small': { mod: 1, specialMod: -1, stealth: 4, fly: 2 },
    'Medium': { mod: 0, specialMod: 0, stealth: 0, fly: 0 },
    'Large': { mod: -1, specialMod: 1, stealth: -4, fly: -2 },
    'Huge': { mod: -2, specialMod: 2, stealth: -8, fly: -4 },
    'Gargantuan': { mod: -4, specialMod: 4, stealth: -12, fly: -6 },
    'Colossal': { mod: -8, specialMod: 8, stealth: -16, fly: -8 }
};

// PF1e Construct bonus HP by size (replaces Con-based HP)
export const CONSTRUCT_HP_BONUS: { [key: string]: number } = {
    'Fine': 0, 'Diminutive': 0, 'Tiny': 0, 'Small': 10,
    'Medium': 20, 'Large': 30, 'Huge': 40,
    'Gargantuan': 60, 'Colossal': 80
};

// PF1e Armor data: maxDex, checkPenalty, type, arcaneSpellFailure
export const ARMOR_DATA: { [key: string]: { maxDex: number; checkPenalty: number; type: 'light' | 'medium' | 'heavy'; weight: number } } = {
    // Light Armor
    'padded': { maxDex: 8, checkPenalty: 0, type: 'light', weight: 10 },
    'leather': { maxDex: 6, checkPenalty: 0, type: 'light', weight: 15 },
    'studded leather': { maxDex: 5, checkPenalty: -1, type: 'light', weight: 20 },
    'chain shirt': { maxDex: 4, checkPenalty: -2, type: 'light', weight: 25 },
    // Medium Armor
    'hide': { maxDex: 4, checkPenalty: -3, type: 'medium', weight: 25 },
    'scale mail': { maxDex: 3, checkPenalty: -4, type: 'medium', weight: 30 },
    'chainmail': { maxDex: 2, checkPenalty: -5, type: 'medium', weight: 40 },
    'breastplate': { maxDex: 3, checkPenalty: -4, type: 'medium', weight: 30 },
    // Heavy Armor
    'splint mail': { maxDex: 0, checkPenalty: -7, type: 'heavy', weight: 45 },
    'banded mail': { maxDex: 1, checkPenalty: -6, type: 'heavy', weight: 35 },
    'half-plate': { maxDex: 0, checkPenalty: -7, type: 'heavy', weight: 50 },
    'full plate': { maxDex: 1, checkPenalty: -6, type: 'heavy', weight: 50 }
};

// PF1e Shield data
export const SHIELD_DATA: { [key: string]: { acBonus: number; maxDex: number; checkPenalty: number; weight: number } } = {
    'buckler': { acBonus: 1, maxDex: 99, checkPenalty: -1, weight: 5 },
    'light shield': { acBonus: 1, maxDex: 99, checkPenalty: -1, weight: 6 },
    'heavy shield': { acBonus: 2, maxDex: 99, checkPenalty: -2, weight: 15 },
    'tower shield': { acBonus: 4, maxDex: 2, checkPenalty: -10, weight: 45 }
};

// Light weapons for TWF
export const LIGHT_WEAPONS: string[] = [
    'dagger', 'punching dagger', 'spiked gauntlet', 'light mace', 'sickle',
    'gladius', 'handaxe', 'kukri', 'light hammer', 'light pick', 'shortsword',
    'starknife', 'sap', 'short sword'
];

// Primary vs Secondary natural attacks
export const PRIMARY_NATURAL_ATTACKS: string[] = ['bite', 'claw', 'gore', 'slam', 'sting', 'tail slap', 'talons'];
export const SECONDARY_NATURAL_ATTACKS: string[] = ['hoof', 'tentacle', 'wing', 'pincer'];

/**
 * Get the Max Dex bonus from equipped armor
 * @returns The lowest maxDex from all armor, or null if no armor
 */
export const getArmorMaxDex = (equipment: any[]): number | null => {
    let lowestMaxDex: number | null = null;

    for (const item of equipment) {
        const name = (item.name || '').toLowerCase();
        // Check if item has explicit maxDex property
        if (typeof item.maxDex === 'number') {
            lowestMaxDex = lowestMaxDex === null ? item.maxDex : Math.min(lowestMaxDex, item.maxDex);
            continue;
        }
        // Look up in armor table
        const armorData = ARMOR_DATA[name];
        if (armorData) {
            lowestMaxDex = lowestMaxDex === null ? armorData.maxDex : Math.min(lowestMaxDex, armorData.maxDex);
        }
        // Check shields too
        const shieldData = SHIELD_DATA[name];
        if (shieldData && shieldData.maxDex < 99) {
            lowestMaxDex = lowestMaxDex === null ? shieldData.maxDex : Math.min(lowestMaxDex, shieldData.maxDex);
        }
    }

    return lowestMaxDex;
};

/**
 * Get armor check penalty from equipped armor/shield
 */
export const getArmorCheckPenalty = (equipment: any[]): number => {
    let totalPenalty = 0;

    for (const item of equipment) {
        const name = (item.name || '').toLowerCase();
        if (typeof item.checkPenalty === 'number') {
            totalPenalty += item.checkPenalty;
            continue;
        }
        const armorData = ARMOR_DATA[name];
        if (armorData) totalPenalty += armorData.checkPenalty;
        const shieldData = SHIELD_DATA[name];
        if (shieldData) totalPenalty += shieldData.checkPenalty;
    }

    return totalPenalty;
};

/**
 * Classify a natural attack as primary or secondary
 */
export const classifyNaturalAttack = (attackName: string): 'primary' | 'secondary' => {
    const lower = attackName.toLowerCase();
    if (PRIMARY_NATURAL_ATTACKS.some(p => lower.includes(p))) return 'primary';
    if (SECONDARY_NATURAL_ATTACKS.some(s => lower.includes(s))) return 'secondary';
    // Default: if it's the only attack or first in list, treat as primary
    return 'primary';
};

/**
 * Check if a weapon is light (for TWF calculations)
 */
export const isLightWeapon = (weaponName: string): boolean => {
    const lower = (weaponName || '').toLowerCase();
    return LIGHT_WEAPONS.some(lw => lower.includes(lw));
};

// PF1e Carrying Capacity by Strength score [light, medium, heavy]
export const CARRYING_CAPACITY: { [str: number]: [number, number, number] } = {
    1: [3, 6, 10], 2: [6, 13, 20], 3: [10, 20, 30], 4: [13, 26, 40], 5: [16, 33, 50],
    6: [20, 40, 60], 7: [23, 46, 70], 8: [26, 53, 80], 9: [30, 60, 90], 10: [33, 66, 100],
    11: [38, 76, 115], 12: [43, 86, 130], 13: [50, 100, 150], 14: [58, 116, 175], 15: [66, 133, 200],
    16: [76, 153, 230], 17: [86, 173, 260], 18: [100, 200, 300], 19: [116, 233, 350], 20: [133, 266, 400],
    21: [153, 306, 460], 22: [173, 346, 520], 23: [200, 400, 600], 24: [233, 466, 700], 25: [266, 533, 800],
    26: [306, 613, 920], 27: [346, 693, 1040], 28: [400, 800, 1200], 29: [466, 933, 1400]
};

export type LoadCategory = 'light' | 'medium' | 'heavy' | 'overloaded';

export const LOAD_PENALTIES: { [load: string]: { maxDex: number; checkPenalty: number; speedMult: number } } = {
    'light': { maxDex: 99, checkPenalty: 0, speedMult: 1 },
    'medium': { maxDex: 3, checkPenalty: -3, speedMult: 0.75 },
    'heavy': { maxDex: 1, checkPenalty: -6, speedMult: 0.5 },
    'overloaded': { maxDex: 0, checkPenalty: -99, speedMult: 0 }
};

/**
 * Calculate load category based on Strength and carried weight
 */
export const calculateLoad = (str: number, weight: number): LoadCategory => {
    const capacity = CARRYING_CAPACITY[str] || CARRYING_CAPACITY[10];
    if (weight <= capacity[0]) return 'light';
    if (weight <= capacity[1]) return 'medium';
    if (weight <= capacity[2]) return 'heavy';
    return 'overloaded';
};

/**
 * Calculate total equipment weight
 */
export const calculateTotalWeight = (equipment: any[]): number => {
    return equipment.reduce((total, item) => {
        const weight = item.weight || 0;
        const quantity = item.quantity || 1;
        return total + (weight * quantity);
    }, 0);
};

/**
 * Calculate skill bonus with class skill +3 bonus (PF1e)
 * @param skillName - Name of the skill
 * @param ranks - Number of skill ranks
 * @param abilityMod - Ability modifier for this skill
 * @param classSkills - Array of class skill names (optional)
 * @returns Total skill bonus
 */
export const calculateSkillBonus = (
    skillName: string,
    ranks: number,
    abilityMod: number,
    classSkills: string[] = []
): number => {
    let total = ranks + abilityMod;
    // Class skill bonus: +3 if at least 1 rank and skill is a class skill
    if (ranks >= 1 && classSkills.some(cs =>
        cs.toLowerCase() === skillName.toLowerCase())) {
        total += 3;
    }
    return total;
};

export interface CalculateStatsOptions {
    type?: string;              // Creature type (Undead, Construct, Humanoid, etc.)
    feats?: string[];           // List of feat names
    specialAbilities?: string[]; // List of special ability names
}

export const calculateCompleteBaseStats = (baseStats: any, options?: CalculateStatsOptions): any => {
    const newStats: { [key: string]: any } = { ...(baseStats || {}) };
    const abilities = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
    abilities.forEach(ability => {
        const val = getCaseInsensitiveProp(newStats, ability);
        if (val !== undefined) {
            newStats[ability] = val; // Normalize key
        } else {
            newStats[ability] = 10; // Default
        }
    });

    const strMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(newStats, 'Str'));
    const dexMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(newStats, 'Dex'));
    const conMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(newStats, 'Con'));
    const chaMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(newStats, 'Cha'));
    const wisMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(newStats, 'Wis'));

    // Determine creature type for special rules
    const creatureType = (options?.type || getCaseInsensitiveProp(newStats, 'type') || '').toLowerCase();
    const isUndead = creatureType.includes('undead');
    const isConstruct = creatureType.includes('construct');

    // Check for special abilities
    const specialAbilities = options?.specialAbilities || [];
    const hasUncannyDodge = specialAbilities.some(a =>
        a.toLowerCase().includes('uncanny dodge'));

    // Check for relevant feats
    const feats = options?.feats || [];
    const hasAgileManeuvers = feats.some(f =>
        f.toLowerCase().includes('agile maneuvers'));

    // 1. Determine Size
    let size = getCaseInsensitiveProp(newStats, 'size');
    // Normalize size string (e.g. "Large (tall)" -> "Large")
    if (size) {
        const sizeMatch = size.match(/Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal/i);
        if (sizeMatch) {
            // Capitalize first letter
            size = sizeMatch[0].charAt(0).toUpperCase() + sizeMatch[0].slice(1).toLowerCase();
        }
    }
    if (!size || !SIZE_DATA[size]) size = 'Medium';
    newStats['size'] = size;
    const sizeStats = SIZE_DATA[size];

    // Check if Tiny or smaller (for CMB Dex rule)
    const isTinyOrSmaller = ['Fine', 'Diminutive', 'Tiny'].includes(size);

    let acValue = getCaseInsensitiveProp(newStats, 'AC');
    if (typeof acValue === 'string') {
        const acMatch = acValue.match(/^(\d+)/);
        const touchMatch = acValue.match(/touch\s*(\d+)/);
        const ffMatch = acValue.match(/flat-footed\s*(\d+)/);
        if (acMatch) newStats['AC'] = parseInt(acMatch[1], 10);
        if (touchMatch) newStats['Touch'] = parseInt(touchMatch[1], 10);
        if (ffMatch) newStats['Flat-Footed'] = parseInt(ffMatch[1], 10);
    }

    // Apply defaults with Size modifiers if not present
    if (typeof getCaseInsensitiveProp(newStats, 'AC') !== 'number') newStats['AC'] = 10 + dexMod + sizeStats.mod;
    if (typeof getCaseInsensitiveProp(newStats, 'Touch') !== 'number') newStats['Touch'] = 10 + dexMod + sizeStats.mod;

    // Flat-Footed AC with Uncanny Dodge check (PF1e fix)
    if (typeof getCaseInsensitiveProp(newStats, 'Flat-Footed') !== 'number') {
        if (hasUncannyDodge) {
            // Uncanny Dodge: keep Dex bonus when flat-footed
            newStats['Flat-Footed'] = newStats['AC'];
        } else {
            newStats['Flat-Footed'] = (newStats['AC'] || 10) - dexMod;
        }
    }

    if (!getCaseInsensitiveProp(newStats, 'Saves')) {
        const level = parseInt(String(getCaseInsensitiveProp(newStats, 'Level') || getCaseInsensitiveProp(newStats, 'CR') || 1), 10);
        const safeLevelIndex = Math.max(0, Math.min(level - 1, GOOD_SAVES.length - 1));

        // Heuristic for good/bad saves
        const con = parseInt(String(newStats['Con']), 10);
        const dex = parseInt(String(newStats['Dex']), 10);
        const wis = parseInt(String(newStats['Wis']), 10);

        const isFortGood = con >= 14;
        const isRefGood = dex >= 14;
        const isWillGood = wis >= 14;

        const baseFort = isFortGood ? GOOD_SAVES[safeLevelIndex] : POOR_SAVES[safeLevelIndex];
        const baseRef = isRefGood ? GOOD_SAVES[safeLevelIndex] : POOR_SAVES[safeLevelIndex];
        const baseWill = isWillGood ? GOOD_SAVES[safeLevelIndex] : POOR_SAVES[safeLevelIndex];

        // Undead use Cha for Fort saves, Constructs have no Fort save modifier
        const fortMod = isUndead ? chaMod : (isConstruct ? 0 : conMod);

        const formatMod = (mod: number) => mod >= 0 ? `+${mod}` : String(mod);
        newStats['Saves'] = `Fort ${formatMod(baseFort + fortMod)}, Ref ${formatMod(baseRef + dexMod)}, Will ${formatMod(baseWill + wisMod)}`;
    }

    if (!getCaseInsensitiveProp(newStats, 'Speed')) newStats['Speed'] = '30 ft.';

    if (typeof newStats['BAB'] !== 'number') {
        newStats['BAB'] = parseInt(String(getCaseInsensitiveProp(newStats, 'Base Attack Bonus') || getCaseInsensitiveProp(newStats, 'BAB') || 0).match(/-?\d+/)?.[0] || '0', 10);
    }

    // CMB: Tiny+ creatures or those with Agile Maneuvers can use Dex (PF1e fix)
    const useDexForCMB = isTinyOrSmaller || hasAgileManeuvers;
    const cmbMod = useDexForCMB ? Math.max(strMod, dexMod) : strMod;

    if (typeof getCaseInsensitiveProp(newStats, 'CMB') !== 'number') newStats['CMB'] = newStats['BAB'] + cmbMod + sizeStats.specialMod;
    if (typeof getCaseInsensitiveProp(newStats, 'CMD') !== 'number') newStats['CMD'] = 10 + newStats['BAB'] + strMod + dexMod + sizeStats.specialMod;

    // HP Calculation with creature type handling (PF1e fix)
    const hpValue = getCaseInsensitiveProp(newStats, 'hp') || getCaseInsensitiveProp(newStats, 'HP') || '1d8';
    const isDiceNotation = /^\d+d\d+/.test(String(hpValue));
    const avgHpMatch = String(hpValue).match(/^(\d+)/);
    const diceInParenMatch = String(hpValue).match(/\((\s*\d+d\d+[+-]?\s*\d*\s*)\)/);

    let baseMaxHp: number;
    if (isDiceNotation) baseMaxHp = calculateAverageHp(String(hpValue));
    else if (avgHpMatch) baseMaxHp = parseInt(avgHpMatch[1], 10);
    else if (diceInParenMatch) baseMaxHp = calculateAverageHp(diceInParenMatch[1]);
    else baseMaxHp = calculateAverageHp(String(hpValue));

    // Apply creature type HP modifiers
    if (isConstruct) {
        // Constructs get bonus HP based on size instead of Con
        newStats['maxHp'] = baseMaxHp + (CONSTRUCT_HP_BONUS[size] || 0);
    } else if (isUndead) {
        // Note: For Undead, the HP from dice already uses Cha in the source data
        // We just ensure maxHp is set correctly
        newStats['maxHp'] = baseMaxHp;
    } else {
        newStats['maxHp'] = baseMaxHp;
    }

    if (isNaN(newStats['maxHp']) || newStats['maxHp'] <= 0) newStats['maxHp'] = 10;

    return newStats;
};