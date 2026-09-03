-- Found in the same 10M-store/100K-branch scale review as 0030: the main
-- GET /branches endpoint (level<=2 callers see the whole tenant, unscoped)
-- filters by (tenant_id, is_active) and sorts by name, with no LIMIT and no
-- covering index. Verified live: 405ms + an 8.5MB disk-spill sort at 100K
-- branches in one tenant, returning all rows unbounded. Paired with a
-- LIMIT 500 cap added in code, this index turns it into an index scan with
-- limit pushdown (0.9ms).
CREATE INDEX IF NOT EXISTS "branches_tenant_active_name_idx" ON "branches" USING btree ("tenant_id", "is_active", "name");
