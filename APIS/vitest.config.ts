import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/index.ts'],
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            '@config': resolve(__dirname, './src/config'),
            '@shared': resolve(__dirname, './src/shared'),
            '@modules': resolve(__dirname, './src/modules'),
            '@infrastructure': resolve(__dirname, './src/infrastructure'),
        },
    },
});
