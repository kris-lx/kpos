// @ts-nocheck
/**
 * Ensures the tenants table exists and seeds a default tenant on startup.
 * Also backfills tenant_id on all existing rows that have NULL tenant_id.
 * Called once on server startup — safe to re-run (idempotent).
 */
import { db } from '@/config/database.config';
import { tenants } from '@/db/schema/tables';
import { eq, sql } from 'drizzle-orm';

const DEFAULT_TENANT_CODE = 'default';

export async function ensureDefaultTenant(): Promise<void> {
    try {
        // 1. Check if tenants table exists
        const tableCheck = await db.execute(sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'tenants'
            ) as "exists"
        `);

        const tableExists = (tableCheck as any)[0]?.exists === true;

        if (!tableExists) {
            // Create tenants table via raw SQL (drizzle-kit push will handle this normally)
            await db.execute(sql`
                CREATE TABLE tenants (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name TEXT NOT NULL,
                    code TEXT NOT NULL UNIQUE,
                    logo TEXT,
                    business_type TEXT,
                    tax_id TEXT,
                    phone TEXT,
                    email TEXT,
                    address TEXT,
                    plan TEXT NOT NULL DEFAULT 'free',
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    settings JSONB,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                )
            `);
            console.log('✅ tenants table created');
        }

        // 2. Ensure tenant_id column exists on key tables (safe ALTER — ignores if exists)
        const tablesToPatch = [
            'branches', 'users', 'stores', 'user_stores', 'roles', 'rules',
            'categories', 'products', 'inventory', 'stock_movements',
            'customers', 'transactions', 'held_sales', 'payment_methods',
            'shifts', 'cash_registers', 'tables', 'orders', 'reservations',
            'members', 'membership_tiers', 'point_settings',
            'promotions', 'coupons', 'discounts', 'settlements',
            'vendors', 'purchase_orders', 'stock_transfers', 'stock_counts',
            'price_levels', 'product_price_levels', 'sku_variants',
            'documents', 'document_templates', 'settings',
            'notifications', 'activity_logs', 'store_requests',
            'system_enums', 'role_rules', 'menu_permissions',
        ];

        for (const table of tablesToPatch) {
            try {
                await db.execute(sql.raw(
                    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS tenant_id UUID`
                ));
            } catch {
                // Column may already exist — ignore
            }
        }

        // G3: Add tenant_id to product_stores
        try {
            await db.execute(sql.raw(`ALTER TABLE "product_stores" ADD COLUMN IF NOT EXISTS tenant_id UUID`));
        } catch { /* ignore */ }

        // G4: Add tenant_id to product_price_levels
        try {
            await db.execute(sql.raw(`ALTER TABLE "product_price_levels" ADD COLUMN IF NOT EXISTS tenant_id UUID`));
        } catch { /* ignore */ }

        // G8/G9/G10: Add store-level config columns to stores
        for (const col of ['logo TEXT', 'theme JSONB', 'merchant_id TEXT', 'payment_gateway TEXT']) {
            try {
                await db.execute(sql.raw(`ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS ${col}`));
            } catch { /* ignore */ }
        }

        // G11: Add branchId/storeId to settlements
        try {
            await db.execute(sql.raw(`ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS branch_id UUID`));
            await db.execute(sql.raw(`ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS store_id UUID`));
        } catch { /* ignore */ }

        // G17: Add storeId to cash_registers
        try {
            await db.execute(sql.raw(`ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS store_id UUID`));
        } catch { /* ignore */ }

        // G8: Add storeId to settings
        try {
            await db.execute(sql.raw(`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS store_id UUID`));
        } catch { /* ignore */ }

        // G2: Migrate settings unique index to include tenantId+storeId
        try {
            await db.execute(sql.raw(`DROP INDEX IF EXISTS "settings_category_key_branch_idx"`));
            await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "settings_tenant_cat_key_branch_store_idx" ON "settings" (tenant_id, category, key, branch_id, store_id)`));
        } catch { /* ignore */ }

        // Also add receipt_settings to branches
        try {
            await db.execute(sql.raw(
                `ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS receipt_settings JSONB`
            ));
        } catch {
            // ignore
        }

        // 3. Ensure default tenant exists
        let defaultTenant = await db.query.tenants.findFirst({
            where: eq(tenants.code, DEFAULT_TENANT_CODE),
        });

        if (!defaultTenant) {
            const [created] = await db.insert(tenants).values({
                name: 'Default Organization',
                code: DEFAULT_TENANT_CODE,
                plan: 'free',
                isActive: true,
            }).returning();
            defaultTenant = created;
            console.log(`✅ Default tenant created: ${defaultTenant.id}`);
        }

        // 4. Backfill tenant_id on all existing rows that have NULL
        const tenantId = defaultTenant.id;

        // Backfill using raw SQL for efficiency (Drizzle update needs specific typing)
        for (const table of tablesToPatch) {
            try {
                await db.execute(sql.raw(
                    `UPDATE "${table}" SET tenant_id = '${tenantId}' WHERE tenant_id IS NULL`
                ));
            } catch {
                // ignore — table might not exist yet
            }
        }

        console.log('✅ Tenant system initialized (default tenant backfilled)');
    } catch (error) {
        // Non-fatal: log but don't crash startup
        console.warn('⚠️  Tenant init warning:', (error as Error).message);
    }
}
