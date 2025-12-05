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
