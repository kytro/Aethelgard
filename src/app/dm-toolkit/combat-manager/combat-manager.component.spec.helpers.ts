/**
 * Test helpers and mock factories for Combat Manager component tests
 */

export function createMockCodex() {
    return {
        People: {
            isCombatManagerSource: true,
            'Solarran_Freehold': {
                content: [
                    { type: 'heading', text: 'Solarran Freehold' },
                    { type: 'paragraph', text: 'A bustling trade hub' }
                ],
                // ADDED: A leaf node template to verify detection works alongside rich text
                'Town_Guard': {
                    entityId: 'npc-guard-001',
                    baseStats: {
                        Str: 14, Dex: 12, Con: 14,
                        HP: '20 (3d8+6)',
                        AC: 16
                    }
                },
                'Merchant_Quarter': {
                    entityId: 'loc-merchant-001',
                    baseStats: { Type: 'Location' },
                    'Guildmaster_Theron': {
                        entityId: 'npc-theron-001',
                        baseStats: {
                            Str: 12, Dex: 14, Con: 13, Int: 16, Wis: 15, Cha: 17,
                            HP: '45 (6d8+12)',
                            AC: 15,
                            Level: 6
                        }
                    },
                    'Guard_Captain_Lyra': {
                        entityId: 'npc-lyra-001',
                        baseStats: {
                            Str: 16, Dex: 13, Con: 14, Int: 10, Wis: 12, Cha: 11,
                            HP: '52 (8d8+16)',
                            AC: 18,
                            Level: 8
                        }
                    }
                }
            }
        },
        Bestiary: {
            isCombatManagerSource: true,
            Undead: {
                content: ['Skeleton', 'Zombie', 'Ghoul']
            }
        }
    };
}

export function createMockFight(overrides = {}) {
    return {
        _id: 'fight-001',
        name: 'Test Fight',
        createdAt: new Date(),
        combatStartTime: null,
        roundCounter: 1,
        currentTurnIndex: 0,
        log: [],
        ...overrides
    };
}

export function createMockCombatant(overrides = {}) {
    return {
        _id: 'combatant-001',
        fightId: 'fight-001',
        name: 'Test Combatant',
        initiative: 15,
        hp: 30,
        maxHp: 30,
        stats: {
            Str: 10, Dex: 10, Con: 10, Int: 10, Wis: 10, Cha: 10
        },
        effects: [],
        tempMods: {},
        activeFeats: [],
        type: 'Custom',
        ...overrides
    };
}

export function createMockEntity(overrides = {}) {
    return {
        id: 'entity-001',
        name: 'Test Entity',
        baseStats: {
            Str: 14, Dex: 12, Con: 13, Int: 10, Wis: 11, Cha: 8,
            HP: '38 (7d8+7)',
            AC: 16,
            Touch: 12,
            'Flat-Footed': 14,
            Fort: 5,
            Ref: 4,
            Will: 3,
            BAB: 7,
            CMB: 9,
            CMD: 21,
            Speed: '30 ft.',
            CR: 3,
            Level: 7
        },
        ...overrides
    };
}

export function createMockFoundCreature(overrides = {}) {
    return {
        id: 'found-001',
        name: 'Goblin Warrior',
        cr: '1/3',
        stats: 'Small humanoid',
        hp: '6 (1d8+2)',
        ...overrides
    };
}