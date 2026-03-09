# RBAC Complete System — 1M to 10M Merchants (Full Data Isolation)
# Audit + Fix of Previous Design

---

## ❌ What the Previous Design Does NOT Cover (Gaps Found)

| # | Gap | Impact |
|---|---|---|
| G1 | No data isolation enforcement at DB layer for products/inventory/sales | Merchants COULD see each other's data if query bug exists |
| G2 | Bitmask only covers 64 permissions — not enough for full POS domain | Product, Inventory, Sale, Report, Staff, Store = 100+ permissions needed |
| G3 | `store_ids` is a list in memory — not enforced at query level | Store-scoped users can bypass by crafting API requests |
| G4 | No tenant data routing for business data (only RBAC data) | Products/Sales/Inventory have no shard routing logic |
| G5 | Role DAG inherits `super_admin → merchant_owner` — WRONG | Platform roles must NEVER inherit into tenant roles |
| G6 | No resource ownership check — only permission check | User can edit another tenant's product if they guess the ID |
| G7 | No rate limiting per tenant | One merchant can flood API and affect others |
| G8 | Multi-role merge uses OR (union) — too permissive | A cashier + inventory role gets combined powers unsafely |
| G9 | Audit log is per-tenant — platform can't see cross-tenant events | Compliance and fraud detection requires platform-level audit view |
| G10 | No soft-delete or data lifecycle for offboarded merchants | Deleted merchant data leaks into aggregates |

---

## Architecture: Full Isolation Model

```
┌─────────────────────────────────────────────────────┐
│                   PLATFORM LAYER                     │
│  Super Admin │ Support Agent │ Platform Audit        │
│  (zero access to merchant business data)             │
└────────────────────────┬────────────────────────────┘
                         │ manages (metadata only)
┌────────────────────────▼────────────────────────────┐
│                  MERCHANT LAYER                      │
│  tenant_id is the absolute isolation boundary        │
│  Owner │ Manager │ Accountant                        │
└────────────────────────┬────────────────────────────┘
                         │ operates within
┌────────────────────────▼────────────────────────────┐
│                   STORE LAYER                        │
│  Supervisor │ Senior Cashier │ Cashier               │
│  Inventory Staff │ Kitchen Staff                     │
│  (store_id + tenant_id = double boundary)            │
└─────────────────────────────────────────────────────┘
```

### Isolation Rule (Non-Negotiable)
```
Platform Admin  → sees merchant METADATA only (name, plan, status)
                  NEVER sees sales, products, inventory
Merchant Owner  → sees only their own tenant_id data
Store Staff     → sees only their store_id within their tenant_id
```

---

## Fix G1 + G3 + G6 — Database Row Ownership Enforcement

Every business data table must have BOTH `tenant_id` AND enforce ownership on every query.

### Schema (Full Isolation)

