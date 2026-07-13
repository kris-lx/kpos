CREATE TABLE "sso_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sso_providers_tenant_name_idx" ON "sso_providers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "sso_providers_tenant_idx" ON "sso_providers" USING btree ("tenant_id");--> statement-breakpoint

-- Apply the same tenant-isolation RLS policy used on every other tenant table
-- (see 0017_reenable_rls_enforcement.sql) — sso_providers is created after
-- that migration's discovery loop ran, so it needs its own explicit policy
-- rather than relying on re-running the loop.
ALTER TABLE "sso_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sso_providers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sso_providers_tenant_isolation" ON "sso_providers"
  USING ( tenant_id IS NULL OR tenant_id::text = current_setting('app.current_tenant_id', true) )
  WITH CHECK ( tenant_id IS NULL OR tenant_id::text = current_setting('app.current_tenant_id', true) );