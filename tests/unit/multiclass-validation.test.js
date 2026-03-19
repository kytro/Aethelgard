const { validateEntity } = require('../../routes/entities-api');

describe('Multiclass Validation', () => {
    test('should accept valid classes array', () => {
        const entity = {
            name: 'Multiclass Hero',
            baseStats: {
                classes: [
                    { className: 'Fighter', level: 5 },
                    { className: 'Rogue', level: 2 }
                ]
            }
        };
        const result = validateEntity(entity);
        expect(result.valid).toBe(true);
    });

    test('should reject non-array classes field', () => {
        const entity = {
            name: 'Invalid Hero',
            baseStats: {
                classes: 'Fighter 5'
            }
        };
        const result = validateEntity(entity);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(expect.objectContaining({ error: '"baseStats.classes" must be an array' }));
    });

    test('should reject invalid class entry structure', () => {
        const entity = {
            name: 'Invalid Hero',
            baseStats: {
                classes: [
                    { name: 'Fighter', lvl: 5 } // Missing className and level
                ]
            }
        };
        const result = validateEntity(entity);
        expect(result.valid).toBe(false);
        expect(result.errors[0].error).toMatch(/Class entry at index 0 is invalid/);
    });
});
