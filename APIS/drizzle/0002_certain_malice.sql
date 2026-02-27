CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"logo" text,
	"business_type" text,
	"tax_id" text,
	"phone" text,
	"email" text,
	"address" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "branches" DROP CONSTRAINT "branches_code_unique";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_slug_unique";--> statement-breakpoint
ALTER TABLE "coupons" DROP CONSTRAINT "coupons_code_unique";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_member_code_unique";--> statement-breakpoint
ALTER TABLE "document_templates" DROP CONSTRAINT "document_templates_type_unique";--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_document_no_unique";--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT "members_card_number_unique";--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT "members_phone_unique";--> statement-breakpoint
ALTER TABLE "membership_tiers" DROP CONSTRAINT "membership_tiers_name_unique";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_order_no_unique";--> statement-breakpoint
ALTER TABLE "payment_methods" DROP CONSTRAINT "payment_methods_code_unique";--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_po_number_unique";--> statement-breakpoint
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_shift_no_unique";--> statement-breakpoint
ALTER TABLE "stock_counts" DROP CONSTRAINT "stock_counts_count_no_unique";--> statement-breakpoint
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_transfer_no_unique";--> statement-breakpoint
ALTER TABLE "stores" DROP CONSTRAINT "stores_code_unique";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_transaction_no_unique";--> statement-breakpoint
DROP INDEX "settings_category_key_branch_idx";--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "receipt_settings" jsonb;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "document_templates" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "held_sales" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "point_settings" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "product_stores" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "user_stores" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "branches_tenant_code_idx" ON "branches" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "branches_tenant_idx" ON "branches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "categories_tenant_idx" ON "categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_slug_idx" ON "categories" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "coupons_tenant_idx" ON "coupons" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_tenant_code_idx" ON "coupons" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "customers_tenant_idx" ON "customers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "discounts_tenant_idx" ON "discounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "documents_tenant_idx" ON "documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_tenant_no_idx" ON "documents" USING btree ("tenant_id","document_no");--> statement-breakpoint
CREATE INDEX "inventory_tenant_idx" ON "inventory" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "members_tenant_idx" ON "members" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_tenant_card_idx" ON "members" USING btree ("tenant_id","card_number");--> statement-breakpoint
CREATE UNIQUE INDEX "members_tenant_phone_idx" ON "members" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "membership_tiers_tenant_idx" ON "membership_tiers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_tiers_tenant_name_idx" ON "membership_tiers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "orders_tenant_idx" ON "orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_no_idx" ON "orders" USING btree ("tenant_id","order_no");--> statement-breakpoint
CREATE INDEX "payment_methods_tenant_idx" ON "payment_methods" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "promotions_tenant_idx" ON "promotions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_tenant_idx" ON "purchase_orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_tenant_no_idx" ON "purchase_orders" USING btree ("tenant_id","po_number");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_tenant_category_key_branch_idx" ON "settings" USING btree ("tenant_id","category","key","branch_id");--> statement-breakpoint
CREATE INDEX "shifts_tenant_idx" ON "shifts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_tenant_no_idx" ON "shifts" USING btree ("tenant_id","shift_no");--> statement-breakpoint
CREATE INDEX "stock_counts_tenant_idx" ON "stock_counts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_counts_tenant_no_idx" ON "stock_counts" USING btree ("tenant_id","count_no");--> statement-breakpoint
CREATE INDEX "stock_transfers_tenant_idx" ON "stock_transfers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transfers_tenant_no_idx" ON "stock_transfers" USING btree ("tenant_id","transfer_no");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_tenant_code_idx" ON "stores" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "stores_tenant_idx" ON "stores" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "transactions_tenant_idx" ON "transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_tenant_no_idx" ON "transactions" USING btree ("tenant_id","transaction_no");