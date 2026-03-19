const fetch = require('node-fetch');

const API_URL = 'https://home.paindance.com/codex/api/v1';
const API_KEY = process.env.API_KEY; // Using environment variable for security

async function callApi(endpoint, method = 'GET', body = null) {
    const url = `${API_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    console.log(`[API] ${method} ${url}`);
    const res = await fetch(url, options);
    try {
        const json = await res.json();
        return json;
    } catch (e) {
        console.error(`Failed to parse JSON for ${url}`, e);
        return { success: false, error: 'Invalid JSON' };
    }
}

async function migrate() {
    console.log('Starting REMOTE migration...');

    // 1. Build Equipment Cache
    console.log('Fetching equipment cache...');
    let allEquipment = [];
    const res = await callApi(`/equipment`); // No pagination support in API
    if (res.success && res.data) {
        allEquipment = res.data;
        console.log(`Fetched ${allEquipment.length} equipment items.`);
    }

    const equipmentMap = new Map();
    allEquipment.forEach(item => {
        equipmentMap.set(String(item._id), item);
        equipmentMap.set(item.name.toLowerCase(), item);
    });
    console.log(`Cache built with ${allEquipment.length} items.`);

    // 2. Fetch Entities
    console.log('Fetching entities...');
    let allEntities = [];
    page = 0;
    while (true) {
        const res = await callApi(`/entities?limit=100&skip=${page * 100}`);
        if (!res.success || !res.data || res.data.length === 0) break;
        allEntities = allEntities.concat(res.data);
        console.log(`Fetched ${res.data.length} entities (Total: ${allEntities.length})`);
        if (res.data.length < 100) break;
        page++;
    }
    console.log(`Found ${allEntities.length} entities.`);

    // 3. Process
    let modified = 0;
    for (const entity of allEntities) {
        // Optional: Skip if already has inventory? 
        // We will overwrite to ensure latest logic applies.

        const newInventory = [];
        const newSpellbook = entity.spellbook || [];

        // Helper to resolve and add item
        const addItem = (ref, isMagic = false) => {
            let item = null;
            let overrideName = null;

            if (equipmentMap.has(String(ref))) {
                item = equipmentMap.get(String(ref));
            } else {
                const lowerRef = String(ref).toLowerCase();
                if (equipmentMap.has(lowerRef)) {
                    item = equipmentMap.get(lowerRef);
                    if (String(ref) !== item.name) overrideName = String(ref);
                } else {
                    for (const [key, val] of equipmentMap.entries()) {
                        if (key.length > 3 && lowerRef.includes(key)) {
                            item = val;
                            overrideName = String(ref);
                            break;
                        }
                    }
                }
            }

            if (item) {
                newInventory.push({
                    itemId: String(item._id),
                    name: overrideName || item.name,
                    type: isMagic ? 'magic' : (item.type || 'gear'),
                    quantity: 1,
                    equipped: true,
                    isMagic: isMagic,
                    properties: item.properties || {},
                    value: item.price || 0
                });
            } else {
                newInventory.push({
                    name: String(ref),
                    type: isMagic ? 'magic' : 'gear',
                    quantity: 1,
                    equipped: true,
                    isMagic: isMagic,
                    properties: {}
                });
            }
        };

        if (Array.isArray(entity.equipment)) entity.equipment.forEach(ref => addItem(ref, false));
        if (Array.isArray(entity.magicItems)) entity.magicItems.forEach(ref => addItem(ref, true));

        if (newInventory.length > 0) {
            // Update via API
            // Use PATCH semantics via PUT (API supports it)
            console.log(`Migrating ${entity.name} (${newInventory.length} items)...`);
            const updateRes = await callApi(`/entities/${entity._id}`, 'PUT', {
                inventory: newInventory,
                spellbook: newSpellbook
            });

            if (updateRes.success) {
                modified++;
            } else {
                console.error(`Failed to update ${entity.name}:`, updateRes.error);
            }
        }
    }

    console.log(`Migration complete. Updated ${modified} entities.`);
}

migrate();
