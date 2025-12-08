import { test, expect } from '@playwright/test';

test.describe('DM Toolkit - Combat Manager', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/codex/dm-toolkit');
        await page.click('text=Combat Manager');
        await expect(page.locator('#combat-manager')).toBeVisible();
    });

    test('should create a new fight', async ({ page }) => {
        // Handle any native dialogs
        page.on('dialog', dialog => dialog.accept());

        // Create a new fight
        await page.fill('input[placeholder="New fight name..."]', 'E2E Test Fight');
        await page.click('button:has-text("Add")');

        // Verify fight appears in list
        await expect(page.locator('text=E2E Test Fight')).toBeVisible();

        // Clean up
        await page.click('button[title="Delete fight"]');
    });

    test('should add custom combatant', async ({ page }) => {
        page.on('dialog', dialog => dialog.accept());

        // Create fight
        await page.fill('input[placeholder="New fight name..."]', 'Custom Test');
        await page.click('button:has-text("Add")');
        await page.click('button:has-text("Custom Test")');

        // Select Custom source
        await page.selectOption('select[name="source"]', { label: 'Custom' });

        // Fill custom combatant form
        await page.fill('input[placeholder="Name"]', 'Test Hero');
        await page.fill('input[placeholder="HP"]', '50');
        await page.fill('input[placeholder="Initiative"]', '15');

        // Add combatant
        await page.click('button:has-text("Add to Fight")');

        // Verify combatant added
        await expect(page.locator('text=Test Hero')).toBeVisible();

        // Clean up
        await page.click('button[title="Delete fight"]');
    });

    test('should start and advance combat', async ({ page }) => {
        page.on('dialog', dialog => dialog.accept());

        // Create fight with combatants
        await page.fill('input[placeholder="New fight name..."]', 'Combat Flow Test');
        await page.click('button:has-text("Add")');
        await page.click('button:has-text("Combat Flow Test")');

        // Add two custom combatants
        await page.selectOption('select[name="source"]', { label: 'Custom' });

        await page.fill('input[placeholder="Name"]', 'Fighter');
        await page.fill('input[placeholder="HP"]', '40');
        await page.fill('input[placeholder="Initiative"]', '20');
        await page.click('button:has-text("Add to Fight")');
        await expect(page.locator('text=Fighter')).toBeVisible();

        await page.fill('input[placeholder="Name"]', 'Wizard');
        await page.fill('input[placeholder="HP"]', '25');
        await page.fill('input[placeholder="Initiative"]', '10');
        await page.click('button:has-text("Add to Fight")');
        await expect(page.locator('text=Wizard')).toBeVisible();

        // Start combat
        await page.click('button:has-text("Start Combat")');

        // Verify round counter visible
        await expect(page.locator('text=Round')).toBeVisible();

        // Advance turn
        await page.click('button:has-text("Next Turn")');

        // Clean up
        await page.click('button[title="Delete fight"]');
    });

    test('should add a combatant from Codex and display correct stats', async ({ page }) => {
        page.on('dialog', dialog => dialog.accept());

        // Create a new fight
        await page.fill('input[placeholder="New fight name..."]', 'Test Fight');
        await page.click('button:has-text("Add")');
        await page.click('button:has-text("Test Fight")');

        // Select Source: People
        await page.selectOption('select[name="source"]', { label: 'People' });

        // Wait for and select subsequent dropdowns
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

        // Verify Ability Scores
        const abilityScores = page.locator('.grid-cols-3.gap-x-4');
        await expect(abilityScores).toContainText('Str');
        await expect(abilityScores).toContainText('7');
        await expect(abilityScores).toContainText('Wis');
        await expect(abilityScores).toContainText('17');

        // Clean up
        await page.click('button[title="Delete fight"]');
    });
});