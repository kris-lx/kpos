-- ═══════════════════════════════════════════════════════════════════════════
-- Tenant isolation defense-in-depth — Phase 2 follow-up
--
-- 0014's blanket tenant_isolation policy on `users` broke login/register/
-- authenticate(): those flows look a user up by email or id BEFORE any tenant
-- is known — that's how identity resolution has to work (you don't know the
-- tenant until you've found the user). With kpos_app running deny-by-default
-- and no GUC set yet at that point in the request, the lookup itself returned
-- zero rows and login failed outright.
--
-- This is specific to `users` — every other tenant-owned table is only ever
-- queried AFTER authenticate() has already established req.authUser.tenantId,
-- so 0014's policy is correct and unchanged for them.
--
-- Temporary, explicit fix: drop the FORCE ROW LEVEL SECURITY + policy on
-- `users` for now. Tenant isolation on `users` reads/writes continues to rely
-- on the application-layer tenantScope()/ensureScopeAccess() checks already
-- used by the users/admin routes (unchanged by this migration). The DB-level
-- safety net for `users` specifically will be reinstated in Phase 3/4 of the
-- tenant-isolation work, once the reserved-connection plumbing being built
-- there (see tenant-tx.middleware.ts) can scope a narrow, auditable bootstrap
-- exception to exactly the identity-lookup queries in auth.service.ts /
-- auth.middleware.ts — instead of turning RLS off for the whole table.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users_tenant_isolation" ON "users";--> statement-breakpoint
ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
