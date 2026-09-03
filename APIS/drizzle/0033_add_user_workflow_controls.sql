ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "maker_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "checker_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "requires_shift" boolean DEFAULT true NOT NULL;
--> statement-breakpoint

-- Preserve the existing approval behavior for users who already hold an
-- approval permission. New users remain checker=false until an owner or
-- branch admin explicitly assigns them as a checker.
UPDATE "users" u
SET "checker_enabled" = true
WHERE "checker_enabled" = false
  AND (
      'sales:delete' = ANY(COALESCE(u."permissions", ARRAY[]::text[]))
      OR 'inventory:update' = ANY(COALESCE(u."permissions", ARRAY[]::text[]))
      OR EXISTS (
          SELECT 1
          FROM "roles" r
          WHERE r."id" = u."role_id"
            AND (
                'sales:delete' = ANY(COALESCE(r."permissions", ARRAY[]::text[]))
                OR 'inventory:update' = ANY(COALESCE(r."permissions", ARRAY[]::text[]))
            )
      )
  );
