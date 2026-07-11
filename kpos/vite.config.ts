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
                    if (!id.includes('node_modules')) return;
                    if (id.includes('lucide-svelte')) return 'icons';
                    if (id.includes('@tanstack')) return 'query';
                    if (id.includes('svelte')) return 'svelte';
                    return 'vendor';
                }
            }
        }
    }
});
