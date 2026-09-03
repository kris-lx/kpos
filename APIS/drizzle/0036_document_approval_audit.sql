ALTER TABLE "documents"
    ADD COLUMN IF NOT EXISTS "approved_by" uuid;
--> statement-breakpoint
ALTER TABLE "documents"
    ADD COLUMN IF NOT EXISTS "approved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "documents"
    ADD COLUMN IF NOT EXISTS "rejected_by" uuid;
--> statement-breakpoint
ALTER TABLE "documents"
    ADD COLUMN IF NOT EXISTS "rejected_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_approval_status_idx"
    ON "documents" USING btree ("tenant_id", "status", "updated_at");
