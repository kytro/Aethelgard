import { test, expect } from '@playwright/test';

test.describe('Admin Functions', () => {
    test('should navigate to Backup & Restore', async ({ page }) => {
        await page.goto('/codex/admin');
        await page.click('text=Backup & Restore');

        // Verify the Backup & Restore component is visible
        await expect(page.locator('text=Backup Database')).toBeVisible();
        await expect(page.locator('text=Restore from Backup')).toBeVisible();
        await expect(page.locator('input[type="file"]')).toBeVisible();
    });
});
