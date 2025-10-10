const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

// --- HELPERS (adapted from frontend) ---
const GOOD_SAVES = [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17];
const POOR_SAVES = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10];

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

const calculateCompleteBaseStats = (stats) => {
    const newStats = { ...(stats || {}) };
    const abilities = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
    abilities.forEach(ability => { if (typeof newStats[ability] === 'undefined') newStats[ability] = 10; });

    const strMod = getAbilityModifierAsNumber(newStats.Str);
    const dexMod = getAbilityModifierAsNumber(newStats.Dex);
    const conMod = getAbilityModifierAsNumber(newStats.Con);

    if (typeof newStats.AC === 'string') {
        const acMatch = newStats.AC.match(/^(\d+)/);
        const touchMatch = newStats.AC.match(/touch\s*(\d+)/);
        const ffMatch = newStats.AC.match(/flat-footed\s*(\d+)/);
        if (acMatch) newStats.AC = parseInt(acMatch[1], 10);
        if (touchMatch) newStats.Touch = parseInt(touchMatch[1], 10);
        if (ffMatch) newStats['Flat-Footed'] = parseInt(ffMatch[1], 10);
    }
    if (typeof newStats.AC !== 'number') newStats.AC = 10 + dexMod;
    if (typeof newStats.Touch !== 'number') newStats.Touch = 10 + dexMod;
    if (typeof newStats['Flat-Footed'] !== 'number') newStats['Flat-Footed'] = newStats.AC - dexMod;

    if (!newStats.Saves) {
        const level = parseInt(String(newStats.Level || newStats.CR || 1), 10);
        const safeLevelIndex = Math.max(0, Math.min(level - 1, GOOD_SAVES.length - 1));
        const baseFort = POOR_SAVES[safeLevelIndex] + conMod;
        const baseRef = POOR_SAVES[safeLevelIndex] + dexMod;
        const baseWill = POOR_SAVES[safeLevelIndex] + getAbilityModifierAsNumber(newStats.Wis);
        const formatMod = (mod) => mod >= 0 ? `+${mod}` : String(mod);
        newStats.Saves = `Fort ${formatMod(baseFort)}, Ref ${formatMod(baseRef)}, Will ${formatMod(baseWill)}`;
    }

    if (!newStats.Speed) newStats.Speed = '30 ft.';
    if (typeof newStats.BAB !== 'number') newStats.BAB = parseInt(String(newStats['Base Attack Bonus'] || newStats.BAB || 0).match(/-?\d+/)?.[0] || '0', 10);
    if (typeof newStats.CMB !== 'number') newStats.CMB = newStats.BAB + strMod;
    if (typeof newStats.CMD !== 'number') newStats.CMD = 10 + newStats.BAB + strMod + dexMod;
    
    const hpValue = newStats.hp || newStats.HP || '1d8';
    const avgHpMatch = String(hpValue).match(/^(\d+)/);
    const diceInParenMatch = String(hpValue).match(/\(\s*(\d+d\d+[+-]?\s*\d*\s*)\)/);
    if (avgHpMatch) newStats.maxHp = parseInt(avgHpMatch[1], 10);
    else if (diceInParenMatch) newStats.maxHp = calculateAverageHp(diceInParenMatch[1]);
    else newStats.maxHp = calculateAverageHp(String(hpValue));
    if (isNaN(newStats.maxHp) || newStats.maxHp <= 0) newStats.maxHp = 10;

    return newStats;
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
    const result = await db.collection('dm_toolkit_fights').insertOne({ name, createdAt: new Date(), roundCounter: 1, currentTurnIndex: 0, combatStartTime: null });
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

  router.post('/fights/:fightId/combatants', async (req, res) => {
    const { fightId } = req.params;
    let combatantData = req.body;

    if (combatantData.entityId) {
        const entity = await db.collection('entities_pf1e').findOne(getIdQuery(combatantData.entityId));
        if (entity) {
            const stats = calculateCompleteBaseStats(entity.baseStats);
            combatantData.name = entity.name;
            combatantData.stats = stats;
            combatantData.hp = stats.maxHp;
            combatantData.maxHp = stats.maxHp;
        }
    }
    
    if (!combatantData.initiative) {
        const dexMod = combatantData.stats ? getAbilityModifierAsNumber(combatantData.stats.Dex) : 0;
        combatantData.initiative = Math.floor(Math.random() * 20) + 1 + dexMod;
    }

    combatantData.fightId = fightId;
    combatantData.effects = [];
    combatantData.tempMods = {};
    combatantData.activeFeats = [];

    const result = await db.collection('dm_toolkit_combatants').insertOne(combatantData);
    const newCombatant = await db.collection('dm_toolkit_combatants').findOne({ _id: result.insertedId });
    res.status(201).json(newCombatant);
  });

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
    const { id: bodyId, ...updateData } = req.body;
    await db.collection('dm_toolkit_sessions').updateOne(getIdQuery(id), { $set: updateData });
    res.sendStatus(200);
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