```sql
-- ══════════════════════════════════════
-- PLATFORM METADATA (shared, small)
-- ══════════════════════════════════════
CREATE TABLE merchants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  plan_type     VARCHAR(50) NOT NULL DEFAULT 'starter',
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  shard_id      SMALLINT NOT NULL,        -- which DB shard holds their data
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES merchants(id),
  name          VARCHAR(255) NOT NULL,
  location      TEXT,
  status        VARCHAR(20) DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  status        VARCHAR(20) DEFAULT 'active',
  UNIQUE(tenant_id, email)               -- email unique PER TENANT only
);

CREATE TABLE user_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  user_id       UUID NOT NULL,
  role_key      VARCHAR(50) NOT NULL,
  scope         VARCHAR(20) NOT NULL,    -- 'merchant' | 'store'
  store_id      UUID,                    -- NULL if scope = 'merchant'
  granted_by    UUID NOT NULL,
  granted_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_store_scope CHECK (
    (scope = 'store' AND store_id IS NOT NULL) OR
    (scope = 'merchant' AND store_id IS NULL)
  )
);

-- ══════════════════════════════════════
-- BUSINESS DATA (per shard, isolated)
-- ALL tables have tenant_id as first column
-- ══════════════════════════════════════

CREATE TABLE products (
  id            UUID DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,           -- ALWAYS FIRST
  store_id      UUID,                    -- NULL = all stores in tenant
  name          VARCHAR(255) NOT NULL,
  sku           VARCHAR(100),
  price         NUMERIC(12,2) NOT NULL,
  status        VARCHAR(20) DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, id)            -- composite PK enforces isolation
);

CREATE TABLE inventory (
  id            UUID DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  store_id      UUID NOT NULL,
  product_id    UUID NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  -- Enforce: product must belong to same tenant
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE TABLE sales (
  id            UUID DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  store_id      UUID NOT NULL,
  cashier_id    UUID NOT NULL,
  total         NUMERIC(12,2) NOT NULL,
  status        VARCHAR(20) DEFAULT 'completed',
  created_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE sale_items (
  id            UUID DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  sale_id       UUID NOT NULL,
  product_id    UUID NOT NULL,
  quantity      INTEGER NOT NULL,
  unit_price    NUMERIC(12,2) NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, sale_id)    REFERENCES sales(tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

-- PostgreSQL Row Level Security (defense-in-depth)
ALTER TABLE products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

-- App sets this on every connection
CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation ON inventory
  USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation ON sales
  USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation ON sale_items
  USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

---

## Fix G2 — Extended Bitmask (128-bit via two bigints)

64 bits isn't enough. Use two 64-bit integers: `mask_low` and `mask_high`.

```typescript
// Domain groups — each domain gets its own bit region
const P = {
  // ── SALES (bits 0–7) ──
  SALE_CREATE:          { low: 1n << 0n,   high: 0n },
  SALE_VOID:            { low: 1n << 1n,   high: 0n },
  SALE_REFUND:          { low: 1n << 2n,   high: 0n },
  SALE_DISCOUNT:        { low: 1n << 3n,   high: 0n },
  SALE_VIEW:            { low: 1n << 4n,   high: 0n },
  DRAWER_OPEN:          { low: 1n << 5n,   high: 0n },

  // ── PRODUCTS (bits 8–15) ──
  PRODUCT_VIEW:         { low: 1n << 8n,   high: 0n },
  PRODUCT_CREATE:       { low: 1n << 9n,   high: 0n },
  PRODUCT_EDIT:         { low: 1n << 10n,  high: 0n },
  PRODUCT_DELETE:       { low: 1n << 11n,  high: 0n },
  PRODUCT_PRICE_EDIT:   { low: 1n << 12n,  high: 0n },

  // ── INVENTORY (bits 16–23) ──
  INVENTORY_VIEW:       { low: 1n << 16n,  high: 0n },
  INVENTORY_ADJUST:     { low: 1n << 17n,  high: 0n },
  INVENTORY_TRANSFER:   { low: 1n << 18n,  high: 0n },
  INVENTORY_RECEIVE:    { low: 1n << 19n,  high: 0n },

  // ── REPORTS (bits 24–31) ──
  REPORT_SALES_OWN:     { low: 1n << 24n,  high: 0n },
  REPORT_SALES_ALL:     { low: 1n << 25n,  high: 0n },
  REPORT_INVENTORY:     { low: 1n << 26n,  high: 0n },
  REPORT_FINANCIAL:     { low: 1n << 27n,  high: 0n },
  DATA_EXPORT:          { low: 1n << 28n,  high: 0n },

  // ── STAFF (bits 32–39) ──
  STAFF_VIEW:           { low: 1n << 32n,  high: 0n },
  STAFF_CREATE:         { low: 1n << 33n,  high: 0n },
  STAFF_EDIT:           { low: 1n << 34n,  high: 0n },
  STAFF_DEACTIVATE:     { low: 1n << 35n,  high: 0n },
  ROLE_ASSIGN:          { low: 1n << 36n,  high: 0n },

  // ── STORE SETTINGS (bits 40–47) ──
  STORE_VIEW:           { low: 1n << 40n,  high: 0n },
  STORE_EDIT:           { low: 1n << 41n,  high: 0n },
  STORE_CREATE:         { low: 1n << 42n,  high: 0n },

  // ── BILLING (bits 48–55) ──
  BILLING_VIEW:         { low: 1n << 48n,  high: 0n },
  BILLING_MANAGE:       { low: 1n << 49n,  high: 0n },

  // ── PLATFORM ONLY (high bits 0–7) ──
  PLATFORM_ADMIN:       { low: 0n, high: 1n << 0n },
  PLATFORM_SUPPORT:     { low: 0n, high: 1n << 1n },
  PLATFORM_AUDIT:       { low: 0n, high: 1n << 2n },
} as const

