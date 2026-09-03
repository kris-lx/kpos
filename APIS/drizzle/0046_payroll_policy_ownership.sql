-- Separate salary/compensation maintenance from owner-controlled statutory
-- and work/OT policy configuration. Existing level-2 owner roles that already
-- had payroll compensation access receive the new policy permission so this
-- migration does not lock current store owners out.
INSERT INTO "permissions" ("key", "label", "group_id", "order", "is_active")
SELECT 'payroll:policy', 'policy', permission_groups.id, 5, true
FROM "permission_groups"
WHERE permission_groups.key = 'payroll'
ON CONFLICT ("key") DO UPDATE SET
    "label" = EXCLUDED."label",
    "is_active" = true,
    "updated_at" = now();

UPDATE "roles"
SET "permissions" = array_append(COALESCE("permissions", ARRAY[]::text[]), 'payroll:policy'),
    "updated_at" = now()
WHERE "level" <= 2
  AND COALESCE("permissions", ARRAY[]::text[]) @> ARRAY['payroll:compensation']::text[]
  AND NOT (COALESCE("permissions", ARRAY[]::text[]) @> ARRAY['payroll:policy']::text[]);
