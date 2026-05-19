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

1. Phase 1 migrations (schema) — non-breaking with backfill.
2. Phase 2 application enforcement — refactor routes module-by-module; add CI lint.
3. Phase 3 RLS — turn on per table progressively; staging-first.
4. Phase 5 tests after each phase.
5. Phase 4 schema separation — only when first enterprise customer signs.

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
