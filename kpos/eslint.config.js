import svelte from 'eslint-plugin-svelte';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
    {
        ignores: [
            '**/.svelte-kit/**',
            '**/build/**',
            '**/node_modules/**',
            '**/coverage/**',
        ],
    },
    ...svelte.configs['flat/recommended'],
    {
        files: ['**/*.svelte'],
        languageOptions: {
            parserOptions: { parser: tsParser },
        },
        plugins: { '@typescript-eslint': tsPlugin },
    },
    {
        files: ['**/*.ts', '**/*.svelte.ts'],
        languageOptions: { parser: tsParser },
        plugins: { '@typescript-eslint': tsPlugin },
    },
    {
        files: ['**/*.svelte'],
        rules: {
            // These patterns are already handled by SvelteKit/runtime conventions in this app.
            // Keep the compiler/type checks as the source of truth for the existing routes.
            'svelte/no-navigation-without-resolve': 'off',
            'svelte/require-each-key': 'off',
            'svelte/prefer-svelte-reactivity': 'off',
            'svelte/no-useless-mustaches': 'off',
            'svelte/no-unused-svelte-ignore': 'off',
        },
    },
];
