const request = require('supertest');
const express = require('express');
const dataIntegrityRoutes = require('../../../routes/data-integrity');

describe('Data Integrity Routes', () => {
    let app;
    let mockDb;
    let mockCollection;

    beforeEach(() => {
        mockCollection = {
            findOne: jest.fn(),
            updateOne: jest.fn(),
            find: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            project: jest.fn().mockReturnThis(),
            toArray: jest.fn()
        };

        mockDb = {
            collection: jest.fn().mockReturnValue(mockCollection)
        };

        app = express();
        app.use(express.json());
        app.use('/api/data-integrity', dataIntegrityRoutes(mockDb));
    });

    describe('POST /calculate-fixes', () => {
        it('should calculate stats correctly for a medium progression class (Cleric)', async () => {
            const mockEntity = {
                name: "Test Cleric",
                class: "Cleric",
                baseStats: {
                    level: "5",
                    str: 14, dex: 10, con: 12, int: 10, wis: 16, cha: 10,
                    hp: "5d8+10"
                }
            };

            const response = await request(app)
                .post('/api/data-integrity/calculate-fixes')
                .send({ entity: mockEntity });

            expect(response.status).toBe(200);
            const data = response.body;

            // Level 5 Cleric (Medium BAB)
            // BAB = floor(5 * 0.75) = 3
            expect(data.bab).toBe(3);

            // CMB = BAB + Str Mod (2) + Size (0)
            expect(data.cmb).toBe(3 + 2); // 5

            // CMD = 10 + BAB + Str(2) + Dex(0)
            expect(data.cmd).toBe(10 + 3 + 2 + 0); // 15

            // Saves: Good Will, Good Fort, Poor Ref
            // Good: 2 + 5/2 = 4
            // Poor: 5/3 = 1
            // Fort (Good): 4 + Con(1) = 5
            expect(data.saves.fort.total).toBe(5);
            // Ref (Poor): 1 + Dex(0) = 1
            expect(data.saves.ref.total).toBe(1);
            // Will (Good): 4 + Wis(3) = 7
            expect(data.saves.will.total).toBe(7);
        });

        it('should handle string parsing for ability scores', async () => {
            const mockEntity = {
                name: "Strong Guy",
                class: "Fighter",
                baseStats: {
                    level: 1,
                    str: "18 (+4)",
                    dex: "12",
                    con: 14,
                    int: 10,
                    wis: 10,
                    cha: 10
                }
            };

            const response = await request(app)
                .post('/api/data-integrity/calculate-fixes')
                .send({ entity: mockEntity });

            expect(response.status).toBe(200);
            expect(data.bab).toBe(1); // Fighter is Fast BAB (1)
            // CMB = 1 + 4 = 5
            expect(response.body.cmb).toBe(5);
        });
    });
});
