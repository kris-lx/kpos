import { test, expect } from './fixtures';

test.describe('POS — cart and checkout', () => {
    test('adds a product to the cart and completes a cash sale', async ({ loggedInPage: page }) => {
        await page.goto('/pos');

        // Wait for the product grid to render at least one product card.
        const firstProduct = page.locator('button:has(h3)').first();
        await expect(firstProduct).toBeVisible({ timeout: 15_000 });
        await firstProduct.click();

        // Checkout button becomes enabled once the cart has an item.
        const checkoutBtn = page.getByRole('button', { name: /checkout|ຊຳລະ/i }).first();
        await expect(checkoutBtn).toBeEnabled({ timeout: 10_000 });
        await checkoutBtn.click();

        // Payment modal — cash is the default method. Use the "exact amount"
        // quick button so the test doesn't depend on numpad digit assertions.
        const exactBtn = page.getByRole('button', { name: /exact|ພໍດີ/i });
        await expect(exactBtn).toBeVisible({ timeout: 10_000 });
        await exactBtn.click();

        const confirmBtn = page.getByRole('button', { name: /confirm.*payment|ຢືນຢັນ/i });
        await expect(confirmBtn).toBeEnabled();
        await confirmBtn.click();

        // Sale succeeded: payment modal closes and the cart resets to empty
        // (checkout button becomes disabled again).
        await expect(checkoutBtn).toBeDisabled({ timeout: 15_000 });
    });

    test('cart badge/customer selector is visible on the POS screen', async ({ loggedInPage: page }) => {
        await page.goto('/pos');
        await expect(page.getByRole('button', { name: /select customer|ເລືອກລູກຄ້າ/i })).toBeVisible({ timeout: 10_000 });
    });
});
