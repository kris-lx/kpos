CREATE TABLE "message_receipts" (
    "event_id" uuid PRIMARY KEY NOT NULL,
    "queue" text NOT NULL,
    "status" text DEFAULT 'processing' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "outbox_messages" (
    "event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "queue" text NOT NULL,
    "event_type" text NOT NULL,
    "tenant_id" uuid,
    "aggregate_id" text,
    "payload" jsonb NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "available_at" timestamp DEFAULT now() NOT NULL,
    "locked_at" timestamp,
    "published_at" timestamp,
    "last_error" text,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "message_receipts_status_idx" ON "message_receipts" USING btree ("status", "updated_at");
--> statement-breakpoint
CREATE INDEX "outbox_messages_pending_idx" ON "outbox_messages" USING btree ("published_at", "available_at", "created_at");
--> statement-breakpoint
CREATE INDEX "outbox_messages_queue_idx" ON "outbox_messages" USING btree ("queue", "published_at");
