import { test, expect } from '@playwright/test';
import { TEST_USER } from './fixtures';

test.describe('Authentication', () => {
    test('logs in with valid credentials and lands on POS', async ({ page }) => {
        await page.goto('/login');
        await page.waitForLoadState('networkidle'); // wait past SvelteKit hydration — see fixtures.ts
        await page.locator('#email').fill(TEST_USER.email);
        await page.locator('#password').fill(TEST_USER.password);
        await page.locator('button[type="submit"]').click();
        await page.waitForURL('**/pos', { timeout: 15_000 });
        await expect(page).toHaveURL(/\/pos/);
    });

    test('rejects invalid credentials with an error, stays on login', async ({ page }) => {
        await page.goto('/login');
        await page.waitForLoadState('networkidle');
        await page.locator('#email').fill(TEST_USER.email);
        await page.locator('#password').fill('definitely-wrong-password');
        await page.locator('button[type="submit"]').click();
        // Should NOT navigate away from /login
        await page.waitForTimeout(1500);
        await expect(page).toHaveURL(/\/login/);
    });

    test('unauthenticated user is redirected away from a protected route', async ({ page }) => {
        await page.goto('/pos');
        await page.waitForURL('**/login**', { timeout: 10_000 });
        await expect(page).toHaveURL(/\/login/);
    });
});
