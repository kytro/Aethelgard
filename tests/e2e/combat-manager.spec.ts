import { test, expect } from '@playwright/test';

test.describe('DM Toolkit - Combat Manager', () => {
    test('should navigate to Combat Manager', async ({ page }) => {
        // Navigate to the main toolkit page
        await page.goto('/codex/dm-toolkit');

        // Click the Combat Manager link in the sidebar
        await page.click('text=Combat Manager');

        // Verify the Combat Manager component is visible
        // We only check for the ID because the specific header text might not be present
        await expect(page.locator('#combat-manager')).toBeVisible();
    });
});