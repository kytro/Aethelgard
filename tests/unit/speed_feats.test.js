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

describe('NPC Generator Speed and Feats', () => {

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('should request speed and feats in prompt', async () => {
        // Mock aiService
        jest.doMock('../../services/aiService', () => ({
            generateContent: jest.fn().mockImplementation((db, prompt) => {
                // Verify the prompt contains the new requirements
                if (prompt.includes('"speed": String') && prompt.includes('INCLUDE ALL MODES')) {
                    return Promise.resolve({
                        baseStats: { Str: 10, Dex: 10, Con: 10, Int: 10, Wis: 10, Cha: 10, Speed: "30 ft., fly 60 ft." },
                        speed: "30 ft., fly 60 ft.",
                        feats: ["Flyby Attack", "Hover"],
                        specialAbilities: ["Breath Weapon (Su)"],
                        specialAttacks: ["Constrict (1d4+4)", "Trample (2d6+4)"]
                    });
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
                query: 'Harpy',
                model: 'gemini-1.5-flash',
                options: {
                    npc: { name: 'Harpy', race: 'Harpy', type: 'Monster', class: 'Monster', level: 7 }
                }
            });

        expect(res.body.speed).toBe("30 ft., fly 60 ft.");
        expect(res.body.feats).toContain("Flyby Attack");
        expect(res.body.specialAbilities).toContain("Breath Weapon (Su)");
        expect(res.body.specialAttacks).toContain("Constrict (1d4+4)");
    });
});
