DROP INDEX "settings_category_key_branch_idx";--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "product_price_levels" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "product_stores" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "store_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "theme" jsonb;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "merchant_id" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "payment_gateway" text;--> statement-breakpoint
CREATE INDEX "cash_registers_tenant_idx" ON "cash_registers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cash_registers_store_idx" ON "cash_registers" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "customers_tenant_idx" ON "customers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "inventory_tenant_idx" ON "inventory" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_price_levels_tenant_idx" ON "product_price_levels" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_stores_tenant_idx" ON "product_stores" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "products_tenant_idx" ON "products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "products_branch_idx" ON "products" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_tenant_cat_key_branch_store_idx" ON "settings" USING btree ("tenant_id","category","key","branch_id","store_id");--> statement-breakpoint
CREATE INDEX "settings_tenant_idx" ON "settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "settlements_tenant_idx" ON "settlements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "settlements_branch_idx" ON "settlements" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "settlements_store_idx" ON "settlements" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "shifts_tenant_idx" ON "shifts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_idx" ON "stock_movements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "transactions_tenant_idx" ON "transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "vendors_tenant_idx" ON "vendors" USING btree ("tenant_id");