CREATE TABLE IF NOT EXISTS "attendance_records" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "store_id" uuid NOT NULL,
    "branch_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "work_date" text NOT NULL,
    "clock_in_at" timestamp NOT NULL,
    "clock_out_at" timestamp,
    "scheduled_start_at" timestamp,
    "scheduled_end_at" timestamp,
    "timezone" text NOT NULL DEFAULT 'Asia/Vientiane',
    "status" text NOT NULL DEFAULT 'OPEN',
    "late_minutes" integer NOT NULL DEFAULT 0,
    "early_leave_minutes" integer NOT NULL DEFAULT 0,
    "worked_minutes" integer NOT NULL DEFAULT 0,
    "clock_in_source" text NOT NULL DEFAULT 'WEB',
    "clock_out_source" text,
    "note" text,
    "adjustment_reason" text,
    "created_by" uuid NOT NULL,
    "updated_by" uuid,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "attendance_records_work_date_check" CHECK ("work_date" ~ '^\d{4}-\d{2}-\d{2}$'),
    CONSTRAINT "attendance_records_status_check" CHECK ("status" IN ('OPEN', 'CLOSED', 'ADJUSTED', 'VOID')),
    CONSTRAINT "attendance_records_minutes_check" CHECK ("late_minutes" >= 0 AND "early_leave_minutes" >= 0 AND "worked_minutes" >= 0),
    CONSTRAINT "attendance_records_time_order_check" CHECK ("clock_out_at" IS NULL OR "clock_out_at" > "clock_in_at")
);

CREATE INDEX IF NOT EXISTS "attendance_records_tenant_date_idx" ON "attendance_records" ("tenant_id", "work_date");
CREATE INDEX IF NOT EXISTS "attendance_records_branch_clock_in_idx" ON "attendance_records" ("branch_id", "clock_in_at");
CREATE INDEX IF NOT EXISTS "attendance_records_user_clock_in_idx" ON "attendance_records" ("user_id", "clock_in_at");
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_one_open_per_user_idx" ON "attendance_records" ("user_id") WHERE "status" = 'OPEN';

ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_records_tenant_isolation" ON "attendance_records";
CREATE POLICY "attendance_records_tenant_isolation" ON "attendance_records"
    USING (
        "tenant_id"::text = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    )
    WITH CHECK (
        "tenant_id"::text = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- Make the feature discoverable in existing installations. The production
-- seed performs the same upsert for fresh databases, while this migration
-- updates installations where the seed is intentionally not re-run.
INSERT INTO "permission_groups" ("key", "label", "icon", "color", "order", "is_active")
VALUES ('attendance', 'Attendance', 'CalendarClock', 'from-emerald-500 to-teal-500', 12, true)
ON CONFLICT ("key") DO UPDATE SET
    "label" = EXCLUDED."label", "icon" = EXCLUDED."icon", "color" = EXCLUDED."color",
    "is_active" = true, "updated_at" = now();

INSERT INTO "permissions" ("key", "label", "group_id", "order", "is_active")
SELECT permission_key, permission_label, pg.id, permission_order, true
FROM "permission_groups" pg
CROSS JOIN (VALUES
    ('attendance:clock', 'Clock in / clock out', 0),
    ('attendance:view', 'View attendance', 1),
    ('attendance:manage', 'Manage attendance', 2)
) AS catalog(permission_key, permission_label, permission_order)
WHERE pg."key" = 'attendance'
ON CONFLICT ("key") DO UPDATE SET
    "label" = EXCLUDED."label", "group_id" = EXCLUDED."group_id",
    "order" = EXCLUDED."order", "is_active" = true, "updated_at" = now();

INSERT INTO "menu_permissions" (
    "key", "label", "label_lao", "icon", "path", "parent_id",
    "required_permission", "order", "is_active"
)
SELECT
    'management.attendance', 'Attendance', 'ບັນທຶກເຂົ້າວຽກ', 'CalendarClock',
    '/staff/attendance', parent.id, 'attendance:clock', 3, true
FROM "menu_permissions" parent
WHERE parent."key" = 'management'
ON CONFLICT ("key") DO UPDATE SET
    "label" = EXCLUDED."label", "label_lao" = EXCLUDED."label_lao",
    "icon" = EXCLUDED."icon", "path" = EXCLUDED."path",
    "parent_id" = EXCLUDED."parent_id", "required_permission" = EXCLUDED."required_permission",
    "order" = EXCLUDED."order", "is_active" = true, "updated_at" = now();

UPDATE "menu_permissions"
SET "label" = 'Cash Shifts', "label_lao" = 'ກະເງິນສົດ', "icon" = 'Banknote',
    "required_permission" = 'sales:create', "updated_at" = now()
WHERE "key" = 'management.shifts';
