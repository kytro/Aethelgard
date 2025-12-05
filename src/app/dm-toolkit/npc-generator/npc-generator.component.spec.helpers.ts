/**
 * Test helpers and mock factories for NPC Generator component tests
 */

export function createMockCodexForNpcGen() {
    return {
        'Places': {
            'City': {
                'Tavern': {}
            }
        },
        'Generated Characters': {
            'ExistingGroup': {}
        }
    };
}

export function createMockGeneratedNpc(overrides = {}) {
    return {
        name: 'Test NPC',
        race: 'Human',
        type: 'NPC',
        size: 'Medium',
        description: 'A test npc.',
        baseStats: { Str: 10, Dex: 12, Con: 10, Int: 10, Wis: 10, Cha: 10 },
        class: 'Fighter',
        level: 1,
        hp: '10 (1d10)',
        ac: 15,
        acTouch: 12,
        acFlatFooted: 13,
        bab: 1,
        cmb: 1,
        cmd: 13,
        fortSave: 2,
        refSave: 1,
        willSave: 0,
        dr: '-',
        sr: undefined,
        resist: '-',
        immune: '-',
        equipment: ['Sword'],
        skills: { 'Perception': 5 },
        ...overrides
    };
}

export const MOCK_NPC_RULES_CACHE = new Map([
    ['feat_alertness', { name: 'Alertness' }]
]);

export const MOCK_NPC_EQUIPMENT_CACHE = new Map([
    ['eq_longsword', { name: 'Longsword' }]
]);