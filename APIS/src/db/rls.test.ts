// ═══════════════════════════════════════════════════════════════════════════
// Proves PostgreSQL Row-Level Security actually blocks cross-tenant reads at
// the database level — independent of any application-layer WHERE clause.
// This is the regression test for the 2026-07-11 incident where RLS was
// enabled on tables no route yet queried through a tenant-scoped connection,
// and separately proves the policies keep working now that they do.
//
// Requires a real, reachable Postgres with the kpos_app role + RLS policies
// already applied (drizzle/0013_create_app_role.sql, 0014/0017 policies).
// The rest of this suite intentionally runs DB-free (see test-setup.ts's
// fake DATABASE_URL) — this file needs its own, separately-named env vars so
// it isn't silently pointed at that fake connection string, and skips
// gracefully when they aren't set (e.g. in CI, which doesn't run Postgres).
//
// Run locally against the dev stack with:
//   RLS_TEST_SUPERUSER_URL=postgresql://kpos:kpos_secret_change_me@localhost:5432/kpos_db \
//   RLS_TEST_APP_URL=postgresql://kpos_app:kpos_app_secret_change_me@localhost:5432/kpos_db \
//   npx vitest run src/db/rls.test.ts
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'crypto';

const SUPERUSER_URL = process.env.RLS_TEST_SUPERUSER_URL;
const APP_URL = process.env.RLS_TEST_APP_URL;

describe.skipIf(!SUPERUSER_URL || !APP_URL)('RLS tenant isolation (live DB)', () => {
    const superSql = postgres(SUPERUSER_URL as string, { max: 1 });
    const appSql = postgres(APP_URL as string, { max: 1 });

    const tenantAId = randomUUID();
    const tenantBId = randomUUID();
    const branchId = randomUUID();
    const productId = randomUUID();

    beforeAll(async () => {
        await superSql`insert into tenants (id, name, code) values (${tenantAId}, 'RLS Test Tenant A', ${'rls-test-a-' + tenantAId.slice(0, 8)})`;
        await superSql`insert into branches (id, tenant_id, name, code) values (${branchId}, ${tenantAId}, 'RLS Test Branch', ${'RLSTEST-' + branchId.slice(0, 8)})`;
        await superSql`insert into products (id, tenant_id, branch_id, name, sku, price, cost) values (${productId}, ${tenantAId}, ${branchId}, 'RLS Test Product', ${'RLS-SKU-' + productId.slice(0, 8)}, 100, 50)`;
    });

    afterAll(async () => {
        await superSql`delete from products where id = ${productId}`;
        await superSql`delete from branches where id = ${branchId}`;
        await superSql`delete from tenants where id = ${tenantAId}`;
        await superSql.end();
        await appSql`RESET ALL`;
        await appSql.end();
    });

    it('kpos_app with no tenant context set sees zero rows (deny-by-default)', async () => {
        const rows = await appSql`select id from products where id = ${productId}`;
        expect(rows.length).toBe(0);
    });

    it('kpos_app with the matching tenant context sees the row', async () => {
        // SET does not accept a bind parameter for its value (verified elsewhere
        // in this codebase — see set-tenant-context.ts) — .unsafe() + a
        // randomUUID()-generated literal is safe here, same as production.
        await appSql.unsafe(`SET app.current_tenant_id = '${tenantAId}'`);
        const rows = await appSql`select id from products where id = ${productId}`;
        expect(rows.length).toBe(1);
        await appSql`RESET ALL`;
    });

    it('kpos_app with a DIFFERENT tenant context sees zero rows, even with no WHERE clause at all', async () => {
        // This is the actual defense-in-depth proof: a query that forgot its
        // application-layer tenant filter entirely must still come back empty.
        await appSql.unsafe(`SET app.current_tenant_id = '${tenantBId}'`);
        const rows = await appSql`select id from products`;
        expect(rows.find((r) => r.id === productId)).toBeUndefined();
        await appSql`RESET ALL`;
    });

    it('superuser (kpos, migration role) bypasses RLS regardless of context', async () => {
        const rows = await superSql`select id from products where id = ${productId}`;
        expect(rows.length).toBe(1);
    });
});
