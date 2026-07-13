CREATE TABLE "tenant_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"connected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_integrations_tenant_type_idx" ON "tenant_integrations" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE INDEX "tenant_integrations_tenant_idx" ON "tenant_integrations" USING btree ("tenant_id");--> statement-breakpoint

-- Apply the same tenant-isolation RLS policy used on every other tenant table
-- (see 0017_reenable_rls_enforcement.sql / 0018_shocking_ultimates.sql) —
-- tenant_integrations is created after the discovery-loop migration ran, so
-- it needs its own explicit policy rather than relying on re-running the loop.
ALTER TABLE "tenant_integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_integrations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_integrations_tenant_isolation" ON "tenant_integrations"
  USING ( tenant_id IS NULL OR tenant_id::text = current_setting('app.current_tenant_id', true) )
  WITH CHECK ( tenant_id IS NULL OR tenant_id::text = current_setting('app.current_tenant_id', true) );