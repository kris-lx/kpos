import { test, expect } from './fixtures';

test.describe('Customers', () => {
    test('members list loads', async ({ loggedInPage: page }) => {
        await page.goto('/customers/members');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
    });

    test('creates and deletes a member', async ({ loggedInPage: page }) => {
        await page.goto('/customers/members');
        const uniqueName = `E2E Test Member ${Date.now()}`;

        await page.getByRole('button', { name: /ເພີ່ມ|add/i }).first().click();
        await page.getByLabel(/ຊື່ \*/).fill(uniqueName);
        await page.getByRole('button', { name: /ບັນທຶກ|save/i }).click();

        // New member shows up in the list (card layout, not a table).
        await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 });

        // Clean up: the member card has view/edit/delete icon buttons with
        // no accessible name — the delete (trash) icon is the last of the
        // three action buttons in the card.
        const card = page.locator('div', { has: page.getByText(uniqueName) }).last();
        page.once('dialog', (dialog) => dialog.accept());
        await card.locator('button').last().click();
        await expect(page.getByText(uniqueName)).not.toBeVisible({ timeout: 10_000 });
    });
});
