const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

// This function allows us to pass the database connection (db) from server.js
module.exports = function(db) {

  // This endpoint takes a natural language query and asks the Gemini API
  // to convert it into a MongoDB update operation.
  router.post('/generate-update', async (req, res) => {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required.' });
    }
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    console.log(`[AI] Received query: "${query}"`);

    try {
      // 1. Fetch the Gemini API key from the 'settings' collection in MongoDB
      const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
      const activeKeyId = apiKeysDoc?.active_key_id;
      const activeKey = apiKeysDoc?.keys?.find(k => k.id === activeKeyId);
      const apiKey = activeKey?.key;
      console.log(`[AI] Gemini API key loaded: ${apiKey ? apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4) : 'not found'}`);

      if (!apiKey) {
        console.error('[AI] Gemini API key not found in database.');
        return res.status(500).json({ error: 'Gemini API key is not configured in the database.' });
      }

      // FIX: Use the correct, current model name in the API URL
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

      const systemPrompt = `
        You are a database expert for a MongoDB database. Your task is to convert a natural language command into a MongoDB database operation.
        You MUST respond ONLY with a valid JSON object with no other text, explanations, or markdown formatting.

        Two types of operations are supported:
        1. Update an existing document.
        2. Insert a new document.

        If the user wants to 'create', 'new', or 'add' a new document (e.g., "create a new session"), respond with an 'insert' operation:
        {
          "collection": "collection_name",
          "insert": { "field1": "value1", "field2": "value2", "createdAt": "$NOW" }
        }
        - Always include a "createdAt": "$NOW" field for new documents, which the backend will convert to the current timestamp.

        If the user wants to 'update', 'modify', or 'change' an existing document, respond with an 'update' operation:
        {
          "collection": "collection_name",
          "filter": { "_id": "document_id" },
          "update": { "$operator": { "field.to.update": "new_value" } }
        }

        Available collections are: ["codex", "entities_pf1e", "equipment_pf1e", "rules_pf1e", "spells_pf1e", "deities_pf1e", "hazards_pf1e", "dm_toolkit_sessions", "dm_toolkit_fights", "dm_toolkit_combatants", "settings"].
        The user might use a shorthand for a collection name. You must choose the best match from the available collections list. For example, if the user says "session notes", you should use "dm_toolkit_sessions".

        For updates, the filter can be based on '_id' or any other field. If the user\'s _id looks like a 24-character hex string, assume it is an ObjectId. Otherwise, treat it as a string.

        For the update operation, you can use the following operators:
        - "$set": to add a new field or modify an existing one. Use dot notation for nested fields (e.g., "character.stats.strength"). This is the most common operation.
        - "$unset": to remove a field (e.g., { "$unset": { "temporary_bonus": "" } }).
        - "$push": to add an item to an array (e.g., { "$push": { "inventory": "item_id" } }).
        - "$pull": to remove an item from an array based on a condition.

        Always be careful to construct the correct field path using dot notation for nested objects.
      `;

      const payload = {
        contents: [{
          parts: [{ text: query }]
        }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        }
      };
      
      console.log('[AI] Sending request to Gemini API...');
      const geminiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!geminiResponse.ok) {
        const errorBody = await geminiResponse.text();
        throw new Error(`Gemini API request failed with status ${geminiResponse.status}: ${errorBody}`);
      }
      
      const result = await geminiResponse.json();
      
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error('Invalid response structure from Gemini API.');
      }
      
      const proposedUpdate = JSON.parse(responseText.replace(/```json|```/g, '').trim());
      
      console.log('[AI] Generated proposed update:', proposedUpdate);
      res.json(proposedUpdate);

    } catch (error) {
        console.error('[AI] Error in /generate-update:', error);
        res.status(500).json({ error: `Failed to generate update: ${error.message}` });
    }
  });
  
  // This endpoint takes the confirmed update object and executes it.
  router.post('/execute-operation', async (req, res) => {
    const { collection, filter, update, insert } = req.body;

    if (!collection || (!update && !insert)) {
      return res.status(400).json({ error: 'Invalid operation payload.' });
    }
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
      const targetCollection = db.collection(collection);

      // Handle INSERT operation
      if (insert) {
        if (insert.createdAt === '$NOW') {
          insert.createdAt = new Date();
        }
        const result = await targetCollection.insertOne(insert);
        const newDoc = await targetCollection.findOne({ _id: result.insertedId });
        const successMessage = `Successfully inserted document into '${collection}'.`;
        console.log(`[AI] ${successMessage}`);
        return res.status(201).json({ message: successMessage, document: newDoc });
      }

      // Handle UPDATE operation
      if (update) {
        if (!filter) {
          return res.status(400).json({ error: 'Filter is required for an update operation.' });
        }
        if (filter._id && ObjectId.isValid(filter._id)) {
          filter._id = new ObjectId(filter._id);
        }
        
        const result = await targetCollection.updateOne(filter, update);
        
        if (result.matchedCount === 0) {
          return res.status(404).json({ error: `Document not found in collection '${collection}'.` });
        }
        
        const successMessage = `Successfully updated document in '${collection}'.`;
        console.log(`[AI] ${successMessage}`);
        res.status(200).json({ message: successMessage });
      }

    } catch (err) {
      console.error('[AI] Failed to execute operation:', err);
      res.status(500).json({ error: `Operation failed: ${err.message}` });
    }
  });

  return router;
};