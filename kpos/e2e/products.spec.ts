import { test, expect } from './fixtures';

test.describe('Products — allowed flows', () => {
    test('products list loads', async ({ loggedInPage: page }) => {
        await page.goto('/products');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
    });

    test('owner creates and deletes a product', async ({ loggedInPage: page }) => {
        await page.goto('/products');
        const uniqueName = `E2E Test Product ${Date.now()}`;

        await page.getByTestId('products-add').click();
        await page.getByTestId('product-name').fill(uniqueName);
        await page.locator('#a11y-app-products-page-svelte-4').fill('15000');
        await page.getByTestId('product-save').click();

        const card = page.locator('[data-testid^="product-card-"]', { hasText: uniqueName });
        await expect(card).toBeVisible({ timeout: 10_000 });

        await card.locator('[data-testid^="product-delete-"]').click();
        const confirmDialog = page.getByRole('alertdialog');
        await expect(confirmDialog).toBeVisible();
        await confirmDialog.getByRole('button').last().click();
        await expect(card).toHaveCount(0, { timeout: 10_000 });
    });
});
