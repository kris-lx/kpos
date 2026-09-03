import { test, expect } from './fixtures';

test.describe('Inventory — allowed flows', () => {
    test('inventory list loads with stat cards', async ({ loggedInPage: page }) => {
        await page.goto('/inventory');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
        await expect(page.getByTestId('inventory-stat-low-stock')).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId('inventory-stat-stock-value')).toBeVisible({ timeout: 15_000 });
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
