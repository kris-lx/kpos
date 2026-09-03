import { test as base, expect, type Page } from '@playwright/test';

// Test tenant credentials — same account used throughout this project's
// manual/API-level smoke testing this session (hq_admin on the dev tenant).
export const TEST_USER = {
    email: process.env.E2E_EMAIL || 'jone@kpos.la',
    password: process.env.E2E_PASSWORD || 'Test@123456',
};

export const RESTRICTED_USER = {
    email: process.env.E2E_RESTRICTED_EMAIL || '',
    password: process.env.E2E_RESTRICTED_PASSWORD || 'TestPass123!',
};

export async function loginAs(page: Page, credentials: { email: string; password: string }) {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');
    // SvelteKit hydrates client-side after the initial (server-rendered)
    // HTML paints — interacting with the form before hydration finishes
    // makes the browser fall back to a native, non-JS form submit (a full
    // page reload with form fields appended as a query string, landing back
    // on /login instead of calling the API). `networkidle` + a short buffer
    // reliably waits past that window in dev (Vite serves many small ESM
    // module requests on first load, which networkidle waits out).
    await page.waitForLoadState('networkidle');
    await page.locator('#email').fill(credentials.email);
    await page.locator('#password').fill(credentials.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/pos', { timeout: 15_000 });
}

/** Extends Playwright's `test` with a `page` that's already logged in. */
export const test = base.extend<{ loggedInPage: Page }>({
    loggedInPage: async ({ page }, use) => {
        await loginAs(page, TEST_USER);
        await use(page);
    },
});

export { expect };
