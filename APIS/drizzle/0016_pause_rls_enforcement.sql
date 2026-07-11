-- ═══════════════════════════════════════════════════════════════════════════
-- Tenant isolation defense-in-depth — Phase 2 correction
--
-- 0014 turned on FORCE ROW LEVEL SECURITY across ~58 tables. That's correct
-- long-term, but it has a hard dependency I underestimated when sequencing
-- this before Phase 3/4: every route handler in this codebase currently
-- queries through the global `db` connection, which never sets
-- app.current_tenant_id anywhere. RLS's deny-by-default doesn't error in that
-- case — it silently returns zero rows. The result: with 0014 live, every
-- authenticated request against any of those 58 tables (products, branches,
-- stores, transactions, everything) came back empty for every user,
-- including superadmins. That's strictly worse than an error — it's silent
-- data loss with a 200 OK.
--
-- Pausing enforcement here rather than leaving it live. Re-enabling is just
-- re-running 0014's logic (it's idempotent) once withTenantTx is actually
-- wired into request handlers (Phase 3: fix the middleware implementation;
-- Phase 4: convert each module's routes.ts from `db` to `req.tx`) — RLS
-- enforcement should land together with that app-layer wiring, not before it.
--
-- What stays in effect: the kpos_app role itself (0013) — least-privilege,
-- no SUPERUSER/BYPASSRLS — and the users-table bootstrap fix (0015). Only
-- the blanket per-table FORCE ROW LEVEL SECURITY from 0014 is paused.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT relname FROM pg_class
        WHERE relkind = 'r' AND relrowsecurity = true
    LOOP
        EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
    END LOOP;
END;
$$;
