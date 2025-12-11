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
