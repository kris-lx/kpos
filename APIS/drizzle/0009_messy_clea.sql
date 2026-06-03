DROP INDEX "roles_tenant_name_idx";--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "mask_low" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "mask_high" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_tenant_branch_name_idx" ON "roles" USING btree ("tenant_id","branch_id","name");--> statement-breakpoint
CREATE INDEX "roles_branch_idx" ON "roles" USING btree ("branch_id");