ALTER TABLE "payroll_periods"
    ADD COLUMN IF NOT EXISTS "currency" text NOT NULL DEFAULT 'LAK',
    ADD COLUMN IF NOT EXISTS "rejection_reason" text,
    ADD COLUMN IF NOT EXISTS "reversal_reason" text;

ALTER TABLE "payroll_items"
    ADD COLUMN IF NOT EXISTS "currency" text NOT NULL DEFAULT 'LAK',
    ADD COLUMN IF NOT EXISTS "reimbursement" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "scheduled_days" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "absence_days" double precision NOT NULL DEFAULT 0;

ALTER TABLE "payroll_payments"
    ADD COLUMN IF NOT EXISTS "currency" text NOT NULL DEFAULT 'LAK';

ALTER TABLE "payroll_adjustments"
    ADD COLUMN IF NOT EXISTS "reviewed_by" uuid,
    ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp,
    ADD COLUMN IF NOT EXISTS "review_reason" text;

ALTER TABLE "payroll_work_policies"
    ADD COLUMN IF NOT EXISTS "overtime_evening_multiplier" double precision NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS "overtime_night_multiplier" double precision NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS "weekend_evening_multiplier" double precision NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS "weekend_night_multiplier" double precision NOT NULL DEFAULT 3.5,
    ADD COLUMN IF NOT EXISTS "holiday_evening_multiplier" double precision NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS "holiday_night_multiplier" double precision NOT NULL DEFAULT 3.5,
    ADD COLUMN IF NOT EXISTS "night_shift_premium_rate" double precision NOT NULL DEFAULT 0.15;

ALTER TABLE "employee_compensation"
    ADD COLUMN IF NOT EXISTS "commission_rate" double precision NOT NULL DEFAULT 0;

-- Apply integrity rules to every new payroll write while allowing an existing
-- installation to migrate before historical rows are validated explicitly.
ALTER TABLE "employee_compensation"
    ADD CONSTRAINT "employee_compensation_pay_type_check"
        CHECK ("pay_type" IN ('MONTHLY', 'DAILY', 'HOURLY', 'COMMISSION')) NOT VALID,
    ADD CONSTRAINT "employee_compensation_amounts_check"
        CHECK ("base_rate" >= 0 AND "allowance" >= 0 AND "default_deduction" >= 0 AND "tax_exempt_amount" >= 0 AND "commission_rate" BETWEEN 0 AND 1) NOT VALID,
    ADD CONSTRAINT "employee_compensation_dates_check"
        CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from") NOT VALID;

ALTER TABLE "payroll_periods"
    ADD CONSTRAINT "payroll_periods_status_check"
        CHECK ("status" IN ('OPEN', 'CALCULATING', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'CANCELLED', 'REVERSED')) NOT VALID,
    ADD CONSTRAINT "payroll_periods_dates_check"
        CHECK ("period_end" > "period_start") NOT VALID,
    ADD CONSTRAINT "payroll_periods_totals_check"
        CHECK ("total_gross" >= 0 AND "total_deductions" >= 0 AND "total_income_tax" >= 0 AND "total_employee_social" >= 0 AND "total_employer_social" >= 0 AND "total_employer_cost" >= 0 AND "total_net" >= 0) NOT VALID;

ALTER TABLE "payroll_items"
    ADD CONSTRAINT "payroll_items_status_check"
        CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'REVERSED')) NOT VALID,
    ADD CONSTRAINT "payroll_items_amounts_check"
        CHECK ("hours_worked" >= 0 AND "gross_pay" >= 0 AND "net_pay" >= 0 AND "deductions" >= 0 AND "employer_cost" >= 0 AND "reimbursement" >= 0 AND "scheduled_days" >= 0 AND "absence_days" >= 0) NOT VALID;

ALTER TABLE "payroll_adjustments"
    ADD CONSTRAINT "payroll_adjustments_type_check"
        CHECK ("type" IN ('BONUS', 'COMMISSION', 'ALLOWANCE', 'REIMBURSEMENT', 'DEDUCTION', 'UNPAID_LEAVE', 'LATE_DEDUCTION', 'ABSENCE_DEDUCTION')) NOT VALID,
    ADD CONSTRAINT "payroll_adjustments_status_check"
        CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED')) NOT VALID,
    ADD CONSTRAINT "payroll_adjustments_amount_check" CHECK ("amount" > 0) NOT VALID;

