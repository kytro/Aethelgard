/**
 * Test helpers and mock factories for Codex component tests
 */

export function createMockCodexData() {
    return [
        {
            name: 'Locations',
            path_components: ['Locations'],
            isCombatManagerSource: true
        },
        {
            name: 'Town Square',
            path_components: ['Locations', 'Town_Square'],
            content: [
                { type: 'heading', text: 'The Town Square' },
                { type: 'paragraph', text: 'A busy place.' }
            ],
            isCompleted: false,
            entity_id: 'ent-location-001'
        },
        {
            name: 'Bestiary',
            path_components: ['Bestiary'],
            enableCompletionTracking: true
        },
        {
            name: 'Goblin',
            path_components: ['Bestiary', 'Goblin'],
            content: [
                { type: 'heading', text: 'Goblin Details' }
            ],
            isCompleted: true,
            entityId: 'ent-goblin-001' // Testing alternate casing supported by component
        }
    ];
}

export const MOCK_ENTITY = {
    _id: 'ent-goblin-001',
    name: 'Goblin Grunt',
    rules: ['rule-sneak'],
    equipment: ['eq-shortsword'],
    spells: { '0': ['sp-daze'] },
    baseStats: {
        hp: 6,
        ac: 15,
        class: 'Warrior',
        skills: { 'Stealth': 6 }
    }
};

export const MOCK_RULES_CACHE = [
    { _id: 'rule-sneak', name: 'Sneak Attack', description: 'Extra damage when flanking.' }
];

export const MOCK_EQUIPMENT_CACHE = [
    { _id: 'eq-shortsword', name: 'Shortsword', description: 'A small sword.', cost: '10gp', weight: '2lbs' }
];

export const MOCK_SPELLS_CACHE = [
    { _id: 'sp-daze', name: 'Daze', description: 'Cloud mind of creature.' }
];