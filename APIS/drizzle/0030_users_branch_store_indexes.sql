-- Found during a 10M-store/100K-branch/100B-user scale review: `users` had
-- an index on (tenant_id, email) only. Every branch-scoped staff/user list
-- query (staff, users, admin, branches modules) filters by tenant_id AND
-- branch_id (or store_id), but with no matching index Postgres bitmap-scans
-- every user row in the tenant via the email index, then filters branch_id
-- in memory. Verified live: listing one branch's staff took 8.8s at 2M
-- users in a single tenant (whole-tenant scan); with this index, 1.2ms.
CREATE INDEX IF NOT EXISTS "users_tenant_branch_idx" ON "users" USING btree ("tenant_id", "branch_id");
CREATE INDEX IF NOT EXISTS "users_tenant_store_idx" ON "users" USING btree ("tenant_id", "store_id");
