const request = require('supertest');
const express = require('express');

// Mock db
const mockDb = {
    collection: jest.fn().mockReturnThis(),
    bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 })
};

// Mock JSZip module BEFORE requiring route
const mockZipFiles = {
    'PSRD-Data/bestiary/creature/dragon/red_dragon.json': {
        dir: false,
        async: jest.fn().mockResolvedValue(JSON.stringify({
            name: 'Red Dragon',
            creature_type: 'Dragon',
            ac: '20',
            hp: '200',
            feats: 'Power Attack, Cleave',
            immune: 'fire',
            melee: 'Bite +15 (2d6+10), 2 Claws +10 (1d8+5)'
        }))
    },
    'PSRD-Data/bestiary/creature/undead/vampire.json': {
        dir: false,
        async: jest.fn().mockResolvedValue(JSON.stringify({
            name: 'Vampire',
            creature_type: 'Undead',
            ac: '22',
            hp: '100'
        }))
    },
    'PSRD-Data/core/monster/goblin.json': { // Existing logic check
        dir: false,
        async: jest.fn().mockResolvedValue(JSON.stringify({
            name: 'Goblin',
            creature_type: 'Humanoid',
            ac: '16',
            hp: '6'
        }))
    }
};

const mockJSZip = {
    loadAsync: jest.fn().mockResolvedValue({
        files: mockZipFiles
    })
};

jest.mock('jszip', () => mockJSZip);

describe('OGL Import creature recursion', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should process files in creature directory', async () => {
        const oglImportRoute = require('../../routes/ogl-import');
        const app = express();
        app.use(express.json());
        app.use('/codex/api/ogl-import', oglImportRoute(mockDb));

        // Create a dummy zip buffer
        const dummyBuffer = Buffer.from('dummy zip');

        const res = await request(app)
            .post('/codex/api/ogl-import/import/zip')
            .attach('file', dummyBuffer, 'test.zip');

        if (res.status !== 200 || res.body.entities !== 3) {
            console.log('Response:', JSON.stringify(res.body, null, 2));
            console.log('Error:', res.error);
        }

        expect(res.status).toBe(200);
        expect(res.body.processed).toBe(3);

        // Verify mapping logic by checking the bulkWrite calls
        const bulkWriteStub = mockDb.collection('entities_pf1e').bulkWrite;
        const dragonOp = bulkWriteStub.mock.calls[0][0].find(op => op.updateOne.update.$set.name === 'Red Dragon');

        expect(dragonOp).toBeDefined();
        const stats = dragonOp.updateOne.update.$set.baseStats;
        expect(stats.feats).toContain('Power Attack'); // Assuming we add this to mock
        expect(stats.immune).toBe('fire');
        expect(stats.hp).toBe('200');

        // Verify Attack Parsing
        expect(stats.attacks).toBeDefined();
        // Check for Bite +15 (2d6+10)
        expect(stats.attacks).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Bite', bonus: '+15', damage: '2d6+10', type: 'melee' })
        ]));
    });
});
