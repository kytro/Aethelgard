/**
 * Entities API v1
 * 
 * interface Entity {
 *   name: string;
 *   baseStats?: {
 *     HP?: string; // e.g. "4d10+4"
 *     AC?: number;
 *     Str?: number;
 *     Dex?: number;
 *     // ... other stats
 *   };
 *   tags?: string[];
 *   facts?: Record<string, any>;
 * }
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();
const aiService = require('../services/aiService');
const npcPromptBuilder = require('../utils/npc-prompt-builder');

function validateEntity(entity) {
    const errors = [];

    if (!entity.name || typeof entity.name !== 'string' || entity.name.trim() === '') {
        errors.push({
            error: 'Entity must have a non-empty "name" string',
            instruction: 'Add a "name" field to the entity object.'
        });
    }

    if (entity.baseStats && typeof entity.baseStats !== 'object') {
        errors.push({
            error: '"baseStats" must be an object',
            instruction: 'Ensure "baseStats" is a JSON object containing stats like HP, AC, etc.'
        });
    }

    if (entity.baseStats && entity.baseStats.classes) {
        if (!Array.isArray(entity.baseStats.classes)) {
            errors.push({
                error: '"baseStats.classes" must be an array',
                instruction: 'Ensure "classes" is an array of objects matching { className: string, level: number }.'
            });
        } else {
            entity.baseStats.classes.forEach((c, i) => {
                if (typeof c.className !== 'string' || typeof c.level !== 'number') {
                    errors.push({
                        error: `Class entry at index ${i} is invalid`,
                        instruction: 'Each entry in "classes" must have "className" (string) and "level" (number).'
                    });
                }
            });
        }
    }

    if (entity.tags && !Array.isArray(entity.tags)) {
        errors.push({
            error: '"tags" must be an array of strings',
            instruction: 'Ensure "tags" is an array of strings.'
        });
    }

    if (entity.inventory && !Array.isArray(entity.inventory)) {
        errors.push({
            error: '"inventory" must be an array',
            instruction: 'Ensure "inventory" is an array of item objects.'
        });
    }

    if (entity.spellbook) {
        if (!Array.isArray(entity.spellbook)) {
            errors.push({
                error: '"spellbook" must be an array',
                instruction: 'Ensure "spellbook" is an array of spell objects.'
            });
        } else {
            entity.spellbook.forEach((entry, i) => {
                const missingFields = [];
                if (typeof entry.level !== 'number') missingFields.push('level (number)');
                if (typeof entry.slots !== 'number') missingFields.push('slots (number)');
                if (!Array.isArray(entry.prepared)) missingFields.push('prepared (array of strings)');

                if (missingFields.length > 0) {
                    errors.push({
                        error: `Spellbook entry at index ${i} is missing/invalid: ${missingFields.join(', ')}`,
                        instruction: 'Each spellbook entry must have "level", "slots", and "prepared" fields.'
                    });
                }
            });
        }
    }

    return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

module.exports = function (db, verifyToken) {
    if (verifyToken) {
        router.use(verifyToken);
    }

    /**
     * @swagger
     * /entities:
     *   get:
     *     summary: Retrieve a list of entities
     *     tags: [Entities]
     *     parameters:
     *       - in: query
     *         name: search
     *         schema:
     *           type: string
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *       - in: query
     *         name: skip
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: A list of entities
     */
    // GET /api/v1/entities
    router.get('/', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const { search, limit = 50, skip = 0, sort = 'name', order = 'asc' } = req.query;
            const query = {};

            if (search) {
                query.name = { $regex: search, $options: 'i' };
            }

            const limitNum = Math.min(Math.max(parseInt(limit) || 50, 1), 500);
            const skipNum = Math.max(parseInt(skip) || 0, 0);
            const sortOrder = order === 'desc' ? -1 : 1;

            const [items, total] = await Promise.all([
                db.collection('entities_pf1e')
                    .find(query)
                    .sort({ [sort]: sortOrder })
                    .skip(skipNum)
                    .limit(limitNum)
                    .toArray(),
                db.collection('entities_pf1e').countDocuments(query)
            ]);

            res.json({
                success: true,
                data: items,
                meta: { count: items.length, skip: skipNum, limit: limitNum, total }
            });
        } catch (error) {
            console.error('[Entities API] GET / error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /entities/{id}:
     *   get:
     *     summary: Get an entity by ID
     *     tags: [Entities]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: The entity details
     */
    // GET /api/v1/entities/:id
    router.get('/:id', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const { id } = req.params;
            const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
            const item = await db.collection('entities_pf1e').findOne(query);

            if (!item) {
                return res.status(404).json({ success: false, error: 'Entity not found' });
            }

            res.json({ success: true, data: item });
        } catch (error) {
            console.error('[Entities API] GET /:id error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /entities:
     *   post:
     *     summary: Create a new entity
     *     tags: [Entities]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [name]
     *             properties:
     *               name:
     *                 type: string
     *               baseStats:
     *                 type: object
     *               tags:
     *                 type: array
     *                 items:
     *                   type: string
     *     responses:
     *       201:
     *         description: Entity created
     */
    // POST /api/v1/entities
    router.post('/', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const entity = req.body;
            const validation = validateEntity(entity);

            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    instruction: validation.errors[0].instruction,
                    details: validation.errors
                });
            }

            const result = await db.collection('entities_pf1e').insertOne(entity);
            const inserted = await db.collection('entities_pf1e').findOne({ _id: result.insertedId });

            res.status(201).json({
                success: true,
                data: inserted,
                message: 'Entity created successfully'
            });
        } catch (error) {
            console.error('[Entities API] POST / error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /entities/{id}:
     *   put:
     *     summary: Update an entity
     *     tags: [Entities]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *     responses:
     *       200:
     *         description: Entity updated
     */
    // PUT /api/v1/entities/:id
    router.put('/:id', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const { id } = req.params;
            const updates = req.body;
            const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };

            // Ensure name is present if replacing, or merge? 
            // PUT generally implies replacement or update. We'll treat as update/upsert.
            // If it's a new object, validate it.

            const validation = validateEntity({ ...updates, name: updates.name || 'Placeholder' });
            // Note: Simplification. Ideally fetches existing if partial update, but PUT usually means "replace this resource".
            // Let's assume partial updates (PATCH style) or full replacement. 
            // For now, let's enforce name check only if it's provided or if creating new? 
            // Let's stick to: Update fields provided.

            if (updates.name !== undefined) {
                if (typeof updates.name !== 'string' || updates.name.trim() === '') {
                    return res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        instruction: 'Name cannot be empty.'
                    });
                }
            }

            delete updates._id; // Prevent _id update

            const result = await db.collection('entities_pf1e').findOneAndUpdate(
                query,
                { $set: updates },
                { returnDocument: 'after' }
            );

            if (!result) {
                return res.status(404).json({ success: false, error: 'Entity not found' });
            }

            res.json({
                success: true,
                data: result,
                message: 'Entity updated successfully'
            });
        } catch (error) {
            console.error('[Entities API] PUT /:id error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /entities/{id}:
     *   delete:
     *     summary: Delete an entity
     *     tags: [Entities]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Entity deleted
     */
    // DELETE /api/v1/entities/:id
    router.delete('/:id', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const { id } = req.params;
            const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
            const result = await db.collection('entities_pf1e').deleteOne(query);

            if (result.deletedCount === 0) {
                return res.status(404).json({ success: false, error: 'Entity not found' });
            }

            res.json({
                success: true,
                message: 'Entity deleted successfully'
            });
        } catch (error) {
            console.error('[Entities API] DELETE /:id error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /entities/batch:
     *   post:
     *     summary: Get multiple entities by ID
     *     tags: [Entities]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [ids]
     *             properties:
     *               ids:
     *                 type: array
     *                 items:
     *                   type: string
     *     responses:
     *       200:
     *         description: List of entities
     */
    // POST /api/v1/entities/batch
    router.post('/batch', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const { ids } = req.body;
            if (!Array.isArray(ids)) return res.status(400).json({ success: false, error: 'ids must be an array' });

            const objectIds = ids.map(id => {
                try { return new ObjectId(id); } catch { return null; }
            }).filter(id => id);

            const entities = await db.collection('entities_pf1e').find({ _id: { $in: objectIds } }).toArray();
            res.json({ success: true, count: entities.length, data: entities });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    /**
     * POST /api/v1/entities/:id/ai-complete
     * Suggests missing data for an entity using AI (migrated from codex.js).
     */
    router.post('/:id/ai-complete', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const { id } = req.params;
            const entity = await db.collection('entities_pf1e').findOne({ _id: new ObjectId(id) });
            if (!entity) return res.status(404).json({ success: false, error: 'Entity not found' });

            // 1. Prepare NPC metadata from existing entity
            const npc = {
                name: entity.name,
                class: entity.baseStats?.class || entity.facts?.class || 'Monster',
                level: entity.baseStats?.level || (entity.baseStats?.classes ? entity.baseStats.classes.reduce((acc, c) => acc + c.level, 0) : 1),
                race: entity.baseStats?.race || entity.facts?.race || 'Unknown',
                type: entity.tags?.join(', ') || 'Monster'
            };

            // 2. Build Prompt specifically for completions
            const prompt = npcPromptBuilder.buildAiCompletePrompt(npc, {
                currentEntity: entity
            });

            // 3. Call AI Service
            const suggestions = await aiService.generateContent(db, prompt, {
                systemInstruction: 'You are a strict JSON generator for Pathfinder 1e. Suggest realistic completions for missing fields.',
                jsonMode: true
            });

            // Return the structure expected by the frontend's aiCompletePreview signal
            res.json({
                entityId: id,
                additions: suggestions
            });

        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
};

module.exports.validateEntity = validateEntity;
