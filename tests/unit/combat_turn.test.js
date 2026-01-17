const request = require('supertest');
const express = require('express');
const { ObjectId } = require('mongodb');

// Mock db
const mockCombatant = {
    _id: new ObjectId(),
    name: 'Hero',
    initiative: 20,
    effects: [
        { name: 'Bless', duration: 10, unit: 'rounds', remainingRounds: 10 },
        { name: 'Stunned', duration: 1, unit: 'rounds', remainingRounds: 1 }
    ]
};

const mockFight = {
    _id: new ObjectId(),
    name: 'Test Fight',
    currentTurnIndex: 0, // Currently Hero's turn? No, let's say it's someone else's turn and we are moving TO Hero.
    // actually, let's say we have 2 combatants.
    roundCounter: 1
};

// We need two combatants to test turn advancing
const combatant1 = { ...mockCombatant, _id: new ObjectId(), name: 'C1', initiative: 20 };
const combatant2 = {
    _id: new ObjectId(),
    name: 'C2',
    initiative: 10,
    effects: [{ name: 'Shield', duration: 1, unit: 'rounds', remainingRounds: 1 }]
};

// If currentTurnIndex is 0 (C1), next turn makes it 1 (C2).
// C2's effects should decrement.

const mockDb = {
    collection: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockImplementation((query) => {
        if (query._id && query._id.toString() === mockFight._id.toString()) return Promise.resolve(mockFight);
        return Promise.resolve(null);
    }),
    find: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue([combatant1, combatant2]),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    insertOne: jest.fn().mockResolvedValue({ insertedId: new ObjectId() })
};

describe('Combat Turn Logic', () => {
    it('should decrement effects for the active combatant on next turn', async () => {
        const combatRoute = require('../../routes/combat');
        const app = express();
        app.use(express.json());
        app.use('/codex/api/dm-toolkit', combatRoute(mockDb));

        // Start: Turn 0 (C1). Next turn -> Turn 1 (C2).
        // C2 has 'Shield' with 1 round left. It should decrement to 0.

        const res = await request(app)
            .patch(`/codex/api/dm-toolkit/fights/${mockFight._id}/next-turn`);

        expect(res.status).toBe(200);

        // Check if updateOne was called for C2
        const updateCalls = mockDb.collection().updateOne.mock.calls;
        // Search for the call targeting C2
        const c2Update = updateCalls.find(call => call[0]._id.toString() === combatant2._id.toString());

        expect(c2Update).toBeDefined();
        const setOp = c2Update[1].$set;
        expect(setOp.effects[0].remainingRounds).toBe(0);
    });
});
