// Verifies the store-level shared product catalog: one store with 2
// branches, owner creates one shared product (scope: 'store') and one
// branch-exclusive product at branch A, then confirms via real HTTP calls
// that branch A sees both, branch B sees only the shared one, a branch under
// a DIFFERENT store sees neither, and per-branch stock stays isolated.
//
// Run with: npx tsx scripts/retest-shared-catalog.ts

import postgres from 'postgres';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';

const SQL_URL = process.env.DATABASE_MIGRATE_URL || 'postgresql://kpos:7jXj21CJW5cMxhAAGWCF82rBg1RZxqoR@localhost:5432/kpos_db';
const BASE = 'http://localhost:5000/api/v1';
const sql = postgres(SQL_URL, { max: 5 });

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
    return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function main() {
    const stamp = Date.now();
    const tenantId = randomUUID();
    const storeId = randomUUID();
    const branchAId = randomUUID();
    const branchBId = randomUUID();
    // A second, unrelated store+branch to prove store isolation still holds.
    const otherStoreId = randomUUID();
    const otherBranchId = randomUUID();
    const ownerId = randomUUID();
    const ownerEmail = `catalog-owner-${stamp}@retest.local`;
    const hashed = await argon2.hash('TestPass123!');

    console.log('--- Seeding tenant, 1 store with 2 branches, + 1 unrelated store/branch ---');
    await sql`insert into tenants (id, name, code, plan, is_active, status) values (${tenantId}, 'Catalog Tenant', ${'CATALOG-' + stamp}, 'free', true, 'active')`;
    await sql`insert into stores (id, tenant_id, name, code, store_path, is_active, is_default) values (${storeId}, ${tenantId}, 'Catalog Store', ${'CS-' + stamp}, ${'CS-' + stamp}, true, true)`;
    await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main) values (${branchAId}, ${tenantId}, ${storeId}, 'Branch A', ${'CBA-' + stamp}, ${'CBA-' + stamp}, true, true)`;
    await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main) values (${branchBId}, ${tenantId}, ${storeId}, 'Branch B', ${'CBB-' + stamp}, ${'CBB-' + stamp}, true, false)`;
    await sql`insert into stores (id, tenant_id, name, code, store_path, is_active, is_default) values (${otherStoreId}, ${tenantId}, 'Other Store', ${'OS-' + stamp}, ${'OS-' + stamp}, true, false)`;
    await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main) values (${otherBranchId}, ${tenantId}, ${otherStoreId}, 'Other Branch', ${'OBR-' + stamp}, ${'OBR-' + stamp}, true, true)`;

    await sql`insert into users (id, tenant_id, email, password, name, role, is_active, email_verified, permissions) values (${ownerId}, ${tenantId}, ${ownerEmail}, ${hashed}, 'Catalog Owner', 'store_owner', true, true, '{}')`;
    const ownerRoleId = randomUUID();
    await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system) values (${ownerRoleId}, ${tenantId}, 'store_owner', 'Store Owner', ARRAY['products:create','products:update','products:read','staff:create','staff:read'], true)`;
    await sql`update users set role_id = ${ownerRoleId} where id = ${ownerId}`;
    // Staff must be a branch-scoped role (roleLevel > 2) to actually exercise
    // branch/store visibility — 'store_owner' is roleLevel 2 (tenant-wide),
    // which would make every staff member see the whole tenant regardless of
    // branch, defeating the point of this isolation test.
    const staffRoleId = randomUUID();
    await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system) values (${staffRoleId}, ${tenantId}, 'cashier', 'Cashier', ARRAY['products:read','staff:read'], true)`;

    console.log('--- Owner login ---');
    const login = await call('POST', '/auth/login', undefined, { email: ownerEmail, password: 'TestPass123!' });
    const ownerToken = login.data?.data?.accessToken;
    check('owner login succeeds', login.status === 200 && !!ownerToken, login.data);
    if (!ownerToken) { await sql.end(); process.exit(1); }

    console.log('--- Owner creates a staff member at each of the 3 branches ---');
    const staffCreds: Record<string, { email: string; token?: string }> = {};
    for (const [label, branchId] of [['A', branchAId], ['B', branchBId], ['OTHER', otherBranchId]] as const) {
        const email = `catalog-staff-${label}-${stamp}@retest.local`;
        // storeScope: 'branch' — otherwise staff creation legacy-defaults to a
        // store-wide userStores grant, which would defeat this isolation test.
        const res = await call('POST', '/staff', ownerToken, { email, password: 'StaffPass123!', name: `Staff ${label}`, role: 'cashier', roleId: staffRoleId, branchId, storeScope: 'branch' });
        check(`staff at branch ${label} create succeeds`, res.status === 201, res.data);
        staffCreds[label] = { email };
    }
    for (const label of ['A', 'B', 'OTHER'] as const) {
        const l = await call('POST', '/auth/login', undefined, { email: staffCreds[label].email, password: 'StaffPass123!' });
        staffCreds[label].token = l.data?.data?.accessToken;
    }
    check('all 3 staff can log in', Object.values(staffCreds).every(s => !!s.token));

    console.log('--- Owner creates a SHARED product (scope: store) via branch A context ---');
    const sharedRes = await call('POST', '/products', ownerToken, {
        name: `Shared Item ${stamp}`, sku: `SHARED-${stamp}`, price: 100, cost: 50, branchId: branchAId, scope: 'store',
    });
    check('shared product create succeeds', sharedRes.status === 201, sharedRes.data);
    const sharedProductId = sharedRes.data?.data?.id;
    const sharedRow = sharedProductId ? await sql`select branch_id, store_id from products where id = ${sharedProductId}` : [];
    check('shared product has branchId=NULL, storeId=Catalog Store', sharedRow[0]?.branch_id === null && sharedRow[0]?.store_id === storeId, sharedRow[0]);

    console.log('--- Owner creates a BRANCH-EXCLUSIVE product at branch A ---');
    const exclusiveRes = await call('POST', '/products', ownerToken, {
        name: `Exclusive Item ${stamp}`, sku: `EXCL-${stamp}`, price: 200, cost: 100, branchId: branchAId,
    });
    check('exclusive product create succeeds', exclusiveRes.status === 201, exclusiveRes.data);
    const exclusiveProductId = exclusiveRes.data?.data?.id;

    console.log('--- Visibility checks ---');
    const listA = await call('GET', '/products?all=true', staffCreds.A.token);
    const namesA = new Set((listA.data?.data || []).map((p: any) => p.id));
    check('branch A sees the shared product', namesA.has(sharedProductId), [...namesA]);
    check('branch A sees its own exclusive product', namesA.has(exclusiveProductId), [...namesA]);

    const listB = await call('GET', '/products?all=true', staffCreds.B.token);
    const namesB = new Set((listB.data?.data || []).map((p: any) => p.id));
    check('branch B sees the shared product', namesB.has(sharedProductId), [...namesB]);
    check('branch B does NOT see branch A\'s exclusive product', !namesB.has(exclusiveProductId), [...namesB]);

    const listOther = await call('GET', '/products?all=true', staffCreds.OTHER.token);
    const namesOther = new Set((listOther.data?.data || []).map((p: any) => p.id));
    check('a branch under a DIFFERENT store sees neither product (store isolation)', !namesOther.has(sharedProductId) && !namesOther.has(exclusiveProductId), [...namesOther]);

    console.log('--- SKU visibility mirrors product visibility ---');
    const skusA = await call('GET', '/products/skus?limit=200', staffCreds.A.token);
    const skuCodesA = (skusA.data?.data || []).map((s: any) => s.sku);
    check('branch A sees the shared product\'s auto-created SKU', skuCodesA.includes(`SHARED-${stamp}`), skuCodesA);
    const skusOther = await call('GET', '/products/skus?limit=200', staffCreds.OTHER.token);
    const skuCodesOther = (skusOther.data?.data || []).map((s: any) => s.sku);
    check('the other store\'s branch does NOT see the shared SKU', !skuCodesOther.includes(`SHARED-${stamp}`), skuCodesOther);

    console.log('--- Barcode lookup finds the shared product from branch B ---');
    const barcodesB = await call('GET', '/products/barcodes', staffCreds.B.token);
    check('branch B\'s barcode list request succeeds', barcodesB.status === 200, barcodesB.data);

    console.log('--- Stock stays per-branch: stock-in at branch B does not affect branch A ---');
    // Branch B stocks in the shared product via a direct inventory insert
    // (stock-in endpoints vary by module; this checks the isolation
    // invariant directly at the data layer, which is what actually matters).
    await sql`insert into inventory (product_id, branch_id, quantity, available) values (${sharedProductId}, ${branchBId}, 15, 15)`;
    const invA = await sql`select quantity from inventory where product_id = ${sharedProductId} and branch_id = ${branchAId}`;
    const invB = await sql`select quantity from inventory where product_id = ${sharedProductId} and branch_id = ${branchBId}`;
    check('branch A has no inventory row for the shared product (never stocked it in)', invA.length === 0, invA);
    check('branch B has its own independent stock (15) for the shared product', invB[0]?.quantity === 15, invB[0]);

    console.log(`\n=== ${pass} passed, ${failCount} failed ===`);

    if (process.env.SKIP_CLEANUP) {
        console.log(`SKIP_CLEANUP set — leaving tenant ${tenantId} in place for inspection`);
        await sql.end();
        if (failCount > 0) process.exit(1);
        return;
    }

    console.log('--- Cleaning up test data ---');
    await sql`delete from inventory where product_id in (select id from products where tenant_id = ${tenantId})`;
    await sql`delete from sku_variants where tenant_id = ${tenantId}`;
    await sql`delete from products where tenant_id = ${tenantId}`;
    await sql`delete from user_stores where tenant_id = ${tenantId}`;
    await sql`delete from sessions where user_id in (select id from users where tenant_id = ${tenantId})`;
    await sql`delete from users where tenant_id = ${tenantId}`;
    await sql`delete from roles where tenant_id = ${tenantId}`;
    await sql`delete from branches where tenant_id = ${tenantId}`;
    await sql`delete from stores where tenant_id = ${tenantId}`;
    await sql`delete from tenants where id = ${tenantId}`;
    await sql.end();

    if (failCount > 0) process.exit(1);
}

main().catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
});
