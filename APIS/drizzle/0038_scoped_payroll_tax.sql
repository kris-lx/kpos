DROP INDEX IF EXISTS "user_stores_user_store_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "user_stores_user_store_whole_idx"
    ON "user_stores" ("user_id", "store_id") WHERE "branch_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "user_stores_user_store_branch_idx"
    ON "user_stores" ("user_id", "store_id", "branch_id") WHERE "branch_id" IS NOT NULL;

ALTER TABLE "employee_compensation"
    ADD COLUMN IF NOT EXISTS "tax_exempt_amount" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "social_security_enabled" boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "payroll_tax_profiles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "store_id" uuid,
    "branch_id" uuid,
    "name" text NOT NULL,
    "currency" text NOT NULL DEFAULT 'LAK',
    "effective_from" timestamp NOT NULL,
    "effective_to" timestamp,
    "tax_brackets" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "taxable_deduction" double precision NOT NULL DEFAULT 0,
    "employee_social_rate" double precision NOT NULL DEFAULT 0,
    "employer_social_rate" double precision NOT NULL DEFAULT 0,
    "social_contribution_cap" double precision NOT NULL DEFAULT 0,
    "source_reference" text,
    "status" text NOT NULL DEFAULT 'ACTIVE',
    "created_by" uuid NOT NULL,
    "updated_by" uuid,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payroll_tax_profiles_tenant_effective_idx" ON "payroll_tax_profiles" ("tenant_id", "effective_from");
CREATE INDEX IF NOT EXISTS "payroll_tax_profiles_scope_idx" ON "payroll_tax_profiles" ("store_id", "branch_id", "status");

ALTER TABLE "payroll_periods"
    ADD COLUMN IF NOT EXISTS "total_income_tax" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "total_employee_social" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "total_employer_social" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "total_employer_cost" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "tax_profile_id" uuid;

ALTER TABLE "payroll_items"
    ADD COLUMN IF NOT EXISTS "store_id" uuid,
    ADD COLUMN IF NOT EXISTS "branch_id" uuid,
    ADD COLUMN IF NOT EXISTS "taxable_income" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "income_tax" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "employee_social_security" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "employer_social_security" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "other_deductions" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "employer_cost" double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "tax_profile_id" uuid,
    ADD COLUMN IF NOT EXISTS "calculation_details" jsonb;
CREATE INDEX IF NOT EXISTS "payroll_items_scope_idx" ON "payroll_items" ("tenant_id", "store_id", "branch_id");

ALTER TABLE "payroll_payments"
    ADD COLUMN IF NOT EXISTS "store_id" uuid,
    ADD COLUMN IF NOT EXISTS "branch_id" uuid;
CREATE INDEX IF NOT EXISTS "payroll_payments_scope_idx" ON "payroll_payments" ("tenant_id", "store_id", "branch_id", "paid_at");
