const express = require('express');
const router = express.Router();
const { generateContent } = require('../services/geminiService');

module.exports = function(db) {

  router.post('/suggest', async (req, res) => {
    const { context, model } = req.body;

    if (!context) return res.status(400).json({ error: 'Context is required.' });
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    const systemPrompt = `
      You are a master storyteller and game master for a Pathfinder 1e campaign.
      Based on the provided context of what has happened in the story so far, generate a list of 3-5 creative and engaging plot hooks or story branches.
      Each suggestion should be a single, concise sentence.
      Respond with ONLY a valid JSON object with a single key "suggestions" which is an array of strings.
      
      Story Context: ${context}
    `;

    try {
      const result = await generateContent(db, systemPrompt, { model, jsonMode: true });
      res.json(result);
    } catch (error) {
      console.error('[Story Planner] Error:', error);
      res.status(500).json({ error: `Failed to get suggestions: ${error.message}` });
    }
  });

  return router;
};