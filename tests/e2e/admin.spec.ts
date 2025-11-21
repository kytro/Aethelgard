import { test, expect } from '@playwright/test';

test.describe('Admin Functions', () => {
    test('should upload a backup file', async ({ page }) => {
        await page.goto('/codex/admin/settings');

        // Mock file
        const buffer = Buffer.from(JSON.stringify({ entities: [], version: '1.0' }));

        // Intercept request to verify upload
        const restorePromise = page.waitForRequest(request =>
            request.url().includes('/codex/api/admin/restore') && request.method() === 'POST'
        );

        // Upload file
        await page.setInputFiles('input[type="file"]', {
            name: 'backup.json',
            mimeType: 'application/json',
            buffer
        });

        // Wait for request
        const request = await restorePromise;
        expect(request).toBeTruthy();

        // Verify success message
        await expect(page.locator('text=Restore Successful')).toBeVisible();
    });
});