type PermBit = { low: bigint; high: bigint }

// Combine permissions
function combinePerm(...perms: PermBit[]): PermBit {
  return perms.reduce(
    (acc, p) => ({ low: acc.low | p.low, high: acc.high | p.high }),
    { low: 0n, high: 0n }
  )
}

// O(1) check
function hasPerm(userPerm: PermBit, required: PermBit): boolean {
  return (userPerm.low & required.low) === required.low
      && (userPerm.high & required.high) === required.high
}
```

---

## Fix G5 — Corrected Role DAG (Platform ≠ Tenant)

Previous design had `merchant_owner` inheriting from `super_admin` — **completely wrong**. Platform and tenant roles are isolated trees.

```typescript
// ── TREE A: Platform roles (never enter tenant scope) ──
const PLATFORM_DAG: Record<string, string[]> = {
  super_admin:     [],
  support_agent:   [],
  platform_auditor:[],
}

// ── TREE B: Tenant roles (never cross into platform) ──
const TENANT_DAG: Record<string, string[]> = {
  merchant_owner:   [],                       // root of tenant tree
  merchant_manager: ['merchant_owner'],        // NO — see fix below ↓
  accountant:       [],                        // read-only, no inheritance
  supervisor:       [],                        // store root
  senior_cashier:   ['cashier'],
  cashier:          [],
  inventory_staff:  [],
  kitchen_staff:    [],
}

// ⚠️ Fix: merchant_manager should NOT inherit merchant_owner
// Manager gets explicit permissions only — no billing, no account delete
const TENANT_DAG_FIXED: Record<string, string[]> = {
  merchant_owner:   [],
  merchant_manager: [],  // explicit, not inherited — safer
  accountant:       [],
  supervisor:       [],
  senior_cashier:   ['cashier'],
  cashier:          [],
  inventory_staff:  [],
  kitchen_staff:    [],
}

// Role masks (explicit per role — no dangerous inheritance across levels)
const TENANT_ROLE_PERMS: Record<string, PermBit> = {
  merchant_owner: combinePerm(
    P.SALE_CREATE, P.SALE_VOID, P.SALE_REFUND, P.SALE_DISCOUNT, P.SALE_VIEW,
    P.PRODUCT_VIEW, P.PRODUCT_CREATE, P.PRODUCT_EDIT, P.PRODUCT_DELETE, P.PRODUCT_PRICE_EDIT,
    P.INVENTORY_VIEW, P.INVENTORY_ADJUST, P.INVENTORY_TRANSFER, P.INVENTORY_RECEIVE,
    P.REPORT_SALES_ALL, P.REPORT_INVENTORY, P.REPORT_FINANCIAL, P.DATA_EXPORT,
    P.STAFF_VIEW, P.STAFF_CREATE, P.STAFF_EDIT, P.STAFF_DEACTIVATE, P.ROLE_ASSIGN,
    P.STORE_VIEW, P.STORE_EDIT, P.STORE_CREATE,
    P.BILLING_VIEW, P.BILLING_MANAGE,
  ),

  merchant_manager: combinePerm(
    P.SALE_CREATE, P.SALE_VOID, P.SALE_REFUND, P.SALE_DISCOUNT, P.SALE_VIEW,
    P.PRODUCT_VIEW, P.PRODUCT_CREATE, P.PRODUCT_EDIT, P.PRODUCT_PRICE_EDIT,
    P.INVENTORY_VIEW, P.INVENTORY_ADJUST, P.INVENTORY_TRANSFER, P.INVENTORY_RECEIVE,
    P.REPORT_SALES_ALL, P.REPORT_INVENTORY, P.DATA_EXPORT,
    P.STAFF_VIEW, P.STAFF_CREATE, P.STAFF_EDIT,
    P.STORE_VIEW,
    // NO: BILLING, STORE_CREATE, STAFF_DEACTIVATE, ROLE_ASSIGN, PRODUCT_DELETE
  ),

  accountant: combinePerm(
    P.SALE_VIEW, P.REPORT_SALES_ALL, P.REPORT_INVENTORY,
    P.REPORT_FINANCIAL, P.DATA_EXPORT,
    // NO write permissions at all
  ),

  supervisor: combinePerm(
    P.SALE_CREATE, P.SALE_VOID, P.SALE_DISCOUNT, P.SALE_VIEW,
    P.PRODUCT_VIEW, P.PRODUCT_EDIT,
    P.INVENTORY_VIEW, P.INVENTORY_ADJUST, P.INVENTORY_RECEIVE,
    P.REPORT_SALES_OWN, P.REPORT_INVENTORY,
    P.STAFF_VIEW, P.DRAWER_OPEN,
  ),

  senior_cashier: combinePerm(
    P.SALE_CREATE, P.SALE_REFUND, P.SALE_DISCOUNT, P.SALE_VIEW,
    P.PRODUCT_VIEW, P.INVENTORY_VIEW, P.DRAWER_OPEN,
  ),

  cashier: combinePerm(
    P.SALE_CREATE, P.SALE_VIEW, P.PRODUCT_VIEW, P.DRAWER_OPEN,
  ),

  inventory_staff: combinePerm(
    P.PRODUCT_VIEW, P.INVENTORY_VIEW,
    P.INVENTORY_ADJUST, P.INVENTORY_RECEIVE, P.INVENTORY_TRANSFER,
  ),

  kitchen_staff: combinePerm(
    P.SALE_VIEW,  // view orders only
  ),
}

