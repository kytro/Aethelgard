import { test, expect } from '@playwright/test';

test.describe('Smoke & Health', () => {
    test('Health check should return ok', async ({ request }) => {
        const response = await request.get('/health');
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data).toEqual({ status: 'ok', db: true });
    });

    test('Landing page should load', async ({ page }) => {
        await page.goto('/codex');
        await expect(page).toHaveTitle(/Codex/i);
        // Verify user is logged in (avatar present or user name)
        // Adjust selector based on actual UI
        await expect(page.locator('app-root')).toBeVisible();
    });
});
