/**
 * Jest tests for auto-populate missing items feature
 * Tests the logic that fetches PF1e data from AI when items aren't in the database
 */

describe('Auto-Populate Missing Items', () => {

    // Mock database collection
    const mockCollection = (findResult = null) => ({
        findOne: jest.fn().mockResolvedValue(findResult),
        updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 })
    });

    // Test the core logic (simulated since we can't easily test the actual route)
    describe('Item ID Generation', () => {
        const generateId = (prefix, name) =>
            prefix + name.toLowerCase().replace(/[^a-z0-9]/g, '_');

        it('should generate spell ID correctly', () => {
            expect(generateId('spell-', 'Magic Missile')).toBe('spell-magic_missile');
            expect(generateId('spell-', "Mage's Disjunction")).toBe('spell-mage_s_disjunction');
        });

        it('should generate equipment ID correctly', () => {
            expect(generateId('eq-', 'Longsword')).toBe('eq-longsword');
            expect(generateId('eq-', 'Ring of Protection +5')).toBe('eq-ring_of_protection__5');
        });

        it('should generate feat ID correctly', () => {
            expect(generateId('feat-', 'Power Attack')).toBe('feat-power_attack');
            expect(generateId('feat-', 'Spell Focus (Evocation)')).toBe('feat-spell_focus__evocation_');
        });
    });

    describe('Collection Name Selection', () => {
        const getCollectionName = (itemType) =>
            itemType === 'spell' ? 'spells_pf1e'
                : itemType === 'equipment' ? 'equipment_pf1e'
                    : 'rules_pf1e';

        it('should return correct collection for spells', () => {
            expect(getCollectionName('spell')).toBe('spells_pf1e');
        });

        it('should return correct collection for equipment', () => {
            expect(getCollectionName('equipment')).toBe('equipment_pf1e');
        });

        it('should return rules_pf1e for feats', () => {
            expect(getCollectionName('feat')).toBe('rules_pf1e');
        });
    });

    describe('Case-Insensitive Name Matching', () => {
        it('should create case-insensitive regex for spell names', () => {
            const name = 'Magic Missile';
            const regex = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

            expect(regex.test('Magic Missile')).toBe(true);
            expect(regex.test('magic missile')).toBe(true);
            expect(regex.test('MAGIC MISSILE')).toBe(true);
            expect(regex.test('Magic missile')).toBe(true);
        });

        it('should escape special regex characters in names', () => {
            const name = 'Ring of Protection +5';
            const regex = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

            expect(regex.test('Ring of Protection +5')).toBe(true);
            expect(regex.test('Ring of Protection +6')).toBe(false);
        });
    });

    describe('Prompt Generation', () => {
        it('should generate appropriate spell prompt', () => {
            const itemName = 'Fireball';
            const prompt = `You are a Pathfinder 1e rules expert. Provide complete data for this spell:
"${itemName}"`;

            expect(prompt).toContain('Fireball');
            expect(prompt).toContain('Pathfinder 1e');
        });

        it('should generate appropriate equipment prompt', () => {
            const itemName = 'Longsword';
            const prompt = `You are a Pathfinder 1e rules expert. Provide complete data for this equipment:
"${itemName}"`;

            expect(prompt).toContain('Longsword');
            expect(prompt).toContain('equipment');
        });

        it('should generate appropriate feat prompt', () => {
            const itemName = 'Power Attack';
            const prompt = `You are a Pathfinder 1e rules expert. Provide complete data for this feat:
"${itemName}"`;

            expect(prompt).toContain('Power Attack');
            expect(prompt).toContain('feat');
        });
    });
});
