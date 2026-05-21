-- ═══════════════════════════════════════════════════════════════════════════
-- Branch Owner Identity: ownerName, ownerPhone, ownerEmail, registrationNo, website
-- Phase 2: Branch owner / identity settings
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "owner_name" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "owner_phone" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "owner_email" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "registration_no" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "website" text;
