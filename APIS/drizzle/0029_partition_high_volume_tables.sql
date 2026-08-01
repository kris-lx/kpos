-- Partitions transactions, transaction_items, and stock_movements by month
-- on created_at — the three highest-write-volume tables in the system
-- (see 0028_scale_indexes for the index-level half of this scale review).
-- No FK constraints reference any of these three tables (verified against
-- information_schema before writing this), which is what makes this
-- migration tractable without cross-table FK partition-alignment concerns.
--
-- Postgres requires the partition key to be part of every unique
-- constraint (including the primary key) on a partitioned table — that's
-- the one behavioral change here: transactions_tenant_no_idx becomes
-- UNIQUE(tenant_id, transaction_no, created_at) instead of just
-- (tenant_id, transaction_no). In practice transaction_no is already
-- date-derived at generation time, so a same-tenant collision across two
-- different months was already effectively impossible.
--
-- Safe for a table with existing rows: builds the new partitioned table
-- alongside the old one, copies every row, then swaps names inside a
-- transaction. The pre-partition table is renamed (not dropped) so it can
-- be inspected/dropped manually after verifying the swap — see the DROP
-- comment at the bottom.
--
-- Partition scheme: monthly RANGE partitions from 24 months before this
-- migration runs through 12 months after, plus a DEFAULT partition to
-- catch anything outside that window (older historical data, or clock
-- skew) so no insert or copied row is ever rejected. A scheduled job
-- (partition-maintenance, see infrastructure/workers/index.ts) extends
-- the window forward over time — Postgres does not create partitions
-- automatically.

-- ═══════════════════════════════════════════════════════════════════════════
-- Helper: create N months of RANGE partitions attached to `parent_table`,
-- named using `name_prefix` (kept separate from parent_table because during
-- this migration the parent is still named e.g. "transactions_new" at
-- partition-creation time, but partitions should be named "transactions_..."
-- to match their final, post-swap name rather than staying stuck with a
-- "_new" prefix forever).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION _kpos_create_monthly_partitions(
    parent_table text,
    name_prefix text,
    start_month date,
    months_count int
) RETURNS void AS $$
DECLARE
    i int;
    period_start date;
    period_end date;
    partition_name text;
BEGIN
    FOR i IN 0..(months_count - 1) LOOP
        period_start := start_month + (i || ' months')::interval;
        period_end := period_start + interval '1 month';
        partition_name := name_prefix || '_' || to_char(period_start, 'YYYY_MM');
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                partition_name, parent_table, period_start, period_end
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Re-usable maintenance entry point — call periodically (see the
-- partition-maintenance scheduled job) to keep partitions available ahead
-- of need. Idempotent: skips any partition that already exists. Uses the
-- final (post-migration) table names, since by the time this runs the
-- swap below has already happened.
CREATE OR REPLACE FUNCTION ensure_future_partitions(months_ahead int DEFAULT 6) RETURNS void AS $$
BEGIN
    PERFORM _kpos_create_monthly_partitions('transactions', 'transactions', date_trunc('month', now())::date, months_ahead + 1);
    PERFORM _kpos_create_monthly_partitions('transaction_items', 'transaction_items', date_trunc('month', now())::date, months_ahead + 1);
    PERFORM _kpos_create_monthly_partitions('stock_movements', 'stock_movements', date_trunc('month', now())::date, months_ahead + 1);
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. transactions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE transactions_new (LIKE transactions INCLUDING DEFAULTS) PARTITION BY RANGE (created_at);
ALTER TABLE transactions_new ADD PRIMARY KEY (id, created_at);
-- Named transactions_new_tenant_no_idx for now — index/constraint names are
-- unique per-schema in Postgres, and the old table still holds
-- "transactions_tenant_no_idx" until the rename swap below.
ALTER TABLE transactions_new ADD CONSTRAINT transactions_new_tenant_no_idx UNIQUE (tenant_id, transaction_no, created_at);

CREATE TABLE transactions_default PARTITION OF transactions_new DEFAULT;
SELECT _kpos_create_monthly_partitions('transactions_new', 'transactions', (date_trunc('month', now()) - interval '24 months')::date, 37);

INSERT INTO transactions_new SELECT * FROM transactions;

CREATE INDEX transactions_new_store_idx ON transactions_new (store_id);
CREATE INDEX transactions_new_tenant_idx ON transactions_new (tenant_id);
CREATE INDEX transactions_new_branch_created_idx ON transactions_new (branch_id, created_at);
CREATE INDEX transactions_new_tenant_status_idx ON transactions_new (tenant_id, status);
CREATE INDEX transactions_new_user_idx ON transactions_new (user_id);
CREATE INDEX transactions_new_customer_idx ON transactions_new (customer_id);

