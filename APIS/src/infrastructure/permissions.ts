// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Bitmask Permission Constants (BE-14 — Finding-G G2)
// ═══════════════════════════════════════════════════════════════════════════
//
// Each permission is a { low: bigint, high: bigint } pair.
// low  = bits  0-63  (tenant-level operations)
// high = bits 64-127 (platform-level operations)
//
// Bit layout (low):
//   SALE       bits 0-7
//   PRODUCT    bits 8-15
//   INVENTORY  bits 16-23
//   REPORT     bits 24-31
//   STAFF      bits 32-39
//   STORE      bits 40-47
//   BILLING    bits 48-55
//   RESERVED   bits 56-63
//
// Bit layout (high):
//   PLATFORM   bits 0-7  (mapped to high bigint)
//   RESERVED   bits 8-63
// ═══════════════════════════════════════════════════════════════════════════

export interface PermBit {
    low: bigint;
    high: bigint;
}

// ─── Helper: create a low-only perm ──────────────────────────────────────
function L(bit: number): PermBit {
    return { low: 1n << BigInt(bit), high: 0n };
}

// ─── Helper: create a high-only perm ─────────────────────────────────────
function H(bit: number): PermBit {
    return { low: 0n, high: 1n << BigInt(bit) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Permission Constants
// ═══════════════════════════════════════════════════════════════════════════

export const P = {
    // ── SALE (bits 0-7) ──────────────────────────────────────────────────
    SALE_VIEW:          L(0),
    SALE_CREATE:        L(1),
    SALE_VOID:          L(2),
    SALE_REFUND:        L(3),
    SALE_DISCOUNT:      L(4),
    SALE_HOLD:          L(5),
    SALE_SHIFT_OPEN:    L(6),
    SALE_SHIFT_CLOSE:   L(7),

    // ── PRODUCT (bits 8-15) ──────────────────────────────────────────────
    PRODUCT_VIEW:       L(8),
    PRODUCT_CREATE:     L(9),
    PRODUCT_UPDATE:     L(10),
    PRODUCT_DELETE:     L(11),
    PRODUCT_IMPORT:     L(12),
    PRODUCT_EXPORT:     L(13),
    CATEGORY_MANAGE:    L(14),
    PRICE_LEVEL_MANAGE: L(15),

    // ── INVENTORY (bits 16-23) ───────────────────────────────────────────
    INVENTORY_VIEW:     L(16),
    INVENTORY_ADJUST:   L(17),
    INVENTORY_TRANSFER: L(18),
    INVENTORY_COUNT:    L(19),
    PURCHASE_ORDER_VIEW:    L(20),
    PURCHASE_ORDER_CREATE:  L(21),
    PURCHASE_ORDER_APPROVE: L(22),
    STOCK_ALERT_MANAGE:     L(23),

    // ── REPORT (bits 24-31) ──────────────────────────────────────────────
    REPORT_SALES:       L(24),
    REPORT_PRODUCT:     L(25),
    REPORT_INVENTORY:   L(26),
    REPORT_FINANCIAL:   L(27),
    REPORT_STAFF:       L(28),
    REPORT_CUSTOMER:    L(29),
    REPORT_EXPORT:      L(30),
    REPORT_DASHBOARD:   L(31),

    // ── STAFF (bits 32-39) ───────────────────────────────────────────────
    STAFF_VIEW:         L(32),
    STAFF_CREATE:       L(33),
    STAFF_UPDATE:       L(34),
    STAFF_DELETE:       L(35),
    STAFF_ROLE_ASSIGN:  L(36),
    STAFF_SCHEDULE:     L(37),

    // ── STORE (bits 40-47) ───────────────────────────────────────────────
    STORE_VIEW:         L(40),
    STORE_CREATE:       L(41),
    STORE_UPDATE:       L(42),
    STORE_DELETE:       L(43),
    BRANCH_MANAGE:      L(44),
    SETTINGS_MANAGE:    L(45),
    RECEIPT_MANAGE:     L(46),

    // ── BILLING (bits 48-55) ─────────────────────────────────────────────
    BILLING_VIEW:       L(48),
    BILLING_MANAGE:     L(49),
    SUBSCRIPTION_MANAGE: L(50),

    // ── CUSTOMER (bits 56-61) ────────────────────────────────────────────
    CUSTOMER_VIEW:      L(56),
    CUSTOMER_CREATE:    L(57),
    CUSTOMER_UPDATE:    L(58),
    CUSTOMER_DELETE:    L(59),
    MEMBER_MANAGE:      L(60),
    PROMOTION_MANAGE:   L(61),

    // ── PLATFORM (high bits 0-7) ─────────────────────────────────────────
    PLATFORM_TENANT_VIEW:    H(0),
    PLATFORM_TENANT_CREATE:  H(1),
    PLATFORM_TENANT_SUSPEND: H(2),
    PLATFORM_TENANT_DELETE:  H(3),
    PLATFORM_AUDIT_VIEW:     H(4),
    PLATFORM_CONFIG:         H(5),
    PLATFORM_BILLING:        H(6),
    PLATFORM_SUPER_ADMIN:    H(7),
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Check if a mask has a specific permission bit set */
export function hasPerm(
    maskLow: bigint,
    maskHigh: bigint,
    perm: PermBit,
): boolean {
    return (maskLow & perm.low) === perm.low && (maskHigh & perm.high) === perm.high;
}

/** Combine multiple permission bits into a single mask */
export function combinePerm(...perms: PermBit[]): PermBit {
    let low = 0n;
    let high = 0n;
    for (const p of perms) {
        low |= p.low;
        high |= p.high;
    }
    return { low, high };
}

/** Merge two masks (OR) */
export function mergeMasks(a: PermBit, b: PermBit): PermBit {
    return { low: a.low | b.low, high: a.high | b.high };
}

/**
 * Map legacy permission string (e.g. "products:view") to a PermBit.
 * Returns undefined if no mapping exists.
 */
export function legacyPermTobit(perm: string): PermBit | undefined {
    return LEGACY_PERM_MAP[perm];
}

// ─── Legacy string → bitmask mapping ────────────────────────────────────

const LEGACY_PERM_MAP: Record<string, PermBit> = {
    // ── Sales ────────────────────────────────────────────────────────────────
    'sales:view':         P.SALE_VIEW,
    'sales:read':         P.SALE_VIEW,
    'sales:create':       P.SALE_CREATE,
    'sales:update':       P.SALE_CREATE,
    'sales:delete':       P.SALE_VOID,
    'sales:void':         P.SALE_VOID,
    'sales:refund':       P.SALE_REFUND,
    'sales:hold':         P.SALE_HOLD,
    'pos:view':           P.SALE_VIEW,
    'pos:read':           P.SALE_VIEW,
    'pos:access':         P.SALE_VIEW,
    'pos:discount':       P.SALE_DISCOUNT,
    'pos:void':           P.SALE_VOID,
    'pos:credit':         P.SALE_CREATE,
    'pos:hold':           P.SALE_HOLD,
    // ── Products ─────────────────────────────────────────────────────────────
    'products:view':      P.PRODUCT_VIEW,
    'products:read':      P.PRODUCT_VIEW,
    'products:create':    P.PRODUCT_CREATE,
    'products:update':    P.PRODUCT_UPDATE,
    'products:delete':    P.PRODUCT_DELETE,
    'products:import':    P.PRODUCT_IMPORT,
    'products:export':    P.PRODUCT_EXPORT,
    // ── Categories ───────────────────────────────────────────────────────────
    'categories:view':    P.CATEGORY_MANAGE,
    'categories:read':    P.CATEGORY_MANAGE,
    'categories:create':  P.CATEGORY_MANAGE,
    'categories:update':  P.CATEGORY_MANAGE,
    'categories:delete':  P.CATEGORY_MANAGE,
    // ── Inventory ────────────────────────────────────────────────────────────
    'inventory:view':     P.INVENTORY_VIEW,
    'inventory:read':     P.INVENTORY_VIEW,
    'inventory:create':   P.INVENTORY_ADJUST,
    'inventory:update':   P.INVENTORY_ADJUST,
    'inventory:delete':   P.INVENTORY_ADJUST,
    'inventory:adjust':   P.INVENTORY_ADJUST,
    'inventory:transfer': P.INVENTORY_TRANSFER,
    'inventory:stockin':  P.INVENTORY_ADJUST,
    'inventory:stockout': P.INVENTORY_ADJUST,
    'inventory:count':    P.INVENTORY_COUNT,
    // ── Reports ──────────────────────────────────────────────────────────────
    'reports:view':       P.REPORT_SALES,
    'reports:read':       P.REPORT_SALES,
    'reports:sales':      P.REPORT_SALES,
    'reports:products':   P.REPORT_PRODUCT,
    'reports:inventory':  P.REPORT_INVENTORY,
    'reports:financial':  P.REPORT_FINANCIAL,
    'reports:staff':      P.REPORT_STAFF,
    'reports:customers':  P.REPORT_CUSTOMER,
    'reports:export':     P.REPORT_EXPORT,
    'dashboard:view':     P.REPORT_DASHBOARD,
    'dashboard:read':     P.REPORT_DASHBOARD,
    // ── Staff ────────────────────────────────────────────────────────────────
    'staff:view':         P.STAFF_VIEW,
    'staff:read':         P.STAFF_VIEW,
    'staff:create':       P.STAFF_CREATE,
    'staff:update':       P.STAFF_UPDATE,
    'staff:delete':       P.STAFF_DELETE,
    'users:view':         P.STAFF_VIEW,
    'users:read':         P.STAFF_VIEW,
    'users:create':       P.STAFF_CREATE,
    'users:update':       P.STAFF_UPDATE,
    'users:delete':       P.STAFF_DELETE,
    // ── Roles ────────────────────────────────────────────────────────────────
    'roles:view':         P.STAFF_ROLE_ASSIGN,
    'roles:read':         P.STAFF_ROLE_ASSIGN,
    'roles:create':       P.STAFF_ROLE_ASSIGN,
    'roles:update':       P.STAFF_ROLE_ASSIGN,
    'roles:delete':       P.STAFF_ROLE_ASSIGN,
    // ── Store / Branch ───────────────────────────────────────────────────────
    'stores:view':        P.STORE_VIEW,
    'stores:read':        P.STORE_VIEW,
    'stores:create':      P.STORE_CREATE,
    'stores:update':      P.STORE_UPDATE,
    'stores:delete':      P.STORE_DELETE,
    'branches:view':      P.BRANCH_MANAGE,
    'branches:read':      P.BRANCH_MANAGE,
    'branches:create':    P.BRANCH_MANAGE,
    'branches:update':    P.BRANCH_MANAGE,
    'branches:delete':    P.BRANCH_MANAGE,
    // ── Settings ─────────────────────────────────────────────────────────────
    'settings:view':      P.SETTINGS_MANAGE,
    'settings:read':      P.SETTINGS_MANAGE,
    'settings:update':    P.SETTINGS_MANAGE,
    // ── Customers ────────────────────────────────────────────────────────────
    'customers:view':     P.CUSTOMER_VIEW,
    'customers:read':     P.CUSTOMER_VIEW,
    'customers:create':   P.CUSTOMER_CREATE,
    'customers:update':   P.CUSTOMER_UPDATE,
    'customers:delete':   P.CUSTOMER_DELETE,
    // ── Promotions ───────────────────────────────────────────────────────────
    'promotions:view':    P.PROMOTION_MANAGE,
    'promotions:read':    P.PROMOTION_MANAGE,
    'promotions:create':  P.PROMOTION_MANAGE,
    'promotions:update':  P.PROMOTION_MANAGE,
    'promotions:delete':  P.PROMOTION_MANAGE,
    // ── Payments ─────────────────────────────────────────────────────────────
    'payments:view':      P.BILLING_VIEW,
    'payments:read':      P.BILLING_VIEW,
    'payments:create':    P.BILLING_MANAGE,
    'payments:manage':    P.BILLING_MANAGE,
    'payments:settle':    P.BILLING_MANAGE,
    'payments:void':      P.SALE_VOID,
    'payments:refund':    P.SALE_REFUND,
    // ── Documents ────────────────────────────────────────────────────────────
    'documents:view':     P.RECEIPT_MANAGE,
    'documents:read':     P.RECEIPT_MANAGE,
    'documents:create':   P.RECEIPT_MANAGE,
    'documents:update':   P.RECEIPT_MANAGE,
    'documents:delete':   P.RECEIPT_MANAGE,
    // ── Restaurant / Tables ──────────────────────────────────────────────────
    'restaurant:view':    P.SALE_VIEW,
    'restaurant:read':    P.SALE_VIEW,
    'restaurant:manage':  P.SALE_CREATE,
    'tables:view':        P.SALE_VIEW,
    'tables:read':        P.SALE_VIEW,
    'tables:create':      P.SALE_CREATE,
    'tables:update':      P.SALE_CREATE,
    'tables:delete':      P.SALE_VOID,
};

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════

// All known low bits 0-61 + high bits 0-7 — PostgreSQL BIGINT signed max is 2^63-1.
// Setting only the bits actually defined keeps the value within safe bounds.
const ALL_LOW:  bigint = (1n << 62n) - 1n;  // bits 0-61
const ALL_HIGH: bigint = (1n << 8n)  - 1n;  // bits 0-7
/** All-permissions mask — used for wildcard '*'. Fits in PostgreSQL signed BIGINT. */
const ALL_BITS: PermBit = { low: ALL_LOW, high: ALL_HIGH };

/**
 * Convert a permission string array to a combined bitmask.
 * Unmapped strings are ignored (handled by string-array fallback in authorize()).
 * The wildcard string '*' sets every bit.
 */
export function permissionsToMask(perms: string[]): PermBit {
    if (perms.includes('*')) return ALL_BITS;
    const bits = perms.map(p => LEGACY_PERM_MAP[p]).filter(Boolean) as PermBit[];
    return combinePerm(...bits);
}

/**
 * Serialise a PermBit as { low: string, high: string } for JSON/Redis storage.
 * BigInt does not survive JSON.stringify; always store as decimal strings.
 */
export function maskToStrings(mask: PermBit): { low: string; high: string } {
    return { low: mask.low.toString(), high: mask.high.toString() };
}

/** Deserialise from { low: string, high: string } back to PermBit. */
export function stringsToMask(s: { low: string; high: string }): PermBit {
    return { low: BigInt(s.low || '0'), high: BigInt(s.high || '0') };
}
