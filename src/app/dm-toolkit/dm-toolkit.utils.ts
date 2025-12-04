
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

export const calculateCompleteBaseStats = (baseStats: any): any => {
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
    const wisMod = getAbilityModifierAsNumber(getCaseInsensitiveProp(newStats, 'Wis'));

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
    if (typeof getCaseInsensitiveProp(newStats, 'Flat-Footed') !== 'number') newStats['Flat-Footed'] = (newStats['AC'] || 10) - dexMod;

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

        const formatMod = (mod: number) => mod >= 0 ? `+${mod}` : String(mod);
        newStats['Saves'] = `Fort ${formatMod(baseFort + conMod)}, Ref ${formatMod(baseRef + dexMod)}, Will ${formatMod(baseWill + wisMod)}`;
    }

    if (!getCaseInsensitiveProp(newStats, 'Speed')) newStats['Speed'] = '30 ft.';

    if (typeof newStats['BAB'] !== 'number') {
        newStats['BAB'] = parseInt(String(getCaseInsensitiveProp(newStats, 'Base Attack Bonus') || getCaseInsensitiveProp(newStats, 'BAB') || 0).match(/-?\d+/)?.[0] || '0', 10);
    }

    if (typeof getCaseInsensitiveProp(newStats, 'CMB') !== 'number') newStats['CMB'] = newStats['BAB'] + strMod + sizeStats.specialMod;
    if (typeof getCaseInsensitiveProp(newStats, 'CMD') !== 'number') newStats['CMD'] = 10 + newStats['BAB'] + strMod + dexMod + sizeStats.specialMod;

    const hpValue = getCaseInsensitiveProp(newStats, 'hp') || getCaseInsensitiveProp(newStats, 'HP') || '1d8';
    const isDiceNotation = /^\d+d\d+/.test(String(hpValue));
    const avgHpMatch = String(hpValue).match(/^(\d+)/);
    const diceInParenMatch = String(hpValue).match(/\((\s*\d+d\d+[+-]?\s*\d*\s*)\)/);

    if (isDiceNotation) newStats['maxHp'] = calculateAverageHp(String(hpValue));
    else if (avgHpMatch) newStats['maxHp'] = parseInt(avgHpMatch[1], 10);
    else if (diceInParenMatch) newStats['maxHp'] = calculateAverageHp(diceInParenMatch[1]);
    else newStats['maxHp'] = calculateAverageHp(String(hpValue));

    if (isNaN(newStats['maxHp']) || newStats['maxHp'] <= 0) newStats['maxHp'] = 10;

    return newStats;
};