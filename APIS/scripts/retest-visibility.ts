// Manual end-to-end verification for the SKU / category / staff visibility
// fixes, run against the real HTTP API (not mocked). Seeds a tenant + branch
// + 2 stores directly via SQL (fast, deterministic), then drives everything
// else — owner login, category/product/staff creation, and visibility checks
// for 10 branch staff — through the actual Express routes so real middleware
// (authenticate, branchFilter, RLS) is exercised.
//
// Run with: npx tsx scripts/retest-visibility.ts

import postgres from 'postgres';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';

const SQL_URL = process.env.DATABASE_MIGRATE_URL || 'postgresql://kpos:olxguCDmxmoReDcxcR2xLTZ30leimP1Y@localhost:5432/kpos_db';
const BASE = 'http://localhost:5000/api/v1';

const sql = postgres(SQL_URL, { max: 1 });

let pass = 0;
let failCount = 0;
function check(label: string, ok: boolean, detail?: any) {
    if (ok) {
        pass++;
        console.log(`  OK   ${label}`);
    } else {
        failCount++;
        console.log(`  FAIL ${label}`, detail !== undefined ? JSON.stringify(detail) : '');
    }
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

async function main() {
    const stamp = Date.now();
    const tenantId = randomUUID();
    const storeId = randomUUID();
    const branchId = randomUUID();
    const ownerId = randomUUID();
    const ownerEmail = `owner-${stamp}@retest.local`;
    const ownerPassword = 'TestPass123!';
    const hashed = await argon2.hash(ownerPassword);

    // Hierarchy is Tenant → Store → Branch (store is the top-level tier —
    // the "brand"/business-unit; branch is the physical outlet under it).
    console.log('--- Seeding tenant/store/branch/owner directly via SQL ---');
    await sql`insert into tenants (id, name, code, plan, is_active, status) values (${tenantId}, 'Retest Tenant', ${'RETEST-' + stamp}, 'free', true, 'active')`;
    await sql`insert into stores (id, tenant_id, name, code, store_path, is_active, is_default) values (${storeId}, ${tenantId}, 'Retest Store', ${'RS-' + stamp}, ${'RS-' + stamp}, true, true)`;
    await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main) values (${branchId}, ${tenantId}, ${storeId}, 'Retest Branch', ${'RB-' + stamp}, ${'RB-' + stamp}, true, true)`;

    // Owner: tenantId set, but deliberately NO branchId and NO userStores row —
    // this is exactly the precondition the visibility bugs required (owner
    // with no unambiguous default store/branch context).
    await sql`insert into users (id, tenant_id, email, password, name, role, is_active, email_verified, permissions)
               values (${ownerId}, ${tenantId}, ${ownerEmail}, ${hashed}, 'Retest Owner', 'store_owner', true, true, '{}')`;

    // Minimal store_owner role so authorize() checks pass.
    const existingRole = await sql`select id from roles where name = 'store_owner' and tenant_id = ${tenantId}`;
    if (existingRole.length === 0) {
        await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system)
                   values (${randomUUID()}, ${tenantId}, 'store_owner', 'Store Owner',
                   ARRAY['products:create','products:update','products:delete','products:read',
                         'categories:create','categories:update','categories:delete','categories:read',
                         'staff:create','staff:read','staff:update'], true)`;
    }
    await sql`update users set role_id = (select id from roles where name='store_owner' and tenant_id=${tenantId}) where id = ${ownerId}`;

    // A 'staff' role must actually exist for this tenant now — permissions no
    // longer materialize from a bare role-name string (see auth.middleware.ts
    // loadCachedAuthUser / resolveAssignableRole). Staff created below pass
    // role: 'staff', which resolveAssignableRole resolves against this row.
    await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system)
               values (${randomUUID()}, ${tenantId}, 'staff', 'Staff', ARRAY['pos:access','sales:create'], true)`;

    console.log('--- Logging in as owner ---');
    const login = await call('POST', '/auth/login', undefined, { email: ownerEmail, password: ownerPassword });
    check('owner login succeeds', login.status === 200, login.data);
    const ownerToken = login.data?.data?.accessToken;
    if (!ownerToken) {
        console.error('Cannot continue without owner token');
        console.error(JSON.stringify(login.data));
        await sql.end();
        process.exit(1);
    }

    // ── Fix #2: category with no storeId resolvable (owner has no branch/store) ──
    console.log('--- Creating category as owner (no storeId/branchId in body) ---');
    const catRes = await call('POST', '/categories', ownerToken, { name: `Drinks-${stamp}` });
    check('category create succeeds', catRes.status === 201, catRes.data);
    const categoryId = catRes.data?.data?.id;
    const catRow = categoryId ? await sql`select store_id from categories where id = ${categoryId}` : [];
    console.log(`  (category storeId in DB: ${catRow[0]?.store_id ?? 'NULL'})`);

    // ── Fix #1: product + auto-SKU tenantId ──
    console.log('--- Creating product (with SKU) as owner, explicit branchId ---');
    const prodRes = await call('POST', '/products', ownerToken, {
        name: `Cola-${stamp}`, sku: `COLA-${stamp}`, price: 10, cost: 5, branchId, categoryId,
    });
    check('product create succeeds', prodRes.status === 201, prodRes.data);
    const productId = prodRes.data?.data?.id;
    const skuRow = productId ? await sql`select tenant_id from sku_variants where product_id = ${productId}` : [];
    check('auto-created SKU has tenant_id set', !!skuRow[0]?.tenant_id, skuRow[0]);

    // ── Fix #3: create 10 staff in the same branch, no storeId passed ──
    console.log('--- Creating 10 staff members in the same branch/store as owner ---');
    const staffCreds: { email: string; token?: string; id?: string }[] = [];
    for (let i = 1; i <= 10; i++) {
        const email = `staff${i}-${stamp}@retest.local`;
        const res = await call('POST', '/staff', ownerToken, {
            email, password: 'StaffPass123!', name: `Staff ${i}`, role: 'staff', branchId,
        });
        check(`staff #${i} create succeeds`, res.status === 201, res.data);
        staffCreds.push({ email, id: res.data?.data?.id });
    }

    // Verify every created staff got a userStores row (the actual fix).
    const staffIds = staffCreds.map(s => s.id).filter(Boolean);
    const usRows = await sql`select user_id from user_stores where user_id = any(${staffIds})`;
    check('all 10 staff have a userStores row', usRows.length === 10, { got: usRows.length });

    console.log('--- Logging in as each staff member and checking product/category visibility ---');
    for (const s of staffCreds) {
        const l = await call('POST', '/auth/login', undefined, { email: s.email, password: 'StaffPass123!' });
        s.token = l.data?.data?.accessToken;
    }
    check('all 10 staff can log in', staffCreds.every(s => !!s.token));

    // Pick 3 staff to run full visibility checks (all 10 would be redundant HTTP calls).
    for (const s of staffCreds.slice(0, 3)) {
        const catList = await call('GET', '/categories', s.token);
        const catNames = (catList.data?.data || []).map((c: any) => c.name);
        check(`${s.email}: sees owner-created category`, catNames.includes(`Drinks-${stamp}`), catNames);

        const skuList = await call('GET', '/products/skus', s.token);
        const skuCodes = (skuList.data?.data || []).map((v: any) => v.sku);
        check(`${s.email}: sees owner-created SKU`, skuCodes.includes(`COLA-${stamp}`), skuCodes);
    }

    // Staff visibility (the "owner can't see the staff they just created" bug)
    // is checked from the OWNER's dashboard view — a plain 'staff' role has no
    // staff:read permission by design (least privilege), so peer-to-peer staff
    // list checks would fail on RBAC, not on the visibility bug being tested.
    console.log('--- Checking owner sees all 10 staff in the dashboard staff list ---');
    const ownerStaffList = await call('GET', '/staff', ownerToken);
    const ownerVisibleEmails = (ownerStaffList.data?.data || []).map((u: any) => u.email);
    const ownerSeesAll = staffCreds.every(s => ownerVisibleEmails.includes(s.email));
    check('owner sees all 10 newly created staff in /staff list', ownerSeesAll, ownerVisibleEmails);

    for (const s of staffCreds.slice(0, 3)) {
        const detail = await call('GET', `/staff/${s.id}`, ownerToken);
        check(`owner can fetch staff detail for ${s.email} (no 403)`, detail.status === 200, detail.data);
    }

    console.log(`\n=== ${pass} passed, ${failCount} failed ===`);

    console.log('--- Cleaning up test data ---');
    // No DB-level FK cascades tie these tables to tenants, so clean up explicitly.
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
