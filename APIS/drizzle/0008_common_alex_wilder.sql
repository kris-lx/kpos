ALTER TABLE "branches" ADD COLUMN "parent_branch_id" uuid;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "branch_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "owner_name" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "owner_phone" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "owner_email" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "registration_no" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "website" text;--> statement-breakpoint
CREATE INDEX "branches_parent_idx" ON "branches" USING btree ("parent_branch_id");--> statement-breakpoint
CREATE INDEX "branches_path_idx" ON "branches" USING btree ("branch_path");