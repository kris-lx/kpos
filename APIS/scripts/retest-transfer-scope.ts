// Regression test for branch/store isolation on stock transfers: a
// branch-scoped user must not be able to move stock out of a branch they
// don't own, or across stores (a store is a separate brand/franchise unit).
// Covers both the immediate /inventory/transfer endpoint and the
// maker-checker /inventory/transfers create+approve flow.
import postgres from 'postgres';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';

const SQL_URL = process.env.DATABASE_MIGRATE_URL || 'postgresql://kpos:7jXj21CJW5cMxhAAGWCF82rBg1RZxqoR@localhost:5432/kpos_db';
const BASE = 'http://localhost:5000/api/v1';
const sql = postgres(SQL_URL, { max: 5 });

let pass = 0, failCount = 0;
function check(label: string, ok: boolean, detail?: any) {
    if (ok) { pass++; console.log(`  OK   ${label}`); }
    else { failCount++; console.log(`  FAIL ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}
async function call(method: string, path: string, token: string | undefined, body?: any) {
    const res = await fetch(`${BASE}${path}`, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function main() {
    const stamp = Date.now();
    const tenantId = randomUUID();
    const storeAId = randomUUID(), storeBId = randomUUID();
    const branchA1Id = randomUUID(), branchA2Id = randomUUID(), branchBId = randomUUID();
    const ownerId = randomUUID();
    const productId = randomUUID();
    const ownerEmail = `xfer-owner-${stamp}@retest.local`;
    const hashed = await argon2.hash('TestPass123!');

    console.log('--- Seed: tenant, store A (branch A1, A2), store B (branch B) ---');
    await sql`insert into tenants (id, name, code, plan, is_active, status) values (${tenantId}, 'Xfer T', ${'XT-' + stamp}, 'free', true, 'active')`;
    await sql`insert into stores (id, tenant_id, name, code, store_path, is_active, is_default) values (${storeAId}, ${tenantId}, 'Store A', ${'SA-' + stamp}, ${'SA-' + stamp}, true, true)`;
    await sql`insert into stores (id, tenant_id, name, code, store_path, is_active, is_default) values (${storeBId}, ${tenantId}, 'Store B', ${'SB-' + stamp}, ${'SB-' + stamp}, true, false)`;
    await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main) values (${branchA1Id}, ${tenantId}, ${storeAId}, 'A1', ${'BA1-' + stamp}, ${'BA1-' + stamp}, true, true)`;
    await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main) values (${branchA2Id}, ${tenantId}, ${storeAId}, 'A2', ${'BA2-' + stamp}, ${'BA2-' + stamp}, true, false)`;
    await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main) values (${branchBId}, ${tenantId}, ${storeBId}, 'B', ${'BB-' + stamp}, ${'BB-' + stamp}, true, true)`;
    await sql`insert into users (id, tenant_id, email, password, name, role, is_active, email_verified, permissions) values (${ownerId}, ${tenantId}, ${ownerEmail}, ${hashed}, 'Owner', 'store_owner', true, true, '{}')`;
    const ownerRoleId = randomUUID();
    await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system) values (${ownerRoleId}, ${tenantId}, 'store_owner', 'Store Owner', ARRAY['products:create','products:read','staff:create','inventory:transfer','inventory:update','inventory:adjust'], true)`;
    await sql`update users set role_id = ${ownerRoleId} where id = ${ownerId}`;
    await sql`insert into products (id, tenant_id, store_id, branch_id, name, sku, price, cost) values (${productId}, ${tenantId}, ${storeAId}, ${branchA1Id}, ${'Xfer Prod ' + stamp}, ${'XP-' + stamp}, 10, 5)`;
    await sql`insert into inventory (product_id, branch_id, quantity, available) values (${productId}, ${branchA1Id}, 50, 50)`;

    console.log('--- Owner login ---');
    const login = await call('POST', '/auth/login', undefined, { email: ownerEmail, password: 'TestPass123!' });
    const ownerToken = login.data?.data?.accessToken;
    check('owner login', login.status === 200 && !!ownerToken, login.data);

    console.log('--- Create branch-scoped staff at A1 (cashier, branch-only) ---');
    const cashierRoleId = randomUUID();
    await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system) values (${cashierRoleId}, ${tenantId}, 'cashier', 'Cashier', ARRAY['inventory:transfer','inventory:update','inventory:adjust','products:read'], true)`;
    const cashierEmail = `xfer-cashier-${stamp}@retest.local`;
    const staffRes = await call('POST', '/staff', ownerToken, { email: cashierEmail, password: 'StaffPass123!', name: 'Cashier A1', role: 'cashier', roleId: cashierRoleId, branchId: branchA1Id, storeScope: 'branch' });
    check('staff create at A1', staffRes.status === 201, staffRes.data);
    const cashierLogin = await call('POST', '/auth/login', undefined, { email: cashierEmail, password: 'StaffPass123!' });
    const cashierToken = cashierLogin.data?.data?.accessToken;
    check('cashier login', !!cashierToken);

    console.log('--- Immediate /inventory/transfer: cashier tries A2 -> A1 (not their branch) — should 403 ---');
    const badTransfer = await call('POST', '/inventory/transfer', cashierToken, { productId, fromBranchId: branchA2Id, toBranchId: branchA1Id, quantity: 5 });
    check('cross-branch-not-owned transfer rejected (403)', badTransfer.status === 403, badTransfer.data);

    console.log('--- Immediate /inventory/transfer: cashier A1 -> storeB branch (different store) — should 400 DIFFERENT_STORE ---');
    const crossStoreTransfer = await call('POST', '/inventory/transfer', cashierToken, { productId, fromBranchId: branchA1Id, toBranchId: branchBId, quantity: 5 });
    check('cross-store transfer rejected (400 DIFFERENT_STORE)', crossStoreTransfer.status === 400 && crossStoreTransfer.data?.error?.code === 'DIFFERENT_STORE', crossStoreTransfer.data);

    console.log('--- Immediate /inventory/transfer: cashier A1 -> A2 (same store, owns A1) — should succeed ---');
    const goodTransfer = await call('POST', '/inventory/transfer', cashierToken, { productId, fromBranchId: branchA1Id, toBranchId: branchA2Id, quantity: 5 });
    check('same-store owned-branch transfer succeeds', goodTransfer.status === 201, goodTransfer.data);

    console.log('--- Maker-checker /inventory/transfers: cashier creates A1->storeB (cross-store) — should 400 ---');
    const badMC = await call('POST', '/inventory/transfers', cashierToken, { productId, fromBranchId: branchA1Id, toBranchId: branchBId, quantity: 5 });
    check('maker-checker cross-store create rejected (400)', badMC.status === 400, badMC.data);

    console.log('--- Maker-checker /inventory/transfers: cashier creates A1->A2 (valid), then owner (level 2) approves ---');
    const mc = await call('POST', '/inventory/transfers', cashierToken, { productId, fromBranchId: branchA1Id, toBranchId: branchA2Id, quantity: 3 });
    check('maker-checker create succeeds', mc.status === 201, mc.data);
    const mcId = mc.data?.data?.id;
    const approveRes = await call('PATCH', `/inventory/transfers/${mcId}/approve`, ownerToken, {});
    check('owner (tenant-wide) approves the transfer', approveRes.status === 200, approveRes.data);

    console.log(`\n=== ${pass} passed, ${failCount} failed ===`);
    console.log('--- Cleaning up ---');
    await sql`delete from stock_movements where product_id = ${productId}`;
    await sql`delete from stock_transfer_items where transfer_id in (select id from stock_transfers where tenant_id = ${tenantId})`;
    await sql`delete from stock_transfers where tenant_id = ${tenantId}`;
    await sql`delete from inventory where product_id = ${productId}`;
    await sql`delete from products where id = ${productId}`;
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

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
