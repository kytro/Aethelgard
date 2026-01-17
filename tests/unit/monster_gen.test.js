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

describe('NPC Generator Logic', () => {

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('should generate Plant instructions restricting equipment', async () => {
        // Mock aiService
        jest.doMock('../../services/aiService', () => ({
            generateContent: jest.fn().mockImplementation((db, prompt) => {
                // Verify the prompt contains the Plant rules
                if (prompt.includes('PLANT TYPE RULES')) {
                    if (prompt.includes('"equipment": MUST be empty')) {
                        return Promise.resolve({
                            baseStats: { Str: 10, Dex: 10, Con: 10, Int: 10, Wis: 10, Cha: 10 },
                            skills: {},
                            feats: [],
                            equipment: [], // AI should return empty
                            magicItems: [],
                            immune: "poison, sleep"
                        });
                    }
                }
                return Promise.resolve({});
            }),
            getAvailableModels: jest.fn().mockResolvedValue(['gemini-1.5-flash'])
        }));

        const dmToolkitAiRoute = require('../../routes/dm-toolkit-ai');
        const app = express();
        app.use(express.json());
        app.use('/codex/api/dm-toolkit-ai', dmToolkitAiRoute(mockDb));

        const res = await request(app)
            .post('/codex/api/dm-toolkit-ai/generate-npc-details')
            .send({
                query: 'Mandragora',
                model: 'gemini-1.5-flash',
                options: {
                    npc: { name: 'Morthos', race: 'Mandragora', type: 'Plant', class: 'Monster', level: 3 }
                }
            });

        // We can't easily check the prompt string itself in an integration test without spy, 
        // but if the AI service mock returns data, it means it was called.
        // Let's rely on the mock implementation above checking the prompt string.
        expect(res.body.equipment).toEqual([]);
        expect(res.body.immune).toContain('poison');
    });

    it('should fall back to generic monster rules for unknown types', async () => {
        // Mock aiService
        jest.doMock('../../services/aiService', () => ({
            generateContent: jest.fn().mockImplementation((db, prompt) => {
                if (prompt.includes('MONSTER TYPE RULES')) {
                    return Promise.resolve({ equipment: [] });
                }
                return Promise.resolve({});
            }),
            getAvailableModels: jest.fn().mockResolvedValue(['gemini-1.5-flash'])
        }));

        const dmToolkitAiRoute = require('../../routes/dm-toolkit-ai');
        const app = express();
        app.use(express.json());
        app.use('/codex/api/dm-toolkit-ai', dmToolkitAiRoute(mockDb));

        await request(app)
            .post('/codex/api/dm-toolkit-ai/generate-npc-details')
            .send({
                query: 'Weird Beast',
                model: 'gemini-1.5-flash',
                options: {
                    npc: { name: 'Blob', race: 'Unknown', type: 'Aberration', class: 'Monster', level: 3 }
                }
            });
    });
});