ALTER TABLE "payroll_tax_profiles"
    ADD CONSTRAINT "payroll_tax_profiles_dates_check"
        CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from") NOT VALID,
    ADD CONSTRAINT "payroll_tax_profiles_rates_check"
        CHECK ("employee_social_rate" BETWEEN 0 AND 1 AND "employer_social_rate" BETWEEN 0 AND 1 AND "social_contribution_cap" >= 0 AND "taxable_deduction" >= 0) NOT VALID;

ALTER TABLE "payroll_work_policies"
    ADD CONSTRAINT "payroll_work_policies_dates_check"
        CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from") NOT VALID,
    ADD CONSTRAINT "payroll_work_policies_multiplier_check"
        CHECK ("overtime_multiplier" >= 0 AND "overtime_evening_multiplier" >= 0 AND "overtime_night_multiplier" >= 0 AND "weekend_multiplier" >= 0 AND "weekend_evening_multiplier" >= 0 AND "weekend_night_multiplier" >= 0 AND "holiday_multiplier" >= 0 AND "holiday_evening_multiplier" >= 0 AND "holiday_night_multiplier" >= 0 AND "night_shift_premium_rate" BETWEEN 0 AND 1) NOT VALID;

ALTER TABLE "payroll_payments"
    ADD CONSTRAINT "payroll_payments_nonzero_check" CHECK ("amount" <> 0) NOT VALID,
    ADD CONSTRAINT "payroll_payments_method_check"
        CHECK ("payment_method" IN ('BANK_TRANSFER', 'CASH', 'MOBILE', 'OTHER', 'REVERSAL')) NOT VALID;

CREATE INDEX IF NOT EXISTS "payroll_periods_scope_status_idx"
    ON "payroll_periods" ("tenant_id", "store_id", "branch_id", "status");
CREATE INDEX IF NOT EXISTS "employee_compensation_scope_effective_idx"
    ON "employee_compensation" ("tenant_id", "store_id", "branch_id", "user_id", "effective_from");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_items_period_fk') THEN
        ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_period_fk"
            FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_adjustments_period_fk') THEN
        ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_period_fk"
            FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_payments_period_fk') THEN
        ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_period_fk"
            FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_payments_item_fk') THEN
        ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_item_fk"
            FOREIGN KEY ("payroll_item_id") REFERENCES "payroll_items"("id") ON DELETE RESTRICT NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_payments_reversal_fk') THEN
        ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_reversal_fk"
            FOREIGN KEY ("reversal_of_payment_id") REFERENCES "payroll_payments"("id") ON DELETE RESTRICT NOT VALID;
    END IF;
END;
$$;

-- Existing installations receive the new salary-confidentiality permissions
-- and self-service payslip menu without requiring a destructive reseed.
INSERT INTO "permissions" ("key", "label", "group_id", "order", "is_active")
SELECT values_to_add.key, values_to_add.label, permission_groups.id, values_to_add.sort_order, true
FROM (VALUES
    ('payroll:view_detail', 'view_detail', 1),
    ('payroll:view_self', 'view_self', 2)
) AS values_to_add(key, label, sort_order)
JOIN "permission_groups" ON permission_groups.key = 'payroll'
ON CONFLICT ("key") DO UPDATE SET "label" = EXCLUDED."label", "is_active" = true, "updated_at" = now();

INSERT INTO "menu_permissions" ("key", "label", "label_lao", "icon", "path", "required_permission", "order", "is_active")
VALUES ('my-payslips', 'My Payslips', 'ໃບເງິນເດືອນຂອງຂ້ອຍ', 'BadgeDollarSign', '/my-payslips', 'payroll:view_self', 95, true)
ON CONFLICT ("key") DO UPDATE SET
    "label" = EXCLUDED."label", "label_lao" = EXCLUDED."label_lao", "icon" = EXCLUDED."icon",
    "path" = EXCLUDED."path", "required_permission" = EXCLUDED."required_permission",
    "is_active" = true, "updated_at" = now();
