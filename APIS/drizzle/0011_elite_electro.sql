CREATE TABLE "payment_gateway_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"out_trade_no" text NOT NULL,
	"amount" double precision NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"qr_payload" text,
	"gateway_ref" text,
	"last_checked_at" timestamp,
	"sale_transaction_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"confirmed_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_gateway_configs_tenant_provider_idx" ON "payment_gateway_configs" USING btree ("tenant_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_payment_requests_tenant_outtrade_idx" ON "qr_payment_requests" USING btree ("tenant_id","out_trade_no");--> statement-breakpoint
CREATE INDEX "qr_payment_requests_tenant_idx" ON "qr_payment_requests" USING btree ("tenant_id");