const express = require('express');
const router = express.Router();
const { generateContent } = require('../services/geminiService');

module.exports = function (db) {

  router.post('/suggest', async (req, res) => {
    const { context, codexContext, sessionContext, codexStructure, model } = req.body;

    if (!context && !codexContext && !sessionContext) return res.status(400).json({ error: 'Context is required.' });
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    const systemPrompt = `
      You are a master storyteller and game master for a Pathfinder 1e campaign.
      Based on the provided context, generate a "Story Plan" consisting of 3-5 actionable elements (NPCs, Quests, Locations, Events).
      
      CRITICAL INSTRUCTION: You must respect the existing world structure.
      Existing Codex Paths: ${JSON.stringify(codexStructure || [])}
      
      When suggesting a "path" for a new element:
      1. Prefer using an existing folder if it fits perfectly.
      2. If creating a new folder, ensure it is a logical child of an existing root or category.
      3. Do NOT create entirely new root directories unless absolutely necessary.

      Output MUST be a valid JSON object with a single key "suggestions" containing an array of objects.
      Each object must have:
      - "type": One of "NPC", "Quest", "Location", "Event", "Hook"
      - "name": A creative name for the entry
      - "description": A concise description (2-3 sentences) explaining its role in the story.
      - "path": The suggested Codex folder path (e.g., "Locations/Cities/MyCity", "Quests/Side").
      - "data": An object containing specific details:
          - For NPCs: { "race": "...", "class": "...", "role": "...", "context": "..." } (Context is for the NPC generator)
          - For Quests: { "reward": "...", "difficulty": "..." }
          - For Locations: { "region": "...", "type": "..." }
          - For others: {}

      Context:
      ${context ? `User Input: ${context}` : ''}
      ${codexContext ? `World Context: ${codexContext}` : ''}
      ${sessionContext ? `Recent Events: ${sessionContext}` : ''}
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