CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"template_key" text,
	"status" text NOT NULL,
	"error" text,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_providers" (
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
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"key" text NOT NULL,
	"subject" text NOT NULL,
	"html_body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE INDEX "email_logs_tenant_idx" ON "email_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_logs_tenant_sent_idx" ON "email_logs" USING btree ("tenant_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_providers_tenant_name_idx" ON "email_providers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "email_providers_tenant_idx" ON "email_providers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_tenant_key_idx" ON "email_templates" USING btree ("tenant_id","key");