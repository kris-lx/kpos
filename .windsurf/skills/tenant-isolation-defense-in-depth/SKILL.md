---
name: tenant-isolation-defense-in-depth
description: Audit and harden the three-level tenant isolation model (Application → PostgreSQL RLS → Schema separation) for the KPOS multi-tenant SaaS platform. Use this skill when reviewing, fixing, or implementing tenant/branch scope enforcement, branch hierarchy, RLS policies, or per-tenant schema isolation.
---

# Tenant Isolation — Defense-in-Depth (KPOS)

## TARGET MODEL

```
SaaS Platform (SuperAdmin operators)
  └── Tenant A  ──── Subscription: Pro plan
       ├── Branch: HQ Vientiane           (parent_branch_id = null)
       │    ├── Branch: Savannakhet       (parent = HQ)
       │    └── Branch: Pakse             (parent = HQ)
       └── Users assigned to roles, scoped by branch_path
```

Three layers of isolation:

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| **L1 Application** | Drizzle `.where(eq(table.tenantId, ctx.tenantId))` + branch_path check | Every repo query |
| **L2 PostgreSQL RLS** | `SET LOCAL app.current_tenant_id`, `SET LOCAL app.current_branch_path` + policies | DB-level guard |
| **L3 Schema Separation** | Dedicated `tenant_<id>` schema, `search_path` per connection | Enterprise plan only |

---

## CURRENT STATE (audit @ checkpoint)

### Layer 1 — Application ✅ Partial
- `auth.middleware.ts` builds `ScopeFilter { tenantId, branchIds, storeIds, activeBranchId, ... }`.
- Helpers exist: `tenantScope()`, `buildScopeCondition()`, `buildTenantCondition()`, `ensureScopeAccess()`.
- **Gaps**:
  - Many route handlers (e.g. `modules/users/presentation/routes.ts`, `modules/branches/presentation/routes.ts`) still build conditions ad-hoc with `if (!isSuperAdmin && tenantId)` — inconsistent, easy to forget.
  - Missing tenant filter falls through silently (returns `undefined`) — no `DomainError` thrown.
  - No branch-hierarchy enforcement: `accessibleBranchIds` is a flat list, never derived from a `branch_path`.
  - `users.tenantId` is nullable in schema (`@/db/schema/tables.ts:64`) — should be `NOT NULL` for tenant users (only platform users may be null).

### Layer 2 — PostgreSQL RLS ⚠️ Stub Only
- `APIS/src/db/set-tenant-context.ts` defines `setTenantContext(tx, tenantId)` — **never imported anywhere** (verified via grep).
- No `app.current_branch_path` GUC.
- RLS policies in `drizzle/*.sql` migrations not verified to exist.
- No transactional wrapper that auto-injects context per request.

### Layer 3 — Schema Separation ❌ Not Implemented
- Single `public` schema; no `tenant_<uuid>` schemas.
- No `search_path` rewrite per connection.
- No provisioning script for enterprise tenant.

### Branch Hierarchy ❌ Missing
- `branches` table has no `parentBranchId` or `branchPath` columns (`@/db/schema/tables.ts:37-56`).
- No materialized path / ltree / recursive CTE for sub-branch traversal.

---

## FIX PLAN

### Phase 1 — Schema: Branch hierarchy + NOT NULL tenant
1. **Migration `00XX_branch_hierarchy.sql`**
   - `ALTER TABLE branches ADD COLUMN parent_branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT;`
   - `ALTER TABLE branches ADD COLUMN branch_path ltree NOT NULL;` (or `text[]` if `ltree` extension unavailable)
   - `CREATE INDEX branches_path_gist_idx ON branches USING GIST (branch_path);`
   - Backfill `branch_path` = `id::text` for root branches; `parent.branch_path || id::text` for children.
2. **Migration `00XX_tighten_tenant_id.sql`**
   - `ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL` (after backfilling platform users to a sentinel or moving them to `platform_users`).
3. Update Drizzle schema (`@/db/schema/tables.ts`) accordingly.

