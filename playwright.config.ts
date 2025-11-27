import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    globalSetup: require.resolve('./tests/e2e/global.setup.ts'),
    globalTeardown: require.resolve('./tests/e2e/global.teardown.ts'),
    use: {
        // Use BASE_URL from environment (set in docker-compose.yml) or default to localhost
        baseURL: process.env.BASE_URL || 'http://localhost:8081/codex',
        trace: 'on-first-retry',
    },
    projects: [
        { name: 'setup', testMatch: /.*\.setup\.ts/ },
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
            dependencies: ['setup'],
        },
    ],
});
