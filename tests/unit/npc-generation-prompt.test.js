/**
 * Verification test for NPC generation prompt
 */
const request = require('supertest');
const express = require('express');

// Mock dependencies
const mockDb = {
    collection: jest.fn().mockReturnThis(),
    insertOne: jest.fn().mockResolvedValue({ insertedId: 'ent-123' }),
    findOne: jest.fn().mockResolvedValue({ _id: 'codex-123', path_components: ['People', 'Valerius'] })
};

const mockGenerateContent = jest.fn();
jest.mock('../../services/aiService', () => ({
    generateContent: mockGenerateContent
}));

describe('NPC Generation Prompt', () => {
    let app;

    beforeAll(() => {
        const generationApi = require('../../routes/generation-api');
        app = express();
        app.use(express.json());
        app.use('/v1/generation', generationApi(mockDb));
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockGenerateContent.mockResolvedValue({
            entity: { name: 'Commander Valerius', baseStats: {}, facts: {} },
            codex: { name: 'Commander Valerius', summary: 'Summary', content: [] }
        });
    });

    test('should include race, alignment, and saves in the prompt', async () => {
        await request(app)
            .post('/v1/generation/npc')
            .send({
                npc: { name: 'Commander Valerius', race: 'Human', class: 'Paladin', level: 5 }
            });

        const prompt = mockGenerateContent.mock.calls[0][1];
        console.log("DEBUG PROMPT SNIPPET:", prompt.substring(prompt.indexOf('baseStats'), prompt.indexOf('baseStats') + 500));

        expect(prompt).toMatch(/"race":/);
        expect(prompt).toMatch(/"alignment":/);
        expect(prompt).toMatch(/"saves":/);
        expect(prompt).toMatch(/"fortitude":/);
        expect(prompt).toMatch(/"reflex":/);
        expect(prompt).toMatch(/"will":/);
        expect(prompt).toMatch(/"feats":/);
        expect(prompt).toMatch(/"inventory":/);
    });
});
