const request = require('supertest');
const express = require('express');
const aiAssistantRoutes = require('../../../routes/ai-assistant');
const aiService = require('../../../services/aiService');

jest.mock('../../../services/aiService');

describe('AI Assistant Route', () => {
    let app;
    let mockDb;
    let mockCollection;

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
        aiService.generateContent.mockReset();
        aiService.generateContent.mockResolvedValue({ ops: [] });

        app = express();
        app.use(express.json());
        app.use('/api/ai', aiAssistantRoutes(mockDb));
    });

    it('should strip "Codex" and replace spaces with underscores in prompt examples', async () => {
        const reqBody = { query: 'Test Query', model: 'test-model' };

        await request(app)
            .post('/api/ai/generate-update')
            .send(reqBody);

        expect(aiService.generateContent).toHaveBeenCalled();
        const callArgs = aiService.generateContent.mock.calls[0];
        const systemPrompt = callArgs[1];

        // 1. Verify Examples in Prompt
        expect(systemPrompt).toContain('"Places"');
        expect(systemPrompt).toContain('"Solarran_Freehold"');
        expect(systemPrompt).not.toContain('"Solarran Freehold"');

        expect(systemPrompt).toMatch(/"Places",\s*"Solarran_Freehold"/);
    });

    it('should include strict rules in system prompt', async () => {
        const reqBody = { query: 'Test Query', model: 'test-model' };

        await request(app)
            .post('/api/ai/generate-update')
            .send(reqBody);

        const systemPrompt = aiService.generateContent.mock.calls[0][1];

        // 2. Verify Rules
        expect(systemPrompt).toContain("NO 'Codex'");
        expect(systemPrompt).toContain("NO spaces in tags");
        expect(systemPrompt).toContain("(use underscores)");
    });
});
