// Seeds a tenant with a deliberately LOW-privilege custom role (only
// pos:access + sales:create, nothing else) to test whether menu/route
// gating actually restricts a real restricted user in the UI.
import 'dotenv/config';
import postgres from 'postgres';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';

const SQL_URL = process.env.DATABASE_MIGRATE_URL || 'postgresql://kpos:7jXj21CJW5cMxhAAGWCF82rBg1RZxqoR@localhost:5432/kpos_db';
const sql = postgres(SQL_URL, { max: 5 });

async function main() {
    const stamp = Date.now();
    const tenantId = randomUUID();
    const storeId = randomUUID();
    const branchId = randomUUID();
    const roleId = randomUUID();
    const userId = randomUUID();
    const categoryId = randomUUID();
    const productId = randomUUID();
    const email = `qa-restricted-${stamp}@retest.local`;
    const hashed = await argon2.hash('TestPass123!');

    await sql`insert into tenants (id, name, code, plan, is_active, status) values (${tenantId}, 'QA Restricted Tenant', ${'QAR-' + stamp}, 'free', true, 'active')`;
    await sql`insert into stores (id, tenant_id, name, code, store_path, is_active, is_default) values (${storeId}, ${tenantId}, 'QA Store', ${'QRS-' + stamp}, ${'QRS-' + stamp}, true, true)`;
    await sql`insert into branches (id, tenant_id, store_id, name, code, branch_path, is_active, is_main) values (${branchId}, ${tenantId}, ${storeId}, 'Branch A', ${'QRA-' + stamp}, ${'QRA-' + stamp}, true, true)`;
    // Custom role — deliberately minimal, created the same way the Roles UI would create it.
    await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system, level) values (${roleId}, ${tenantId}, ${'qa_cashier_' + stamp}, 'QA Restricted Cashier', ARRAY['pos:access','sales:create'], false, 5)`;
    await sql`insert into users (id, tenant_id, email, password, name, role, role_id, branch_id, store_id, is_active, email_verified, permissions) values (${userId}, ${tenantId}, ${email}, ${hashed}, 'QA Restricted User', ${'qa_cashier_' + stamp}, ${roleId}, ${branchId}, ${storeId}, true, true, '{}')`;
    await sql`insert into user_stores (id, user_id, store_id, branch_id, is_default, can_read, can_write, can_delete, can_manage, tenant_id) values (${randomUUID()}, ${userId}, ${storeId}, ${branchId}, true, true, true, false, false, ${tenantId})`;
    // Keep one sellable item in the restricted tenant so the negative POS
    // case reaches the shift guard instead of failing earlier on an empty
    // product grid.
    await sql`insert into categories (id, tenant_id, name, slug, is_active, sort_order) values (${categoryId}, ${tenantId}, 'QA Restricted Category', ${'qa-restricted-category-' + stamp}, true, 0)`;
    await sql`insert into products (id, tenant_id, store_id, branch_id, category_id, name, sku, barcode, price, cost, unit, track_stock) values (${productId}, ${tenantId}, ${storeId}, ${branchId}, ${categoryId}, 'QA Restricted Product', ${'QAR-SKU-' + stamp}, ${'QAR-BC-' + stamp}, 10000, 5000, 'piece', true)`;
    await sql`insert into inventory (product_id, branch_id, quantity, available, reserved) values (${productId}, ${branchId}, 10, 10, 0)`;

    console.log(JSON.stringify({ email, password: 'TestPass123!', tenantId, roleId }, null, 2));
    await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
