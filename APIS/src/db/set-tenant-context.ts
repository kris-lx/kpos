// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Set Tenant + Branch Context for RLS (Layer 2)
// Uses SET LOCAL so the GUCs are scoped to the current transaction only.
// Call this at the start of every authenticated request inside db.transaction().
// ═══════════════════════════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';

export interface RequestContextVars {
    tenantId: string;
    branchPath?: string;
    /** Optional schema name for Enterprise-plan tenants (Layer 3). */
    schemaName?: string;
}

/**
 * Sets `app.current_tenant_id` as a transaction-local GUC variable.
 * Must be called inside a `db.transaction(async (tx) => { ... })` block.
 *
 * @deprecated Prefer {@link setRequestContext} which also sets branch_path.
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

/**
 * Sets all per-request RLS GUC variables in one shot:
 *   - app.current_tenant_id  (required)
 *   - app.current_branch_path (optional — tenant admins have none)
 *   - search_path (optional — Enterprise schema-per-tenant)
 *
 * Must be invoked inside a transaction. Pair with {@link withTenantTx}
 * middleware to wrap every authenticated route handler automatically.
 *
 * @example
 * await db.transaction(async (tx) => {
 *   await setRequestContext(tx, { tenantId, branchPath });
 *   // ... queries inside this tx see RLS-filtered rows
 * });
 */
export async function setRequestContext(
    tx: PgTransaction<any, any, any>,
    vars: RequestContextVars,
): Promise<void> {
    if (!vars.tenantId) {
        throw new Error('setRequestContext: tenantId is required');
    }
    await tx.execute(sql`SET LOCAL app.current_tenant_id = ${vars.tenantId}`);

    if (vars.branchPath) {
        await tx.execute(sql`SET LOCAL app.current_branch_path = ${vars.branchPath}`);
    } else {
        // Empty string → policies must allow tenant-admin (root scope) access.
        await tx.execute(sql`SET LOCAL app.current_branch_path = ''`);
    }

    if (vars.schemaName) {
        // Enterprise plan: switch default schema. `public` retained for shared
        // catalogs (extensions, migrations metadata).
        await tx.execute(sql.raw(`SET LOCAL search_path = "${vars.schemaName}", public`));
    }
}
