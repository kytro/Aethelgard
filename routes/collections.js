const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

module.exports = function(db) {

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

    const queryId = ObjectId.isValid(docId) ? new ObjectId(docId) : docId;
    
    if (docToUpdate._id && ObjectId.isValid(docToUpdate._id)) {
        docToUpdate._id = new ObjectId(docToUpdate._id);
    } else if (docToUpdate._id) {
        if (docToUpdate._id !== docId) {
            return res.status(400).json({ error: 'Document _id in body does not match _id in URL.' });
        }
    } else {
        docToUpdate._id = queryId;
    }

    try {
        const result = await db.collection(collectionName).replaceOne({ _id: queryId }, docToUpdate);
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