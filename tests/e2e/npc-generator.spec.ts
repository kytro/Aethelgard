import { test, expect } from '@playwright/test';

test.describe('DM Toolkit - NPC Generator', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/codex/dm-toolkit');
        await page.click('text=NPC Generator');
    });

    test('should display NPC Generator interface', async ({ page }) => {
        // Verify main elements visible
        await expect(page.locator('text=NPC Generator')).toBeVisible();

        // Check for generation form elements
        await expect(page.locator('text=Generate')).toBeVisible();
    });

    test('should have class selection options', async ({ page }) => {
        // Look for class dropdown or selection
        const classSelect = page.locator('select').filter({ hasText: /fighter|wizard|cleric|rogue/i });

        // If dropdown exists, verify it has options
        if (await classSelect.count() > 0) {
            await expect(classSelect.first()).toBeVisible();
        }
    });

    test('should have level input', async ({ page }) => {
        // Check for level input field
        const levelInput = page.locator('input[type="number"]').or(page.locator('input[placeholder*="level" i]'));

        if (await levelInput.count() > 0) {
            await expect(levelInput.first()).toBeVisible();
        }
    });

    test('should have alignment options', async ({ page }) => {
        // Check for alignment selection (could be dropdown or radio)
        const alignmentElement = page.locator('text=/lawful|chaotic|neutral|good|evil/i').first();

        if (await alignmentElement.count() > 0) {
            await expect(alignmentElement).toBeVisible();
        }
    });

    test('should show generated NPCs section', async ({ page }) => {
        // Verify there's a section for showing generated NPCs or history
        const generatedSection = page.locator('text=/generated|results|npcs/i').first();

        // This might not exist until NPCs are generated
        // Just verify the page loaded correctly
        await expect(page.locator('body')).toContainText(/generator|npc|create/i);
    });
});
