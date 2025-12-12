const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

module.exports = function (db) {

    router.get('/collections', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        try {
            const collections = await db.listCollections().toArray();
            const collectionNames = collections.map(c => c.name).filter(name => !name.startsWith('system.')).sort();
            res.json(collectionNames);
        } catch (error) {
            console.error('Failed to list collections:', error);
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/collections/:name', async (req, res) => {
        const collectionName = req.params.name;
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        try {
            const documents = await db.collection(collectionName).find({}).toArray();
            res.json(documents);
        } catch (error) {
            console.error(`Failed to fetch documents for ${collectionName}:`, error);
            res.status(500).json({ error: error.message });
        }
    });

    router.post('/collections/:name', async (req, res) => {
        const collectionName = req.params.name;
        const docToInsert = req.body;
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        try {
            const result = await db.collection(collectionName).insertOne(docToInsert);
            res.status(201).json({ message: `Document inserted with _id: ${result.insertedId}`, insertedId: result.insertedId });
        } catch (error) {
            console.error(`Failed to insert document into ${collectionName}:`, error);
            res.status(500).json({ error: error.message });
        }
    });

    router.delete('/collections/:name', async (req, res) => {
        const collectionName = req.params.name;
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        try {
            await db.collection(collectionName).drop();
            res.status(200).json({ message: `Collection '${collectionName}' deleted successfully.` });
        } catch (error) {
            console.error(`Failed to delete collection ${collectionName}:`, error);
            res.status(500).json({ error: error.message });
        }
    });

    router.delete('/collections/:name/:id', async (req, res) => {
        const { name: collectionName, id: docId } = req.params;
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        try {
            const queryId = ObjectId.isValid(docId) ? new ObjectId(docId) : docId;
            const result = await db.collection(collectionName).deleteOne({ _id: queryId });
            if (result.deletedCount === 0) {
                return res.status(404).json({ error: 'Document not found.' });
            }
            res.status(200).json({ message: `Document '${docId}' deleted successfully.` });
        } catch (error) {
            console.error(`Failed to delete document ${docId} from ${collectionName}:`, error);
            res.status(500).json({ error: error.message });
        }
    });

    router.put('/collections/:name/:id', async (req, res) => {
        const { name: collectionName, id: docId } = req.params;
        const docToUpdate = req.body;

        if (!db) return res.status(503).json({ error: 'Database not ready' });

        // Helper to perform update with specific query ID
        const performUpdate = async (queryId) => {
            // If body has _id, it must match or be consistent
            if (docToUpdate._id) {
                const bodyIdStr = docToUpdate._id.toString();
                const urlIdStr = docId.toString();
                if (bodyIdStr !== urlIdStr) {
                    // Allow mismatch if one is ObjectId and other is string repr of same hex
                    // But effectively if they differ in string form, reject.
                    return { error: 'Document _id in body does not match _id in URL.', status: 400 };
                }
                // Ensure body _id matches the type of queryId if possible, or leave as is?
                // Safer to let it be whatever it is, but Mongo might error if _id changes type.
                // For replaceOne, _id is immutable. 
                // If we are replacing, we should probably ensure _id in body matches queryId type.
                if (queryId instanceof ObjectId) {
                    docToUpdate._id = queryId;
                } else {
                    docToUpdate._id = bodyIdStr;
                }
            } else {
                docToUpdate._id = queryId;
            }

            const result = await db.collection(collectionName).replaceOne({ _id: queryId }, docToUpdate);
            return { result };
        };

        try {
            let result;
            let errorResp;

            // 1. Try as ObjectId if valid
            if (ObjectId.isValid(docId)) {
                const oid = new ObjectId(docId);
                const attempt = await performUpdate(oid);
                if (attempt.error) return res.status(attempt.status).json({ error: attempt.error });
                result = attempt.result;
            }

            // 2. If no match (or invalid ObjectId), try as String
            if (!result || result.matchedCount === 0) {
                const attempt = await performUpdate(docId);
                if (attempt.error && !result) return res.status(attempt.status).json({ error: attempt.error });
                // If we had a result (matchedCount=0) and this attempt also fails or errors, usage logic applies
                if (attempt.result) result = attempt.result;
            }

            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Document not found.' });
            }
            res.status(200).json({ message: `Document '${docId}' updated successfully.` });
        } catch (error) {
            console.error(`Failed to update document ${docId} in ${collectionName}:`, error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};