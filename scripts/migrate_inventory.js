const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGO_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'codex';

async function migrate() {
    const client = new MongoClient(MONGO_URL);

    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db(DB_NAME);
        const entities = db.collection('entities_pf1e');
        const equipmentCollection = db.collection('equipment');

        // 1. Build Equipment Cache (ID -> Item)
        console.log('Building Equipment Cache...');
        const allEquipment = await equipmentCollection.find({}).toArray();
        const equipmentMap = new Map();
        allEquipment.forEach(item => {
            equipmentMap.set(String(item._id), item);
            equipmentMap.set(item.name.toLowerCase(), item); // Name lookup
        });
        console.log(`Cache built with ${allEquipment.length} items.`);

        // 2. Process Entities
        const cursor = entities.find({});
        let count = 0;
        let modified = 0;

        while (await cursor.hasNext()) {
            const entity = await cursor.next();
            count++;

            // Skip if already migrated ? (Optional, but we want to overwrite/update)
            // if (entity.inventory && entity.inventory.length > 0) continue;

            const newInventory = [];
            const newSpellbook = entity.spellbook || [];

            // Helper to resolve and add item
            const addItem = (ref, isMagic = false) => {
                let item = null;
                let overrideName = null;

                if (ObjectId.isValid(ref) && equipmentMap.has(String(ref))) {
                    item = equipmentMap.get(String(ref));
                } else {
                    // Try exact name match
                    const lowerRef = String(ref).toLowerCase();
                    if (equipmentMap.has(lowerRef)) {
                        item = equipmentMap.get(lowerRef);
                        // If the ref was user-typed (e.g. "+1 Cutlass") and matched "Cutlass", keep the name
                        if (String(ref) !== item.name) overrideName = String(ref);
                    } else {
                        // Fuzzy search / Contains check
                        // Find key that is contained in ref
                        // e.g. ref="+1 Cutlass", key="cutlass" -> valid
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
                        equipped: true, // Default to equipped
                        isMagic: isMagic,
                        properties: item.properties || {},
                        value: item.price || 0
                    });
                } else {
                    // Fallback for unresolvable strings
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

            // Process Equipment
            // Ensure equipment is an array (legacy data might be weird)
            if (Array.isArray(entity.equipment)) {
                entity.equipment.forEach(ref => addItem(ref, false));
            }
            if (Array.isArray(entity.magicItems)) {
                entity.magicItems.forEach(ref => addItem(ref, true));
            }

            // Update Entity
            if (newInventory.length > 0) {
                await entities.updateOne(
                    { _id: entity._id },
                    { $set: { inventory: newInventory, spellbook: newSpellbook } }
                );
                modified++;
                console.log(`Migrated ${entity.name}: ${newInventory.length} items`);
            }
        }

        console.log(`Migration complete. Processed ${count} entites. Updated ${modified}.`);

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.close();
    }
}

migrate();
