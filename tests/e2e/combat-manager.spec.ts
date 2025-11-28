import { test, expect } from '@playwright/test';

test.describe('DM Toolkit - Combat Manager', () => {
    test('should load Combat Manager route', async ({ page }) => {
        const response = await page.goto('/codex/dm-toolkit/combat-manager');

        // Verify the route loaded successfully
        expect(response?.status()).toBeLessThan(400);
    });
});
