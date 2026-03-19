const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');

module.exports = function (db, JWT_SECRET) {
    return async function (req, res, next) {
        // Allow OPTIONS requests (preflight)
        if (req.method === 'OPTIONS') {
            return next();
        }

        // 1. Check for API Key
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
            if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

            const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

            try {
                // Find user with this key hash
                const user = await db.collection('users').findOne({ 'apiKeys.keyHash': hash });

                if (user) {
                    // Valid API Key
                    req.user = {
                        userId: user._id, // Use valid ObjectId
                        roles: user.roles || ['user'],
                        name: user.name,
                        isApiKey: true
                    };

                    // Update lastUsed asynchronously (don't await)
                    db.collection('users').updateOne(
                        { _id: user._id, 'apiKeys.keyHash': hash },
                        { $set: { 'apiKeys.$.lastUsed': new Date() } }
                    ).catch(err => console.error('Failed to update api key usage:', err));

                    return next();
                } else {
                    return res.status(401).json({ success: false, error: 'Invalid API Key' });
                }
            } catch (err) {
                console.error('[Auth] API Key error:', err);
                return res.status(500).json({ success: false, error: 'Internal Auth Error' });
            }
        }

        // 2. Fallback to JWT Bearer Token
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ success: false, error: 'No authorization header provided' });
        }

        const token = authHeader.split(' ')[1]; // Bearer <token>
        if (!token) {
            return res.status(401).json({ success: false, error: 'No token provided' });
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            next();
        } catch (error) {
            console.error('[Auth] Token verification failed:', error.message);
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }
    };
};
