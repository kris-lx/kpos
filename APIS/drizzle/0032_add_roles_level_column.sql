ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "level" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
-- Backfill known built-in role names to their real ROLE_LEVELS value (see
-- auth.middleware.ts) instead of leaving them at the generic default=7,
-- which would make the ladder check treat every seeded admin/manager role
-- as the lowest possible privilege tier until the next boot's role patch.
UPDATE "roles" SET "level" = 1 WHERE "name" IN ('platform_super_admin','platform_support','platform_auditor','super_admin','admin');--> statement-breakpoint
UPDATE "roles" SET "level" = 2 WHERE "name" IN ('merchant_owner','hq_admin','store_owner','tenant_admin');--> statement-breakpoint
UPDATE "roles" SET "level" = 3 WHERE "name" IN ('merchant_manager','accountant','hq_manager');--> statement-breakpoint
UPDATE "roles" SET "level" = 4 WHERE "name" IN ('supervisor','branch_admin','branch_manager','store_manager','store_admin','manager');--> statement-breakpoint
UPDATE "roles" SET "level" = 5 WHERE "name" IN ('senior_cashier','cashier','staff');--> statement-breakpoint
UPDATE "roles" SET "level" = 6 WHERE "name" IN ('inventory_staff','kitchen_staff','waiter');--> statement-breakpoint
-- Custom (non-built-in) roles created before this column existed: this
-- column's default (7) already applies to them, so no UPDATE is needed —
-- explicitly noting it rather than "fixing" it. Level doubles as both the
-- assignment-ladder tier AND the tier used to gate the CURRENT holder's own
-- session (branchFilter's tenant-wide-vs-branch-restricted cutoff, roleLevel
-- <= 2 checks, etc.) — bumping every pre-existing custom role to a
-- privileged level here would have been a silent mass privilege escalation
-- for whichever real staff already hold one (verified: a real tenant's
-- custom "staff1" cashier role would have jumped to unrestricted tenant-wide
-- access). Leaving them at 7 (today's de facto behavior, since unmatched
-- names already fell through ROLE_LEVELS's `?? 7`) is a no-op for session
-- gating and keeps the ladder conservative for assignment — the actual
-- escalation-via-custom-role hole is closed by the permission-subset check
-- in resolveAssignableRole, not by this default.
