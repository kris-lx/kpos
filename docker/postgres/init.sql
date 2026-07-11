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
-- NOTE on RLS (formerly SEC-04/05 here):
--
-- This file only runs on a Postgres container's first-ever boot with an empty
-- data volume — it does NOT re-run on redeploys or against an existing
-- database. That made it the wrong place for RLS policies and role grants:
-- changes made here after a container's first boot silently never take
-- effect. Row-Level Security setup (app role creation, ENABLE/FORCE ROW LEVEL
-- SECURITY, policies) now lives in versioned Drizzle migrations
-- (APIS/drizzle/0013_create_app_role.sql onward), which reliably apply via
-- `npm run db:migrate` against fresh AND existing databases alike.
--
-- This file remains for first-boot-only bootstrap concerns: extensions and
-- the audit-log immutability trigger below.
-- ═══════════════════════════════════════════════════════════════════════════

\echo 'PostgreSQL initialized for KPOS'
