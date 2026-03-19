/**
 * Generation API v1
 * 
 * Provides automated content generation using the AI service.
 */

const express = require('express');
const router = express.Router();
const defaultAiService = require('../services/aiService');
const npcPromptBuilder = require('../utils/npc-prompt-builder');

module.exports = function (db, verifyToken, aiService = defaultAiService) {
    const { generateContent } = aiService;
    if (verifyToken) {
        router.use(verifyToken);
    }

    /**
     * @swagger
     * /generation/npc:
     *   post:
     *     summary: Generate a full NPC using AI
     *     tags: [Generation]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               npc:
     *                 type: object
     *                 required: [name]
     *                 properties:
     *                   name:
     *                     type: string
     *                   class:
     *                     type: string
     *                   level:
     *                     type: integer
     *                   race:
     *                     type: string
     *                   context:
     *                     type: string
     *               options:
     *                 type: object
     *                 properties:
     *                   existingEntityNames:
     *                     type: array
     *                     items:
     *                       type: string
     *     responses:
     *       201:
     *         description: NPC generated successfully
     */
    // POST /api/v1/generation/npc
    router.post('/npc', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const { npc, options = {} } = req.body;
            if (!npc || !npc.name) {
                return res.status(400).json({ success: false, error: 'NPC data with "name" is required', instruction: 'Provide an "npc" object with at least a "name".' });
            }

            // --- 1. Prompt Construction for Feature Parity ---
            const creatureType = (npc.type || npc.race || '').toLowerCase();
            const typeInstructions = npcPromptBuilder.getTypeInstructions(creatureType);
            const spellInstructions = npcPromptBuilder.getSpellInstructions(npc.class, npc.level);

            // Context and Constraints
            let nameConstraint = '';
            if (options.existingEntityNames?.length > 0) nameConstraint = `Avoid these names: ${options.existingEntityNames.slice(0, 20).join(', ')}.`;
            let worldContext = options.codex ? `Context: ${JSON.stringify(options.codex)}` : '';
            if (npc.context) worldContext += `\nAdditional Context: ${npc.context}`;

            const prompt = `You are a Pathfinder 1e Expert NPC Generator. ${nameConstraint} ${worldContext}
Generate a JSON object for an NPC named "${npc.name}" (${npc.race || 'any race'} ${npc.class || 'any class'} Level ${npc.level || 1}).

${spellInstructions}
${typeInstructions}

CRITICAL: Return a JSON object with this EXACT structure:
{
  "entity": {
    "name": "${npc.name}",
    "tags": ["${npc.race || 'npc'}", "${npc.class || 'class'}"],
    "baseStats": {
      "HP": "string (e.g. 10d10+20)",
      "AC": number,
      "race": "string",
      "alignment": "string",
      "class": "string (Legacy)",
      "level": number (Legacy),
      "classes": [
        { "className": "string", "level": number }
      ],
      "Str": number, "Dex": number, "Con": number, "Int": number, "Wis": number, "Cha": number,
      "saves": {
        "fortitude": number,
        "reflex": number,
        "will": number
      },
      "combat": {
        "bab": number,
        "cmb": number,
        "cmd": number
      },
      "skills": { "Skill Name": number },
      "feats": ["Feat Name 1", "Feat Name 2"]
    },
    "spellbook": [
        { "level": 0, "slots": 4, "prepared": ["Spell Name 1", "Spell Name 2"] },
        { "level": 1, "slots": 3, "prepared": ["Spell Name 3"] }
    ],
    "spells": { "0": ["Known Spell 1"], "1": ["Known Spell 2"] },
    "facts": {
        "alignment": "string",
        "deity": "string",
        "race": "string"
    },
    "inventory": [{"name": "Item Name", "type": "gear", "quantity": 1}],
    "special_abilities": ["Ability Description 1", "Ability Description 2"],
    "immune": "string (optional)",
    "dr": "string (optional)",
    "sr": "number (optional)",
    "senses": "string (optional)"
  },
  "codex": {
    "name": "${npc.name}",
    "summary": "Short 1-sentence summary",
    "content": [
      { "type": "paragraph", "text": "Detailed physical description..." },
      { "type": "paragraph", "text": "Backstory and personality..." },
      { "type": "heading", "text": "Tactics", "level": 3 },
      { "type": "paragraph", "text": "Combat tactics..." }
    ]
  }
}
All stats MUST be accurate for PF1e rules.`;

            // 2. Call AI Service
            // We reuse the existing service but need to correctly pass arguments
            const aiResult = await generateContent(db, prompt, {
                systemInstruction: 'You are a strict JSON generator for Pathfinder 1e.',
                jsonMode: true
            });

            // 3. Validate AI Output
            if (!aiResult.entity || !aiResult.codex) {
                throw new Error('AI failed to generate valid entity/codex structure');
            }

            // 4. Create Entity
            const entityData = { ...aiResult.entity, name: npc.name }; // Ensure name matches
            const entityResult = await db.collection('entities_pf1e').insertOne(entityData);
            const entityId = entityResult.insertedId;

            // 5. Create Codex Entry
            const pathComponents = ['People', npc.name].map(segment =>
                segment.trim().replace(/[\/\\<>:"|?*\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
            );

            const codexData = {
                ...aiResult.codex,
                name: npc.name,
                path_components: pathComponents,
                entity_id: entityId.toString()
            };

            // Check if path exists, if so, append random suffix to avoid collision?
            const existing = await db.collection('codex_entries').findOne({ path_components: codexData.path_components });
            if (existing) {
                // Append ID to name components to make unique
                codexData.path_components[1] = `${npc.name} (${entityId.toString().slice(-4)})`;
            }

            const codexResult = await db.collection('codex_entries').insertOne(codexData);
            const codexEntry = await db.collection('codex_entries').findOne({ _id: codexResult.insertedId });

            // 6. Return Compound Result
            res.status(201).json({
                success: true,
                message: 'NPC generated successfully',
                data: {
                    entity: { ...entityData, _id: entityId },
                    codex: codexEntry
                }
            });

        } catch (error) {
            console.error('[Generation API] POST /npc error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/v1/generation/npc-details
    router.post('/npc-details', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const { options = {} } = req.body;
            const npc = options.npc;
            if (!npc || !npc.name) return res.status(400).json({ error: 'NPC data required' });

            const prompt = npcPromptBuilder.buildNpcDetailsPrompt(npc, options);
            const response = await generateContent(db, prompt, { jsonMode: true, systemInstruction: "You are a Pathfinder 1e Expert Assistant." });
            res.json(response);

        } catch (error) {
            console.error('[Generation API] POST /npc-details error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/v1/generation/story/suggest
    router.post('/story/suggest', async (req, res) => {
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
            console.error('[Generation API] POST /story/suggest error:', error);
            res.status(500).json({ error: `Failed to get suggestions: ${error.message}` });
        }
    });

    // POST /api/v1/generation/npc-candidates
    router.post('/npc-candidates', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const { query, options = {} } = req.body;
            if (!query) return res.status(400).json({ error: 'Query is required' });

            let nameConstraint = '';
            if (options.existingEntityNames?.length > 0) nameConstraint = `Avoid these names: ${options.existingEntityNames.slice(0, 20).join(', ')}.`;
            let worldContext = options.generationContext ? `Context: ${options.generationContext}` : '';

            const prompt = `You are a Pathfinder 1e NPC generator. ${nameConstraint} ${worldContext}
Based on: "${query}"
Generate a JSON array of NPCs matching EXACTLY the structure defined in npc-prompt-builder.js, but simplified for a list: [{ "name": "...", "race": "...", "type": "...", "class": "...", "level": number, "alignment": "...", "description": "...", "backstory": "..." }]`;

            const response = await generateContent(db, prompt, { jsonMode: true, systemInstruction: "You are a Pathfinder 1e Expert Assistant." });
            res.json(response);

        } catch (error) {
            console.error('[Generation API] POST /npc-candidates error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};
