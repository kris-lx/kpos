ALTER TABLE "activity_logs"
    ADD COLUMN IF NOT EXISTS "store_id" uuid;
--> statement-breakpoint
ALTER TABLE "activity_logs"
    ADD COLUMN IF NOT EXISTS "branch_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_tenant_branch_created_idx"
    ON "activity_logs" USING btree ("tenant_id", "branch_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_tenant_store_created_idx"
    ON "activity_logs" USING btree ("tenant_id", "store_id", "created_at");
