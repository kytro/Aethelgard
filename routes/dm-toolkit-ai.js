const express = require('express');
const router = express.Router();

// This helper function now lives on the server
async function fetchFromGemini(apiKey, query, type, options = {}) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    let prompt = '';
    
    // Build the prompt based on the request type
    switch(type) {
        case 'assistant':
            prompt = `You are a helpful assistant for a Game Master. Answer the following question based ONLY on the provided JSON data context. Do not use any outside knowledge. Question: "${query}"\n\nContext:\n${JSON.stringify(options.codex)}`;
            break;
        case 'npc-generation':
            prompt = `You are a fantasy world generator for a Pathfinder 1st Edition campaign. Based on the following context, generate NPCs for the user's request. Respond ONLY with a valid JSON array of objects. Each object must have "name", "race", "description", and "stats" keys. The "stats" must be an object with Str, Dex, Con, Int, Wis, Cha, with values from 3-18.\n\nUser Request: "${query}"\n\nContext:\n${JSON.stringify(options.codex)}`;
            break;
        case 'creature':
             prompt = `Find up to 5 Pathfinder 1st Edition creatures matching "${query}". They should be suitable for a party of ${options.pcCount} characters of level ${options.pcLevel}. Respond ONLY with a valid JSON array of objects. Each object must have "name", "cr", "hp", and "stats" (as a string like "Str 12, Dex 14...").`;
            break;
    }

    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        const errorBody = await response.json();
        const errorMessage = errorBody.error?.message || 'Unknown Gemini API Error';
        throw new Error(`Gemini API Error: ${errorMessage}`);
    }
    
    const result = await response.json();
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (type === 'assistant') {
        return responseText;
    } else {
        try {
            // Find the start and end of the JSON block
            const jsonStart = responseText.indexOf('```json');
            const jsonEnd = responseText.lastIndexOf('```');
            if (jsonStart !== -1 && jsonEnd > jsonStart) {
                const jsonString = responseText.substring(jsonStart + 7, jsonEnd).trim();
                return JSON.parse(jsonString);
            } else {
                return JSON.parse(responseText.trim());
            }
        } catch (e) {
            console.error('Failed to parse JSON from Gemini response:', responseText);
            throw new Error('Invalid JSON response from AI.');
        }
    }
}


module.exports = function(db) {
  router.post('/:type', async (req, res) => {
    const { type } = req.params;
    const { query, options } = req.body;

    try {
      const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
      const activeKeyId = apiKeysDoc?.active_key_id;
      const activeKey = apiKeysDoc?.keys?.find(k => k.id === activeKeyId);
      const apiKey = activeKey?.key;
      if (!apiKey) {
        return res.status(500).json({ error: 'Gemini API key not found in database.' });
      }
      
      const response = await fetchFromGemini(apiKey, query, type, options);
      
      res.json(response);

    } catch (error) {
      console.error(`[AI Toolkit Error - ${type}]:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};