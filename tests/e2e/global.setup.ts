import { clearDatabase, seedDatabase } from './utils/db';

async function globalSetup() {
    console.log('[E2E] Global Setup');
    await clearDatabase();
    await seedDatabase();
}

export default globalSetup;
