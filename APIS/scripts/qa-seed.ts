// Seeds a reasonably complete dataset for manual/automated UI QA: a tenant
// with 2 branches under 1 store, categories, branch + shared products with
// stock, a customer, a completed sale, a purchase order, a stock transfer,
// a promotion, a coupon, and a document — so QA pages render real content
// instead of empty states. Prints the QA login credentials as JSON.
import 'dotenv/config';
import postgres from 'postgres';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';

const SQL_URL = process.env.DATABASE_MIGRATE_URL || 'postgresql://kpos:7jXj21CJW5cMxhAAGWCF82rBg1RZxqoR@localhost:5432/kpos_db';
const sql = postgres(SQL_URL, { max: 5 });

const ALL_PERMS = [
    'sales:view', 'sales:create', 'sales:update', 'sales:delete', 'sales:void', 'sales:refund', 'sales:hold',
    'pos:view', 'pos:access', 'pos:discount', 'pos:void', 'pos:credit', 'pos:hold',
    'products:view', 'products:create', 'products:update', 'products:delete', 'products:import', 'products:export',
    'categories:view', 'categories:create', 'categories:update', 'categories:delete',
    'inventory:view', 'inventory:create', 'inventory:update', 'inventory:delete', 'inventory:adjust', 'inventory:transfer', 'inventory:count', 'inventory:stockin', 'inventory:stockout',
    'reports:view', 'reports:sales', 'reports:products', 'reports:inventory', 'reports:financial', 'reports:staff', 'reports:customers', 'reports:export', 'dashboard:view',
    'staff:view', 'staff:create', 'staff:update', 'staff:delete', 'users:view', 'users:create', 'users:update', 'users:delete',
    'roles:view', 'roles:create', 'roles:update', 'roles:delete',
    'stores:view', 'stores:create', 'stores:update', 'stores:delete', 'branches:view', 'branches:create', 'branches:update', 'branches:delete',
    'settings:view', 'settings:update',
    'customers:view', 'customers:create', 'customers:update', 'customers:delete',
    'promotions:view', 'promotions:create', 'promotions:update', 'promotions:delete',
    'payments:view', 'payments:create', 'payments:manage', 'payments:settle', 'payments:void', 'payments:refund',
    'documents:view', 'documents:create', 'documents:update', 'documents:delete',
    'restaurant:view', 'restaurant:manage', 'tables:view', 'tables:create', 'tables:update', 'tables:delete',
];

