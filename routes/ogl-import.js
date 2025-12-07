const express = require('express');
const router = express.Router();

/**
 * OGL Data Import Routes
 * Provides endpoints to import PF1e data from known Open Game License sources
 */
module.exports = function (db) {

    // Available OGL data sources - can be extended with more sources
    const OGL_SOURCES = {
        'psrd-spells-core': {
            name: 'PSRD Core Spells',
            description: 'Core Rulebook spells from Pathfinder SRD',
            url: 'https://raw.githubusercontent.com/PSRD-Data-release/prd-json/master/core_rulebook/spells.json',
            collection: 'spells_pf1e',
            transform: (item) => ({
                _id: `spell-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                name: item.name,
                school: item.school,
                level: item.spell_level || item.level,
                castingTime: item.casting_time,
                components: item.components,
                range: item.range,
                duration: item.duration,
                savingThrow: item.saving_throw,
                spellResistance: item.spell_resistance,
                description: item.description || item.text,
                source: 'PSRD Core'
            })
        },
        'psrd-feats-core': {
            name: 'PSRD Core Feats',
            description: 'Core Rulebook feats from Pathfinder SRD',
            url: 'https://raw.githubusercontent.com/PSRD-Data-release/prd-json/master/core_rulebook/feats.json',
            collection: 'rules_pf1e',
            transform: (item) => ({
                _id: `feat-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                name: item.name,
                type: 'feat',
                prerequisites: item.prerequisites || item.prerequisite,
                benefit: item.benefit || item.description,
                normal: item.normal,
                special: item.special,
                source: 'PSRD Core'
            })
        },
        'psrd-equipment': {
            name: 'PSRD Equipment',
            description: 'Weapons, Armor, and Gear from Pathfinder SRD',
            url: 'https://raw.githubusercontent.com/PSRD-Data-release/prd-json/master/core_rulebook/equipment.json',
            collection: 'equipment_pf1e',
            transform: (item) => ({
                _id: `eq-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                name: item.name,
                type: item.type || 'gear',
                weight: item.weight,
                cost: item.cost || item.price,
                description: item.description,
                // Weapon properties
                damage: item.damage,
                critical: item.critical,
                range: item.range,
                // Armor properties
                armorBonus: item.armor_bonus,
                maxDex: item.max_dex,
                checkPenalty: item.armor_check_penalty,
                source: 'PSRD Core'
            })
        },
        'psrd-magic-items': {
            name: 'PSRD Magic Items',
            description: 'Magic items from Pathfinder SRD',
            url: 'https://raw.githubusercontent.com/PSRD-Data-release/prd-json/master/core_rulebook/magic_items.json',
            collection: 'magic_items_pf1e',
            transform: (item) => ({
                _id: `mi-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                name: item.name,
                slot: item.slot,
                aura: item.aura,
                cl: item.cl,
                weight: item.weight,
                cost: item.cost || item.price,
                description: item.description,
                construction: item.construction,
                source: 'PSRD Core'
            })
        },
        'community-spells-complete': {
            name: 'Community Spells (All Books)',
            description: 'Comprehensive spell list from community sources',
            url: 'https://raw.githubusercontent.com/arantius/pf1e-spells/master/spells.json',
            collection: 'spells_pf1e',
            transform: (item) => ({
                _id: `spell-${item.name?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'unknown'}`,
                name: item.name,
                school: item.school,
                level: item.level,
                castingTime: item.casting_time || item.castingTime,
                range: item.range,
                duration: item.duration,
                savingThrow: item.saving_throw || item.savingThrow,
                spellResistance: item.spell_resistance || item.spellResistance,
                description: item.description,
                source: item.source || 'Community'
            })
        }
    };

    /**
     * GET /sources
     * Returns list of available OGL data sources
     */
    router.get('/sources', (req, res) => {
        const sources = Object.entries(OGL_SOURCES).map(([key, value]) => ({
            key,
            name: value.name,
            description: value.description,
            collection: value.collection
        }));
        res.json(sources);
    });

    /**
     * POST /import
     * Import data from a selected OGL source
     * Body: { sourceKey: string, mode: 'merge' | 'replace' }
     */
    router.post('/import', async (req, res) => {
        const { sourceKey, mode = 'merge' } = req.body;

        if (!sourceKey || !OGL_SOURCES[sourceKey]) {
            return res.status(400).json({ error: `Unknown source: ${sourceKey}` });
        }

        const source = OGL_SOURCES[sourceKey];
        console.log(`[OGL Import] Starting import from ${source.name} (${mode} mode)`);

        try {
            // Fetch data from source URL
            const response = await fetch(source.url);

            if (!response.ok) {
                throw new Error(`Failed to fetch from ${source.url}: ${response.status}`);
            }

            const rawData = await response.json();

            // Handle different data structures (array or object with items property)
            let items = [];
            if (Array.isArray(rawData)) {
                items = rawData;
            } else if (rawData.items) {
                items = rawData.items;
            } else if (rawData.spells) {
                items = rawData.spells;
            } else if (rawData.feats) {
                items = rawData.feats;
            } else {
                // Try to extract from first object property that's an array
                const firstArrayProp = Object.values(rawData).find(v => Array.isArray(v));
                if (firstArrayProp) {
                    items = firstArrayProp;
                }
            }

            if (!items.length) {
                return res.status(400).json({ error: 'No items found in source data' });
            }

            console.log(`[OGL Import] Found ${items.length} items to import`);

            // Transform items
            const transformed = items
                .filter(item => item && item.name) // Filter out invalid items
                .map(source.transform);

            // Replace mode: clear collection first
            if (mode === 'replace') {
                const deleteResult = await db.collection(source.collection).deleteMany({ source: { $regex: /^PSRD|Community/i } });
                console.log(`[OGL Import] Cleared ${deleteResult.deletedCount} existing OGL items`);
            }

            // Bulk upsert
            const bulkOps = transformed.map(item => ({
                updateOne: {
                    filter: { _id: item._id },
                    update: { $set: item },
                    upsert: true
                }
            }));

            const result = await db.collection(source.collection).bulkWrite(bulkOps, { ordered: false });

            const summary = {
                source: source.name,
                collection: source.collection,
                mode: mode,
                itemsProcessed: transformed.length,
                inserted: result.upsertedCount || 0,
                updated: result.modifiedCount || 0,
                matched: result.matchedCount || 0
            };

            console.log(`[OGL Import] Complete:`, summary);
            res.json(summary);

        } catch (error) {
            console.error(`[OGL Import] Error:`, error);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /import/custom
     * Import from a custom URL
     * Body: { url: string, collection: string, mode: 'merge' | 'replace', idPrefix: string }
     */
    router.post('/import/custom', async (req, res) => {
        const { url, collection, mode = 'merge', idPrefix = 'custom-' } = req.body;

        if (!url || !collection) {
            return res.status(400).json({ error: 'url and collection are required' });
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch from ${url}: ${response.status}`);
            }

            const rawData = await response.json();
            const items = Array.isArray(rawData) ? rawData : rawData.items || Object.values(rawData).find(v => Array.isArray(v)) || [];

            if (!items.length) {
                return res.status(400).json({ error: 'No items found in source data' });
            }

            const transformed = items
                .filter(item => item && item.name)
                .map(item => ({
                    _id: `${idPrefix}${item.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                    ...item,
                    source: 'Custom Import'
                }));

            if (mode === 'replace') {
                await db.collection(collection).deleteMany({ source: 'Custom Import' });
            }

            const bulkOps = transformed.map(item => ({
                updateOne: { filter: { _id: item._id }, update: { $set: item }, upsert: true }
            }));

            const result = await db.collection(collection).bulkWrite(bulkOps, { ordered: false });

            res.json({
                source: url,
                collection,
                itemsProcessed: transformed.length,
                inserted: result.upsertedCount || 0,
                updated: result.modifiedCount || 0
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};
