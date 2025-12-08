const express = require('express');
const JSZip = require('jszip');
const oglImportRoutes = require('../../../routes/ogl-import');

describe('OGL Import Route', () => {
    let mockDb;
    let mockCollection;
    let router;
    let handler;

    beforeEach(() => {
        mockCollection = {
            bulkWrite: jest.fn().mockImplementation((ops) => {
                return Promise.resolve({ upsertedCount: ops.length, modifiedCount: 0 });
            })
        };
        mockDb = {
            collection: jest.fn().mockReturnValue(mockCollection)
        };
        router = oglImportRoutes(mockDb);

        // Extract the handler once
        const route = router.stack.find(layer => layer.route && layer.route.path === '/import/zip');
        if (!route) {
            throw new Error('Route /import/zip not found in router');
        }
        // The last handler in the stack is our controller (bypassing multer middleware)
        handler = route.route.stack[route.route.stack.length - 1].handle;
    });

    it('should return 400 if no file is uploaded', async () => {
        const req = { file: undefined };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'No file uploaded' });
    });

    it('should process a valid zip file correctly', async () => {
        const zip = new JSZip();

        // Mock Feat Data
        const featData = {
            name: 'Acrobatic',
            description: 'You get a bonus.',
            source: 'PFRPG Core'
        };
        zip.file('core_rulebook/feat/acrobatic.json', JSON.stringify(featData));

        // Mock Spell Data
        const spellData = {
            name: 'Fireball',
            school: 'evocation',
            spell_level: 'sorcerer/wizard 3',
            description: 'Boom.'
        };
        zip.file('core_rulebook/spell/fireball.json', JSON.stringify(spellData));

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

        const req = {
            file: {
                buffer: zipBuffer
            }
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await handler(req, res);

        // Check response
        expect(res.json).toHaveBeenCalled();
        const resultArgs = res.json.mock.calls[0][0];

        expect(resultArgs.processed).toBe(2);
        // Indirectly verify DB calls by checking the summary which aggregates DB results
        expect(resultArgs.entities).toBe(1);
        expect(resultArgs.spells).toBe(1);
    });

    it('should handle zip processing errors gracefully', async () => {
        const invalidBuffer = Buffer.from('not a zip file');
        const req = {
            file: { buffer: invalidBuffer }
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    });
});
