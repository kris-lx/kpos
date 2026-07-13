import { defineConfig, devices } from '@playwright/test';

// E2E suite runs against a real dev server + real backend/DB (same pattern
// as this repo's live API smoke tests) — not mocked. Requires the backend
// (APIS) and its Postgres/Redis/RabbitMQ containers to already be running;
// this config only starts the frontend dev server.
export default defineConfig({
    testDir: './e2e',
    fullyParallel: false, // shared tenant/DB state — tests are not isolated from each other
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
    timeout: 30_000,
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});
