DROP INDEX "branches_tenant_code_idx";--> statement-breakpoint
DROP INDEX "categories_tenant_idx";--> statement-breakpoint
DROP INDEX "categories_tenant_slug_idx";--> statement-breakpoint
DROP INDEX "coupons_tenant_idx";--> statement-breakpoint
DROP INDEX "coupons_tenant_code_idx";--> statement-breakpoint
DROP INDEX "customers_tenant_idx";--> statement-breakpoint
DROP INDEX "discounts_tenant_idx";--> statement-breakpoint
DROP INDEX "documents_tenant_idx";--> statement-breakpoint
DROP INDEX "documents_tenant_no_idx";--> statement-breakpoint
DROP INDEX "inventory_tenant_idx";--> statement-breakpoint
DROP INDEX "members_tenant_idx";--> statement-breakpoint
DROP INDEX "members_tenant_card_idx";--> statement-breakpoint
DROP INDEX "members_tenant_phone_idx";--> statement-breakpoint
DROP INDEX "membership_tiers_tenant_idx";--> statement-breakpoint
DROP INDEX "membership_tiers_tenant_name_idx";--> statement-breakpoint
DROP INDEX "orders_tenant_idx";--> statement-breakpoint
DROP INDEX "orders_tenant_no_idx";--> statement-breakpoint
DROP INDEX "payment_methods_tenant_idx";--> statement-breakpoint
DROP INDEX "promotions_tenant_idx";--> statement-breakpoint
DROP INDEX "purchase_orders_tenant_idx";--> statement-breakpoint
DROP INDEX "purchase_orders_tenant_no_idx";--> statement-breakpoint
DROP INDEX "settings_tenant_category_key_branch_idx";--> statement-breakpoint
DROP INDEX "shifts_tenant_idx";--> statement-breakpoint
DROP INDEX "shifts_tenant_no_idx";--> statement-breakpoint
DROP INDEX "stock_counts_tenant_idx";--> statement-breakpoint
DROP INDEX "stock_counts_tenant_no_idx";--> statement-breakpoint
DROP INDEX "stock_transfers_tenant_idx";--> statement-breakpoint
DROP INDEX "stock_transfers_tenant_no_idx";--> statement-breakpoint
DROP INDEX "stores_tenant_code_idx";--> statement-breakpoint
DROP INDEX "stores_tenant_idx";--> statement-breakpoint
DROP INDEX "transactions_tenant_idx";--> statement-breakpoint
DROP INDEX "transactions_tenant_no_idx";--> statement-breakpoint
ALTER TABLE "branches" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_registers" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "held_sales" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_tiers" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "point_settings" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settlements" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_counts" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tables" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_stores" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "price_levels" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "store_requests" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "settings_category_key_branch_idx" ON "settings" USING btree ("category","key","branch_id");--> statement-breakpoint
ALTER TABLE "product_stores" DROP COLUMN "tenant_id";--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_code_unique" UNIQUE("code");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_code_unique" UNIQUE("code");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_member_code_unique" UNIQUE("member_code");--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_type_unique" UNIQUE("type");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_document_no_unique" UNIQUE("document_no");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_card_number_unique" UNIQUE("card_number");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_phone_unique" UNIQUE("phone");--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_no_unique" UNIQUE("order_no");--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_code_unique" UNIQUE("code");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number");--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_shift_no_unique" UNIQUE("shift_no");--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_count_no_unique" UNIQUE("count_no");--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_transfer_no_unique" UNIQUE("transfer_no");--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_code_unique" UNIQUE("code");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transaction_no_unique" UNIQUE("transaction_no");