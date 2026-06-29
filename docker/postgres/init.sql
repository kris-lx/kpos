-- PostgreSQL initialization script for KPOS
-- This script runs when the container starts for the first time

-- ═══════════════════════════════════════════════════════════════════════════
-- Extensions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════
-- SEC-07: Activity Log Immutability Trigger
-- Prevents UPDATE and DELETE on activity_logs to protect the audit trail.
-- Runs AFTER migrations (Drizzle) have created the table.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_activity_logs_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'activity_logs rows are immutable — audit records cannot be modified or deleted';
END;
$$;

-- The trigger is created lazily: if the table does not exist yet (first boot
-- before migrations run) this will fail silently. Run migrations first, then
-- the trigger will be present on subsequent container restarts via the
-- idempotent CREATE OR REPLACE FUNCTION + DROP/CREATE TRIGGER pattern.
DO $$
BEGIN
    -- activity_logs immutability guard
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_logs') THEN
        DROP TRIGGER IF EXISTS trg_activity_logs_immutable ON activity_logs;
        CREATE TRIGGER trg_activity_logs_immutable
            BEFORE UPDATE OR DELETE ON activity_logs
            FOR EACH ROW EXECUTE FUNCTION fn_activity_logs_immutable();
    END IF;

    -- platform_audit_logs immutability guard
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_audit_logs') THEN
        DROP TRIGGER IF EXISTS trg_platform_audit_logs_immutable ON platform_audit_logs;
        CREATE TRIGGER trg_platform_audit_logs_immutable
            BEFORE UPDATE OR DELETE ON platform_audit_logs
            FOR EACH ROW EXECUTE FUNCTION fn_activity_logs_immutable();
    END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEC-04: Row-Level Security Policies
-- GUC app.current_tenant_id is set via SET LOCAL inside db.transaction() by
-- setRequestContext() (tenant-tx.middleware.ts). Routes that don't use that
-- middleware rely on application-layer WHERE clauses for tenant isolation.
--
-- Bypass rules (in order):
--   1. Superusers and BYPASSRLS roles bypass automatically (seeds, migrations).
--   2. FORCE ROW LEVEL SECURITY applied — even the table owner is subject to RLS
--      via non-superuser connections (e.g. reporting tools, direct psql as kpos).
--   3. An empty GUC means the request has NOT gone through withTenantTx — deny by
--      default for non-superusers. The app user (kpos) is granted BYPASSRLS so
--      that existing routes without withTenantTx continue to work until SEC-03 is
--      completed, at which point the BYPASSRLS grant can be revoked.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Grant BYPASSRLS to the application DB role so routes without withTenantTx
    -- still work. Remove this grant once SEC-03 (global withTenantTx) is done.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kpos') THEN
        ALTER ROLE kpos BYPASSRLS;
    END IF;

    -- transactions table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
        ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS rls_transactions_tenant ON transactions;
        CREATE POLICY rls_transactions_tenant ON transactions
            USING (
                tenant_id::text = current_setting('app.current_tenant_id', true)
            );
    END IF;

    -- activity_logs table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_logs') THEN
        ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
        ALTER TABLE activity_logs FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS rls_activity_logs_tenant ON activity_logs;
        CREATE POLICY rls_activity_logs_tenant ON activity_logs
            USING (
                tenant_id IS NULL
                OR tenant_id::text = current_setting('app.current_tenant_id', true)
            );
    END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEC-05: tenantId NOT NULL enforcement on business-data tables
-- Only applied to tables where a NULL tenantId is always a bug (i.e. the row
-- always belongs to exactly one tenant). Platform-level tables (roles, rules,
-- users) are excluded — they legitimately have NULL tenantId for system entries.
-- Wrapped in IF EXISTS so this is safe to run before migrations.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'branches',
        'stores',
        'user_stores',
        'product_stores',
        'transactions',
        'transaction_items',
        'transaction_payments',
        'customers',
        'members',
        'promotions',
        'coupons',
        'discounts',
        'settlements',
        'vendors',
        'purchase_orders',
        'purchase_order_items',
        'stock_transfers',
        'stock_counts',
        'documents',
        'settings',
        'notifications',
        'point_settings'
    ]
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = tbl AND column_name = 'tenant_id'
                   AND is_nullable = 'YES') THEN
            -- Only set NOT NULL if no existing NULL rows (safe for fresh installs)
            IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
                CONTINUE;
            END IF;
            BEGIN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', tbl);
                RAISE NOTICE 'SEC-05: Added NOT NULL to %.tenant_id', tbl;
            EXCEPTION WHEN others THEN
                RAISE NOTICE 'SEC-05: Skipped %.tenant_id — existing NULLs or table not ready (%)', tbl, SQLERRM;
            END;
        END IF;
    END LOOP;
END;
$$;

\echo 'PostgreSQL initialized for KPOS'
