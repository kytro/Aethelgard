const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();
const { toObjectId } = require('../utils/db-helpers');

const GOOD_SAVES = [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17];
const POOR_SAVES = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10];

const CLASS_DATA = {
    'fighter': { bab: 'full', fort: 'good', ref: 'poor', will: 'poor' },
    'cleric': { bab: 'medium', fort: 'good', ref: 'poor', will: 'good' },
    'wizard': { bab: 'slow', fort: 'poor', ref: 'poor', will: 'good' },
    'rogue': { bab: 'medium', fort: 'poor', ref: 'good', will: 'poor' },
    'paladin': { bab: 'full', fort: 'good', ref: 'poor', will: 'good' },
    'ranger': { bab: 'full', fort: 'good', ref: 'good', will: 'poor' },
    'bard': { bab: 'medium', fort: 'poor', ref: 'good', will: 'good' },
    'sorcerer': { bab: 'slow', fort: 'poor', ref: 'poor', will: 'good' },
    'druid': { bab: 'medium', fort: 'good', ref: 'poor', will: 'good' },
    'monk': { bab: 'medium', fort: 'good', ref: 'good', will: 'good' },
    'barbarian': { bab: 'full', fort: 'good', ref: 'poor', will: 'poor' },
    'slayer': { bab: 'full', fort: 'good', ref: 'good', will: 'poor' },
    'alchemist': { bab: 'medium', fort: 'good', ref: 'good', will: 'poor' },
    'inquisitor': { bab: 'medium', fort: 'good', ref: 'poor', will: 'good' },
    'magus': { bab: 'medium', fort: 'good', ref: 'poor', will: 'good' },
    'oracle': { bab: 'medium', fort: 'poor', ref: 'poor', will: 'good' },
    'summoner': { bab: 'medium', fort: 'poor', ref: 'poor', will: 'good' },
    'witch': { bab: 'slow', fort: 'poor', ref: 'poor', will: 'good' },
    'vigilante': { bab: 'medium', fort: 'poor', ref: 'good', will: 'good' }
};

/**
 * Calculate BAB and Base Saves from an array of classes
 */
function getClassBaseStats(classes) {
    let totalBab = 0;
    let totalFort = 0;
    let totalRef = 0;
    let totalWill = 0;

    if (!Array.isArray(classes)) return { bab: 0, fort: 0, ref: 0, will: 0 };

    classes.forEach(c => {
        const className = (c.className || '').toLowerCase();
        const level = parseInt(String(c.level), 10);
        if (isNaN(level) || level <= 0) return;

        const data = CLASS_DATA[className] || CLASS_DATA['fighter']; 

        // BAB
        if (data.bab === 'full') totalBab += level;
        else if (data.bab === 'medium') totalBab += Math.floor(level * 0.75);
        else totalBab += Math.floor(level * 0.5);

        // Saves
        const good = GOOD_SAVES[level] || 0;
        const poor = POOR_SAVES[level] || 0;
        totalFort += data.fort === 'good' ? good : poor;
        totalRef += data.ref === 'good' ? good : poor;
        totalWill += data.will === 'good' ? good : poor;
    });

    return { bab: totalBab, fort: totalFort, ref: totalRef, will: totalWill };
}

/**
 * Safely get a property from an object regardless of case
 */
function getCaseInsensitiveProp(obj, propName) {
    if (!obj || typeof obj !== 'object' || !propName) return undefined;
    if (obj[propName] !== undefined) return obj[propName];
    const target = propName.toLowerCase();
    const key = Object.keys(obj).find(k => k.toLowerCase() === target);
    return key ? obj[key] : undefined;
}

/**
 * Calculates BAB from level and class type
 */
function calculateBAB(level, classType = 'average') {
    if (classType === 'full') return level;
    if (classType === 'medium') return Math.floor(level * 0.75);
    return Math.floor(level / 2);
}

/**
 * Calculates saves based on level and ability modifiers
 */
