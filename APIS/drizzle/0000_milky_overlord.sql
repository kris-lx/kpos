CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"description" text,
	"entity" text,
	"entity_id" uuid,
	"metadata" jsonb,
	"old_data" jsonb,
	"new_data" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_of_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity" double precision NOT NULL,
	"unit" text NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"tax_id" text,
	"logo" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "branches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" double precision NOT NULL,
	"reason" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_registers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image" text,
	"parent_id" uuid,
	"store_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"value" double precision NOT NULL,
	"min_purchase" double precision DEFAULT 0 NOT NULL,
	"max_discount" double precision,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"per_user_limit" integer DEFAULT 1,
	"is_active" boolean DEFAULT true NOT NULL,
	"store_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_code" text,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"tax_id" text,
	"birth_date" timestamp,
	"gender" text,
	"notes" text,
	"points" integer DEFAULT 0 NOT NULL,
	"total_spent" double precision DEFAULT 0 NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"last_visit_at" timestamp,
	"branch_id" uuid,
	"store_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_member_code_unique" UNIQUE("member_code")
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"discount_type" text DEFAULT 'percentage' NOT NULL,
	"discount_value" double precision NOT NULL,
	"apply_to" text DEFAULT 'all' NOT NULL,
	"product_ids" uuid[] DEFAULT '{}' NOT NULL,
	"category_ids" uuid[] DEFAULT '{}' NOT NULL,
	"min_quantity" integer DEFAULT 1 NOT NULL,
	"min_purchase" double precision DEFAULT 0 NOT NULL,
	"max_discount" double precision,
	"start_date" timestamp,
	"end_date" timestamp,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"store_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"template" text NOT NULL,
	"settings" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_templates_type_unique" UNIQUE("type")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"document_no" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"reference_type" text NOT NULL,
	"branch_id" uuid,
	"store_id" uuid,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'CREATED' NOT NULL,
	"print_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documents_document_no_unique" UNIQUE("document_no")
);
--> statement-breakpoint
CREATE TABLE "held_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"branch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"member_id" uuid,
	"table_id" uuid,
	"items" jsonb NOT NULL,
	"subtotal" double precision NOT NULL,
	"discount" double precision DEFAULT 0 NOT NULL,
	"total" double precision NOT NULL,
	"note" text,
	"store_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku_variant_id" uuid,
	"branch_id" uuid NOT NULL,
	"store_id" uuid,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"reserved" double precision DEFAULT 0 NOT NULL,
	"available" double precision DEFAULT 0 NOT NULL,
	"location" text,
	"batch_number" text,
	"expiry_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_number" text,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text NOT NULL,
	"birthdate" timestamp,
	"gender" text,
	"address" text,
	"tier_id" uuid,
	"points" integer DEFAULT 0 NOT NULL,
	"total_spent" double precision DEFAULT 0 NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "members_card_number_unique" UNIQUE("card_number"),
	CONSTRAINT "members_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "membership_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"min_points" integer DEFAULT 0 NOT NULL,
	"point_multiplier" double precision DEFAULT 1 NOT NULL,
	"discount_percent" double precision DEFAULT 0 NOT NULL,
	"benefits" jsonb,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "membership_tiers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "menu_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"label_lao" text,
	"icon" text,
	"path" text,
	"parent_id" uuid,
	"required_permission" text,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "menu_permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"quantity" double precision NOT NULL,
	"unit_price" double precision NOT NULL,
	"total" double precision NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"modifiers" jsonb,
	"sent_at" timestamp,
	"prepared_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"table_id" uuid,
	"type" text DEFAULT 'DINE_IN' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"guest_count" integer DEFAULT 1 NOT NULL,
	"subtotal" double precision DEFAULT 0 NOT NULL,
	"discount" double precision DEFAULT 0 NOT NULL,
	"tax" double precision DEFAULT 0 NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"note" text,
	"kitchen_note" text,
	"served_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"icon" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"settings" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "permission_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"icon" text,
	"color" text,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "permission_groups_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"group_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "point_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"balance" integer NOT NULL,
	"reference" text,
	"reference_type" text,
	"description" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"points_per_currency" double precision DEFAULT 1 NOT NULL,
	"min_spend_to_earn" double precision DEFAULT 0 NOT NULL,
	"redemption_rate" double precision DEFAULT 1 NOT NULL,
	"min_points_to_redeem" integer DEFAULT 100 NOT NULL,
	"expiry_months" integer DEFAULT 12,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"type" text NOT NULL,
	"reason" text,
	"reference_id" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "price_levels_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "product_price_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"price_level_id" uuid NOT NULL,
	"price" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"price" double precision,
	"stock" double precision DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sku" text,
	"barcode" text,
	"category_id" uuid,
	"branch_id" uuid NOT NULL,
	"price" double precision NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'piece' NOT NULL,
	"image" text,
	"images" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_vat" boolean DEFAULT true NOT NULL,
	"vat_rate" double precision DEFAULT 7 NOT NULL,
	"track_stock" boolean DEFAULT true NOT NULL,
	"low_stock_threshold" integer DEFAULT 10 NOT NULL,
	"allow_decimal" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"attributes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"value" double precision NOT NULL,
	"conditions" jsonb,
	"applicable_to" jsonb,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"member_only" boolean DEFAULT false NOT NULL,
	"store_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"quantity" double precision NOT NULL,
	"received_qty" double precision DEFAULT 0 NOT NULL,
	"unit_cost" double precision NOT NULL,
	"total" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_number" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"subtotal" double precision NOT NULL,
	"tax" double precision DEFAULT 0 NOT NULL,
	"discount" double precision DEFAULT 0 NOT NULL,
	"total" double precision NOT NULL,
	"expected_date" timestamp,
	"received_date" timestamp,
	"notes" text,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"table_id" uuid,
	"member_id" uuid,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"guest_count" integer NOT NULL,
	"date" timestamp NOT NULL,
	"time" text NOT NULL,
	"duration" integer DEFAULT 120 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"can_read" boolean DEFAULT true NOT NULL,
	"can_create" boolean DEFAULT false NOT NULL,
	"can_update" boolean DEFAULT false NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"module" text NOT NULL,
	"icon" text,
	"routes" text[] DEFAULT '{}' NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rules_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"device" text,
	"ip" text,
	"user_agent" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token"),
	CONSTRAINT "sessions_refresh_token_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"branch_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_date" timestamp NOT NULL,
	"total_amount" double precision DEFAULT 0 NOT NULL,
	"cash_amount" double precision DEFAULT 0 NOT NULL,
	"card_amount" double precision DEFAULT 0 NOT NULL,
	"other_amount" double precision DEFAULT 0 NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"settled_by" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_no" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"register_id" uuid,
	"opening_balance" double precision NOT NULL,
	"closing_balance" double precision,
	"expected_balance" double precision,
	"difference" double precision,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"notes" text,
	"store_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_shift_no_unique" UNIQUE("shift_no")
);
--> statement-breakpoint
CREATE TABLE "sku_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"attributes" jsonb NOT NULL,
	"price" double precision,
	"cost" double precision,
	"image" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sku_variants_sku_unique" UNIQUE("sku"),
	CONSTRAINT "sku_variants_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "stock_count_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"system_qty" double precision NOT NULL,
	"actual_qty" double precision NOT NULL,
	"difference" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_no" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"has_discrepancy" boolean DEFAULT false NOT NULL,
	"counted_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_counts_count_no_unique" UNIQUE("count_no")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"store_id" uuid,
	"type" text NOT NULL,
	"quantity" double precision NOT NULL,
	"previous_qty" double precision NOT NULL,
	"new_qty" double precision NOT NULL,
	"unit_cost" double precision,
	"supplier" text,
	"reason" text,
	"reference" text,
	"reference_type" text,
	"user_id" uuid NOT NULL,
	"notes" text,
	"expiry_date" timestamp,
	"batch_number" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"quantity" double precision NOT NULL,
	"received_qty" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_no" text NOT NULL,
	"from_branch_id" uuid NOT NULL,
	"to_branch_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"notes" text,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"completed_by" uuid,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_transfers_transfer_no_unique" UNIQUE("transfer_no")
);
--> statement-breakpoint
CREATE TABLE "store_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"branch_id" uuid,
	"type" text NOT NULL,
	"store_name" text,
	"store_code" text,
	"store_address" text,
	"store_phone" text,
	"store_email" text,
	"branch_name" text,
	"branch_code" text,
	"branch_address" text,
	"branch_phone" text,
	"branch_email" text,
	"reason" text,
	"documents" text[] DEFAULT '{}' NOT NULL,
	"metadata" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"reviewer_id" uuid,
	"review_note" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stores_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"area_id" uuid,
	"capacity" integer DEFAULT 4 NOT NULL,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"pos_x" double precision DEFAULT 0 NOT NULL,
	"pos_y" double precision DEFAULT 0 NOT NULL,
	"shape" text DEFAULT 'SQUARE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"sku" text,
	"barcode" text,
	"quantity" double precision NOT NULL,
	"unit_price" double precision NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL,
	"discount_type" text,
	"discount_value" double precision DEFAULT 0 NOT NULL,
	"discount_amount" double precision DEFAULT 0 NOT NULL,
	"tax_rate" double precision DEFAULT 0 NOT NULL,
	"tax_amount" double precision DEFAULT 0 NOT NULL,
	"total" double precision NOT NULL,
	"note" text,
	"modifiers" jsonb
);
--> statement-breakpoint
CREATE TABLE "transaction_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"method_id" uuid NOT NULL,
	"method_name" text NOT NULL,
	"amount" double precision NOT NULL,
	"reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_no" text NOT NULL,
	"type" text DEFAULT 'SALE' NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"branch_id" uuid NOT NULL,
	"store_id" uuid,
	"user_id" uuid NOT NULL,
	"shift_id" uuid,
	"member_id" uuid,
	"customer_id" uuid,
	"table_id" uuid,
	"order_id" uuid,
	"order_type" text DEFAULT 'WALKIN' NOT NULL,
	"subtotal" double precision NOT NULL,
	"discount_type" text,
	"discount_value" double precision DEFAULT 0 NOT NULL,
	"discount_amount" double precision DEFAULT 0 NOT NULL,
	"tax_amount" double precision DEFAULT 0 NOT NULL,
	"service_charge" double precision DEFAULT 0 NOT NULL,
	"total" double precision NOT NULL,
	"received" double precision DEFAULT 0 NOT NULL,
	"change" double precision DEFAULT 0 NOT NULL,
	"points_earned" integer DEFAULT 0 NOT NULL,
	"points_redeemed" integer DEFAULT 0 NOT NULL,
	"note" text,
	"void_reason" text,
	"refund_reason" text,
	"parent_id" uuid,
	"is_credit" boolean DEFAULT false NOT NULL,
	"credit_status" text,
	"due_date" timestamp,
	"paid_amount" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_transaction_no_unique" UNIQUE("transaction_no")
);
--> statement-breakpoint
CREATE TABLE "user_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"can_read" boolean DEFAULT true NOT NULL,
	"can_write" boolean DEFAULT true NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL,
	"can_manage" boolean DEFAULT false NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"avatar" text,
	"role" text DEFAULT 'staff' NOT NULL,
	"role_id" uuid,
	"branch_id" uuid,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"two_fa_enabled" boolean DEFAULT false NOT NULL,
	"two_fa_secret" text,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"contact_name" text,
	"email" text,
	"phone" text,
	"address" text,
	"tax_id" text,
	"payment_terms" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activity_logs_user_idx" ON "activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_logs_action_idx" ON "activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "activity_logs_created_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "categories_store_idx" ON "categories" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "coupons_store_idx" ON "coupons" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "customers_store_idx" ON "customers" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "discounts_store_idx" ON "discounts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "documents_branch_idx" ON "documents" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "documents_store_idx" ON "documents" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "held_sales_store_idx" ON "held_sales" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_product_branch_sku_batch_idx" ON "inventory" USING btree ("product_id","branch_id","sku_variant_id","batch_number");--> statement-breakpoint
CREATE INDEX "inventory_store_idx" ON "inventory" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "menu_permissions_parent_idx" ON "menu_permissions" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "points_history_customer_idx" ON "points_history" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_price_levels_product_level_idx" ON "product_price_levels" USING btree ("product_id","price_level_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_stores_product_store_idx" ON "product_stores" USING btree ("product_id","store_id");--> statement-breakpoint
CREATE INDEX "promotions_store_idx" ON "promotions" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_rules_role_rule_idx" ON "role_rules" USING btree ("role_id","rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_category_key_branch_idx" ON "settings" USING btree ("category","key","branch_id");--> statement-breakpoint
CREATE INDEX "shifts_store_idx" ON "shifts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "stock_movements_store_idx" ON "stock_movements" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "store_requests_status_created_idx" ON "store_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "store_requests_requester_idx" ON "store_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "transactions_store_idx" ON "transactions" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_stores_user_store_idx" ON "user_stores" USING btree ("user_id","store_id");