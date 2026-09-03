CREATE TABLE IF NOT EXISTS "employee_work_schedules" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "store_id" uuid NOT NULL,
    "branch_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" text NOT NULL,
    "end_time" text NOT NULL,
    "timezone" text NOT NULL DEFAULT 'Asia/Vientiane',
    "early_clock_out_grace_minutes" integer NOT NULL DEFAULT 0,
    "effective_from" timestamp NOT NULL DEFAULT now(),
    "effective_to" timestamp,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_by" uuid NOT NULL,
    "updated_by" uuid,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "employee_work_schedules_day_check" CHECK ("day_of_week" BETWEEN 0 AND 6),
    CONSTRAINT "employee_work_schedules_start_time_check" CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "employee_work_schedules_end_time_check" CHECK ("end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "employee_work_schedules_grace_check" CHECK ("early_clock_out_grace_minutes" BETWEEN 0 AND 180)
);

CREATE INDEX IF NOT EXISTS "employee_work_schedules_user_branch_effective_idx"
    ON "employee_work_schedules" ("user_id", "branch_id", "effective_from");
CREATE INDEX IF NOT EXISTS "employee_work_schedules_tenant_idx"
    ON "employee_work_schedules" ("tenant_id");
CREATE INDEX IF NOT EXISTS "employee_work_schedules_scope_active_idx"
    ON "employee_work_schedules" ("branch_id", "is_active", "day_of_week");
CREATE UNIQUE INDEX IF NOT EXISTS "employee_work_schedules_current_day_idx"
    ON "employee_work_schedules" ("user_id", "branch_id", "day_of_week")
    WHERE "is_active" = true;

ALTER TABLE "employee_work_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_work_schedules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employee_work_schedules_tenant_isolation" ON "employee_work_schedules";
CREATE POLICY "employee_work_schedules_tenant_isolation" ON "employee_work_schedules"
    USING (
        "tenant_id"::text = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    )
    WITH CHECK (
        "tenant_id"::text = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    );
