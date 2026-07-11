-- ═══════════════════════════════════════════════════════════════════════════
-- Tenant isolation defense-in-depth — Phase 4 complete, re-enable RLS
--
-- 0016 paused RLS enforcement because every route handler still queried
-- through the global `db` connection, which never had app.current_tenant_id
-- set — RLS's deny-by-default silently returned zero rows for every
-- authenticated request, not an error.
--
-- Since then, every route module (sales, categories, rules, branches,
-- dashboard, finance, payment-gateways, payments, staff, promotions, roles,
-- restaurant, documents, stores, users, customers, products, reports,
-- inventory, settings, admin — 21 of 21) has been converted to use req.tx,
-- a Drizzle handle bound to a reserved connection with the RLS GUCs
-- (app.current_tenant_id, app.current_branch_path) set via withTenantTx().
-- Handlers needing real transactions use scopedTransaction()/globalDb with
-- SET LOCAL instead. Module-scope helpers that don't have req in scope use
-- globalDb directly, always with an explicit tenantId already in their
-- WHERE/VALUES clause.
--
-- Re-applies the exact same table discovery + policy logic as 0014
-- (information_schema-driven, not a hand-maintained array — see 0014 for
-- why that matters) and the branches branch_path policy. Both are idempotent
-- (ENABLE ROW LEVEL SECURITY / DROP POLICY IF EXISTS / CREATE POLICY), so
-- safe to run whether or not 0016 already ran in a given environment.
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
          AND c.table_name != 'users' -- see 0015: users needs its own bootstrap-lookup design, deliberately excluded
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
        RAISE NOTICE 'RLS re-enabled on %', tbl;
    END LOOP;
END;
$$;--> statement-breakpoint

DROP POLICY IF EXISTS "branches_path_scope" ON "branches";--> statement-breakpoint
CREATE POLICY "branches_path_scope" ON "branches"
  AS PERMISSIVE FOR ALL
  USING (
    COALESCE(current_setting('app.current_branch_path', true), '') = ''
    OR branch_path = current_setting('app.current_branch_path', true)
    OR branch_path LIKE current_setting('app.current_branch_path', true) || '.%'
  );
