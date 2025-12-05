const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

module.exports = function (db) {

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

      // First, collect all paths and their required parent paths
      const allPaths = new Set();
      const parentOps = [];

      for (const entry of entries) {
        const path = Array.isArray(entry.path_components) ? entry.path_components : [];
        allPaths.add(JSON.stringify(path));

        // Generate parent paths that need to exist
        for (let i = 1; i < path.length; i++) {
          const parentPath = path.slice(0, i);
          const parentKey = JSON.stringify(parentPath);
          if (!allPaths.has(parentKey)) {
            allPaths.add(parentKey);
            // Create an upsert for parent that only creates if missing (doesn't overwrite existing)
            parentOps.push({
              updateOne: {
                filter: { path_components: parentPath },
                update: {
                  $setOnInsert: {
                    name: parentPath[parentPath.length - 1],
                    path_components: parentPath
                  }
                },
                upsert: true
              }
            });
          }
        }
      }

      // Build bulk ops for the actual entries that replace by their path_components
      const bulkOps = entries.map(entry => {
        const path = Array.isArray(entry.path_components) ? entry.path_components : [];
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

      // First ensure parent paths exist, then save the entries
      if (parentOps.length > 0) {
        await db.collection('codex_entries').bulkWrite(parentOps, { ordered: false });
      }
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

  // NEW: This endpoint fetches full documents for rules, equipment, AND SPELLS by their IDs.
  router.post('/get-linked-details', async (req, res) => {
    // Add spellIds to the destructuring
    const { ruleIds, equipmentIds, spellIds } = req.body;
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
      const rules = ruleIds && ruleIds.length > 0
        ? await db.collection('rules_pf1e').find({ _id: { $in: ruleIds } }).toArray()
        : [];

      const equipment = equipmentIds && equipmentIds.length > 0
        ? await db.collection('equipment_pf1e').find({ _id: { $in: equipmentIds } }).toArray()
        : [];

      // Add the query for spells
      const spells = spellIds && spellIds.length > 0
        ? await db.collection('spells_pf1e').find({ _id: { $in: spellIds } }).toArray()
        : [];

      // Return all three arrays
      res.json({ rules, equipment, spells });
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

      // Remove _id from the update object to prevent MongoDB errors
      delete updatedEntity._id;

      // Check if the ID is a valid 24-char hex string (MongoDB ObjectId format)
      const isValidObjectId = ObjectId.isValid(id) && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);

      // Try both ObjectId and string formats
      let result;
      if (isValidObjectId) {
        // Try ObjectId first
        result = await db.collection('entities_pf1e').updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedEntity }
        );
        // If not found, try as string
        if (result.matchedCount === 0) {
          result = await db.collection('entities_pf1e').updateOne(
            { _id: id },
            { $set: updatedEntity }
          );
        }
      } else {
        // ID is not a valid ObjectId format, use as string
        result = await db.collection('entities_pf1e').updateOne(
          { _id: id },
          { $set: updatedEntity }
        );
      }

      if (result.matchedCount === 0) {
        console.error(`[Entity Update] Entity not found with id: ${id}`);
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

  // AI Complete endpoint - suggests missing data for an entity based on PF1e rules
  router.post('/ai-complete', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    const { entityId } = req.body;
    if (!entityId) {
      return res.status(400).json({ error: 'entityId is required.' });
    }

    try {
      // 1. Fetch the entity
      const entity = await db.collection('entities_pf1e').findOne({
        _id: ObjectId.isValid(entityId) ? new ObjectId(entityId) : entityId
      });

      if (!entity) {
        return res.status(404).json({ error: 'Entity not found.' });
      }

      // 2. Get API key
      const apiKeysDoc = await db.collection('settings').findOne({ _id: 'api_keys' });
      const activeKey = apiKeysDoc?.keys?.find(k => k.id === apiKeysDoc.active_key_id);
      if (!activeKey?.key) {
        return res.status(500).json({ error: 'Gemini API key not configured.' });
      }

      // 3. Fetch available spells from collection for context
      const availableSpells = await db.collection('spells_pf1e').find({}).project({ _id: 1, name: 1 }).toArray();
      const spellNames = availableSpells.map(s => s.name);

      // 4. Fetch available equipment from collection
      const availableEquipment = await db.collection('equipment_pf1e').find({}).project({ _id: 1, name: 1 }).toArray();
      const equipmentNames = availableEquipment.map(e => e.name);


      // 5. Build the AI prompts (two-phase approach for better results)
      const baseStats = entity.baseStats || {};

      // Helper function to check if a value is "N/A", "Unknown", empty, or otherwise missing
      const isMissing = (val) => {
        if (val === null || val === undefined) return true;
        if (typeof val === 'string') {
          const lower = val.trim().toLowerCase();
          return lower === '' || lower === 'n/a' || lower === 'unknown' || lower === 'none' || lower === '?';
        }
        return false;
      };

      // Get values, treating N/A as missing
      const getVal = (primary, secondary, defaultVal) => {
        if (!isMissing(primary)) return primary;
        if (!isMissing(secondary)) return secondary;
        return defaultVal;
      };

      let entityClass = getVal(baseStats.class, baseStats.Class, 'Unknown');
      let level = getVal(baseStats.level, baseStats.Level, baseStats.CR || null);
      let race = getVal(baseStats.race, baseStats.Race, 'Unknown');
      let alignment = getVal(baseStats.alignment, baseStats.Alignment, 'Unknown');
      const existingSkills = baseStats.skills || {};
      const existingEquipment = entity.equipment || [];
      const existingSpells = entity.spells || {};
      const existingFeats = entity.rules || [];

      // Build a list of fields that need to be filled in
      const missingFields = [];
      if (isMissing(baseStats.class) && isMissing(baseStats.Class)) missingFields.push('class');
      if (isMissing(baseStats.level) && isMissing(baseStats.Level) && isMissing(baseStats.CR)) missingFields.push('level');
      if (isMissing(baseStats.alignment) && isMissing(baseStats.Alignment)) missingFields.push('alignment');
      if (isMissing(baseStats.race) && isMissing(baseStats.Race)) missingFields.push('race');

      // Get HP for level estimation
      const hp = baseStats.HP || baseStats.hp || baseStats.hitPoints || null;

      // Get API settings
      const generalSettings = await db.collection('settings').findOne({ _id: 'general' });
      const modelId = (generalSettings?.default_ai_model || 'gemini-1.5-flash').replace('models/', '');
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${activeKey.key}`;

      // Helper function to call Gemini API with retry for transient errors
      const callGemini = async (promptText, maxRetries = 3) => {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { response_mime_type: 'application/json' }
              })
            });

            if (!response.ok) {
              const errorBody = await response.json().catch(() => ({}));
              const errorMsg = errorBody.error?.message || response.statusText;

              // Retry on transient errors (503 overloaded, 429 rate limit)
              if ((response.status === 503 || response.status === 429) && attempt < maxRetries) {
                const delay = attempt * 2000; // 2s, 4s, 6s
                console.log(`[AI Complete] Gemini ${response.status}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
              throw new Error(`Gemini API Error: ${response.status} - ${errorMsg}`);
            }

            const result = await response.json();
            const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) throw new Error('No response from AI.');

            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
            const jsonString = jsonMatch ? jsonMatch[1] : responseText.trim();
            return JSON.parse(jsonString);
          } catch (e) {
            lastError = e;
            if (attempt < maxRetries && (e.message?.includes('503') || e.message?.includes('429'))) {
              const delay = attempt * 2000;
              console.log(`[AI Complete] Retry ${attempt}/${maxRetries} after error: ${e.message}`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            throw e;
          }
        }
        throw lastError;
      };

      // Inferred base stats from Phase 1
      let inferredBaseStats = {};

      // PHASE 1: Determine class, level, alignment, and race if missing
      if (missingFields.length > 0) {
        const phase1Prompt = `You are an expert Pathfinder 1st Edition (PF1e) game master.

I have a character/creature that is missing some key information. Based on the available data, determine the most appropriate values.

ENTITY DATA:
- Name: ${entity.name}
- Description: ${entity.description || 'None provided'}
${hp ? `- Hit Points: ${hp}` : ''}
- Size: ${baseStats.size || baseStats.Size || 'Unknown'}
- Ability Scores: Str ${baseStats.Str || '?'}, Dex ${baseStats.Dex || '?'}, Con ${baseStats.Con || '?'}, Int ${baseStats.Int || '?'}, Wis ${baseStats.Wis || '?'}, Cha ${baseStats.Cha || '?'}
- Current Class: ${entityClass}${missingFields.includes('class') ? ' (NEEDS DETERMINATION)' : ''}
- Current Level: ${level || 'Unknown'}${missingFields.includes('level') ? ' (NEEDS ESTIMATION)' : ''}
- Current Race: ${race}${missingFields.includes('race') ? ' (NEEDS DETERMINATION)' : ''}
- Current Alignment: ${alignment}${missingFields.includes('alignment') ? ' (NEEDS DETERMINATION)' : ''}

ESTIMATION GUIDELINES:
1. CLASS: Infer from name, description, and ability score distribution.
   - PC Classes: Fighter, Barbarian, Ranger, Paladin, Rogue, Bard, Cleric, Druid, Wizard, Sorcerer, Monk, etc.
   - NPC Classes: Aristocrat (nobles, merchants), Commoner (peasants, villagers), Expert (craftsmen, sailors), Warrior (guards, soldiers), Adept (hedge mages, shamans)
   - Hybrid/Multiclass: Use notation like "Fighter 3/Rogue 2" or "Cleric 5/Fighter 3" if description suggests mixed training
   - High Str = martial, High Int = wizard, High Wis = cleric/druid, High Cha = sorcerer/bard
   - Match the class to the entity's role in the world (a blacksmith is likely Expert, a town guard is Warrior, a noble is Aristocrat)
2. LEVEL: ${hp ? `Estimate from HP. Average HP = Level × (HitDie/2 + Constitution modifier). Fighter d10, Rogue d8, Wizard d6, Cleric d8, NPC classes: Warrior d10, others d8/d6.` : 'Use context clues from name/description. Default to level 1 if no clues.'}
3. RACE: Infer from name or description. Default to Human if unclear.
4. ALIGNMENT: Infer from name, description, or typical class alignments (Paladins are Lawful Good, Rogues often Chaotic, etc.)

RETURN FORMAT - Respond with ONLY a valid JSON object, no markdown:
{
  ${missingFields.includes('class') ? '"class": "Fighter",' : ''}
  ${missingFields.includes('level') ? '"level": 5,' : ''}
  ${missingFields.includes('race') ? '"race": "Human",' : ''}
  ${missingFields.includes('alignment') ? '"alignment": "Neutral",' : ''}
  "reasoning": "Brief explanation of how you determined these values"
}

Only include fields that were marked as "(NEEDS ...)" above.`;

        try {
          inferredBaseStats = await callGemini(phase1Prompt);
          console.log('[AI Complete] Phase 1 - Inferred base stats:', inferredBaseStats);

          // Update working values with inferred data
          if (inferredBaseStats.class) entityClass = inferredBaseStats.class;
          if (inferredBaseStats.level) level = inferredBaseStats.level;
          if (inferredBaseStats.race) race = inferredBaseStats.race;
          if (inferredBaseStats.alignment) alignment = inferredBaseStats.alignment;
        } catch (e) {
          console.error('[AI Complete] Phase 1 failed:', e);
          // Continue with defaults if phase 1 fails
        }
      }

      // PHASE 2: Suggest skills, feats, spells, equipment based on determined class/level
      const phase2Prompt = `You are an expert Pathfinder 1st Edition (PF1e) game master and rules expert.

I have a character/creature entity. Your task is to suggest ADDITIONS ONLY - do not change or remove existing data.

CURRENT ENTITY DATA:
- Name: ${entity.name}
- Class: ${entityClass}
- Level/CR: ${level || 1}
- Race: ${race}
- Size: ${baseStats.size || 'Medium'}
- Alignment: ${alignment}
- Ability Scores: Str ${baseStats.Str || 10}, Dex ${baseStats.Dex || 10}, Con ${baseStats.Con || 10}, Int ${baseStats.Int || 10}, Wis ${baseStats.Wis || 10}, Cha ${baseStats.Cha || 10}
- Existing Skills: ${JSON.stringify(existingSkills)}
- Existing Equipment IDs: ${existingEquipment.length} items
- Existing Spell Levels: ${Object.keys(existingSpells).join(', ') || 'None'}
- Existing Feats/Rules: ${existingFeats.length} items

AVAILABLE SPELLS IN DATABASE (use these exact names):
${spellNames.slice(0, 100).join(', ')}${spellNames.length > 100 ? '... and more' : ''}

AVAILABLE EQUIPMENT IN DATABASE (use these exact names):
${equipmentNames.slice(0, 100).join(', ')}${equipmentNames.length > 100 ? '... and more' : ''}

PATHFINDER 1E RULES - BE CONSERVATIVE:
1. SKILLS: Only add essential class skills that are MISSING. Don't add every possible skill.
   - Calculate bonus as: ranks + ability modifier + 3 (class skill)
   - Only add 3-5 key skills maximum

2. FEATS: Only suggest feats the entity is MISSING and QUALIFIES for.
   - Characters get 1 feat at level 1, then 1 every odd level (3, 5, 7...).
   - Fighters get bonus combat feats. Dragons get feats by HD.
   - Don't suggest feats the entity already has (Existing Feats above).
   - Maximum 2-3 new feats unless entity has none.

3. SPELLS: Only add if ${entityClass} is a spellcaster AND entity is missing spells.
   - If entity already has many spells, don't add more.
   - Only use spells from the AVAILABLE SPELLS list.

4. EQUIPMENT: Be very minimal. Dragons and monsters DON'T NEED equipment.
   - Only suggest for humanoid NPCs who need gear.
   - Maximum 2-3 essential items, not a full loadout.

5. SPELL SLOTS: Only add if explicitly needed. Follow PF1e spell progression.

6. SPECIAL ABILITIES: Only if the entity is clearly missing core racial/class abilities.

IMPORTANT: This dragon/creature likely already has most of what it needs. BE MINIMAL.

RETURN FORMAT - Respond with ONLY a valid JSON object, no markdown:
{
  "skills": { "SkillName": bonusValue },
  "equipment": ["item1"],
  "spells": { "0": ["spell1"] },
  "spellSlots": { "1": 3 },
  "feats": ["Feat Name"],
  "specialAbilities": ["Ability"],
  "notes": "Brief explanation"
}

Only include sections with NEW additions. Prefer fewer suggestions over comprehensive ones.`;

      // 6. Call Phase 2 Gemini API
      let aiSuggestions = {};
      let phase2Failed = false;
      try {
        aiSuggestions = await callGemini(phase2Prompt);
        console.log('[AI Complete] Phase 2 - AI suggestions:', Object.keys(aiSuggestions));
      } catch (e) {
        console.error('[AI Complete] Phase 2 failed:', e);
        phase2Failed = true;
        // If Phase 1 succeeded, we can still return those results
        if (Object.keys(inferredBaseStats).length === 0) {
          throw new Error('Failed to get AI suggestions.');
        }
        // Otherwise continue with empty Phase 2 results
        console.log('[AI Complete] Continuing with Phase 1 results only');
      }

      // 7. Build the additions object, combining Phase 1 and Phase 2 results
      const additions = {};

      // Base Stats - from Phase 1 inferred values
      if (missingFields.length > 0 && Object.keys(inferredBaseStats).length > 0) {
        additions.baseStats = {};
        if (missingFields.includes('class') && inferredBaseStats.class) {
          additions.baseStats.class = inferredBaseStats.class;
        }
        if (missingFields.includes('level') && inferredBaseStats.level) {
          additions.baseStats.level = inferredBaseStats.level;
        }
        if (missingFields.includes('alignment') && inferredBaseStats.alignment) {
          additions.baseStats.alignment = inferredBaseStats.alignment;
        }
        if (missingFields.includes('race') && inferredBaseStats.race) {
          additions.baseStats.race = inferredBaseStats.race;
        }
        // Include the reasoning from Phase 1
        if (inferredBaseStats.reasoning) {
          additions.baseStatsReasoning = inferredBaseStats.reasoning;
        }
        if (Object.keys(additions.baseStats).length === 0) delete additions.baseStats;
      }

      // Skills - only add new ones
      if (aiSuggestions.skills) {
        additions.skills = {};
        for (const [skillName, value] of Object.entries(aiSuggestions.skills)) {
          if (!existingSkills[skillName]) {
            additions.skills[skillName] = value;
          }
        }
        if (Object.keys(additions.skills).length === 0) delete additions.skills;
      }

      // Equipment - map names to IDs
      if (aiSuggestions.equipment?.length > 0) {
        const equipMap = new Map(availableEquipment.map(e => [e.name.toLowerCase(), e._id]));
        additions.equipment = aiSuggestions.equipment
          .map(name => equipMap.get(name.toLowerCase()))
          .filter(id => id && !existingEquipment.includes(id));
      }

      // Spells - map names to IDs
      if (aiSuggestions.spells && Object.keys(aiSuggestions.spells).length > 0) {
        const spellMap = new Map(availableSpells.map(s => [s.name.toLowerCase(), s._id]));
        additions.spells = {};
        for (const [level, spellList] of Object.entries(aiSuggestions.spells)) {
          const existingAtLevel = existingSpells[level] || [];
          const newSpellIds = spellList
            .map(name => spellMap.get(name.toLowerCase()))
            .filter(id => id && !existingAtLevel.includes(id));
          if (newSpellIds.length > 0) {
            additions.spells[level] = newSpellIds;
          }
        }
        if (Object.keys(additions.spells).length === 0) delete additions.spells;
      }

      // Spell slots
      if (aiSuggestions.spellSlots) {
        additions.spellSlots = aiSuggestions.spellSlots;
      }

      // Feats
      if (aiSuggestions.feats?.length > 0) {
        additions.feats = aiSuggestions.feats;
      }

      // Special abilities
      if (aiSuggestions.specialAbilities?.length > 0) {
        additions.specialAbilities = aiSuggestions.specialAbilities;
      }

      // Notes
      if (aiSuggestions.notes) {
        additions.notes = aiSuggestions.notes;
      }

      // Add warning if Phase 2 failed
      if (phase2Failed) {
        additions.notes = (additions.notes ? additions.notes + ' ' : '') +
          '⚠️ Note: AI service was overloaded. Only core stats were determined. Try again later for skills/equipment suggestions.';
      }

      // 9. Return the preview
      res.json({
        entityId: entity._id,
        entityName: entity.name,
        additions,
        original: {
          baseStats: {
            class: baseStats.class || baseStats.Class,
            level: baseStats.level || baseStats.Level || baseStats.CR,
            alignment: baseStats.alignment || baseStats.Alignment,
            race: baseStats.race || baseStats.Race
          },
          skills: existingSkills,
          equipment: existingEquipment,
          spells: existingSpells,
          spellSlots: entity.spell_slots || {}
        },
        missingFields
      });

    } catch (error) {
      console.error('[AI Complete] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
