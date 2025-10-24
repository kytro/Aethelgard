const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

// --- HELPERS ---
const getAbilityModifierAsNumber = (score) => {
    const numScore = parseInt(String(score).match(/-?\d+/)?.[0] || '10', 10);
    if (isNaN(numScore)) return 0;
    return Math.floor((numScore - 10) / 2);
};

const calculateAverageHp = (diceString) => {
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

const getIdQuery = (id) => (ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id });

module.exports = function(db) {

    // --- Fights ---
    router.get('/fights', async (req, res) => {
        const fights = await db.collection('dm_toolkit_fights').find().sort({ createdAt: -1 }).toArray();
        res.json(fights);
    });

    router.post('/fights', async (req, res) => {
        const { name } = req.body;
        const result = await db.collection('dm_toolkit_fights').insertOne({ name, createdAt: new Date(), roundCounter: 1, currentTurnIndex: 0, combatStartTime: null, log: [] });
        const newFight = await db.collection('dm_toolkit_fights').findOne({ _id: result.insertedId });
        res.status(201).json(newFight);
    });

    router.delete('/fights/:id', async (req, res) => {
        const { id } = req.params;
        await db.collection('dm_toolkit_fights').deleteOne(getIdQuery(id));
        await db.collection('dm_toolkit_combatants').deleteMany({ fightId: id });
        res.sendStatus(204);
    });
    
    router.patch('/fights/:id', async (req, res) => {
        const { id } = req.params;
        const { id: bodyId, ...updateData } = req.body; 
        await db.collection('dm_toolkit_fights').updateOne(getIdQuery(id), { $set: updateData });
        const fight = await db.collection('dm_toolkit_fights').findOne(getIdQuery(id));
        res.status(200).json(fight);
    });

    // --- Combatants ---
    router.get('/fights/:fightId/combatants', async (req, res) => {
        const { fightId } = req.params;
        const combatants = await db.collection('dm_toolkit_combatants').find({ fightId }).sort({ initiative: -1, name: 1 }).toArray();
        res.json(combatants);
    });

    // ==================== FULLY CORRECTED ROUTE START ====================
    router.post('/fights/:fightId/combatants', async (req, res) => {
        const { fightId } = req.params;
        let combatantData = req.body;

        // If an entityId is provided, fetch the source entity to get its stats.
        if (combatantData.entityId) {
            // THE CORE FIX: Query against '_id' which matches your database schema.
            const entity = await db.collection('entities_pf1e').findOne({ _id: combatantData.entityId });

            // If the entity is not found, it's a critical error. Abort and send an error.
            if (!entity) {
                console.error(`[Combat Manager] Could not find source entity for ID: ${combatantData.entityId}`);
                return res.status(404).json({ message: `Entity with ID ${combatantData.entityId} not found.` });
            }
            
            // Directly copy the stats and other canonical data from the database.
            const stats = entity.baseStats || {};
            combatantData.name = entity.name;
            combatantData.stats = stats;

            // Recalculate HP on the server based on official stats for consistency.
            const hpValue = calculateAverageHp(stats.HP || stats.hp || '1d8');
            combatantData.hp = hpValue;
            combatantData.maxHp = hpValue;
        }

        // For all combatants (including Custom ones), guarantee a `stats` object exists.
        if (!combatantData.stats) {
            combatantData.stats = {};
        }

        // Roll initiative if it wasn't provided by the client.
        if (combatantData.initiative === undefined || combatantData.initiative === null) {
            const dexMod = getAbilityModifierAsNumber(combatantData.stats.Dex || combatantData.stats.dex);
            combatantData.initiative = Math.floor(Math.random() * 20) + 1 + (dexMod || 0);
        }

        // Set default empty values for other fields to ensure a consistent document structure.
        combatantData.fightId = fightId;
        combatantData.effects = combatantData.effects || [];
        combatantData.tempMods = combatantData.tempMods || {};
        combatantData.activeFeats = combatantData.activeFeats || [];

        // Insert the prepared combatant data into the database.
        try {
            const result = await db.collection('dm_toolkit_combatants').insertOne(combatantData);
            const newCombatant = await db.collection('dm_toolkit_combatants').findOne({ _id: result.insertedId });
            res.status(201).json(newCombatant);
        } catch (error) {
            console.error("Failed to insert new combatant:", error);
            res.status(500).json({ message: "Failed to create combatant in the database." });
        }
    });
    // ===================== FULLY CORRECTED ROUTE END =====================

    router.patch('/combatants/:id', async (req, res) => {
        const { id } = req.params;
        const { id: bodyId, ...updateData } = req.body;
        await db.collection('dm_toolkit_combatants').updateOne(getIdQuery(id), { $set: updateData });
        res.sendStatus(200);
    });
    
    router.delete('/combatants/:id', async (req, res) => {
        const { id } = req.params;
        await db.collection('dm_toolkit_combatants').deleteOne(getIdQuery(id));
        res.sendStatus(204);
    });

    // --- Special Fight Actions ---
    router.patch('/fights/:id/end-combat', async (req, res) => {
        const { id } = req.params;
        await db.collection('dm_toolkit_fights').updateOne(getIdQuery(id), { $set: { combatStartTime: null, roundCounter: 1, currentTurnIndex: 0 } });
        
        const combatants = await db.collection('dm_toolkit_combatants').find({ fightId: id }).toArray();
        for (const c of combatants) {
            const permanentEffects = (c.effects || []).filter(e => e.unit === 'permanent');
            await db.collection('dm_toolkit_combatants').updateOne(getIdQuery(c._id), { $set: { effects: permanentEffects, activeFeats: [] } });
        }
        
        const fight = await db.collection('dm_toolkit_fights').findOne(getIdQuery(id));
        res.status(200).json(fight);
    });

    router.patch('/fights/:id/next-turn', async (req, res) => {
        const { id } = req.params;
        const fight = await db.collection('dm_toolkit_fights').findOne(getIdQuery(id));
        if (!fight) return res.status(404).json({ error: 'Fight not found' });

        const combatants = await db.collection('dm_toolkit_combatants').find({ fightId: id }).toArray();
        if (combatants.length === 0) return res.status(200).json(fight);

        let newIndex = (fight.currentTurnIndex || 0) + 1;
        let newRound = fight.roundCounter || 1;

        if (newIndex >= combatants.length) {
            newIndex = 0;
            newRound++;
            // Update effect durations
            for (const c of combatants) {
                const updatedEffects = (c.effects || [])
                    .map(e => (e.unit === 'rounds' && e.startRound < newRound) ? {...e, remainingRounds: e.remainingRounds - 1} : e)
                    .filter(e => e.unit !== 'rounds' || e.remainingRounds > 0);
                if (JSON.stringify(updatedEffects) !== JSON.stringify(c.effects)) {
                    await db.collection('dm_toolkit_combatants').updateOne(getIdQuery(c._id), { $set: { effects: updatedEffects } });
                }
            }
        }
        
        await db.collection('dm_toolkit_fights').updateOne(getIdQuery(id), { $set: { currentTurnIndex: newIndex, roundCounter: newRound } });
        const updatedFight = await db.collection('dm_toolkit_fights').findOne(getIdQuery(id));
        res.status(200).json(updatedFight);
    });
    
    router.patch('/fights/:id/previous-turn', async (req, res) => {
        const { id } = req.params;
        const fight = await db.collection('dm_toolkit_fights').findOne(getIdQuery(id));
        if (!fight) return res.status(404).json({ error: 'Fight not found' });

        const combatants = await db.collection('dm_toolkit_combatants').find({ fightId: id }).toArray();
        if (combatants.length === 0) return res.status(200).json(fight);

        let newIndex = (fight.currentTurnIndex || 0) - 1;
        let newRound = fight.roundCounter || 1;

        if (newIndex < 0) {
            newRound--;
            if (newRound < 1) {
                newRound = 1;
                newIndex = 0;
            } else {
                newIndex = combatants.length - 1;
            }
        }
        
        await db.collection('dm_toolkit_fights').updateOne(getIdQuery(id), { $set: { currentTurnIndex: newIndex, roundCounter: newRound } });
        const updatedFight = await db.collection('dm_toolkit_fights').findOne(getIdQuery(id));
        res.status(200).json(updatedFight);
    });
    
    // --- Sessions ---
    router.get('/sessions', async (req, res) => {
        const sessions = await db.collection('dm_toolkit_sessions').find().sort({ createdAt: -1 }).toArray();
        res.json(sessions);
    });

    router.post('/sessions', async (req, res) => {
        const result = await db.collection('dm_toolkit_sessions').insertOne({ title: '', notes: '', createdAt: new Date() });
        const newSession = await db.collection('dm_toolkit_sessions').findOne({ _id: result.insertedId });
        res.status(201).json(newSession);
    });

    router.patch('/sessions/:id', async (req, res) => {
        const { id } = req.params;
        const { _id, ...updateData } = req.body; // Destructure and exclude _id
        await db.collection('dm_toolkit_sessions').updateOne(getIdQuery(id), { $set: updateData });
        res.status(200).json({ message: 'Session updated successfully.' });
    });
    
    router.delete('/sessions/:id', async (req, res) => {
        const { id } = req.params;
        await db.collection('dm_toolkit_sessions').deleteOne(getIdQuery(id));
        res.sendStatus(204);
    });

    router.post('/fights/:id/migrate', async (req, res) => {
        const { id } = req.params;
        const fight = await db.collection('dm_toolkit_fights').findOne(getIdQuery(id));
        if (!fight) return res.status(404).json({ error: 'Fight not found' });

        if (fight.initialCombatants && fight.initialCombatants.length > 0) {
            console.log(`Migrating ${fight.initialCombatants.length} combatants for fight: ${fight.name}`);
            const combatantsToInsert = fight.initialCombatants.map(c => ({
                ...c,
                fightId: id,
                initiative: 10,
                effects: [],
                tempMods: {},
                activeFeats: []
            }));
            await db.collection('dm_toolkit_combatants').insertMany(combatantsToInsert);
            await db.collection('dm_toolkit_fights').updateOne(getIdQuery(id), { $unset: { initialCombatants: "" } });
            console.log(`Migration successful for fight: ${fight.name}`);
            res.status(200).json({ message: 'Migration successful' });
        } else {
            res.status(200).json({ message: 'No migration needed' });
        }
    });

    return router;
};