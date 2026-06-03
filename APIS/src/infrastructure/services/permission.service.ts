// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Permission Service (BE-13 — Finding-G G8)
// ═══════════════════════════════════════════════════════════════════════════
//
// Redis cache-aside pattern for bitmask permissions.
// Miss → query user_role_assignments + roles → combine masks → cache.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { cache } from '@/config/redis.config';
import { userRoleAssignments, roles, users } from '@/db/schema/tables';
import { eq, and } from 'drizzle-orm';
import { mergeMasks, type PermBit } from '../permissions';

const CACHE_TTL = 300; // 5 minutes
const CACHE_PREFIX = 'kpos:rbac';

export interface UserMask {
    mask_low: bigint;
    mask_high: bigint;
}

/**
 * Resolve the combined permission bitmask for a user within a tenant.
 * Queries all role assignments, fetches each role's maskLow/maskHigh,
 * ORs them together, and caches the result.
 */
export async function getUserMask(userId: string, tenantId: string): Promise<UserMask> {
    const cacheKey = `${CACHE_PREFIX}:${tenantId}:${userId}`;

    // Try cache first
    const cached = await cache.get<{ low: string; high: string }>(cacheKey);
    if (cached) {
        return {
            mask_low: BigInt(cached.low),
            mask_high: BigInt(cached.high),
        };
    }

    // Cache miss — query DB
    const assignments = await db.query.userRoleAssignments.findMany({
        where: and(
            eq(userRoleAssignments.userId, userId),
            eq(userRoleAssignments.tenantId, tenantId),
        ),
        with: {
            role: true,
        },
    });

    let combined: PermBit = { low: 0n, high: 0n };

    for (const assignment of assignments) {
        if (assignment.role) {
            const roleLow  = assignment.role.maskLow  ? BigInt(assignment.role.maskLow)  : 0n;
            const roleHigh = assignment.role.maskHigh ? BigInt(assignment.role.maskHigh) : 0n;
            combined = mergeMasks(combined, { low: roleLow, high: roleHigh });
        }
    }

    // If no assignments found, try fallback to the user's single roleId
    if (assignments.length === 0) {
        // Fallback: query user's direct roleId from users table
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { roleId: true },
        });

        if (user?.roleId) {
            const role = await db.query.roles.findFirst({
                where: eq(roles.id, user.roleId),
                columns: { maskLow: true, maskHigh: true },
            });
            if (role) {
                combined = {
                    low: role.maskLow ? BigInt(role.maskLow) : 0n,
                    high: role.maskHigh ? BigInt(role.maskHigh) : 0n,
                };
            }
        }
    }

    // Write to cache (store as strings for JSON serialization safety)
    await cache.set(cacheKey, {
        low: combined.low.toString(),
        high: combined.high.toString(),
    }, CACHE_TTL);

    return {
        mask_low: combined.low,
        mask_high: combined.high,
    };
}

/**
 * Invalidate a user's cached permission mask (BE-16).
 * Call after any role assignment/revocation.
 */
export async function invalidateUserPermissions(userId: string, tenantId: string): Promise<void> {
    await cache.del(`${CACHE_PREFIX}:${tenantId}:${userId}`);
}

/**
 * Invalidate ALL cached permission masks for a tenant.
 * Call after bulk role changes.
 */
export async function invalidateAllTenantPermissions(tenantId: string): Promise<void> {
    await cache.delPattern(`${CACHE_PREFIX}:${tenantId}:*`);
}
