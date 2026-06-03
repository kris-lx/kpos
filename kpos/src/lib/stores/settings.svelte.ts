// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Tenant Settings Store (Svelte 5 Runes)
// Loads currency, timezone, language, and payment config from the API.
// Used by formatCurrency(), i18n locale, and the receipt design page.
// ═══════════════════════════════════════════════════════════════════════════

import { browser } from '$app/environment';
import { api } from '$api';

const CACHE_KEY = 'kpos_tenant_config';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface TenantConfig {
    // Store / currency
    currency:        string;
    currencySymbol:  string;
    currencyIsoCode: string;
    timezone:        string;
    country:         string;
    // Display
    language:        string;
    theme:           string;
    // POS
    defaultTaxRate:  number;
    enableTax:       boolean;
    priceIncludesTax: boolean;
    // Payments / QR
    qrMerchantCode:  string;
    qrCurrencyCode:  string;
}

const DEFAULTS: TenantConfig = {
    currency:        'LAK',
    currencySymbol:  '₭',
    currencyIsoCode: '418',
    timezone:        'Asia/Vientiane',
    country:         'LA',
    language:        'lo',
    theme:           'system',
    defaultTaxRate:  10,
    enableTax:       true,
    priceIncludesTax: true,
    qrMerchantCode:  '',
    qrCurrencyCode:  '418',
};

function createSettingsStore() {
    let config = $state<TenantConfig>({ ...DEFAULTS });
    let loaded = $state(false);

    // Restore from cache immediately (no flash)
    if (browser) {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const { data, ts } = JSON.parse(raw);
                if (Date.now() - ts < CACHE_TTL_MS) {
                    config = { ...DEFAULTS, ...data };
                    loaded = true;
                }
            }
        } catch { /* ignore corrupt cache */ }
    }

    async function load(): Promise<void> {
        try {
            // Fetch store + display + pos + payments categories in parallel
            const [storeRes, displayRes, posRes, payRes] = await Promise.allSettled([
                api.get('settings/category/store').json<{ success: boolean; data: Record<string, any> }>(),
                api.get('settings/category/display').json<{ success: boolean; data: Record<string, any> }>(),
                api.get('settings/category/pos').json<{ success: boolean; data: Record<string, any> }>(),
                api.get('settings/category/payments').json<{ success: boolean; data: Record<string, any> }>(),
            ]);

            const store   = storeRes.status   === 'fulfilled' && storeRes.value.success   ? storeRes.value.data   : {};
            const display = displayRes.status === 'fulfilled' && displayRes.value.success ? displayRes.value.data : {};
            const pos     = posRes.status     === 'fulfilled' && posRes.value.success     ? posRes.value.data     : {};
            const pay     = payRes.status     === 'fulfilled' && payRes.value.success     ? payRes.value.data     : {};

            config = {
                currency:        String(store.currency        ?? DEFAULTS.currency),
                currencySymbol:  String(store.currencySymbol  ?? DEFAULTS.currencySymbol),
                currencyIsoCode: String(store.currencyIsoCode ?? DEFAULTS.currencyIsoCode),
                timezone:        String(store.timezone        ?? DEFAULTS.timezone),
                country:         String(store.country         ?? DEFAULTS.country),
                language:        String(display.language      ?? DEFAULTS.language),
                theme:           String(display.theme         ?? DEFAULTS.theme),
                defaultTaxRate:  Number(pos.defaultTaxRate    ?? DEFAULTS.defaultTaxRate),
                enableTax:       Boolean(pos.enableTax        ?? DEFAULTS.enableTax),
                priceIncludesTax: Boolean(pos.priceIncludesTax ?? DEFAULTS.priceIncludesTax),
                qrMerchantCode:  String(pay.qrMerchantCode   ?? DEFAULTS.qrMerchantCode),
                qrCurrencyCode:  String(pay.qrCurrencyCode   ?? DEFAULTS.qrCurrencyCode),
            };

            loaded = true;

            if (browser) {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ data: config, ts: Date.now() }));
            }
        } catch (err) {
            console.warn('[settings] Failed to load tenant config, using defaults:', err);
        }
    }

    /** Force-refresh from API (call after saving settings). */
    async function refresh(): Promise<void> {
        if (browser) localStorage.removeItem(CACHE_KEY);
        await load();
    }

    /** Patch a subset of config locally (optimistic update before save). */
    function patch(partial: Partial<TenantConfig>): void {
        config = { ...config, ...partial };
        if (browser) {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ data: config, ts: Date.now() }));
        }
    }

    return {
        get config()  { return config; },
        get loaded()  { return loaded; },
        // Convenience accessors
        get currency()        { return config.currency; },
        get currencySymbol()  { return config.currencySymbol; },
        get currencyIsoCode() { return config.currencyIsoCode; },
        get timezone()        { return config.timezone; },
        get language()        { return config.language as 'lo' | 'th' | 'en' | 'zh' | 'ja'; },
        get defaultTaxRate()  { return config.defaultTaxRate; },
        get qrMerchantCode()  { return config.qrMerchantCode; },
        get qrCurrencyCode()  { return config.qrCurrencyCode; },
        load,
        refresh,
        patch,
    };
}

export const tenantSettings = createSettingsStore();
