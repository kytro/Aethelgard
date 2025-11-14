const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

const getIdQuery = (id) => (ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id });

module.exports = function(db) {
    
    // --- Sessions ---
    router.get('/sessions', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const sessions = await db.collection('dm_toolkit_sessions').find().sort({ createdAt: -1 }).toArray();
        res.json(sessions);
    });

    router.post('/sessions', async (req, res) => {
        const result = await db.collection('dm_toolkit_sessions').insertOne({ title: '', notes: '', createdAt: new Date() });
        const newSession = await db.collection('dm_toolkit_sessions').findOne({ _id: result.insertedId });
        res.status(201).json(newSession);
    });

    router.patch('/sessions/:id', async (req, res) => {
        const { id } = req.params;
        const { _id, ...updateData } = req.body; // Destructure and exclude _id
        await db.collection('dm_toolkit_sessions').updateOne(getIdQuery(id), { $set: updateData });
        const updatedSession = await db.collection('dm_toolkit_sessions').findOne(getIdQuery(id));
        res.status(200).json(updatedSession);
    });
    
    router.delete('/sessions/:id', async (req, res) => {
        const { id } = req.params;
        await db.collection('dm_toolkit_sessions').deleteOne(getIdQuery(id));
        res.sendStatus(204);
    });

    return router;
};