### Phase 2 — Application layer: enforce tenant scope
1. **Repository base class** (`@/shared/infrastructure/TenantScopedRepository.ts`):
   ```ts
   protected requireTenant(ctx: RequestContext): string {
     if (!ctx.tenantId) throw new DomainError('TENANT_SCOPE_MISSING');
     return ctx.tenantId;
   }
   ```
2. **Replace ad-hoc filters** in route handlers with `tenantScope(req, table.tenantId)` — already exists, just enforce usage.
3. **Branch-path scope helper**:
   ```ts
   export function buildBranchPathScope(req, pathColumn): SQL | undefined {
     const paths = req.authUser?.accessibleBranchPaths ?? [];
     if (!paths.length) return undefined;
     return sql`${pathColumn} <@ ANY(${paths}::ltree[])`;
   }
   ```
4. **Auth middleware**: load `accessibleBranchPaths` (descendants of user's `branchId.branch_path`) into `req.authUser`.
5. **ESLint rule / CI grep** to forbid `db.query.<table>.findMany` without an accompanying `tenantScope` / `buildScopeCondition`.

### Phase 3 — PostgreSQL RLS
1. **Extend `setTenantContext`**:
   ```ts
   export async function setRequestContext(tx, { tenantId, branchPath }) {
     await tx.execute(sql`SET LOCAL app.current_tenant_id = ${tenantId}`);
     await tx.execute(sql`SET LOCAL app.current_branch_path = ${branchPath}`);
   }
   ```
2. **Express middleware `withTenantTx`** that wraps every authenticated handler in `db.transaction(async tx => { await setRequestContext(tx, ...); req.tx = tx; await next(); })`. Refactor handlers to use `req.tx` instead of global `db`.
3. **RLS policies migration** (`00XX_rls_policies.sql`):
   ```sql
   ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
   CREATE POLICY branches_tenant_isolation ON branches
     USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
   CREATE POLICY branches_path_scope ON branches
     USING (branch_path <@ current_setting('app.current_branch_path')::ltree);
   ```
   Apply equivalent policies on every tenant-owned table (users, roles, stores, transactions, …).
4. **Test**: run query as non-superadmin with bogus tenantId — must return 0 rows.

### Phase 4 — Schema separation (Enterprise plan)
1. **Provisioning script** `scripts/provision-tenant-schema.ts`:
   - `CREATE SCHEMA tenant_<uuid>;`
   - Run `drizzle migrate` against that schema.
   - Record `tenant.schemaName` in the platform `tenants` table.
2. **Per-request connection wrapper**:
   ```ts
   await tx.execute(sql`SET LOCAL search_path = ${schemaName}, public`);
   ```
3. **Connection pool keying** by `tenantId` → `schemaName` to avoid leakage.
4. Only enable when `tenant.plan === 'enterprise'`; Pro/Free tenants remain in shared `public` schema with RLS.

### Phase 5 — Tests & verification
- Unit: `tenantScope` returns `undefined` for SuperAdmin, `eq()` otherwise.
- Integration: query Tenant A's data from Tenant B context → 403/empty.
- E2E (Playwright): login as Tenant B admin, attempt to read Tenant A's branch by id → 403.
- RLS bypass test: temporarily drop application filter, ensure RLS still blocks.
- Penetration test: forge JWT with another tenantId and ensure cache + DB both reject.

---

## EXECUTION ORDER (recommended)

1. Phase 1 migrations (schema) — non-breaking with backfill. ✅ DONE (commit `8651bb5`)
2. Phase 2 application enforcement — refactor routes module-by-module; add CI lint. ⚠️ Foundations done; routes pending.
3. Phase 3 RLS — turn on per table progressively; staging-first. ✅ Migration written; needs to be applied + handlers refactored to use `req.tx`.
4. Phase 5 tests after each phase.
5. Phase 4 schema separation — only when first enterprise customer signs.

---

# PHASE 4 — RBAC & DATA-ACCESS RULES (Hierarchical roles)

## Target rules (from product owner)

| Actor | Visibility | Mutate |
|---|---|---|
| **SuperAdmin (system admin)** | All tenants, all branches | All |
| **Tenant Admin** | All branches in their tenant | All within tenant |
| **HQ Branch admin/manager** | HQ + all sub-branches (branch_path descendants) | HQ + sub-branches |
| **Branch admin/manager** | Own branch only | Own branch only |
| **Branch staff** | Own branch + own store(s) | Per-permission CRUD |

Rules:
- **Reports**: HQ admin/manager sees consolidated reports of HQ + all sub-branches (driven by `branch_path <@` query).
- **Owner identity (name, logo, etc.)**: HQ and Branch can edit their own branch profile (`branches` row). HQ can also edit sub-branches; sub-branches **cannot** edit HQ.
- **Data sharing**: Each branch's transactional data (sales, inventory, customers, transactions) is invisible to siblings. Only the HQ ancestor sees down. Enforced by `branch_path` on every tenant-owned table that needs branch isolation.
- **Receipt/bill**: Each branch designs its own slip with its own logo/name (stored in `branches.receiptSettings`).

## Implementation steps

1. **Add `branch_path` column to data tables** that need branch-level isolation (not just `branch_id`):
   - `transactions`, `inventory`, `products`, `stores`, `customers`, `settlements`, `cash_registers`, `shifts`, `returns`, `payments`.
   - Backfill via JOIN with `branches.branch_path`. Maintain via app-layer write-time copy (cheap; branch_path rarely changes).
   - Index: `CREATE INDEX <table>_branch_path_idx ON <table> (branch_path text_pattern_ops);` for `LIKE 'p.%'` lookups.
2. **Extend RLS policies** (`0010_rls_branch_path_scope.sql`) to add `branch_path_scope` policy on the above tables (mirror the one already on `branches`).
3. **Add `tenantBranchScope(req, table)` helper** that combines `tenantScope` + `buildBranchPathScope` in one call. Replace ad-hoc `if (!isSuperAdmin && tenantId) { ... }` blocks with a single call.
4. **Roles seed**: ensure DB has these system role rows with hierarchy semantics:
   - `super_admin` (no `tenantId`, isSystem=true) — bypass-all
   - `admin` (per-tenant) — full tenant scope
   - `hq_admin`, `hq_manager` — full descendant scope from HQ branch
   - `branch_admin`, `branch_manager` — own branch only
   - `staff`, `cashier` — restricted CRUD
5. **Permission seed**: `@/d:/kailo/codes/kpos/APIS/src/shared/systemRolePermissions.ts` already contains permission lists; verify hq vs branch split exists; add if missing.
6. **`assertBranchScope` enforcement**: every `findFirst({ where: id })` route must call `repo.assertBranchScope(ctx, row.branchPath)` after fetch (defense-in-depth on top of RLS).

---

# PHASE 5 — DYNAMIC SIDEBAR MENU (no hardcoded fallback)

## Current state
- **Backend**: `menu_permissions` table exists (`@/d:/kailo/codes/kpos/APIS/src/db/schema/tables.ts:187-202`) with `key`, `parentId`, `path`, `icon`, `requiredPermission`, `order`, supports unlimited depth.
- **API**: `GET /users/me/menu` endpoint exists.
- **Frontend**: `@/d:/kailo/codes/kpos/kpos/src/lib/components/layout/Sidebar.svelte:174-209` already calls `loadMenuFromApi()`, but if the API returns empty it silently keeps a **700-line hardcoded fallback** (`menuItems = $state([...])` lines 226+).

## Plan
1. **Seed `menu_permissions`** from the current hardcoded array. One-shot Node script that reads the static array and inserts rows. Place at `APIS/scripts/seed-menu-permissions.ts`.
2. **Support N-level submenus**: `menu_permissions.parent_id` is already self-referential — verify the `/users/me/menu` endpoint returns recursive children (check `@/d:/kailo/codes/kpos/APIS/src/modules/users/presentation/routes.ts`). If not, switch to a recursive CTE.
3. **Remove the hardcoded fallback** in `Sidebar.svelte` once seed is verified. Show a skeleton loader when `menuLoaded === false`.
4. **Cache invalidation**: when a tenant admin edits menu visibility per role, invalidate `kpos:menu:{userId}` (add this Redis key to `auth.middleware.ts`).
5. **Per-role visibility**: link `menu_permissions` to roles via existing `roleRules` or add `menu_role_visibility(menu_id, role_id)` if richer toggles are needed.

---

# PHASE 6 — RECEIPT/BILL DESIGNER (per-branch)

## Current state
- `branches.receiptSettings` (jsonb) column exists.
- `@/d:/kailo/codes/kpos/kpos/src/routes/(app)/documents/design/+page.svelte` is a designer page using `sampleData` for preview (correct — it IS a designer).
- `@/d:/kailo/codes/kpos/kpos/src/lib/components/ReceiptPrint.svelte` does **NOT** read branch logo/name — it prints generic header.

## Plan
1. **Schema for `receiptSettings` jsonb**:
   ```ts
   interface ReceiptSettings {
     logoUrl?: string;
     header: { title: string; subtitle?: string; address?: string; phone?: string; taxId?: string };
     footer: { thankYouText?: string; promoText?: string; qrPaymentUrl?: string };
     elements: ReceiptElement[];   // ordered list from designer page
     paperWidthMm: 58 | 80;
     fontSize: number;
   }
   ```
2. **API**: `PUT /branches/:id/receipt-settings` (already partially via `branchRoutes.put('/:id')` accepting `settings`). Tighten to require `branches:update` + `assertBranchScope`.
3. **Frontend designer**: existing `documents/design/+page.svelte` should `GET /branches/me/receipt-settings` + `PUT` on save instead of working with local-only state.
4. **`ReceiptPrint.svelte` integration**:
   - New props: `branchSettings: ReceiptSettings`.
   - Render header from settings (logo, name, address). Render elements array in order.
   - POS page (`@/d:/kailo/codes/kpos/kpos/src/routes/(app)/pos/+page.svelte`) passes `auth.activeBranch.receiptSettings` when invoking `<ReceiptPrint />`.
5. **Each branch independent**: HQ and child branches each store their own `receiptSettings`. The active store's branch determines which is used at print time.

---

# PHASE 7 — DESIGN TOKENS & DARK MODE

## Current state
- `@/d:/kailo/codes/kpos/kpos/src/app.css:10-32` defines a `@theme` block with `primary` (blue oklch), `success`, `warning`, `error`, `info`.
- `@/d:/kailo/codes/kpos/kpos/src/lib/stores/theme.svelte.ts` supports `light`, `dark`, `system` and toggles via `class="dark"` on `<html>`.
- Dark-mode variant configured (`@custom-variant dark`).

## Plan (interpreted from "blue, genger, success and dark right mode")
1. **Confirm intent**: I'm reading `genger` as **ginger** (warm orange/amber accent). Add `--color-ginger-{50..950}` palette as a secondary brand accent for highlights/CTAs.
2. **Color tokens** (add/normalize in `app.css`):
   ```css
   /* Primary = Blue */
   --color-primary-500: oklch(0.55 0.18 250);
   /* Ginger = warm accent */
   --color-ginger-500: oklch(0.72 0.16 60);
   --color-ginger-600: oklch(0.62 0.18 50);
   /* Success = green (already present) */
   ```
3. **Dark mode polish**:
   - Add `--color-surface`, `--color-surface-dim`, `--color-surface-container` for both modes (currently only set under `prefers-color-scheme`); switch to class-based `.dark { ... }` overrides so the manual toggle works.
   - Audit components for hard-coded `bg-white`/`text-gray-900` and replace with `bg-surface`/`text-foreground` semantic tokens.
4. **Theme toggle UI**: add a `<ThemeToggle />` in the topbar that calls `themeStore.toggle()`.
5. **No hardcoded hex values** in components — every color must come from tokens.

---

# PHASE 8 — REMOVE HARDCODED DATA / FULL API INTEGRATION

## Findings (real hardcoded items detected)

| File | Issue | Action |
|---|---|---|
| `@/d:/kailo/codes/kpos/kpos/src/lib/components/layout/Sidebar.svelte:226-` | 700-line hardcoded menu fallback | Remove after seed (Phase 5) |
| `@/d:/kailo/codes/kpos/kpos/src/routes/forgot-password/+page.svelte:21-25` | Mock `setTimeout` instead of API call | Wire to `POST /auth/forgot-password` |
| `@/d:/kailo/codes/kpos/kpos/src/routes/(app)/dashboard/+page.svelte:176-` | Comment mentions "sample data" fallback | Verify all chart data sourced from `/reports/*`; remove sample fallback |
| `@/d:/kailo/codes/kpos/kpos/src/routes/(app)/documents/design/+page.svelte` | `sampleData` constant | **Keep** (designer preview only) but persist `receiptElements` to `branches.receiptSettings` via API |
| `@/d:/kailo/codes/kpos/kpos/src/routes/display/customer/+page.svelte` | Mock keyword found | Audit and wire to live transactions stream |

## Plan
1. **Audit script** `scripts/audit-hardcoded.mjs` — greps `mock|sample|TODO|FIXME|hardcod` across `kpos/src/**/*.svelte` and prints unresolved ones in CI.
2. **Per-page checklist** — go through every page under `kpos/src/routes/(app)/`:
   - All initial state must come from `api.get(...)` in `onMount`.
   - All mutation must `POST/PUT/DELETE` to API and re-fetch (or optimistic update).
   - All dropdown enums must come from `/settings/enums?type=...` (already established pattern).
3. **Type-safe API client**: continue using ky-based `@/d:/kailo/codes/kpos/kpos/src/lib/api/index.ts` plus typed query keys in `query-keys.ts`.

---

# PHASE 9 — TESTS & VERIFICATION

## Per-phase tests
1. **Branch hierarchy** — unit test for `branch_path` recursive backfill; assert `LIKE 'hq.%'` matches all sub-branches.
2. **RLS** — integration test with two tenants (A, B). As Tenant B, run raw SQL `SELECT * FROM users` after `setRequestContext(tx, { tenantId: B })` — must see zero Tenant A rows even with no app-level filter.
3. **Branch scope** — HQ admin sees sub-branch transactions; sub-branch admin does NOT see sibling.
4. **Menu** — login as different roles, assert sidebar tree differs and matches `menu_permissions` × `roleRules` join.
5. **Receipt** — print preview uses active branch's `receiptSettings`. HQ vs Branch produce different bills.
6. **Theme** — toggle to dark, take screenshot, confirm no hard-coded white backgrounds.
7. **API integration** — Playwright test that visits every route under `(app)/` and asserts no console errors and at least one network request to `/api/v1/...`.

---

# OPEN QUESTIONS (please confirm before Phase 4 starts)

1. **"genger"** = ginger (warm orange accent)?  ✅ assumed yes.
2. **HQ branch identification** — is "HQ" defined by `branches.isMain = true` or by `parent_branch_id IS NULL`? Plan assumes the latter (root of tree).
3. **Should sub-branches be allowed to design their own receipts** even if HQ disabled it? Plan assumes yes (per branch independence). Add `branches.allowChildReceiptOverride: bool` if HQ should be able to lock children.
4. **Forgot-password backend**: does the team want SMTP integration now, or stub the endpoint to log a token to console for dev?


## FILE TOUCHPOINTS

- `APIS/src/db/schema/tables.ts` — add hierarchy cols, tighten nullability.
- `APIS/drizzle/00XX_*.sql` — new migrations.
- `APIS/src/db/set-tenant-context.ts` — extend to branch_path; export `setRequestContext` + `withTenantTx`.
- `APIS/src/infrastructure/http/middleware/auth.middleware.ts` — populate `accessibleBranchPaths`; wire `withTenantTx`.
- `APIS/src/modules/*/presentation/routes.ts` — replace ad-hoc tenant guards with helpers.
- `APIS/src/shared/infrastructure/TenantScopedRepository.ts` — new base class.
- `scripts/provision-tenant-schema.ts` — new (Phase 4).

## ANTI-PATTERNS TO ELIMINATE

- `if (!req.authUser?.isSuperAdmin && req.authUser?.tenantId)` blocks in handlers — replace with `tenantScope(req, table.tenantId)`.
- Using global `db` inside request handlers — should be `req.tx` after Phase 3.
- Trusting JWT `tenantId` without DB verification — `loadCachedAuthUser` already re-reads from DB; keep that invariant.
- Flat `accessibleBranchIds` for hierarchy — switch to `accessibleBranchPaths` (ltree).
