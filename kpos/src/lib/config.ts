// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Frontend configuration constants
// All storage keys, timeouts, and env-driven values in one place.
// ═══════════════════════════════════════════════════════════════════════════

export const LOCAL_STORAGE_KEYS = {
    ACCESS_TOKEN: 'kpos_access_token',
    REFRESH_TOKEN: 'kpos_refresh_token',
    USER: 'kpos_user',
    ACTIVE_STORE: 'kpos_active_store',
    ACCESSIBLE_STORES: 'kpos_accessible_stores',
    RULES: 'kpos_user_rules',
    THEME: 'kpos_theme',
} as const;

/** Polling intervals in milliseconds */
export const POLL_INTERVALS = {
    NOTIFICATIONS: 60_000,
    HELD_SALES: 15_000,
    BADGE_COUNTS: 10_000,
} as const;

/** Default pagination page sizes */
export const PAGE_SIZES = {
    DEFAULT: 20,
    SMALL: 10,
    LARGE: 50,
} as const;
