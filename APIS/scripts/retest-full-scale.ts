// Large-scale, full-functionality retest: roles/rules/permissions, staff,
// categories, products/SKUs, members (customers), and loyalty points earn/
// redeem — all driven through the real HTTP API across multiple branches
// with concurrent staff, to catch cross-branch scoping bugs the way the
// SKU/product leak was caught in retest-visibility-scale.ts.
//
// Run with: npx tsx scripts/retest-full-scale.ts

import postgres from 'postgres';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';

const SQL_URL = process.env.DATABASE_MIGRATE_URL || 'postgresql://kpos:olxguCDmxmoReDcxcR2xLTZ30leimP1Y@localhost:5432/kpos_db';
const BASE = 'http://localhost:5000/api/v1';

// Hierarchy is Tenant → Store → Branch (store = brand/business-unit tier,
// branch = physical outlet under it). One store per branch below, so
// BRANCH_COUNT also means BRANCH_COUNT distinct top-level stores — enough to
// test real multi-store staff assignment (one user, 2 different stores).
const BRANCH_COUNT = 3;
const PRODUCTS_PER_BRANCH = 10;
const CASHIERS_PER_BRANCH = 20; // => 60 cashiers total
const MEMBERS_PER_BRANCH = 20;  // => 60 members total

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
    await sql`insert into tenants (id, name, code, plan, is_active, status) values (${tenantId}, 'Retest Full Tenant', ${'RETESTFULL-' + stamp}, 'free', true, 'active')`;

    const branches: { id: string; name: string; storeId: string }[] = [];
    for (let b = 0; b < BRANCH_COUNT; b++) {
        const storeId = randomUUID();
        const branchId = randomUUID();
        branches.push({ id: branchId, name: `Branch-${b}`, storeId });
        await sql`insert into stores (id, tenant_id, name, code, store_path, is_active, is_default)
                   values (${storeId}, ${tenantId}, ${'Store ' + b}, ${'ST' + b + '-' + stamp}, ${'ST' + b + '-' + stamp}, true, ${b === 0})`;
        await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main)
                   values (${branchId}, ${tenantId}, ${storeId}, ${'Branch ' + b}, ${'BR' + b + '-' + stamp}, ${'BR' + b + '-' + stamp}, true, ${b === 0})`;
    }

    // Owner: tenant-level, no branch/store assignment (same precondition as the other retest scripts).
    await sql`insert into users (id, tenant_id, email, password, name, role, is_active, email_verified, permissions)
               values (${ownerId}, ${tenantId}, ${ownerEmail}, ${hashed}, 'Retest Owner', 'store_owner', true, true, '{}')`;
    const ownerRoleId = randomUUID();
    await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system)
               values (${ownerRoleId}, ${tenantId}, 'store_owner', 'Store Owner',
               ARRAY['products:create','products:update','products:delete','products:read',
                     'categories:create','categories:update','categories:delete','categories:read',
                     'staff:create','staff:read','staff:update',
                     'customers:create','customers:update','sales:create','settings:update'], true)`;
    await sql`update users set role_id = ${ownerRoleId} where id = ${ownerId}`;

    console.log('--- Logging in as owner ---');
    const login = await call('POST', '/auth/login', undefined, { email: ownerEmail, password: ownerPassword });
    check('owner login succeeds', login.status === 200, login.data);
    const ownerToken = login.data?.data?.accessToken;
    if (!ownerToken) { console.error('no owner token, aborting'); await sql.end(); process.exit(1); }

    // ── Roles / rules / permissions: create a custom "cashier" role via the admin API ──
    console.log('--- Owner creates a custom "cashier" role via POST /admin/roles ---');
    const cashierPerms = ['sales:create', 'customers:create', 'customers:update', 'products:view'];
    const roleRes = await call('POST', '/admin/roles', ownerToken, {
        name: `cashier-${stamp}`, displayName: 'Cashier', description: 'POS checkout + member signup', permissions: cashierPerms,
    });
    check('custom role create succeeds', roleRes.status === 201, roleRes.data);
    const cashierRoleId = roleRes.data?.data?.id;

    // ── Enable loyalty program (needs settings:update, granted to owner above) ──
    console.log('--- Owner enables loyalty program via PUT /customers/loyalty/settings ---');
    const loyaltyRes = await call('PUT', '/customers/loyalty/settings', ownerToken, {
        enabled: true, pointsPerAmount: 1, amountPerPoint: 100, pointValue: 1,
        minPointsRedeem: 0, maxPointsRedeem: 0, pointExpiryDays: 365, noExpiry: false,
    });
    check('loyalty settings save succeeds', loyaltyRes.status === 200, loyaltyRes.data);

    console.log('--- Owner creates 3 tenant-global categories (no store/branch) ---');
    const categoryNames: string[] = [];
    let firstCategoryId: string | undefined;
    for (let c = 0; c < 3; c++) {
        const name = `Cat-${c}-${stamp}`;
        const res = await call('POST', '/categories', ownerToken, { name });
        check(`category ${c} create succeeds`, res.status === 201, res.data);
        categoryNames.push(name);
        if (c === 0) firstCategoryId = res.data?.data?.id;
    }

    console.log(`--- Concurrently creating ${PRODUCTS_PER_BRANCH} products/SKUs per branch (${BRANCH_COUNT * PRODUCTS_PER_BRANCH} total) ---`);
    const productJobs: { branchId: string; branchIdx: number; idx: number }[] = [];
    branches.forEach((br, bi) => { for (let p = 0; p < PRODUCTS_PER_BRANCH; p++) productJobs.push({ branchId: br.id, branchIdx: bi, idx: p }); });
    // price = 1000 flat so loyalty math is easy to verify by hand: earn = floor(totalAmount / 100)
    const productIdsByBranch: string[][] = branches.map(() => []);
    const productResults = await pAllLimit(productJobs, 15, async (job) => {
        const sku = `SKU-${job.branchIdx}-${job.idx}-${stamp}`;
        const res = await call('POST', '/products', ownerToken, {
            name: `Product-${job.branchIdx}-${job.idx}`, sku, price: 1000, cost: 500, branchId: job.branchId, categoryId: firstCategoryId,
        });
        if (res.status === 201) productIdsByBranch[job.branchIdx].push(res.data.data.id);
        return res;
    });
    check(`all ${productJobs.length} products created`, productResults.every(r => r.status === 201), { failed: productResults.filter(r => r.status !== 201).length });

    console.log(`--- Concurrently creating ${CASHIERS_PER_BRANCH} cashiers per branch (${BRANCH_COUNT * CASHIERS_PER_BRANCH} total), custom role, no storeId passed ---`);
    const staffJobs: { branchId: string; branchIdx: number; idx: number }[] = [];
    branches.forEach((br, bi) => { for (let s = 0; s < CASHIERS_PER_BRANCH; s++) staffJobs.push({ branchId: br.id, branchIdx: bi, idx: s }); });
    const cashiers: { email: string; id?: string; branchIdx: number; token?: string }[] = [];
    const tStaff0 = Date.now();
    const staffResults = await pAllLimit(staffJobs, 15, async (job) => {
        const email = `cashier-b${job.branchIdx}-${job.idx}-${stamp}@retest.local`;
        const res = await call('POST', '/staff', ownerToken, {
            email, password: 'CashierPass123!', name: `Cashier B${job.branchIdx}-${job.idx}`,
            role: `cashier-${stamp}`, roleId: cashierRoleId, branchId: job.branchId,
        });
        cashiers.push({ email, id: res.data?.data?.id, branchIdx: job.branchIdx });
        return res;
    });
    check(`all ${staffJobs.length} cashiers created`, staffResults.every(r => r.status === 201), { failed: staffResults.filter(r => r.status !== 201).length, sample: staffResults.find(r => r.status !== 201)?.data });
    console.log(`  (${staffJobs.length} cashiers created in ${Date.now() - tStaff0}ms)`);

    console.log('--- Verifying custom role permissions are actually enforced (spot check via /auth/me) ---');
    for (const c of cashiers.slice(0, 2)) {
        const l = await call('POST', '/auth/login', undefined, { email: c.email, password: 'CashierPass123!' });
        c.token = l.data?.data?.accessToken;
        const me = await call('GET', '/auth/me', c.token);
        const perms: string[] = me.data?.data?.permissions || [];
        check(`${c.email}: has exactly the custom cashier role's permissions`, cashierPerms.every(p => perms.includes(p)), perms);
    }

    // ── Members (customers), created BY the cashiers (exercises the custom role's customers:create permission) ──
    console.log(`--- Concurrently creating ${MEMBERS_PER_BRANCH} members per branch (${BRANCH_COUNT * MEMBERS_PER_BRANCH} total), via each branch's cashier ---`);
    const memberJobs: { branchIdx: number; idx: number }[] = [];
    branches.forEach((_br, bi) => { for (let m = 0; m < MEMBERS_PER_BRANCH; m++) memberJobs.push({ branchIdx: bi, idx: m }); });
    const members: { name: string; id?: string; branchIdx: number }[] = [];
    const tMember0 = Date.now();

    // Log in one cashier per branch to create that branch's members.
    const branchCreatorTokens: string[] = [];
    for (let bi = 0; bi < branches.length; bi++) {
        const creator = cashiers.find(c => c.branchIdx === bi)!;
        const l = await call('POST', '/auth/login', undefined, { email: creator.email, password: 'CashierPass123!' });
        branchCreatorTokens[bi] = l.data?.data?.accessToken;
    }
    check('per-branch member-creator cashiers can log in', branchCreatorTokens.every(t => !!t));

    const memberResults = await pAllLimit(memberJobs, 15, async (job) => {
        const name = `Member-B${job.branchIdx}-${job.idx}-${stamp}`;
        const res = await call('POST', '/customers', branchCreatorTokens[job.branchIdx], { name });
        if (res.status === 201) members.push({ name, id: res.data.data.id, branchIdx: job.branchIdx });
        return res;
    });
    check(`all ${memberJobs.length} members created`, memberResults.every(r => r.status === 201), { failed: memberResults.filter(r => r.status !== 201).length, sample: memberResults.find(r => r.status !== 201)?.data });
    console.log(`  (${memberJobs.length} members created in ${Date.now() - tMember0}ms)`);

    console.log('--- Cross-branch check: cashier in branch B does NOT see members created in another branch ---');
    for (let bi = 0; bi < branches.length; bi++) {
        const token = branchCreatorTokens[bi];
        const listRes = await call('GET', '/customers?limit=200', token);
        const seenNames = new Set((listRes.data?.data || []).map((c: any) => c.name));
        const ownBranchAllPresent = members.filter(m => m.branchIdx === bi).every(m => seenNames.has(m.name));
        check(`branch ${bi} cashier sees all ${MEMBERS_PER_BRANCH} of their own branch's members`, ownBranchAllPresent);
        const otherBranchLeaked = members.some(m => m.branchIdx !== bi && seenNames.has(m.name));
        check(`branch ${bi} cashier does NOT see other branches' members`, !otherBranchLeaked);
    }

    console.log('--- Owner dashboard sees all members across all branches ---');
    const ownerCustList = await call('GET', '/customers?limit=200', ownerToken);
    const ownerSeenNames = new Set((ownerCustList.data?.data || []).map((c: any) => c.name));
    check('owner sees all 60 members', members.every(m => ownerSeenNames.has(m.name)), { total: ownerCustList.data?.data?.length });

    // ── Loyalty: earn then redeem, verified against the actual formula ──
    console.log('--- Loyalty: sample 1 member per branch — sale #1 (earn), sale #2 (redeem) ---');
    const AMOUNT_PER_POINT = 100, POINT_VALUE = 1, PRICE = 1000;
    for (let bi = 0; bi < branches.length; bi++) {
        const member = members.find(m => m.branchIdx === bi)!;
        const token = branchCreatorTokens[bi];
        const productId = productIdsByBranch[bi][0];

        const sale1 = await call('POST', '/sales', token, {
            items: [{ productId, quantity: 1 }], customerId: member.id, paymentMethod: 'CASH', payments: [],
        });
        check(`branch ${bi} member: sale #1 (earn) succeeds`, sale1.status === 201, sale1.data);
        const expectedEarn1 = Math.floor(PRICE / AMOUNT_PER_POINT); // = 10

        const custAfterSale1 = await sql`select points from customers where id = ${member.id}`;
        check(`branch ${bi} member: points after sale #1 = ${expectedEarn1}`, Number(custAfterSale1[0]?.points) === expectedEarn1, custAfterSale1[0]);

        const redeemPoints = 5;
        const sale2 = await call('POST', '/sales', token, {
            items: [{ productId, quantity: 1 }], customerId: member.id, paymentMethod: 'CASH', payments: [], pointsToRedeem: redeemPoints,
        });
        check(`branch ${bi} member: sale #2 (redeem ${redeemPoints}) succeeds`, sale2.status === 201, sale2.data);
        const expectedTotal2 = PRICE - redeemPoints * POINT_VALUE; // = 995
        const expectedEarn2 = Math.floor(expectedTotal2 / AMOUNT_PER_POINT); // = 9
        const expectedFinalPoints = expectedEarn1 - redeemPoints + expectedEarn2; // = 14

        const custAfterSale2 = await sql`select points from customers where id = ${member.id}`;
        check(`branch ${bi} member: final points = ${expectedFinalPoints} (earn ${expectedEarn1} - redeem ${redeemPoints} + earn ${expectedEarn2})`,
            Number(custAfterSale2[0]?.points) === expectedFinalPoints, custAfterSale2[0]);

        // created_at can tie within the same sale's transaction, so check the
        // multiset of entries rather than assuming a strict insertion order.
        const history = await sql`select type, points from points_history where customer_id = ${member.id}`;
        const earns = history.filter(h => h.type === 'EARN').map(h => h.points).sort((a, b) => a - b);
        const redeems = history.filter(h => h.type === 'REDEEM').map(h => h.points);
        check(`branch ${bi} member: pointsHistory has 2 EARN (9, 10) + 1 REDEEM (-5)`,
            history.length === 3 && earns.length === 2 && earns[0] === expectedEarn2 && earns[1] === expectedEarn1 && redeems.length === 1 && redeems[0] === -redeemPoints,
            history);
    }

    // ── RBAC redesign verification: bad role name is rejected, not silently granted ──
    console.log('--- Owner attempts to create staff with a role name that has no corresponding row ---');
    const badRoleRes = await call('POST', '/staff', ownerToken, {
        email: `badrole-${stamp}@retest.local`, password: 'Whatever123!', name: 'Bad Role Staff',
        role: `nonexistent-role-${stamp}`, branchId: branches[0].id,
    });
    check('staff create with unknown role name is rejected (400), not silently granted', badRoleRes.status === 400, badRoleRes.data);

    // ── RBAC redesign verification: cross-tenant rules/matrix ownership ──
    console.log('--- Seeding a second, unrelated tenant to verify cross-tenant rules ownership ---');
    const tenantBId = randomUUID();
    const ownerBId = randomUUID();
    const ownerBEmail = `ownerb-${stamp}@retest.local`;
    await sql`insert into tenants (id, name, code, plan, is_active, status) values (${tenantBId}, 'Retest Tenant B', ${'RETESTB-' + stamp}, 'free', true, 'active')`;
    await sql`insert into users (id, tenant_id, email, password, name, role, is_active, email_verified, permissions)
               values (${ownerBId}, ${tenantBId}, ${ownerBEmail}, ${hashed}, 'Retest Owner B', 'store_owner', true, true, '{}')`;
    const roleBId = randomUUID();
    await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system)
               values (${roleBId}, ${tenantBId}, 'cashier-b', 'Cashier B', ARRAY['sales:create'], false)`;
    await sql`update users set role_id = ${roleBId} where id = ${ownerBId}`;

    check(`tenant A's own role id resolved`, !!cashierRoleId);
    const putRulesRes = await call('PUT', `/admin/roles/${roleBId}/rules`, ownerToken, { rules: [] });
    check('PUT /admin/roles/:id/rules against another tenant\'s role is rejected', putRulesRes.status === 403 || putRulesRes.status === 404, putRulesRes.data);

    const matrixRes = await call('PUT', '/admin/rules/matrix', ownerToken, { matrix: { [roleBId]: {} } });
    check('PUT /admin/rules/matrix touching another tenant\'s role is rejected', matrixRes.status === 403, matrixRes.data);

    const copyRulesRes = await call('POST', `/admin/roles/${cashierRoleId}/copy-rules`, ownerToken, { sourceRoleId: roleBId });
    check('POST /admin/roles/:id/copy-rules with a source role from another tenant is rejected', copyRulesRes.status === 403 || copyRulesRes.status === 404, copyRulesRes.data);

    // Confirm tenant B's role rules are actually untouched by any of the above.
    const roleBRuleCount = await sql`select count(*) as c from role_rules where role_id = ${roleBId}`;
    check('tenant B\'s role_rules were never modified', Number(roleBRuleCount[0].c) === 0, roleBRuleCount[0]);

    // ── Multi-store assignment: one staff member assigned across 2 different
    // top-level stores (e.g. a regional/area staffer overseeing 2 brands) ──
    console.log('--- Creating a staff member with storeScope:"stores" and 2 explicit storeIds (different stores) ---');
    const multiStoreEmail = `multistore-${stamp}@retest.local`;
    const targetStoreIds = [branches[0].storeId, branches[1].storeId];
    const multiStoreRes = await call('POST', '/staff', ownerToken, {
        email: multiStoreEmail, password: 'MultiStore123!', name: 'Multi Store Staff',
        role: `cashier-${stamp}`, roleId: cashierRoleId, branchId: branches[0].id,
        storeScope: 'stores', storeIds: targetStoreIds,
    });
    check('multi-store staff create succeeds', multiStoreRes.status === 201, multiStoreRes.data);
    const multiStoreUserId = multiStoreRes.data?.data?.id;
    const multiStoreRows = multiStoreUserId ? await sql`select store_id, is_default from user_stores where user_id = ${multiStoreUserId}` : [];
    check(`multi-store staff has exactly ${targetStoreIds.length} userStores rows`, multiStoreRows.length === targetStoreIds.length, multiStoreRows);
    check('multi-store staff has exactly one isDefault row', multiStoreRows.filter(r => r.is_default).length === 1, multiStoreRows);

    console.log(`\n=== ${pass} passed, ${failCount} failed  (total wall time: ${Date.now() - t0}ms) ===`);

    if (process.env.SKIP_CLEANUP) {
        console.log(`SKIP_CLEANUP set — leaving tenant ${tenantId} in place for inspection`);
        await sql.end();
        if (failCount > 0) process.exit(1);
        return;
    }

    console.log('--- Cleaning up test data ---');
    await sql`delete from points_history where tenant_id = ${tenantId}`;
    await sql`delete from transaction_items where transaction_id in (select id from transactions where tenant_id = ${tenantId})`;
    await sql`delete from transaction_payments where transaction_id in (select id from transactions where tenant_id = ${tenantId})`;
    await sql`delete from stock_movements where tenant_id = ${tenantId}`;
    await sql`delete from transactions where tenant_id = ${tenantId}`;
    await sql`delete from inventory where product_id in (select id from products where tenant_id = ${tenantId})`;
    await sql`delete from customers where tenant_id = ${tenantId}`;
    await sql`delete from sku_variants where tenant_id = ${tenantId}`;
    await sql`delete from products where tenant_id = ${tenantId}`;
    await sql`delete from categories where tenant_id = ${tenantId}`;
    await sql`delete from user_stores where tenant_id = ${tenantId}`;
    await sql`delete from sessions where user_id in (select id from users where tenant_id = ${tenantId})`;
    await sql`delete from users where tenant_id = ${tenantId}`;
    await sql`delete from roles where tenant_id = ${tenantId}`;
    await sql`delete from stores where tenant_id = ${tenantId}`;
    await sql`delete from branches where tenant_id = ${tenantId}`;
    await sql`delete from settings where tenant_id = ${tenantId}`;
    await sql`delete from tenants where id = ${tenantId}`;

    await sql`delete from role_rules where role_id = ${roleBId}`;
    await sql`delete from sessions where user_id = ${ownerBId}`;
    await sql`delete from users where tenant_id = ${tenantBId}`;
    await sql`delete from roles where tenant_id = ${tenantBId}`;
    await sql`delete from tenants where id = ${tenantBId}`;
    await sql.end();

    if (failCount > 0) process.exit(1);
}

main().catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
});