function calculateSaves(level, con, dex, wis, classType = 'balanced') {
    const safeLevel = Math.max(0, Math.min(level - 1, GOOD_SAVES.length - 1));
    return {
        fort: (classType === 'fort' ? GOOD_SAVES[safeLevel] : POOR_SAVES[safeLevel]) + con,
        ref: (classType === 'ref' ? GOOD_SAVES[safeLevel] : POOR_SAVES[safeLevel]) + dex,
        will: (classType === 'will' ? GOOD_SAVES[safeLevel] : POOR_SAVES[safeLevel]) + wis
    };
}
function calculateAverageHp(hpString) {
    if (!hpString || typeof hpString !== 'string') return 1;
    const match = hpString.match(/(\d+)d(\d+)\s*([+-]\s*\d+)?/);
    if (!match) {
        const singleNumber = parseInt(hpString, 10);
        return isNaN(singleNumber) ? 1 : singleNumber;
    }
    const numDice = parseInt(match[1], 10);
    const dieSize = parseInt(match[2], 10);
    // Remove all whitespace from the bonus part (e.g., " + 2" -> "+2") before parsing
    const bonus = match[3] ? parseInt(match[3].replace(/\s/g, ''), 10) : 0;
    return Math.floor(numDice * (dieSize + 1) / 2) + bonus;
}

/**
 * Retrieves ability modifier as a number
 */
function getAbilityModifier(score) {
    const numScore = parseInt(String(score).match(/-?\d+/)?.[0] || '10', 10);
    if (isNaN(numScore)) return 0;
    return Math.floor((numScore - 10) / 2);
}

/**
 * Helper to get property case-insensitively (matching frontend utility)
 */
function getCaseInsensitiveProp(obj, key) {
    if (!obj || typeof obj !== 'object' || !key) return undefined;
    const objKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    return objKey ? obj[objKey] : undefined;
}

/**
 * Calculates BAB from level and class type
 */
function calculateBAB(level, classType = 'average') {
    if (classType === 'full') return level;
    if (classType === 'medium') return Math.floor(level * 0.75);
    return Math.floor(level / 2);
}

/**
 * Calculates saves based on level and ability modifiers
 */
function calculateSaves(level, con, dex, wis, classType = 'balanced') {
    const safeLevel = Math.max(0, Math.min(level - 1, GOOD_SAVES.length - 1));
    return {
        fort: (classType === 'fort' ? GOOD_SAVES[safeLevel] : POOR_SAVES[safeLevel]) + con,
        ref: (classType === 'ref' ? GOOD_SAVES[safeLevel] : POOR_SAVES[safeLevel]) + dex,
        will: (classType === 'will' ? GOOD_SAVES[safeLevel] : POOR_SAVES[safeLevel]) + wis
    };
}

