import { test, expect } from './fixtures';

test.describe('Customers — allowed flows', () => {
    test('members list loads', async ({ loggedInPage: page }) => {
        await page.goto('/customers/members');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
    });

    test('owner creates and deletes a member', async ({ loggedInPage: page }) => {
        await page.goto('/customers/members');
        const uniqueName = `E2E Test Member ${Date.now()}`;

        await page.getByTestId('members-add').click();
        await page.getByTestId('member-name').fill(uniqueName);
        await page.getByTestId('member-save').click();

        const card = page.locator('[data-testid^="customer-card-"]', { hasText: uniqueName });
        await expect(card).toBeVisible({ timeout: 10_000 });

        await card.locator('[data-testid^="customer-delete-"]').click();
        const confirmDialog = page.getByRole('alertdialog');
        await expect(confirmDialog).toBeVisible();
        await confirmDialog.getByRole('button').last().click();
        await expect(card).toHaveCount(0, { timeout: 10_000 });
    });
});
