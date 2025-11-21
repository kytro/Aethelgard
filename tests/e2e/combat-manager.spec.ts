import { test, expect } from '@playwright/test';

test.describe('DM Toolkit - Combat Manager', () => {
    test('should manage a combat flow', async ({ page }) => {
        // 1. Start a new Fight
        await page.goto('/codex/dm-toolkit/combat-manager');
        await page.click('button:has-text("New Fight")');
        await page.fill('input[placeholder="Fight Name"]', 'Test Fight');
        await page.click('button:has-text("Create")');

        // 2. Add Combatants
        // Custom Combatant
        await page.click('button:has-text("Add Custom")');
        await page.fill('input[placeholder="Name"]', 'Goblin Boss');
        await page.fill('input[placeholder="Init"]', '20');
        await page.click('button:has-text("Add")');

        // Bestiary Combatant (assuming search works)
        await page.click('button:has-text("Add from Bestiary")');
        await page.fill('input[placeholder="Search..."]', 'Wolf');
        await page.click('text=Wolf'); // Select first result
        await page.click('button:has-text("Add Selected")');

        // 3. Start Combat
        await page.click('button:has-text("Start Combat")');
        await expect(page.locator('.combat-active')).toBeVisible(); // Verify visual indicator

        // 4. Next Turn
        const firstRow = page.locator('.combatant-row').first();
        await expect(firstRow).toHaveClass(/active/); // Verify first is active
        await page.click('button:has-text("Next Turn")');
        const secondRow = page.locator('.combatant-row').nth(1);
        await expect(secondRow).toHaveClass(/active/); // Verify second is active

        // 5. Verify Persistence
        await page.reload();
        await expect(page.locator('.combatant-row').nth(1)).toHaveClass(/active/);
    });
});
