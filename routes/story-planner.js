const express = require('express');
const router = express.Router();

module.exports = function(db) {

  router.post('/suggest', async (req, res) => {
    const { context, model } = req.body;

    if (!context) {
      return res.status(400).json({ error: 'Context is required.' });
    }
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
      const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
      const activeKeyId = apiKeysDoc?.active_key_id;
      const activeKey = apiKeysDoc?.keys?.find(k => k.id === activeKeyId);
      const apiKey = activeKey?.key;
      
      if (!apiKey) {
        return res.status(500).json({ error: 'Gemini API key is not configured in the database.' });
      }

      const generalSettings = await db.collection('settings').findOne({ _id: 'general' });
      const defaultModel = generalSettings?.default_ai_model || 'models/gemini-pro';
      const modelId = (model || defaultModel).replace('models/', '');

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

      const systemPrompt = `
        You are a master storyteller and game master for a Pathfinder 1e campaign.
        Based on the provided context of what has happened in the story so far, generate a list of 3-5 creative and engaging plot hooks or story branches.
        Each suggestion should be a single, concise sentence.
        Respond with ONLY a valid JSON object with a single key "suggestions" which is an array of strings. Do not include explanations or markdown formatting.
        
        Example response:
        {
          "suggestions": [
            "The mysterious map leads to a hidden temple of a forgotten god.",
            "A rival adventuring party is also seeking the treasure shown on the map.",
            "The goblin king's dying words were a curse that now affects the party."
          ]
        }
      `;

      const payload = {
        contents: [{
          parts: [{ text: `${systemPrompt}\n\nStory Context: ${context}` }]
        }]
      };
                  
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
      
      const suggestions = JSON.parse(responseText.replace(/```json|```/g, '').trim());
      
      res.json(suggestions);

    } catch (error) {
      console.error('[Story Planner] Error:', error);
      res.status(500).json({ error: `Failed to get suggestions: ${error.message}` });
    }
  });

  return router;
};
