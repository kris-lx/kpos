-- Missing indexes on the highest-write-volume tables, found during a
-- scale/performance review. These tables are filtered by branch_id,
-- created_at, status, and (for transaction_items) tenant_id in virtually
-- every route already in production — without these indexes, every one of
-- those queries degrades to a sequential scan as the tables grow, and
-- FORCE ROW LEVEL SECURITY means every query already implicitly filters by
-- tenant_id even when the caller doesn't ask for it.

-- transactions: the busiest table in the system (one row per sale). Reports/
-- sales routes filter by tenant+branch+date range+status constantly.
CREATE INDEX IF NOT EXISTS "transactions_branch_created_idx" ON "transactions" USING btree ("branch_id", "created_at");
CREATE INDEX IF NOT EXISTS "transactions_tenant_status_idx" ON "transactions" USING btree ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "transactions_user_idx" ON "transactions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "transactions_customer_idx" ON "transactions" USING btree ("customer_id");

-- transaction_items: grows even faster than transactions (multiple rows per
-- sale). Had ONLY a primary key — no tenant_id index at all despite FORCE
-- RLS filtering every query by it, no transaction_id index despite being
-- the join key back to the parent sale on every report, no product_id
-- index despite being the join key for every product-sales report.
CREATE INDEX IF NOT EXISTS "transaction_items_tenant_idx" ON "transaction_items" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "transaction_items_transaction_idx" ON "transaction_items" USING btree ("transaction_id");
CREATE INDEX IF NOT EXISTS "transaction_items_product_idx" ON "transaction_items" USING btree ("product_id");

-- stock_movements: the audit trail for every inventory change. Filtered by
-- branch_id+created_at in inventory/reports routes; product_id is the join
-- key for per-product movement history.
CREATE INDEX IF NOT EXISTS "stock_movements_branch_created_idx" ON "stock_movements" USING btree ("branch_id", "created_at");
CREATE INDEX IF NOT EXISTS "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id");

-- inventory: branch-scoped stock listing ("all stock at this branch") isn't
-- covered by the existing (product_id, branch_id, ...) unique index since
-- branch_id isn't the leading column there.
CREATE INDEX IF NOT EXISTS "inventory_branch_idx" ON "inventory" USING btree ("branch_id");

-- sessions: user_id is needed to invalidate/list a user's sessions;
-- revoked_at backs the periodic cleanup job's
-- `WHERE revoked_at IS NOT NULL AND revoked_at < cutoff` query, which was
-- doing a full table scan.
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_revoked_idx" ON "sessions" USING btree ("revoked_at") WHERE "revoked_at" IS NOT NULL;