ALTER TABLE transactions_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions_new FORCE ROW LEVEL SECURITY;
CREATE POLICY transactions_tenant_isolation ON transactions_new
    USING ((tenant_id IS NULL) OR (tenant_id::text = current_setting('app.current_tenant_id', true)) OR (current_setting('app.bypass_rls', true) = 'true'))
    WITH CHECK ((tenant_id IS NULL) OR (tenant_id::text = current_setting('app.current_tenant_id', true)) OR (current_setting('app.bypass_rls', true) = 'true'));

-- Renaming a table does NOT rename its indexes/constraints — the backup
-- table keeps holding e.g. "transactions_tenant_no_idx" after being
-- renamed, which blocks the new table from taking that name (index names
-- are unique per-schema in Postgres, not per-table). Rename the backup's
-- indexes out of the way first, then move the new ones into the freed
-- final names.
BEGIN;
ALTER TABLE transactions RENAME TO transactions_pre_partition_backup;
ALTER INDEX transactions_pkey RENAME TO transactions_pre_partition_backup_pkey;
ALTER INDEX transactions_store_idx RENAME TO transactions_pre_partition_backup_store_idx;
ALTER INDEX transactions_tenant_idx RENAME TO transactions_pre_partition_backup_tenant_idx;
ALTER INDEX transactions_tenant_no_idx RENAME TO transactions_pre_partition_backup_tenant_no_idx;
ALTER INDEX transactions_branch_created_idx RENAME TO transactions_pre_partition_backup_branch_created_idx;
ALTER INDEX transactions_tenant_status_idx RENAME TO transactions_pre_partition_backup_tenant_status_idx;
ALTER INDEX transactions_user_idx RENAME TO transactions_pre_partition_backup_user_idx;
ALTER INDEX transactions_customer_idx RENAME TO transactions_pre_partition_backup_customer_idx;

