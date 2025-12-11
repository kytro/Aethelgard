const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const router = express.Router();

async function fetchDocHandler(req, res) {
    const { docId } = req.params;

    // No auth header check needed for public docs

    try {
        const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=html`;
        const response = await fetch(exportUrl);

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                return res.status(response.status).json({
                    error: 'Document is not public. Please change Share settings to "Anyone with the link".'
                });
            }
            return res.status(response.status).json({ error: 'Failed to fetch document' });
        }

        const html = await response.text();
        const structure = parseDocStructure(html);

        // Attempt to extract title from HTML
        const $ = cheerio.load(html);
        const title = $('title').text().replace(' - Google Docs', '') || 'Untitled Document';

        res.json({
            title: title,
            docId: docId,
            structure: structure
        });

    } catch (err) {
        console.error('[GoogleDocs] Fetch Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

function createRouter(db) {
    router.get('/fetch/:docId', fetchDocHandler);
    return router;
}

function parseDocStructure(html) {
    const $ = cheerio.load(html);
    const simplified = [];

    // Google Docs HTML export puts the content in the body, often with inline styles
    // We look for h1-h6 and p tags
    $('body').children().each((i, el) => {
        const tag = el.tagName.toLowerCase();
        const text = $(el).text().trim();

        if (!text) return;

        let type = 'NORMAL_TEXT';

        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            type = 'HEADING_' + tag[1]; // e.g. HEADING_1
        } else if (tag === 'p') {
            type = 'NORMAL_TEXT';
            // Check for class-based titles/subtitles if needed, but for now stick to basics
            // Sometimes Google uses classes for headings (e.g. .c0) 
            // but the export format usually respects semantic tags compared to the API
        } else if (tag === 'ul' || tag === 'ol') {
            // Handle lists - treat each li as a paragraph for now or handle blocks
            // For simplicity in this key pass, we'll just extract text for now
            // This logic might need refinement
            type = 'NORMAL_TEXT'; // Lists are context
        }

        if (type) {
            simplified.push({
                type: type,
                text: text,
                style: {} // Placeholder for potential style extraction
            });
        }
    });

    return simplified;
}

module.exports = createRouter;
module.exports.fetchDocHandler = fetchDocHandler;
module.exports.parseDocStructure = parseDocStructure;
