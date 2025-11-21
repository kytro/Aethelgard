const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const router = express.Router();

module.exports = function (db, JWT_SECRET, GOOGLE_CLIENT_ID) {
  const client = new OAuth2Client(GOOGLE_CLIENT_ID);

  router.post('/google/callback', async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'No credential provided.' });
    if (!db) return res.status(503).json({ error: 'Database not ready' });

    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      if (!payload) return res.status(400).json({ error: 'Invalid Google token.' });

      const { sub: googleId, email, name, picture } = payload;
      const usersCollection = db.collection('users');

      let user = await usersCollection.findOne({ googleId });
      if (!user) {
        const newUser = { googleId, email, name, picture, roles: ['user'], createdAt: new Date() };
        const result = await usersCollection.insertOne(newUser);
        user = { _id: result.insertedId, ...newUser };
      }

      const appToken = jwt.sign(
        { userId: user._id, roles: user.roles, name: user.name },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.json({ token: appToken, user: { name: user.name, email: user.email, picture: user.picture } });
    } catch (err) {
      console.error('Google Auth Error:', err);
      res.status(401).json({ error: 'Authentication failed.' });
    }
  });

  if (process.env.NODE_ENV === 'test') {
    router.post('/test/login', (req, res) => {
      const appToken = jwt.sign(
        { userId: 'test-user-id', roles: ['admin'], name: 'Test User' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      res.json({ token: appToken, user: { name: 'Test User', email: 'test@example.com', picture: '' } });
    });
  }

  return router;
};