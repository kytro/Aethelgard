const aiAssistantRoutes = require('../../../routes/ai-assistant');
const geminiService = require('../../../services/geminiService');

jest.mock('../../../services/geminiService');

describe('AI Assistant Route', () => {
    let mockDb;
    let mockCollection;
    let router;
    let handler;

    beforeEach(() => {
        // Mock DB returning "dirty" examples
        mockCollection = {
            find: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            project: jest.fn().mockReturnThis(),
            toArray: jest.fn().mockResolvedValue([
                { path_components: ['Codex', 'Places', 'Solarran Freehold'] },
                { path_components: ['Codex', 'Quest', 'My Quest'] }
            ]),
            findOne: jest.fn().mockResolvedValue({ default_ai_model: 'test-model' })
        };
        mockDb = {
            collection: jest.fn().mockReturnValue(mockCollection)
        };

        // Reset mocks
        geminiService.generateContent.mockReset();
        geminiService.generateContent.mockResolvedValue({ ops: [] });

        router = aiAssistantRoutes(mockDb);

        // Extract handler for /generate-update
        const route = router.stack.find(layer => layer.route && layer.route.path === '/generate-update');
        if (!route) {
            throw new Error('Route /generate-update not found');
        }
        handler = route.route.stack[route.route.stack.length - 1].handle;
    });

    it('should strip "Codex" and replace spaces with underscores in prompt examples', async () => {
        const req = { body: { query: 'Test Query', model: 'test-model' } };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await handler(req, res);

        expect(geminiService.generateContent).toHaveBeenCalled();
        const callArgs = geminiService.generateContent.mock.calls[0];
        const systemPrompt = callArgs[1];

        // 1. Verify Examples in Prompt
        // Match formatted JSON structure
        expect(systemPrompt).toContain('"Places"');
        expect(systemPrompt).toContain('"Solarran_Freehold"');
        expect(systemPrompt).not.toContain('"Solarran Freehold"'); // Space version should be gone

        expect(systemPrompt).toContain('"Quest"');
        expect(systemPrompt).toContain('"My_Quest"');

        // Ensure 'Codex' is not in the examples block (it might be in text)
        // We can check that the specific combination "Codex" is not in the array dump
        // But since we can't easily scope to the array, checking exclusion of 'Codex' near 'Places' is harder.
        // However, the input had ['Codex', 'Places', ...]. If filtering works, we should not see:
        // "Codex",
        // "Places"
        // in that order with that indentation.
        // Simplest check: The string "Codex" should not appear inside the example array context.
        // Let's verify that the input path components don't exist in their original form.
        expect(systemPrompt).not.toContain('"Codex"'); // This is risky if 'Codex' appears in instructions.
        // Actually, 'Codex' DOES appear in the prompts ("linking CODEX AND DATA").
        // So we strictly want to ensure the EXAMPLE ARRAYS don't have it.
        // The original input was ['Codex', 'Places', 'Solarran Freehold'].
        // If stripped, we see "Places". If NOT stripped, we would see "Codex" before "Places" in the JSON.
        // Let's rely on the positive assertion that we see "Places" and "Solarran_Freehold".

        // We can also assert strict JSON formatting for one entry to be sure
        // [
        //   "Places",
        //   "Solarran_Freehold"
        // ]
        expect(systemPrompt).toMatch(/"Places",\s*"Solarran_Freehold"/);
        // Removed risky check for "Codex" string as it appears in instructions.
    });

    it('should include strict rules in system prompt', async () => {
        const req = { body: { query: 'Test Query', model: 'test-model' } };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await handler(req, res);

        const systemPrompt = geminiService.generateContent.mock.calls[0][1];

        // 2. Verify Rules
        expect(systemPrompt).toContain("MUST NOT include 'Codex'");
        expect(systemPrompt).toContain("MUST NOT contain spaces");
        expect(systemPrompt).toContain("Use underscores instead");
    });
});