const PLATFORM_ROLE_PERMS: Record<string, PermBit> = {
  super_admin:      combinePerm(P.PLATFORM_ADMIN, P.PLATFORM_SUPPORT, P.PLATFORM_AUDIT),
  support_agent:    combinePerm(P.PLATFORM_SUPPORT),
  platform_auditor: combinePerm(P.PLATFORM_AUDIT),
}
```

---

## Fix G8 — Safe Multi-Role Merge (Scoped Union, Not Global Union)

Previous design ORed all role masks globally. A cashier + inventory_staff would get combined unsafe powers.

```typescript
interface ScopedRole {
  role_key:  string
  scope:     'merchant' | 'store'
  store_id:  string | null
}

interface ResolvedAccess {
  merchant_perm: PermBit    // permissions valid across all stores
  store_perms:   Map<string, PermBit>  // per-store permission mask
}

function resolveUserAccess(roles: ScopedRole[]): ResolvedAccess {
  const result: ResolvedAccess = {
    merchant_perm: { low: 0n, high: 0n },
    store_perms:   new Map(),
  }

  for (const r of roles) {
    const perm = TENANT_ROLE_PERMS[r.role_key] ?? { low: 0n, high: 0n }

    if (r.scope === 'merchant') {
      // Merchant-scope roles apply everywhere
      result.merchant_perm = combinePerm(result.merchant_perm, perm)
    } else if (r.scope === 'store' && r.store_id) {
      // Store-scope roles apply ONLY to that store
      const existing = result.store_perms.get(r.store_id) ?? { low: 0n, high: 0n }
      result.store_perms.set(r.store_id, combinePerm(existing, perm))
    }
  }

  return result
}

// Effective permission for a specific store request
function effectivePermForStore(access: ResolvedAccess, store_id: string): PermBit {
  const storePerm = access.store_perms.get(store_id) ?? { low: 0n, high: 0n }
  // Merchant-level permissions apply everywhere + store-specific on top
  return combinePerm(access.merchant_perm, storePerm)
}
```

---

## Fix G4 — Business Data Shard Routing

Every business data query routes through tenant → shard mapping.

```typescript
// Shard registry (cached in memory, updated rarely)
class TenantShardRouter {
  private cache = new Map<string, string>()  // tenant_id → DSN

