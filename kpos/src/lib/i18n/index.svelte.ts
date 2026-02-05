// ═══════════════════════════════════════════════════════════════════════════
// KPOS - i18n (Internationalization) System
// ═══════════════════════════════════════════════════════════════════════════

import { browser } from '$app/environment';
import { th, en, zh, ja, lo } from './locales';

// Supported languages
export type Locale = 'th' | 'en' | 'zh' | 'ja' | 'lo';

export const LOCALES: { code: Locale; name: string; nativeName: string }[] = [
    { code: 'th', name: 'Thai', nativeName: 'ไทย' },
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'zh', name: 'Chinese', nativeName: '中文' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語' },
    { code: 'lo', name: 'Lao', nativeName: 'ລາວ' },
];

const LOCALE_KEY = 'kpos_locale';
const DEFAULT_LOCALE: Locale = 'lo';

// Translation dictionaries - imported from separate files for maintainability
type TranslationDict = Record<string, string>;
type Translations = Record<Locale, TranslationDict>;

const translations: Translations = {
    th,
    en,
    zh,
    ja,
    lo,
};

// Reactive locale state - this is the single source of truth
let currentLocale = $state<Locale>(DEFAULT_LOCALE);

// Initialize from localStorage
if (browser) {
    const stored = localStorage.getItem(LOCALE_KEY) as Locale | null;
    if (stored && LOCALES.find((l) => l.code === stored)) {
        currentLocale = stored;
    }
}

// Helper function to translate with current locale
function translateKey(key: string, params?: Record<string, string | number>): string {
    const dict = translations[currentLocale];
    let text = dict[key] || translations[DEFAULT_LOCALE][key] || key;

    // Replace parameters like {name} with actual values
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        });
    }

    return text;
}

// i18n Store
function createI18nStore() {
    function setLocale(newLocale: Locale) {
        if (LOCALES.find((l) => l.code === newLocale)) {
            currentLocale = newLocale;
            if (browser) {
                localStorage.setItem(LOCALE_KEY, newLocale);
                // Update html lang attribute
                document.documentElement.lang = newLocale;
            }
        }
    }

    return {
        get locale() {
            return currentLocale;
        },
        get locales() {
            return LOCALES;
        },
        setLocale,
        // Return a function that reads the reactive locale
        t: (key: string, params?: Record<string, string | number>) => translateKey(key, params),
    };
}

export const i18n = createI18nStore();

// Convenience function - this reads from the reactive currentLocale
export function t(key: string, params?: Record<string, string | number>): string {
    return translateKey(key, params);
}

// Export current language getter
export function getCurrentLanguage(): Locale {
    return currentLocale;
}

// Get current language reactively
export function currentLanguage(): Locale {
    return currentLocale;
}

// Set language function
export function setLanguage(newLocale: Locale) {
    i18n.setLocale(newLocale);
}
