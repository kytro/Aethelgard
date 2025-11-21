import { test, expect } from '@playwright/test';

test.describe('Core CRUD & Data Integrity', () => {
    test('should create, verify, and delete an NPC', async ({ page }) => {
        // 1. Create NPC via Generator
        await page.goto('/codex/npc-generator');
        await page.fill('input[name="name"]', 'Bandit King');
        await page.click('button:has-text("Generate")');
        // Wait for success message or navigation
        await expect(page.locator('text=Bandit King')).toBeVisible();

        // 2. Verify in Codex Tree
        await page.goto('/codex');
        await page.click('text=NPCs'); // Expand NPCs folder
        await expect(page.locator('text=Bandit King')).toBeVisible();

        // 3. Verify Persistence
        await page.reload();
        await page.click('text=NPCs');
        await expect(page.locator('text=Bandit King')).toBeVisible();

        // 4. Delete Entity
        // Assuming right-click context menu or delete button in details
        await page.click('text=Bandit King');
        await page.click('button[aria-label="Delete"]'); // Adjust selector
        await page.click('button:has-text("Confirm")'); // Confirm modal
        await expect(page.locator('text=Bandit King')).toBeHidden();
    });
});
