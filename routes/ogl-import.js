const express = require('express');
const multer = require('multer');
const JSZip = require('jszip');

// Use memory storage for processing zip files without saving to disk first
const upload = multer({ storage: multer.memoryStorage() });

/**
 * OGL Data Import Routes
 * Provides endpoints to import PF1e data from known Open Game License sources
 */
module.exports = function (db) {
    const router = express.Router();


    // Mappings for file types to Entity Types (based on filename/path conventions in PSRD-Data)
    const TYPE_MAPPING = {
        'feat': 'feat',
        'item': 'item',
        'spell': 'spell',
        'trap': 'trap',
        'monster': 'monster',
        'npc': 'npc',
        'deity': 'deity'
    };

    const COLLECTIONS = {
        'feat': 'rules_pf1e',
        'item': 'equipment_pf1e',
        'spell': 'spells_pf1e',
        'trap': 'hazards_pf1e',
        'monster': 'entities_pf1e',
        'npc': 'entities_pf1e',
        'deity': 'entities_pf1e'
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
        } else if (type === 'trap') {
            return {
                _id: `hz_${idBase}`, // Standardized prefix for hazards
                name: data.name,
                type: data.type || 'Trap',
                cr: data.cr,
                xp: data.xp,
                perception: data.perception || data.search,
                disableDevice: data.disable_device,
                effects: data.effects || [],
                description: data.description,
                source: sourceBook,
                fullText: data.full_text,
                isOGL: true
            };
        } else if (type === 'monster' || type === 'npc') {
            // Helper to clean descriptions
            const cleanDesc = (d) => (d || '').replace(/<[^>]*>/g, '').trim();

            // Construct Base Stats
            const baseStats = {
                Str: data.ability_scores?.str || data.strength || 10,
                Dex: data.ability_scores?.dex || data.dexterity || 10,
                Con: data.ability_scores?.con || data.constitution || 10,
                Int: data.ability_scores?.int || data.intelligence || 10,
                Wis: data.ability_scores?.wis || data.wisdom || 10,
                Cha: data.ability_scores?.cha || data.charisma || 10,
                size: data.size || 'Medium',
                race: data.race,
                class: data.class,
                alignment: data.alignment,
                hp: data.hp || data.hit_points, // Support variations
                hitDice: data.hd,
                speed: data.speed,
                senses: data.senses,
                type: data.creature_type || data.type,
                subtype: data.creature_subtype || data.subtype
            };

            // AC
            if (data.ac) {
                baseStats.armorClass = {
                    total: parseInt(data.ac) || 10,
                    touch: parseInt(data.ac_touch) || 10,
                    flatFooted: parseInt(data.ac_flat_footed) || 10
                };
            }

            // Saves
            if (data.saves) {
                baseStats.saves = {
                    fortitude: parseInt(data.fort) || 0,
                    reflex: parseInt(data.ref) || 0,
                    will: parseInt(data.will) || 0
                };
            }

            // Combat
            baseStats.combat = {
                bab: parseInt(data.base_attack) || 0,
                cmb: data.cmb,
                cmd: data.cmd,
                init: parseInt(data.init) || 0
            };

            // Skills
            if (data.skills) {
                baseStats.skills = {};
                // Split by comma, but be careful of commas inside parentheses if any (though standard OGL skills usually don't have them)
                // A simpler split by ',' is usually sufficient for standard statblocks
                const skillParts = data.skills.split(',').map(s => s.trim());
                skillParts.forEach(part => {
                    // Regex to match "Skill Name +Modifier"
                    // Handles "Perception +5", "Knowledge (arcana) +10"
                    const match = part.match(/^(.*?)\s+([+-]?\d+)$/);
                    if (match) {
                        const skillName = match[1].trim();
                        const modifier = parseInt(match[2]);
                        baseStats.skills[skillName] = modifier;
                    }
                });
            }

            return {
                _id: `${type}_${idBase}`,
                name: data.name,
                type: type, // 'monster' or 'npc'
                cr: data.cr,
                xp: data.xp,
                description: cleanDesc(data.description),
                baseStats: baseStats,
                source: sourceBook,
                sections: data.sections || [], // Keep extra sections/special abilities if available
                fullText: data.full_text,
                environment: data.environment,
                organization: data.organization,
                treasure: data.treasure,
                isOGL: true
            };
        } else if (type === 'deity') {
            return {
                _id: `deity_${idBase}`,
                name: data.name,
                type: 'deity',
                alignment: data.alignment,
                domains: data.domains,
                favoredWeapon: data.favored_weapon,
                centersOfWorship: data.centers_of_worship,
                nationality: data.nationality,
                description: data.description,
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
                entities_pf1e: [],  // Legacy / Misc
                rules_pf1e: [],     // Feats
                equipment_pf1e: [], // Items
                hazards_pf1e: [],   // Traps
                spells_pf1e: []     // Spells
            };

            // Targeted directories to scan within the zip
            const TARGET_DIRS = [
                'feat', 'item', 'spell', 'trap', 'monster', 'npc', 'deity'
            ];

            const codexOps = []; // Store ops for Codex Entries

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

                        // --- CODEX PAGE GENERATION (For Monsters/NPCs) ---
                        if (entityType === 'monster' || entityType === 'npc') {
                            const category = doc.baseStats?.type || 'Uncategorized';
                            // Capitalize first letter
                            const catFormatted = category.charAt(0).toUpperCase() + category.slice(1);

                            const path = ['Bestiary', catFormatted, doc.name];

                            // Helper to parse HTML to Blocks
                            // Supports <p>, <table>, <h3>
                            function parseHtmlToBlocks(html) {
                                const blocks = [];
                                if (!html) return blocks;

                                // Remove newlines to make regex easier
                                const cleanHtml = html.replace(/\r?\n|\r/g, '');

                                // Simple regex parser
                                // Note: This is not a full HTML parser and assumes well-formed OGL data
                                let remaining = cleanHtml;

                                // Regexes
                                const tableRegex = /<table.*?>(.*?)<\/table>/i;
                                const pRegex = /<p.*?>(.*?)<\/p>/i;
                                const hRegex = /<h[1-6].*?>(.*?)<\/h[1-6]>/i;
                                const captionRegex = /<caption.*?>(.*?)<\/caption>/i;

                                // We will iteratively find the first match of any type
                                while (remaining.length > 0) {
                                    const tableMatch = remaining.match(tableRegex);
                                    const pMatch = remaining.match(pRegex);
                                    const hMatch = remaining.match(hRegex);

                                    let bestMatch = null;
                                    let type = '';
                                    let minIndex = Infinity;

                                    if (tableMatch && tableMatch.index < minIndex) { minIndex = tableMatch.index; bestMatch = tableMatch; type = 'table'; }
                                    if (pMatch && pMatch.index < minIndex) { minIndex = pMatch.index; bestMatch = pMatch; type = 'paragraph'; }
                                    if (hMatch && hMatch.index < minIndex) { minIndex = hMatch.index; bestMatch = hMatch; type = 'heading'; }

                                    if (!bestMatch) break; // No more known tags

                                    // Add everything before as partial text if needed? Usually OGL is wrapped.
                                    // For now, ignore text outside tags to avoid noise.

                                    if (type === 'paragraph') {
                                        blocks.push({
                                            type: 'paragraph',
                                            text: bestMatch[1].replace(/<[^>]*>/g, '') // Strip inner tags like <i>
                                        });
                                    } else if (type === 'heading') {
                                        blocks.push({
                                            type: 'heading',
                                            text: bestMatch[1].replace(/<[^>]*>/g, '')
                                        });
                                    } else if (type === 'table') {
                                        const tableContent = bestMatch[1];
                                        const rows = [];
                                        const headers = [];
                                        let title = '';

                                        // Extract Caption
                                        const captionMatch = tableContent.match(captionRegex);
                                        if (captionMatch) title = captionMatch[1].replace(/<[^>]*>/g, '');

                                        // Extract Headers <thead>...<th>
                                        const theadMatch = tableContent.match(/<thead.*?>(.*?)<\/thead>/i);
                                        if (theadMatch) {
                                            const headerMatches = theadMatch[1].match(/<th.*?>(.*?)<\/th>/gi);
                                            if (headerMatches) {
                                                headerMatches.forEach(h => {
                                                    headers.push(h.replace(/<[^>]*>/g, '').trim());
                                                });
                                            }
                                        }

                                        // Extract Rows <tr> (inside tbody or just table)
                                        // Simple regex for tr
                                        const trMatches = tableContent.match(/<tr.*?>(.*?)<\/tr>/gi);
                                        if (trMatches) {
                                            trMatches.forEach(tr => {
                                                // Check for th inside tr if headers empty? 
                                                // OGL tables usually have thead.
                                                // Let's assume tr contains tds.
                                                const rowObj = {};
                                                const tdMatches = tr.match(/<td.*?>(.*?)<\/td>/gi);
                                                if (tdMatches) {
                                                    tdMatches.forEach((td, idx) => {
                                                        const key = headers[idx] || `Column ${idx + 1}`;
                                                        rowObj[key] = td.replace(/<[^>]+>/g, '').trim(); // Strip tags but keep text
                                                    });
                                                    // Only add if it looks like a data row
                                                    if (Object.keys(rowObj).length > 0) rows.push(rowObj);
                                                }
                                            });
                                        }

                                        // Generate default headers if missing
                                        if (headers.length === 0 && rows.length > 0) {
                                            Object.keys(rows[0]).forEach((_, i) => headers.push(`Column ${i + 1}`));
                                        }

                                        blocks.push({
                                            type: 'table',
                                            title: title,
                                            headers: headers,
                                            rows: rows
                                        });
                                    }

                                    // Advance
                                    remaining = remaining.substring(minIndex + bestMatch[0].length);
                                }
                                return blocks;
                            }

                            // Recursive function to flatten sections into blocks
                            function convertSectionsToBlocks(sections) {
                                let blocks = [];
                                if (!sections || !Array.isArray(sections)) return blocks;

                                for (const section of sections) {
                                    // 1. Add Section Title as Heading if exists
                                    if (section.name && section.name !== 'Description' && section.name !== 'Role') { // Skip some generic ones if desired
                                        blocks.push({ type: 'heading', text: section.name });
                                    }

                                    // 2. Parse Body HTML
                                    if (section.body) {
                                        blocks = blocks.concat(parseHtmlToBlocks(section.body));
                                    }

                                    // 3. Recurse for subsections
                                    if (section.sections) {
                                        blocks = blocks.concat(convertSectionsToBlocks(section.sections));
                                    }
                                }
                                return blocks;
                            }

                            const pageContent = convertSectionsToBlocks(doc.sections);

                            // 1. Ensure 'Bestiary' exists
                            // 2. Ensure Category exists
                            // 3. Create Entry

                            // We push individual upserts for the hierarchy to ensure structure
                            // Optimization: In a real bulk scenario, deduplication is better, but this ensures correctness per entry.

                            const commonUpdate = {
                                update: { $setOnInsert: { type: 'category' } }, // Default to category if creating parents
                                upsert: true
                            };

                            // Root: Bestiary
                            codexOps.push({
                                updateOne: {
                                    filter: { path_components: ['Bestiary'] },
                                    update: { $setOnInsert: { name: 'Bestiary', path_components: ['Bestiary'], type: 'category' } },
                                    upsert: true
                                }
                            });

                            codexOps.push({
                                updateOne: {
                                    filter: { path_components: ['Bestiary', catFormatted] },
                                    update: { $setOnInsert: { name: catFormatted, path_components: ['Bestiary', catFormatted], type: 'category' } },
                                    upsert: true
                                }
                            });

                            // The Page Itself
                            codexOps.push({
                                updateOne: {
                                    filter: { path_components: path },
                                    update: {
                                        $set: {
                                            name: doc.name,
                                            path_components: path,
                                            entityId: doc._id,
                                            type: 'page',
                                            description: doc.description, // Link description for preview
                                            content: pageContent // NEW: Add parsed blocks
                                        }
                                    },
                                    upsert: true
                                }
                            });
                        }

                        // --- CODEX PAGE GENERATION (For Deities) ---
                        if (entityType === 'deity') {
                            const path = ['Deities', doc.name];

                            // Ensure 'Deities' exists (Root)
                            codexOps.push({
                                updateOne: {
                                    filter: { path_components: ['Deities'] },
                                    update: { $setOnInsert: { name: 'Deities', path_components: ['Deities'], type: 'category' } },
                                    upsert: true
                                }
                            });

                            // The Page Itself
                            codexOps.push({
                                updateOne: {
                                    filter: { path_components: path },
                                    update: {
                                        $set: {
                                            name: doc.name,
                                            path_components: path,
                                            entityId: doc._id,
                                            type: 'page',
                                            description: doc.description
                                        }
                                    },
                                    upsert: true
                                }
                            });
                        }
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
                rules: 0,
                equipment: 0,
                hazards: 0,
                spells: 0
            };

            for (const [colName, ops] of Object.entries(updates)) {
                if (ops.length > 0) {
                    // Split into chunks of 1000
                    const chunkSize = 1000;
                    for (let i = 0; i < ops.length; i += chunkSize) {
                        const chunk = ops.slice(i, i + chunkSize);
                        const result = await db.collection(colName).bulkWrite(chunk, { ordered: false });
                        const count = result.upsertedCount + result.modifiedCount;

                        if (colName === 'entities_pf1e') resultSummary.entities += count;
                        if (colName === 'rules_pf1e') resultSummary.rules += count;
                        if (colName === 'equipment_pf1e') resultSummary.equipment += count;
                        if (colName === 'hazards_pf1e') resultSummary.hazards += count;
                        if (colName === 'spells_pf1e') resultSummary.spells += count;
                    }
                }
            }

            // Execute Codex Updates
            if (codexOps.length > 0) {
                console.log(`[OGL Import] Updating Codex with ${codexOps.length} operations...`);

                // Deduplicate parent creates if possible, or just run them unordered (MongoDB handles idempotent upserts well)
                const chunkSize = 1000;
                for (let i = 0; i < codexOps.length; i += chunkSize) {
                    const chunk = codexOps.slice(i, i + chunkSize);
                    await db.collection('codex_entries').bulkWrite(chunk, { ordered: false });
                }
                console.log(`[OGL Import] Codex hierarchy updated.`);
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
