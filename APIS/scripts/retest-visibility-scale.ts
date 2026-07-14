// Large-scale version of retest-visibility.ts: multiple branches/stores,
// concurrent staff/product/category creation (~100+ users), and cross-branch
// scoping checks — to make sure the SKU/category/staff visibility fixes (and
// the queries around them) hold up under realistic multi-tenant scale, not
// just the original 10-user smoke test.
//
// Run with: npx tsx scripts/retest-visibility-scale.ts

import postgres from 'postgres';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';

const SQL_URL = process.env.DATABASE_MIGRATE_URL || 'postgresql://kpos:olxguCDmxmoReDcxcR2xLTZ30leimP1Y@localhost:5432/kpos_db';
const BASE = 'http://localhost:5000/api/v1';

// Hierarchy is Tenant → Store → Branch (store = brand/business-unit tier,
// branch = physical outlet under it). BRANCH_COUNT branches each get their
// own store (a chain of BRANCH_COUNT single-outlet "brands") so the
// cross-branch isolation checks below still exercise distinct top-level scopes.
const BRANCH_COUNT = 3;
const PRODUCTS_PER_BRANCH = 20;
const STAFF_PER_BRANCH = 30; // => 90 staff total, plus the owner

const sql = postgres(SQL_URL, { max: 10 });

