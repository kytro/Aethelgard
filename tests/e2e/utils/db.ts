import { MongoClient } from 'mongodb';

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017';
const DB_NAME = 'codex';

export async function clearDatabase() {
    const client = new MongoClient(DATABASE_URL);
    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const collections = await db.listCollections().toArray();
        for (const collection of collections) {
            await db.collection(collection.name).deleteMany({});
        }
        console.log('[E2E] Database cleared');
    } finally {
        await client.close();
    }
}

export async function seedDatabase() {
    const client = new MongoClient(DATABASE_URL);
    try {
        await client.connect();
        const db = client.db(DB_NAME);

        // Seed initial data if needed (e.g. admin user, basic rules)
        // For now, we rely on the app to create data or the tests to create what they need.
        // If we need specific seed data, add it here.

        console.log('[E2E] Database seeded');
    } finally {
        await client.close();
    }
}
