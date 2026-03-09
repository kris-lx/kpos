# ╔══════════════════════════════════════════════════════════════════════╗
# ║  KPOS — CODEBASE AUDIT + AI AGENT FIX TASKS                        ║
# ║  POS:   project                        ║
# ║  Ref:    rbac-1M-10M-full-isolation-fixed.md  (10 gaps: G1–G10)    ║
# ║  Audited: 2026-03-06  |  Session #1  |  Status: ZERO code changed  ║
# ╚══════════════════════════════════════════════════════════════════════╝
#
# ─── READ THIS ENTIRE FILE BEFORE WRITING A SINGLE LINE OF CODE ────────
# ─── UPDATE STATUS AFTER EVERY TASK — THIS FILE SURVIVES CONTEXT RESETS ─

## STATUS KEY
  [ ] not started
  [~] in progress — add partial-work note
  [x] done + verified
  [!] blocked — add reason
  [-] deferred

---

## ▌ PROJECT MAP (Confirmed from repo)

### Stack
  Backend  : Bun runtime · Express · TypeScript · Drizzle ORM · PostgreSQL · Redis · RabbitMQ
  Frontend : SvelteKit · Svelte 5 runes ($state / $derived / $effect) · ky HTTP client
  Auth     : jsonwebtoken · argon2 · ioredis

