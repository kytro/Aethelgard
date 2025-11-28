import { test, expect } from '@playwright/test';

test.describe('DM Toolkit - Combat Manager', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/codex/dm-toolkit');
        await page.click('text=Combat Manager');
        await expect(page.locator('#combat-manager')).toBeVisible();
    });

    test('should add a combatant and display correct stats', async ({ page }) => {
        // Create a new fight
        await page.fill('input[placeholder="New fight name..."]', 'Test Fight');
        await page.click('button:has-text("Add")');
        await page.click('button:has-text("Test Fight")');

        // Select Source: People
        await page.selectOption('select[name="source"]', { label: 'People' });

        // Wait for and select subsequent dropdowns
        // Note: The exact labels depend on how formatName works, assuming standard spacing
        await page.waitForSelector('select[name="path-level-0"]');
        await page.selectOption('select[name="path-level-0"]', { label: 'Solarran Freehold' });

        await page.waitForSelector('select[name="path-level-1"]');
        await page.selectOption('select[name="path-level-1"]', { label: 'Riftwatch' });

        await page.waitForSelector('select[name="path-level-2"]');
        await page.selectOption('select[name="path-level-2"]', { label: 'Key Figures And Transients' });

        // Select Template
        await page.waitForSelector('select[name="template"]');
        await page.selectOption('select[name="template"]', { label: 'Prian Shadowbrook' });

        // Add to Fight
        await page.click('button:has-text("Add to Fight")');

        // Verify Combatant Added
        await expect(page.locator('text=Prian Shadowbrook')).toBeVisible();

        // Expand Details
        await page.click('button:has-text("Details")');

        // Verify Ability Scores (from user log: Str 7, Wis 17)
        // The UI displays them as "Str\n7(+...)" or similar, so we check for the text content
        const abilityScores = page.locator('.grid-cols-3.gap-x-4');
        await expect(abilityScores).toContainText('Str');
        await expect(abilityScores).toContainText('7');
        await expect(abilityScores).toContainText('Wis');
        await expect(abilityScores).toContainText('17');

        // Verify Skills (from user log: Knowledge (History): 9)
        const skillsSection = page.locator('h4:has-text("Skills")').locator('..');
        await expect(skillsSection).toContainText('Knowledge (History)');
        await expect(skillsSection).toContainText('9');

        // Clean up: Delete fight
        await page.click('button:has-text("X")'); // Delete fight button (might need more specific selector if multiple Xs)
        // Confirm dialog handling might be needed if the app uses native confirm
        page.on('dialog', dialog => dialog.accept());
    });
});