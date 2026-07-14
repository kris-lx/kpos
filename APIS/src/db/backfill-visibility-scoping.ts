/**
 * One-time backfill for rows created before the SKU tenantId / staff userStores
 * fixes: sku_variants.tenant_id was never set on create, and staff created by
 * an owner with no activeStoreId got no userStores mapping — both made the
 * rows invisible to POS/dashboard list queries even though they existed.
 * Idempotent — only touches rows that are still missing the scoping field.
 */
import { db } from '@/config/database.config';
import { sql } from 'drizzle-orm';

export async function backfillVisibilityScoping(): Promise<void> {
    try {
        const skuResult = await db.execute(sql`
            UPDATE sku_variants sv
            SET tenant_id = p.tenant_id
            FROM products p
            WHERE sv.product_id = p.id
              AND sv.tenant_id IS NULL
              AND p.tenant_id IS NOT NULL
            RETURNING sv.id
        `);

        // Store/branch hierarchy reversal: a user's home store is now found by
        // joining through their home branch (branches.store_id), not a
        // branch_id column on stores (dropped — stores are the top-level tier now).
        const staffResult = await db.execute(sql`
            INSERT INTO user_stores (tenant_id, user_id, store_id, branch_id, can_read, can_write, can_delete, can_manage, is_default)
            SELECT DISTINCT ON (u.id)
                u.tenant_id, u.id, b.store_id, u.branch_id, true, true, false, false, true
            FROM users u
            JOIN branches b ON b.id = u.branch_id
            WHERE u.is_super_admin = false
              AND u.role NOT IN ('super_admin', 'admin')
              AND u.branch_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id = u.id)
            ORDER BY u.id
            RETURNING id
        `);

        const skusFixed = skuResult.length ?? 0;
        const staffFixed = staffResult.length ?? 0;
        if (skusFixed > 0 || staffFixed > 0) {
            console.log(`✅ Visibility backfill: ${skusFixed} SKU(s) tenant-scoped, ${staffFixed} staff userStores mapping(s) created`);
        }
    } catch (error) {
        console.warn('⚠️  Visibility backfill warning:', (error as Error).message);
    }
}
