// ═══════════════════════════════════════════════════════════════════════════
// Roles Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, ROLE_LEVELS, invalidateUserStoreCache } from '@/infrastructure/http/middleware/auth.middleware';
import { permissionsToMask, maskToStrings } from '@/infrastructure/permissions';
import { invalidateAllTenantPermissions, invalidateUserPermissions } from '@/infrastructure/services/permission.service';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { roles, users, permissionGroups, permissions, branches } from '@/db/schema/tables';
import { eq, and, or, ilike, notInArray, isNull, desc, count, asc } from 'drizzle-orm';

export const roleRoutes = Router();

async function loadActivePermissionKeys(): Promise<Set<string>> {
    // permissions is a global system catalog (no tenantId column) — not tenant-scoped.
    // eslint-disable-next-line no-restricted-syntax -- permissions is a global system catalog (no tenantId column)
    const rows = await globalDb.query.permissions.findMany({
        where: eq(permissions.isActive, true),
        columns: { key: true },
    });
    return new Set(rows.map(row => row.key));
}

// ═══════════════════════════════════════════════════════════════════════════
// LIST OF AVAILABLE PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// GET ALL AVAILABLE PERMISSIONS — DB-driven, falls back to hardcoded list
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.get('/permissions', authenticate, withTenantTx(), authorize('roles:read'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        // Try to load from DB (permission_groups + permissions tables)
        const groups = await db.query.permissionGroups.findMany({
            where: eq(permissionGroups.isActive, true),
            orderBy: asc(permissionGroups.order),
            with: {
                permissions: {
                    where: eq(permissions.isActive, true),
                    orderBy: asc(permissions.order),
                },
            },
        });

        if (groups.length > 0) {
            const grouped: Record<string, { key: string; label: string; icon?: string; permissions: { key: string; label: string }[] }> = {};
            const all: string[] = [];

            for (const group of groups) {
                grouped[group.key] = {
                    key: group.key,
                    label: group.label,
                    icon: group.icon ?? undefined,
                    permissions: group.permissions.map(p => ({ key: p.key, label: p.label })),
                };
                all.push(...group.permissions.map(p => p.key));
            }

            return res.json({ success: true, data: { all, grouped } });
        }

        res.json({ success: true, data: { all: [], grouped: {} } });
    } catch (error) {
        console.error('Get permissions error:', error);
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to get permissions' } });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ROLE LEVELS — returns the 7-level hierarchy for UI dropdowns
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.get('/levels', authenticate, withTenantTx(), async (req, res) => {
    const authUser = req.authUser!;
    const userLevel = authUser.isSuperAdmin ? 1 : (ROLE_LEVELS[authUser.role] ?? 7);

    const levels = [
        { level: 1, name: 'system_admin', displayName: 'System Admin', description: 'Full platform access across all tenants' },
        { level: 2, name: 'tenant_admin', displayName: 'Tenant Admin', description: 'All branches within tenant' },
        { level: 3, name: 'hq_admin', displayName: 'HQ Admin', description: 'HQ + all child branches (full access)' },
        { level: 4, name: 'hq_manager', displayName: 'HQ Manager', description: 'HQ + all child branches (reports only)' },
        { level: 5, name: 'branch_admin', displayName: 'Branch Admin', description: 'Own branch only (full CRUD)' },
        { level: 6, name: 'branch_manager', displayName: 'Branch Manager', description: 'Own branch only (limited CRUD)' },
        { level: 7, name: 'staff', displayName: 'Staff / Cashier', description: 'Own store/POS only' },
    ].filter(l => l.level >= userLevel); // users cannot assign roles above their own level

    res.json({ success: true, data: levels });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL ROLES
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.get('/', authenticate, withTenantTx(), authorize('roles:read'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { page = '1', limit = '50', search } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const authUser = req.authUser!;
        const isSuperAdmin = authUser.isSuperAdmin;
        const isAdmin = isSuperAdmin || ['admin', 'hq_admin', 'hq_manager', 'store_owner'].includes(authUser.role);
        const isStoreOwner = false; // absorbed into isAdmin above

        const conditions: any[] = [];
        // BE-60: Tenant-scoped role list
        const tenantId = req.authUser?.tenantId;
        if (!isSuperAdmin && tenantId) {
            // Show own tenant roles + platform template roles (tenantId=null)
            conditions.push(or(eq(roles.tenantId, tenantId), isNull(roles.tenantId)));
        }

        // Branch-scoped visibility:
        // HQ / tenant admins (roleLevel ≤ 4) see every role in the tenant.
        // Branch-level users (roleLevel ≥ 5) see only tenant-wide templates
        // (branchId IS NULL) plus roles created for their own branch.
        const roleLevel = authUser.roleLevel ?? 7;
        const myBranchId = authUser.activeBranchId;
        if (!isSuperAdmin && roleLevel >= 5 && myBranchId) {
            conditions.push(or(isNull(roles.branchId), eq(roles.branchId, myBranchId)));
        }

        if (isSuperAdmin || isAdmin) {
            // Admins (hq+, store_owner) see all roles within tenant scope
        } else {
            // branch_admin / store_manager: see system assignable + tenant custom, not high-privilege
            conditions.push(notInArray(roles.name, ['super_admin', 'admin', 'hq_admin', 'hq_manager', 'store_owner']));
        }
        if (search) {
            conditions.push(or(ilike(roles.name, `%${search}%`), ilike(roles.displayName, `%${search}%`)));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [roleRows, [{ value: total }]] = await Promise.all([
            db.query.roles.findMany({
                where: whereClause,
                offset: skip,
                limit: parseInt(limit as string),
                orderBy: desc(roles.createdAt),
                with: { users: true },
            }),
            db.select({ value: count() }).from(roles).where(whereClause),
        ]);

        // Map to include _count for backward compatibility
        const rolesWithCount = roleRows.map(r => ({
            ...r,
            users: undefined,
            _count: { users: (r as any).users?.length || 0 },
        }));

        res.json({
            success: true,
            data: rolesWithCount,
            meta: {
                total,
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                totalPages: Math.ceil(total / parseInt(limit as string))
            }
        });
    } catch (error) {
        console.error('Get roles error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to get roles' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ROLE BY ID
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.get('/:id', authenticate, withTenantTx(), authorize('roles:read'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const role = await db.query.roles.findFirst({
            where: eq(roles.id, req.params.id),
            with: { users: true },
        });

        if (!role) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
            });
        }

        res.json({ success: true, data: role });
    } catch (error) {
        console.error('Get role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to get role' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATE ROLE
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.post('/', authenticate, withTenantTx(), authorize('roles:create'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, displayName, description, permissions = [] } = req.body;

        // Validate required fields - only name is required now
        if (!name) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Name is required' }
            });
        }

        // BE-61: Inject tenantId on create, block null by non-platform users
        const tenantId = req.authUser?.tenantId;
        if (!tenantId && !req.authUser?.isSuperAdmin) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot create platform-level roles' }
            });
        }

        // Privilege escalation guard: cannot create a role at a higher level than caller
        if (!req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) > 2) {
            const targetLevel = ROLE_LEVELS[name] ?? 7;
            if (targetLevel < (req.authUser?.roleLevel ?? 7)) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Cannot create a role with higher privileges than your own' }
                });
            }
        }

        // ── Branch ownership of the new role ─────────────────────────────────
        // Branch-level callers (roleLevel ≥ 5) may ONLY create roles private to
        // their own branch — they can never create a tenant-wide template.
        // HQ / tenant admins (roleLevel ≤ 4) may create a tenant-wide template
        // (no branchId) OR a role for a specific child branch (branchId in body).
        const callerLevel = req.authUser?.roleLevel ?? 7;
        let roleBranchId: string | null = null;
        if (!req.authUser?.isSuperAdmin && callerLevel >= 5) {
            roleBranchId = req.authUser?.activeBranchId || null;
            if (!roleBranchId) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No branch context available to create a branch role' }
                });
            }
        } else if (req.body.branchId) {
            // HQ/admin explicitly targeting a child branch — validate same tenant
            const targetBranch = await db.query.branches.findFirst({
                where: eq(branches.id, req.body.branchId),
                columns: { id: true, tenantId: true },
            });
            if (!targetBranch || (tenantId && targetBranch.tenantId !== tenantId)) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_BRANCH', message: 'Branch not found in your tenant' }
                });
            }
            roleBranchId = targetBranch.id;
        }

        // Check if role name already exists within the same tenant + branch scope
        const dupConds: any[] = [or(eq(roles.name, name), eq(roles.displayName, displayName || name))];
        if (tenantId) dupConds.push(eq(roles.tenantId, tenantId));
        dupConds.push(roleBranchId ? eq(roles.branchId, roleBranchId) : isNull(roles.branchId));
        const existing = await db.query.roles.findFirst({
            where: and(...dupConds),
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Role name or display name already exists' }
            });
        }

        // Validate permissions
        const activePermissionKeys = await loadActivePermissionKeys();
        const invalidPermissions = permissions.filter((p: string) => !activePermissionKeys.has(p));
        if (invalidPermissions.length > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PERMISSIONS',
                    message: `Invalid permissions: ${invalidPermissions.join(', ')}`
                }
            });
        }

        const mask = permissionsToMask(permissions);

        const [role] = await db.insert(roles).values({
            tenantId: tenantId || null,
            branchId: roleBranchId,
            name,
            displayName: displayName || name,
            description,
            permissions,
            isSystem: false,
            maskLow:  mask.low,
            maskHigh: mask.high,
        }).returning();

        res.status(201).json({ success: true, data: role });
    } catch (error) {
        console.error('Create role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to create role' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE ROLE
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.put('/:id', authenticate, withTenantTx(), authorize('roles:update'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { name, displayName, description, permissions } = req.body;

        // BE-60: Tenant-scoped role update
        const tenantId = req.authUser?.tenantId;
        const roleConds: any[] = [eq(roles.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            roleConds.push(eq(roles.tenantId, tenantId));
        }
        // Branch-level callers can only edit roles owned by their own branch
        // (never tenant-wide templates or other branches' roles).
        if (!req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) >= 5) {
            roleConds.push(eq(roles.branchId, req.authUser?.activeBranchId ?? '__none__'));
        }

        const existing = await db.query.roles.findFirst({ where: and(...roleConds) });
        if (!existing) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Role not found or no access' }
            });
        }

        // Prevent editing system roles
        if (existing.isSystem) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot modify system roles' }
            });
        }

        // Privilege escalation guard: cannot update to a role level higher than caller
        if (!req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) > 2) {
            const targetName = name || existing.name;
            const targetLevel = ROLE_LEVELS[targetName] ?? 7;
            const existingLevel = ROLE_LEVELS[existing.name] ?? 7;
            if (targetLevel < (req.authUser?.roleLevel ?? 7) || existingLevel < (req.authUser?.roleLevel ?? 7)) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Cannot modify a role with higher privileges than your own' }
                });
            }
        }

        // Check if new name conflicts with another role
        if (name && name !== existing.name) {
            const nameExists = await db.query.roles.findFirst({ where: eq(roles.name, name) });
            if (nameExists) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Role name already exists' }
                });
            }
        }

        // Validate permissions if provided
        if (permissions) {
            const activePermissionKeys = await loadActivePermissionKeys();
            const invalidPermissions = permissions.filter((p: string) => !activePermissionKeys.has(p));
            if (invalidPermissions.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_PERMISSIONS',
                        message: `Invalid permissions: ${invalidPermissions.join(', ')}`
                    }
                });
            }
        }

        // Recompute bitmask whenever permissions change
        const maskUpdate = permissions ? permissionsToMask(permissions) : null;

        const [role] = await db.update(roles)
            .set({
                ...(name && { name }),
                ...(displayName && { displayName }),
                ...(description !== undefined && { description }),
                ...(permissions && { permissions }),
                ...(maskUpdate && {
                    maskLow:  maskUpdate.low,
                    maskHigh: maskUpdate.high,
                }),
                updatedAt: new Date(),
            })
            .where(eq(roles.id, id))
            .returning();

        // Invalidate all cached permission masks for users of this tenant
        if (role.tenantId) {
            invalidateAllTenantPermissions(role.tenantId).catch(() => {});
        }

        res.json({ success: true, data: role });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to update role' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE ROLE
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.delete('/:id', authenticate, withTenantTx(), authorize('roles:delete'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        // BE-60: Tenant-scoped role delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(roles.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            delConds.push(eq(roles.tenantId, tenantId));
        }
        // Branch-level callers can only delete roles owned by their own branch.
        if (!req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) >= 5) {
            delConds.push(eq(roles.branchId, req.authUser?.activeBranchId ?? '__none__'));
        }

        const existing = await db.query.roles.findFirst({ where: and(...delConds) });

        if (!existing) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Role not found or no access' }
            });
        }

        // Prevent deleting system roles
        if (existing.isSystem) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot delete system roles' }
            });
        }

        // Prevent deleting roles with assigned users
        const [{ value: userCount }] = await db.select({ value: count() }).from(users).where(eq(users.roleId, id));
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'HAS_USERS',
                    message: `Cannot delete role with ${userCount} assigned users`
                }
            });
        }

        await db.delete(roles).where(and(...delConds));

        res.json({ success: true, message: 'Role deleted successfully' });
    } catch (error) {
        console.error('Delete role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to delete role' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ASSIGN ROLE TO USER
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.post('/:id/assign', authenticate, withTenantTx(), authorize('roles:update'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'userId is required' }
            });
        }

        // BE-64: Tenant-scoped role assignment
        const tenantId = req.authUser?.tenantId;
        const callerLevel = req.authUser?.roleLevel ?? 7;
        const assignConds: any[] = [eq(roles.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            assignConds.push(or(eq(roles.tenantId, tenantId), isNull(roles.tenantId)));
        }
        // Branch-level callers may assign tenant-wide templates (branchId IS NULL)
        // or roles owned by their own branch — never another branch's role.
        if (!req.authUser?.isSuperAdmin && callerLevel >= 5) {
            assignConds.push(or(isNull(roles.branchId), eq(roles.branchId, req.authUser?.activeBranchId ?? '__none__')));
        }

        const role = await db.query.roles.findFirst({ where: and(...assignConds) });
        if (!role) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Role not found or no access' }
            });
        }

        // BE-64: Block assigning platform-scope roles via tenant API
        if (!req.authUser?.isSuperAdmin && role.tenantId === null && role.isSystem) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot assign platform-scope roles' }
            });
        }

        // Privilege ladder: cannot grant a role more privileged than your own.
        if (!req.authUser?.isSuperAdmin) {
            const targetLevel = ROLE_LEVELS[role.name] ?? 7;
            if (targetLevel < callerLevel) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Cannot assign a role with higher privileges than your own' }
                });
            }
        }

        // Check if user exists (tenant-scoped)
        const userConds: any[] = [eq(users.id, userId)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            userConds.push(eq(users.tenantId, tenantId));
        }
        const user = await db.query.users.findFirst({ where: and(...userConds) });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // Branch isolation: branch-level callers can only re-role users in their own branch.
        if (!req.authUser?.isSuperAdmin && callerLevel >= 5 && user.branchId !== req.authUser?.activeBranchId) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot assign roles to users outside your branch' }
            });
        }

        // Update user's role
        const [updatedUser] = await db.update(users)
            .set({ roleId: id, role: role.name, updatedAt: new Date() })
            .where(eq(users.id, userId))
            .returning();

        // Invalidate the target user's cached identity + permission mask so the
        // new role takes effect immediately instead of after the 5-min TTL.
        if (tenantId) invalidateUserPermissions(userId, tenantId).catch(() => {});
        invalidateUserStoreCache(userId).catch(() => {});

        res.json({ success: true, data: updatedUser });
    } catch (error) {
        console.error('Assign role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to assign role' }
        });
    }
});
