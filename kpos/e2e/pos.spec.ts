import { test, expect, loginAs, RESTRICTED_USER } from './fixtures';

async function ensureOpenShift(page: Parameters<typeof loginAs>[0]) {
    await page.goto('/staff/shifts');

    const requiredDialog = page.getByTestId('shift-required-open');
    if (await requiredDialog.isVisible().catch(() => false)) {
        await page.locator('#opening-balance').fill('0');
        await requiredDialog.click();
    } else {
        const currentShift = page.getByTestId('shift-current');
        if (await currentShift.isVisible().catch(() => false)) return;

        // The shifts page loads the current shift asynchronously. If that
        // response arrives while the empty-state button is being clicked,
        // Svelte replaces the button node; retry against the latest DOM.
        for (let attempt = 0; attempt < 3; attempt += 1) {
            if (await currentShift.isVisible().catch(() => false)) return;
            try {
                await expect(page.getByTestId('shift-open')).toBeVisible({ timeout: 5_000 });
                await page.getByTestId('shift-open').click();
                break;
            } catch {
                if (attempt === 2) throw new Error('Could not open the shift modal');
            }
        }
        await expect(page.getByTestId('shift-open-confirm')).toBeVisible({ timeout: 5_000 });
        await page.getByTestId('shift-open-confirm').click();
    }

    await expect(page.getByTestId('shift-current')).toBeVisible({ timeout: 15_000 });
}

test.describe('POS — allowed flows', () => {
    test('adds a product to the cart and completes a cash sale', async ({ loggedInPage: page }) => {
        await ensureOpenShift(page);
        await page.goto('/pos');

        const firstProduct = page.locator('button[data-testid^="pos-product-"]:not([disabled])').first();
        await expect(firstProduct).toBeVisible({ timeout: 15_000 });
        await firstProduct.click();

        const checkoutBtn = page.getByTestId('pos-checkout');
        await expect(checkoutBtn).toBeEnabled({ timeout: 10_000 });
        await checkoutBtn.click();

        const exactBtn = page.getByTestId('pos-exact-amount');
        await expect(exactBtn).toBeVisible({ timeout: 10_000 });
        await exactBtn.click();

        const confirmBtn = page.getByTestId('pos-confirm-payment');
        await expect(confirmBtn).toBeEnabled();
        await confirmBtn.click();

        await expect(checkoutBtn).toBeDisabled({ timeout: 15_000 });
    });

    test('blocks payment when the cashier has no open shift', async ({ page }) => {
        test.skip(!RESTRICTED_USER.email, 'Set E2E_RESTRICTED_EMAIL after running qa-seed-restricted.ts');
        await loginAs(page, RESTRICTED_USER);
        await page.goto('/pos');

        const requiredDialog = page.getByTestId('shift-required-open');
        await expect(requiredDialog).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole('alertdialog')).toContainText(/shift|required|ກະ/i);
        await expect(page.getByTestId('pos-exact-amount')).toHaveCount(0);
    });

    test('customer selector is visible on the POS screen', async ({ loggedInPage: page }) => {
        await page.goto('/pos');
        await expect(page.getByTestId('pos-customer-selector')).toBeVisible({ timeout: 10_000 });
    });
});
