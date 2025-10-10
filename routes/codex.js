const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

module.exports = function(db) {

  // This endpoint fetches the entire codex data structure.
  router.get('/data', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
      const codexDoc = await db.collection('codex').findOne({ _id: 'world_data' });
      if (!codexDoc) {
        return res.status(404).json({ error: 'Codex data not found in the database.' });
      }
      res.json(codexDoc);
    } catch (error) {
      console.error('Failed to fetch codex data:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // This endpoint updates the codex data.
  router.put('/data', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
      const newData = req.body;
      // Ensure the _id is not changed
      newData._id = 'world_data';
      await db.collection('codex').replaceOne({ _id: 'world_data' }, newData, { upsert: true });
      res.status(200).json({ message: 'Codex data updated successfully.' });
    } catch (error) {
      console.error('Failed to update codex data:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // This endpoint fetches specific entities by their IDs.
  router.post('/get-entities', async (req, res) => {
    const { entityIds } = req.body;
    if (!Array.isArray(entityIds) || entityIds.length === 0) {
      return res.status(400).json({ error: 'entityIds must be a non-empty array.' });
    }
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
      const entities = await db.collection('entities_pf1e').find({
        _id: { $in: entityIds }
      }).toArray();
      res.json(entities);
    } catch (error) {
      console.error('Failed to fetch linked entities:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // NEW: This endpoint fetches full documents for rules and equipment by their IDs.
  router.post('/get-linked-details', async (req, res) => {
    const { ruleIds, equipmentIds } = req.body;
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
      const rules = ruleIds && ruleIds.length > 0
        ? await db.collection('rules_pf1e').find({ _id: { $in: ruleIds } }).toArray()
        : [];
      
      const equipment = equipmentIds && equipmentIds.length > 0
        ? await db.collection('equipment_pf1e').find({ _id: { $in: equipmentIds } }).toArray()
        : [];

      res.json({ rules, equipment });
    } catch (error) {
      console.error('Failed to fetch linked details:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // This endpoint updates a single entity.
  router.put('/entities/:id', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
      const { id } = req.params;
      const updatedEntity = req.body;
      
      // remove _id from body so we don't try to update it
      delete updatedEntity._id;

      const result = await db.collection('entities_pf1e').updateOne(
        { _id: id },
        { $set: updatedEntity }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Entity not found.' });
      }
      res.status(200).json({ message: 'Entity updated successfully.' });
    } catch (error) {
      console.error('Failed to update entity:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};