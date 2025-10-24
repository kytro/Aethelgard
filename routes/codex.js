const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

module.exports = function(db) {

  // This endpoint fetches all codex entries.
  router.get('/data', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
      const entries = await db.collection('codex_entries').find({}).toArray();
      // We can also check for the old collection and return an error if it still exists
      const oldCollection = await db.listCollections({ name: 'codex' }).hasNext();
      if (oldCollection) {
        return res.status(428).json({ 
            error: 'Migration Incomplete',
            message: 'The old \'codex\' collection still exists. Please run the migration from the Data Integrity page.' 
        });
      }
      res.json(entries);
    } catch (error) {
      console.error('Failed to fetch codex entries:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // This endpoint replaces/updates codex entries from the frontend editor.
  router.put('/data', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
      const entries = req.body;
      if (!Array.isArray(entries)) return res.status(400).json({ error: 'Request body must be an array of codex entries.' });

      // Build bulk ops that replace entries by their path_components (unique hierarchical key).
      const bulkOps = entries.map(entry => {
        // Ensure path_components exists and is an array
        const path = Array.isArray(entry.path_components) ? entry.path_components : [];
        // Clone the entry and remove any _id to avoid accidental ObjectId mismatches on insert
        const entryClone = { ...entry };
        delete entryClone._id;
        return {
          replaceOne: {
            filter: { path_components: path },
            replacement: entryClone,
            upsert: true
          }
        };
      });

      if (bulkOps.length === 0) return res.status(400).json({ error: 'No codex entries provided.' });

      await db.collection('codex_entries').bulkWrite(bulkOps, { ordered: false });
      res.status(200).json({ message: 'Codex entries saved successfully.' });
    } catch (error) {
      console.error('Failed to save codex entries:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // This endpoint fetches specific entities by their IDs. (No change)
  router.post('/get-entities', async (req, res) => {
    const { entityIds } = req.body;
    if (!Array.isArray(entityIds) || entityIds.length === 0) {
      return res.status(400).json({ error: 'entityIds must be a non-empty array.' });
    }
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
      const ids = entityIds.map(id => {
        if (ObjectId.isValid(id)) {
          return new ObjectId(id);
        }
        return id;
      });

      const entities = await db.collection('entities_pf1e').find({
        _id: { $in: ids }
      }).toArray();
      
      res.json(entities);
    } catch (error) {
      console.error('Failed to fetch linked entities:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // NEW: This endpoint fetches full documents for rules and equipment by their IDs. (No change)
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

  // This endpoint updates a single entity. (No change)
  router.put('/entities/:id', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
      const { id } = req.params;
      const updatedEntity = req.body;
      
      delete updatedEntity._id;

      const result = await db.collection('entities_pf1e').updateOne(
        { _id: new ObjectId(id) },
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

  // Endpoint to update the completion status of a codex item.
  router.patch('/item', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
      const { path, isCompleted } = req.body;
      if (!Array.isArray(path) || path.length === 0) {
        return res.status(400).json({ error: 'Path must be a non-empty array.' });
      }

      const result = await db.collection('codex_entries').updateOne(
        { path_components: path },
        { $set: { isCompleted: isCompleted } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Codex item not found at the specified path.' });
      }

      res.status(200).json({ message: 'Codex item updated successfully.' });
    } catch (error) {
      console.error('Failed to update codex item:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Endpoint to update settings for a category (e.g., completion tracking, combat manager source).
  router.patch('/category', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
      const { category, enableCompletionTracking, isCombatManagerSource } = req.body;

      // Allow empty string for root, but not null/undefined.
      if (category === undefined || category === null) {
        return res.status(400).json({ error: 'Category is required.' });
      }

      // An empty category string refers to the root, which has an empty path_components array.
      const path = category ? category.split('.') : [];

      const updateFields = {};
      if (typeof enableCompletionTracking === 'boolean') {
        updateFields.enableCompletionTracking = enableCompletionTracking;
      }
      if (typeof isCombatManagerSource === 'boolean') {
        updateFields.isCombatManagerSource = isCombatManagerSource;
      }

      if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({ error: 'No valid setting provided to update.' });
      }

      const result = await db.collection('codex_entries').updateOne(
        { path_components: path },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Codex category not found at the specified path.' });
      }

      res.status(200).json({ message: 'Category setting updated successfully.' });
    } catch (error) {
      console.error('Failed to update category setting:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Endpoint to search for entities by name.
  router.get('/search-entities', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ error: 'Name query parameter is required.' });
    }
    try {
      // Using a regex for a case-insensitive search
      const entities = await db.collection('entities_pf1e').find({
        name: { $regex: new RegExp(name, 'i') }
      }).toArray();
      res.json(entities);
    } catch (error) {
      console.error('Failed to search entities:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
