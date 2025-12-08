const express = require('express');
const router = express.Router();

/**
 * OGL Data Import Routes
 * Provides endpoints to import PF1e data from known Open Game License sources
 */
module.exports = function (db) {

    // Available OGL data sources
    // NOTE: Feat sources are not available - use Custom Import with your own URL
    // The spells source below is verified working as of Dec 2024
    const OGL_SOURCES = {
        'community-spells-complete': {
            name: 'PF1e Spells (Complete ~2000+)',
            description: 'Comprehensive spell list from all Pathfinder 1e books (cityofwalls gist)',
            url: 'https://gist.githubusercontent.com/cityofwalls/0fdeb2da5d7b475968c8de88c75e77ad/raw/PathfinderSpellsJSON.txt',
            collection: 'spells_pf1e',
            transform: (item) => ({
                // Use existing app prefix convention
                _id: `spell-${item.name?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'unknown'}`,
                name: item.name,
                school: item.school,
                // Parse spell level from "sorcerer/wizard 2, cleric 3" format
                level: item.spell_level || item.level,
                castingTime: item.casting_time,
                components: item.components,
                range: item.range,
                targets: item.targets,
                area: item.area,
                effect: item.effect,
                duration: item.duration,
                savingThrow: item.saving_throw,
                spellResistance: item.spell_resistance,
                description: item.description,
                source: item.source || 'PFRPG Core',
                // Store original spell_level for class-specific lookup
                spellLevelByClass: item.spell_level
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
