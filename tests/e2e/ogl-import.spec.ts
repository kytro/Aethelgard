import { test, expect } from '@playwright/test';

test.describe('Admin - OGL Import', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/codex/admin');
    });

    test('should navigate to OGL Import section', async ({ page }) => {
        // Click on OGL Import nav item
        await page.click('text=OGL Import');

        // Verify OGL Import component is visible
        await expect(page.locator('h1:has-text("OGL Data Import")')).toBeVisible();
        await expect(page.locator('text=Import from PSRD-Data ZIP')).toBeVisible();
    });

    test('should show file upload controls', async ({ page }) => {
        await page.click('text=OGL Import');

        // Verify file input exists
        const fileInput = page.locator('input[type="file"]');
        await expect(fileInput).toBeVisible();
        await expect(fileInput).toHaveAttribute('accept', '.zip');

        // Verify upload button exists and is initially disabled
        const uploadButton = page.locator('button:has-text("Upload & Import")');
        await expect(uploadButton).toBeVisible();
        await expect(uploadButton).toBeDisabled();
    });

    test('should enable upload button when file is selected', async ({ page }) => {
        await page.click('text=OGL Import');

        // Create a dummy file for testing selection
        const buffer = Buffer.from('dummy content');
        const file = {
            name: 'test.zip',
            mimeType: 'application/zip',
            buffer,
        };

        // Set input files
        await page.locator('input[type="file"]').setInputFiles(file);

        // Button should now be enabled
        const uploadButton = page.locator('button:has-text("Upload & Import")');
        await expect(uploadButton).toBeEnabled();
    });
});
