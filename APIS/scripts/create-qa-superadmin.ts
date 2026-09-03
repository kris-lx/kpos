import 'dotenv/config';
import postgres from 'postgres';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';

const sql = postgres(process.env.DATABASE_MIGRATE_URL!);
const email = `qa-super-${Date.now()}@retest.local`;
const password = 'TestPass123!';

const role = await sql`select id from roles where tenant_id is null and name = 'super_admin' limit 1`;
if (!role[0]) throw new Error('global super_admin role missing');

await sql`insert into users (id, tenant_id, email, password, name, role, role_id, is_super_admin, is_active, email_verified, permissions)
           values (${randomUUID()}, null, ${email}, ${await argon2.hash(password)}, 'QA Super Admin', 'super_admin', ${role[0].id}, true, true, true, ARRAY['*'])`;

console.log(JSON.stringify({ email, password }));
await sql.end();
