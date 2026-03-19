
const express = require('express');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const router = express.Router();

/**
 * Generate a random API key
 * Format: sk_live_<24_chars_hex>
 */
function generateKey() {
    return `sk_live_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Hash key for storage
 */
function hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
}

module.exports = function (db, verifyToken) {
    // protect all routes
    if (verifyToken) {
        router.use(verifyToken);
    }

    /**
     * GET /
     * List my API keys
     */
    router.get('/', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        const userId = req.user.userId || req.user._id;

        try {
            const user = await db.collection('users').findOne(
                { _id: new ObjectId(userId) },
                { projection: { apiKeys: 1 } }
            );

            const keys = (user && user.apiKeys) ? user.apiKeys.map(k => ({
                id: k.id, // client-side ID or Just use prefix/created as ID? Let's use a unique ID if possible or just index
                // Wait, we didn't define an ID in schema. Let's add a random ID for deletion reference.
                // Or just use the prefix + last 4 chars?
                // Let's rely on a 'keyId' generated at creation.
                name: k.name,
                prefix: k.prefix,
                createdAt: k.createdAt,
                lastUsed: k.lastUsed
            })) : [];

            res.json({ success: true, data: keys });
        } catch (err) {
            console.error('[API Keys] GET Error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    /**
     * POST /
     * Generate new API key
     * Body: { name: string }
     */
    router.post('/', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        const userId = req.user.userId || req.user._id;
        const { name } = req.body;

        if (!name || typeof name !== 'string') {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        try {
            const rawKey = generateKey();
            const hashed = hashKey(rawKey);
            const prefix = rawKey.substring(0, 12); // "sk_live_abcd"
            const keyId = new ObjectId().toString();

            const newKeyRecord = {
                id: keyId,
                keyHash: hashed,
                prefix: prefix,
                name: name,
                createdAt: new Date(),
                lastUsed: null
            };

            await db.collection('users').updateOne(
                { _id: new ObjectId(userId) },
                { $push: { apiKeys: newKeyRecord } }
            );

            // RETURN RAW KEY ONLY ONCE
            res.status(201).json({
                success: true,
                data: {
                    key: rawKey,
                    id: keyId,
                    name: name,
                    prefix: prefix
                }
            });
        } catch (err) {
            console.error('[API Keys] Create Error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    /**
     * DELETE /:id
     * Revoke API key
     */
    router.delete('/:id', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        const userId = req.user.userId || req.user._id;
        const { id } = req.params;

        try {
            const result = await db.collection('users').updateOne(
                { _id: new ObjectId(userId) },
                { $pull: { apiKeys: { id: id } } }
            );

            if (result.modifiedCount === 0) {
                return res.status(404).json({ success: false, error: 'Key not found' });
            }

            res.json({ success: true, message: 'Key revoked' });
        } catch (err) {
            console.error('[API Keys] Delete Error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
};
