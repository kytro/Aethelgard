import { test, expect } from '@playwright/test';

test.describe('Core CRUD & Data Integrity', () => {
    test('should navigate to NPC Generator', async ({ page }) => {
        // Navigate to the main toolkit page
        await page.goto('/codex/dm-toolkit');

        // Click the NPC Generator link in the sidebar
        await page.click('text=NPC Generator');

        // Verify the NPC Generator component is visible
        await expect(page.locator('#npc-generator')).toBeVisible();
        await expect(page.locator('h2:has-text("NPC Generator")')).toBeVisible();
    });
});