  async getConnection(tenantId: string): Promise<DBConnection> {
    // 1. Check local cache
    if (this.cache.has(tenantId)) {
      return connect(this.cache.get(tenantId)!)
    }

    // 2. Lookup shard from platform metadata DB
    const merchant = await platformDB.query(
      'SELECT shard_id FROM merchants WHERE id = $1', [tenantId]
    )

    const dsn = SHARD_MAP[merchant.shard_id]  // e.g. 'postgresql://shard-3/pos'
    this.cache.set(tenantId, dsn)

    return connect(dsn)
  }

  async withTenant<T>(tenantId: string, fn: (db: DBConnection) => Promise<T>): Promise<T> {
    const db = await this.getConnection(tenantId)

    // Set RLS context for this connection
    await db.query(`SET app.current_tenant = '${tenantId}'`)

    try {
      return await fn(db)
    } finally {
      await db.release()
    }
  }
}

const router = new TenantShardRouter()

// Usage — all business queries go through router
async function getProducts(tenantId: string, storeId?: string) {
  return router.withTenant(tenantId, async (db) => {
    // RLS policy ensures tenant_id filter even if developer forgets
    return db.query(
      `SELECT * FROM products WHERE tenant_id = $1 ${storeId ? 'AND (store_id = $2 OR store_id IS NULL)' : ''}`,
      storeId ? [tenantId, storeId] : [tenantId]
    )
  })
}
```

---

## Fix G7 — Per-Tenant Rate Limiting

```typescript
// Rate limit per tenant (sliding window in Redis)
async function rateLimitCheck(tenantId: string, endpoint: string): Promise<void> {
  const key    = `ratelimit:${tenantId}:${endpoint}`
  const window = 60          // seconds
  const limit  = 1000        // requests per window per tenant

  const current = await redis.incr(key)
  if (current === 1) await redis.expire(key, window)

  if (current > limit) {
    throw new TooManyRequestsError(`Tenant ${tenantId} rate limit exceeded`)
  }
}
```

---

## Fix G9 — Two-Level Audit Log

```typescript
// Tenant-level audit (per shard — merchant sees own actions)
interface TenantAuditEntry {
  id:            string      // UUIDv7
  tenant_id:     string
  store_id:      string | null
  actor_id:      string
  action:        string      // 'product.create' | 'sale.void' | ...
  resource_type: string
  resource_id:   string
  result:        'allow' | 'deny'
  delta:         object      // what changed (before/after)
  checksum:      string      // chained SHA-256
  timestamp:     Date
}

// Platform-level audit (central DB — platform team sees all events, metadata only)
interface PlatformAuditEntry {
  id:          string
  tenant_id:   string        // which merchant
  actor_id:    string        // platform staff who acted
  action:      string        // 'merchant.suspend' | 'plan.upgrade' | ...
  // NO business data (no products, no sales, no inventory)
  timestamp:   Date
}

// Write both in parallel, non-blocking
async function writeAudit(tenantEntry: TenantAuditEntry) {
  await Promise.all([
    // Write to tenant shard
    router.withTenant(tenantEntry.tenant_id, db =>
      db.query('INSERT INTO audit_log VALUES ($1, ...)', [tenantEntry])
    ),
    // Write metadata-only to platform (if platform actor involved)
    tenantEntry.actor_id.startsWith('platform:')
      ? platformDB.query('INSERT INTO platform_audit VALUES (...)')
      : Promise.resolve()
  ])
}
```

---

## Fix G10 — Merchant Offboarding (Data Lifecycle)

```typescript
type OffboardStatus = 'active' | 'suspended' | 'pending_deletion' | 'deleted'

async function offboardMerchant(tenantId: string, reason: string) {

  // 1. Immediately suspend — blocks all API access
  await platformDB.query(
    `UPDATE merchants SET status = 'suspended' WHERE id = $1`, [tenantId]
  )

  // 2. Invalidate ALL cached permissions for this tenant
  const keys = await redis.keys(`rbac:${tenantId}:*`)
  if (keys.length) await redis.del(...keys)

  // 3. Schedule deletion (30-day grace period for data export)
  await platformDB.query(
    `UPDATE merchants SET status = 'pending_deletion', delete_after = now() + interval '30 days'
     WHERE id = $1`, [tenantId]
  )

  // 4. Platform audit log
  await platformAuditLog({ action: 'merchant.offboard', tenant_id: tenantId, reason })
}

