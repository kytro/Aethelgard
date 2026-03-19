/**
 * Codex API v1 - Comprehensive REST API for Codex Database
 * 
 * Provides validated endpoints for querying and updating codex_entries.
 * All responses follow a consistent format:
 * {
 *   success: boolean,
 *   data?: any,
 *   error?: string,
 *   meta?: { count, page, limit, total }
 * }
 */

const express = require('express');
const router = express.Router();

// --- Validation Schemas ---

const VALID_CONTENT_TYPES = ['heading', 'paragraph', 'table', 'map'];
const VALID_HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

/**
 * Normalizes a path segment by replacing special characters and spaces with underscores
 */
function normalizePathSegment(segment) {
    return segment
        .trim()
        .replace(/[\/\\<>:"|?*\s]+/g, '_')  // Replace special chars and spaces with _
        .replace(/_+/g, '_')                 // Collapse multiple underscores
        .replace(/^_|_$/g, '');              // Trim leading/trailing underscores
}

/**
 * Normalizes all path components
 */
function normalizePath(pathComponents) {
    return pathComponents.map(normalizePathSegment);
}

/**
 * Validates a path_components array (and normalizes it)
 */
function validatePath(path) {
    if (!Array.isArray(path)) {
        return { valid: false, error: 'path_components must be an array', instruction: 'Ensure "path_components" is an array of strings representing the hierarchy.' };
    }
    if (path.length === 0) {
        return { valid: false, error: 'path_components cannot be empty', instruction: 'Add at least one path segment to "path_components".' };
    }
    for (const segment of path) {
        if (typeof segment !== 'string' || segment.trim() === '') {
            return { valid: false, error: 'Each path segment must be a non-empty string', instruction: 'Remove empty strings or non-string values from "path_components".' };
        }
    }
    // Normalize and return
    return { valid: true, normalized: normalizePath(path) };
}

/**
 * Validates a content block
 */
function validateContentBlock(block, index) {
    if (!block || typeof block !== 'object') {
        return { valid: false, error: `Block at index ${index} must be an object`, instruction: `Ensure content block at index ${index} is a JSON object.` };
    }

    if (!VALID_CONTENT_TYPES.includes(block.type)) {
        return { valid: false, error: `Block at index ${index} has invalid type "${block.type}". Must be one of: ${VALID_CONTENT_TYPES.join(', ')}`, instruction: `Set the "type" field to one of: ${VALID_CONTENT_TYPES.join(', ')}.` };
    }

    switch (block.type) {
        case 'heading':
            if (typeof block.text !== 'string') {
                return { valid: false, error: `Heading at index ${index} must have a "text" string`, instruction: 'Add a "text" field containing the heading title.' };
            }
            if (block.level !== undefined && !VALID_HEADING_LEVELS.includes(block.level)) {
                return { valid: false, error: `Heading at index ${index} has invalid level. Must be 1-6`, instruction: 'Set the "level" field to a number between 1 and 6 (or omit it for default).' };
            }
            break;

        case 'paragraph':
            if (typeof block.text !== 'string') {
                return { valid: false, error: `Paragraph at index ${index} must have a "text" string`, instruction: 'Add a "text" field containing the paragraph content.' };
            }
            break;

        case 'table':
            if (!Array.isArray(block.headers) || block.headers.length === 0) {
                return { valid: false, error: `Table at index ${index} must have a non-empty "headers" array`, instruction: 'Provide a "headers" array with column titles.' };
            }
            if (!Array.isArray(block.rows)) {
                return { valid: false, error: `Table at index ${index} must have a "rows" array`, instruction: 'Provide a "rows" array containing the table data.' };
            }
            // Validate each row has keys matching headers
            for (let r = 0; r < block.rows.length; r++) {
                const row = block.rows[r];
                if (typeof row !== 'object' || Array.isArray(row)) {
                    return { valid: false, error: `Table at index ${index}, row ${r} must be an object with header keys`, instruction: 'Format each row as an object with keys matching the headers.' };
                }
            }
            break;

        case 'map':
            if (typeof block.imageUrl !== 'string') {
                return { valid: false, error: `Map at index ${index} must have an "imageUrl" string`, instruction: 'Provide an "imageUrl" field pointing to the map image.' };
            }
            break;
    }

    return { valid: true };
}

/**
 * Validates a full codex entry
 */
function validateEntry(entry) {
    const errors = [];

    // Required: name
    if (!entry.name || typeof entry.name !== 'string' || entry.name.trim() === '') {
        errors.push({ error: 'Entry must have a non-empty "name" string', instruction: 'Add a "name" field to the entry object.' });
    }

    // Required: path_components
    const pathResult = validatePath(entry.path_components);
    if (!pathResult.valid) {
        errors.push({ error: pathResult.error, instruction: pathResult.instruction });
    }

    // Optional: content (if present, must be valid)
    if (entry.content !== undefined) {
        if (!Array.isArray(entry.content)) {
            errors.push({ error: 'If present, "content" must be an array', instruction: 'Ensure "content" is an array of content blocks.' });
        } else {
            for (let i = 0; i < entry.content.length; i++) {
                const blockResult = validateContentBlock(entry.content[i], i);
                if (!blockResult.valid) {
                    errors.push({ error: blockResult.error, instruction: blockResult.instruction });
                }
            }
        }
    }

    // Optional: relatedPages (if present, must be array of strings)
    if (entry.relatedPages !== undefined) {
        if (!Array.isArray(entry.relatedPages)) {
            errors.push({ error: 'If present, "relatedPages" must be an array of path strings', instruction: 'Format "relatedPages" as an array of path strings.' });
        } else {
            for (const rp of entry.relatedPages) {
                if (typeof rp !== 'string') {
                    errors.push({ error: 'Each related page must be a string (formatted path)', instruction: 'Ensure all items in "relatedPages" are strings.' });
                    break;
                }
            }
        }
    }

    // Optional: isCompleted (if present, must be boolean)
    if (entry.isCompleted !== undefined && typeof entry.isCompleted !== 'boolean') {
        errors.push({ error: '"isCompleted" must be a boolean', instruction: 'Set "isCompleted" to true or false.' });
    }

    // Optional: category (if present, must be string or null)
    if (entry.category !== undefined && entry.category !== null && typeof entry.category !== 'string') {
        errors.push({ error: '"category" must be a string or null', instruction: 'Set "category" to a string value or null.' });
    }

    // Optional: summary (if present, must be string)
    if (entry.summary !== undefined && typeof entry.summary !== 'string') {
        errors.push({ error: '"summary" must be a string', instruction: 'Provide a text string for the "summary".' });
    }

    // Optional: entityId / entity_id (if present, must be string)
    if (entry.entityId !== undefined && typeof entry.entityId !== 'string') {
        errors.push({ error: '"entityId" must be a string', instruction: 'Ensure "entityId" is a string (ObjectId).' });
    }
    if (entry.entity_id !== undefined && typeof entry.entity_id !== 'string') {
        errors.push({ error: '"entity_id" must be a string', instruction: 'Ensure "entity_id" is a string (ObjectId).' });
    }

    return errors.length === 0
        ? { valid: true }
        : { valid: false, errors };
}

/**
 * Sanitizes an entry before saving (removes unexpected fields, normalizes data)
 */
function sanitizeEntry(entry) {
    const sanitized = {
        name: entry.name.trim(),
        path_components: normalizePath(entry.path_components)  // Normalize: replace special chars with _
    };

    // Optional fields
    if (entry.content !== undefined) {
        sanitized.content = entry.content.map(block => {
            const clean = { type: block.type };
            switch (block.type) {
                case 'heading':
                    clean.text = block.text;
                    clean.level = block.level || 3;
                    break;
                case 'paragraph':
                    clean.text = block.text;
                    break;
                case 'table':
                    clean.title = block.title || null;
                    clean.headers = block.headers;
                    clean.rows = block.rows;
                    break;
                case 'map':
                    clean.imageUrl = block.imageUrl;
                    clean.caption = block.caption || null;
                    break;
            }
            return clean;
        });
    }

    if (entry.category !== undefined) sanitized.category = entry.category;
    if (entry.summary !== undefined) sanitized.summary = entry.summary;
    if (entry.relatedPages !== undefined) sanitized.relatedPages = entry.relatedPages;
    if (typeof entry.isCompleted === 'boolean') sanitized.isCompleted = entry.isCompleted;
    if (typeof entry.enableCompletionTracking === 'boolean') sanitized.enableCompletionTracking = entry.enableCompletionTracking;
    if (typeof entry.isCombatManagerSource === 'boolean') sanitized.isCombatManagerSource = entry.isCombatManagerSource;
    if (entry.entityId !== undefined) sanitized.entityId = entry.entityId;
    if (entry.entity_id !== undefined) sanitized.entity_id = entry.entity_id;

    return sanitized;
}

module.exports = function (db, verifyToken) {

    // Protect all V1 routes
    if (verifyToken) {
        router.use(verifyToken);
    }


    // --- QUERY ENDPOINTS ---

    /**
     * @swagger
     * /entries:
     *   get:
     *     summary: Query entries with filtering and pagination
     *     tags: [Codex]
     *     parameters:
     *       - in: query
     *         name: path
     *         schema: { type: string }
     *         description: Filter by path prefix
     *       - in: query
     *         name: search
     *         schema: { type: string }
     *         description: Text search
     *       - in: query
     *         name: category
     *         schema: { type: string }
     *       - in: query
     *         name: limit
     *         schema: { type: integer }
     *       - in: query
     *         name: skip
     *         schema: { type: integer }
     *     responses:
     *       200:
     *         description: List of entries
     */
    router.get('/entries', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const {
                path,
                search,
                category,
                hasContent,
                limit = 50,
                skip = 0,
                sort = 'path_components',
                order = 'asc'
            } = req.query;

            // Build query
            const query = {};

            if (path) {
                const pathParts = path.split('.');
                // Match entries that start with this path
                for (let i = 0; i < pathParts.length; i++) {
                    query[`path_components.${i}`] = normalizePathSegment(pathParts[i]);
                }
            }

            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { summary: { $regex: search, $options: 'i' } }
                ];
            }

            if (category) {
                query.category = category;
            }

            if (hasContent === 'true') {
                query.content = { $exists: true, $type: 'array' };
            } else if (hasContent === 'false') {
                query.content = { $exists: false };
            }

            // Pagination limits
            const limitNum = Math.min(Math.max(parseInt(limit) || 50, 1), 10000);
            const skipNum = Math.max(parseInt(skip) || 0, 0);

            // Sort
            const sortOrder = order === 'desc' ? -1 : 1;
            const sortObj = { [sort]: sortOrder };

            // Execute query
            const [entries, total] = await Promise.all([
                db.collection('codex_entries')
                    .find(query)
                    .sort(sortObj)
                    .skip(skipNum)
                    .limit(limitNum)
                    .toArray(),
                db.collection('codex_entries').countDocuments(query)
            ]);

            res.json({
                success: true,
                data: entries,
                meta: {
                    count: entries.length,
                    skip: skipNum,
                    limit: limitNum,
                    total,
                    hasMore: skipNum + entries.length < total
                }
            });

        } catch (error) {
            console.error('[API v1] GET /entries error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /entries/by-path/{path}:
     *   get:
     *     summary: Get an entry by path
     *     tags: [Codex]
     *     parameters:
     *       - in: path
     *         name: path
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: The entry
     *       404:
     *         description: Entry not found
     */
    router.get('/entries/by-path/*', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const pathParam = req.params[0];
            if (!pathParam) {
                return res.status(400).json({ success: false, error: 'Path parameter is required' });
            }

            const pathComponents = normalizePath(pathParam.split('/').filter(p => p.trim() !== ''));

            const entry = await db.collection('codex_entries').findOne({
                path_components: pathComponents
            });

            if (!entry) {
                return res.status(404).json({
                    success: false,
                    error: `Entry not found at path: ${pathComponents.join('/')}`
                });
            }

            res.json({ success: true, data: entry });

        } catch (error) {
            console.error('[API v1] GET /entries/by-path error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /entries/{id}:
     *   get:
     *     summary: Get an entry by ID
     *     tags: [Codex]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: The entry
     */
    router.get('/entries/:id', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const { id } = req.params;
            const { ObjectId } = require('mongodb');

            let entry = null;

            // Try as ObjectId first
            if (ObjectId.isValid(id)) {
                entry = await db.collection('codex_entries').findOne({ _id: new ObjectId(id) });
            }

            // Fall back to string ID
            if (!entry) {
                entry = await db.collection('codex_entries').findOne({ _id: id });
            }

            if (!entry) {
                return res.status(404).json({ success: false, error: 'Entry not found' });
            }

            res.json({ success: true, data: entry });

        } catch (error) {
            console.error('[API v1] GET /entries/:id error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /tree:
     *   get:
     *     summary: Get the hierarchical tree structure
     *     tags: [Codex]
     *     responses:
     *       200:
     *         description: Tree structure
     */
    router.get('/tree', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const entries = await db.collection('codex_entries')
                .find({})
                .project({ path_components: 1, name: 1, category: 1, isCompleted: 1, content: { $size: { $ifNull: ['$content', []] } } })
                .toArray();

            // Build tree
            const tree = {};

            for (const entry of entries) {
                let current = tree;
                for (let i = 0; i < entry.path_components.length; i++) {
                    const segment = entry.path_components[i];
                    if (!current[segment]) {
                        current[segment] = {
                            _meta: {
                                name: segment,
                                path: entry.path_components.slice(0, i + 1),
                                isLeaf: false
                            },
                            _children: {}
                        };
                    }

                    if (i === entry.path_components.length - 1) {
                        // This is the actual entry
                        current[segment]._meta = {
                            ...current[segment]._meta,
                            _id: entry._id,
                            name: entry.name,
                            category: entry.category,
                            isCompleted: entry.isCompleted,
                            hasContent: entry.content > 0,
                            isLeaf: entry.content !== undefined
                        };
                    }

                    current = current[segment]._children;
                }
            }

            res.json({ success: true, data: tree });

        } catch (error) {
            console.error('[API v1] GET /tree error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /linked-details:
     *   post:
     *     summary: Fetch details for rules, equipment, spells by ID
     *     tags: [Codex]
     */
    router.post('/linked-details', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });
        try {
            const { ruleIds = [], equipmentIds = [], spellIds = [] } = req.body;

            // Helper to map IDs
            const { ObjectId } = require('mongodb');
            const toQueryIds = (ids) => ids.map(id => {
                try { return ObjectId.isValid(id) ? new ObjectId(id) : id; } catch { return id; }
            });

            const [rules, equipment, spells] = await Promise.all([
                ruleIds.length ? db.collection('rules_pf1e').find({ _id: { $in: toQueryIds(ruleIds) } }).toArray() : [],
                equipmentIds.length ? db.collection('equipment_pf1e').find({ _id: { $in: toQueryIds(equipmentIds) } }).toArray() : [],
                spellIds.length ? db.collection('spells_pf1e').find({ _id: { $in: toQueryIds(spellIds) } }).toArray() : []
            ]);

            res.json({
                success: true,
                data: { rules, equipment, spells }
            });
        } catch (error) {
            console.error('[API v1] POST /linked-details error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // --- MUTATION ENDPOINTS ---

    /**
     * @swagger
     * /entries:
     *   post:
     *     summary: Create a new entry
     *     tags: [Codex]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [name, path_components]
     *             properties:
     *               name: { type: string }
     *               path_components: { type: array, items: { type: string } }
     *     responses:
     *       201:
     *         description: Entry created
     */
    router.post('/entries', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const entry = req.body;

            // Normalize path early for validation and existence check
            if (Array.isArray(entry.path_components)) {
                entry.path_components = normalizePath(entry.path_components);
            }

            // Validate
            const validation = validateEntry(entry);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    instruction: validation.errors[0].instruction,
                    details: validation.errors
                });
            }

            // Check if path already exists
            const existing = await db.collection('codex_entries').findOne({
                path_components: entry.path_components
            });

            if (existing) {
                return res.status(409).json({
                    success: false,
                    error: `Entry already exists at path: ${entry.path_components.join('/')}`
                });
            }

            // Sanitize and insert
            const sanitized = sanitizeEntry(entry);
            const result = await db.collection('codex_entries').insertOne(sanitized);

            // Fetch the inserted document
            const inserted = await db.collection('codex_entries').findOne({ _id: result.insertedId });

            res.status(201).json({
                success: true,
                data: inserted,
                message: 'Entry created successfully'
            });

        } catch (error) {
            console.error('[API v1] POST /entries error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /entries/by-path/{path}:
     *   put:
     *     summary: Update or create an entry (Upsert)
     *     tags: [Codex]
     *     parameters:
     *       - in: path
     *         name: path
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { type: object }
     *     responses:
     *       200:
     *         description: Entry saved
     */
    router.put('/entries/by-path/*', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const pathParam = req.params[0];
            if (!pathParam) {
                return res.status(400).json({ success: false, error: 'Path parameter is required' });
            }

            const pathComponents = normalizePath(pathParam.split('/').filter(p => p.trim() !== ''));
            const entry = { ...req.body, path_components: pathComponents };

            // Validate
            const validation = validateEntry(entry);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    instruction: validation.errors[0].instruction,
                    details: validation.errors
                });
            }

            // Sanitize
            const sanitized = sanitizeEntry(entry);
            delete sanitized._id; // Don't update _id

            // Upsert
            const result = await db.collection('codex_entries').findOneAndUpdate(
                { path_components: pathComponents },
                { $set: sanitized },
                { upsert: true, returnDocument: 'after' }
            );

            res.json({
                success: true,
                data: result,
                message: 'Entry saved successfully'
            });

        } catch (error) {
            console.error('[API v1] PUT /entries/by-path error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /entries/by-path/{path}:
     *   patch:
     *     summary: Partially update an entry
     *     tags: [Codex]
     *     parameters:
     *       - in: path
     *         name: path
     *         required: true
     *         schema: { type: string }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { type: object }
     *     responses:
     *       200:
     *         description: Entry updated
     */
    router.patch('/entries/by-path/*', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const pathParam = req.params[0];
            if (!pathParam) {
                return res.status(400).json({ success: false, error: 'Path parameter is required' });
            }

            const pathComponents = normalizePath(pathParam.split('/').filter(p => p.trim() !== ''));
            const updates = req.body;

            // Prevent changing path_components via PATCH
            if (updates.path_components) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot change path_components via PATCH. Use DELETE + POST to move an entry.'
                });
            }

            // Validate content blocks if provided
            if (updates.content !== undefined) {
                if (!Array.isArray(updates.content)) {
                    return res.status(400).json({ success: false, error: '"content" must be an array', instruction: 'Ensure "content" is an array of content blocks.' });
                }
                for (let i = 0; i < updates.content.length; i++) {
                    const blockResult = validateContentBlock(updates.content[i], i);
                    if (!blockResult.valid) {
                        return res.status(400).json({ success: false, error: blockResult.error, instruction: blockResult.instruction });
                    }
                }
            }

            // Build $set object
            const $set = {};
            const allowedFields = ['name', 'content', 'summary', 'category', 'relatedPages', 'isCompleted', 'enableCompletionTracking', 'isCombatManagerSource', 'entityId', 'entity_id'];

            for (const field of allowedFields) {
                if (updates[field] !== undefined) {
                    $set[field] = updates[field];
                }
            }

            if (Object.keys($set).length === 0) {
                return res.status(400).json({ success: false, error: 'No valid fields to update' });
            }

            const result = await db.collection('codex_entries').findOneAndUpdate(
                { path_components: pathComponents },
                { $set },
                { returnDocument: 'after' }
            );

            if (!result) {
                return res.status(404).json({
                    success: false,
                    error: `Entry not found at path: ${pathComponents.join('/')}`
                });
            }

            res.json({
                success: true,
                data: result,
                message: 'Entry updated successfully'
            });

        } catch (error) {
            console.error('[API v1] PATCH /entries/by-path error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * @swagger
     * /entries/by-path/{path}:
     *   delete:
     *     summary: Delete an entry
     *     tags: [Codex]
     *     parameters:
     *       - in: path
     *         name: path
     *         required: true
     *         schema: { type: string }
     *       - in: query
     *         name: cascade
     *         schema: { type: boolean }
     *         description: Also delete children
     *     responses:
     *       200:
     *         description: Entry deleted
     */
    router.delete('/entries/by-path/*', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const pathParam = req.params[0];
            if (!pathParam) {
                return res.status(400).json({ success: false, error: 'Path parameter is required' });
            }

            const pathComponents = normalizePath(pathParam.split('/').filter(p => p.trim() !== ''));
            const cascade = req.query.cascade === 'true';

            let deleteResult;

            if (cascade) {
                // Delete this entry and all children
                // A child has path_components that starts with this path
                const query = {
                    $or: [
                        { path_components: pathComponents }, // Exact match
                        { // Children: starts with this path
                            $and: pathComponents.map((segment, i) => ({
                                [`path_components.${i}`]: segment
                            }))
                        }
                    ]
                };

                deleteResult = await db.collection('codex_entries').deleteMany(query);
            } else {
                // Delete only this entry
                deleteResult = await db.collection('codex_entries').deleteOne({
                    path_components: pathComponents
                });
            }

            if (deleteResult.deletedCount === 0) {
                return res.status(404).json({
                    success: false,
                    error: `Entry not found at path: ${pathComponents.join('/')}`
                });
            }

            res.json({
                success: true,
                message: `Deleted ${deleteResult.deletedCount} entry/entries`,
                meta: { deletedCount: deleteResult.deletedCount }
            });

        } catch (error) {
            console.error('[API v1] DELETE /entries/by-path error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/v1/entries/bulk
     * Bulk create/update entries
     * All entries are validated before any are saved
     */
    router.post('/entries/bulk', async (req, res) => {
        if (!db) return res.status(503).json({ success: false, error: 'Database not ready' });

        try {
            const updates = req.body;
            if (!Array.isArray(updates)) {
                return res.status(400).json({ success: false, error: 'Request body must be an array' });
            }

            // Validate all
            for (let i = 0; i < updates.length; i++) {
                const u = updates[i];
                if (!u.path_components || !Array.isArray(u.path_components)) {
                    return res.status(400).json({ success: false, error: `Item ${i}: path_components required (array)` });
                }
                // Optional val of other fields
                if (u.name && (typeof u.name !== 'string' || !u.name.trim())) {
                    return res.status(400).json({ success: false, error: `Item ${i}: name must be valid string` });
                }
            }

            // Perform bulk write
            const bulkOps = updates.map(u => {
                const filter = { path_components: u.path_components.map(p => p.trim()) };

                // Sanitize mostly manual here since sanitizeEntry is for single entry object
                const $set = {};
                if (u.name) $set.name = u.name;
                if (u.content) $set.content = u.content; // Should clean content too? Ideally.
                if (u.category !== undefined) $set.category = u.category;
                if (u.isCompleted !== undefined) $set.isCompleted = u.isCompleted;
                if (u.entity_id !== undefined) $set.entity_id = u.entity_id;
                if (u.entityId !== undefined) $set.entityId = u.entityId;

                return {
                    updateOne: {
                        filter: filter,
                        update: { $set: $set },
                        upsert: true
                    }
                };
            });

            if (bulkOps.length === 0) {
                return res.json({ success: true, message: 'Nothing to update' });
            }

            const result = await db.collection('codex_entries').bulkWrite(bulkOps);

            res.json({
                success: true,
                data: result,
                message: 'Bulk update successful'
            });

        } catch (error) {
            console.error('[API v1] POST /entries/bulk error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};
