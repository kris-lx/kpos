import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        tailwindcss(),
        sveltekit()
    ],
    server: {
        port: 5173,
        host: true,
        proxy: {
            '/api': {
                target: 'http://localhost:5000',
                changeOrigin: true
            }
        }
    },
    build: {
        target: 'esnext',
        sourcemap: false,
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    const normalizedId = id.replaceAll('\\', '/');
                    // Keep the largest third-party runtimes out of the shared
                    // route chunk without splitting app modules into circular
                    // dependency groups.
                    if (!normalizedId.includes('node_modules')) return;
                    if (normalizedId.includes('lucide-svelte')) return 'icons';
                    if (normalizedId.includes('@tanstack')) return 'query';
                    if (normalizedId.includes('/chart.js/')) return 'charts';
                    if (normalizedId.includes('/jsbarcode/')) return 'barcode';
                    if (normalizedId.includes('svelte')) return 'svelte';
                    return 'vendor';
                }
            }
        }
    }
});
