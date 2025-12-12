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
        it('should generate a ZIP file containing beastiary.json and data.json', async () => {
            // Setup mocked data
            mockDb._listCollectionsToArrayMock.mockResolvedValue([
                { name: 'entities_pf1e' },
                { name: 'rules_pf1e' }
            ]);

            const mockBeastiary = [{ _id: 'b1', name: 'Beast 1' }];
            const mockRules = [{ _id: 'r1', name: 'Rule 1' }];

            mockCollections.entities_pf1e.toArray.mockResolvedValue(mockBeastiary);
            mockCollections.rules_pf1e.toArray.mockResolvedValue(mockRules);

            // Execute Request
            const response = await request(app).get('/admin/backup').expect(200);

            // Verify Headers
            expect(response.headers['content-type']).toContain('application/zip');
            expect(response.headers['content-disposition']).toContain('attachment; filename=backup.zip');

            // Verify ZIP Content
            const zipBuffer = response.body;
            const zip = await JSZip.loadAsync(zipBuffer);

            expect(Object.keys(zip.files)).toContain('beastiary.json');
            expect(Object.keys(zip.files)).toContain('data.json');

            const beastiaryContent = await zip.file('beastiary.json').async('string');
            expect(JSON.parse(beastiaryContent)).toEqual(mockBeastiary);

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
            const restoreBeastiary = [{ _id: 'b2', name: 'New Beast' }];
            const restoreRules = { 'r2': { name: 'New Rule' } }; // Matches format inside data.json -> rules_pf1e.json

            zip.file('beastiary.json', JSON.stringify(restoreBeastiary));

            const dataJson = {
                'rules_pf1e.json': restoreRules
            };
            zip.file('data.json', JSON.stringify(dataJson));

            const buffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Setup Mock for Insert
            mockCollections.entities_pf1e.insertMany.mockResolvedValue({ insertedCount: 1 });
            mockCollections.rules_pf1e.insertMany.mockResolvedValue({ insertedCount: 1 });

            await request(app)
                .post('/admin/restore')
                .attach('backupFile', buffer, 'backup.zip')
                .expect(200);

            // Verify Beastiary Restore
            expect(mockCollections.entities_pf1e.deleteMany).toHaveBeenCalled(); // Default full restore
            expect(mockCollections.entities_pf1e.insertMany).toHaveBeenCalledWith([
                expect.objectContaining({ _id: 'b2', name: 'New Beast' }) // String ID converted to string or ObjID?
                // Logic: (doc._id && ObjectId.isValid(doc._id)) ? new ObjectId(doc._id) : doc._id
                // 'b2' is not valid ObjectId hex, so it remains string 'b2'
            ]);

            // Verify Rules Restore
            expect(mockCollections.rules_pf1e.deleteMany).toHaveBeenCalled();
            expect(mockCollections.rules_pf1e.insertMany).toHaveBeenCalledWith([
                expect.objectContaining({ _id: 'r2', name: 'New Rule' })
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
