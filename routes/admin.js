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

            // New structure: main (user content), bestiary (bestiary + entities), data (reference)
            const mainData = { codex: [], fights: [], sessions: [] }; // User content: Codex (excl. Bestiary), fights, sessions
            const bestiaryData = { codex: [], entities: [] }; // Bestiary codex + entities_pf1e
            const dataJson = {};                    // All other reference collections

            for (const collectionInfo of collections) {
                const collectionName = collectionInfo.name;
                if (collectionName.startsWith('system.')) continue;
                const documents = await db.collection(collectionName).find({}).toArray();

                if (collectionName === 'entities_pf1e') {
                    // Entities go to bestiary
                    bestiaryData.entities = documents.map(({ _id, ...rest }) => ({ _id: _id.toString(), ...rest }));
                }
                else if (collectionName === 'codex_entries') {
                    // Split codex: Bestiary path vs everything else
                    for (const doc of documents) {
                        const { _id, ...rest } = doc;
                        const entry = { _id: _id.toString(), ...rest };

                        // Check if this is a Bestiary entry (case-insensitive)
                        const pathArray = doc.path_components || [];
                        const isBestiary = pathArray.length > 0 &&
                            pathArray[0].toLowerCase() === 'bestiary';

                        if (isBestiary) {
                            bestiaryData.codex.push(entry);
                        } else {
                            mainData.codex.push(entry);
                        }
                    }
                }
                else if (collectionName === 'dm_toolkit_fights') {
                    // DM Toolkit fights go to main
                    mainData.fights = documents.map(({ _id, ...rest }) => ({ _id: _id.toString(), ...rest }));
                }
                else if (collectionName === 'dm_toolkit_sessions') {
                    // DM Toolkit sessions go to main
                    mainData.sessions = documents.map(({ _id, ...rest }) => ({ _id: _id.toString(), ...rest }));
                }
                else {
                    // Standard Key-Value storage for other collections (reference data)
                    const collectionObject = {};
                    documents.forEach(doc => {
                        const { _id, ...docContent } = doc;
                        collectionObject[_id.toString()] = docContent;
                    });
                    dataJson[`${collectionName}.json`] = collectionObject;
                }
            }

            // Create ZIP with new structure
            const zip = new JSZip();
            zip.file('main.json', JSON.stringify(mainData, null, 2));
            zip.file('bestiary.json', JSON.stringify(bestiaryData, null, 2));
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

            // New format data
            let mainData = null;      // { codex: [...] }
            let bestiaryData = null;  // { codex: [...], entities: [...] }

            // Legacy format data
            let legacyBeastiaryData = null;  // entities_pf1e array
            let legacyCodexData = null;       // codex_entries array

            // Check if ZIP or JSON
            try {
                const zip = await JSZip.loadAsync(buffer);

                // NEW FORMAT: main.json
                if (zip.file('main.json')) {
                    const content = await zip.file('main.json').async('string');
                    mainData = JSON.parse(content);
                }

                // NEW FORMAT: bestiary.json (with codex and entities)
                if (zip.file('bestiary.json')) {
                    const content = await zip.file('bestiary.json').async('string');
                    bestiaryData = JSON.parse(content);
                }

                // LEGACY: beastiary.json (just entities array)
                if (zip.file('beastiary.json')) {
                    const content = await zip.file('beastiary.json').async('string');
                    legacyBeastiaryData = JSON.parse(content);
                }

                // LEGACY: codex.json (full codex array)
                if (zip.file('codex.json')) {
                    const content = await zip.file('codex.json').async('string');
                    legacyCodexData = JSON.parse(content);
                }

                // Load data.json (same for both formats)
                if (zip.file('data.json')) {
                    const dContent = await zip.file('data.json').async('string');
                    backupData = JSON.parse(dContent);
                }

            } catch (zipErr) {
                // Not a valid zip, fallback to legacy JSON support
                console.warn('[RESTORE] Failed to load as ZIP, processing as legacy JSON file.');
                try {
                    const jsonContent = buffer.toString('utf-8');
                    backupData = JSON.parse(jsonContent);
                } catch (jsonErr) {
                    throw new Error('Invalid file format. Must be a ZIP or JSON backup.');
                }
            }

            const report = [];

            // Helper to restore a collection
            const restoreCollection = async (collectionName, data, deleteFirst = true) => {
                const collection = db.collection(collectionName);
                if (!isPartialRestore && deleteFirst) {
                    await collection.deleteMany({});
                }

                let docsToInsert = [];

                if (Array.isArray(data)) {
                    if (data.length === 0) return;
                    docsToInsert = data.map(doc => ({
                        ...doc,
                        _id: (doc._id && ObjectId.isValid(doc._id)) ? new ObjectId(doc._id) : doc._id
                    }));
                } else if (typeof data === 'object') {
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

            // Determine which format we're restoring from
            const isNewFormat = mainData !== null || (bestiaryData !== null && bestiaryData.entities);

            if (isNewFormat) {
                // NEW FORMAT RESTORE
                console.log('[RESTORE] Using new backup format (main.json + bestiary.json).');

                // For full restore, clear collections first
                if (!isPartialRestore) {
                    await db.collection('codex_entries').deleteMany({});
                    await db.collection('entities_pf1e').deleteMany({});
                    await db.collection('dm_toolkit_fights').deleteMany({});
                    await db.collection('dm_toolkit_sessions').deleteMany({});
                }

                // Restore main codex entries
                if (mainData?.codex?.length > 0) {
                    await restoreCollection('codex_entries', mainData.codex, false);
                }

                // Restore fights from main
                if (mainData?.fights?.length > 0) {
                    await restoreCollection('dm_toolkit_fights', mainData.fights, false);
                }

                // Restore sessions from main
                if (mainData?.sessions?.length > 0) {
                    await restoreCollection('dm_toolkit_sessions', mainData.sessions, false);
                }

                // Restore bestiary codex entries (append to same collection)
                if (bestiaryData?.codex?.length > 0) {
                    await restoreCollection('codex_entries', bestiaryData.codex, false);
                }

                // Restore entities
                if (bestiaryData?.entities?.length > 0) {
                    await restoreCollection('entities_pf1e', bestiaryData.entities, false);
                }

            } else {
                // LEGACY FORMAT RESTORE
                console.log('[RESTORE] Using legacy backup format (beastiary.json + codex.json).');

                if (legacyBeastiaryData) {
                    await restoreCollection('entities_pf1e', legacyBeastiaryData);
                }

                if (legacyCodexData) {
                    await restoreCollection('codex_entries', legacyCodexData);
                }
            }

            // Restore other collections from data.json
            for (const filename in backupData) {
                if (!filename.endsWith('.json')) continue;
                const collectionName = filename.replace('.json', '');
                // Skip if already handled
                if (collectionName === 'entities_pf1e' || collectionName === 'codex_entries') continue;
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