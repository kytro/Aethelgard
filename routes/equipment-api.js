const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

/**
 * Equipment API
 */
module.exports = function (db, verifyToken) {
    if (verifyToken) {
        router.use(verifyToken);
    }

    /**
     * @swagger
     * /equipment:
     *   get:
     *     summary: Retrieve a list of equipment
     *     tags: [Equipment]
     *     responses:
     *       200:
     *         description: A list of equipment
     */
    // GET all equipment or search with fallback
    router.get('/', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const { search } = req.query;
            const query = {};

            if (search) {
                console.log(`[Equipment] Search: '${search}'`);
                // 1. Primary Search
                query.name = { $regex: search, $options: 'i' };
                let items = await db.collection('equipment_pf1e').find(query).toArray();
                console.log(`  Hits: ${items.length} (query: ${JSON.stringify(query)})`);

                // 2. Fallback Logic
                if (items.length === 0) {
                    // Try searching for the last word (e.g. "Kyrosian Service Pistol" -> "Pistol")
                    // Strip punctuation
                    const cleanSearch = search.replace(/[^\w\s]/g, '');
                    const terms = cleanSearch.split(/\s+/);
                    if (terms.length > 1) {
                        const lastWord = terms[terms.length - 1];
                        if (lastWord.length > 2) { // Avoid 'of', 'the' matches if they end up last (unlikely but safe)
                            console.log(`[Equipment API] Fallback search: "${lastWord}" for "${search}"`);
                            items = await db.collection('equipment_pf1e').find({
                                name: { $regex: lastWord, $options: 'i' }
                            }).toArray();
                        }
                    }
                }

                // 3. Specific overrides (e.g. "Coat" -> "Chain Shirt", "Revolver" -> "Why not Pistol?")
                if (items.length === 0) {
                    const lowerSearch = search.toLowerCase();
                    let fallbackTerm = "";
                    if (lowerSearch.includes("coat") || lowerSearch.includes("jacket")) fallbackTerm = "Chain Shirt"; // Common light armor proxy
                    else if (lowerSearch.includes("revolver")) fallbackTerm = "Pistol";
                    else if (lowerSearch.includes("rifle")) fallbackTerm = "Musket";
                    else if (lowerSearch.includes("saber")) fallbackTerm = "Scimitar"; // Closest mechanical match

                    if (fallbackTerm) {
                        console.log(`[Equipment API] Hardcoded fallback: "${fallbackTerm}" for "${search}"`);
                        items = await db.collection('equipment_pf1e').find({
                            name: { $regex: fallbackTerm, $options: 'i' }
                        }).toArray();
                    }
                }

                res.json({ success: true, count: items.length, data: items, isFallback: items.length > 0 });
            } else {
                // No search, return all (maybe limit default?)
                const items = await db.collection('equipment_pf1e').find({}).limit(100).toArray();
                res.json({ success: true, count: items.length, data: items });
            }

        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    /**
     * @swagger
     * /equipment:
     *   post:
     *     summary: Create new equipment
     *     tags: [Equipment]
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
     *     responses:
     *       201:
     *         description: The created equipment
     */
    // POST create equipment
    router.post('/', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const item = req.body;
            if (!item.name) return res.status(400).json({ success: false, error: 'Name is required' });

            const result = await db.collection('equipment_pf1e').insertOne(item);
            res.status(201).json({ success: true, data: { ...item, _id: result.insertedId } });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
};
