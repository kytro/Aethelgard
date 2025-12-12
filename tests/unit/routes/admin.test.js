const express = require('express');
const request = require('supertest');
const JSZip = require('jszip');
const adminRoute = require('../../../routes/admin');
const { ObjectId } = require('mongodb');

// Helper to create an express app and mount the router
const createApp = (db) => {
    const app = express();
    app.use(express.json());
    // Mock multer to process the file in memory without middleware complexity in unit test
    // But since we use router.post directly with upload.single, we might need to mock middleware or use integration style?
    // Let's use supertest which handles multipart uploads fine, 
    // BUT we need the router to be mounted.
    app.use('/admin', adminRoute(db));
    return app;
};

describe('Admin Routes (Backup/Restore)', () => {
    let mockDb;
    let mockCollections;
    let app;

    beforeEach(() => {
        // Mock DB and Collections
        const defaultResult = { insertedCount: 0, upsertedCount: 0, modifiedCount: 0 };
        mockCollections = {
            entities_pf1e: {
                countDocuments: jest.fn().mockResolvedValue(0),
                find: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue([]),
                deleteMany: jest.fn().mockResolvedValue({}),
                insertMany: jest.fn().mockResolvedValue(defaultResult),
                bulkWrite: jest.fn().mockResolvedValue(defaultResult)
            },
            rules_pf1e: {
                countDocuments: jest.fn().mockResolvedValue(0),
                find: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue([]),
                deleteMany: jest.fn().mockResolvedValue({}),
                insertMany: jest.fn().mockResolvedValue(defaultResult),
                bulkWrite: jest.fn().mockResolvedValue(defaultResult)
            }
        };

        const listCollectionsToArrayMock = jest.fn().mockResolvedValue([]);
        mockDb = {
            collection: jest.fn((name) => mockCollections[name] || {
                find: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue([]),
                deleteMany: jest.fn().mockResolvedValue({}),
                insertMany: jest.fn().mockResolvedValue(defaultResult),
                bulkWrite: jest.fn().mockResolvedValue(defaultResult)
            }),
            listCollections: jest.fn().mockImplementation(() => ({
                toArray: listCollectionsToArrayMock
            })),
            _listCollectionsToArrayMock: listCollectionsToArrayMock
        };

        app = createApp(mockDb);
    });

    describe('GET /admin/backup', () => {
        it('should generate a ZIP file containing beastiary.json, codex.json and data.json', async () => {
            // ... setup ...
            mockDb._listCollectionsToArrayMock.mockResolvedValue([
                { name: 'entities_pf1e' },
                { name: 'codex_entries' },
                { name: 'rules_pf1e' }
            ]);


            const mockBeastiary = [{ _id: 'b1', name: 'Beast 1' }];
            const mockCodex = [{ _id: 'c1', title: 'Codex 1' }]; // Mock data
            const mockRules = [{ _id: 'r1', name: 'Rule 1' }];

            // Mock implementation for different collections
            // We need to add codex_entries to mock collections or ensure default handles it
            // Current setup in beforeEach has specific mocks for entities and rules, others get default.
            // Let's rely on default or add specific if we want to spy.

            // Add specific spy for codex_entries
            const mockCodexCollection = {
                find: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockCodex)
            };
            mockDb.collection.mockImplementation((name) => {
                if (name === 'entities_pf1e') {
                    // Override find/toArray but keep others just in case
                    mockCollections.entities_pf1e.toArray.mockResolvedValue(mockBeastiary);
                    return mockCollections.entities_pf1e;
                }
                if (name === 'rules_pf1e') {
                    mockCollections.rules_pf1e.toArray.mockResolvedValue(mockRules);
                    return mockCollections.rules_pf1e;
                }
                if (name === 'codex_entries') return mockCodexCollection;
                return { find: jest.fn().mockReturnThis(), toArray: jest.fn().mockResolvedValue([]) };
            });

            // Execute Request with Binary Parser
            const response = await request(app)
                .get('/admin/backup')
                .buffer()
                .parse((res, callback) => {
                    res.setEncoding('binary');
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
                })
                .expect(200);

            // Verify Headers
            expect(response.headers['content-type']).toContain('application/zip');
            expect(response.headers['content-disposition']).toContain('attachment; filename=backup.zip');

            // Verify ZIP Content
            const zipBuffer = response.body;
            const zip = await JSZip.loadAsync(zipBuffer);

            expect(Object.keys(zip.files)).toContain('beastiary.json');
            expect(Object.keys(zip.files)).toContain('codex.json'); // Verify new file
            expect(Object.keys(zip.files)).toContain('data.json');

            const beastiaryContent = await zip.file('beastiary.json').async('string');
            expect(JSON.parse(beastiaryContent)).toEqual(mockBeastiary);

            const codexContent = await zip.file('codex.json').async('string');
            expect(JSON.parse(codexContent)).toEqual(mockCodex);

            const dataContent = await zip.file('data.json').async('string');
            const dataObj = JSON.parse(dataContent);
            expect(dataObj).toHaveProperty('rules_pf1e.json');

            // data.json structure is Object with ID keys
            const rulesData = dataObj['rules_pf1e.json'];
            expect(rulesData['r1']).toEqual({ name: 'Rule 1' }); // _id stripped in non-beastiary default logic?
            // Re-checking implementation: 
            // "documents.forEach(doc => { const { _id, ...docContent } = doc; collectionObject[_id.toString()] = docContent; });"
            // Yes, _id is key, content is value.
        });
    });

    // NOTE: Testing POST with file upload via supertest works well
    describe('POST /admin/restore', () => {
        it('should restore from a valid ZIP file', async () => {
            // Create a real ZIP buffer
            const zip = new JSZip();
            const mockBeastiary = [{ _id: 'b1', name: 'Beast 1' }];
            const mockCodex = [{ _id: 'c1', title: 'Codex 1' }];
            const mockRules = [{ _id: 'r1', name: 'Rule 1' }];

            zip.file('beastiary.json', JSON.stringify(mockBeastiary));
            zip.file('codex.json', JSON.stringify(mockCodex));

            const backupData = {
                'rules_pf1e.json': { 'r1': { name: 'Rule 1' } } // Matches format inside data.json -> rules_pf1e.json
            };
            zip.file('data.json', JSON.stringify(backupData));

            const buffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Setup Mocks for Codex Restore
            const defaultResult = { insertedCount: 1, upsertedCount: 0, modifiedCount: 0 };
            const mockCodexCollection = {
                deleteMany: jest.fn().mockResolvedValue({}),
                insertMany: jest.fn().mockResolvedValue(defaultResult),
                bulkWrite: jest.fn()
            };
            mockDb.collection.mockImplementation((name) => {
                if (name === 'entities_pf1e') return mockCollections.entities_pf1e;
                if (name === 'rules_pf1e') return mockCollections.rules_pf1e;
                if (name === 'codex_entries') return mockCodexCollection;
                return { deleteMany: jest.fn(), insertMany: jest.fn() };
            });

            mockCollections.entities_pf1e.insertMany.mockResolvedValue({ insertedCount: 1 });
            mockCollections.rules_pf1e.insertMany.mockResolvedValue({ insertedCount: 1 });

            await request(app)
                .post('/admin/restore')
                .attach('backupFile', buffer, 'backup.zip')
                .expect(200);

            // Verify Beastiary Restore
            expect(mockCollections.entities_pf1e.deleteMany).toHaveBeenCalled(); // Default full restore
            expect(mockCollections.entities_pf1e.insertMany).toHaveBeenCalledWith([
                expect.objectContaining({ _id: 'b1', name: 'Beast 1' }) // String ID converted to string or ObjID?
                // Logic: (doc._id && ObjectId.isValid(doc._id)) ? new ObjectId(doc._id) : doc._id
                // 'b2' is not valid ObjectId hex, so it remains string 'b2'
            ]);

            // Verify Codex Restore
            expect(mockCodexCollection.deleteMany).toHaveBeenCalled();
            expect(mockCodexCollection.insertMany).toHaveBeenCalledWith([
                expect.objectContaining({ _id: 'c1', title: 'Codex 1' })
            ]);

            // Verify Rules Restore
            expect(mockCollections.rules_pf1e.deleteMany).toHaveBeenCalled();
            expect(mockCollections.rules_pf1e.insertMany).toHaveBeenCalledWith([
                expect.objectContaining({ _id: expect.anything(), name: 'Rule 1' })
            ]);
        });

        it('should fallback to legacy JSON if not a valid ZIP', async () => {
            const legacyData = {
                'rules_pf1e.json': { 'r3': { name: 'Legacy Rule' } }
            };
            const buffer = Buffer.from(JSON.stringify(legacyData));

            mockCollections.rules_pf1e.insertMany.mockResolvedValue({ insertedCount: 1 });

            await request(app)
                .post('/admin/restore')
                .attach('backupFile', buffer, 'backup.json')
                .expect(200);

            expect(mockCollections.rules_pf1e.insertMany).toHaveBeenCalled();
        });
    });
});
