// ═══════════════════════════════════════════════════════════════════════════
// Shared user↔store assignment helper — upserts userStores rows and enforces
// the single-isDefault-per-user invariant in one place. Previously this logic
// only existed (correctly) in the single-store assign endpoint
// (stores/presentation/routes.ts) — bulk-assign and staff creation each wrote
// userStores rows independently, without the isDefault enforcement, so a user
// could end up with 0 or 2+ default stores depending on which endpoint was
// used to grant access.
// ═══════════════════════════════════════════════════════════════════════════

import { eq, and, isNull } from 'drizzle-orm';
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
 * Upserts one userStores row per scope in `assignments`, then enforces that
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

    // Whole-store access supersedes individual branches in the same store.
    // Otherwise preserve every distinct branch so one accountant can be
    // assigned to several branches without accidentally replacing the first.
    const normalized = [...new Map(
        assignments.map(a => [`${a.storeId}:${a.branchId || '*'}`, a]),
    ).values()].filter(a => !a.branchId || !assignments.some(other => other.storeId === a.storeId && other.branchId === null));

    const results: any[] = [];
    for (const a of normalized) {
        if (a.branchId === null) {
            await db.delete(userStores).where(and(
                eq(userStores.userId, userId),
                eq(userStores.storeId, a.storeId),
                ...(tenantId ? [eq(userStores.tenantId, tenantId)] : []),
            ));
        }
        const existingConds: any[] = [eq(userStores.userId, userId), eq(userStores.storeId, a.storeId)];
        existingConds.push(a.branchId ? eq(userStores.branchId, a.branchId) : isNull(userStores.branchId));
        if (tenantId) existingConds.push(eq(userStores.tenantId, tenantId));
        const existing = await db.query.userStores.findFirst({ where: and(...existingConds) });

        const values = {
            canRead: a.canRead ?? true,
            canWrite: a.canWrite ?? true,
            canDelete: a.canDelete ?? false,
            canManage: a.canManage ?? false,
        };

        if (existing) {
            const [updated] = await db.update(userStores)
                .set({ ...values, assignedBy })
                .where(eq(userStores.id, existing.id))
                .returning();
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

    const defaultStoreId = params.defaultStoreId && normalized.some(a => a.storeId === params.defaultStoreId)
        ? params.defaultStoreId
        : normalized[0].storeId;

    const allConds: any[] = [eq(userStores.userId, userId)];
    if (tenantId) allConds.push(eq(userStores.tenantId, tenantId));
    await db.update(userStores).set({ isDefault: false }).where(and(...allConds));
    const defaultRow = results.find(row => row.storeId === defaultStoreId) || results[0];
    if (defaultRow) {
        await db.update(userStores).set({ isDefault: true }).where(eq(userStores.id, defaultRow.id));
    }

    return results;
}
