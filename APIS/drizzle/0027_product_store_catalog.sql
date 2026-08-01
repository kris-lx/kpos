-- ═══════════════════════════════════════════════════════════════════════════
-- Store-level shared product catalog
--
-- products.branchId was NOT NULL, so every product belonged to exactly one
-- branch — no way to define a catalog once at the store (brand) tier and
-- have every branch under it (including new franchise branches) inherit it.
-- categories already solved this (nullable storeId); products never did.
--
-- products.storeId: every product belongs to exactly one store (its brand).
-- products.branchId: now nullable. NULL = shared across every branch under
-- that store. Set = exclusive to that one branch (a franchisee's own item).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "products" ADD COLUMN "store_id" uuid;--> statement-breakpoint

-- Backfill: every existing product has a real branch_id today, and every
-- branch has exactly one owning store (branches.store_id, NOT NULL since
-- 0024) — deterministic, total backfill, no orphans possible.
UPDATE "products" p SET "store_id" = b."store_id"
FROM "branches" b WHERE p."branch_id" = b."id";--> statement-breakpoint

ALTER TABLE "products" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "products_store_idx" ON "products" USING btree ("store_id");
