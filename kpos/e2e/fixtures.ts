import { test as base, expect, type Page } from '@playwright/test';

// Test tenant credentials — same account used throughout this project's
// manual/API-level smoke testing this session (hq_admin on the dev tenant).
export const TEST_USER = {
    email: process.env.E2E_EMAIL || 'jone@kpos.la',
    password: process.env.E2E_PASSWORD || 'Test@123456',
};

async function login(page: Page) {
    await page.goto('/login');
    // SvelteKit hydrates client-side after the initial (server-rendered)
    // HTML paints — interacting with the form before hydration finishes
    // makes the browser fall back to a native, non-JS form submit (a full
    // page reload with form fields appended as a query string, landing back
    // on /login instead of calling the API). `networkidle` + a short buffer
    // reliably waits past that window in dev (Vite serves many small ESM
    // module requests on first load, which networkidle waits out).
    await page.waitForLoadState('networkidle');
    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('#password').fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/pos', { timeout: 15_000 });
}

/** Extends Playwright's `test` with a `page` that's already logged in. */
export const test = base.extend<{ loggedInPage: Page }>({
    loggedInPage: async ({ page }, use) => {
        await login(page);
        await use(page);
    },
});

export { expect };
