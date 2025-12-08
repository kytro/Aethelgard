const express = require('express');
const router = express.Router();
const multer = require('multer');
const JSZip = require('jszip');

// Use memory storage for processing zip files without saving to disk first
const upload = multer({ storage: multer.memoryStorage() });

/**
 * OGL Data Import Routes
 * Provides endpoints to import PF1e data from known Open Game License sources
 */
module.exports = function (db) {
    const OGL_SOURCES = {}; // Keep empty if no web sources are active

    // Mappings for file types to Entity Types (based on filename/path conventions in PSRD-Data)
    const TYPE_MAPPING = {
        'feat': 'feat',
        'item': 'item',
        'spell': 'spell'
    };

    const COLLECTIONS = {
        'feat': 'entities_pf1e',
        'item': 'entities_pf1e',
        'spell': 'spells_pf1e'
    };

    /**
     * Transform logic to map OGL JSON to Codex schema
     */
    function transform(data, type, sourceDir) {
        if (!data.name) return null;

        const idBase = data.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const sourceBook = sourceDir.split('/')[0]; // e.g., 'core_rulebook'

        if (type === 'spell') {
            return {
                _id: `sp_${idBase}`,
                name: data.name,
                type: 'spell',
                school: data.school,
                subschool: data.subschool,
                descriptor: data.descriptor,
                level: data.spell_level,
                castingTime: data.casting_time,
                components: data.components,
                range: data.range,
                area: data.area,
                target: data.target,
                duration: data.duration,
                savingThrow: data.saving_throw,
                spellResistance: data.spell_resistance,
                description: data.description_formated || data.description,
                source: sourceBook,
                fullText: data.full_text,
                isOGL: true
            };
        } else if (type === 'feat') {
            return {
                _id: `feat_${idBase}`,
                name: data.name,
                type: 'feat',
                description: data.description,
                prerequisites: data.prerequisites,
                benefit: data.benefit,
                normal: data.normal,
                special: data.special,
                source: sourceBook,
                featType: data.type,
                fullText: data.full_text,
                isOGL: true
            };
        } else if (type === 'item') {
            let subType = 'equipment';
            if (sourceDir.includes('ultimate_equipment')) {
                if (data.aura || data.slot) subType = 'magic_item';
            }
            if (data.armor_class || data.armor_check_penalty) subType = 'armor';
            if (data.dmg_s || data.dmg_m || data.critical) subType = 'weapon';

            return {
                _id: `item_${idBase}`,
                name: data.name,
                type: subType,
                description: data.description,
                price: data.price,
                weight: data.weight,
                damageSmall: data.dmg_s,
                damageMedium: data.dmg_m,
                critical: data.critical,
                range: data.range,
                weaponType: data.weapon_type,
                damageType: data.type,
                armorBonus: data.armor_bonus || data.ac,
                maxDex: data.max_dex_bonus,
                checkPenalty: data.armor_check_penalty || data.check_penalty,
                arcaneFailure: data.arcane_spell_failure_chance || data.spell_failure,
                speed30: data.speed_30,
                speed20: data.speed_20,
                aura: data.aura,
                slot: data.slot,
                cl: data.cl,
                construction: data.construction,
                source: sourceBook,
                fullText: data.full_text,
                isOGL: true
            };
        }
        return null;
    }

    /**
     * POST /import/zip
     * Upload and process a PSRD-Data zip file
     */
    router.post('/import/zip', upload.single('file'), async (req, res) => {
        console.log('[OGL Import (ZIP)] Starting import...');

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        try {
            const zip = await JSZip.loadAsync(req.file.buffer);
            console.log(`[OGL Import (ZIP)] Opened zip file. Processing entries...`);

            let processedCount = 0;
            let errorCount = 0;
            const updates = {
                entities_pf1e: [],
                spells_pf1e: []
            };

            // Targeted directories to scan within the zip
            const TARGET_DIRS = [
                'feat', 'item', 'spell'
            ];

            const entries = Object.keys(zip.files);

            for (const filename of entries) {
                const file = zip.files[filename];
                if (file.dir || !filename.endsWith('.json')) continue;

                // Check if file is in a target directory (e.g. contains /feat/)
                // Normalize path separators just in case
                const normPath = filename.replace(/\\/g, '/');

                // Determine type based on path
                // Looking for structure generally like 'core_rulebook/feat/...' or just 'feat/...'
                let typeKey = null;
                for (const t of TARGET_DIRS) {
                    // Check if path contains /{type}/ or ends with /{type}.json (unlikely)
                    // We assume PSRD structure: BookName/type/filename.json
                    if (normPath.includes(`/${t}/`)) {
                        typeKey = t;
                        break;
                    }
                }

                if (!typeKey) continue;

                const entityType = TYPE_MAPPING[typeKey];
                const collectionName = COLLECTIONS[typeKey];

                try {
                    const content = await file.async('string');
                    const rawData = JSON.parse(content);

                    // Pass the full path as sourceDir to help with book identification
                    const doc = transform(rawData, entityType, normPath);
                    if (doc) {
                        updates[collectionName].push({
                            updateOne: {
                                filter: { _id: doc._id },
                                update: { $set: doc },
                                upsert: true
                            }
                        });
                        processedCount++;
                    }
                } catch (e) {
                    console.error(`Error processing ${filename}:`, e.message);
                    errorCount++;
                }
            }

            // Bulk write
            const resultSummary = {
                processed: processedCount,
                errors: errorCount,
                entities: 0,
                spells: 0
            };

            for (const [colName, ops] of Object.entries(updates)) {
                if (ops.length > 0) {
                    // Split into chunks of 1000
                    const chunkSize = 1000;
                    for (let i = 0; i < ops.length; i += chunkSize) {
                        const chunk = ops.slice(i, i + chunkSize);
                        const result = await db.collection(colName).bulkWrite(chunk, { ordered: false });
                        if (colName === 'entities_pf1e') resultSummary.entities += (result.upsertedCount + result.modifiedCount);
                        if (colName === 'spells_pf1e') resultSummary.spells += (result.upsertedCount + result.modifiedCount);
                    }
                }
            }

            console.log(`[OGL Import (ZIP)] Complete.`, resultSummary);
            res.json(resultSummary);

        } catch (error) {
            console.error('[OGL Import (ZIP)] Error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};