### Key files to know
  APIS/src/db/schema/tables.ts                      ← ALL Drizzle table defs (1 big file)
  APIS/src/db/schema/auth.ts                        ← users / sessions / roles / rules schema
  APIS/src/modules/auth/infrastructure/services/auth.service.ts  ← login / JWT / refresh
  APIS/src/infrastructure/http/middleware/auth.middleware.ts      ← authenticate / authorize
  APIS/src/infrastructure/http/middleware/rateLimit.middleware.ts ← express-rate-limit (IP only)
  APIS/src/modules/*/presentation/routes.ts         ← all routes inline (no controllers except auth)
  APIS/src/config/app.config.ts                     ← JWT_EXPIRES_IN default = '12h' ← WRONG
  kpos/src/lib/stores/auth.svelte.ts                ← Svelte 5 auth store
  kpos/src/lib/api/index.ts                         ← ky API client + token from localStorage

---

## ▌ AUDIT FINDINGS  (mapped to reference doc gaps G1–G10)

### ── FINDING-A  [G1 + G6]  🔴 CRITICAL — No DB-layer tenant isolation
  Cause  : ALL tenantId columns are NULLABLE (zero .notNull() calls anywhere)
  Cause  : transaction_items, order_items, sale_items — NO tenantId column at all
  Cause  : No PostgreSQL RLS policies exist anywhere in codebase
  Cause  : GET /products/:id → where eq(products.id, id) — no tenantId check
  Cause  : POST /sales product loop → where eq(products.id, item.productId) — no tenantId check
  Effect : Cashier from Tenant-A can sell Tenant-B's product. UUID-guess leaks any row.
  Ref    : G1 "products/inventory/sales could be cross-tenant", G6 "no resource ownership check"

### ── FINDING-B  [G2]  🔴 CRITICAL — JWT TTL is 12h (not 15min), permissions in payload
  Cause  : app.config.ts → JWT_EXPIRES_IN default = '12h'
  Cause  : auth.service.ts generateTokens() payload = { userId, email, role, branchId, tenantId }
           — role leaks into token; permissions are returned as permissions[] in login response
  Cause  : auth.svelte.ts reads permissions from the stored user object (from localStorage)
  Effect : Role revoked = user retains full access for up to 12 hours
  Ref    : Design mandates JWT = identity-only {sub, tid, bid, scope, jti, exp=15min}

### ── FINDING-C  [G2]  🔴 CRITICAL — Tokens and sensitive data in localStorage
  Cause  : auth.svelte.ts stores kpos_access_token, kpos_refresh_token, kpos_user,
           kpos_user_rules all in localStorage
  Cause  : api/index.ts beforeRequest hook reads token from localStorage on every call
  Effect : XSS attack steals access + refresh tokens + full permission set
  Ref    : Design: access token = memory only; refresh token = HttpOnly cookie

### ── FINDING-D  [G2]  🔴 CRITICAL — No JTI revocation
  Cause  : generateTokens() has no jti field in payload
  Cause  : logout() only does redis.del('refresh_token:{userId}') — no access-token blacklist
  Cause  : authenticate() has no revocation check
  Effect : Stolen access token works until expiry with zero ability to revoke it
  Ref    : Design step [3] "Token Revocation (Redis blacklist)"

### ── FINDING-E  [G5]  🔴 CRITICAL — Platform scope bleeds into tenant data
  Cause  : isSuperAdmin flag bypasses ALL checks — super admin calling GET /products
           returns data from ALL tenants (no tenantId filter at all for admin role)
  Cause  : No scope: 'platform' | 'tenant' concept — single boolean controls everything
  Cause  : roles table has no tenantId — roles are global (one tenant modifying a role
           affects all tenants using that role; name has global UNIQUE)
  Ref    : G5 "Platform roles must NEVER inherit into tenant roles"

### ── FINDING-F  [G7]  🟠 HIGH — Rate limiting is IP-based, not tenant-based
  Cause  : rateLimit.middleware.ts uses express-rate-limit with IP as key
  Cause  : No per-tenant Redis sliding window
  Effect : Multi-IP attacker bypasses limit; NAT users share one unfair limit
  Ref    : G7 "per-tenant rate limit" ratelimit:{tenantId}:{endpoint}

### ── FINDING-G  [G8]  🟠 HIGH — Permission model: O(n) string array, no bitmask
  Cause  : permissions column = text[] with 4 inconsistent formats:
           'products:read', 'products:view', 'products:*', '*'
  Cause  : No mask_low / mask_high bitmask columns on roles table
  Cause  : Multi-role: user has single roleId (not user_role_assignments table)
           — cannot have different roles for different stores
  Ref    : G2 "128-bit via two bigints" + G8 "scoped multi-role merge"

### ── FINDING-H  [G9]  🟡 MEDIUM — Audit logs: no checksum, no platform layer
  Cause  : activityLogs.tenantId is nullable (no NOT NULL)
  Cause  : No checksum column — entries are mutable / tamperable
  Cause  : No platform_audit_logs table for cross-tenant platform events
  Ref    : G9 "Two-Level Audit Log"

### ── FINDING-I  [G10]  🟡 MEDIUM — Merchant status not checked per-request
  Cause  : tenants.isActive field exists but never checked in authenticate()
  Cause  : No merchantStatusMiddleware, no Redis merchant:status:{tenantId}
  Effect : Suspended merchant staff still process sales indefinitely
  Ref    : G10 + design step [4] "Merchant Status Check"

### ── FINDING-J  [G1 G6]  🟡 MEDIUM — Global UNIQUE on codes / email (multi-tenant wrong)
  Cause  : users.email → global UNIQUE (two tenants can't share staff email)
  Cause  : branches.code, stores.code, transactions.transactionNo,
           orders.orderNo, roles.name, members.phone — all globally UNIQUE
  Effect : Code collision across tenants; staff cannot share emails between merchants
  Ref    : G1 schema "UNIQUE(tenant_id, email)"

### ── FINDING-K  [G1]  🟡 MEDIUM — Tables completely missing tenantId
  Confirmed missing: transaction_items, order_items, skuVariants, billOfMaterials,
  roleRules, permissions (RBAC), transactionPayments, cashMovements, pointHistory,
  purchaseOrderItems, stockTransferItems, stockCountItems
  Effect : These rows cannot be filtered by tenant — aggregate reports are cross-tenant

### ── FINDING-L  [G4]  🟢 LOW — No shard routing (deferred — single DB for now)
  Current scale does not require sharding. Defer until 100K+ tenants.
  When needed: implement TenantShardRouter from reference doc Fix G4.

---

## ▌ AUDIT SUMMARY TABLE

| ID | Gap Ref | Severity | Description |
|----|---------|----------|-------------|
| A  | G1+G6   | 🔴 Critical | All tenantId nullable, no RLS, cross-tenant product in sale |
| B  | G2      | 🔴 Critical | JWT TTL 12h (should be 15min), role/perms in payload |
| C  | G2      | 🔴 Critical | Tokens + permissions stored in localStorage |
| D  | G2      | 🔴 Critical | No JTI revocation — tokens irrevocable until expiry |
| E  | G5      | 🔴 Critical | isSuperAdmin bypasses isolation; roles table global |
| F  | G7      | 🟠 High    | Rate limit IP-based, not per-tenant |
| G  | G8      | 🟠 High    | String array O(n) perms, no bitmask, no user_role_assignments |
| H  | G9      | 🟡 Medium  | Audit no checksum/chain, no platform audit layer |
| I  | G10     | 🟡 Medium  | No merchant status check in request pipeline |
| J  | G1      | 🟡 Medium  | Global UNIQUE on email, code, transactionNo, etc. |
| K  | G1      | 🟡 Medium  | transaction_items + 11 other tables have no tenantId |
| L  | G4      | 🟢 Low     | No shard routing (deferred) |

---
---

# ══════════════════════════════════════════════════════
# PHASE 1 — DATABASE FIXES
# ══════════════════════════════════════════════════════
# Tools: Drizzle ORM migrations (bun drizzle-kit generate && bun drizzle-kit migrate)
# Schema files: APIS/src/db/schema/tables.ts + auth.ts
# Write each migration as a new .sql file in APIS/drizzle/

## PHASE 1.1 — Fix Global UNIQUE Constraints (Finding-J)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| DB-01 | Migration: drop UNIQUE(email) on users. Add UNIQUE(tenantId, email). Update Drizzle schema in auth.ts. | [x] | Schema updated in tables.ts — uniqueIndex('users_tenant_email_idx') |
| DB-02 | Migration: drop UNIQUE(code) on branches. Add UNIQUE(tenantId, code). | [x] | uniqueIndex('branches_tenant_code_idx') |
| DB-03 | Migration: drop UNIQUE(code) on stores. Add UNIQUE(tenantId, code). | [x] | uniqueIndex('stores_tenant_code_idx') |
| DB-04 | Migration: drop UNIQUE(transactionNo) on transactions. Add UNIQUE(tenantId, transactionNo). | [x] | uniqueIndex('transactions_tenant_no_idx') |
| DB-05 | Migration: drop UNIQUE(orderNo) on orders. Add UNIQUE(tenantId, orderNo). | [x] | uniqueIndex('orders_tenant_no_idx') |
| DB-06 | Migration: drop UNIQUE(name) on roles. Add UNIQUE(tenantId, name) where tenantId nullable = platform template. | [x] | uniqueIndex('roles_tenant_name_idx') |
| DB-07 | Migration: drop UNIQUE(phone) on members. Add UNIQUE(tenantId, phone). | [x] | uniqueIndex('members_tenant_phone_idx') |
| DB-08 | Migration: drop UNIQUE(slug) on categories. Add UNIQUE(tenantId, slug). | [x] | uniqueIndex('categories_tenant_slug_idx') |
| DB-09 | Migration: drop UNIQUE(sku) on skuVariants. Add UNIQUE(tenantId, sku). | [x] | uniqueIndex('sku_variants_tenant_sku_idx') + tenantId added |
| DB-10 | Update BOTH schema files (tables.ts and auth.ts) to reflect all constraint changes. | [x] | tables.ts updated; auth.ts is stale duplicate (drizzle.config only uses tables.ts) |

## PHASE 1.2 — Make tenantId NOT NULL on Existing Tables (Finding-A+K)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| DB-11 | Migration: tenantId NOT NULL on: products, inventory, transactions, categories, customers, members, promotions, coupons, discounts, vendors, purchaseOrders, stockTransfers, shifts, documents, settings, notifications, activityLogs, heldSales, tables(restaurant), orders, reservations, membershipTiers, pointSettings, paymentMethods, priceLevels, branches, stores, cashRegisters, stockCounts. Do in one migration, one ALTER per table. | [ ] | Finding-A — many tables |
| DB-12 | Update tables.ts: add .notNull() to all tenantId columns in the above list. | [ ] | |

## PHASE 1.3 — Add tenantId to Tables Currently Missing It (Finding-K)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| DB-20 | Migration: ADD COLUMN tenant_id UUID NOT NULL to transaction_items. Add FK → tenants.id. | [x] | tenantId added (nullable for now, NOT NULL in DB-11) |
| DB-21 | Migration: ADD COLUMN tenant_id UUID NOT NULL to order_items. | [x] | tenantId added |
| DB-22 | Migration: ADD COLUMN tenant_id UUID NOT NULL to transactionPayments. | [x] | tenantId added |
| DB-23 | Migration: ADD COLUMN tenant_id UUID NOT NULL to cashMovements. | [x] | tenantId added |
| DB-24 | Migration: ADD COLUMN tenant_id UUID NOT NULL to pointHistory. | [x] | tenantId added |
| DB-25 | Migration: ADD COLUMN tenant_id UUID NOT NULL to purchaseOrderItems. | [x] | tenantId added |
| DB-26 | Migration: ADD COLUMN tenant_id UUID NOT NULL to stockTransferItems. | [x] | tenantId added |
| DB-27 | Migration: ADD COLUMN tenant_id UUID NOT NULL to stockCountItems. | [x] | tenantId added |
| DB-28 | Migration: ADD COLUMN tenant_id UUID to skuVariants, billOfMaterials (nullable OK — these are sub-rows of products). | [x] | tenantId added + sku_variants_tenant_sku_idx |
| DB-29 | Update tables.ts: add tenantId column definition to all tables in DB-20..DB-28. | [x] | All updated in tables.ts |

## PHASE 1.4 — Add Composite Indexes + RLS (Finding-A)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| DB-30 | Migration: CREATE INDEX (tenantId, id) on: products, inventory, transactions, transaction_items, customers, members, orders. | [ ] | Finding-A performance |
| DB-31 | Migration: ALTER TABLE + ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY on: products, inventory, transactions, transaction_items, order_items, customers, members, orders, order_items, stockMovements, stockTransfers. | [ ] | Finding-A G1 |
| DB-32 | Migration: CREATE POLICY tenant_isolation ON each table above: USING (tenant_id = current_setting('app.current_tenant', true)::uuid). Use 'true' as 2nd arg so missing setting returns null not error. | [ ] | Finding-A G1 |
| DB-33 | Create helper in APIS/src/config/database.config.ts: export async function setTenantContext(db, tenantId: string). Runs: await db.execute(sql`SET LOCAL app.current_tenant = ${tenantId}`). Must be called at start of EVERY route handler. | [x] | Created in src/db/set-tenant-context.ts |

## PHASE 1.5 — RBAC Schema: Roles + Bitmask + user_role_assignments (Finding-E+G)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| DB-40 | Migration: ADD COLUMN tenant_id UUID (nullable = platform template) to roles. | [x] | Already existed in tables.ts |
| DB-41 | Migration: ADD COLUMN mask_low BIGINT NOT NULL DEFAULT 0 to roles. | [x] | Added to roles table |
| DB-42 | Migration: ADD COLUMN mask_high BIGINT NOT NULL DEFAULT 0 to roles. | [x] | Added to roles table |
| DB-43 | Migration: CREATE TABLE user_role_assignments (id UUID PK, tenant_id UUID NOT NULL, user_id UUID NOT NULL, role_id UUID NOT NULL, scope VARCHAR NOT NULL CHECK (scope IN ('merchant','store')), store_id UUID, granted_by UUID, granted_at TIMESTAMPTZ DEFAULT now(), UNIQUE(tenant_id, user_id, role_id, store_id), CONSTRAINT valid_store_scope CHECK ((scope='store' AND store_id IS NOT NULL) OR (scope='merchant' AND store_id IS NULL))). | [x] | Table created in tables.ts + relations.ts |
| DB-44 | Update Drizzle auth.ts / tables.ts: add the above columns + new table definition. | [x] | tables.ts + relations.ts updated |

## PHASE 1.6 — Auth/Session Fixes (Finding-D)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| DB-50 | Migration: ADD COLUMN jti VARCHAR(36) UNIQUE NOT NULL DEFAULT gen_random_uuid()::text to sessions. | [x] | jti added to sessions in tables.ts |
| DB-51 | Migration: ADD COLUMN revoked_at TIMESTAMPTZ to sessions. | [x] | revokedAt added to sessions |
| DB-52 | Update auth.ts sessions schema with jti + revokedAt. | [x] | Updated in tables.ts (canonical schema) |

## PHASE 1.7 — Audit + Platform Audit (Finding-H)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| DB-60 | Migration: ADD COLUMN checksum VARCHAR(64) to activityLogs. | [x] | checksum text column added |
| DB-61 | Migration: CREATE RULE / TRIGGER on activityLogs: BEFORE UPDATE OR DELETE EXECUTE PROCEDURE raise_exception('audit log is immutable'). | [ ] | Finding-H |
| DB-62 | Migration: CREATE TABLE platform_audit_logs (id UUID PK, actor_id UUID, action VARCHAR NOT NULL, tenant_id UUID, metadata JSONB, created_at TIMESTAMPTZ DEFAULT now()). | [x] | platformAuditLogs table added to tables.ts |

## PHASE 1.8 — Merchant Offboarding + Idempotency (Finding-I)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| DB-70 | Migration: ADD COLUMN status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active','suspended','pending_deletion','deleted')) to tenants (currently only isActive boolean). | [x] | status text column added to tenants |
| DB-71 | Migration: ADD COLUMN delete_after TIMESTAMPTZ to tenants. | [x] | deleteAfter added to tenants |
| DB-72 | Migration: CREATE TABLE idempotency_keys (key VARCHAR PK, result JSONB NOT NULL, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ). | [x] | idempotencyKeys table added to tables.ts |

## PHASE 1.9 — Seed Updates

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| DB-80 | Update seed.ts: platform-level role seeds (super_admin, support_agent, auditor) get tenantId = NULL. | [ ] | Finding-E |
| DB-81 | Update seed.ts: compute mask_low + mask_high for each role using TENANT_ROLE_PERMS from reference doc Fix G5. | [ ] | Finding-G |
| DB-82 | Update seed.ts: migrate existing roleId users to user_role_assignments with scope = 'merchant'. | [ ] | Finding-G |

---

# ══════════════════════════════════════════════════════
# PHASE 2 — BACKEND API FIXES
# ══════════════════════════════════════════════════════
# All changes in APIS/src/
# Drizzle ORM syntax only. No raw SQL except SET LOCAL commands.

## PHASE 2.1 — Fix JWT + Auth Service (Finding-B + D)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| BE-01 | app.config.ts: change JWT_EXPIRES_IN default from '12h' to '15m'. Verify jwtConfig.expiresIn propagates correctly. | [ ] | Finding-B |
| BE-02 | auth.service.ts → generateTokens(): change payload to identity-only: { sub: userId, tid: tenantId, bid: branchId, scope: 'tenant', jti: crypto.randomUUID(), iat, exp }. Remove email, role from payload. | [ ] | Finding-B |
| BE-03 | auth.service.ts → login(): remove permissions[] from returned user object. Return only: { id, email, name, role, tenantId, branchId, scope: 'tenant' }. Permissions resolved from Redis on each request. | [ ] | Finding-B |
| BE-04 | auth.service.ts → login(): add Set-Cookie header for refresh token as HttpOnly; Secure; SameSite=Strict. Remove refreshToken from JSON response body. | [ ] | Finding-C |
| BE-05 | auth.service.ts → storeRefreshToken(): change Redis key from 'refresh_token:{userId}' to 'refresh_jti:{jti}' → userId. Delete old key on new login (one active refresh per user). | [ ] | Finding-D |
| BE-06 | auth.service.ts → refreshToken(): accept token from cookie (req.cookies.refresh_token) NOT from request body. Verify 'refresh_jti:{jti}' in Redis. Revoke old jti, issue new pair with new jti. | [ ] | Finding-C+D |
| BE-07 | auth.service.ts → logout(): parse jti from access token. Add: await redis.set('revoked:' + jti, '1', 'EX', remainingTTLSeconds). Also clear refresh cookie. | [ ] | Finding-D |
| BE-08 | auth.controller.ts → me(): return full user profile + resolveUserMask() result (mask_low, mask_high as strings). Used by frontend on app mount to restore session state. | [ ] | Finding-B |
| BE-09 | auth.service.ts → register(): check UNIQUE(tenantId, email) not global email unique. | [ ] | Finding-J |

## PHASE 2.2 — Fix authenticate() Middleware Pipeline (Finding-B+D+E+I)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| BE-10 | auth.middleware.ts → authenticate(): Step 1: verify JWT. Extract jti from payload. Step 2: check Redis 'revoked:{jti}' → if exists → throw 401. Step 3: fetch resolved permissions from Redis 'rbac:{tenantId}:{userId}' (NOT from JWT payload). | [ ] | Finding-D |
| BE-11 | auth.middleware.ts → add merchantStatusMiddleware(): after JWT verify, check Redis 'merchant:status:{tenantId}'. Values: 'active'|'suspended'|'deleted'. If not 'active' → 403 MERCHANT_SUSPENDED. Cache miss → query tenants.status → write to Redis TTL 5min. | [ ] | Finding-I G10 |
| BE-12 | auth.middleware.ts → branchFilter(): add scope guard — if req.authUser.scope === 'platform' AND route path does not start with '/platform' → throw 403. Platform admin cannot access /products, /sales, /inventory, /reports. | [ ] | Finding-E G5 |
| BE-13 | Create APIS/src/infrastructure/services/permission.service.ts: getUserMask(userId, tenantId) → Redis cache-aside pattern. Miss: query user_role_assignments + roles, call resolveUserAccess() from reference G8 Fix, write to Redis 'rbac:{tenantId}:{userId}' TTL 300s. Returns { mask_low: bigint, mask_high: bigint }. | [ ] | Finding-G G8 |
| BE-14 | Create APIS/src/infrastructure/permissions.ts: define P constants as { low: bigint, high: bigint }. Exact values from reference doc Fix G2 (SALE bits 0-7, PRODUCT bits 8-15, INVENTORY bits 16-23, REPORT bits 24-31, STAFF bits 32-39, STORE bits 40-47, BILLING bits 48-55, PLATFORM high bits 0-7). Implement hasPerm() and combinePerm(). | [ ] | Finding-G |
| BE-15 | auth.middleware.ts: add requirePerm(permBit) factory using hasPerm(). Keep old authorize() as deprecated alias. | [ ] | Finding-G |
| BE-16 | Create invalidateUserPermissions(userId, tenantId): delete Redis 'rbac:{tenantId}:{userId}'. Call after any role assignment/revocation. | [ ] | Finding-G |

## PHASE 2.3 — Fix Per-Tenant Rate Limiting (Finding-F G7)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| BE-20 | rateLimit.middleware.ts: add tenantRateLimiter middleware. Redis sliding window. Key: 'ratelimit:{tenantId}:{endpoint}' where endpoint = req.path normalized (replace / with -). INCR, EXPIRE 60s, limit 1000/min. Return 429 with Retry-After header. | [ ] | Finding-F |
| BE-21 | Apply tenantRateLimiter to all business routes (products, inventory, sales, reports, customers, etc.). Keep IP-based authRateLimiter only for POST /auth/login. | [ ] | |

## PHASE 2.4 — Fix Products API (Finding-A G1+G6)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| BE-30 | products/routes.ts: at top of every handler add: await setTenantContext(db, req.authUser.tenantId) to activate RLS. | [ ] | Finding-A |
| BE-31 | products/routes.ts → GET / list: add eq(products.tenantId, req.authUser.tenantId) to WHERE (in addition to existing branchFilter). | [ ] | Finding-A |
| BE-32 | products/routes.ts → GET /:id: change where to and(eq(products.id, id), eq(products.tenantId, user.tenantId)). If null result → 403 not 404 (prevents guessing). | [ ] | Finding-A G6 |
| BE-33 | products/routes.ts → POST (create): inject tenantId: req.authUser.tenantId into insert payload. | [ ] | Finding-A |
| BE-34 | products/routes.ts → PATCH /:id: add and(eq(products.tenantId, user.tenantId)) to where before updating. | [ ] | Finding-A G6 |
| BE-35 | products/routes.ts → DELETE /:id: same tenantId check before delete. | [ ] | Finding-A G6 |
| BE-36 | Same setTenantContext + tenantId WHERE pattern for: categories/routes.ts, price-levels routes. | [ ] | |

## PHASE 2.5 — Fix Inventory API (Finding-A G1+G12-cross-tenant-transfer)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| BE-40 | inventory/routes.ts: call setTenantContext at start of every handler. | [ ] | Finding-A |
| BE-41 | inventory/routes.ts → GET / list: add eq(inventory.tenantId, user.tenantId) + eq(products.tenantId, user.tenantId) to WHERE. | [ ] | Finding-A |
| BE-42 | inventory/routes.ts → POST /transfer: before insert, fetch fromBranch and toBranch. Verify BOTH have tenantId === user.tenantId. Return 403 if mismatch. | [ ] | Finding-A cross-tenant transfer |
| BE-43 | inventory/routes.ts → all INSERTs (stockMovements, stockTransfers, stockCounts): inject tenantId: user.tenantId. | [ ] | Finding-A |

## PHASE 2.6 — Fix Sales API (Finding-A G1+G6 — HIGHEST PRIORITY SECTION)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| BE-50 | sales/routes.ts: call setTenantContext at start of every handler. | [ ] | Finding-A |
| BE-51 | sales/routes.ts → POST / create sale — product lookup INSIDE item loop: CHANGE to and(eq(products.id, item.productId), eq(products.tenantId, user.tenantId)). If null → 400 PRODUCT_NOT_FOUND. THIS IS THE MOST CRITICAL SINGLE LINE IN THE ENTIRE CODEBASE. | [ ] | Finding-A G1+G6 |
| BE-52 | sales/routes.ts → POST / create sale — transaction INSERT: inject tenantId: user.tenantId. | [ ] | Finding-A |
| BE-53 | sales/routes.ts → POST / create sale — transactionItems INSERT: inject tenantId: user.tenantId into each item (requires DB-20 first). | [ ] | Finding-K |
| BE-54 | sales/routes.ts → GET /:id: add eq(transactions.tenantId, user.tenantId) to WHERE. | [ ] | Finding-A G6 |
| BE-55 | sales/routes.ts → void + refund endpoints: add tenantId ownership check before any mutation. | [ ] | Finding-A G6 |
| BE-56 | sales/routes.ts → shifts, held-sales routes: add tenantId to all queries and INSERTs. | [ ] | Finding-A |

## PHASE 2.7 — Fix Roles + Staff API (Finding-E G5, Finding-G G8)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| BE-60 | roles/routes.ts → GET / list: change where to or(eq(roles.tenantId, user.tenantId), isNull(roles.tenantId)). Shows own tenant roles + platform templates. | [ ] | Finding-E |
| BE-61 | roles/routes.ts → POST create: inject tenantId: user.tenantId. Block tenantId: null by non-platform users. | [ ] | Finding-E |
| BE-62 | staff/routes.ts → POST /staff/:id/roles (new route or existing assign): write to user_role_assignments (new table DB-43), not users.roleId. Validate scope field. Call invalidateUserPermissions() after. | [ ] | Finding-G |
| BE-63 | staff/routes.ts → DELETE /staff/:id/roles/:assignmentId: delete from user_role_assignments. Call invalidateUserPermissions(). | [ ] | Finding-G |
| BE-64 | Block assigning platform-scope roles via tenant staff API. | [ ] | Finding-E |

## PHASE 2.8 — Fix All Other Business Modules (Finding-A G1)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| BE-70 | customers/routes.ts: setTenantContext + eq(customers.tenantId, user.tenantId) on all queries + INSERTs. | [ ] | |
| BE-71 | promotions/routes.ts: tenant filter on promotions, coupons, discounts. | [ ] | |
| BE-72 | reports/routes.ts: all aggregate queries scoped to user.tenantId via buildScopeCondition or direct eq. | [ ] | |
| BE-73 | restaurant/routes.ts: setTenantContext + tenantId on orders, order_items, tables, reservations. | [ ] | |
| BE-74 | payments/routes.ts: payment methods scoped to tenantId. | [ ] | |
| BE-75 | settings/routes.ts: settings scoped to tenantId. | [ ] | |
| BE-76 | dashboard/routes.ts: all stats queries add eq(*.tenantId, user.tenantId) — currently using branchFilter but no explicit tenant check. | [ ] | |

## PHASE 2.9 — Audit + Platform Audit (Finding-H G9)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| BE-80 | activity-log.helper.ts: add chained checksum. Before each insert: query last entry for same tenantId, get its checksum. Compute SHA-256(prevChecksum + JSON.stringify(newEntry)). Store in checksum field. | [ ] | Finding-H |
| BE-81 | activity-log.helper.ts: enforce tenantId always from user.tenantId (never null). | [ ] | Finding-H |
| BE-82 | Create platform_audit_log.helper.ts: writes to platform_audit_logs table. Use for merchant create/suspend/delete events. | [ ] | Finding-H G9 |

## PHASE 2.10 — Merchant Offboarding + Idempotency (Finding-I G10)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| BE-90 | admin/routes.ts → POST /platform/merchants/:id/suspend: update tenants.status = 'suspended', invalidate Redis merchant:status:{tenantId}, write platform_audit_log. | [ ] | Finding-I |
| BE-91 | Create APIS/src/infrastructure/http/middleware/idempotency.middleware.ts: check Idempotency-Key header → query idempotency_keys → return cached result if found. Else continue, save result after handler. TTL 24h. | [ ] | G10 |
| BE-92 | Apply idempotency middleware to POST /auth/register. | [ ] | |

---

# ══════════════════════════════════════════════════════
# PHASE 3 — FRONTEND FIXES (SvelteKit + Svelte 5 runes)
# ══════════════════════════════════════════════════════
# All in kpos/src/
# Use $state, $derived, $effect — NOT Svelte 4 stores

## PHASE 3.1 — Remove Tokens + Permissions from localStorage (Finding-C G2)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| FE-01 | auth.svelte.ts: DELETE all localStorage.setItem(ACCESS_TOKEN_KEY, ...) calls. Access token lives in $state memory only — never touches localStorage. | [ ] | Finding-C — do this first |
| FE-02 | auth.svelte.ts: DELETE all localStorage.setItem(REFRESH_TOKEN_KEY, ...) and localStorage.getItem(REFRESH_TOKEN_KEY). Refresh token is HttpOnly cookie — browser sends automatically, never readable by JS. Remove refreshToken $state variable entirely. | [ ] | Finding-C |
| FE-03 | auth.svelte.ts: DELETE localStorage.setItem(USER_KEY) and localStorage.setItem(RULES_KEY). User + rules live in $state memory only. | [ ] | Finding-C |
| FE-04 | auth.svelte.ts: DELETE the entire initialization block that reads localStorage for tokens/user/rules. Replace with: on browser mount, call GET /auth/me (server uses HttpOnly cookie). If 200 → restore session. If 401 → stay logged out. | [ ] | Finding-C |
| FE-05 | auth.svelte.ts → login(): after success, store accessToken in $state only. User + rules from GET /auth/me response (call it right after login). | [ ] | Finding-C |
| FE-06 | auth.svelte.ts → refresh(): POST /auth/refresh with credentials: 'include' (cookie sent automatically). No body. Update accessToken $state from response. | [ ] | Finding-C |
| FE-07 | api/index.ts → beforeRequest hook: CHANGE localStorage.getItem(ACCESS_TOKEN_KEY) to read from auth store $state (import { auth } from '$stores'; then auth.accessToken). | [ ] | Finding-C |
| FE-08 | api/index.ts → afterResponse hook: on 401 → do NOT clear localStorage tokens (they won't exist). Call auth.logout() to clear $state, then redirect /login. | [ ] | Finding-C |
| FE-09 | Keep ONLY: localStorage.setItem(ACTIVE_STORE_KEY) — UI preference, not security-sensitive. | [ ] | |

## PHASE 3.2 — Bitmask Permission Model (Finding-G G2)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| FE-10 | auth.svelte.ts: add permMaskLow = $state(0n) and permMaskHigh = $state(0n) (BigInt). | [ ] | Finding-G |
| FE-11 | auth.svelte.ts: add hasPerm(low: bigint, high: bigint): boolean — checks (permMaskLow & low) === low AND (permMaskHigh & high) === high. | [ ] | Finding-G |
| FE-12 | Create kpos/src/lib/permissions.ts: mirror the P constants from backend permissions.ts (same bit values). Export for use in Svelte components: {if auth.hasPerm(P.PRODUCT_CREATE.low, P.PRODUCT_CREATE.high)}. | [ ] | Finding-G |
| FE-13 | auth.svelte.ts: rewrite canRead/canCreate/canUpdate/canDelete(module) to internally call hasPerm() using the correct P bit. Keep same public API for backward compat during migration. | [ ] | Finding-G |
| FE-14 | auth.svelte.ts: populate permMaskLow + permMaskHigh from GET /auth/me response. Server returns mask_low and mask_high as decimal strings (BigInt-safe JSON). Convert with BigInt(str). | [ ] | Finding-G |

## PHASE 3.3 — Silent Token Refresh (Finding-B G2)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| FE-20 | auth.svelte.ts: after login or session restore, decode JWT exp from accessToken (parse middle base64 segment). Schedule setTimeout to call refresh() at 80% of remaining TTL (e.g. 12min of 15min). Store timeout ID in $state for cleanup. | [ ] | Finding-B |
| FE-21 | auth.svelte.ts → logout(): clear setTimeout timer. | [ ] | |
| FE-22 | api/index.ts: on 401 response — attempt silent refresh once (call auth.refresh()). If success, retry original request with new token. If still 401 → auth.logout() + redirect /login. | [ ] | Finding-B |

## PHASE 3.4 — Platform Scope Guard (Finding-E G5)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| FE-30 | auth.svelte.ts: add scope = $state<'platform' | 'tenant'>('tenant'). Set from GET /auth/me response scope field. | [ ] | Finding-E |
| FE-31 | routes/(app)/+layout.svelte: add $effect: if auth.scope === 'platform', goto('/platform'). Guard routes /products, /sales, /inventory, /reports, /customers — redirect if platform scope. | [ ] | Finding-E |
| FE-32 | components/layout/Sidebar.svelte: if auth.scope === 'platform', hide all business-data nav items. Show only platform admin section (manage merchants, platform audit). | [ ] | Finding-E |

## PHASE 3.5 — Error Handling (Finding-F+I)

| ID    | Task | Status | Notes |
|-------|------|--------|-------|
| FE-40 | api/index.ts: on 403 with error.code === 'MERCHANT_SUSPENDED' → show alert modal "Account suspended. Contact support." instead of generic error toast. | [ ] | Finding-I |
| FE-41 | api/index.ts: on 429 → parse Retry-After header, show toast "Too many requests. Try again in {n}s". | [ ] | Finding-F |

---

# ══════════════════════════════════════════════════════
# PHASE 4 — TESTS (Pass ALL before deploying)
# ══════════════════════════════════════════════════════

| ID      | Test | Status | Expected Result |
|---------|------|--------|-----------------|
| TEST-01 | RLS isolation: connect as app user, SET LOCAL app.current_tenant='tenant-A-uuid', SELECT * FROM products WHERE TRUE → zero rows from tenant-B. | [ ] | 0 rows for wrong tenant |
| TEST-02 | Cross-tenant product in sale: Tenant-A cashier POST /sales with Tenant-B productId → 400 PRODUCT_NOT_FOUND. | [ ] | 400 not 200 |
| TEST-03 | JTI revocation: login → logout → use old access token → 401. | [ ] | 401 not 200 |
| TEST-04 | JWT TTL: decode exp from issued token → should be ~15min from iat. | [ ] | exp - iat ≈ 900s |
| TEST-05 | Permission stale: assign role → GET /products 200 → revoke role → next GET /products within 5min → 403. | [ ] | Instant deny |
| TEST-06 | Merchant suspend: POST /platform/merchants/:id/suspend → all subsequent tenant API calls → 403 MERCHANT_SUSPENDED. | [ ] | 403 |
| TEST-07 | localStorage check: after login, open DevTools → Application → localStorage → confirm kpos_access_token and kpos_refresh_token are ABSENT. | [ ] | Not present |
| TEST-08 | Platform scope: super admin GET /products → 403 (platform scope blocked). | [ ] | 403 |
| TEST-09 | Cross-tenant transfer: POST /inventory/transfer with toBranchId from different tenant → 403. | [ ] | 403 |
| TEST-10 | Email per-tenant: create staff with same email in two different tenants → both requests succeed. | [ ] | Both 201 |
| TEST-11 | Silent refresh: wait 80% of JWT TTL (12min if 15min token) → verify new accessToken issued without user action. | [ ] | Auto-refresh |
| TEST-12 | Audit immutability: attempt UPDATE on activityLogs row → PostgreSQL trigger raises exception. | [ ] | Exception raised |

---

# ══════════════════════════════════════════════════════
# DEFERRED ITEMS
# ══════════════════════════════════════════════════════

| ID    | Topic | Reason |
|-------|-------|--------|
| DEF-1 | DB sharding (TenantShardRouter from G4 fix) | Single DB sufficient until 100K+ tenants |
| DEF-2 | Separate platform DB from tenant DB | RLS + tenantId columns handle isolation for current scale |
| DEF-3 | Full bitmask replace of all string permission checks in routes | Do after RLS (Phase 1) and JWT fixes (Phase 2.1) first |
| DEF-4 | Merchant self-service onboarding portal UI | After all security fixes complete |
| DEF-5 | Offline POS mode | Service worker + sync complexity |
| DEF-6 | Nightly purge job for pending_deletion merchants | After offboarding API (BE-90) works |

---

# ══════════════════════════════════════════════════════
# RESUME PROTOCOL — RUN AT START OF EVERY NEW SESSION
# ══════════════════════════════════════════════════════

```
STEP 1  Read this entire file top to bottom (5 min)
STEP 2  Read /mnt/user-data/outputs/rbac-1M-10M-full-isolation-fixed.md for design reference
STEP 3  Find all [~] in-progress tasks — resume those first
STEP 4  No [~] → start at lowest-numbered [ ] task
STEP 5  Phase ordering: DB (1) must complete before API (2) before Frontend (3) before Tests (4)
        EXCEPTION: FE-01 through FE-09 (localStorage removal) can start any time, no DB dependency
        EXCEPTION: BE-01 through BE-03 (JWT fixes) can start any time, no DB dependency
STEP 6  After completing each task: mark [x] and add a short note
STEP 7  If blocked: mark [!] + reason, move to next task
STEP 8  Update SESSION LOG below at end of session

CRITICAL RULES — MUST FOLLOW FOR ALL CODE CHANGES:
  1. Drizzle ORM API only for all DB queries — never raw SQL except SET LOCAL commands
  2. Call setTenantContext(db, tenantId) at the start of EVERY route handler
  3. Every business query WHERE clause MUST include eq(table.tenantId, user.tenantId)
  4. JWT payload is identity-only after BE-02 is done — never put permissions in JWT
  5. No tokens in localStorage after FE-01/FE-02 are done
  6. Never return permissions[] in the login response body after BE-03 is done
  7. setTenantContext must use SET LOCAL (not SET) so it scopes to the current transaction
```

---

# ══════════════════════════════════════════════════════
# SESSION LOG
# ══════════════════════════════════════════════════════

| Session | Date       | Completed Tasks | Notes |
|---------|------------|-----------------|-------|
| #1      | 2026-03-06 | Full audit (Finding A–L, all 16 tasks mapped) | Zero code changed. Start DB-01 next session. |
| #2      | —          | —               | — |
| #3      | —          | —               | — |
| #4      | —          | —               | — |
| #5      | —          | —               | — |
