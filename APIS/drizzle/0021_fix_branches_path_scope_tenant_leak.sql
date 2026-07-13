-- ═══════════════════════════════════════════════════════════════════════════
-- Fix cross-tenant leak on `branches` via multi-permissive-policy OR combination
--
-- Postgres combines multiple PERMISSIVE policies on the same table/command
-- with OR (a row is visible if ANY applicable permissive policy's USING
-- clause is true). `branches` has two: branches_tenant_isolation (0017) and
-- branches_path_scope (0017/0020). branches_path_scope's "no branch
-- restriction" clause — `COALESCE(current_setting('app.current_branch_path',
-- true), '') = ''` — is legitimately meant to let HQ-level tenant admins
-- (who have no single branch_path) see every branch in THEIR tenant. But
-- because it's OR'd against branches_tenant_isolation rather than ANDed, that
-- clause alone made every branch in every tenant visible to any HQ-level
-- user of any tenant with no branch_path set — verified live: a session with
-- app.current_tenant_id set to tenant A and app.current_branch_path='' saw
-- tenant B's branch too.
--
-- Fix: fold the tenant check into branches_path_scope itself so the "no
-- branch restriction" clause only ever widens visibility within the caller's
-- own tenant, not across tenants. app.bypass_rls (0020) still short-circuits
-- both for the controlled superadmin escape hatch.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "branches_path_scope" ON "branches";--> statement-breakpoint
CREATE POLICY "branches_path_scope" ON "branches"
  AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR (
      (tenant_id IS NULL OR tenant_id::text = current_setting('app.current_tenant_id', true))
      AND (
        COALESCE(current_setting('app.current_branch_path', true), '') = ''
        OR branch_path = current_setting('app.current_branch_path', true)
        OR branch_path LIKE current_setting('app.current_branch_path', true) || '.%'
      )
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'true'
    OR (
      (tenant_id IS NULL OR tenant_id::text = current_setting('app.current_tenant_id', true))
      AND (
        COALESCE(current_setting('app.current_branch_path', true), '') = ''
        OR branch_path = current_setting('app.current_branch_path', true)
        OR branch_path LIKE current_setting('app.current_branch_path', true) || '.%'
      )
    )
  );
