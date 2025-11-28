import { test, expect } from '@playwright/test';

test.describe('Core CRUD & Data Integrity', () => {
    test('should load NPC Generator route', async ({ page }) => {
        const response = await page.goto('/codex/npc-generator');

        // Verify the route loaded successfully
        expect(response?.status()).toBeLessThan(400);
    });
});
