const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio'); // Ensure this is imported
const router = express.Router();

async function fetchDocHandler(req, res) {
    const { docId } = req.params;

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

    // 1. Parse CSS classes to identify which ones define "bold"
    // Google Docs uses format: .c1 { font-weight: 700 } or .c2 { font-weight: bold }
    const boldClasses = new Set();
    $('style').each((_, style) => {
        const css = $(style).html();
        // Regex to find class definitions: .classname { ... }
        const classRegex = /\.([a-zA-Z0-9_\-]+)\s*\{([^}]+)\}/g;
        let match;
        while ((match = classRegex.exec(css)) !== null) {
            const className = match[1];
            const content = match[2];
            // Check if this class applies bold (700 or 'bold')
            if (/font-weight\s*:\s*(700|bold)/i.test(content)) {
                boldClasses.add(className);
            }
        }
    });

    // Helper: Recursively extract text, wrapping BOLD segments in markdown **text**
    const extractText = (el) => {
        let text = '';
        $(el).contents().each((_, node) => {
            if (node.type === 'text') {
                text += node.data;
            } else if (node.type === 'tag') {
                const $node = $(node);

                // Don't recurse into nested lists (prevents duplicate text from nested <ul>)
                if (['ul', 'ol'].includes(node.tagName)) {
                    return;
                }

                const innerText = extractText(node);

                // Detect bold via tag, inline style, OR CSS class
                const style = $node.attr('style') || '';
                const classes = ($node.attr('class') || '').split(/\s+/);

                const isBoldTag = ['b', 'strong'].includes(node.tagName);
                const isBoldStyle = /font-weight\s*:\s*(700|bold)/i.test(style);
                const isBoldClass = classes.some(c => boldClasses.has(c));

                if ((isBoldTag || isBoldStyle || isBoldClass) && innerText.trim()) {
                    text += `**${innerText}**`;
                } else {
                    text += innerText;
                }
            }
        });
        return text;
    };

    const processElement = (el) => {
        const tag = el.tagName.toLowerCase();
        let text = extractText(el).trim();

        if (!text) return;

        let type = 'NORMAL_TEXT';

        // 1. Explicit HTML Headings (H1-H6)
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            type = 'HEADING_' + tag[1];
            text = text.replace(/\*\*/g, ''); // Clean up markdown markers in headings
        }
        // 2. Lists and Paragraphs - Check heuristics
        else if (tag === 'p' || tag === 'li') {
            // Heuristic 1: "Bold Heading" - Entire line is bold (ignoring colon/whitespace)
            // Matches: **Text**, **Text:**
            const fullBoldRegex = /^\s*\*\*([^*]+)\*\*[:\s]*$/;

            // Heuristic 2: "List Title" - Item STARTS with bold text
            // Matches: "**The Salt-Barrels** (Canteen)" or "1. **Name**"
            // Allows optional leading bullets, numbers, or whitespace
            const listStartBoldRegex = /^[\s\-\u2022\d\.]*\*\*([^*]+)\*\*/;

            if (fullBoldRegex.test(text)) {
                type = 'HEADING_6';
                text = text.replace(/\*\*/g, '').replace(/:$/, '').trim();
            }
            else if (listStartBoldRegex.test(text)) {
                type = 'HEADING_6';
                // Remove bold markers
                text = text.replace(/\*\*/g, '').trim();
                // Optional: remove trailing colon if you want "Name" instead of "Name:"
                // text = text.replace(/:$/, '').trim(); 
            }
            else {
                type = 'NORMAL_TEXT';
            }
        }

        if (type) {
            simplified.push({
                type: type,
                text: text,
                style: {}
            });
        }
    };

    $('body').children().each((i, el) => {
        const tag = el.tagName.toLowerCase();

        // Handle Lists: Process each <li> individually
        if (['ul', 'ol'].includes(tag)) {
            $(el).children('li').each((j, li) => processElement(li));
        } else {
            processElement(el);
        }
    });

    return simplified;
}

module.exports = createRouter;
module.exports.fetchDocHandler = fetchDocHandler;
module.exports.parseDocStructure = parseDocStructure;
