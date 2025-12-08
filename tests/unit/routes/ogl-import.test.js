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
        // Feat maps to 'rules', Spell maps to 'spells'
        expect(resultArgs.rules).toBe(1);
        expect(resultArgs.spells).toBe(1);
    });

    it('should process monster data and generate codex pages', async () => {
        const zip = new JSZip();

        // Mock Monster Data
        const monsterData = {
            name: 'Test Dragon',
            creature_type: 'Dragon',
            hp: '200',
            ac: '25',
            description: 'A fierce test dragon.',
            source: 'Bestiary 1',
            skills: 'Perception +10, Stealth +15'
        };
        // Use a path that definitely matches /monster/ regex
        zip.file('core_rulebook/monster/test_dragon.json', JSON.stringify(monsterData));

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

        const req = {
            file: { buffer: zipBuffer }
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await handler(req, res);

        // Check response summary
        expect(res.json).toHaveBeenCalled();
        const resultArgs = res.json.mock.calls[0][0];

        // Monster maps to 'entities'
        expect(resultArgs.entities).toBe(1);

        // Verify Entity Insert (entities_pf1e)
        // Check that db.collection was called with expected collection names
        expect(mockDb.collection).toHaveBeenCalledWith('entities_pf1e');

        // Check that the parsed entity includes the skills object
        const entityInsertOp = mockCollection.bulkWrite.mock.calls.find(call =>
            call[0].some(op => op.updateOne?.update?.$set?.type === 'monster')
        );
        expect(entityInsertOp).toBeDefined();

        // Extract the update operation to check stats
        const monsterUpdate = entityInsertOp[0].find(op => op.updateOne?.update?.$set?.type === 'monster').updateOne.update.$set;
        expect(monsterUpdate.baseStats.skills).toEqual({
            'Perception': 10,
            'Stealth': 15
        });

        // Verify Codex Hierarchy Inserts (codex_entries)
        expect(mockDb.collection).toHaveBeenCalledWith('codex_entries');

        // Ensure root 'Bestiary' node is created
        const bestiaryCalls = mockCollection.bulkWrite.mock.calls.find(call =>
            call[0].some(op => op.updateOne?.filter?.path_components?.[0] === 'Bestiary' && op.updateOne.filter.path_components.length === 1)
        );
        expect(bestiaryCalls).toBeDefined();

    });

    it('should convert HTML sections to codex blocks', async () => {
        const zip = new JSZip();

        const entityData = {
            name: 'Test Antipaladin',
            type: 'npc',
            sections: [
                {
                    name: 'Fall From Grace',
                    body: '<table><caption>Fall From Grace</caption><tr><td>Test Table Cell</td></tr></table>',
                    type: 'table'
                },
                {
                    name: 'Role',
                    body: '<p>Antipaladins are villains.</p>',
                    type: 'section'
                }
            ]
        };

        zip.file('advanced_players_guide/npc/test_antipaladin.json', JSON.stringify(entityData));

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

        const req = {
            file: { buffer: zipBuffer }
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await handler(req, res);

        expect(res.json).toHaveBeenCalled();

        // Verify Codex Entry Content
        const codexPageOp = mockCollection.bulkWrite.mock.calls.find(call =>
            call[0].some(op => op.updateOne?.update?.$set?.path_components && op.updateOne.update.$set.name === 'Test Antipaladin')
        );
        expect(codexPageOp).toBeDefined();

        const pageUpdate = codexPageOp[0].find(op => op.updateOne?.update?.$set?.path_components && op.updateOne.update.$set.name === 'Test Antipaladin').updateOne.update.$set;

        expect(pageUpdate.content).toBeDefined();
        // Should have:
        // 1. Heading (Fall From Grace) - name of section
        // 2. Table
        // 3. Heading (Role)
        // 4. Paragraph

        // Note: My implementation skips 'Role' heading? No, I checked:
        // if (section.name && section.name !== 'Description' && section.name !== 'Role')
        // So 'Role' heading will be skipped.

        const blocks = pageUpdate.content;
        expect(blocks).toEqual(expect.arrayContaining([
            { type: 'heading', text: 'Fall From Grace' },
            {
                type: 'table',
                title: 'Fall From Grace',
                headers: ['Column 1'],
                rows: [{ 'Column 1': 'Test Table Cell' }]
            },
            { type: 'paragraph', text: 'Antipaladins are villains.' }
        ]));
    });

    it('should process deity data and generate codex pages', async () => {
        const zip = new JSZip();

        // Mock Deity Data
        const deityData = {
            name: 'Test God',
            alignment: 'LG',
            domains: ['Good', 'Law'],
            description: 'A benevolent deity.',
            source: 'Inner Sea Gods'
        };
        zip.file('core_rulebook/deity/test_god.json', JSON.stringify(deityData));

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

        const req = {
            file: { buffer: zipBuffer }
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await handler(req, res);

        // Check response summary
        expect(res.json).toHaveBeenCalled();
        const resultArgs = res.json.mock.calls[0][0];

        // Deity maps to 'entities'
        expect(resultArgs.entities).toBe(1);

        // Verify Entity Insert (entities_pf1e)
        // Check that db.collection was called with expected collection names
        expect(mockDb.collection).toHaveBeenCalledWith('entities_pf1e');
        expect(mockDb.collection).toHaveBeenCalledWith('codex_entries');

        // Verify Codex Hierarchy Inserts (codex_entries)
        // Check for 'Codex', 'Deities', and 'Test God' entries
        const codexCalls = mockCollection.bulkWrite.mock.calls;

        // Find the bulkWrite call that includes path_components: ['Deities'] (root)
        const deitiesCategory = codexCalls.some(call =>
            call[0].some(op => op.updateOne?.filter?.path_components?.[0] === 'Deities' && op.updateOne.filter.path_components.length === 1)
        );
        expect(deitiesCategory).toBeTruthy();

        // Find the page entry
        const deityPage = codexCalls.some(call =>
            call[0].some(op => op.updateOne?.filter?.path_components?.[1] === 'Test God')
        );
        expect(deityPage).toBeTruthy();
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
