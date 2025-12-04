const { ObjectId } = require('mongodb');

// Mock dependencies
const GOOD_SAVES = [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17];
const POOR_SAVES = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10];

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const getAbilityModifierAsNumber = (score) => {
    const numScore = parseInt(String(score).match(/-?\d+/)?.[0] || '10', 10);
    if (isNaN(numScore)) return 0;
    return Math.floor((numScore - 10) / 2);
};

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

function mergeBaseStats(fresh, old) {
    const out = { ...old };
    const abilities = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
    let abilitiesFoundInFresh = false;
    for (const ab of abilities) {
        if (fresh[ab] !== undefined && fresh[ab] !== 10) {
            out[ab] = fresh[ab];
            abilitiesFoundInFresh = true;
        }
    }
    if (fresh.skills) out.skills = fresh.skills;
    if (fresh.hp) out.hp = fresh.hp;
    if (fresh.armorClass && fresh.armorClass.total !== 10) out.armorClass = fresh.armorClass;
    if (abilitiesFoundInFresh || (fresh.saves && (fresh.saves.fortitude !== 0 || fresh.saves.reflex !== 0 || fresh.saves.will !== 0))) {
        out.saves = fresh.saves;
    }
    if (abilitiesFoundInFresh || (fresh.combat && fresh.combat.bab !== null && fresh.combat.bab !== 1)) {
        out.combat = fresh.combat;
    }
    const abilityMap = { 'str': 'Str', 'dex': 'Dex', 'con': 'Con', 'int': 'Int', 'wis': 'Wis', 'cha': 'Cha' };
    for (const [lower, upper] of Object.entries(abilityMap)) {
        if (out[lower] !== undefined && out[upper] === undefined) out[upper] = out[lower];
        delete out[lower];
    }
    for (const a of ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha']) {
        if (out[a] === undefined) out[a] = 10;
    }
    if (fresh.size) out.size = fresh.size;
    return out;
}

