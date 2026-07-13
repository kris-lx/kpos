import { test, expect } from './fixtures';

test.describe('Products', () => {
    test('products list loads', async ({ loggedInPage: page }) => {
        await page.goto('/products');
        await expect(page).toHaveTitle(/KPOS/i, { timeout: 15_000 });
    });

    test('creates and deletes a product', async ({ loggedInPage: page }) => {
        await page.goto('/products');
        const uniqueName = `E2E Test Product ${Date.now()}`;

        await page.getByRole('button', { name: /ເພີ່ມສິນຄ້າ/ }).click();
        await page.getByLabel(/ຊື່ສິນຄ້າ \*/).fill(uniqueName);
        await page.getByLabel(/ລາຄາຂາຍ \*/).fill('15000');
        await page.getByRole('button', { name: /ບັນທຶກ|save/i }).click();

        await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 });

        const row = page.locator('tr', { hasText: uniqueName }).first();
        page.once('dialog', (dialog) => dialog.accept());
        await row.getByRole('button', { name: /delete|ລຶບ/i }).click();
        await expect(page.getByText(uniqueName)).not.toBeVisible({ timeout: 10_000 });
    });
});
