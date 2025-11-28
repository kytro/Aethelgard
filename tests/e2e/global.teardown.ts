import { clearDatabase } from './utils/db';

async function globalTeardown() {
    console.log('[E2E] Global Teardown');
    // Optional: Clear DB after tests
    // await clearDatabase();
}

export default globalTeardown;
