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

// A numeric role-level map + getRoleLevelByName()/isAdminRole()/
// isManagerOrAbove() used to live here, claiming to "match ROLE_LEVELS in
// auth.middleware.ts" — it didn't (e.g. this file had store_owner at level
// 5; the real, request-authorizing ROLE_LEVELS in auth.middleware.ts has it
// at level 2). It was also dead code (nothing imported it), which is worse
// than a live bug: it looked like a ready-made "role level helper" for
// anyone who went looking for one, and would have silently misclassified
// admin/manager roles if anyone had ever wired it up. Removed rather than
// fixed — auth.middleware.ts's `ROLE_LEVELS`/`getRoleLevel()` is the one
// real source of truth; import from there instead of adding a new copy here.

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
