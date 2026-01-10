/**
 * Jest tests for DM Toolkit AI routes
 * Tests the multi-phase NPC generation synthesis logic
 */

// Test the synthesis logic directly without needing HTTP
describe('DM Toolkit AI - NPC Synthesis Logic', () => {

    // Simulate the synthesis logic from the route
    function synthesizeNpcs(phase1Result, phase2Result, phase3Result) {
        return phase1Result.map(npc => {
            const stats = phase2Result.find(s => s.name === npc.name) || {};
            const abilities = phase3Result.find(a => a.name === npc.name) || {};

            return {
                // Phase 1: Identity
                name: npc.name,
                race: npc.race,
                type: npc.type,
                gender: npc.gender,
                size: npc.size,
                class: npc.class,
                level: npc.level,
                alignment: npc.alignment,
                description: npc.description,
                backstory: npc.backstory,

                // Phase 2: Stats
                baseStats: stats.baseStats || { Str: 10, Dex: 10, Con: 10, Int: 10, Wis: 10, Cha: 10 },
                hp: stats.hp || `${npc.level || 1} (${npc.level || 1}d8)`,
                ac: stats.ac || 10,
                acTouch: stats.acTouch || 10,
                acFlatFooted: stats.acFlatFooted || 10,
                bab: stats.bab || 0,
                cmb: stats.cmb || 0,
                cmd: stats.cmd || 10,
                hitDice: stats.hitDice || 'd8',
                fortSave: stats.fortSave || 0,
                refSave: stats.refSave || 0,
                willSave: stats.willSave || 0,
                dr: stats.dr || '-',
                sr: stats.sr || null,
                resist: stats.resist || '-',
                immune: stats.immune || '-',

                // Phase 3: Abilities & Gear
                skills: abilities.skills || {},
                feats: abilities.feats || [],
                specialAbilities: abilities.specialAbilities || [],
                equipment: abilities.equipment || [],
                magicItems: abilities.magicItems || [],
                spells: abilities.spells || null,
                spellSlots: abilities.spellSlots || null
            };
        });
    }

    it('should synthesize all 3 phases into complete NPCs', () => {
        const phase1 = [
            {
                name: 'Grimjaw',
                race: 'Dragon',
                type: 'Dragon',
                gender: 'Male',
                size: 'Large',
                class: 'Dragon',
                level: 10,
                alignment: 'Lawful Evil',
                description: 'A fierce red dragon',
                backstory: 'Ancient guardian'
            }
        ];

        const phase2 = [
            {
                name: 'Grimjaw',
                baseStats: { Str: 25, Dex: 10, Con: 21, Int: 14, Wis: 15, Cha: 18 },
                hp: '115 (11d12+44)',
                ac: 22,
                acTouch: 9,
                acFlatFooted: 22,
                bab: 11,
                cmb: 19,
                cmd: 28,
                hitDice: 'd12',
                fortSave: 12,
                refSave: 7,
                willSave: 9,
                dr: '5/magic',
                sr: 21,
                resist: 'fire 30',
                immune: 'fire, sleep, paralysis'
            }
        ];

        const phase3 = [
            {
                name: 'Grimjaw',
                skills: { Perception: 20, Fly: 15 },
                feats: ['Power Attack', 'Flyby Attack'],
                specialAbilities: ['Breath Weapon', 'Frightful Presence'],
                equipment: [],
                magicItems: ['Ring of Protection +2'],
                spells: null,
                spellSlots: null
            }
        ];

        const result = synthesizeNpcs(phase1, phase2, phase3);

        expect(result.length).toBe(1);
        const dragon = result[0];

        // Phase 1 fields
        expect(dragon.name).toBe('Grimjaw');
        expect(dragon.type).toBe('Dragon');
        expect(dragon.size).toBe('Large');
        expect(dragon.level).toBe(10);

        // Phase 2 fields
        expect(dragon.baseStats.Str).toBe(25);
        expect(dragon.hp).toBe('115 (11d12+44)');
        expect(dragon.ac).toBe(22);
        expect(dragon.dr).toBe('5/magic');
        expect(dragon.sr).toBe(21);
        expect(dragon.immune).toBe('fire, sleep, paralysis');

        // Phase 3 fields
        expect(dragon.feats).toContain('Power Attack');
        expect(dragon.specialAbilities).toContain('Breath Weapon');
        expect(dragon.skills.Perception).toBe(20);
    });

    it('should use fallback defaults when Phase 2 data is missing', () => {
        const phase1 = [
            { name: 'Test NPC', race: 'Human', type: 'NPC', class: 'Fighter', level: 1 }
        ];
        const phase2 = []; // Empty - simulating phase failure
        const phase3 = [
            { name: 'Test NPC', skills: { Perception: 5 }, feats: ['Toughness'] }
        ];

        const result = synthesizeNpcs(phase1, phase2, phase3);
        const npc = result[0];

        // Should have default stats
        expect(npc.baseStats.Str).toBe(10);
        expect(npc.ac).toBe(10);
        expect(npc.bab).toBe(0);
        expect(npc.dr).toBe('-');

        // But Phase 3 should still work
        expect(npc.feats).toContain('Toughness');
        expect(npc.skills.Perception).toBe(5);
    });

    it('should use fallback defaults when Phase 3 data is missing', () => {
        const phase1 = [
            { name: 'Warrior', race: 'Human', type: 'NPC', class: 'Fighter', level: 5 }
        ];
        const phase2 = [
            { name: 'Warrior', baseStats: { Str: 16, Dex: 14 }, hp: '40 (5d10+10)', ac: 18, bab: 5 }
        ];
        const phase3 = []; // Empty - simulating phase failure

        const result = synthesizeNpcs(phase1, phase2, phase3);
        const npc = result[0];

        // Phase 2 data should be present
        expect(npc.baseStats.Str).toBe(16);
        expect(npc.hp).toBe('40 (5d10+10)');
        expect(npc.bab).toBe(5);

        // Phase 3 should have defaults
        expect(npc.skills).toEqual({});
        expect(npc.feats).toEqual([]);
        expect(npc.equipment).toEqual([]);
    });

    it('should handle multiple NPCs with mixed phase results', () => {
        const phase1 = [
            { name: 'Fighter', race: 'Human', class: 'Fighter', level: 5 },
            { name: 'Wizard', race: 'Elf', class: 'Wizard', level: 5 }
        ];
        const phase2 = [
            { name: 'Fighter', baseStats: { Str: 18 }, hp: '45 (5d10+15)', ac: 20, bab: 5 }
            // Wizard missing - simulating partial data
        ];
        const phase3 = [
            { name: 'Wizard', spells: { 0: ['Detect Magic'], 1: ['Magic Missile'] } }
            // Fighter missing
        ];

        const result = synthesizeNpcs(phase1, phase2, phase3);

        expect(result.length).toBe(2);

        const fighter = result[0];
        expect(fighter.baseStats.Str).toBe(18);
        expect(fighter.hp).toBe('45 (5d10+15)');
        expect(fighter.feats).toEqual([]); // Missing from phase 3

        const wizard = result[1];
        expect(wizard.baseStats.Str).toBe(10); // Default since missing from phase 2
        expect(wizard.spells['0']).toContain('Detect Magic');
    });
});

