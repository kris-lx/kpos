/**
 * Ensures system roles in the DB have at least the permissions defined in SYSTEM_ROLE_PERMISSIONS.
 * Runs once on server startup — additive only (never removes permissions), idempotent.
 */
import { db } from '@/config/database.config';
import { roles } from '@/db/schema/tables';
import { eq } from 'drizzle-orm';
import { SYSTEM_ROLE_PERMISSIONS } from '@/shared/systemRolePermissions';
import { ROLE_LEVELS } from '@/infrastructure/http/middleware/auth.middleware';
import { cache } from '@/config/redis.config';
import { setSuperAdminBypassContext } from '@/db/set-tenant-context';

export async function patchSystemRolePermissions(): Promise<void> {
    try {
        let patched = 0;

        await db.transaction(async (tx) => {
            // roles has an RLS policy scoping reads/writes to the caller's
            // tenant_id — without a bypass, this would silently only ever
            // reach the tenant_id-IS-NULL global template row and skip every
            // tenant's own copy of store_owner/cashier/etc, defeating the
            // whole point of an "every tenant, every boot" patch.
            await setSuperAdminBypassContext(tx, { local: true });

            for (const [roleName, canonical] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
                // Find all DB roles with this name (global + per-tenant copies)
                const dbRoles = await tx.query.roles.findMany({
                    where: eq(roles.name, roleName),
                    columns: { id: true, permissions: true, level: true, isSystem: true },
                });

                const canonicalLevel = ROLE_LEVELS[roleName];

                for (const role of dbRoles) {
                    const current: string[] = (role.permissions as string[]) || [];
                    const missing = canonical.filter(p => !current.includes(p));
                    // Built-in role rows are immutable by name (their level
                    // was never meant to be admin-editable — the roles
                    // create/update routes both block editing isSystem=true
                    // rows), so it's safe to unconditionally correct a
                    // wrong/never-set level here. Custom (isSystem=false)
                    // roles a tenant created are left alone even if their
                    // name happens to collide with a built-in one — the
                    // level a tenant chose for their own role is real data,
                    // not drift to "fix".
                    const levelWrong = role.isSystem && canonicalLevel !== undefined && role.level !== canonicalLevel;
                    if (missing.length === 0 && !levelWrong) continue;

                    const merged = [...new Set([...current, ...missing])];
                    await tx.update(roles).set({
                        permissions: merged,
                        ...(levelWrong ? { level: canonicalLevel } : {}),
                    }).where(eq(roles.id, role.id));
                    patched++;
                }
            }
        });

        if (patched > 0) {
            // Invalidate all user auth caches so next request gets fresh permissions
            await cache.delPattern('kpos:auth:*');
            console.log(`✅ Role permissions patched (${patched} role(s) updated, auth cache cleared)`);
        }
    } catch (error) {
        console.warn('⚠️  Role permission patch warning:', (error as Error).message);
    }
}
