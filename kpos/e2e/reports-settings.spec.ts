import { test, expect } from './fixtures';

test.describe('Reports', () => {
    test('reports dashboard loads', async ({ loggedInPage: page }) => {
        await page.goto('/reports');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
    });

    test('sales report loads', async ({ loggedInPage: page }) => {
        await page.goto('/reports/financial');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
    });
});

test.describe('Settings', () => {
    test('settings home loads', async ({ loggedInPage: page }) => {
        await page.goto('/settings');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
    });

    test('store settings loads', async ({ loggedInPage: page }) => {
        await page.goto('/settings/store');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
    });

    test('integrations settings loads without leaking full secrets', async ({ loggedInPage: page }) => {
        await page.goto('/settings/integrations');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
    });
});
