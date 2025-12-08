import { test, expect } from '@playwright/test';

test.describe('Admin - OGL Import', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/codex/admin');
    });

    test('should navigate to OGL Import section', async ({ page }) => {
        // Click on OGL Import nav item
        await page.click('text=OGL Import');

        // Verify OGL Import component is visible
        await expect(page.locator('text=OGL Data Import')).toBeVisible();
        await expect(page.locator('text=Data Source')).toBeVisible();
    });

    test('should load available data sources in dropdown', async ({ page }) => {
        await page.click('text=OGL Import');

        // Wait for sources to load from API
        await page.waitForSelector('select');

        // Verify dropdown has options
        const dropdown = page.locator('select').first();
        await expect(dropdown).toBeVisible();

        // Should have at least the placeholder and one source
        const options = await dropdown.locator('option').count();
        expect(options).toBeGreaterThan(1);
    });

    test('should display source description when selected', async ({ page }) => {
        await page.click('text=OGL Import');

        // Wait for and select first real source
        const dropdown = page.locator('select').first();
        await page.waitForSelector('select option:not([value=""])');

        // Get first non-empty option value
        const firstOption = await dropdown.locator('option:not([value=""])').first();
        const optionValue = await firstOption.getAttribute('value');

        if (optionValue) {
            await dropdown.selectOption(optionValue);

            // Description should appear below dropdown
            // The description contains text like "Comprehensive spell list" or similar
            await expect(page.locator('text=spells').or(page.locator('text=feats')).or(page.locator('text=Feats'))).toBeVisible();
        }
    });

    test('should have merge and replace radio buttons', async ({ page }) => {
        await page.click('text=OGL Import');

        // Verify import mode radio buttons exist
        await expect(page.locator('text=Merge')).toBeVisible();
        await expect(page.locator('text=Replace')).toBeVisible();

        // Verify merge is default selected
        const mergeRadio = page.locator('input[type="radio"][value="merge"]');
        await expect(mergeRadio).toBeChecked();
    });

    test('should have custom import section', async ({ page }) => {
        await page.click('text=OGL Import');

        // Verify custom import section exists
        await expect(page.locator('text=Custom Import')).toBeVisible();
        await expect(page.locator('input[placeholder*="https"]')).toBeVisible();
        await expect(page.locator('text=Import Custom URL')).toBeVisible();
    });
});
