const express = require('express');
const { ObjectId } = require('mongodb');
const multer = require('multer');
const JSZip = require('jszip');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

module.exports = function (db) {

    router.get('/dashboard-stats', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        try {
            const entityCount = await db.collection('entities_pf1e').countDocuments();
            const ruleCount = await db.collection('rules_pf1e').countDocuments();
            const equipmentCount = await db.collection('equipment_pf1e').countDocuments();
            const magicItemsCount = await db.collection('magic_items_pf1e').countDocuments();
            const spellCount = await db.collection('spells_pf1e').countDocuments();
            const deityCount = await db.collection('deities_pf1e').countDocuments();

            res.json({
                entityCount,
                ruleCount,
                itemCount: equipmentCount + magicItemsCount,
                spellCount,
                deityCount
            });
        } catch (error) {
            console.error('Failed to fetch dashboard stats:', error);
            res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
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

                if (collectionName === 'codex_entries' && documents.length > 0) {
                    const entriesArray = documents.map(({ _id, ...rest }) => rest);
                    backupData['codex_entries.json'] = entriesArray;
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

        // Check if this is a partial restore (merge/upsert) or full restore (delete + insert)
        const isPartialRestore = req.query.partial === 'true' || req.body.partial === 'true';
        const restoreMode = isPartialRestore ? 'PARTIAL' : 'FULL';

        console.log(`[RESTORE] ${restoreMode} restore operation initiated.`);
        try {
            const backupContent = req.file.buffer.toString('utf-8');
            const backupData = JSON.parse(backupContent);
            const report = [];

            for (const filename in backupData) {
                if (!filename.endsWith('.json')) continue;
                const collectionName = filename.replace('.json', '');
                const collectionData = backupData[filename];
                const collection = db.collection(collectionName);

                // Only delete existing data if doing a full restore
                if (!isPartialRestore) {
                    await collection.deleteMany({});
                }

                if (collectionName === 'codex_entries' && Array.isArray(collectionData)) {
                    if (collectionData.length > 0) {
                        if (isPartialRestore) {
                            // Partial restore: upsert each document
                            const bulkOps = collectionData.map(doc => ({
                                replaceOne: {
                                    filter: { _id: doc._id },
                                    replacement: doc,
                                    upsert: true
                                }
                            }));
                            const bulkResult = await collection.bulkWrite(bulkOps);
                            report.push(`${restoreMode}: ${bulkResult.upsertedCount + bulkResult.modifiedCount} docs in '${collectionName}' (${bulkResult.upsertedCount} new, ${bulkResult.modifiedCount} updated).`);
                        } else {
                            // Full restore: insert all
                            const insertResult = await collection.insertMany(collectionData);
                            report.push(`${restoreMode}: Restored ${insertResult.insertedCount} documents to '${collectionName}'.`);
                        }
                    }
                } else if (typeof collectionData === 'object' && !Array.isArray(collectionData)) {
                    const documentsToProcess = Object.entries(collectionData).map(([key, value]) => ({
                        _id: ObjectId.isValid(key) ? new ObjectId(key) : key, ...value
                    }));
                    if (documentsToProcess.length > 0) {
                        if (isPartialRestore) {
                            // Partial restore: upsert each document
                            const bulkOps = documentsToProcess.map(doc => ({
                                replaceOne: {
                                    filter: { _id: doc._id },
                                    replacement: doc,
                                    upsert: true
                                }
                            }));
                            const bulkResult = await collection.bulkWrite(bulkOps);
                            report.push(`${restoreMode}: ${bulkResult.upsertedCount + bulkResult.modifiedCount} docs in '${collectionName}' (${bulkResult.upsertedCount} new, ${bulkResult.modifiedCount} updated).`);
                        } else {
                            // Full restore: insert all
                            const insertResult = await collection.insertMany(documentsToProcess);
                            report.push(`${restoreMode}: Restored ${insertResult.insertedCount} documents to '${collectionName}'.`);
                        }
                    }
                }
            }
            res.status(200).json({ message: `${restoreMode} restore complete. ${report.join(' ')}` });
        } catch (err) {
            console.error('[RESTORE] Restore failed:', err);
            res.status(500).json({ error: `Restore failed: ${err.message}` });
        }
    });

    return router;
};