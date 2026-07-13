-- ═══════════════════════════════════════════════════════════════════════════
-- Superadmin cross-tenant RLS bypass (controlled, policy-level — not BYPASSRLS)
--
-- 0013 deliberately made kpos_app NOSUPERUSER/NOBYPASSRLS so RLS actually
-- applies to the running API process. But every route module already assumes
-- superadmin requests see across all tenants — the app-layer WHERE-clause
-- pattern `if (tenantId && !isSuperAdmin) conds.push(eq(table.tenantId, tenantId))`
-- deliberately omits the tenant filter for superadmin, expecting the query to
-- return all tenants' rows. Since FORCE ROW LEVEL SECURITY still applies to
-- kpos_app regardless of that app-layer intent, and withTenantTx()/
-- scopedTransaction() never set app.current_tenant_id for superadmin (see
-- tenant-tx.middleware.ts), the *_tenant_isolation policy's
-- `tenant_id IS NULL OR tenant_id::text = current_setting(...)` clause
-- evaluates false for every non-null-tenant row when current_setting returns
-- NULL — superadmin requests silently saw only orphan (tenant_id IS NULL)
-- rows on every RLS-protected table, not the cross-tenant view the code
-- elsewhere assumes.
--
-- Fix: a new session GUC, app.bypass_rls, set ONLY by trusted server code
-- (withTenantTx() / scopedTransaction() helpers) when req.authUser.isSuperAdmin
-- is true — never derived from user input. Every *_tenant_isolation policy
-- (and branches_path_scope, for consistency/documentation even though its
-- existing empty-branch-path clause already has the same practical effect)
-- gets an additional `OR current_setting('app.bypass_rls', true) = 'true'`
-- clause. Unset (the default for every ordinary tenant-scoped request)
-- evaluates to NULL, which is not 'true', so the default behavior for
-- everyone else is unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE '%\_tenant\_isolation' ESCAPE '\'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
        EXECUTE format(
            'CREATE POLICY %I ON %I '
            'USING ( tenant_id IS NULL OR tenant_id::text = current_setting(''app.current_tenant_id'', true) OR current_setting(''app.bypass_rls'', true) = ''true'' ) '
            'WITH CHECK ( tenant_id IS NULL OR tenant_id::text = current_setting(''app.current_tenant_id'', true) OR current_setting(''app.bypass_rls'', true) = ''true'' )',
            pol.policyname, pol.tablename
        );
        RAISE NOTICE 'Added superadmin bypass clause to policy % on %', pol.policyname, pol.tablename;
    END LOOP;
END;
$$;--> statement-breakpoint

DROP POLICY IF EXISTS "branches_path_scope" ON "branches";--> statement-breakpoint
CREATE POLICY "branches_path_scope" ON "branches"
  AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR COALESCE(current_setting('app.current_branch_path', true), '') = ''
    OR branch_path = current_setting('app.current_branch_path', true)
    OR branch_path LIKE current_setting('app.current_branch_path', true) || '.%'
  );
