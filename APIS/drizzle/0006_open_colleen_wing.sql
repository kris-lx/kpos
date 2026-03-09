CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "platform_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"tenant_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope" text DEFAULT 'merchant' NOT NULL,
	"store_id" uuid,
	"granted_by" uuid,
	"granted_at" timestamp DEFAULT now() NOT NULL
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
ALTER TABLE "price_levels" DROP CONSTRAINT "price_levels_name_unique";--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_po_number_unique";--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "roles_name_unique";--> statement-breakpoint
ALTER TABLE "rules" DROP CONSTRAINT "rules_name_unique";--> statement-breakpoint
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_shift_no_unique";--> statement-breakpoint
ALTER TABLE "sku_variants" DROP CONSTRAINT "sku_variants_sku_unique";--> statement-breakpoint
ALTER TABLE "sku_variants" DROP CONSTRAINT "sku_variants_barcode_unique";--> statement-breakpoint
ALTER TABLE "stock_counts" DROP CONSTRAINT "stock_counts_count_no_unique";--> statement-breakpoint
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_transfer_no_unique";--> statement-breakpoint
ALTER TABLE "stores" DROP CONSTRAINT "stores_code_unique";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_transaction_no_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
DROP INDEX "product_stores_store_active_idx";--> statement-breakpoint
DROP INDEX "product_stores_product_idx";--> statement-breakpoint
DROP INDEX "user_stores_store_idx";--> statement-breakpoint
DROP INDEX "user_stores_branch_idx";--> statement-breakpoint
DROP INDEX "user_stores_user_default_idx";--> statement-breakpoint
DROP INDEX "users_tenant_role_idx";--> statement-breakpoint
DROP INDEX "users_tenant_active_idx";--> statement-breakpoint
DROP INDEX "users_role_active_idx";--> statement-breakpoint
DROP INDEX "users_branch_idx";--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "checksum" text;--> statement-breakpoint
ALTER TABLE "bill_of_materials" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "point_history" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "points_history" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "role_rules" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "mask_low" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "mask_high" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "jti" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "revoked_at" timestamp;--> statement-breakpoint
ALTER TABLE "sku_variants" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "delete_after" timestamp;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction_payments" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
CREATE INDEX "platform_audit_logs_actor_idx" ON "platform_audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "platform_audit_logs_tenant_idx" ON "platform_audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_assignments_unique_idx" ON "user_role_assignments" USING btree ("tenant_id","user_id","role_id","store_id");--> statement-breakpoint
CREATE INDEX "user_role_assignments_user_idx" ON "user_role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_tenant_code_idx" ON "branches" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_slug_idx" ON "categories" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_tenant_code_idx" ON "coupons" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "document_templates_tenant_type_idx" ON "document_templates" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_tenant_no_idx" ON "documents" USING btree ("tenant_id","document_no");--> statement-breakpoint
CREATE UNIQUE INDEX "members_tenant_phone_idx" ON "members" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_tiers_tenant_name_idx" ON "membership_tiers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_no_idx" ON "orders" USING btree ("tenant_id","order_no");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_tenant_code_idx" ON "payment_methods" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "price_levels_tenant_name_idx" ON "price_levels" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_tenant_po_idx" ON "purchase_orders" USING btree ("tenant_id","po_number");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_tenant_name_idx" ON "roles" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "rules_tenant_name_idx" ON "rules" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_tenant_no_idx" ON "shifts" USING btree ("tenant_id","shift_no");--> statement-breakpoint
CREATE UNIQUE INDEX "sku_variants_tenant_sku_idx" ON "sku_variants" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_counts_tenant_no_idx" ON "stock_counts" USING btree ("tenant_id","count_no");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transfers_tenant_no_idx" ON "stock_transfers" USING btree ("tenant_id","transfer_no");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_tenant_code_idx" ON "stores" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_tenant_no_idx" ON "transactions" USING btree ("tenant_id","transaction_no");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email_idx" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_jti_unique" UNIQUE("jti");