async function parseStatBlockToEntity(db, statBlock, name, path, content) {
    if (!statBlock.entityId) return null;

    const getAllStats = () => {
        let all = [];
        (content || []).filter(b => b.type === 'statblock' && b.stats).forEach(block => {
            if (Array.isArray(block.stats)) {
                all.push(...block.stats);
            } else if (typeof block.stats === 'object') {
                for (const key in block.stats) {
                    all.push({ label: key, value: block.stats[key] });
                }
            }
        });
        return all;
    }

    const allStats = getAllStats();
    const statsMap = new Map();
    allStats.forEach((stat) => {
        if (stat.label) {
            statsMap.set(stat.label.trim().toLowerCase(), String(stat.value));
        }
    });
    const getStat = (key) => statsMap.get(key.trim().toLowerCase());

    let baseStats = {};
    const featNames = [];
    const specialAbilityNames = [];
    const equipmentNames = [];
    const spellNames = [];
    let deityName = null;

    const abilities = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
    const abilityVariations = {
        'Str': ['str', 'strength'],
        'Dex': ['dex', 'dexterity'],
        'Con': ['con', 'constitution'],
        'Int': ['int', 'intelligence'],
        'Wis': ['wis', 'wisdom'],
        'Cha': ['cha', 'charisma']
    };

    const abilityString = getStat('ability scores');
    if (abilityString) {
        abilities.forEach(ab => {
            const variationsRegex = `(?:${abilityVariations[ab].join('|')})`;
            const match = abilityString.match(new RegExp(`${variationsRegex}\\s*[:—-]?\\s*(-?\\d+)`, 'i'));
            if (match) baseStats[ab] = parseInt(match[1], 10);
        });
    }

    abilities.forEach(ab => {
        if (baseStats[ab] === undefined) {
            for (const variation of abilityVariations[ab]) {
                const individualStat = getStat(variation);
                if (individualStat) {
                    const statValueMatch = String(individualStat).match(/-?\d+/);
                    if (statValueMatch) {
                        baseStats[ab] = parseInt(statValueMatch[0], 10);
                        break;
                    }
                }
            }
        }
    });

    abilities.forEach(ab => {
        if (baseStats[ab] === undefined) {
            const statValue = getStat(ab);
            if (statValue) {
                const statValueMatch = String(statValue).match(/-?\d+/);
                if (statValueMatch) baseStats[ab] = parseInt(statValueMatch[0], 10);
            }
        }
    });

    const ac = {};
    const acString = getStat('AC') || getStat('Armor Class') || '';
    const totalACMatch = acString.match(/^(\d+)/);
    ac.total = totalACMatch ? parseInt(totalACMatch[1], 10) : 10;
    const touchACMatch = acString.match(/touch\s*(\d+)/);
    ac.touch = touchACMatch ? parseInt(touchACMatch[1], 10) : ac.total;
    const ffACMatch = acString.match(/flat-footed\s*(\d+)/);
    ac.flatFooted = ffACMatch ? parseInt(ffACMatch[1], 10) : ac.total;
    baseStats.armorClass = ac;

    baseStats.hp = getStat('hp') || 0;

    const saves = {};
    const combat = { bab: null, cmb: null, cmd: null };
    const saveString = getStat('Saves');
    const babString = getStat('Base Atk');
    const cmbString = getStat('CMB');
    const cmdString = getStat('CMD');
    if (saveString) {
        saves.fortitude = parseInt(saveString.match(/Fort\s*([+-]?\d+)/)?.[1] || '0', 10);
        saves.reflex = parseInt(saveString.match(/Ref\s*([+-]?\d+)/)?.[1] || '0', 10);
        saves.will = parseInt(saveString.match(/Will\s*([+-]?\d+)/)?.[1] || '0', 10);
    }
    if (babString) combat.bab = parseInt(babString.match(/[+-]?\d+/)?.[0] || '0', 10);
    if (cmbString) combat.cmb = cmbString;
    if (cmdString) combat.cmd = cmdString;

    const strMod = getAbilityModifierAsNumber(baseStats.Str);
    const dexMod = getAbilityModifierAsNumber(baseStats.Dex);
    const conMod = getAbilityModifierAsNumber(baseStats.Con);
    const wisMod = getAbilityModifierAsNumber(baseStats.Wis);

    const crString = getStat('cr') || '1';
    let level = 1;
    if (crString.includes('/')) {
        const parts = crString.split('/');
        level = parseInt(parts[0], 10) / parseInt(parts[1], 10);
    } else {
        level = parseInt(crString, 10);
    }
    if (isNaN(level) || level < 1) level = 1;
    const levelInt = Math.floor(level);

    // --- Size Parsing Logic ---
    let size = 'Medium';
    const sizeStat = getStat('Size');
    const typeStat = getStat('Type');
    const SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];

    if (sizeStat) {
        const match = SIZES.find(s => sizeStat.toLowerCase().includes(s.toLowerCase()));
        if (match) size = match;
    } else if (typeStat) {
        const match = SIZES.find(s => typeStat.toLowerCase().startsWith(s.toLowerCase()));
        if (match) size = match;
    }
    baseStats.size = size;

    if (!saveString) {
        const isFortGood = baseStats.Con >= 14 || (baseStats.Con >= baseStats.Dex && baseStats.Con >= baseStats.Wis);
        const isRefGood = baseStats.Dex >= 14 || (baseStats.Dex >= baseStats.Con && baseStats.Dex >= baseStats.Wis);
        const isWillGood = baseStats.Wis >= 14 || (baseStats.Wis >= baseStats.Con && baseStats.Wis >= baseStats.Dex);
        const safeLevelIndex = Math.max(0, Math.min(levelInt - 1, GOOD_SAVES.length - 1));
        saves.fortitude = (isFortGood ? GOOD_SAVES[safeLevelIndex] : POOR_SAVES[safeLevelIndex]) + conMod;
        saves.reflex = (isRefGood ? GOOD_SAVES[safeLevelIndex] : POOR_SAVES[safeLevelIndex]) + dexMod;
        saves.will = (isWillGood ? GOOD_SAVES[safeLevelIndex] : POOR_SAVES[safeLevelIndex]) + wisMod;
    }

    if (combat.bab === null) combat.bab = levelInt;
    if (combat.cmb === null && combat.bab !== null) combat.cmb = combat.bab + strMod;
    if (combat.cmd === null && combat.bab !== null) combat.cmd = 10 + combat.bab + strMod + dexMod;

    baseStats.saves = saves;
    baseStats.combat = combat;

    baseStats = normaliseAbilityKeys(baseStats);

    // Mock DB calls
    const ruleDocs = await db.collection('rules_pf1e').find().toArray();
    const equipDocs = await db.collection('equipment_pf1e').find().toArray();

    const entityId = statBlock.entityId;
    return {
        _id: entityId,
        name,
        sourceCodexPath: path,
        baseStats,
        rules: [],
        equipment: [],
        spellNames: [],
        deityName
    };
}

module.exports = { mergeBaseStats, parseStatBlockToEntity };
