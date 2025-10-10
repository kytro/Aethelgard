const express = require('express');
const { ObjectId } = require('mongodb');
const multer = require('multer');
const JSZip = require('jszip');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// This function allows us to pass the database connection (db) from server.js
module.exports = function(db) {

  router.get('/dashboard-stats', async (req, res) => {
      if (!db) return res.status(503).json({ error: 'Database not ready' });
      try {
          const collections = await db.listCollections().toArray();
          const stats = {};
          for (const collection of collections) {
              if (!collection.name.startsWith('system.')) {
                   stats[collection.name] = await db.collection(collection.name).countDocuments();
              }
          }
          res.json(stats);
      } catch (error) {
          console.error('Failed to fetch dashboard stats:', error);
          res.status(500).json({ error: error.message });
      }
  });

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

  router.get('/backup', async (req, res) => {
      if (!db) return res.status(503).json({ error: 'Database not ready' });
      console.log('[BACKUP] Backup generation initiated.');
      try {
          const collections = await db.listCollections().toArray();
          const backupData = {};

          for (const collectionInfo of collections) {
              const collectionName = collectionInfo.name;
              if (collectionName.startsWith('system.')) continue;
              const documents = await db.collection(collectionName).find({}).toArray();
              
              if (collectionName === 'codex' && documents.length > 0) {
                   const { _id, ...codexContent } = documents[0];
                   backupData['codex.json'] = codexContent;
              } else {
                   const collectionObject = {};
                   documents.forEach(doc => {
                       const { _id, ...docContent } = doc;
                       collectionObject[_id.toString()] = docContent;
                   });
                   backupData[`${collectionName}.json`] = collectionObject;
              }
          }

          res.setHeader('Content-disposition', 'attachment; filename=backup.json');
          res.setHeader('Content-type', 'application/json');
          res.status(200).send(JSON.stringify(backupData, null, 2));
      } catch (err) {
          console.error('[BACKUP] Backup failed:', err);
          res.status(500).json({ error: `Backup failed: ${err.message}` });
      }
  });

  router.post('/restore', upload.single('backupFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No backup file uploaded.' });
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    console.log(`[RESTORE] Restore operation initiated.`);
    try {
      const backupContent = req.file.buffer.toString('utf-8');
      const backupData = JSON.parse(backupContent);
      const report = [];

      for (const filename in backupData) {
          if (!filename.endsWith('.json')) continue;
          const collectionName = filename.replace('.json', '');
          const collectionData = backupData[filename];
          const collection = db.collection(collectionName);
          await collection.deleteMany({});
          
          if (collectionName === 'codex') {
              await collection.insertOne({ _id: 'world_data', ...collectionData });
              report.push(`Restored 1 document to '${collectionName}'.`);
          } else if (typeof collectionData === 'object' && !Array.isArray(collectionData)) {
              const documentsToInsert = Object.entries(collectionData).map(([key, value]) => ({
                  _id: ObjectId.isValid(key) ? new ObjectId(key) : key, ...value
              }));
              if (documentsToInsert.length > 0) {
                  const insertResult = await collection.insertMany(documentsToInsert);
                  report.push(`Restored ${insertResult.insertedCount} documents to '${collectionName}'.`);
              }
          }
      }
      res.status(200).json({ message: `Restore complete. ${report.join(' ')}` });
    } catch (err) {
      console.error('[RESTORE] Restore failed:', err);
      res.status(500).json({ error: `Restore failed: ${err.message}` });
    }
  });

  return router;
};