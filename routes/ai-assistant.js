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

      if (!apiKey) {
        console.error('[AI] Gemini API key not found in database.');
        return res.status(500).json({ error: 'Gemini API key is not configured in the database.' });
      }

      // FIX: Use the correct, current model name in the API URL
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

      const systemPrompt = `
        You are a database expert for a MongoDB database. Your task is to convert a natural language command into a MongoDB update operation.
        The user will provide a command referencing a collection and a document's '_id'.
        You MUST respond ONLY with a valid JSON object in the following format, with no other text, explanations, or markdown formatting.
        {
          "collection": "collection_name",
          "filter": { "_id": "document_id" },
          "update": { "$set": { "field.to.update": "new_value" } }
        }
        If the user's _id looks like a 24-character hex string, assume it is an ObjectId. Otherwise, treat it as a string.
        Use dot notation for nested fields.
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
  router.post('/execute-update', async (req, res) => {
    const { collection, filter, update } = req.body;
    if (!collection || !filter || !update) {
      return res.status(400).json({ error: 'Invalid update payload.' });
    }
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
      const collection_ = db.collection(collection);
      if (filter._id && ObjectId.isValid(filter._id)) {
        filter._id = new ObjectId(filter._id);
      }
      
      const result = await collection_.updateOne(filter, update);
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: `Document not found in collection '${collection}'.` });
      }
      
      const successMessage = `Successfully updated document in '${collection}'.`;
      console.log(`[AI] ${successMessage}`);
      res.status(200).json({ message: successMessage });

    } catch (err) {
      console.error('[AI] Failed to execute update:', err);
      res.status(500).json({ error: `Update failed: ${err.message}` });
    }
  });

  return router;
};