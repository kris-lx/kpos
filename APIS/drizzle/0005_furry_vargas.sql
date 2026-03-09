CREATE INDEX "product_stores_store_active_idx" ON "product_stores" USING btree ("store_id","is_active");--> statement-breakpoint
CREATE INDEX "product_stores_product_idx" ON "product_stores" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "user_stores_store_idx" ON "user_stores" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "user_stores_branch_idx" ON "user_stores" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "user_stores_user_default_idx" ON "user_stores" USING btree ("user_id","is_default");--> statement-breakpoint
CREATE INDEX "users_tenant_role_idx" ON "users" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE INDEX "users_tenant_active_idx" ON "users" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "users_role_active_idx" ON "users" USING btree ("role","is_active");--> statement-breakpoint
CREATE INDEX "users_branch_idx" ON "users" USING btree ("branch_id");