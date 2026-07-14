// ═══════════════════════════════════════════════════════════════════════════
// Shared user↔store assignment helper — upserts userStores rows and enforces
// the single-isDefault-per-user invariant in one place. Previously this logic
// only existed (correctly) in the single-store assign endpoint
// (stores/presentation/routes.ts) — bulk-assign and staff creation each wrote
// userStores rows independently, without the isDefault enforcement, so a user
// could end up with 0 or 2+ default stores depending on which endpoint was
// used to grant access.
// ═══════════════════════════════════════════════════════════════════════════

import { eq, and } from 'drizzle-orm';
import { userStores } from '@/db/schema/tables';

export interface StoreAssignmentInput {
    storeId: string;
    /** Null = whole-store grant (every branch under this store); set = narrowed to one specific branch. */
    branchId: string | null;
    canRead?: boolean;
    canWrite?: boolean;
    canDelete?: boolean;
    canManage?: boolean;
}

/**
 * Upserts one userStores row per store in `assignments`, then enforces that
 * exactly one of the user's rows (across ALL their store assignments, not
 * just the ones in this call) has isDefault=true — `defaultStoreId` if given
 * and present in `assignments`, else the first entry in `assignments`.
 */
export async function assignUserToStores(
    db: any,
    params: {
        userId: string;
        tenantId: string | null;
        assignments: StoreAssignmentInput[];
        defaultStoreId?: string;
        assignedBy?: string;
    },
): Promise<any[]> {
    const { userId, tenantId, assignments, assignedBy } = params;
    if (assignments.length === 0) return [];

    const results: any[] = [];
    for (const a of assignments) {
        const existingConds: any[] = [eq(userStores.userId, userId), eq(userStores.storeId, a.storeId)];
        if (tenantId) existingConds.push(eq(userStores.tenantId, tenantId));
        const existing = await db.query.userStores.findFirst({ where: and(...existingConds) });

        const values = {
            canRead: a.canRead ?? true,
            canWrite: a.canWrite ?? true,
            canDelete: a.canDelete ?? false,
            canManage: a.canManage ?? false,
        };

        if (existing) {
            const [updated] = await db.update(userStores).set(values).where(eq(userStores.id, existing.id)).returning();
            results.push(updated);
        } else {
            const [created] = await db.insert(userStores).values({
                tenantId,
                userId,
                storeId: a.storeId,
                branchId: a.branchId,
                ...values,
                isDefault: false,
                assignedBy,
            }).returning();
            results.push(created);
        }
    }

    const defaultStoreId = params.defaultStoreId && assignments.some(a => a.storeId === params.defaultStoreId)
        ? params.defaultStoreId
        : assignments[0].storeId;

    const allConds: any[] = [eq(userStores.userId, userId)];
    if (tenantId) allConds.push(eq(userStores.tenantId, tenantId));
    await db.update(userStores).set({ isDefault: false }).where(and(...allConds));
    await db.update(userStores).set({ isDefault: true }).where(and(eq(userStores.userId, userId), eq(userStores.storeId, defaultStoreId)));

    return results;
}
