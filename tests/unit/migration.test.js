/**
 * Jest tests for data integrity migration logic
 * Tests the mergeBaseStats and parseStatBlockToEntity functions
 */

const { mergeBaseStats, parseStatBlockToEntity } = require('./migration-logic');

describe('Data Integrity Migration Logic', () => {

    describe('mergeBaseStats', () => {
        it('should merge size from fresh parse', () => {
            const fresh = { size: 'Large', Str: 18 };
            const old = { Str: 10, Dex: 10 };
            const result = mergeBaseStats(fresh, old);
            expect(result.size).toBe('Large');
            expect(result.Str).toBe(18);
        });

        it('should preserve existing stats if not in fresh', () => {
            const fresh = { size: 'Small' };
            const old = { Str: 14, Dex: 12 };
            const result = mergeBaseStats(fresh, old);
            expect(result.size).toBe('Small');
            expect(result.Str).toBe(14);
        });

        it('should default abilities to 10 if missing', () => {
            const fresh = {};
            const old = {};
            const result = mergeBaseStats(fresh, old);
            expect(result.Str).toBe(10);
            expect(result.Dex).toBe(10);
        });
    });

    describe('parseStatBlockToEntity', () => {
        const mockDb = {
            collection: () => ({
                find: () => ({
                    project: () => ({ toArray: async () => [] }),
                    toArray: async () => []
                })
            })
        };

        it('should parse Size from "Size" stat', async () => {
            const content = [{
                type: 'statblock',
                stats: [{ label: 'Size', value: 'Large' }]
            }];
            const statBlock = { entityId: '123' };
            const result = await parseStatBlockToEntity(mockDb, statBlock, 'Test', [], content);
            expect(result.baseStats.size).toBe('Large');
        });

        it('should parse Size from "Type" stat if Size is missing', async () => {
            const content = [{
                type: 'statblock',
                stats: [{ label: 'Type', value: 'Tiny magical beast' }]
            }];
            const statBlock = { entityId: '123' };
            const result = await parseStatBlockToEntity(mockDb, statBlock, 'Test', [], content);
            expect(result.baseStats.size).toBe('Tiny');
        });

        it('should default to Medium if no size info', async () => {
            const content = [{
                type: 'statblock',
                stats: [{ label: 'Str', value: '10' }]
            }];
            const statBlock = { entityId: '123' };
            const result = await parseStatBlockToEntity(mockDb, statBlock, 'Test', [], content);
            expect(result.baseStats.size).toBe('Medium');
        });

        it('should parse detailed AC', async () => {
            const content = [{
                type: 'statblock',
                stats: [{ label: 'AC', value: '15, touch 12, flat-footed 13' }]
            }];
            const statBlock = { entityId: '123' };
            const result = await parseStatBlockToEntity(mockDb, statBlock, 'Test', [], content);
            expect(result.baseStats.armorClass).toEqual({ total: 15, touch: 12, flatFooted: 13 });
        });
    });
});
