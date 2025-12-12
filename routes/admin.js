const express = require('express');
const { ObjectId } = require('mongodb');
const multer = require('multer');
const JSZip = require('jszip');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = function (db) {
    const router = express.Router();

    router.get('/dashboard-stats', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        try {
            const entityCount = await db.collection('entities_pf1e').countDocuments();
            const ruleCount = await db.collection('rules_pf1e').countDocuments();
            const equipmentCount = await db.collection('equipment_pf1e').countDocuments();
            const magicItemsCount = await db.collection('magic_items_pf1e').countDocuments();
            const spellCount = await db.collection('spells_pf1e').countDocuments();
            const deityCount = await db.collection('deities_pf1e').countDocuments();
            const raceCount = await db.collection('races_pf1e').countDocuments();

            res.json({
                entityCount,
                ruleCount,
                itemCount: equipmentCount + magicItemsCount,
                spellCount,
                deityCount,
                raceCount
            });
        } catch (error) {
            console.error('Failed to fetch dashboard stats:', error);
            res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
        }
    });

    router.get('/backup', async (req, res) => {
        if (!db) return res.status(503).json({ error: 'Database not ready' });
        console.log('[BACKUP] Backup generation initiated (ZIP Mode).');
        try {
            const collections = await db.listCollections().toArray();
            const dataJson = {}; // Stores all collections EXCEPT entities_pf1e and codex_entries
            let beastiaryData = []; // Stores separate entities_pf1e data
            let codexData = []; // Stores separate codex_entries data

            for (const collectionInfo of collections) {
                const collectionName = collectionInfo.name;
                if (collectionName.startsWith('system.')) continue;
                const documents = await db.collection(collectionName).find({}).toArray();

                if (collectionName === 'entities_pf1e') {
                    // Store separately
                    beastiaryData = documents.map(({ _id, ...rest }) => ({ _id: _id.toString(), ...rest }));
                }
                else if (collectionName === 'codex_entries') {
                    // Store separately, PRESERVING _id for integrity
                    codexData = documents.map(({ _id, ...rest }) => ({ _id: _id.toString(), ...rest }));
                } else {
                    // Standard Key-Value storage for other collections
                    // Maintain backward compatibility logic where needed, typically object format
                    const collectionObject = {};
                    documents.forEach(doc => {
                        const { _id, ...docContent } = doc;
                        collectionObject[_id.toString()] = docContent;
                    });
                    dataJson[`${collectionName}.json`] = collectionObject;
                }
            }

            // Create ZIP
            const zip = new JSZip();
            zip.file('beastiary.json', JSON.stringify(beastiaryData, null, 2));
            zip.file('codex.json', JSON.stringify(codexData, null, 2));
            zip.file('data.json', JSON.stringify(dataJson, null, 2));

            const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

            res.setHeader('Content-disposition', 'attachment; filename=backup.zip');
            res.setHeader('Content-type', 'application/zip');
            res.status(200).send(zipContent);

        } catch (err) {
            console.error('[BACKUP] Backup failed:', err);
            res.status(500).json({ error: `Backup failed: ${err.message}` });
        }
    });

    router.post('/restore', upload.single('backupFile'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'No backup file uploaded.' });
        if (!db) return res.status(503).json({ error: 'Database not ready' });

        const isPartialRestore = req.query.partial === 'true' || req.body.partial === 'true';
        const restoreMode = isPartialRestore ? 'PARTIAL' : 'FULL';

        console.log(`[RESTORE] ${restoreMode} restore operation initiated.`);
        try {
            const buffer = req.file.buffer;
            let backupData = {};
            let beastiaryData = null;
            let codexData = null;

            // Check if ZIP or JSON
            try {
                const zip = await JSZip.loadAsync(buffer);

                // Load beastiary.json
                if (zip.file('beastiary.json')) {
                    const bContent = await zip.file('beastiary.json').async('string');
                    beastiaryData = JSON.parse(bContent);
                }

                // Load codex.json
                if (zip.file('codex.json')) {
                    const cContent = await zip.file('codex.json').async('string');
                    codexData = JSON.parse(cContent);
                }

                // Load data.json
                if (zip.file('data.json')) {
                    const dContent = await zip.file('data.json').async('string');
                    backupData = JSON.parse(dContent);
                } else {
                    // Fallback: Check if the zip root contains individual json files (legacy zip?)
                    // Or maybe the user uploaded a single JSON file? handled below.
                }

            } catch (zipErr) {
                // Not a valid zip, fallback to legacy JSON support
                console.warn('[RESTORE] Failed to load as ZIP, processing as legacy JSON file.');
                try {
                    const jsonContent = buffer.toString('utf-8');
                    backupData = JSON.parse(jsonContent);
                    // Legacy format put 'entities_pf1e.json' inside the main object, handled by the loop below
                } catch (jsonErr) {
                    throw new Error('Invalid file format. Must be a ZIP or JSON backup.');
                }
            }

            const report = [];

            // Helper to restore a collection
            const restoreCollection = async (collectionName, data) => {
                const collection = db.collection(collectionName);
                if (!isPartialRestore) {
                    await collection.deleteMany({});
                }

                let docsToInsert = [];

                if (Array.isArray(data)) {
                    // Array format (e.g. codex_entries or beastiary array)
                    if (data.length === 0) return;
                    docsToInsert = data.map(doc => ({
                        ...doc,
                        _id: (doc._id && ObjectId.isValid(doc._id)) ? new ObjectId(doc._id) : doc._id
                    }));
                } else if (typeof data === 'object') {
                    // Object format (id as key)
                    docsToInsert = Object.entries(data).map(([key, value]) => ({
                        _id: ObjectId.isValid(key) ? new ObjectId(key) : key,
                        ...value
                    }));
                }

                if (docsToInsert.length > 0) {
                    if (isPartialRestore) {
                        const bulkOps = docsToInsert.map(doc => ({
                            replaceOne: {
                                filter: { _id: doc._id },
                                replacement: doc,
                                upsert: true
                            }
                        }));
                        const bulkResult = await collection.bulkWrite(bulkOps);
                        report.push(`${restoreMode}: ${collectionName} (${bulkResult.upsertedCount + bulkResult.modifiedCount} updated).`);
                    } else {
                        const insertResult = await collection.insertMany(docsToInsert);
                        report.push(`${restoreMode}: ${collectionName} (+${insertResult.insertedCount}).`);
                    }
                }
            };

            // 1. Restore Beastiary (Separate File)
            if (beastiaryData) {
                await restoreCollection('entities_pf1e', beastiaryData);
            }

            // 2. Restore Codex (Separate File)
            if (codexData) {
                await restoreCollection('codex_entries', codexData);
            }

            // 3. Restore Others
            for (const filename in backupData) {
                if (!filename.endsWith('.json')) continue;
                const collectionName = filename.replace('.json', '');
                // The new logic separates beastiary. If the ZIP contained beastiary.json manually, we handled it.
                // If backupData contains 'entities_pf1e.json' (legacy), current loop handles it.
                await restoreCollection(collectionName, backupData[filename]);
            }

            res.status(200).json({ message: `${restoreMode} restore complete. ${report.join(' ')}` });

        } catch (err) {
            console.error('[RESTORE] Restore failed:', err);
            res.status(500).json({ error: `Restore failed: ${err.message}` });
        }
    });

    return router;
};