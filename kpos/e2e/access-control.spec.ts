import { test, expect, loginAs, RESTRICTED_USER } from './fixtures';

test.describe('Access control — denied flows', () => {
    test.beforeEach(async () => {
        test.skip(!RESTRICTED_USER.email, 'Set E2E_RESTRICTED_EMAIL after running qa-seed-restricted.ts');
    });

    test('restricted staff is redirected from products management', async ({ page }) => {
        await loginAs(page, RESTRICTED_USER);
        await page.goto('/products');
        await page.waitForURL('**/dashboard', { timeout: 15_000 });
        await expect(page).toHaveURL(/\/dashboard/);
        await expect(page.getByTestId('products-add')).toHaveCount(0);
    });

    test('restricted staff is redirected from customer management', async ({ page }) => {
        await loginAs(page, RESTRICTED_USER);
        await page.goto('/customers/members');
        await page.waitForURL('**/dashboard', { timeout: 15_000 });
        await expect(page).toHaveURL(/\/dashboard/);
        await expect(page.getByTestId('members-add')).toHaveCount(0);
    });
});
