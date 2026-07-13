import { test, expect } from './fixtures';

test.describe('Inventory', () => {
    test('inventory list page loads with stat cards', async ({ loggedInPage: page }) => {
        await page.goto('/inventory');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
        // Stat cards (total products / low stock / out of stock / stock value)
        // are always rendered once the query resolves, even with zero data.
        await expect(page.locator('text=/low.?stock|stock.?value/i').first()).toBeVisible({ timeout: 15_000 });
    });

    test('purchase orders page loads', async ({ loggedInPage: page }) => {
        await page.goto('/inventory/purchase-orders');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
    });

    test('stock adjust page loads', async ({ loggedInPage: page }) => {
        await page.goto('/inventory/adjust');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
    });
});