describe('DM Toolkit AI - Spellcasting Class Detection', () => {
    // Simulate the spellcasting class detection from the route
    const spellcastingClasses = ['wizard', 'sorcerer', 'cleric', 'druid', 'bard', 'paladin', 'ranger', 'witch', 'oracle', 'inquisitor', 'summoner', 'magus', 'alchemist', 'arcanist', 'shaman', 'warpriest', 'bloodrager', 'skald', 'investigator', 'hunter', 'medium', 'mesmerist', 'occultist', 'psychic', 'spiritualist'];

    function isSpellcaster(npcClass) {
        const classLower = (npcClass || '').toLowerCase();
        return spellcastingClasses.some(sc => classLower.includes(sc));
    }

    it('should identify primary spellcasting classes', () => {
        expect(isSpellcaster('Wizard')).toBe(true);
        expect(isSpellcaster('Sorcerer')).toBe(true);
        expect(isSpellcaster('Cleric')).toBe(true);
        expect(isSpellcaster('Druid')).toBe(true);
        expect(isSpellcaster('Bard')).toBe(true);
        expect(isSpellcaster('Witch')).toBe(true);
        expect(isSpellcaster('Oracle')).toBe(true);
        expect(isSpellcaster('Magus')).toBe(true);
        expect(isSpellcaster('Arcanist')).toBe(true);
    });

    it('should identify partial spellcasting classes', () => {
        expect(isSpellcaster('Paladin')).toBe(true);
        expect(isSpellcaster('Ranger')).toBe(true);
        expect(isSpellcaster('Warpriest')).toBe(true);
        expect(isSpellcaster('Bloodrager')).toBe(true);
        expect(isSpellcaster('Hunter')).toBe(true);
    });

    it('should identify occult and psychic classes', () => {
        expect(isSpellcaster('Medium')).toBe(true);
        expect(isSpellcaster('Mesmerist')).toBe(true);
        expect(isSpellcaster('Occultist')).toBe(true);
        expect(isSpellcaster('Psychic')).toBe(true);
        expect(isSpellcaster('Spiritualist')).toBe(true);
    });

    it('should NOT identify non-spellcasting classes', () => {
        expect(isSpellcaster('Fighter')).toBe(false);
        expect(isSpellcaster('Rogue')).toBe(false);
        expect(isSpellcaster('Barbarian')).toBe(false);
        expect(isSpellcaster('Monk')).toBe(false);
        expect(isSpellcaster('Expert')).toBe(false);
        expect(isSpellcaster('Warrior')).toBe(false);
        expect(isSpellcaster('Commoner')).toBe(false);
        expect(isSpellcaster('Cavalier')).toBe(false);
        expect(isSpellcaster('Gunslinger')).toBe(false);
        expect(isSpellcaster('Swashbuckler')).toBe(false);
    });

    it('should handle multiclass strings containing spellcaster', () => {
        expect(isSpellcaster('Fighter/Wizard')).toBe(true);
        expect(isSpellcaster('Rogue 3/Sorcerer 5')).toBe(true);
        expect(isSpellcaster('Wizard (Evoker)')).toBe(true);
        expect(isSpellcaster('Cleric of Sarenrae')).toBe(true);
    });

    it('should handle edge cases', () => {
        expect(isSpellcaster('')).toBe(false);
        expect(isSpellcaster(null)).toBe(false);
        expect(isSpellcaster(undefined)).toBe(false);
        expect(isSpellcaster('WIZARD')).toBe(true); // Case insensitive
        expect(isSpellcaster('wizard')).toBe(true);
    });

    it('should handle hybrid classes correctly', () => {
        expect(isSpellcaster('Alchemist')).toBe(true); // Uses extracts
        expect(isSpellcaster('Investigator')).toBe(true); // Uses extracts
        expect(isSpellcaster('Summoner')).toBe(true);
        expect(isSpellcaster('Inquisitor')).toBe(true);
        expect(isSpellcaster('Skald')).toBe(true);
        expect(isSpellcaster('Shaman')).toBe(true);
    });
});