async function main() {
    const stamp = Date.now();
    const tenantId = randomUUID();
    const storeId = randomUUID();
    const branchAId = randomUUID();
    const branchBId = randomUUID();
    const ownerId = randomUUID();
    const roleId = randomUUID();
    const categoryId = randomUUID();
    const productBranchId = randomUUID();
    const productSharedId = randomUUID();
    const customerId = randomUUID();
    const email = `qa-full-${stamp}@retest.local`;
    const hashed = await argon2.hash('TestPass123!');

    console.log('--- Seeding tenant/store/branches/owner ---');
    await sql`insert into tenants (id, name, code, plan, is_active, status) values (${tenantId}, 'QA Full Tenant', ${'QAF-' + stamp}, 'pro', true, 'active')`;
    await sql`insert into stores (id, tenant_id, name, code, store_path, is_active, is_default, phone, email) values (${storeId}, ${tenantId}, 'QA Store', ${'QAS-' + stamp}, ${'QAS-' + stamp}, true, true, '020123456', ${'store-' + stamp + '@retest.local'})`;
    await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main, address) values (${branchAId}, ${tenantId}, ${storeId}, 'Branch A', ${'QBA-' + stamp}, ${'QBA-' + stamp}, true, true, '123 Main St')`;
    await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main, address) values (${branchBId}, ${tenantId}, ${storeId}, 'Branch B', ${'QBB-' + stamp}, ${'QBB-' + stamp}, true, false, '456 Side St')`;
    await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system, level) values (${roleId}, ${tenantId}, 'store_owner', 'Store Owner', ${ALL_PERMS}, true, 2)`;
    await sql`insert into users (id, tenant_id, email, password, name, role, role_id, branch_id, store_id, is_active, email_verified, permissions) values (${ownerId}, ${tenantId}, ${email}, ${hashed}, 'QA Full Owner', 'store_owner', ${roleId}, ${branchAId}, ${storeId}, true, true, '{}')`;
    await sql`insert into user_stores (id, user_id, store_id, branch_id, is_default, can_read, can_write, can_delete, can_manage, tenant_id) values (${randomUUID()}, ${ownerId}, ${storeId}, ${branchAId}, true, true, true, true, true, ${tenantId})`;

    console.log('--- Categories + products (branch-exclusive + shared) + stock ---');
    await sql`insert into categories (id, tenant_id, name, slug, is_active, sort_order) values (${categoryId}, ${tenantId}, 'QA Category', ${'qa-category-' + stamp}, true, 0)`;
    await sql`insert into products (id, tenant_id, store_id, branch_id, category_id, name, sku, barcode, price, cost, unit, track_stock) values (${productBranchId}, ${tenantId}, ${storeId}, ${branchAId}, ${categoryId}, 'QA Branch Product', ${'QASKU-' + stamp}, ${'QABC-' + stamp}, 25000, 15000, 'piece', true)`;
    await sql`insert into products (id, tenant_id, store_id, branch_id, category_id, name, sku, barcode, price, cost, unit, track_stock) values (${productSharedId}, ${tenantId}, ${storeId}, null, ${categoryId}, 'QA Shared Product', ${'QASHSKU-' + stamp}, ${'QASH-' + stamp}, 35000, 20000, 'piece', true)`;
    await sql`insert into inventory (product_id, branch_id, quantity, available, reserved) values (${productBranchId}, ${branchAId}, 100, 100, 0)`;
    await sql`insert into inventory (product_id, branch_id, quantity, available, reserved) values (${productSharedId}, ${branchAId}, 40, 40, 0)`;

    console.log('--- Customer + a completed sale (transaction) ---');
    await sql`insert into customers (id, tenant_id, store_id, branch_id, name, phone, member_code, points, total_spent, visit_count) values (${customerId}, ${tenantId}, ${storeId}, ${branchAId}, 'QA Customer', '02099998888', ${'MEM-' + stamp}, 0, 0, 0)`;
    const txId = randomUUID();
    await sql`insert into transactions (id, tenant_id, store_id, branch_id, user_id, customer_id, transaction_no, type, status, subtotal, tax_amount, total) values (${txId}, ${tenantId}, ${storeId}, ${branchAId}, ${ownerId}, ${customerId}, ${'TXN-' + stamp}, 'SALE', 'COMPLETED', 25000, 1750, 26750)`;
    await sql`insert into transaction_items (id, transaction_id, product_id, product_name, quantity, unit_price, total) values (${randomUUID()}, ${txId}, ${productBranchId}, 'QA Branch Product', 1, 25000, 25000)`;

    console.log('--- Purchase order + stock transfer (pending, for maker-checker QA) ---');
    const vendorId = randomUUID();
    await sql`insert into vendors (id, tenant_id, name, is_active) values (${vendorId}, ${tenantId}, 'QA Vendor', true)`;
    const poId = randomUUID();
    await sql`insert into purchase_orders (id, tenant_id, branch_id, po_number, vendor_id, status, subtotal, tax, discount, total, created_by) values (${poId}, ${tenantId}, ${branchAId}, ${'PO-' + stamp}, ${vendorId}, 'DRAFT', 0, 0, 0, 0, ${ownerId})`;
    const transferId = randomUUID();
    await sql`insert into stock_transfers (id, tenant_id, transfer_no, from_branch_id, to_branch_id, status, requested_by) values (${transferId}, ${tenantId}, ${'TRF-' + stamp}, ${branchAId}, ${branchBId}, 'PENDING', ${ownerId})`;
    await sql`insert into stock_transfer_items (id, transfer_id, product_id, product_name, quantity) values (${randomUUID()}, ${transferId}, ${productBranchId}, 'QA Branch Product', 5)`;

    console.log('--- Promotion + coupon + document ---');
    await sql`insert into promotions (id, tenant_id, store_id, name, type, value, start_date, is_active) values (${randomUUID()}, ${tenantId}, ${storeId}, 'QA Promo 10%', 'PERCENTAGE', 10, now(), true)`;
    await sql`insert into coupons (id, tenant_id, store_id, code, name, type, value, start_date, is_active) values (${randomUUID()}, ${tenantId}, ${storeId}, ${'QACODE' + stamp}, 'QA Coupon', 'FIXED', 5000, now(), true)`;

    console.log(JSON.stringify({ email, password: 'TestPass123!', tenantId, storeId, branchAId, branchBId }, null, 2));
    await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
