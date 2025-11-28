import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page, request }) => {
    // Perform login via API
    const response = await request.post('/codex/api/auth/test/login');
    expect(response.ok()).toBeTruthy();
    const { token, user } = await response.json();

    // Set local storage
    await page.goto('/codex'); // Navigate to domain to set local storage
    await page.evaluate(({ token, user }) => {
        localStorage.setItem('app_token', token);
        localStorage.setItem('app_user', JSON.stringify(user));
    }, { token, user });

    // Save storage state
    await page.context().storageState({ path: authFile });
});
