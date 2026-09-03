ALTER TABLE "employee_compensation"
    ADD COLUMN IF NOT EXISTS "overtime_eligible" boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "payroll_work_policies" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "store_id" uuid NOT NULL,
    "branch_id" uuid NOT NULL,
    "name" text NOT NULL,
    "effective_from" timestamp NOT NULL,
    "effective_to" timestamp,
    "standard_hours_per_day" double precision NOT NULL,
    "monthly_work_days" double precision NOT NULL,
    "overtime_multiplier" double precision NOT NULL,
    "weekend_multiplier" double precision NOT NULL,
    "holiday_multiplier" double precision NOT NULL,
    "rounding_minutes" integer NOT NULL DEFAULT 1,
    "max_shift_hours" double precision NOT NULL DEFAULT 24,
    "weekend_days" jsonb NOT NULL DEFAULT '[0]'::jsonb,
    "holiday_dates" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "source_reference" text,
    "status" text NOT NULL DEFAULT 'ACTIVE',
    "created_by" uuid NOT NULL,
    "updated_by" uuid,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payroll_work_policies_scope_effective_idx" ON "payroll_work_policies" ("branch_id", "status", "effective_from");
CREATE INDEX IF NOT EXISTS "payroll_work_policies_tenant_idx" ON "payroll_work_policies" ("tenant_id");

ALTER TABLE "payroll_periods"
    ADD COLUMN IF NOT EXISTS "work_policy_id" uuid;

ALTER TABLE "payroll_items"
    ADD COLUMN IF NOT EXISTS "regular_hours" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "overtime_hours" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "weekend_hours" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "holiday_hours" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "attendance_days" double precision NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "payroll_adjustments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "store_id" uuid NOT NULL,
    "branch_id" uuid NOT NULL,
    "period_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "type" text NOT NULL,
    "amount" double precision NOT NULL,
    "reason" text NOT NULL,
    "status" text NOT NULL DEFAULT 'PENDING_APPROVAL',
    "created_by" uuid NOT NULL,
    "approved_by" uuid,
    "approved_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payroll_adjustments_period_user_idx" ON "payroll_adjustments" ("period_id", "user_id");
CREATE INDEX IF NOT EXISTS "payroll_adjustments_scope_status_idx" ON "payroll_adjustments" ("branch_id", "status");

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['payroll_work_policies', 'payroll_adjustments']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_tenant_isolation', tbl);
        EXECUTE format(
            'CREATE POLICY %I ON %I '
            'USING ( tenant_id::text = current_setting(''app.current_tenant_id'', true) OR current_setting(''app.bypass_rls'', true) = ''true'' ) '
            'WITH CHECK ( tenant_id::text = current_setting(''app.current_tenant_id'', true) OR current_setting(''app.bypass_rls'', true) = ''true'' )',
            tbl || '_tenant_isolation', tbl
        );
    END LOOP;
END;
$$;
