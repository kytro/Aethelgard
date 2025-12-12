const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
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

    // Helper: Recursively extract text, wrapping BOLD segments in markdown **text**
    const extractText = (el) => {
        let text = '';
        $(el).contents().each((_, node) => {
            if (node.type === 'text') {
                text += node.data;
            } else if (node.type === 'tag') {
                const $node = $(node);
                const innerText = extractText(node);

                // Detect bold via tag or style
                const style = $node.attr('style') || '';
                const isBold = ['b', 'strong'].includes(node.tagName) ||
                    /font-weight:\s*(700|bold)/i.test(style);

                if (isBold && innerText.trim()) {
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

        // 1. Explicit HTML Headings
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            type = 'HEADING_' + tag[1];
            // Strip markdown bold markers from headings as they are redundant
            text = text.replace(/\*\*/g, '');
        }
        // 2. Lists and Paragraphs - Check heuristics
        else if (tag === 'p' || tag === 'li') {
            // Heuristic 1: "Bold Heading" - Entire line is bold (ignoring colon/whitespace)
            // Matches: **Text**, **Text:**, ** Text **
            const fullBoldRegex = /^\s*\*\*([^*]+)\*\*[:\s]*$/;

            // Heuristic 2: "List Title" - List item STARTS with bold text
            // Matches: **The Salt-Barrels** (Canteen)
            const listStartBoldRegex = /^\s*\*\*([^*]+)\*\*/;

            if (fullBoldRegex.test(text)) {
                // Promote to HEADING (Level 6 acts as "General Content Heading")
                type = 'HEADING_6';
                text = text.replace(/\*\*/g, '').replace(/:$/, '').trim();
            }
            else if (listStartBoldRegex.test(text)) {
                // Promote list items starting with bold to headings
                type = 'HEADING_6';
                // Remove bold markers but keep the rest of the text (e.g. "(Canteen)")
                text = text.replace(/\*\*/g, '').trim();
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

        // Handle Lists: Process each <li> individually so they can be Headings
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