ALTER TABLE transactions_new RENAME TO transactions;
ALTER INDEX transactions_new_pkey RENAME TO transactions_pkey;
ALTER INDEX transactions_new_tenant_no_idx RENAME TO transactions_tenant_no_idx;
ALTER INDEX transactions_new_store_idx RENAME TO transactions_store_idx;
ALTER INDEX transactions_new_tenant_idx RENAME TO transactions_tenant_idx;
ALTER INDEX transactions_new_branch_created_idx RENAME TO transactions_branch_created_idx;
ALTER INDEX transactions_new_tenant_status_idx RENAME TO transactions_tenant_status_idx;
ALTER INDEX transactions_new_user_idx RENAME TO transactions_user_idx;
ALTER INDEX transactions_new_customer_idx RENAME TO transactions_customer_idx;
COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. transaction_items — needs a new created_at column (denormalized from
--    the parent transaction) since the table never had one; that column
--    becomes the partition key. Backfilled by joining the just-renamed
--    backup of `transactions` (guaranteed unchanged, faithful source).
-- ═══════════════════════════════════════════════════════════════════════════
-- Can't use `LIKE transaction_items` here: LIKE only copies EXISTING
-- columns, but created_at (the partition key) doesn't exist on the old
-- table yet — PARTITION BY RANGE(created_at) would fail at CREATE TABLE
-- time referencing a not-yet-existing column. Spelled out explicitly
-- instead, matching transaction_items' current column list exactly.
CREATE TABLE transaction_items_new (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    transaction_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    sku text,
    barcode text,
    quantity double precision NOT NULL,
    unit_price double precision NOT NULL,
    cost double precision NOT NULL DEFAULT 0,
    discount_type text,
    discount_value double precision NOT NULL DEFAULT 0,
    discount_amount double precision NOT NULL DEFAULT 0,
    tax_rate double precision NOT NULL DEFAULT 0,
    tax_amount double precision NOT NULL DEFAULT 0,
    total double precision NOT NULL,
    note text,
    modifiers jsonb,
    tenant_id uuid,
    created_at timestamp NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
ALTER TABLE transaction_items_new ADD PRIMARY KEY (id, created_at);

CREATE TABLE transaction_items_default PARTITION OF transaction_items_new DEFAULT;
SELECT _kpos_create_monthly_partitions('transaction_items_new', 'transaction_items', (date_trunc('month', now()) - interval '24 months')::date, 37);

INSERT INTO transaction_items_new (
    id, transaction_id, product_id, product_name, sku, barcode, quantity, unit_price, cost,
    discount_type, discount_value, discount_amount, tax_rate, tax_amount, total, note, modifiers,
    tenant_id, created_at
)
SELECT
    ti.id, ti.transaction_id, ti.product_id, ti.product_name, ti.sku, ti.barcode, ti.quantity, ti.unit_price, ti.cost,
    ti.discount_type, ti.discount_value, ti.discount_amount, ti.tax_rate, ti.tax_amount, ti.total, ti.note, ti.modifiers,
    ti.tenant_id, COALESCE(t.created_at, now())
FROM transaction_items ti
LEFT JOIN transactions_pre_partition_backup t ON t.id = ti.transaction_id;

CREATE INDEX transaction_items_new_tenant_idx ON transaction_items_new (tenant_id);
CREATE INDEX transaction_items_new_transaction_idx ON transaction_items_new (transaction_id);
CREATE INDEX transaction_items_new_product_idx ON transaction_items_new (product_id);

ALTER TABLE transaction_items_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items_new FORCE ROW LEVEL SECURITY;
CREATE POLICY transaction_items_tenant_isolation ON transaction_items_new
    USING ((tenant_id IS NULL) OR (tenant_id::text = current_setting('app.current_tenant_id', true)) OR (current_setting('app.bypass_rls', true) = 'true'))
    WITH CHECK ((tenant_id IS NULL) OR (tenant_id::text = current_setting('app.current_tenant_id', true)) OR (current_setting('app.bypass_rls', true) = 'true'));

BEGIN;
ALTER TABLE transaction_items RENAME TO transaction_items_pre_partition_backup;
ALTER INDEX transaction_items_pkey RENAME TO transaction_items_pre_partition_backup_pkey;
ALTER INDEX transaction_items_tenant_idx RENAME TO transaction_items_pre_partition_backup_tenant_idx;
ALTER INDEX transaction_items_transaction_idx RENAME TO transaction_items_pre_partition_backup_transaction_idx;
ALTER INDEX transaction_items_product_idx RENAME TO transaction_items_pre_partition_backup_product_idx;

ALTER TABLE transaction_items_new RENAME TO transaction_items;
ALTER INDEX transaction_items_new_pkey RENAME TO transaction_items_pkey;
ALTER INDEX transaction_items_new_tenant_idx RENAME TO transaction_items_tenant_idx;
ALTER INDEX transaction_items_new_transaction_idx RENAME TO transaction_items_transaction_idx;
ALTER INDEX transaction_items_new_product_idx RENAME TO transaction_items_product_idx;
COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. stock_movements
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE stock_movements_new (LIKE stock_movements INCLUDING DEFAULTS) PARTITION BY RANGE (created_at);
ALTER TABLE stock_movements_new ADD PRIMARY KEY (id, created_at);

CREATE TABLE stock_movements_default PARTITION OF stock_movements_new DEFAULT;
SELECT _kpos_create_monthly_partitions('stock_movements_new', 'stock_movements', (date_trunc('month', now()) - interval '24 months')::date, 37);

INSERT INTO stock_movements_new SELECT * FROM stock_movements;

CREATE INDEX stock_movements_new_store_idx ON stock_movements_new (store_id);
CREATE INDEX stock_movements_new_tenant_idx ON stock_movements_new (tenant_id);
CREATE INDEX stock_movements_new_branch_created_idx ON stock_movements_new (branch_id, created_at);
CREATE INDEX stock_movements_new_product_idx ON stock_movements_new (product_id);

ALTER TABLE stock_movements_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements_new FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_movements_tenant_isolation ON stock_movements_new
    USING ((tenant_id IS NULL) OR (tenant_id::text = current_setting('app.current_tenant_id', true)) OR (current_setting('app.bypass_rls', true) = 'true'))
    WITH CHECK ((tenant_id IS NULL) OR (tenant_id::text = current_setting('app.current_tenant_id', true)) OR (current_setting('app.bypass_rls', true) = 'true'));

BEGIN;
ALTER TABLE stock_movements RENAME TO stock_movements_pre_partition_backup;
ALTER INDEX stock_movements_pkey RENAME TO stock_movements_pre_partition_backup_pkey;
ALTER INDEX stock_movements_store_idx RENAME TO stock_movements_pre_partition_backup_store_idx;
ALTER INDEX stock_movements_tenant_idx RENAME TO stock_movements_pre_partition_backup_tenant_idx;
ALTER INDEX stock_movements_branch_created_idx RENAME TO stock_movements_pre_partition_backup_branch_created_idx;
ALTER INDEX stock_movements_product_idx RENAME TO stock_movements_pre_partition_backup_product_idx;

ALTER TABLE stock_movements_new RENAME TO stock_movements;
ALTER INDEX stock_movements_new_pkey RENAME TO stock_movements_pkey;
ALTER INDEX stock_movements_new_store_idx RENAME TO stock_movements_store_idx;
ALTER INDEX stock_movements_new_tenant_idx RENAME TO stock_movements_tenant_idx;
ALTER INDEX stock_movements_new_branch_created_idx RENAME TO stock_movements_branch_created_idx;
ALTER INDEX stock_movements_new_product_idx RENAME TO stock_movements_product_idx;
COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Once you've verified row counts/spot-checked data on the new partitioned
-- tables match what you expect, drop the backups to reclaim disk:
--   DROP TABLE transactions_pre_partition_backup;
--   DROP TABLE transaction_items_pre_partition_backup;
--   DROP TABLE stock_movements_pre_partition_backup;
-- Not dropped automatically by this migration — keeping them is the safety
-- net for this kind of table-swap.
-- ═══════════════════════════════════════════════════════════════════════════
