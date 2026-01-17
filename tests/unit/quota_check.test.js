const request = require('supertest');
const express = require('express');

// Mock db
const mockDb = {
    collection: jest.fn().mockReturnThis(),
    findOne: jest.fn(),
    find: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    project: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue([])
};

// Mock fetch globally
global.fetch = jest.fn();

describe('Quota Usage Fixes', () => {

    beforeEach(() => {
        jest.resetModules(); // Reset cache to ensure clean state
        jest.clearAllMocks();
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ models: [{ name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] }] })
        });
    });

    describe('AI Service Caching', () => {
        it('should cache available models to prevent excessive API calls', async () => {
            // Re-require to get fresh module instance
            const { getAvailableModels } = require('../../services/aiService');

            // First call
            await getAvailableModels(mockDb);
            expect(global.fetch).toHaveBeenCalledTimes(1);

            // Second call - should use cache
            await getAvailableModels(mockDb);
            expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1
        });
    });

    describe('DM Toolkit AI Route - RAG Lite', () => {
        it('should perform keyword search instead of dumping full codex', async () => {
            // Mock aiService for this test to avoid actually calling it
            jest.doMock('../../services/aiService', () => ({
                generateContent: jest.fn().mockResolvedValue('AI Response'),
                getAvailableModels: jest.fn().mockResolvedValue(['gemini-1.5-flash'])
            }));

            const dmToolkitAiRoute = require('../../routes/dm-toolkit-ai');

            const app = express();
            app.use(express.json());
            app.use('/codex/api/dm-toolkit-ai', dmToolkitAiRoute(mockDb));

            const queryReference = "Who is Captain Valerius?";

            mockDb.collection('codex_entries').toArray.mockResolvedValue([
                { name: 'Captain Valerius', content: 'He is the captain.' }
            ]);

            await request(app)
                .post('/codex/api/dm-toolkit-ai/assistant')
                .send({
                    query: queryReference,
                    model: 'gemini-1.5-flash',
                    options: {}  // No codex provided
                });

            // Verify db search was called with keywords
            // The route does: db.collection('entities_pf1e').find({ name: regex })

            expect(mockDb.collection).toHaveBeenCalledWith('entities_pf1e');

            // Check finding entities
            const findCalls = mockDb.find.mock.calls;
            const hasRegexSearch = findCalls.some(call => {
                const arg = call[0];
                if (arg.name instanceof RegExp) return true;
                if (arg.$or) return true;
                return false;
            });

            expect(hasRegexSearch).toBe(true);
        });
    });
});
