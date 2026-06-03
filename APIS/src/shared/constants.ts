// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Shared Constants (single source of truth)
// ═══════════════════════════════════════════════════════════════════════════

/** All recognised role names in the system. */
export const ROLES = {
    SUPER_ADMIN:     'super_admin',
    ADMIN:           'admin',
    SYSTEM_ADMIN:    'system_admin',
    TENANT_ADMIN:    'tenant_admin',
    HQ_ADMIN:        'hq_admin',
    HQ_MANAGER:      'hq_manager',
    STORE_OWNER:     'store_owner',
    BRANCH_ADMIN:    'branch_admin',
    BRANCH_MANAGER:  'branch_manager',
    MANAGER:         'manager',
    STORE_MANAGER:   'store_manager',
    CASHIER:         'cashier',
    STAFF:           'staff',
    KITCHEN_STAFF:   'kitchen_staff',
    WAITER:          'waiter',
    INVENTORY_STAFF: 'inventory_staff',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/** Numeric role levels — lower = broader access. Matches ROLE_LEVELS in auth.middleware.ts. */
export const ROLE_LEVEL_MAP: Record<string, number> = {
    [ROLES.SUPER_ADMIN]:     1,
    [ROLES.SYSTEM_ADMIN]:    1,
    [ROLES.ADMIN]:           2,
    [ROLES.TENANT_ADMIN]:    2,
    [ROLES.HQ_ADMIN]:        3,
    [ROLES.HQ_MANAGER]:      4,
    [ROLES.STORE_OWNER]:     5,
    [ROLES.BRANCH_ADMIN]:    5,
    [ROLES.BRANCH_MANAGER]:  6,
    [ROLES.MANAGER]:         6,
    [ROLES.STORE_MANAGER]:   6,
    [ROLES.CASHIER]:         7,
    [ROLES.STAFF]:           7,
    [ROLES.KITCHEN_STAFF]:   7,
    [ROLES.WAITER]:          7,
    [ROLES.INVENTORY_STAFF]: 7,
};

/** Returns the numeric level for a role name. Unknown roles default to 7 (most restricted). */
export function getRoleLevelByName(role: string): number {
    return ROLE_LEVEL_MAP[role] ?? 7;
}

/** True if the role is admin-level (level ≤ 2: super_admin, system_admin, admin, tenant_admin). */
export function isAdminRole(role: string, isSuperAdmin = false): boolean {
    return isSuperAdmin || getRoleLevelByName(role) <= 2;
}

/** True if the role is manager-or-above (level ≤ 5). */
export function isManagerOrAbove(role: string, isSuperAdmin = false): boolean {
    return isSuperAdmin || getRoleLevelByName(role) <= 5;
}

// ─── Default system settings ────────────────────────────────────────────────
// Single source of truth used by seed scripts, settings routes, and API defaults.
// Override any of these via the settings table in the database.

export const DEFAULT_SETTINGS = {
    // Store / tenant identity
    currency:        'LAK',
    currencySymbol:  '₭',
    currencyIsoCode: '418',   // ISO 4217 numeric code for LAK
    timezone:        'Asia/Vientiane',
    language:        'lo',
    country:         'LA',

    // POS
    defaultTaxRate:  10,
    enableTax:       true,
    priceIncludesTax: true,
    allowNegativeStock: false,
    requireCustomer: false,
    defaultPaymentMethod: 'CASH',

    // Receipt
    receiptWidth:    '80mm',
    showLogo:        true,
    showTaxDetails:  true,
    footerText:      'ຂອບໃຈທີ່ໃຊ້ບໍລິການ!',

    // Display
    theme:           'system',
    showCustomerDisplay: false,

    // Business registration defaults
    businessType:    'retail',
    ownerIdType:     'national_id',
    ownerNationality: 'LAO',

    // Payment / QR
    qrMerchantCode:  '',
    qrCurrencyCode:  '418',
} as const;
