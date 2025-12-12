const { fetchDocHandler, parseDocStructure } = require('../../routes/google_docs');

// Mock node-fetch
jest.mock('node-fetch');
const fetch = require('node-fetch');

describe('Google Docs Controller (Public Access)', () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('parseDocStructure', () => {
        it('should extract semantic headings', () => {
            const html = `
        <html>
          <body>
            <h1>Main Title</h1>
            <p>Intro text</p>
            <h2>Chapter 1</h2>
            <p>Chapter content</p>
          </body>
        </html>
      `;

            const result = parseDocStructure(html);

            expect(result).toEqual([
                { type: 'HEADING_1', text: 'Main Title', style: {} },
                { type: 'NORMAL_TEXT', text: 'Intro text', style: {} },
                { type: 'HEADING_2', text: 'Chapter 1', style: {} },
                { type: 'NORMAL_TEXT', text: 'Chapter content', style: {} }
            ]);
        });

        it('should detect bold text via CSS classes', () => {
            const html = `
        <html>
          <head>
            <style>
              .c1 { font-weight: 700; }
              .c2 { font-weight: bold; }
              .c3 { color: red; }
            </style>
          </head>
          <body>
            <p>Prefix <span class="c1">Bold Class 700</span> Suffix</p>
            <p>Start <span class="c2">Bold Class Named</span> End</p>
            <p><span class="c3">Not Bold</span></p>
          </body>
        </html>
      `;
            const result = parseDocStructure(html);
            // Mixed content should remain NORMAL_TEXT and keep markers
            expect(result[0].text).toBe('Prefix **Bold Class 700** Suffix');
            expect(result[1].text).toBe('Start **Bold Class Named** End');
            expect(result[2].text).toBe('Not Bold');
        });

        it('should promote list items starting with bold to HEADING_6', () => {
            const html = `
        <html>
          <head><style>.s1 { font-weight: 700 }</style></head>
          <body>
            <ul>
                <li><span class="s1">Item Title</span>: Description</li>
                <li>1. <span class="s1">Numbered Title</span> - Content</li>
                <li>- <span class="s1">Dash Title</span></li>
                <li>Plain item</li>
            </ul>
          </body>
        </html>
      `;
            const result = parseDocStructure(html);

            // Item 1: "**Item Title**: Description" -> Heading "Item Title" (colon removed)
            // Wait, logic is: matches regex -> converts to HEADING_6, removes bold markers.

            // Expected:
            // 1. HEADING_6 "Item Title: Description" ? 
            // The regex is: /^\s*\*\*([^*]+)\*\*[:\s]*$/ (Full line) OR /^[\s\-\u2022\d\.]*\*\*([^*]+)\*\*/ (Start)

            // Item 1: "**Item Title**: Description" -> Matches Start Bold
            // Logic: text = text.replace(/\*\*/g, '').trim(); 
            // Result: "Item Title: Description"

            expect(result[0].type).toBe('HEADING_6');
            expect(result[0].text).toBe('Item Title: Description');

            // Item 2: "1. **Numbered Title** - Content"
            // Matches Start Bold
            // Result: "1. Numbered Title - Content"
            expect(result[1].type).toBe('HEADING_6');
            expect(result[1].text).toBe('1. Numbered Title - Content');

            // Item 3: "- **Dash Title**" -> Matches Full Bold regex?
            // Full regex: /^\s*\*\*([^*]+)\*\*[:\s]*$/ -> No, because of leading dash?
            // Start regex: /^[\s\-\u2022\d\.]*\*\*([^*]+)\*\*/ -> Yes
            // Result: "- Dash Title"
            expect(result[2].type).toBe('HEADING_6');
            expect(result[2].text).toBe('- Dash Title');

            expect(result[3].type).toBe('NORMAL_TEXT');
        });

        it('should promote Paragraphs that look like headings (Full Bold)', () => {
            const html = `
        <html>
          <body>
            <p><strong>Actual Heading</strong></p>
            <p><strong>Heading with Colon:</strong></p>
          </body>
        </html>
      `;
            const result = parseDocStructure(html);

            expect(result[0].type).toBe('HEADING_6');
            expect(result[0].text).toBe('Actual Heading'); // Markers removed

            expect(result[1].type).toBe('HEADING_6');
            expect(result[1].text).toBe('Heading with Colon'); // Colon removed by Full Bold Logic
        });
    });

    describe('fetchDocHandler', () => {
        let req, res;

        beforeEach(() => {
            req = {
                params: { docId: 'doc123' },
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
        });

        it('should fetch public doc and return parsed data without auth', async () => {
            const mockHtml = '<html><head><title>Test Doc - Google Docs</title></head><body><h1>Hello</h1></body></html>';

            fetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue(mockHtml)
            });

            await fetchDocHandler(req, res);

            expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/d/doc123/export?format=html'));
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Test Doc',
                structure: [{ type: 'HEADING_1', text: 'Hello', style: {} }]
            }));
        });

        it('should return helpful error for private docs (403)', async () => {
            fetch.mockResolvedValue({
                ok: false,
                status: 403
            });

            await fetchDocHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.stringContaining('not public')
            }));
        });
    });
});
