const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();
const { toObjectId } = require('../utils/db-helpers');

const GOOD_SAVES = [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17];
const POOR_SAVES = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10];

/**
 * Calculates average HP from a dice string (e.g., "4d10+8" => 30)
 */
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
            let combatantData = req.body;

            // If an entityId is provided, fetch the source entity to get its baseStats.
            if (combatantData.entityId) {
                const query = { _id: toObjectId(combatantData.entityId) };
                const entity = await db.collection('entities_pf1e').findOne(query);

                // If the entity is not found, it's a critical error. Abort and send an error.
                if (!entity) {
                    console.error(`[Combat Manager] Could not find source entity for ID: ${combatantData.entityId}`);
                    return res.status(404).json({ message: `Entity with ID ${combatantData.entityId} not found.` });
                }

                // Merge properties: incoming baseStats should override/supplement entity baseStats
                combatantData.baseStats = {
                    ...(entity.baseStats || {}),
                    ...(combatantData.baseStats || {})
                };
                combatantData.name = entity.name;

                // Transfer all relevant entity fields to combatant
                const fieldsToTransfer = [
                    'ac', 'hp', 'bab', 'init', 'fort', 'ref', 'will',
                    'melee', 'ranged', 'cmb', 'cmd', 'speed', 'senses',
                    'level', 'cr', 'type', 'classes', 'tags', 'alignment', 'race',
                    'equipment', 'magicItems', 'inventory', 'spells', 'spellbook', 'spellSlots',
                    'feats', 'special_abilities', 'specialAbilities', 'special_attacks', 'specialAttacks',
                    'rules', 'vulnerabilities', 'resist', 'immune', 'dr', 'sr'
                ];

                fieldsToTransfer.forEach(field => {
                    // If the field exists on the entity (top-level) and not on combatant, copy it
                    // We check both lowercase and pascal case for some fields just in case
                    if (combatantData[field] === undefined) {
                        // 1. Check if it exists in the *already merged* combatantData.baseStats
                        // (This catches values calculated by the frontend, e.g. BAB, AC)
                        const currentBaseStats = combatantData.baseStats || {};
                        // Check lowercase, PascalCase, and ALL CAPS (common in PF1e like BAB, AC, HP)
                        const fromBase = currentBaseStats[field]
                            || currentBaseStats[field.charAt(0).toUpperCase() + field.slice(1)]
                            || currentBaseStats[field.toUpperCase()];

                        if (fromBase !== undefined) {
                            combatantData[field] = fromBase;
                            return;
                        }

                        // 2. Fallback to Source Entity
                        const value = entity[field] || entity[field.charAt(0).toUpperCase() + field.slice(1)];
                        // Also check entity.baseStats for these fields as a fallback
                        const entityBaseStats = entity.baseStats || {};
                        const baseValue = entityBaseStats[field]
                            || entityBaseStats[field.charAt(0).toUpperCase() + field.slice(1)]
                            || entityBaseStats[field.toUpperCase()];

                        if (value !== undefined) combatantData[field] = value;
                        else if (baseValue !== undefined) combatantData[field] = baseValue;
                    }
                });

                const baseStats = combatantData.baseStats;

                // Log what stats we're transferring for debugging
                console.log(`[Combat Manager] Adding: ${entity.name}`);
                console.log(`[Combat Manager] Ability Scores:`, {
                    Str: baseStats.Str || baseStats.str,
                    Dex: baseStats.Dex || baseStats.dex,
                    Con: baseStats.Con || baseStats.con,
                    Int: baseStats.Int || baseStats.int,
                    Wis: baseStats.Wis || baseStats.wis,
                    Cha: baseStats.Cha || baseStats.cha
                });
                console.log(`[Combat Manager] Skills:`, baseStats.Skills || baseStats.skills || {});
                console.log(`[Combat Manager] Classes:`, combatantData.classes || []);
                console.log(`[Combat Manager] Equipment:`, (combatantData.equipment || []).length, 'items');
                console.log(`[Combat Manager] Magic Items:`, (combatantData.magicItems || []).length, 'items');

                // Recalculate HP on the server based on official stats for consistency.
                const hpValue = calculateAverageHp(baseStats.HP || baseStats.hp || '1d8');
                combatantData.hp = hpValue;
                combatantData.maxHp = hpValue;
            }

            // Default to 0 initiative if not provided
            if (combatantData.initiative === undefined || combatantData.initiative === null) {
                combatantData.initiative = null;
            }

            // Set defaults for required fields
            combatantData.fightId = fightId;
            combatantData.effects = combatantData.effects || [];
            combatantData.tempMods = combatantData.tempMods || {};

            console.log(`[Combat Manager] Final combatantData to insert:`, {
                name: combatantData.name,
                hp: combatantData.hp,
                bab: combatantData.bab,
                ac: combatantData.ac,
                classes: combatantData.classes,
                hasBaseStats: !!combatantData.baseStats
            });

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
            // Sort by initiative desc, then Dex mod desc, then Name asc
            combatants.sort((a, b) => {
                const initDiff = (b.initiative || 0) - (a.initiative || 0);
                if (initDiff !== 0) return initDiff;

                const dexA = getAbilityModifier(a.baseStats?.Dex || 10);
                const dexB = getAbilityModifier(b.baseStats?.Dex || 10);
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
            const query = { _id: toObjectId(fightId) };
            const fight = await db.collection('dm_toolkit_fights').findOne(query);
            if (!fight) return res.status(404).json({ message: 'Fight not found' });

            const combatants = await db.collection('dm_toolkit_combatants').find({ fightId }).toArray();

            let prevIndex = (fight.currentTurnIndex || 0) - 1;
            let prevRound = fight.roundCounter || 1;

            if (prevIndex < 0) {
                prevRound = Math.max(1, prevRound - 1);
                prevIndex = Math.max(0, combatants.length - 1);
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