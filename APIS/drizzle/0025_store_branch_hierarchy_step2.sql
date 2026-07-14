-- ═══════════════════════════════════════════════════════════════════════════
-- Store/Branch hierarchy reversal, step 2: drop the old stores.branch_id FK
-- now that every branch has been backfilled with its new store_id (0024).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "stores" DROP COLUMN "branch_id";
