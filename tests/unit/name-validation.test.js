/**
 * Test for mandatory name validation in Codex and Collections APIs
 */
const request = require('supertest');
const express = require('express');

// Mock db
const mockDb = {
    collection: jest.fn().mockReturnThis(),
    findOne: jest.fn(),
    insertOne: jest.fn().mockResolvedValue({ insertedId: '123' }),
    findOneAndUpdate: jest.fn(),
    bulkWrite: jest.fn()
};

describe('Mandatory Name Validation', () => {

    describe('Codex API (PUT /entries/by-path)', () => {
        let app;

        beforeAll(() => {
            const codexApi = require('../../routes/codex-api');
            app = express();
            app.use(express.json());
            app.use('/v1', codexApi(mockDb));
        });

        it('should fail if name is missing in PUT request', async () => {
            const res = await request(app)
                .put('/v1/entries/by-path/Locations/Inn')
                .send({ summary: 'Missing name' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Validation failed');
            expect(res.body.details.some(d => d.error.includes('name'))).toBe(true);
        });

        it('should succeed if name is provided in PUT request', async () => {
            mockDb.findOneAndUpdate.mockResolvedValue({ _id: '123', name: 'The Inn' });

            const res = await request(app)
                .put('/v1/entries/by-path/Locations/Inn')
                .send({ name: 'The Inn', summary: 'Has name' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('Collections API (POST/PUT schemas for Data Browser)', () => {
        let app;

        beforeAll(() => {
            const collectionsApi = require('../../routes/collections');
            app = express();
            app.use(express.json());
            app.use('/admin', collectionsApi(mockDb));
        });

        it('should fail if name is missing in POST to codex_entries', async () => {
            const res = await request(app)
                .post('/admin/collections/codex_entries')
                .send({ summary: 'No name' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('name" is mandatory');
        });

        it('should fail if name is missing in PUT to entities_pf1e', async () => {
            const res = await request(app)
                .put('/admin/collections/entities_pf1e/123')
                .send({ baseStats: {} });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('name" is mandatory');
        });

        it('should succeed if name is provided in POST to codex_entries', async () => {
            const res = await request(app)
                .post('/admin/collections/codex_entries')
                .send({ name: 'Valid Entry', summary: 'Has name' });

            expect(res.status).toBe(201);
        });
    });
});
