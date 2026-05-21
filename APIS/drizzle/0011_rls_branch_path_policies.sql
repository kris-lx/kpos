-- ═══════════════════════════════════════════════════════════════════════════
-- RLS branch-path policies — Phase 3 data isolation enhancement
-- Adds branch_path prefix-based policies on top of existing tenant isolation.
-- Branches that belong to a path outside the current session scope are blocked.
--
-- Session variables (set by set-tenant-context.ts):
--   app.current_tenant_id   :: text   (empty = superadmin)
--   app.current_branch_path :: text   (empty = tenant-admin / no branch scope)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- Helper: re-apply branch_path scope policy on branches
-- (replaces the one from 0009 with a more permissive empty-string check)
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "branches_path_scope" ON "branches";--> statement-breakpoint
CREATE POLICY "branches_path_scope" ON "branches"
  AS PERMISSIVE FOR ALL
  USING (
    -- No restriction when branch_path GUC is empty (tenant admin or superadmin)
    COALESCE(current_setting('app.current_branch_path', true), '') = ''
    OR branch_path = current_setting('app.current_branch_path', true)
    OR branch_path LIKE current_setting('app.current_branch_path', true) || '.%'
  );--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- NOTE: products, inventory, transactions do not have a branch_path column —
-- they are filtered at the application layer via buildBranchIdScope() which
-- emits a subquery against the branches table.
-- The existing tenant_isolation RLS policies on these tables (from 0009) are
-- sufficient as the second layer of defence.
-- ───────────────────────────────────────────────────────────────────────────

-- Ensure branches table superuser bypass is NOT active (paranoia check)
-- This must be run as a superuser, so it's commented out for non-superuser migrations.
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kpos_app' AND rolbypassrls) THEN
--     RAISE EXCEPTION 'kpos_app role must not have BYPASSRLS';
--   END IF;
-- END $$;
