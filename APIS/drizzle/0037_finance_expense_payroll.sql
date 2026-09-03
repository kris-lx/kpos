ALTER TABLE "transactions"
    ADD COLUMN IF NOT EXISTS "points_redeem_amount" double precision NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "expenses" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "store_id" uuid,
    "branch_id" uuid NOT NULL,
    "category" text NOT NULL,
    "vendor" text,
    "reference" text,
    "description" text,
    "amount" double precision NOT NULL,
    "tax_amount" double precision NOT NULL DEFAULT 0,
    "payment_method" text,
    "expense_date" timestamp NOT NULL DEFAULT now(),
    "status" text NOT NULL DEFAULT 'DRAFT',
    "created_by" uuid NOT NULL,
    "submitted_by" uuid,
    "approved_by" uuid,
    "paid_by" uuid,
    "approved_at" timestamp,
    "paid_at" timestamp,
    "rejection_reason" text,
    "attachment_url" text,
    "idempotency_key" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "expenses_tenant_date_idx" ON "expenses" ("tenant_id", "expense_date");
CREATE INDEX IF NOT EXISTS "expenses_branch_date_idx" ON "expenses" ("branch_id", "expense_date");
CREATE INDEX IF NOT EXISTS "expenses_status_idx" ON "expenses" ("status");

CREATE TABLE IF NOT EXISTS "employee_compensation" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "store_id" uuid,
    "branch_id" uuid,
    "user_id" uuid NOT NULL,
    "pay_type" text NOT NULL DEFAULT 'MONTHLY',
    "base_rate" double precision NOT NULL DEFAULT 0,
    "allowance" double precision NOT NULL DEFAULT 0,
    "default_deduction" double precision NOT NULL DEFAULT 0,
    "effective_from" timestamp NOT NULL,
    "effective_to" timestamp,
    "status" text NOT NULL DEFAULT 'ACTIVE',
    "created_by" uuid NOT NULL,
    "updated_by" uuid,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "employee_compensation_user_effective_idx" ON "employee_compensation" ("user_id", "effective_from");
CREATE INDEX IF NOT EXISTS "employee_compensation_tenant_idx" ON "employee_compensation" ("tenant_id");

CREATE TABLE IF NOT EXISTS "payroll_periods" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "store_id" uuid,
    "branch_id" uuid,
    "period_start" timestamp NOT NULL,
    "period_end" timestamp NOT NULL,
    "status" text NOT NULL DEFAULT 'OPEN',
    "total_gross" double precision NOT NULL DEFAULT 0,
    "total_deductions" double precision NOT NULL DEFAULT 0,
    "total_net" double precision NOT NULL DEFAULT 0,
    "created_by" uuid NOT NULL,
    "submitted_by" uuid,
    "approved_by" uuid,
    "paid_by" uuid,
    "approved_at" timestamp,
    "paid_at" timestamp,
    "closed_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payroll_periods_tenant_start_idx" ON "payroll_periods" ("tenant_id", "period_start");
CREATE INDEX IF NOT EXISTS "payroll_periods_branch_start_idx" ON "payroll_periods" ("branch_id", "period_start");
CREATE INDEX IF NOT EXISTS "payroll_periods_status_idx" ON "payroll_periods" ("status");

CREATE TABLE IF NOT EXISTS "payroll_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "period_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "pay_type" text NOT NULL,
    "hours_worked" double precision NOT NULL DEFAULT 0,
    "base_pay" double precision NOT NULL DEFAULT 0,
    "overtime_pay" double precision NOT NULL DEFAULT 0,
    "commission" double precision NOT NULL DEFAULT 0,
    "allowance" double precision NOT NULL DEFAULT 0,
    "deductions" double precision NOT NULL DEFAULT 0,
    "gross_pay" double precision NOT NULL DEFAULT 0,
    "net_pay" double precision NOT NULL DEFAULT 0,
    "adjustment_reason" text,
    "expense_id" uuid,
    "status" text NOT NULL DEFAULT 'DRAFT',
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "payroll_items_period_user_idx" UNIQUE ("period_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "payroll_items_tenant_idx" ON "payroll_items" ("tenant_id");

CREATE TABLE IF NOT EXISTS "payroll_payments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "period_id" uuid NOT NULL,
    "payroll_item_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "amount" double precision NOT NULL,
    "payment_method" text NOT NULL,
    "reference" text,
    "idempotency_key" text,
    "paid_by" uuid NOT NULL,
    "paid_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "payroll_payments_item_idx" UNIQUE ("payroll_item_id")
);
CREATE INDEX IF NOT EXISTS "payroll_payments_tenant_date_idx" ON "payroll_payments" ("tenant_id", "paid_at");