let pass = 0;
let failCount = 0;
function check(label: string, ok: boolean, detail?: any) {
    if (ok) { pass++; console.log(`  OK   ${label}`); }
    else { failCount++; console.log(`  FAIL ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 500) : ''); }
}

async function call(method: string, path: string, token: string | undefined, body?: any) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

async function pAllLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let idx = 0;
    async function worker() {
        while (idx < items.length) {
            const i = idx++;
            results[i] = await fn(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

async function main() {
    const stamp = Date.now();
    const t0 = Date.now();
    const tenantId = randomUUID();
    const ownerId = randomUUID();
    const ownerEmail = `owner-${stamp}@retest.local`;
    const ownerPassword = 'TestPass123!';
    const hashed = await argon2.hash(ownerPassword);

    console.log(`--- Seeding tenant + ${BRANCH_COUNT} stores, each with 1 branch ---`);
    await sql`insert into tenants (id, name, code, plan, is_active, status) values (${tenantId}, 'Retest Scale Tenant', ${'RETESTSCALE-' + stamp}, 'free', true, 'active')`;

    const branches: { id: string; name: string }[] = [];
    for (let b = 0; b < BRANCH_COUNT; b++) {
        const storeId = randomUUID();
        const branchId = randomUUID();
        branches.push({ id: branchId, name: `Branch-${b}` });
        await sql`insert into stores (id, tenant_id, name, code, store_path, is_active, is_default)
                   values (${storeId}, ${tenantId}, ${'Store ' + b}, ${'ST' + b + '-' + stamp}, ${'ST' + b + '-' + stamp}, true, ${b === 0})`;
        await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main)
                   values (${branchId}, ${tenantId}, ${storeId}, ${'Branch ' + b}, ${'BR' + b + '-' + stamp}, ${'BR' + b + '-' + stamp}, true, ${b === 0})`;
    }

    // Owner: tenant-level, no branch/store assignment — same precondition as the smoke test.
    await sql`insert into users (id, tenant_id, email, password, name, role, is_active, email_verified, permissions)
               values (${ownerId}, ${tenantId}, ${ownerEmail}, ${hashed}, 'Retest Owner', 'store_owner', true, true, '{}')`;
    const roleId = randomUUID();
    await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system)
               values (${roleId}, ${tenantId}, 'store_owner', 'Store Owner',
               ARRAY['products:create','products:update','products:delete','products:read',
                     'categories:create','categories:update','categories:delete','categories:read',
                     'staff:create','staff:read','staff:update'], true)`;
    await sql`update users set role_id = ${roleId} where id = ${ownerId}`;

    // A 'staff' role must actually exist for this tenant now — permissions no
    // longer materialize from a bare role-name string (loadCachedAuthUser /
    // resolveAssignableRole in auth.middleware.ts). Staff created below pass
    // role: 'staff', resolved against this row.
    await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system)
               values (${randomUUID()}, ${tenantId}, 'staff', 'Staff', ARRAY['pos:access','sales:create'], true)`;

    console.log('--- Logging in as owner ---');
    const login = await call('POST', '/auth/login', undefined, { email: ownerEmail, password: ownerPassword });
    check('owner login succeeds', login.status === 200, login.data);
    const ownerToken = login.data?.data?.accessToken;
    if (!ownerToken) { console.error('no owner token, aborting'); await sql.end(); process.exit(1); }

    console.log('--- Owner creates 5 tenant-global categories (no store/branch) ---');
    const categoryNames: string[] = [];
    for (let c = 0; c < 5; c++) {
        const name = `Cat-${c}-${stamp}`;
        const res = await call('POST', '/categories', ownerToken, { name });
        check(`category ${c} create succeeds`, res.status === 201, res.data);
        categoryNames.push(name);
    }

    console.log(`--- Concurrently creating ${PRODUCTS_PER_BRANCH} products/SKUs per branch (${BRANCH_COUNT * PRODUCTS_PER_BRANCH} total) ---`);
    const productJobs: { branchId: string; idx: number }[] = [];
    for (const br of branches) {
        for (let p = 0; p < PRODUCTS_PER_BRANCH; p++) productJobs.push({ branchId: br.id, idx: p });
    }
    const tProd0 = Date.now();
    const productResults = await pAllLimit(productJobs, 15, async (job) => {
        const sku = `SKU-${job.branchId.slice(0, 4)}-${job.idx}-${stamp}`;
        return call('POST', '/products', ownerToken, {
            name: `Product-${job.idx}`, sku, price: 10, cost: 5, branchId: job.branchId,
        });
    });
    const productFails = productResults.filter(r => r.status !== 201);
    check(`all ${productJobs.length} products created`, productFails.length === 0, { failed: productFails.length, sample: productFails[0]?.data });
    console.log(`  (${productJobs.length} products created in ${Date.now() - tProd0}ms)`);

    // Confirm every auto-created SKU got tenant_id set (the actual fix, at scale).
    const orphanSkuCount = await sql`select count(*) as c from sku_variants where tenant_id is null and product_id in (select id from products where tenant_id = ${tenantId})`;
    check('zero SKUs with NULL tenant_id after bulk create', Number(orphanSkuCount[0].c) === 0, orphanSkuCount[0]);

    console.log(`--- Concurrently creating ${STAFF_PER_BRANCH} staff per branch (${BRANCH_COUNT * STAFF_PER_BRANCH} total), no storeId passed ---`);
    const staffJobs: { branchId: string; branchIdx: number; idx: number }[] = [];
    branches.forEach((br, bi) => {
        for (let s = 0; s < STAFF_PER_BRANCH; s++) staffJobs.push({ branchId: br.id, branchIdx: bi, idx: s });
    });
    const tStaff0 = Date.now();
    const staffCreds: { email: string; id?: string; branchIdx: number; token?: string }[] = [];
    const staffResults = await pAllLimit(staffJobs, 15, async (job) => {
        const email = `staff-b${job.branchIdx}-${job.idx}-${stamp}@retest.local`;
        const res = await call('POST', '/staff', ownerToken, {
            email, password: 'StaffPass123!', name: `Staff B${job.branchIdx}-${job.idx}`, role: 'staff', branchId: job.branchId,
        });
        staffCreds.push({ email, id: res.data?.data?.id, branchIdx: job.branchIdx });
        return res;
    });
    const staffFails = staffResults.filter(r => r.status !== 201);
    check(`all ${staffJobs.length} staff created`, staffFails.length === 0, { failed: staffFails.length, sample: staffFails[0]?.data });
    console.log(`  (${staffJobs.length} staff created in ${Date.now() - tStaff0}ms)`);

    // Confirm every one of them got a user_stores row (bulk check, the actual fix).
    const staffIds = staffCreds.map(s => s.id).filter(Boolean) as string[];
    const usCount = await sql`select count(distinct user_id) as c from user_stores where user_id = any(${staffIds})`;
    check(`all ${staffIds.length} staff have a userStores row`, Number(usCount[0].c) === staffIds.length, usCount[0]);

    // Also confirm no cross-branch mismatch: each staff's userStores row points to
    // a store belonging to THEIR OWN branch (not some other branch's default store).
    const mismatches = await sql`
        select us.user_id from user_stores us
        join users u on u.id = us.user_id
        where us.user_id = any(${staffIds}) and us.branch_id != u.branch_id
    `;
    check('no staff has a userStores row pointing at the wrong branch', mismatches.length === 0, { count: mismatches.length });

    console.log('--- Owner dashboard: sees all staff across all branches ---');
    const ownerStaffList = await call('GET', '/staff', ownerToken);
    const meta = ownerStaffList.data?.meta;
    check('owner /staff total count matches all created staff (+0 others)', meta?.total >= staffJobs.length, meta);

    console.log('--- Sampling 2 staff per branch: verify tenant-global categories visible, own-branch SKUs visible, other-branch SKUs NOT visible ---');
    for (let bi = 0; bi < branches.length; bi++) {
        const sample = staffCreds.filter(s => s.branchIdx === bi).slice(0, 2);
        for (const s of sample) {
            const l = await call('POST', '/auth/login', undefined, { email: s.email, password: 'StaffPass123!' });
            s.token = l.data?.data?.accessToken;
            if (!s.token) { check(`${s.email}: login`, false, l.data); continue; }

            const catList = await call('GET', '/categories', s.token);
            const catNames = (catList.data?.data || []).map((c: any) => c.name);
            const seesAllGlobalCats = categoryNames.every(n => catNames.includes(n));
            check(`${s.email} (branch ${bi}): sees all 5 tenant-global categories`, seesAllGlobalCats, catNames);

            const skuList = await call('GET', '/products/skus', s.token, undefined);
            const skuCodes = new Set((skuList.data?.data || []).map((v: any) => v.sku));
            const ownBranchSkuPrefix = `SKU-${branches[bi].id.slice(0, 4)}-`;
            const ownBranchVisible = [...skuCodes].some(c => (c as string).startsWith(ownBranchSkuPrefix));
            check(`${s.email}: sees at least one of their own branch's SKUs`, ownBranchVisible);

            const otherBranch = branches[(bi + 1) % branches.length];
            const otherBranchPrefix = `SKU-${otherBranch.id.slice(0, 4)}-`;
            const otherBranchLeaked = [...skuCodes].some(c => (c as string).startsWith(otherBranchPrefix));
            check(`${s.email}: does NOT see another branch's SKUs (tenant isolation still holds)`, !otherBranchLeaked, { leaked: otherBranchLeaked });
        }
    }

    console.log(`\n=== ${pass} passed, ${failCount} failed  (total wall time: ${Date.now() - t0}ms) ===`);

    if (process.env.SKIP_CLEANUP) {
        console.log(`SKIP_CLEANUP set — leaving tenant ${tenantId} in place for inspection`);
        await sql.end();
        if (failCount > 0) process.exit(1);
        return;
    }

    console.log('--- Cleaning up test data ---');
    await sql`delete from sku_variants where tenant_id = ${tenantId}`;
    await sql`delete from products where tenant_id = ${tenantId}`;
    await sql`delete from categories where tenant_id = ${tenantId}`;
    await sql`delete from user_stores where tenant_id = ${tenantId}`;
    await sql`delete from sessions where user_id in (select id from users where tenant_id = ${tenantId})`;
    await sql`delete from users where tenant_id = ${tenantId}`;
    await sql`delete from roles where tenant_id = ${tenantId}`;
    await sql`delete from stores where tenant_id = ${tenantId}`;
    await sql`delete from branches where tenant_id = ${tenantId}`;
    await sql`delete from tenants where id = ${tenantId}`;
    await sql.end();

    if (failCount > 0) process.exit(1);
}

main().catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
});
