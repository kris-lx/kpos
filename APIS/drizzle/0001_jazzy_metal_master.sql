CREATE TABLE "system_enums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"label_lao" text,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "system_enums_type_value_idx" ON "system_enums" USING btree ("type","value");--> statement-breakpoint
CREATE INDEX "system_enums_type_idx" ON "system_enums" USING btree ("type");