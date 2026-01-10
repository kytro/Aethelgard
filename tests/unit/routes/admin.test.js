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
        it('should generate a ZIP file containing main.json, bestiary.json and data.json', async () => {
            // Setup mock collections
            mockDb._listCollectionsToArrayMock.mockResolvedValue([
                { name: 'entities_pf1e' },
                { name: 'codex_entries' },
                { name: 'rules_pf1e' },
                { name: 'dm_toolkit_fights' },
                { name: 'dm_toolkit_sessions' }
            ]);

            const mockEntities = [{ _id: 'e1', name: 'Goblin' }];
            const mockCodex = [
                { _id: 'c1', title: 'World Lore', path_components: ['Lore', 'World'] },
                { _id: 'c2', title: 'Goblin', path_components: ['Bestiary', 'Humanoid', 'Goblin'] }
            ];
            const mockRules = [{ _id: 'r1', name: 'Rule 1' }];
            const mockFights = [{ _id: 'f1', name: 'Ambush', combatants: [] }];
            const mockSessions = [{ _id: 's1', title: 'Session 1', notes: 'Started adventure' }];

            // Mock collections
            const mockCodexCollection = {
                find: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockCodex)
            };
            const mockFightsCollection = {
                find: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockFights)
            };
            const mockSessionsCollection = {
                find: jest.fn().mockReturnThis(),
                toArray: jest.fn().mockResolvedValue(mockSessions)
            };
            mockDb.collection.mockImplementation((name) => {
                if (name === 'entities_pf1e') {
                    mockCollections.entities_pf1e.toArray.mockResolvedValue(mockEntities);
                    return mockCollections.entities_pf1e;
                }
                if (name === 'rules_pf1e') {
                    mockCollections.rules_pf1e.toArray.mockResolvedValue(mockRules);
                    return mockCollections.rules_pf1e;
                }
                if (name === 'codex_entries') return mockCodexCollection;
                if (name === 'dm_toolkit_fights') return mockFightsCollection;
                if (name === 'dm_toolkit_sessions') return mockSessionsCollection;
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

            expect(Object.keys(zip.files)).toContain('main.json');
            expect(Object.keys(zip.files)).toContain('bestiary.json');
            expect(Object.keys(zip.files)).toContain('data.json');

            // Verify main.json contains non-Bestiary codex entries, fights, and sessions
            const mainContent = await zip.file('main.json').async('string');
            const mainData = JSON.parse(mainContent);
            expect(mainData.codex).toHaveLength(1);
            expect(mainData.codex[0].path_components[0]).toBe('Lore');
            expect(mainData.fights).toHaveLength(1);
            expect(mainData.fights[0].name).toBe('Ambush');
            expect(mainData.sessions).toHaveLength(1);
            expect(mainData.sessions[0].title).toBe('Session 1');

            // Verify bestiary.json contains Bestiary codex entries and entities
            const bestiaryContent = await zip.file('bestiary.json').async('string');
            const bestiaryData = JSON.parse(bestiaryContent);
            expect(bestiaryData.codex).toHaveLength(1);
            expect(bestiaryData.codex[0].path_components[0]).toBe('Bestiary');
            expect(bestiaryData.entities).toHaveLength(1);
            expect(bestiaryData.entities[0].name).toBe('Goblin');

            // Verify data.json contains other collections
            const dataContent = await zip.file('data.json').async('string');
            const dataObj = JSON.parse(dataContent);
            expect(Object.keys(dataObj)).toContain('rules_pf1e.json');
            expect(dataObj['rules_pf1e.json']['r1']).toEqual({ name: 'Rule 1' });
        });
    });

    // NOTE: Testing POST with file upload via supertest works well
    describe('POST /admin/restore', () => {
        it('should restore from new format ZIP file (main.json + bestiary.json)', async () => {
            // Create a real ZIP buffer with NEW format
            const zip = new JSZip();

            const mainData = {
                codex: [{ _id: 'c1', title: 'World Lore', path_components: ['Lore', 'World'] }]
            };
            const bestiaryData = {
                codex: [{ _id: 'c2', title: 'Goblin', path_components: ['Bestiary', 'Humanoid', 'Goblin'] }],
                entities: [{ _id: 'e1', name: 'Goblin' }]
            };
            const dataJson = {
                'rules_pf1e.json': { 'r1': { name: 'Rule 1' } }
            };

            zip.file('main.json', JSON.stringify(mainData));
            zip.file('bestiary.json', JSON.stringify(bestiaryData));
            zip.file('data.json', JSON.stringify(dataJson));

            const buffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Setup Mocks
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

            // Verify Entities Restore
            expect(mockCollections.entities_pf1e.deleteMany).toHaveBeenCalled();
            expect(mockCollections.entities_pf1e.insertMany).toHaveBeenCalledWith([
                expect.objectContaining({ _id: 'e1', name: 'Goblin' })
            ]);

            // Verify Codex Restore (both main and bestiary codex entries)
            expect(mockCodexCollection.deleteMany).toHaveBeenCalled();
            // insertMany called twice: once for main codex, once for bestiary codex
            expect(mockCodexCollection.insertMany).toHaveBeenCalledTimes(2);

            // Verify Rules Restore
            expect(mockCollections.rules_pf1e.deleteMany).toHaveBeenCalled();
            expect(mockCollections.rules_pf1e.insertMany).toHaveBeenCalled();
        });

        it('should restore from legacy format ZIP file (beastiary.json + codex.json)', async () => {
            // Create a ZIP buffer with LEGACY format
            const zip = new JSZip();
            const mockBeastiary = [{ _id: 'b1', name: 'Beast 1' }];
            const mockCodex = [{ _id: 'c1', title: 'Codex 1' }];
            const backupData = {
                'rules_pf1e.json': { 'r1': { name: 'Rule 1' } }
            };

            zip.file('beastiary.json', JSON.stringify(mockBeastiary));
            zip.file('codex.json', JSON.stringify(mockCodex));
            zip.file('data.json', JSON.stringify(backupData));

            const buffer = await zip.generateAsync({ type: 'nodebuffer' });

            // Setup Mocks
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

            // Verify legacy Beastiary Restore
            expect(mockCollections.entities_pf1e.deleteMany).toHaveBeenCalled();
            expect(mockCollections.entities_pf1e.insertMany).toHaveBeenCalledWith([
                expect.objectContaining({ _id: 'b1', name: 'Beast 1' })
            ]);

            // Verify legacy Codex Restore
            expect(mockCodexCollection.deleteMany).toHaveBeenCalled();
            expect(mockCodexCollection.insertMany).toHaveBeenCalledWith([
                expect.objectContaining({ _id: 'c1', title: 'Codex 1' })
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
