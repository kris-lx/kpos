CREATE TABLE IF NOT EXISTS "print_jobs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "store_id" uuid,
    "branch_id" uuid,
    "printer_setting_id" uuid NOT NULL,
    "document_type" text NOT NULL,
    "reference" text,
    "idempotency_key" text NOT NULL,
    "status" text DEFAULT 'QUEUED' NOT NULL,
    "transport" text DEFAULT 'network' NOT NULL,
    "protocol" text NOT NULL,
    "payload" jsonb NOT NULL,
    "requested_by" uuid NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "last_error" text,
    "queued_at" timestamp DEFAULT now() NOT NULL,
    "started_at" timestamp,
    "printed_at" timestamp,
    "failed_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "print_jobs_document_type_check" CHECK ("document_type" IN ('receipt', 'label')),
    CONSTRAINT "print_jobs_status_check" CHECK ("status" IN ('QUEUED', 'PROCESSING', 'PRINTED', 'FAILED')),
    CONSTRAINT "print_jobs_transport_check" CHECK ("transport" IN ('network')),
    CONSTRAINT "print_jobs_attempts_check" CHECK ("attempts" >= 0 AND "max_attempts" BETWEEN 1 AND 10)
);
CREATE UNIQUE INDEX IF NOT EXISTS "print_jobs_tenant_idempotency_idx" ON "print_jobs" ("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "print_jobs_tenant_created_idx" ON "print_jobs" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "print_jobs_branch_created_idx" ON "print_jobs" ("branch_id", "created_at");
CREATE INDEX IF NOT EXISTS "print_jobs_status_queued_idx" ON "print_jobs" ("status", "queued_at");

ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "print_jobs_tenant_isolation" ON "print_jobs";
CREATE POLICY "print_jobs_tenant_isolation" ON "print_jobs"
USING (
    tenant_id::text = current_setting('app.current_tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
)
WITH CHECK (
    tenant_id::text = current_setting('app.current_tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
);

INSERT INTO "permission_groups" ("key", "label", "icon", "color", "order", "is_active")
VALUES ('printing', 'Printing', 'Printer', 'from-cyan-500 to-blue-500', 18, true)
ON CONFLICT ("key") DO UPDATE SET
    "label" = EXCLUDED."label",
    "icon" = EXCLUDED."icon",
    "color" = EXCLUDED."color",
    "is_active" = true,
    "updated_at" = now();

INSERT INTO "permissions" ("key", "label", "group_id", "order", "is_active")
SELECT values_to_add.key, values_to_add.label, permission_groups.id, values_to_add.sort_order, true
FROM "permission_groups"
CROSS JOIN (VALUES
    ('printing:view', 'View print jobs', 0),
    ('printing:receipt', 'Print POS receipts', 1),
    ('printing:label', 'Print barcode and QR labels', 2),
    ('printing:reprint', 'Retry or reprint documents', 3),
    ('printing:manage', 'Manage printers', 4)
) AS values_to_add(key, label, sort_order)
WHERE permission_groups.key = 'printing'
ON CONFLICT ("key") DO UPDATE SET
    "label" = EXCLUDED."label",
    "group_id" = EXCLUDED."group_id",
    "order" = EXCLUDED."order",
    "is_active" = true,
    "updated_at" = now();

-- Preserve existing access while separating printing from broad sales,
-- product and settings permissions for all future role edits.
UPDATE "roles"
SET "permissions" = (
        SELECT ARRAY(SELECT DISTINCT permission FROM unnest(
            COALESCE("roles"."permissions", ARRAY[]::text[])
            || CASE WHEN COALESCE("roles"."permissions", ARRAY[]::text[]) && ARRAY['sales:create']::text[]
                    THEN ARRAY['printing:view', 'printing:receipt']::text[] ELSE ARRAY[]::text[] END
            || CASE WHEN COALESCE("roles"."permissions", ARRAY[]::text[]) && ARRAY['products:view']::text[]
                    THEN ARRAY['printing:view', 'printing:label']::text[] ELSE ARRAY[]::text[] END
            || CASE WHEN COALESCE("roles"."permissions", ARRAY[]::text[]) && ARRAY['settings:update']::text[]
                    THEN ARRAY['printing:view', 'printing:reprint', 'printing:manage']::text[] ELSE ARRAY[]::text[] END
        ) AS permission)
    ),
    "updated_at" = now()
WHERE COALESCE("permissions", ARRAY[]::text[]) && ARRAY['sales:create', 'products:view', 'settings:update']::text[];
