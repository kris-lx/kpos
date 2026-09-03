CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "payroll_work_policies"
    ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'Asia/Vientiane',
    ADD COLUMN IF NOT EXISTS "late_grace_minutes" integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "early_leave_grace_minutes" integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "late_deduction_multiplier" double precision NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "early_leave_deduction_multiplier" double precision NOT NULL DEFAULT 1;

ALTER TABLE "payroll_items"
    ADD COLUMN IF NOT EXISTS "late_minutes" integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "early_leave_minutes" integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "attendance_deduction" double precision NOT NULL DEFAULT 0;

ALTER TABLE "payroll_payments"
    ADD COLUMN IF NOT EXISTS "reversal_of_payment_id" uuid;

-- Older databases created this uniqueness rule as a table constraint while
-- newer snapshots may expose it as a standalone index. Support both shapes.
ALTER TABLE "payroll_payments"
    DROP CONSTRAINT IF EXISTS "payroll_payments_item_idx";
DROP INDEX IF EXISTS "payroll_payments_item_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_payments_idempotency_idx"
    ON "payroll_payments" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "payroll_payments_item_history_idx"
    ON "payroll_payments" ("payroll_item_id", "paid_at");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payroll_periods_no_overlap'
    ) THEN
        ALTER TABLE "payroll_periods"
            ADD CONSTRAINT "payroll_periods_no_overlap"
            EXCLUDE USING gist (
                "branch_id" WITH =,
                tsrange("period_start", "period_end", '[]') WITH &&
            ) WHERE ("status" NOT IN ('CANCELLED', 'REVERSED'));
    END IF;
END;
$$;

ALTER TABLE "payroll_work_policies"
    DROP CONSTRAINT IF EXISTS "payroll_work_policies_late_grace_check",
    DROP CONSTRAINT IF EXISTS "payroll_work_policies_early_grace_check",
    DROP CONSTRAINT IF EXISTS "payroll_work_policies_late_multiplier_check",
    DROP CONSTRAINT IF EXISTS "payroll_work_policies_early_multiplier_check";

ALTER TABLE "payroll_work_policies"
    ADD CONSTRAINT "payroll_work_policies_late_grace_check" CHECK ("late_grace_minutes" BETWEEN 0 AND 180),
    ADD CONSTRAINT "payroll_work_policies_early_grace_check" CHECK ("early_leave_grace_minutes" BETWEEN 0 AND 180),
    ADD CONSTRAINT "payroll_work_policies_late_multiplier_check" CHECK ("late_deduction_multiplier" BETWEEN 0 AND 10),
    ADD CONSTRAINT "payroll_work_policies_early_multiplier_check" CHECK ("early_leave_deduction_multiplier" BETWEEN 0 AND 10);
