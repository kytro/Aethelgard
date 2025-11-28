const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

module.exports = function (db) {

  // GET /codex/api/admin/settings/api-keys
  // Fetches the entire API keys document, creating it if it doesn't exist.
  router.get('/settings/api-keys', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
      let doc = await db.collection('settings').findOne({ _id: 'api_keys' });
      if (!doc) {
        const newDoc = { _id: 'api_keys', keys: [], active_key_id: null };
        await db.collection('settings').insertOne(newDoc);
        doc = newDoc;
      }
      res.json(doc);
    } catch (e) {
      console.error('[SETTINGS] GET api-keys:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /codex/api/admin/settings/api-keys
  // Adds a new API key to the list
  router.post('/settings/api-keys', async (req, res) => {
    const { name, key } = req.body;
    if (!name || !key) {
      return res.status(400).json({ error: '`name` and `key` are required' });
    }
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    
    try {
      const newKey = { id: new ObjectId().toString(), name, key };
      
      const result = await db.collection('settings').findOneAndUpdate(
        { _id: 'api_keys' },
        { 
          $push: { keys: newKey },
          // If there is no active key, make this new one active.
          $setOnInsert: { active_key_id: newKey.id } 
        },
        { upsert: true, returnDocument: 'after' }
      );

      // If an existing doc was updated and had no active key, set this one.
      if (result.value && !result.value.active_key_id) {
        await db.collection('settings').updateOne(
            { _id: 'api_keys' },
            { $set: { active_key_id: newKey.id } }
        );
      }

      res.status(201).json(newKey);
    } catch (e) {
      console.error('[SETTINGS] POST api-keys:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /codex/api/admin/settings/api-keys/:id
  // Deletes an API key by its ID
  router.delete('/settings/api-keys/:id', async (req, res) => {
    const { id } = req.params;
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
        const doc = await db.collection('settings').findOne({ _id: 'api_keys' });
        if (!doc) return res.status(404).json({ error: 'API keys document not found.' });

        const keyToDelete = doc.keys.find(k => k.id === id);
        if (!keyToDelete) return res.status(404).json({ error: 'Key not found.' });

        const update = { $pull: { keys: { id: id } } };
        
        // If the deleted key was the active one, pick a new active key
        if (doc.active_key_id === id) {
            const remainingKeys = doc.keys.filter(k => k.id !== id);
            update.$set = { active_key_id: remainingKeys.length > 0 ? remainingKeys[0].id : null };
        }

        await db.collection('settings').updateOne({ _id: 'api_keys' }, update);

        res.status(200).json({ message: 'API key deleted successfully.' });
    } catch (e) {
        console.error('[SETTINGS] DELETE api-key:', e);
        res.status(500).json({ error: e.message });
    }
  });

  // POST /codex/api/admin/settings/set-active
  // Sets a key as the active one to be used.
  router.post('/settings/set-active', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: '`id` is required' });
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
        const doc = await db.collection('settings').findOne({ _id: 'api_keys' });
        if (!doc || !doc.keys.some(k => k.id === id)) {
            return res.status(404).json({ error: 'Key ID not found.' });
        }

        await db.collection('settings').updateOne(
            { _id: 'api_keys' },
            { $set: { active_key_id: id } }
        );
        res.status(200).json({ message: 'Active key updated.' });
    } catch (e) {
        console.error('[SETTINGS] POST set-active:', e);
        res.status(500).json({ error: e.message });
    }
  });

  // ==================== NEW ROUTES START HERE ====================

  // GET /codex/api/admin/settings/general
  // Fetches the general settings document, creating a default one if it doesn't exist.
  router.get('/settings/general', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    try {
      let generalSettings = await db.collection('settings').findOne({ _id: 'general' });

      // If no general settings doc exists, create a default one
      if (!generalSettings) {
        console.log("[SETTINGS] No general settings found, creating default document.");
        const defaultSettings = {
          _id: 'general',
          default_ai_model: 'models/gemini-1.5-flash' // A safe default
        };
        await db.collection('settings').insertOne(defaultSettings);
        generalSettings = defaultSettings;
      }

      res.json(generalSettings);
    } catch (err) {
      console.error('[SETTINGS] Error fetching general settings:', err);
      res.status(500).json({ error: 'Failed to fetch general settings.' });
    }
  });

  // POST /codex/api/admin/settings/general
  // Updates (or creates) the general settings document.
  router.post('/settings/general', async (req, res) => {
    const { default_ai_model } = req.body;
    if (!default_ai_model) {
        return res.status(400).json({ error: 'default_ai_model is required.' });
    }
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
        await db.collection('settings').updateOne(
            { _id: 'general' },
            { $set: { default_ai_model: default_ai_model } },
            { upsert: true } // Creates the document if it doesn't exist
        );
        res.status(200).json({ message: 'General settings updated successfully.' });
    } catch (err) {
        console.error('[SETTINGS] Error updating general settings:', err);
        res.status(500).json({ error: 'Failed to update general settings.' });
    }
  });

  // ===================== NEW ROUTES END HERE =====================

  return router;
};