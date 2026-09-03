import 'dotenv/config';
import postgres from 'postgres';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';

const sql = postgres(process.env.DATABASE_MIGRATE_URL!);
const tenantName = process.env.QA_TENANT_NAME || 'Retest Full Tenant';
const tenant = await sql`select id from tenants where name = ${tenantName} order by created_at desc limit 1`;
if (!tenant[0]) throw new Error('large retest tenant not found');
const stores = await sql`select id from stores where tenant_id = ${tenant[0].id} order by created_at asc limit 1`;
const branch = await sql`select id from branches where tenant_id = ${tenant[0].id} and store_id = ${stores[0].id} order by created_at asc limit 1`;
if (!stores[0] || !branch[0]) throw new Error('large retest store/branch not found');

const stamp = Date.now();
const email = `qa-manager-${stamp}@retest.local`;
const password = 'ManagerPass123!';
const roleId = randomUUID();
const userId = randomUUID();
const roleName = `qa_store_manager_${stamp}`;
const permissions = ['dashboard:view', 'staff:view', 'staff:read', 'staff:update', 'inventory:view', 'inventory:update', 'sales:view', 'reports:view'];

await sql`insert into roles (id, tenant_id, name, display_name, permissions, is_system, level)
           values (${roleId}, ${tenant[0].id}, ${roleName}, 'QA Store Manager', ${permissions}, false, 4)`;
await sql`insert into users (id, tenant_id, email, password, name, role, role_id, branch_id, store_id, is_active, email_verified, requires_shift, permissions)
           values (${userId}, ${tenant[0].id}, ${email}, ${await argon2.hash(password)}, 'QA Store Manager', ${roleName}, ${roleId}, ${branch[0].id}, ${stores[0].id}, true, true, false, '{}')`;
await sql`insert into user_stores (id, tenant_id, user_id, store_id, branch_id, is_default, can_read, can_write, can_delete, can_manage)
           values (${randomUUID()}, ${tenant[0].id}, ${userId}, ${stores[0].id}, null, true, true, true, false, true)`;

console.log(JSON.stringify({ email, password, tenantId: tenant[0].id, storeId: stores[0].id, branchId: branch[0].id }));
await sql.end();