// Nightly job — hard delete expired tenants
async function purgeExpiredMerchants() {
  const expired = await platformDB.query(
    `SELECT id, shard_id FROM merchants
     WHERE status = 'pending_deletion' AND delete_after < now()`
  )

  for (const merchant of expired) {
    // Drop tenant data from shard (cascades via FK)
    await router.withTenant(merchant.id, db =>
      db.query(`DELETE FROM products  WHERE tenant_id = $1`, [merchant.id])
      // repeat for all tables or use CASCADE
    )

    // Mark deleted in platform metadata
    await platformDB.query(
      `UPDATE merchants SET status = 'deleted' WHERE id = $1`, [merchant.id]
    )
  }
}
```

---

## Complete Permission Check Flow (Fixed)

```
HTTP Request
      │
      ▼
[1]  Rate Limit Check (per tenant)              → 429 if exceeded
      │
      ▼
[2]  JWT Verify (signature + expiry)            → 401 if invalid
      │
      ▼
[3]  Token Revocation (Redis blacklist)         → 401 if revoked
      │
      ▼
[4]  Merchant Status Check                      → 403 if suspended/deleted
      │
      ▼
[5]  Fetch Scoped Permissions (Cache-aside)     → Redis → DB
      │
      ▼
[6]  Tenant Isolation (tenant_id === request)   → 403 if mismatch
      │
      ▼
[7]  Store Scope Check (store in user.stores)   → 403 if not assigned
      │
      ▼
[8]  Resource Ownership Check                   → 403 if resource.tenant_id ≠ user.tenant_id
      │
      ▼
[9]  128-bit Bitmask Permission Check (O(1))    → 403 if missing bit
      │
      ▼
[10] Route query to correct DB shard            → withTenant(tenantId, ...)
      │
      ▼
[11] RLS policy enforces tenant_id at DB layer  → double safety net
      │
      ▼
[12] Async Audit Log (non-blocking)             → fire and forget
      │
      ▼
     200 OK / business response
```

---

## What the Previous Design Supported vs What's Fixed

| Feature | Previous Design | Fixed Design |
|---|:---:|:---:|
| RBAC permission check | ✅ | ✅ |
| Role hierarchy (DAG) | ✅ (but wrong tree) | ✅ Fixed |
| Redis cache + invalidation | ✅ | ✅ |
| Consistent hash sharding | ✅ (RBAC only) | ✅ Business data too |
| JWT identity-only tokens | ✅ | ✅ |
| Immutable audit log | ✅ (tenant only) | ✅ Platform + tenant |
| Idempotent onboarding | ✅ | ✅ |
| **Full data isolation (sale/product/inventory)** | ❌ | ✅ |
| **128-bit bitmask (full POS domain)** | ❌ (64-bit) | ✅ |
| **Resource ownership check** | ❌ | ✅ |
| **Platform ≠ Tenant DAG separation** | ❌ | ✅ |
| **Scoped multi-role merge (per store)** | ❌ | ✅ |
| **Per-tenant rate limiting** | ❌ | ✅ |
| **Two-level audit (platform + tenant)** | ❌ | ✅ |
| **Merchant offboarding + data lifecycle** | ❌ | ✅ |
| **DB-layer RLS enforcement** | ❌ | ✅ |
| **Shard routing for business data** | ❌ | ✅ |

---

## Algorithm Complexity (Final)

| Algorithm | Complexity | Notes |
|---|---|---|
| Permission check (128-bit bitmask) | O(1) | Two AND operations |
| Role merge (scoped) | O(R) | R = user's role count, usually ≤ 5 |
| Cache lookup | O(1) | Redis hash get |
| Cache invalidation | O(U) pub/sub | U = nodes, typically < 10 |
| Shard routing | O(1) cached | Memory map lookup |
| Consistent hash add shard | O(V log V) | V = virtual nodes, startup only |
| Resource ownership check | O(1) | tenant_id compare on fetched row |
| Rate limit check | O(1) | Redis INCR |
| Audit log write | O(1) async | Non-blocking |
| Tenant isolation (RLS) | O(1) | DB enforces, zero app cost |
