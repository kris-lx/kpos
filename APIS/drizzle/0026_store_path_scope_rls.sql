-- ═══════════════════════════════════════════════════════════════════════════
-- RLS for the new store tree (Tenant → Store → Branch)
--
-- `stores` previously only needed a flat tenant-isolation policy (it was a
-- leaf entity). Now that it's the top-level, tenant-rooted tree (via
-- parent_store_id/store_path, mirroring branches' own hierarchy), it needs
-- the same path-prefix scoping branches already has — and per the lesson
-- from 0021 (multiple PERMISSIVE policies on one table OR-combine), the
-- tenant check must be folded INTO this policy, not left as a separate
-- policy the path-scope clause could OR past.
--
-- `branches_path_scope` additionally gains a store-subtree check: a branch
-- is now only visible if the caller's store-path scope also covers the
-- branch's owning store (via branches.store_id -> stores.store_path).
-- app.current_store_path works exactly like app.current_branch_path: unset/
-- empty means "no store restriction beyond tenant" (tenant owners, and any
-- session that never sets it), a value means "this store subtree only".
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "stores_tenant_isolation" ON "stores";--> statement-breakpoint
DROP POLICY IF EXISTS "stores_path_scope" ON "stores";--> statement-breakpoint
CREATE POLICY "stores_path_scope" ON "stores"
  AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'true'
    OR (
      (tenant_id IS NULL OR tenant_id::text = current_setting('app.current_tenant_id', true))
      AND (
        COALESCE(current_setting('app.current_store_path', true), '') = ''
        OR store_path = current_setting('app.current_store_path', true)
        OR store_path LIKE current_setting('app.current_store_path', true) || '.%'
      )
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'true'
    OR (
      (tenant_id IS NULL OR tenant_id::text = current_setting('app.current_tenant_id', true))
      AND (
        COALESCE(current_setting('app.current_store_path', true), '') = ''
        OR store_path = current_setting('app.current_store_path', true)
        OR store_path LIKE current_setting('app.current_store_path', true) || '.%'
      )
    )
  );--> statement-breakpoint

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
      AND (
        COALESCE(current_setting('app.current_store_path', true), '') = ''
        OR store_id IN (
          SELECT id FROM stores
          WHERE store_path = current_setting('app.current_store_path', true)
             OR store_path LIKE current_setting('app.current_store_path', true) || '.%'
        )
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
      AND (
        COALESCE(current_setting('app.current_store_path', true), '') = ''
        OR store_id IN (
          SELECT id FROM stores
          WHERE store_path = current_setting('app.current_store_path', true)
             OR store_path LIKE current_setting('app.current_store_path', true) || '.%'
        )
      )
    )
  );
