// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Theme Store (Svelte 5 Runes)
// ═══════════════════════════════════════════════════════════════════════════

import { browser } from '$app/environment';

export type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'kpos_theme';
const DEFAULT_THEME: Theme = 'system';

function createThemeStore() {
    let theme = $state<Theme>(DEFAULT_THEME);
    let resolvedTheme = $state<'light' | 'dark'>('light');

    // Initialize from localStorage
    if (browser) {
        const stored = localStorage.getItem(THEME_KEY) as Theme | null;
        if (stored && ['light', 'dark', 'system'].includes(stored)) {
            theme = stored;
        }
        updateResolvedTheme();
        applyTheme();

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (theme === 'system') {
                updateResolvedTheme();
                applyTheme();
            }
        });
    }

    function updateResolvedTheme() {
        if (theme === 'system') {
            resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';
        } else {
            resolvedTheme = theme;
        }
    }

    function applyTheme() {
        if (!browser) return;

        const html = document.documentElement;
        html.classList.remove('light', 'dark');
        html.classList.add(resolvedTheme);

        // Also set color-scheme for native elements
        html.style.colorScheme = resolvedTheme;
    }

    function setTheme(newTheme: Theme) {
        theme = newTheme;
        if (browser) {
            localStorage.setItem(THEME_KEY, newTheme);
            updateResolvedTheme();
            applyTheme();
        }
    }

    function toggle() {
        if (resolvedTheme === 'dark') {
            setTheme('light');
        } else {
            setTheme('dark');
        }
    }

    return {
        get theme() {
            return theme;
        },
        get resolvedTheme() {
            return resolvedTheme;
        },
        get isDark() {
            return resolvedTheme === 'dark';
        },
        setTheme,
        toggle,
    };
}

export const themeStore = createThemeStore();
