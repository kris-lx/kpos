/**
 * Ensures system roles in the DB have at least the permissions defined in SYSTEM_ROLE_PERMISSIONS.
 * Runs once on server startup — additive only (never removes permissions), idempotent.
 */
import { db } from '@/config/database.config';
import { roles } from '@/db/schema/tables';
import { eq, isNull } from 'drizzle-orm';
import { SYSTEM_ROLE_PERMISSIONS } from '@/shared/systemRolePermissions';
import { cache } from '@/config/redis.config';

export async function patchSystemRolePermissions(): Promise<void> {
    try {
        let patched = 0;

        for (const [roleName, canonical] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
            // Find all DB roles with this name (global + per-tenant copies)
            const dbRoles = await db.query.roles.findMany({
                where: eq(roles.name, roleName),
                columns: { id: true, permissions: true },
            });

            for (const role of dbRoles) {
                const current: string[] = (role.permissions as string[]) || [];
                const missing = canonical.filter(p => !current.includes(p));
                if (missing.length === 0) continue;

                const merged = [...new Set([...current, ...missing])];
                await db.update(roles).set({ permissions: merged }).where(eq(roles.id, role.id));
                patched++;
            }
        }

        if (patched > 0) {
            // Invalidate all user auth caches so next request gets fresh permissions
            await cache.delPattern('kpos:auth:*');
            console.log(`✅ Role permissions patched (${patched} role(s) updated, auth cache cleared)`);
        }
    } catch (error) {
        console.warn('⚠️  Role permission patch warning:', (error as Error).message);
    }
}
