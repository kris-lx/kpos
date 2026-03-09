// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Set Tenant Context for RLS
// Uses SET LOCAL so the GUC is scoped to the current transaction only.
// Call this at the start of every route handler inside a db.transaction().
// ═══════════════════════════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';

/**
 * Sets `app.current_tenant_id` as a transaction-local GUC variable.
 * Must be called inside a `db.transaction(async (tx) => { ... })` block.
 *
 * @example
 * await db.transaction(async (tx) => {
 *   await setTenantContext(tx, user.tenantId);
 *   // all subsequent queries in this tx can use current_setting('app.current_tenant_id')
 * });
 */
export async function setTenantContext(
    tx: PgTransaction<any, any, any>,
    tenantId: string,
): Promise<void> {
    if (!tenantId) {
        throw new Error('setTenantContext: tenantId is required');
    }
    await tx.execute(sql`SET LOCAL app.current_tenant_id = ${tenantId}`);
}
