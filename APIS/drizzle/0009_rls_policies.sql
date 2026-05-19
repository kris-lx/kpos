-- ═══════════════════════════════════════════════════════════════════════════
-- Row-Level Security (RLS) policies — Phase 3
-- Layer 2 of defense-in-depth: PostgreSQL enforces tenant + branch isolation
-- even if the application layer forgets a WHERE clause.
--
-- Session variables expected (set by middleware/set-tenant-context.ts):
--   app.current_tenant_id   :: uuid
--   app.current_branch_path :: text  ('' = tenant-admin / no branch scope)
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper expression: branch_path is in scope when
--   * current_branch_path is empty (tenant-admin / superuser), OR
--   * branch_path equals current_branch_path, OR
--   * branch_path starts with current_branch_path || '.'
--
-- We inline this expression in each policy to keep policies self-contained.

-- ───────────────────────────────────────────────────────────────────────────
-- BRANCHES
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "branches_tenant_isolation" ON "branches";--> statement-breakpoint
CREATE POLICY "branches_tenant_isolation" ON "branches"
  USING (
    tenant_id IS NULL
    OR tenant_id::text = current_setting('app.current_tenant_id', true)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.current_tenant_id', true)
  );--> statement-breakpoint

DROP POLICY IF EXISTS "branches_path_scope" ON "branches";--> statement-breakpoint
CREATE POLICY "branches_path_scope" ON "branches"
  USING (
    current_setting('app.current_branch_path', true) = ''
    OR branch_path = current_setting('app.current_branch_path', true)
    OR branch_path LIKE current_setting('app.current_branch_path', true) || '.%'
  );--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- USERS
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "users_tenant_isolation" ON "users";--> statement-breakpoint
CREATE POLICY "users_tenant_isolation" ON "users"
  USING (
    tenant_id IS NULL
    OR tenant_id::text = current_setting('app.current_tenant_id', true)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.current_tenant_id', true)
  );--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- ROLES + ROLE_RULES + RULES
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "roles_tenant_isolation" ON "roles";--> statement-breakpoint
CREATE POLICY "roles_tenant_isolation" ON "roles"
  USING (
    tenant_id IS NULL
    OR tenant_id::text = current_setting('app.current_tenant_id', true)
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id::text = current_setting('app.current_tenant_id', true)
  );--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- STORES
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stores" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "stores_tenant_isolation" ON "stores";--> statement-breakpoint
CREATE POLICY "stores_tenant_isolation" ON "stores"
  USING (
    tenant_id IS NULL
    OR tenant_id::text = current_setting('app.current_tenant_id', true)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.current_tenant_id', true)
  );--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- PRODUCTS / INVENTORY / TRANSACTIONS / CUSTOMERS / SETTLEMENTS / SETTINGS
-- (All tenant-owned tables — repeat the same tenant policy.)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'products', 'product_stores', 'product_price_levels',
    'inventory', 'transactions', 'transaction_items',
    'customers', 'settlements', 'settings',
    'cash_registers', 'shifts', 'returns',
    'payments', 'menu_permissions', 'rules', 'role_rules',
    'user_stores'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I '
      'USING ( tenant_id IS NULL OR tenant_id::text = current_setting(''app.current_tenant_id'', true) ) '
      'WITH CHECK ( tenant_id::text = current_setting(''app.current_tenant_id'', true) )',
      t || '_tenant_isolation', t
    );
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  -- A listed table may not exist in this environment; skip it silently.
  RAISE NOTICE 'Skipping missing table while applying RLS: %', SQLERRM;
END $$;--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTE: The DB role used by the API server MUST NOT have BYPASSRLS.
-- Verify with:  \du+ kpos_app
-- ═══════════════════════════════════════════════════════════════════════════