module.exports = function (db) {
    if (!db) throw new Error('[Combat Routes] Database not provided');

    // POST a new combatant to a specific fight
    router.post('/fights/:fightId/combatants', async (req, res) => {
        try {
            const { fightId } = req.params;
            
            // 1. Initialize payload
            let combatantData = {
                ...req.body,
                baseStats: req.body.baseStats || {},
                tempMods: req.body.tempMods || {},
                type: req.body.type || 'npc',
                name: req.body.name,
                initiative: req.body.initiative,
                initiativeMod: req.body.initiativeMod || 0,
                equipment: req.body.equipment?.length > 0 ? req.body.equipment : undefined,
                magicItems: req.body.magicItems?.length > 0 ? req.body.magicItems : undefined,
                classes: req.body.classes?.length > 0 ? req.body.classes : undefined,
                rules: req.body.rules?.length > 0 ? req.body.rules : undefined
            };

            // 2. IMMEDIATE ALIAS RESOLUTION ON INCOMING AI/FRONTEND PAYLOAD
            const aliases = {
                hp: ['hp', 'HP', 'Hit Points', 'Hit Dice', 'HD'],
                maxHp: ['maxHp', 'MaxHP', 'hp', 'HP', 'Hit Points'],
                ac: ['ac', 'AC', 'Armor Class'],
                bab: ['bab', 'BAB', 'Base Atk', 'Base Attack'],
                saves: ['saves', 'Saves', 'Saving Throws'],
                class: ['class', 'Class'],
                level: ['level', 'Level'],
                cr: ['cr', 'CR', 'Challenge Rating']
            };

            Object.entries(aliases).forEach(([stdKey, aliasList]) => {
                let foundVal;
                // Check baseStats first, then root level
                for (const alias of aliasList) {
                    foundVal = getCaseInsensitiveProp(combatantData.baseStats, alias) || getCaseInsensitiveProp(combatantData, alias);
                    if (foundVal !== undefined) break;
                }
                
                // If found, standardize it on the combatantData payload so it doesn't get overwritten
                if (foundVal !== undefined) {
                    combatantData.baseStats[stdKey] = foundVal;
                    combatantData[stdKey] = foundVal;
                    console.log(`[Combat Manager] Payload Alias resolved: "${stdKey}" =`, foundVal);
                }
            });

            // 3. Entity Database Fallback Merge
            if (combatantData.entityId) {
                const query = { _id: toObjectId(combatantData.entityId) };
                const entity = await db.collection('entities_pf1e').findOne(query);

                if (!entity) {
                    return res.status(404).json({ message: `Entity with ID ${combatantData.entityId} not found.` });
                }

                combatantData.name = combatantData.name || entity.name;

                // Merge baseStats carefully: Do not overwrite payload stats with DB stats
                combatantData.baseStats = {
                    ...(entity.baseStats || {}),
                    ...combatantData.baseStats // AI Payload takes precedence
                };

                // Transfer fields from Entity ONLY if they are missing in the processed payload
                const fieldsToTransfer = [
                    'hp', 'maxHp', 'tempHp', 'nonLethalDamage', 'initiative', 'initiativeMod',
                    'tempMods', 'activeFeats', 'type', 'entityId', 'entity_id',
                    'preparedSpells', 'castSpells', 'spellSlots',
                    'specialAbilities', 'specialAttacks', 'vulnerabilities',
                    'equipment', 'magicItems', 'inventory', 'classes', 'rules', 'spells',
                    'saves', 'class', 'level', 'cr', 'feats', 'special_abilities',
                    'resist', 'immune', 'dr', 'sr', 'ac', 'bab'
                ];

                fieldsToTransfer.forEach(field => {
                    // Ignore the frontend "10" fallback for HP
                    const isDefaultHp = (field === 'hp' || field === 'maxHp') && combatantData[field] === 10;
                    
                    if (combatantData[field] === undefined || isDefaultHp) {
                        const currentBaseStats = combatantData.baseStats || {};
                        const fromBase = getCaseInsensitiveProp(currentBaseStats, field);

                        if (fromBase !== undefined) {
                            combatantData[field] = fromBase;
                            return;
                        }

                        const value = getCaseInsensitiveProp(entity, field);
                        const entityBaseStats = entity.baseStats || {};
                        const baseValue = getCaseInsensitiveProp(entityBaseStats, field);

                        if (value !== undefined) combatantData[field] = value;
                        else if (baseValue !== undefined) combatantData[field] = baseValue;
                    }
                });

                // Synthesize arrays and missing values
                ['equipment', 'magicItems', 'specialAbilities', 'specialAttacks', 'vulnerabilities', 'rules', 'activeFeats'].forEach(arrField => {
                    if (typeof combatantData[arrField] === 'string') {
                        combatantData[arrField] = combatantData[arrField].split(',').map(s => s.trim()).filter(Boolean);
                    }
                });

                if (!combatantData.classes || combatantData.classes.length === 0) {
                    const cls = getCaseInsensitiveProp(combatantData.baseStats, 'class') || getCaseInsensitiveProp(combatantData, 'class');
                    const lvl = getCaseInsensitiveProp(combatantData.baseStats, 'level') || getCaseInsensitiveProp(combatantData, 'level') || 1;
                    if (cls) {
                        combatantData.classes = [{ className: String(cls), level: parseInt(String(lvl), 10) || 1 }];
                    }
                }

                if ((combatantData.bab === undefined || combatantData.bab === null) && combatantData.classes && combatantData.classes.length > 0) {
                    let totalBab = 0;
                    combatantData.classes.forEach(c => {
                        const lowerCls = c.className.toLowerCase();
                        let type = 'medium';
                        if (['fighter', 'barbarian', 'paladin', 'ranger', 'cavalier', 'gunslinger', 'brawler', 'bloodrager', 'slayer', 'swashbuckler'].includes(lowerCls)) type = 'full';
                        else if (['wizard', 'sorcerer', 'witch', 'arcanist'].includes(lowerCls)) type = 'half';
                        totalBab += calculateBAB(c.level, type);
                    });
                    combatantData.bab = totalBab;
                }

                // STRICT HP PARSING
                let rawHp = combatantData.hp;
                if (typeof rawHp === 'string') {
                    const leadingNumMatch = rawHp.match(/^(\d+)/);
                    if (leadingNumMatch) {
                        combatantData.hp = parseInt(leadingNumMatch[1], 10);
                    } else {
                        combatantData.hp = calculateAverageHp(rawHp);
                    }
                }

                if (combatantData.hp === undefined || combatantData.hp === null || combatantData.hp === 10 || isNaN(combatantData.hp)) {
                    const hpString = getCaseInsensitiveProp(combatantData.baseStats, 'hp') || getCaseInsensitiveProp(combatantData.baseStats, 'HP') || '1d8';
                    combatantData.hp = calculateAverageHp(String(hpString));
                }

                let rawMaxHp = combatantData.maxHp;
                if (typeof rawMaxHp === 'string') {
                    const maxLeadingMatch = rawMaxHp.match(/^(\d+)/);
                    if (maxLeadingMatch) {
                        rawMaxHp = parseInt(maxLeadingMatch[1], 10);
                    } else {
                        rawMaxHp = calculateAverageHp(rawMaxHp);
                    }
                }
                
                if (!rawMaxHp || isNaN(rawMaxHp) || rawMaxHp === 10 || rawMaxHp < combatantData.hp) {
                    combatantData.maxHp = combatantData.hp;
                } else {
                    combatantData.maxHp = rawMaxHp;
                }
            }

            // Final fallback cleanups
            if (combatantData.initiative === undefined || combatantData.initiative === null) {
                combatantData.initiative = null;
            }

            combatantData.fightId = fightId;
            combatantData.effects = combatantData.effects || [];
            combatantData.tempMods = combatantData.tempMods || {};
            combatantData.classes = combatantData.classes || [];
            combatantData.equipment = combatantData.equipment || [];
            combatantData.magicItems = combatantData.magicItems || [];
            combatantData.rules = combatantData.rules || [];

            console.log(`[Combat Manager] Final insertion. HP: ${combatantData.hp}, AC: ${combatantData.ac}, Saves: ${combatantData.saves}`);

            const result = await db.collection('dm_toolkit_combatants').insertOne(combatantData);
            const newCombatant = await db.collection('dm_toolkit_combatants').findOne({ _id: result.insertedId });
            res.status(201).json(newCombatant);
        } catch (err) {
            console.error('[Combat Routes] Error creating combatant:', err);
            res.status(500).json({ message: 'Failed to create combatant', error: err.message });
        }
    });

    // GET all combatants for a specific fight
    router.get('/fights/:fightId/combatants', async (req, res) => {
        const { fightId } = req.params;
        try {
            const combatants = await db.collection('dm_toolkit_combatants').find({ fightId }).toArray();
            res.status(200).json(combatants);
        } catch (err) {
            console.error('[Combat Routes] Error fetching combatants:', err);
            res.status(500).json({ message: 'Failed to fetch combatants', error: err.message });
        }
    });

    // PATCH a combatant (update initiative, HP, etc.)
    router.patch('/combatants/:id', async (req, res) => {
        const { id } = req.params;
        const updates = req.body;
        try {
            const query = { _id: toObjectId(id) };
            const result = await db.collection('dm_toolkit_combatants').updateOne(query, { $set: updates });
            if (result.matchedCount === 0) {
                return res.status(404).json({ message: 'Combatant not found' });
            }
            const updatedCombatant = await db.collection('dm_toolkit_combatants').findOne(query);
            res.status(200).json(updatedCombatant);
        } catch (err) {
            console.error('[Combat Routes] Error updating combatant:', err);
            res.status(500).json({ message: 'Failed to update combatant', error: err.message });
        }
    });

    // DELETE a combatant
    router.delete('/combatants/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const query = { _id: toObjectId(id) };
            const result = await db.collection('dm_toolkit_combatants').deleteOne(query);
            if (result.deletedCount === 0) {
                return res.status(404).json({ message: 'Combatant not found' });
            }
            res.status(200).json({ message: 'Combatant deleted successfully' });
        } catch (err) {
            console.error('[Combat Routes] Error deleting combatant:', err);
            res.status(500).json({ message: 'Failed to delete combatant', error: err.message });
        }
    });

    // GET all fights
    router.get('/fights', async (req, res) => {
        try {
            const fights = await db.collection('dm_toolkit_fights').find({}).toArray();
            res.status(200).json(fights);
        } catch (err) {
            console.error('[Combat Routes] Error fetching fights:', err);
            res.status(500).json({ message: 'Failed to fetch fights', error: err.message });
        }
    });

    // POST a new fight
    router.post('/fights', async (req, res) => {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Fight name is required' });
        }
        const newFight = {
            name,
            round: 0,
            active: false,
            createdAt: new Date()
        };
        try {
            const result = await db.collection('dm_toolkit_fights').insertOne(newFight);
            const createdFight = await db.collection('dm_toolkit_fights').findOne({ _id: result.insertedId });
            res.status(201).json(createdFight);
        } catch (err) {
            console.error('[Combat Routes] Error creating fight:', err);
            res.status(500).json({ message: 'Failed to create fight', error: err.message });
        }
    });

    // DELETE a fight and all its combatants
    router.delete('/fights/:fightId', async (req, res) => {
        const { fightId } = req.params;
        try {
            const query = { _id: toObjectId(fightId) };
            await db.collection('dm_toolkit_combatants').deleteMany({ fightId });
            const result = await db.collection('dm_toolkit_fights').deleteOne(query);
            if (result.deletedCount === 0) {
                return res.status(404).json({ message: 'Fight not found' });
            }
            res.status(200).json({ message: 'Fight and all combatants deleted successfully' });
        } catch (err) {
            console.error('[Combat Routes] Error deleting fight:', err);
            res.status(500).json({ message: 'Failed to delete fight', error: err.message });
        }
    });

    // PATCH a fight (e.g., to advance rounds, toggle active status)
    router.patch('/fights/:fightId', async (req, res) => {
        const { fightId } = req.params;
        const updates = req.body;
        try {
            const query = { _id: toObjectId(fightId) };
            const result = await db.collection('dm_toolkit_fights').updateOne(query, { $set: updates });
            if (result.matchedCount === 0) {
                return res.status(404).json({ message: 'Fight not found' });
            }
            const updatedFight = await db.collection('dm_toolkit_fights').findOne(query);
            res.status(200).json(updatedFight);
        } catch (err) {
            console.error('[Combat Routes] Error updating fight:', err);
            res.status(500).json({ message: 'Failed to update fight', error: err.message });
        }
    });

    // PATCH /fights/:fightId/next-turn
    router.patch('/fights/:fightId/next-turn', async (req, res) => {
        const { fightId } = req.params;
        try {
            const query = ObjectId.isValid(fightId) ? { _id: new ObjectId(fightId) } : { _id: fightId };
            const fight = await db.collection('dm_toolkit_fights').findOne(query);
            if (!fight) return res.status(404).json({ message: 'Fight not found' });

            const combatants = await db.collection('dm_toolkit_combatants').find({ fightId }).toArray();
            // Sort by initiative desc, then initiativeMod (persisted) desc, then Dex mod desc, then Name asc
            combatants.sort((a, b) => {
                const initDiff = (b.initiative || 0) - (a.initiative || 0);
                if (initDiff !== 0) return initDiff;

                // 1. Prefer persisted initiativeMod (calculated by frontend with full logic)
                const modA = a.initiativeMod !== undefined ? a.initiativeMod : null;
                const modB = b.initiativeMod !== undefined ? b.initiativeMod : null;
                
                if (modA !== null && modB !== null) {
                    if (modB !== modA) return modB - modA;
                }

                // 2. Fallback: Calculate effective Dex modifier (Base + Temp)
                const getEffectiveDex = (c) => {
                    const base = parseInt(getCaseInsensitiveProp(c.baseStats, 'Dex') || '10', 10);
                    const temp = parseInt(getCaseInsensitiveProp(c.tempMods, 'Dex') || getCaseInsensitiveProp(c.tempMods, 'Dexterity') || '0', 10);
                    return getAbilityModifier(base + temp);
                };

                const dexA = getEffectiveDex(a);
                const dexB = getEffectiveDex(b);
                const dexDiff = dexB - dexA;
                if (dexDiff !== 0) return dexDiff;

                return a.name.localeCompare(b.name);
            });

            let nextIndex = (fight.currentTurnIndex || 0) + 1;
            let nextRound = fight.roundCounter || 1;

            if (nextIndex >= combatants.length) {
                nextIndex = 0;
                nextRound++;
            }

            const updates = {
                currentTurnIndex: nextIndex,
                roundCounter: nextRound
            };

            // Handling Effects Decrement
            const activeCombatant = combatants[nextIndex];
            if (activeCombatant && activeCombatant.effects && activeCombatant.effects.length > 0) {
                let effectsChanged = false;
                const updatedEffects = activeCombatant.effects.map(effect => {
                    if (effect.unit === 'rounds' && typeof effect.remainingRounds === 'number') {
                        // Only decrement if it's not permanent (though usually permanent has unit='minutes' or 'permanent', verify logic matches frontend)
                        // Frontend sets 999 for permanent, but unit is 'permanent'.
                        // Here we check unit === 'rounds'.
                        effectsChanged = true;
                        return { ...effect, remainingRounds: effect.remainingRounds - 1 };
                    }
                    return effect;
                });

                if (effectsChanged) {
                    await db.collection('dm_toolkit_combatants').updateOne(
                        { _id: activeCombatant._id },
                        { $set: { effects: updatedEffects } }
                    );
                    console.log(`[Combat Routes] Decremented effects for ${activeCombatant.name}`);
                }
            }

            await db.collection('dm_toolkit_fights').updateOne(query, { $set: updates });
            const updatedFight = await db.collection('dm_toolkit_fights').findOne(query);
            res.status(200).json(updatedFight);

        } catch (err) {
            console.error('[Combat Routes] Error advancing turn:', err);
            res.status(500).json({ message: 'Failed to advance turn', error: err.message });
        }
    });

    // PATCH /fights/:fightId/previous-turn
    router.patch('/fights/:fightId/previous-turn', async (req, res) => {
        const { fightId } = req.params;
        try {
            const query = ObjectId.isValid(fightId) ? { _id: new ObjectId(fightId) } : { _id: fightId };
            const fight = await db.collection('dm_toolkit_fights').findOne(query);
            if (!fight) return res.status(404).json({ message: 'Fight not found' });

            const combatants = await db.collection('dm_toolkit_combatants').find({ fightId }).toArray();
            
            // Sort to ensure we handle the right combatant (mirroring next-turn)
            combatants.sort((a, b) => {
                const initDiff = (b.initiative || 0) - (a.initiative || 0);
                if (initDiff !== 0) return initDiff;
                const modA = a.initiativeMod !== undefined ? a.initiativeMod : (getAbilityModifier(getCaseInsensitiveProp(a.baseStats, 'Dex') || 10) + (a.tempMods?.Dex || 0));
                const modB = b.initiativeMod !== undefined ? b.initiativeMod : (getAbilityModifier(getCaseInsensitiveProp(b.baseStats, 'Dex') || 10) + (b.tempMods?.Dex || 0));
                if (modB !== modA) return modB - modA;
                return a.name.localeCompare(b.name);
            });

            const currentIndex = fight.currentTurnIndex || 0;
            const revertingCombatant = combatants[currentIndex];

            let prevIndex = currentIndex - 1;
            let prevRound = fight.roundCounter || 1;

            if (prevIndex < 0) {
                prevRound = Math.max(1, prevRound - 1);
                prevIndex = Math.max(0, combatants.length - 1);
            }

            // Handling Effects Reversal (Increment back)
            if (revertingCombatant && revertingCombatant.effects && revertingCombatant.effects.length > 0) {
                let effectsChanged = false;
                const updatedEffects = revertingCombatant.effects.map(effect => {
                    if (effect.unit === 'rounds' && typeof effect.remainingRounds === 'number') {
                        effectsChanged = true;
                        return { ...effect, remainingRounds: effect.remainingRounds + 1 };
                    }
                    return effect;
                });

                if (effectsChanged) {
                    await db.collection('dm_toolkit_combatants').updateOne(
                        { _id: revertingCombatant._id },
                        { $set: { effects: updatedEffects } }
                    );
                    console.log(`[Combat Routes] Reverted effects for ${revertingCombatant.name}`);
                }
            }

            const updates = {
                currentTurnIndex: prevIndex,
                roundCounter: prevRound
            };

            await db.collection('dm_toolkit_fights').updateOne(query, { $set: updates });
            const updatedFight = await db.collection('dm_toolkit_fights').findOne(query);
            res.status(200).json(updatedFight);

        } catch (err) {
            console.error('[Combat Routes] Error reverting turn:', err);
            res.status(500).json({ message: 'Failed to revert turn', error: err.message });
        }
    });

    // PATCH /fights/:fightId/end-combat
    router.patch('/fights/:fightId/end-combat', async (req, res) => {
        const { fightId } = req.params;
        try {
            const query = { _id: toObjectId(fightId) };

            const updates = {
                combatStartTime: null,
                roundCounter: 1,
                currentTurnIndex: 0,
                active: false
            };

            await db.collection('dm_toolkit_fights').updateOne(query, { $set: updates });
            const updatedFight = await db.collection('dm_toolkit_fights').findOne(query);
            res.status(200).json(updatedFight);

        } catch (err) {
            console.error('[Combat Routes] Error ending combat:', err);
            res.status(500).json({ message: 'Failed to end combat', error: err.message });
        }
    });

    return router;
};