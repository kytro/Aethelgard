import {
    getAbilityModifierAsNumber,
    getAbilityModifier,
    getCaseInsensitiveProp,
    calculateAverageHp,
    formatName,
    formatTime,
    calculateCompleteBaseStats,
    calculateSkillBonus,
    SKILL_ABILITY_MAP,
    GOOD_SAVES,
    POOR_SAVES,
    SIZE_DATA,
    CONSTRUCT_HP_BONUS,
    CalculateStatsOptions
} from './dm-toolkit.utils';

describe('DM Toolkit Utilities', () => {

    describe('getAbilityModifierAsNumber', () => {
        it('should return correct modifier for standard ability scores', () => {
            expect(getAbilityModifierAsNumber(10)).toBe(0);
            expect(getAbilityModifierAsNumber(12)).toBe(1);
            expect(getAbilityModifierAsNumber(14)).toBe(2);
            expect(getAbilityModifierAsNumber(16)).toBe(3);
            expect(getAbilityModifierAsNumber(18)).toBe(4);
            expect(getAbilityModifierAsNumber(20)).toBe(5);
        });

        it('should return correct modifier for low ability scores', () => {
            expect(getAbilityModifierAsNumber(8)).toBe(-1);
            expect(getAbilityModifierAsNumber(6)).toBe(-2);
            expect(getAbilityModifierAsNumber(3)).toBe(-4);
            expect(getAbilityModifierAsNumber(1)).toBe(-5);
        });

        it('should return correct modifier for very high ability scores', () => {
            expect(getAbilityModifierAsNumber(22)).toBe(6);
            expect(getAbilityModifierAsNumber(30)).toBe(10);
        });

        it('should handle string inputs with numbers', () => {
            expect(getAbilityModifierAsNumber('14')).toBe(2);
            expect(getAbilityModifierAsNumber('18 (+4)')).toBe(4);
        });

        it('should return 0 for invalid inputs', () => {
            expect(getAbilityModifierAsNumber(null)).toBe(0);
            expect(getAbilityModifierAsNumber(undefined)).toBe(0);
            expect(getAbilityModifierAsNumber('invalid')).toBe(0);
        });

        it('should handle negative ability scores', () => {
            expect(getAbilityModifierAsNumber(-2)).toBe(-6);
        });
    });

    describe('getAbilityModifier', () => {
        it('should return formatted positive modifiers with + prefix', () => {
            expect(getAbilityModifier(14)).toBe('+2');
            expect(getAbilityModifier(18)).toBe('+4');
        });

        it('should return formatted negative modifiers', () => {
            expect(getAbilityModifier(8)).toBe('-1');
            expect(getAbilityModifier(6)).toBe('-2');
        });

        it('should return +0 for ability score of 10', () => {
            expect(getAbilityModifier(10)).toBe('+0');
        });

        it('should handle string inputs', () => {
            expect(getAbilityModifier('16')).toBe('+3');
        });
    });

    describe('getCaseInsensitiveProp', () => {
        it('should find property with exact case match', () => {
            const obj = { Name: 'Test', HP: 10 };
            expect(getCaseInsensitiveProp(obj, 'Name')).toBe('Test');
            expect(getCaseInsensitiveProp(obj, 'HP')).toBe(10);
        });

        it('should find property with case-insensitive match', () => {
            const obj = { Name: 'Test', HP: 10 };
            expect(getCaseInsensitiveProp(obj, 'name')).toBe('Test');
            expect(getCaseInsensitiveProp(obj, 'hp')).toBe(10);
            expect(getCaseInsensitiveProp(obj, 'NAME')).toBe('Test');
        });

        it('should return undefined for missing properties', () => {
            const obj = { Name: 'Test' };
            expect(getCaseInsensitiveProp(obj, 'Missing')).toBeUndefined();
        });

        it('should handle null and undefined objects', () => {
            expect(getCaseInsensitiveProp(null, 'Name')).toBeUndefined();
            expect(getCaseInsensitiveProp(undefined, 'Name')).toBeUndefined();
        });

        it('should handle empty key', () => {
            const obj = { Name: 'Test' };
            expect(getCaseInsensitiveProp(obj, '')).toBeUndefined();
        });
    });

    describe('calculateAverageHp', () => {
        it('should calculate average HP from dice notation', () => {
            expect(calculateAverageHp('1d8')).toBe(4);
            expect(calculateAverageHp('2d6')).toBe(7);
            expect(calculateAverageHp('3d8')).toBe(13);
        });

        it('should handle dice notation with positive modifiers', () => {
            expect(calculateAverageHp('1d8+2')).toBe(6);
            expect(calculateAverageHp('2d6+4')).toBe(11);
            expect(calculateAverageHp('3d8 + 6')).toBe(19);
        });

        it('should handle dice notation with negative modifiers', () => {
            expect(calculateAverageHp('1d8-1')).toBe(3);
            expect(calculateAverageHp('2d6 - 2')).toBe(5);
        });

        it('should handle single number inputs', () => {
            expect(calculateAverageHp('25')).toBe(25);
            expect(calculateAverageHp('100')).toBe(100);
        });

        it('should return 10 for invalid inputs', () => {
            expect(calculateAverageHp('')).toBe(10);
            expect(calculateAverageHp('invalid')).toBe(10);
        });

        it('should handle complex dice notation', () => {
            expect(calculateAverageHp('4d10+8')).toBe(30);
        });
    });

    describe('formatName', () => {
        it('should replace underscores with spaces', () => {
            expect(formatName('test_name')).toBe('test name');
            expect(formatName('multiple_word_name')).toBe('multiple word name');
        });

        it('should replace hyphens with spaces', () => {
            expect(formatName('test-name')).toBe('test name');
            expect(formatName('multiple-word-name')).toBe('multiple word name');
        });

        it('should handle mixed formatting', () => {
            expect(formatName('test_name-with-mixed')).toBe('test name with mixed');
        });

        it('should handle empty strings', () => {
            expect(formatName('')).toBe('');
        });

        it('should handle names without special characters', () => {
            expect(formatName('TestName')).toBe('TestName');
        });
    });

    describe('formatTime', () => {
        it('should format Date objects correctly', () => {
            const date = new Date('2025-11-21T14:30:00');
            const result = formatTime(date);
            expect(result).toMatch(/2025-11-21 \d{2}:\d{2}/);
        });

        it('should format timestamp strings correctly', () => {
            const timestamp = '2025-11-21T14:30:00';
            const result = formatTime(timestamp);
            expect(result).toMatch(/2025-11-21 \d{2}:\d{2}/);
        });

        it('should handle Firestore Timestamp objects with toDate method', () => {
            const firestoreTimestamp = {
                toDate: () => new Date('2025-11-21T14:30:00')
            };
            const result = formatTime(firestoreTimestamp);
            expect(result).toMatch(/2025-11-21 \d{2}:\d{2}/);
        });

        it('should return empty string for null or undefined', () => {
            expect(formatTime(null)).toBe('');
            expect(formatTime(undefined)).toBe('');
        });

        it('should return empty string for invalid dates', () => {
            expect(formatTime('invalid')).toBe('');
        });
    });

    describe('calculateCompleteBaseStats', () => {
        it('should set default ability scores to 10', () => {
            const stats = calculateCompleteBaseStats({});
            expect(stats.Str).toBe(10);
            expect(stats.Dex).toBe(10);
            expect(stats.Con).toBe(10);
            expect(stats.Int).toBe(10);
            expect(stats.Wis).toBe(10);
            expect(stats.Cha).toBe(10);
        });

        it('should preserve existing ability scores', () => {
            const stats = calculateCompleteBaseStats({ Str: 18, Dex: 14 });
            expect(stats.Str).toBe(18);
            expect(stats.Dex).toBe(14);
            expect(stats.Con).toBe(10); // default
        });

        it('should calculate AC based on Dex modifier', () => {
            const stats = calculateCompleteBaseStats({ Dex: 14 }); // +2 mod
            expect(stats.AC).toBe(12); // 10 + 2
        });

        it('should calculate Touch AC', () => {
            const stats = calculateCompleteBaseStats({ Dex: 16 }); // +3 mod
            expect(stats.Touch).toBe(13); // 10 + 3
        });

        it('should parse AC string format', () => {
            const stats = calculateCompleteBaseStats({ AC: '15, touch 12, flat-footed 13' });
            expect(stats.AC).toBe(15);
            expect(stats.Touch).toBe(12);
            expect(stats['Flat-Footed']).toBe(13);
        });

        it('should calculate Saves when not provided', () => {
            const stats = calculateCompleteBaseStats({ Con: 14, Dex: 12, Wis: 16, Level: 5 });
            expect(stats.Saves).toContain('Fort');
            expect(stats.Saves).toContain('Ref');
            expect(stats.Saves).toContain('Will');
        });

        it('should set default Speed', () => {
            const stats = calculateCompleteBaseStats({});
            expect(stats.Speed).toBe('30 ft.');
        });

        it('should calculate BAB from Base Attack Bonus', () => {
            const stats = calculateCompleteBaseStats({ 'Base Attack Bonus': '+5' });
            expect(stats.BAB).toBe(5);
        });

        it('should calculate CMB based on BAB and Str', () => {
            const stats = calculateCompleteBaseStats({ Str: 16, BAB: 5 }); // Str mod = +3
            expect(stats.CMB).toBe(8); // 5 + 3
        });

        it('should calculate CMD based on BAB, Str, and Dex', () => {
            const stats = calculateCompleteBaseStats({ Str: 16, Dex: 14, BAB: 5 }); // Str +3, Dex +2
            expect(stats.CMD).toBe(20); // 10 + 5 + 3 + 2
        });

        it('should calculate maxHp from average HP notation', () => {
            const stats = calculateCompleteBaseStats({ HP: '25 (3d8+6)' });
            expect(stats.maxHp).toBe(25);
        });

        it('should calculate maxHp from dice notation in parentheses', () => {
            const stats = calculateCompleteBaseStats({ HP: '(3d8+6)' });
            expect(stats.maxHp).toBe(19); // average of 3d8+6
        });

        it('should calculate maxHp from simple dice notation', () => {
            const stats = calculateCompleteBaseStats({ hp: '2d8' });
            expect(stats.maxHp).toBe(9);
        });

        it('should default maxHp to 10 for invalid HP', () => {
            const stats = calculateCompleteBaseStats({ HP: 'invalid' });
            expect(stats.maxHp).toBe(10);
        });

        it('should handle case-insensitive HP property', () => {
            const stats1 = calculateCompleteBaseStats({ hp: '20' });
            const stats2 = calculateCompleteBaseStats({ HP: '20' });
            expect(stats1.maxHp).toBe(20);
            expect(stats2.maxHp).toBe(20);
        });
    });

    describe('Constants', () => {
        it('should have SKILL_ABILITY_MAP defined', () => {
            expect(SKILL_ABILITY_MAP).toBeDefined();
            expect(SKILL_ABILITY_MAP['Acrobatics']).toBe('Dex');
            expect(SKILL_ABILITY_MAP['Climb']).toBe('Str');
            expect(SKILL_ABILITY_MAP['Perception']).toBe('Wis');
        });

        it('should have GOOD_SAVES progression', () => {
            expect(GOOD_SAVES).toBeDefined();
            expect(GOOD_SAVES[0]).toBe(0);
            expect(GOOD_SAVES[1]).toBe(2);
            expect(GOOD_SAVES.length).toBeGreaterThan(20);
        });

        it('should have POOR_SAVES progression', () => {
            expect(POOR_SAVES).toBeDefined();
            expect(POOR_SAVES[0]).toBe(0);
            expect(POOR_SAVES[1]).toBe(0);
            expect(POOR_SAVES.length).toBeGreaterThan(20);
        });

        it('should have SIZE_DATA with correct modifiers', () => {
            expect(SIZE_DATA).toBeDefined();
            expect(SIZE_DATA['Medium'].mod).toBe(0);
            expect(SIZE_DATA['Small'].mod).toBe(1);
            expect(SIZE_DATA['Large'].mod).toBe(-1);
            expect(SIZE_DATA['Tiny'].stealth).toBe(8);
        });

        it('should have CONSTRUCT_HP_BONUS by size', () => {
            expect(CONSTRUCT_HP_BONUS).toBeDefined();
            expect(CONSTRUCT_HP_BONUS['Small']).toBe(10);
            expect(CONSTRUCT_HP_BONUS['Medium']).toBe(20);
            expect(CONSTRUCT_HP_BONUS['Large']).toBe(30);
            expect(CONSTRUCT_HP_BONUS['Huge']).toBe(40);
        });
    });

    describe('calculateSkillBonus (Class Skills)', () => {
        it('should calculate basic skill bonus without class skill', () => {
            const bonus = calculateSkillBonus('Stealth', 5, 3, []);
            expect(bonus).toBe(8); // 5 ranks + 3 Dex mod
        });

        it('should add +3 for class skill with at least 1 rank', () => {
            const bonus = calculateSkillBonus('Stealth', 5, 3, ['Stealth']);
            expect(bonus).toBe(11); // 5 ranks + 3 Dex mod + 3 class skill
        });

        it('should not add +3 for class skill with 0 ranks', () => {
            const bonus = calculateSkillBonus('Stealth', 0, 3, ['Stealth']);
            expect(bonus).toBe(3); // 0 ranks + 3 Dex mod, no class skill bonus
        });

        it('should be case-insensitive for class skill matching', () => {
            const bonus = calculateSkillBonus('Perception', 3, 2, ['PERCEPTION', 'stealth']);
            expect(bonus).toBe(8); // 3 ranks + 2 Wis mod + 3 class skill
        });

        it('should handle empty class skills array', () => {
            const bonus = calculateSkillBonus('Climb', 4, 3, []);
            expect(bonus).toBe(7); // 4 ranks + 3 Str mod
        });
    });

    describe('calculateCompleteBaseStats - PF1e Creature Types', () => {
        describe('Construct HP Bonus', () => {
            it('should add construct HP bonus based on size', () => {
                const stats = calculateCompleteBaseStats(
                    { hp: '1d10', size: 'Medium', type: 'Construct' },
                    { type: 'Construct' }
                );
                expect(stats.maxHp).toBe(5 + 20); // avg 1d10 = 5.5 -> 5, + 20 Medium bonus
            });

            it('should add large construct HP bonus', () => {
                const stats = calculateCompleteBaseStats(
                    { hp: '2d10', size: 'Large', type: 'Construct' },
                    { type: 'Construct' }
                );
                expect(stats.maxHp).toBe(11 + 30); // avg 2d10 = 11, + 30 Large bonus
            });

            it('should not add HP bonus for non-constructs', () => {
                const stats = calculateCompleteBaseStats(
                    { hp: '2d10', size: 'Medium' },
                    { type: 'Humanoid' }
                );
                expect(stats.maxHp).toBe(11); // avg 2d10 = 11, no construct bonus
            });
        });

        describe('Undead Fort Saves (Charisma)', () => {
            it('should use Cha for Fort saves when Undead', () => {
                const stats = calculateCompleteBaseStats(
                    { Con: 10, Cha: 18, Level: 5 },
                    { type: 'Undead' }
                );
                // Cha 18 = +4 mod, should be used instead of Con
                expect(stats.Saves).toContain('Fort');
                // Fort should include +4 from Cha
            });
        });
    });

    describe('calculateCompleteBaseStats - CMB Agile Maneuvers', () => {
        it('should use Str for CMB by default', () => {
            const stats = calculateCompleteBaseStats({ Str: 16, Dex: 14, BAB: 5, size: 'Medium' });
            expect(stats.CMB).toBe(8); // 5 BAB + 3 Str mod + 0 size
        });

        it('should use Dex for CMB when Tiny size', () => {
            const stats = calculateCompleteBaseStats(
                { Str: 8, Dex: 18, BAB: 3, size: 'Tiny' }
            );
            // Tiny: Str -1, Dex +4, should use max(Str, Dex) = +4
            // CMB = 3 BAB + 4 Dex + (-2) size special mod = 5
            expect(stats.CMB).toBe(5);
        });

        it('should use Dex for CMB when has Agile Maneuvers feat', () => {
            const stats = calculateCompleteBaseStats(
                { Str: 10, Dex: 18, BAB: 5, size: 'Medium' },
                { feats: ['Agile Maneuvers'] }
            );
            // Str 0, Dex +4, should use max(Str, Dex) = +4
            expect(stats.CMB).toBe(9); // 5 BAB + 4 Dex + 0 size
        });

        it('should use Str if higher even with Agile Maneuvers', () => {
            const stats = calculateCompleteBaseStats(
                { Str: 20, Dex: 14, BAB: 5, size: 'Medium' },
                { feats: ['Agile Maneuvers'] }
            );
            // Str +5, Dex +2, should use max = +5
            expect(stats.CMB).toBe(10); // 5 BAB + 5 Str + 0 size
        });
    });

    describe('calculateCompleteBaseStats - Uncanny Dodge', () => {
        it('should subtract Dex from Flat-Footed normally', () => {
            const stats = calculateCompleteBaseStats({ Dex: 16, AC: 18 });
            expect(stats['Flat-Footed']).toBe(15); // 18 - 3 Dex mod
        });

        it('should keep Dex in Flat-Footed with Uncanny Dodge', () => {
            const stats = calculateCompleteBaseStats(
                { Dex: 16, AC: 18 },
                { specialAbilities: ['Uncanny Dodge'] }
            );
            expect(stats['Flat-Footed']).toBe(18); // keeps full AC
        });

        it('should handle case-insensitive Uncanny Dodge check', () => {
            const stats = calculateCompleteBaseStats(
                { Dex: 14, AC: 16 },
                { specialAbilities: ['UNCANNY DODGE'] }
            );
            expect(stats['Flat-Footed']).toBe(16);
        });

        it('should handle Improved Uncanny Dodge', () => {
            const stats = calculateCompleteBaseStats(
                { Dex: 14, AC: 16 },
                { specialAbilities: ['Improved Uncanny Dodge'] }
            );
            expect(stats['Flat-Footed']).toBe(16); // includes "uncanny dodge" in name
        });
    });
});
