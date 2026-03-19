/**
 * Spells API v1
 * 
 * interface Spell {
 *   name: string;
 *   school?: string;
 *   level?: string; // e.g. "sorcerer/wizard 3"
 *   castingTime?: string;
 *   range?: string;
 *   duration?: string;
 *   save?: string;
 *   sr?: string;
 *   description?: string;
 * }
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

function validateSpell(spell) {
    const errors = [];

    if (!spell.name || typeof spell.name !== 'string' || spell.name.trim() === '') {
        errors.push({
            error: 'Spell must have a non-empty "name" string',
            instruction: 'Add a "name" field to the spell object.'
        });
    }

    // Optional validations for standard fields to ensure they are strings if present
    const stringFields = ['school', 'level', 'castingTime', 'range', 'duration', 'save', 'sr', 'description'];
    for (const field of stringFields) {
        if (spell[field] !== undefined && typeof spell[field] !== 'string') {
            errors.push({
                error: `"${field}" must be a string`,
                instruction: `Ensure "${field}" contains text.`
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
     * /spells:
     *   get:
     *     summary: Retrieve a list of spells
     *     tags: [Spells]
     *     parameters:
     *       - in: query
     *         name: search
     *         schema:
     *           type: string
     *         description: Search by spell name
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *         description: Max number of results
     *       - in: query
     *         name: skip
     *         schema:
     *           type: integer
     *         description: Number of results to skip
     *     responses:
     *       200:
     *         description: A list of spells
     */
    // GET /api/v1/spells
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
                db.collection('spells_pf1e')
                    .find(query)
                    .sort({ [sort]: sortOrder })
                    .skip(skipNum)
                    .limit(limitNum)
                    .toArray(),
                db.collection('spells_pf1e').countDocuments(query)
            ]);

            res.json({
                success: true,
                data: items,
                meta: { count: items.length, skip: skipNum, limit: limitNum, total }
            });
        } catch (error) {
            console.error('[Spells API] GET / error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /spells/{id}:
     *   get:
     *     summary: Get a spell by ID
     *     tags: [Spells]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: The spell details
     *       404:
     *         description: Spell not found
     */
    // GET /api/v1/spells/:id
    router.get('/:id', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const { id } = req.params;
            const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
            const item = await db.collection('spells_pf1e').findOne(query);

            if (!item) {
                return res.status(404).json({ success: false, error: 'Spell not found' });
            }

            res.json({ success: true, data: item });
        } catch (error) {
            console.error('[Spells API] GET /:id error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /spells:
     *   post:
     *     summary: Create a new spell
     *     tags: [Spells]
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
     *               school:
     *                 type: string
     *               level:
     *                 type: string
     *               description:
     *                 type: string
     *     responses:
     *       201:
     *         description: Spell created
     */
    // POST /api/v1/spells
    router.post('/', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const spell = req.body;
            const validation = validateSpell(spell);

            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    instruction: validation.errors[0].instruction,
                    details: validation.errors
                });
            }

            const result = await db.collection('spells_pf1e').insertOne(spell);
            const inserted = await db.collection('spells_pf1e').findOne({ _id: result.insertedId });

            res.status(201).json({
                success: true,
                data: inserted,
                message: 'Spell created successfully'
            });
        } catch (error) {
            console.error('[Spells API] POST / error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /spells/{id}:
     *   put:
     *     summary: Update a spell
     *     tags: [Spells]
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
     *         description: Spell updated
     */
    // PUT /api/v1/spells/:id
    router.put('/:id', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const { id } = req.params;
            const updates = req.body;
            const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };

            if (updates.name !== undefined) {
                if (typeof updates.name !== 'string' || updates.name.trim() === '') {
                    return res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        instruction: 'Name cannot be empty.'
                    });
                }
            }

            delete updates._id;

            const result = await db.collection('spells_pf1e').findOneAndUpdate(
                query,
                { $set: updates },
                { returnDocument: 'after' }
            );

            if (!result) {
                return res.status(404).json({ success: false, error: 'Spell not found' });
            }

            res.json({
                success: true,
                data: result,
                message: 'Spell updated successfully'
            });
        } catch (error) {
            console.error('[Spells API] PUT /:id error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /spells/{id}:
     *   delete:
     *     summary: Delete a spell
     *     tags: [Spells]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Spell deleted
     */
    // DELETE /api/v1/spells/:id
    router.delete('/:id', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const { id } = req.params;
            const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
            const result = await db.collection('spells_pf1e').deleteOne(query);

            if (result.deletedCount === 0) {
                return res.status(404).json({ success: false, error: 'Spell not found' });
            }

            res.json({
                success: true,
                message: 'Spell deleted successfully'
            });
        } catch (error) {
            console.error('[Spells API] DELETE /:id error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};
