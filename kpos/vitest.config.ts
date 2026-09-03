import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Playwright owns the browser E2E suite. Excluding it here prevents
        // `npm test` from importing Playwright's test.describe() through
        // Vitest, which made the frontend test command fail before running
        // any test.
        include: ['src/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules/**', '.svelte-kit/**', 'e2e/**'],
        passWithNoTests: true,
    },
});
