-- ═══════════════════════════════════════════════════════════════════════════
-- Store/Branch hierarchy reversal, step 1: Tenant → Store → Branch
-- (previously Tenant → Branch → Store). Adds the new columns/indexes and
-- backfills branches.store_id from existing data; drops the old
-- stores.branch_id FK in a follow-up migration (0025) once every branch has
-- a store_id populated, so this step never has a hard NOT NULL dependency
-- on data that hasn't been backfilled yet.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "stores" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_stores" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "parent_store_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "store_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "store_id" uuid;--> statement-breakpoint

-- Backfill: each branch adopts the first store that currently points to it
-- (old model allowed many stores per branch; new model has exactly one
-- store per branch, so pick deterministically — the default store first,
-- oldest otherwise).
UPDATE "branches" b
SET "store_id" = s.id
FROM (
  SELECT DISTINCT ON (branch_id) id, branch_id
  FROM "stores"
  WHERE branch_id IS NOT NULL
  ORDER BY branch_id, is_default DESC, created_at ASC
) s
WHERE s.branch_id = b.id;--> statement-breakpoint

-- Any branch with zero stores under it (orphaned in the old model) gets a
-- new placeholder store created for it, named after the branch.
INSERT INTO "stores" (id, tenant_id, name, code, is_active, is_default, created_at, updated_at)
SELECT gen_random_uuid(), b.tenant_id, b.name || ' (auto)', b.code || '-AUTO', true, false, now(), now()
FROM "branches" b
WHERE b.store_id IS NULL;--> statement-breakpoint

UPDATE "branches" b
SET "store_id" = s.id
FROM "stores" s
WHERE b.store_id IS NULL AND s.code = b.code || '-AUTO';--> statement-breakpoint

ALTER TABLE "branches" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint

-- Store-tree materialized path backfill (mirrors 0008_branch_hierarchy.sql's
-- approach for branches): roots get their own id, descendants get
-- parent.path/self.id. No existing store has parent_store_id set yet
-- (the column is brand new), so every store is currently a root.
UPDATE "stores" SET "store_path" = "id"::text WHERE "store_path" = '';--> statement-breakpoint

CREATE INDEX "branches_store_idx" ON "branches" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "stores_tenant_idx" ON "stores" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "stores_parent_idx" ON "stores" USING btree ("parent_store_id");--> statement-breakpoint
CREATE INDEX "stores_path_idx" ON "stores" USING btree ("store_path");
