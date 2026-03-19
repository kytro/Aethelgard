/**
 * PF1e Rules Utilities
 * Common calculations and rule implementations for Pathfinder 1st Edition
 */

/**
 * Calculates the ability modifier from a score.
 * Handles strings (e.g., "18 (+4)") and numbers.
 * @param {number|string} score - The ability score
 * @returns {number} The modifier (defaults to 0 if invalid)
 */
const getAbilityModifierAsNumber = (score) => {
    const numScore = parseInt(String(score).match(/-?\d+/)?.[0] || '10', 10);
    if (isNaN(numScore)) return 0;
    return Math.floor((numScore - 10) / 2);
};

/**
 * Normalises ability score keys to their canonical abbreviations (Str, Dex, etc.)
 * @param {Object} stats - The stats object
 * @returns {Object} New object with standardized keys
 */
const normaliseAbilityKeys = (stats) => {
    const canon = {
        strength: 'Str', str: 'Str',
        dexterity: 'Dex', dex: 'Dex',
        constitution: 'Con', con: 'Con',
        intelligence: 'Int', int: 'Int',
        wisdom: 'Wis', wis: 'Wis',
        charisma: 'Cha', cha: 'Cha',
    };
    const out = {};
    for (const [k, v] of Object.entries(stats ?? {})) {
        const key = canon[k.toLowerCase()] ?? k;
        out[key] = v;
    }
    return out;
};

/**
 * Calculates average HP based on Hit Dice
 * @param {number} hdCount - Number of Hit Dice
 * @param {number} hdSize - Size of Hit Die (e.g., 8 for d8)
 * @param {number} conMod - Constitution Modifier
 * @returns {number} Average HP
 */
const calculateAverageHp = (hdCount, hdSize, conMod = 0) => {
    if (!hdCount || !hdSize) return 0;
    // Avg of dX is (X/2) + 0.5.
    // PF1e Rounding: Down? Usually.
    // Standard avg for 1st level is max, but for monsters/NPCs usually avg is used.
    // Formula: floor(HD * (Size/2 + 0.5)) + (HD * Con)
    const avgRoll = hdSize / 2 + 0.5;
    return Math.floor(hdCount * avgRoll) + (hdCount * conMod);
};

module.exports = {
    getAbilityModifierAsNumber,
    normaliseAbilityKeys,
    calculateAverageHp
};
