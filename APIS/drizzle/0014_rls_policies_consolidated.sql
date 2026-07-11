-- ═══════════════════════════════════════════════════════════════════════════
-- Tenant isolation defense-in-depth — Phase 2
-- Row-Level Security policies for every tenant-owned table.
--
-- Replaces the earlier `0009_rls_policies.sql` / `0011_rls_branch_path_policies.sql`
-- files, which were never registered in drizzle/meta/_journal.json (drizzle-kit
-- migrate only applies journal-listed files, so they never ran against any
-- database), and `docker/postgres/init.sql`'s SEC-04 block, which only runs on
-- a container's first-ever boot and therefore never re-applies on redeploys.
--
-- This migration drives table discovery off information_schema instead of a
-- hand-maintained array: `0009_rls_policies.sql`'s array included a table with
-- no tenant_id column (`menu_permissions`), which raised an uncaught
-- undefined_column error and silently rolled back every policy created earlier
-- in that same DO block. Discovering tables by their actual columns avoids
-- that whole class of bug and self-corrects as new tables are added later.
--
-- Session variables (set by APIS/src/db/set-tenant-context.ts via
-- withTenantTx middleware):
--   app.current_tenant_id   :: text  (uuid as text; empty = not set)
--   app.current_branch_path :: text  ('' = tenant-admin / no branch scope)
--
-- Only takes effect for roles without SUPERUSER/BYPASSRLS — see
-- 0013_create_app_role.sql. The old `kpos` superuser role bypasses RLS
-- unconditionally regardless of anything in this file; that's expected and
-- correct, since it's the migration-only role, not what the running API uses.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND c.column_name = 'tenant_id'
          AND t.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_tenant_isolation', tbl);
        EXECUTE format(
            'CREATE POLICY %I ON %I '
            'USING ( tenant_id IS NULL OR tenant_id::text = current_setting(''app.current_tenant_id'', true) ) '
            'WITH CHECK ( tenant_id IS NULL OR tenant_id::text = current_setting(''app.current_tenant_id'', true) )',
            tbl || '_tenant_isolation', tbl
        );
        RAISE NOTICE 'RLS enabled on %', tbl;
    END LOOP;
END;
$$;--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- BRANCHES: additional branch_path prefix-scope policy, on top of the
-- tenant_isolation policy the loop above already created for it (branches has
-- a tenant_id column). Empty current_branch_path means tenant-admin/no
-- branch restriction — see auth.middleware.ts ScopeFilter / activeBranchPath.
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "branches_path_scope" ON "branches";--> statement-breakpoint
CREATE POLICY "branches_path_scope" ON "branches"
  AS PERMISSIVE FOR ALL
  USING (
    COALESCE(current_setting('app.current_branch_path', true), '') = ''
    OR branch_path = current_setting('app.current_branch_path', true)
    OR branch_path LIKE current_setting('app.current_branch_path', true) || '.%'
  );
