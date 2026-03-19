const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

/**
 * Rules API (Feats, common rules)
 */
module.exports = function (db, verifyToken) {
    if (verifyToken) {
        router.use(verifyToken);
    }

    /**
     * @swagger
     * /rules:
     *   get:
     *     summary: Retrieve a list of rules/feats
     *     tags: [Rules]
     *     responses:
     *       200:
     *         description: A list of rules
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     */
    // GET all rules
    router.get('/', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const rules = await db.collection('rules_pf1e').find({}).toArray();
            res.json({ success: true, count: rules.length, data: rules });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    /**
     * @swagger
     * /rules:
     *   post:
     *     summary: Create a new rule/feat
     *     tags: [Rules]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - name
     *             properties:
     *               name:
     *                 type: string
     *               description:
     *                 type: string
     *     responses:
     *       201:
     *         description: The created rule
     */
    // POST create rule
    router.post('/', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const rule = req.body;
            if (!rule.name) return res.status(400).json({ success: false, error: 'Name is required' });

            const result = await db.collection('rules_pf1e').insertOne(rule);
            res.status(201).json({ success: true, data: { ...rule, _id: result.insertedId } });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
};
