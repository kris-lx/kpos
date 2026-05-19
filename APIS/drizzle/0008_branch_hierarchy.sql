-- ═══════════════════════════════════════════════════════════════════════════
-- Branch Hierarchy: parent_branch_id + branch_path (materialized path)
-- Three-level tenant isolation — Phase 1
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "branches" ADD COLUMN "parent_branch_id" uuid;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "branch_path" text NOT NULL DEFAULT '';--> statement-breakpoint

-- FK with RESTRICT to prevent orphaning sub-branches
ALTER TABLE "branches"
  ADD CONSTRAINT "branches_parent_branch_id_fk"
  FOREIGN KEY ("parent_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT;--> statement-breakpoint

-- Backfill: root branches get their own id as path; depth-1 children get parent.id/self.id
-- (run again manually for deeper trees, or use the recursive CTE below)
UPDATE "branches" SET "branch_path" = "id"::text WHERE "parent_branch_id" IS NULL;--> statement-breakpoint

UPDATE "branches" AS child
SET "branch_path" = parent."branch_path" || '.' || child."id"::text
FROM "branches" AS parent
WHERE child."parent_branch_id" = parent."id"
  AND parent."branch_path" <> ''
  AND child."branch_path" = '';--> statement-breakpoint

-- Indexes
CREATE INDEX "branches_parent_idx" ON "branches" USING btree ("parent_branch_id");--> statement-breakpoint
CREATE INDEX "branches_path_idx" ON "branches" USING btree ("branch_path");--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════
-- Recursive backfill (run if any branches still have empty path)
-- ═══════════════════════════════════════════════════════════════════════════
WITH RECURSIVE branch_tree AS (
  SELECT id, parent_branch_id, id::text AS computed_path
  FROM branches
  WHERE parent_branch_id IS NULL
  UNION ALL
  SELECT b.id, b.parent_branch_id, bt.computed_path || '.' || b.id::text
  FROM branches b
  INNER JOIN branch_tree bt ON b.parent_branch_id = bt.id
)
UPDATE branches b
SET branch_path = bt.computed_path
FROM branch_tree bt
WHERE b.id = bt.id AND b.branch_path = '';
