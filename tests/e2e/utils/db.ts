import { MongoClient } from 'mongodb';

// Database connection configuration
// When running E2E tests in Docker (recommended approach to avoid Windows port forwarding issues):
//   - The DATABASE_URL env var is set to 'mongodb://mongo:27017' in docker-compose.yml
//   - Tests connect directly to MongoDB on the Docker network
// When running E2E tests locally (for development/debugging):
//   - Falls back to 'mongodb://localhost:27017'
//   - Requires MongoDB container port to be accessible from host (may have issues on Windows)
const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017';
const DB_NAME = 'codex';
const MAX_RETRIES = 10;
const INITIAL_RETRY_DELAY = 500; // ms

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectWithRetry(client: MongoClient): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await client.connect();
            console.log(`[E2E] MongoDB connected successfully${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
            return;
        } catch (error) {
            lastError = error as Error;
            if (attempt < MAX_RETRIES) {
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
                console.log(`[E2E] MongoDB connection attempt ${attempt} failed, retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    console.error(`[E2E] Failed to connect to MongoDB after ${MAX_RETRIES} attempts`);
    throw lastError;
}

export async function clearDatabase() {
    const client = new MongoClient(DATABASE_URL);
    try {
        await connectWithRetry(client);
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
        await connectWithRetry(client);
        const db = client.db(DB_NAME);

        // Seed initial data if needed (e.g. admin user, basic rules)
        // For now, we rely on the app to create data or the tests to create what they need.
        // If we need specific seed data, add it here.

        console.log('[E2E] Database seeded');
    } finally {
        await client.close();
    }
}
