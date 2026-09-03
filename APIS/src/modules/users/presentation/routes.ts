// ═══════════════════════════════════════════════════════════════════════════
// Users Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, ensureScopeAccess, invalidateUserStoreCache, resolveAssignableRole } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { users, userStores, branches, transactions, menuPermissions, rules, roleRules, roles } from '@/db/schema/tables';
import { eq, and, or, ilike, inArray, notInArray, lt, desc, asc, count, isNull } from 'drizzle-orm';
import argon2 from 'argon2';
import { invalidateUserPermissions } from '@/infrastructure/services/permission.service';

export const userRoutes = Router();

// Never expose password hash, 2FA secret, or session tokens in API responses
const USER_SAFE_COLUMNS = {
    password: false,
    twoFASecret: false,
} as const;

/** Strip sensitive fields from a user object returned by .returning() */
function stripSensitive<T extends { password?: unknown; twoFASecret?: unknown }>(u: T) {
    const { password: _p, twoFASecret: _t, ...safe } = u;
    return safe;
}

function canManageUserRecord(req: any, target: { id: string; tenantId?: string | null; isSuperAdmin?: boolean | null; branchId?: string | null; storeId?: string | null; roleRelation?: { level: number } | null }): boolean {
    const authUser = req.authUser;
    if (!authUser) return false;
    if (authUser.isSuperAdmin) return true;
    if (target.tenantId !== authUser.tenantId) return false;
    if (target.isSuperAdmin) return false;
    // DB-backed level from the target's own linked `roles` row — see the
    // matching comment in staff/presentation/routes.ts's canManageStaffRecord
    // for why a name-based getRoleLevel() lookup silently let any custom
    // role through regardless of its actual privilege.
    if ((target.roleRelation?.level ?? 7) <= (authUser.roleLevel ?? 7)) return false;
    return ensureScopeAccess({ tenantId: target.tenantId, branchId: target.branchId, storeId: target.storeId }, req);
}

function canViewUserRecord(req: any, target: { id: string; tenantId?: string | null; isSuperAdmin?: boolean | null; branchId?: string | null; storeId?: string | null; roleRelation?: { level: number } | null }): boolean {
    if (req.authUser?.userId === target.id) return true;
    return canManageUserRecord(req, target);
}

async function invalidateUserAuthCaches(userId: string, tenantId?: string | null): Promise<void> {
    await invalidateUserStoreCache(userId);
    if (tenantId) await invalidateUserPermissions(userId, tenantId);
}

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL USERS
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.get('/', authenticate, withTenantTx(), authorize('users:read'), branchFilter(), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { page = '1', limit = '50', search, branchId, role, isActive } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const authUser = req.authUser;
        const isSuperAdmin = authUser?.isSuperAdmin;

        // Non-superadmins: scope to their store and hide system admins.
        // Tenant-wide admins (roleLevel <= 2, e.g. store_owner) are exempt
        // from the store/branch narrowing below — otherwise they'd only see
        // their "active" store's users instead of their whole tenant.
        const isTenantWideAdmin = !isSuperAdmin && (authUser?.roleLevel ?? 7) <= 2;
        const conditions: any[] = [];
        let scopedUserIds: string[] | null = null;
        if (!isSuperAdmin) {
            // BE-77: Tenant isolation — always filter by tenantId first
            const tenantId = authUser?.tenantId;
            if (tenantId) {
                conditions.push(eq(users.tenantId, tenantId));
            }
            if (!isTenantWideAdmin) {
                const activeStoreId = authUser?.activeStoreId;
                if (activeStoreId) {
                    const usList = await db.query.userStores.findMany({ where: eq(userStores.storeId, activeStoreId), columns: { userId: true } });
                    scopedUserIds = usList.map(us => us.userId);
                } else {
                    const filter = req.branchFilter;
                    if (filter?.branchIds?.length) {
                        const usList = await db.query.userStores.findMany({ where: inArray(userStores.branchId, filter.branchIds), columns: { userId: true } });
                        scopedUserIds = usList.map(us => us.userId);
                    }
                }
            }
            conditions.push(eq(users.isSuperAdmin, false));
            // Ladder rule keyed off the target's own linked `roles.level`
            // (DB-backed) via a subquery — isSuperAdmin=false above is the
            // primary boundary; this is defense-in-depth against a
            // privileged CUSTOM role (a name-based exclusion list could never
            // catch this, since it doesn't know about tenant-created roles).
            const callerLevel = authUser?.roleLevel ?? 7;
            const higherRoleIds = db.select({ id: roles.id }).from(roles).where(lt(roles.level, callerLevel));
            conditions.push(or(isNull(users.roleId), notInArray(users.roleId, higherRoleIds))!);
        }

        if (scopedUserIds !== null) {
            if (scopedUserIds.length === 0) return res.json({ success: true, data: [], meta: { total: 0, page: parseInt(page as string), limit: parseInt(limit as string), totalPages: 0 } });
            conditions.push(inArray(users.id, scopedUserIds));
        }

        if (search) {
            const s = String(search);
            conditions.push(or(ilike(users.name, `%${s}%`), ilike(users.email, `%${s}%`), ilike(users.phone, `%${s}%`)));
        }

        if (branchId) conditions.push(eq(users.branchId, String(branchId)));
        if (role) conditions.push(eq(users.role, String(role)));
        if (isActive !== undefined) conditions.push(eq(users.isActive, isActive === 'true'));

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [userRows, [{ value: total }]] = await Promise.all([
            db.query.users.findMany({
                where: whereClause,
                columns: USER_SAFE_COLUMNS,
                offset: skip,
                limit: parseInt(limit as string),
                orderBy: desc(users.createdAt),
                with: { branch: true, roleRelation: true },
            }),
            db.select({ value: count() }).from(users).where(whereClause),
        ]);

        res.json({
            success: true,
            data: userRows,
            meta: {
                total,
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                totalPages: Math.ceil(total / parseInt(limit as string))
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to get users' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET USER BY ID
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.get('/:id', authenticate, withTenantTx(), authorize('users:read'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const user = await db.query.users.findFirst({
            where: eq(users.id, req.params.id),
            columns: USER_SAFE_COLUMNS,
            with: { branch: true, roleRelation: true },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // The old check here was `user.tenantId && user.tenantId !== ...` —
        // any orphaned/legacy row with a NULL tenantId skipped the comparison
        // entirely and was returned to every tenant's admin. It also never
        // checked branch/store scope at all (contrast with GET /, just above,
        // which does). canViewUserRecord() is the same guard already used by
        // every other single-user route in this file.
        if (!canViewUserRecord(req, user)) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
        }

        res.json({ success: true, data: user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to get user' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATE USER
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.post('/', authenticate, withTenantTx(), authorize('users:create'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { email, password, name, phone, avatar, role, roleId, branchId, isActive = true } = req.body;

        // Validate required fields
        if (!email || !password || !name || !branchId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Email, password, name, and branchId are required' }
            });
        }

        const tenantId = req.authUser?.tenantId || req.user?.tenantId;

        // Check if email exists within the caller's tenant
        const emailConds: any[] = [eq(users.email, email)];
        if (tenantId && !req.authUser?.isSuperAdmin) emailConds.push(eq(users.tenantId, tenantId));
        const existing = await db.query.users.findFirst({ where: and(...emailConds) });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Email already exists' }
            });
        }

        // Check if branch exists and belongs to the caller's tenant/scope
        const branchConds: any[] = [eq(branches.id, branchId)];
        if (tenantId && !req.authUser?.isSuperAdmin) branchConds.push(eq(branches.tenantId, tenantId));
        const branch = await db.query.branches.findFirst({ where: and(...branchConds) });
        if (!branch) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Branch not found or no access' }
            });
        }

        if (!ensureScopeAccess({ tenantId: branch.tenantId, branchId: branch.id }, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot create user in a branch outside your scope' } });
        }

        // Resolves the role via the same visibility + ladder + "cannot grant
        // permissions you don't personally hold" checks as staff creation —
        // see resolveAssignableRole for why a name-only ladder check isn't
        // enough on its own (any custom role name defaults to the lowest
        // privilege tier, making the ladder a no-op for it regardless of
        // what permissions it actually holds).
        let finalRoleId: string | undefined;
        let finalRole = 'staff';
        if (roleId || role) {
            const resolved = await resolveAssignableRole(db, {
                roleId: roleId || undefined,
                roleName: role || undefined,
                callerTenantId: tenantId ?? null,
                callerBranchId: req.authUser?.activeBranchId,
                callerRoleLevel: req.authUser?.roleLevel ?? 7,
                callerIsSuperAdmin: req.authUser?.isSuperAdmin ?? false,
                callerPermissions: req.authUser?.permissions || [],
            });
            if (!resolved) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Role not found or not assignable' } });
            }
            finalRoleId = resolved.id;
            finalRole = resolved.name;
        }

        // Hash password
        const hashedPassword = await argon2.hash(password);

        const [user] = await db.insert(users).values({
            tenantId,
            email,
            password: hashedPassword,
            name,
            phone,
            avatar,
            role: finalRole,
            roleId: finalRoleId,
            branchId,
            isActive,
        }).returning();

        res.status(201).json({ success: true, data: stripSensitive(user) });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to create user' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE USER
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.put('/:id', authenticate, withTenantTx(), authorize('users:update'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { email, password, name, phone, avatar, role, roleId, branchId, isActive } = req.body;

        // Check if user exists
        const tenantId = req.authUser?.tenantId;
        const existingConds: any[] = [eq(users.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) existingConds.push(eq(users.tenantId, tenantId));
        const existing = await db.query.users.findFirst({ where: and(...existingConds), with: { roleRelation: { columns: { level: true } } } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        if (!canManageUserRecord(req, existing)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify this user' } });
        }

        // Check if new email conflicts
        if (email && email !== existing.email) {
            const emailConds: any[] = [eq(users.email, email)];
            if (existing.tenantId) emailConds.push(eq(users.tenantId, existing.tenantId));
            const emailExists = await db.query.users.findFirst({ where: and(...emailConds) });
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Email already exists' }
                });
            }
        }

        // Build update data
        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (email) updateData.email = email;
        if (name) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone;
        if (avatar !== undefined) updateData.avatar = avatar;
        if (roleId !== undefined) {
            if (roleId) {
                const resolved = await resolveAssignableRole(db, {
                    roleId,
                    callerTenantId: existing.tenantId ?? null,
                    callerBranchId: req.authUser?.activeBranchId,
                    callerRoleLevel: req.authUser?.roleLevel ?? 7,
                    callerIsSuperAdmin: req.authUser?.isSuperAdmin ?? false,
                    callerPermissions: req.authUser?.permissions || [],
                });
                if (!resolved) {
                    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Role not found or not assignable' } });
                }
                updateData.roleId = resolved.id;
                updateData.role = resolved.name;
            } else {
                updateData.roleId = null;
            }
        } else if (role) {
            const resolved = await resolveAssignableRole(db, {
                roleName: role,
                callerTenantId: existing.tenantId ?? null,
                callerBranchId: req.authUser?.activeBranchId,
                callerRoleLevel: req.authUser?.roleLevel ?? 7,
                callerIsSuperAdmin: req.authUser?.isSuperAdmin ?? false,
                callerPermissions: req.authUser?.permissions || [],
            });
            if (!resolved) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Role not found or not assignable' } });
            }
            updateData.role = resolved.name;
        }
        if (branchId) {
            const branchConds: any[] = [eq(branches.id, branchId)];
            if (existing.tenantId && !req.authUser?.isSuperAdmin) branchConds.push(eq(branches.tenantId, existing.tenantId));
            const branch = await db.query.branches.findFirst({ where: and(...branchConds), columns: { id: true, tenantId: true } });
            if (!branch || !ensureScopeAccess({ tenantId: branch.tenantId, branchId: branch.id }, req)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Branch not found or outside your scope' } });
            }
            updateData.branchId = branchId;
        }
        if (isActive !== undefined) updateData.isActive = isActive;
        delete updateData.tenantId;
        delete updateData.isSuperAdmin;

        if (password) {
            updateData.password = await argon2.hash(password);
        }

        const [user] = await db.update(users)
            .set(updateData as any)
            .where(and(...existingConds))
            .returning();

        await invalidateUserAuthCaches(id, existing.tenantId);
        res.json({ success: true, data: stripSensitive(user) });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to update user' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE USER
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.delete('/:id', authenticate, withTenantTx(), authorize('users:delete'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        const tenantId = req.authUser?.tenantId;
        const existingConds: any[] = [eq(users.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) existingConds.push(eq(users.tenantId, tenantId));
        const existing = await db.query.users.findFirst({ where: and(...existingConds), with: { roleRelation: { columns: { level: true } } } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        if (!canManageUserRecord(req, existing)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete this user' } });
        }

        // Prevent self-deletion
        if (req.authUser!.userId === id) {
            return res.status(400).json({
                success: false,
                error: { code: 'SELF_DELETE', message: 'Cannot delete your own account' }
            });
        }

        // Check for related transactions
        const txConds: any[] = [eq(transactions.userId, id)];
        if (existing.tenantId) txConds.push(eq(transactions.tenantId, existing.tenantId));
        const [{ value: transactionCount }] = await db.select({ value: count() }).from(transactions).where(and(...txConds));

        if (transactionCount > 0) {
            await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(and(...existingConds));
            await invalidateUserAuthCaches(id, existing.tenantId);
            return res.json({ success: true, message: 'User deactivated (has related transactions)', deactivated: true });
        }

        // Hard delete if no transactions
        await db.delete(users).where(and(...existingConds));
        await invalidateUserAuthCaches(id, existing.tenantId);

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to delete user' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// TOGGLE USER ACTIVE STATUS
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.patch('/:id/toggle-active', authenticate, withTenantTx(), authorize('users:update'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        const tenantId = req.authUser?.tenantId;
        const existingConds: any[] = [eq(users.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) existingConds.push(eq(users.tenantId, tenantId));
        const existing = await db.query.users.findFirst({ where: and(...existingConds), with: { roleRelation: { columns: { level: true } } } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        if (!canManageUserRecord(req, existing)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot update this user status' } });
        }

        const [user] = await db.update(users)
            .set({ isActive: !existing.isActive, updatedAt: new Date() })
            .where(and(...existingConds))
            .returning();

        await invalidateUserAuthCaches(id, existing.tenantId);
        res.json({ success: true, data: stripSensitive(user) });
    } catch (error) {
        console.error('Toggle user active error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to toggle user status' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET USER PERMISSIONS (Combined: Role + User-specific)
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.get('/:id/permissions', authenticate, withTenantTx(), authorize('users:read'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const userConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) userConds.push(eq(users.tenantId, tenantId));
        const user = await db.query.users.findFirst({
            where: and(...userConds),
            columns: USER_SAFE_COLUMNS,
            with: { roleRelation: true },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }
        if (!canViewUserRecord(req, user)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot view this user permissions' } });
        }

        // Get all available permissions for reference
        const allPermissions = [
            // Dashboard
            { module: 'dashboard', permissions: ['dashboard:view'] },
            // POS
            { module: 'pos', permissions: ['pos:view', 'pos:sell'] },
            // Sales
            { module: 'sales', permissions: ['sales:view', 'sales:create', 'sales:update', 'sales:delete', 'sales:view-own', 'sales:void', 'sales:refund'] },
            // Products
            { module: 'products', permissions: ['products:view', 'products:create', 'products:update', 'products:delete'] },
            // Categories
            { module: 'categories', permissions: ['categories:view', 'categories:create', 'categories:update', 'categories:delete'] },
            // Inventory
            { module: 'inventory', permissions: ['inventory:view', 'inventory:update', 'inventory:adjust'] },
            // Restaurant
            { module: 'restaurant', permissions: ['restaurant:view', 'restaurant:update', 'restaurant:manage-tables', 'restaurant:manage-orders'] },
            // Promotions
            { module: 'promotions', permissions: ['promotions:view', 'promotions:create', 'promotions:update', 'promotions:delete'] },
            // Customers
            { module: 'customers', permissions: ['customers:view', 'customers:create', 'customers:update', 'customers:delete'] },
            // Payments
            { module: 'payments', permissions: ['payments:view', 'payments:manage'] },
            // Reports
            { module: 'reports', permissions: ['reports:view', 'reports:export'] },
            // Staff
            { module: 'staff', permissions: ['staff:view', 'staff:create', 'staff:update', 'staff:delete'] },
            // Users
            { module: 'users', permissions: ['users:view', 'users:create', 'users:update', 'users:delete'] },
            // Roles
            { module: 'roles', permissions: ['roles:view', 'roles:create', 'roles:update', 'roles:delete'] },
            // Branches
            { module: 'branches', permissions: ['branches:view', 'branches:create', 'branches:update', 'branches:delete'] },
            // Settings
            { module: 'settings', permissions: ['settings:view', 'settings:update'] },
        ];

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    isSuperAdmin: user.isSuperAdmin
                },
                rolePermissions: user.roleRelation?.permissions || [],
                userPermissions: user.permissions || [],
                role: user.roleRelation,
                allPermissions
            }
        });
    } catch (error) {
        console.error('Get user permissions error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to get user permissions' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE USER PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════
// Direct permission changes are staff-management changes. Keep this legacy
// endpoint behind the same owner-granted staff:update permission as the
// dedicated /staff/:id/permissions endpoint, so users:update cannot be used
// as a privilege-escalation bypass.
userRoutes.put('/:id/permissions', authenticate, withTenantTx(), authorize('staff:update'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Permissions must be an array' }
            });
        }

        // Validate that all permissions are strings
        const validPermissions = permissions.filter(p => typeof p === 'string');

        const tenantId = req.authUser?.tenantId;
        const targetConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) targetConds.push(eq(users.tenantId, tenantId));
        const targetUser = await db.query.users.findFirst({
            where: and(...targetConds),
            columns: { id: true, tenantId: true, isSuperAdmin: true, branchId: true, storeId: true },
            with: { roleRelation: { columns: { level: true } } },
        });
        if (!targetUser || !canManageUserRecord(req, targetUser)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify this user permissions' } });
        }

        let scopedPermissions = validPermissions;
        if (!req.authUser?.isSuperAdmin) {
            const callerPerms = new Set(req.authUser?.permissions || []);
            scopedPermissions = validPermissions.filter((p: string) => callerPerms.has(p));
        }

        const [user] = await db.update(users)
            .set({ permissions: scopedPermissions, updatedAt: new Date() })
            .where(and(...targetConds))
            .returning();

        await invalidateUserAuthCaches(req.params.id, targetUser.tenantId);
        res.json({
            success: true,
            data: stripSensitive(user),
            message: 'User permissions updated successfully'
        });
    } catch (error) {
        console.error('Update user permissions error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to update user permissions' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL AVAILABLE PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.get('/permissions/all', authenticate, withTenantTx(), authorize('users:read'), async (_req, res) => {
    try {
        const allPermissions = [
            { module: 'dashboard', label: 'ແຜງຄວບຄຸມ', permissions: [
                { value: 'dashboard:view', label: 'ເບິ່ງແຜງຄວບຄຸມ' }
            ]},
            { module: 'pos', label: 'ຂາຍໜ້າຮ້ານ', permissions: [
                { value: 'pos:access', label: 'ເຂົ້າໃຊ້ POS' },
                { value: 'pos:sell', label: 'ຂາຍສິນຄ້າ' },
                { value: 'pos:discount', label: 'ໃຫ້ສ່ວນຫຼຸດ' },
                { value: 'pos:refund', label: 'ຄືນເງິນ POS' },
                { value: 'pos:void', label: 'ຍົກເລີກ POS' },
                { value: 'pos:credit', label: 'ຂາຍເຊື່ອ' }
            ]},
            { module: 'sales', label: 'ການຂາຍ', permissions: [
                { value: 'sales:read', label: 'ອ່ານຂໍ້ມູນການຂາຍ' },
                { value: 'sales:view', label: 'ເບິ່ງການຂາຍ' },
                { value: 'sales:create', label: 'ສ້າງການຂາຍ' },
                { value: 'sales:update', label: 'ແກ້ໄຂການຂາຍ' },
                { value: 'sales:delete', label: 'ລຶບການຂາຍ' },
                { value: 'sales:export', label: 'ສົ່ງອອກການຂາຍ' },
                { value: 'sales:void', label: 'ຍົກເລີກການຂາຍ' },
                { value: 'sales:refund', label: 'ຄືນເງິນ' },
                { value: 'sales:view-own', label: 'ເບິ່ງການຂາຍຂອງຕົນ' }
            ]},
            { module: 'products', label: 'ສິນຄ້າ', permissions: [
                { value: 'products:read', label: 'ອ່ານຂໍ້ມູນສິນຄ້າ' },
                { value: 'products:view', label: 'ເບິ່ງສິນຄ້າ' },
                { value: 'products:create', label: 'ສ້າງສິນຄ້າ' },
                { value: 'products:update', label: 'ແກ້ໄຂສິນຄ້າ' },
                { value: 'products:delete', label: 'ລຶບສິນຄ້າ' }
            ]},
            { module: 'categories', label: 'ໝວດໝູ່', permissions: [
                { value: 'categories:read', label: 'ອ່ານຂໍ້ມູນໝວດໝູ່' },
                { value: 'categories:view', label: 'ເບິ່ງໝວດໝູ່' },
                { value: 'categories:create', label: 'ສ້າງໝວດໝູ່' },
                { value: 'categories:update', label: 'ແກ້ໄຂໝວດໝູ່' },
                { value: 'categories:delete', label: 'ລຶບໝວດໝູ່' }
            ]},
            { module: 'inventory', label: 'ສາງ', permissions: [
                { value: 'inventory:read', label: 'ອ່ານຂໍ້ມູນສາງ' },
                { value: 'inventory:view', label: 'ເບິ່ງສາງ' },
                { value: 'inventory:create', label: 'ສ້າງລາຍການສາງ' },
                { value: 'inventory:update', label: 'ອັບເດດສາງ' },
                { value: 'inventory:delete', label: 'ລຶບລາຍການສາງ' },
                { value: 'inventory:adjust', label: 'ປັບສາງ' },
                { value: 'inventory:transfer', label: 'ໂອນສາງ' },
                { value: 'inventory:stockin', label: 'ນຳເຂົ້າສາງ' },
                { value: 'inventory:stockout', label: 'ນຳອອກສາງ' }
            ]},
            { module: 'restaurant', label: 'ຮ້ານອາຫານ', permissions: [
                { value: 'restaurant:access', label: 'ເຂົ້າໃຊ້ຮ້ານອາຫານ' },
                { value: 'restaurant:view', label: 'ເບິ່ງຮ້ານອາຫານ' },
                { value: 'restaurant:manage', label: 'ຈັດການຮ້ານອາຫານ' },
                { value: 'restaurant:tables', label: 'ຈັດການໂຕະ' },
                { value: 'restaurant:kitchen', label: 'ຈັດການຄົວ' },
                { value: 'restaurant:reservations', label: 'ຈັດການການຈອງ' }
            ]},
            { module: 'tables', label: 'ໂຕະ (CRUD)', permissions: [
                { value: 'tables:create', label: 'ສ້າງໂຕະ' },
                { value: 'tables:update', label: 'ແກ້ໄຂໂຕະ' },
                { value: 'tables:delete', label: 'ລຶບໂຕະ' }
            ]},
            { module: 'promotions', label: 'ໂປຣໂມຊັ່ນ', permissions: [
                { value: 'promotions:read', label: 'ອ່ານຂໍ້ມູນໂປຣໂມຊັ່ນ' },
                { value: 'promotions:view', label: 'ເບິ່ງໂປຣໂມຊັ່ນ' },
                { value: 'promotions:create', label: 'ສ້າງໂປຣໂມຊັ່ນ' },
                { value: 'promotions:update', label: 'ແກ້ໄຂໂປຣໂມຊັ່ນ' },
                { value: 'promotions:delete', label: 'ລຶບໂປຣໂມຊັ່ນ' }
            ]},
            { module: 'customers', label: 'ລູກຄ້າ', permissions: [
                { value: 'customers:read', label: 'ອ່ານຂໍ້ມູນລູກຄ້າ' },
                { value: 'customers:view', label: 'ເບິ່ງລູກຄ້າ' },
                { value: 'customers:create', label: 'ສ້າງລູກຄ້າ' },
                { value: 'customers:update', label: 'ແກ້ໄຂລູກຄ້າ' },
                { value: 'customers:delete', label: 'ລຶບລູກຄ້າ' }
            ]},
            { module: 'payments', label: 'ການຊຳລະ', permissions: [
                { value: 'payments:read', label: 'ອ່ານຂໍ້ມູນການຊຳລະ' },
                { value: 'payments:view', label: 'ເບິ່ງການຊຳລະ' },
                { value: 'payments:refund', label: 'ຄືນເງິນ' },
                { value: 'payments:settings', label: 'ຕັ້ງຄ່າການຊຳລະ' },
                { value: 'payments:manage', label: 'ຈັດການການຊຳລະ' },
                { value: 'payments:void', label: 'ຍົກເລີກການຊຳລະ' },
                { value: 'payments:settle', label: 'ປິດບັນຊີ' }
            ]},
            { module: 'reports', label: 'ລາຍງານ', permissions: [
                { value: 'reports:view', label: 'ເບິ່ງລາຍງານ' },
                { value: 'reports:export', label: 'ສົ່ງອອກລາຍງານ' },
                { value: 'reports:sales', label: 'ລາຍງານການຂາຍ' },
                { value: 'reports:inventory', label: 'ລາຍງານສາງ' },
                { value: 'reports:financial', label: 'ລາຍງານການເງິນ' },
                { value: 'reports:staff', label: 'ລາຍງານພະນັກງານ' }
            ]},
            { module: 'staff', label: 'ພະນັກງານ', permissions: [
                { value: 'staff:read', label: 'ອ່ານຂໍ້ມູນພະນັກງານ' },
                { value: 'staff:view', label: 'ເບິ່ງພະນັກງານ' },
                { value: 'staff:create', label: 'ສ້າງພະນັກງານ' },
                { value: 'staff:update', label: 'ແກ້ໄຂພະນັກງານ' },
                { value: 'staff:delete', label: 'ລຶບພະນັກງານ' }
            ]},
            { module: 'users', label: 'ຜູ້ໃຊ້', permissions: [
                { value: 'users:read', label: 'ອ່ານຂໍ້ມູນຜູ້ໃຊ້' },
                { value: 'users:view', label: 'ເບິ່ງຜູ້ໃຊ້' },
                { value: 'users:create', label: 'ສ້າງຜູ້ໃຊ້' },
                { value: 'users:update', label: 'ແກ້ໄຂຜູ້ໃຊ້' },
                { value: 'users:delete', label: 'ລຶບຜູ້ໃຊ້' }
            ]},
            { module: 'roles', label: 'ບົດບາດ', permissions: [
                { value: 'roles:read', label: 'ອ່ານຂໍ້ມູນບົດບາດ' },
                { value: 'roles:view', label: 'ເບິ່ງບົດບາດ' },
                { value: 'roles:create', label: 'ສ້າງບົດບາດ' },
                { value: 'roles:update', label: 'ແກ້ໄຂບົດບາດ' },
                { value: 'roles:delete', label: 'ລຶບບົດບາດ' }
            ]},
            { module: 'branches', label: 'ສາຂາ', permissions: [
                { value: 'branches:read', label: 'ອ່ານຂໍ້ມູນສາຂາ' },
                { value: 'branches:view', label: 'ເບິ່ງສາຂາ' },
                { value: 'branches:create', label: 'ສ້າງສາຂາ' },
                { value: 'branches:update', label: 'ແກ້ໄຂສາຂາ' },
                { value: 'branches:delete', label: 'ລຶບສາຂາ' }
            ]},
            { module: 'stores', label: 'ຮ້ານ', permissions: [
                { value: 'stores:read', label: 'ອ່ານຂໍ້ມູນຮ້ານ' },
                { value: 'stores:view', label: 'ເບິ່ງຮ້ານ' },
                { value: 'stores:create', label: 'ສ້າງຮ້ານ' },
                { value: 'stores:update', label: 'ແກ້ໄຂຮ້ານ' },
                { value: 'stores:delete', label: 'ລຶບຮ້ານ' },
                { value: 'stores:assign', label: 'ກຳນົດຜູ້ໃຊ້ຮ້ານ' },
                { value: 'stores:products', label: 'ຈັດການສິນຄ້າຮ້ານ' }
            ]},
            { module: 'settings', label: 'ຕັ້ງຄ່າ', permissions: [
                { value: 'settings:read', label: 'ອ່ານຂໍ້ມູນຕັ້ງຄ່າ' },
                { value: 'settings:view', label: 'ເບິ່ງຕັ້ງຄ່າ' },
                { value: 'settings:update', label: 'ແກ້ໄຂຕັ້ງຄ່າ' }
            ]},
            { module: 'documents', label: 'ເອກະສານ', permissions: [
                { value: 'documents:read', label: 'ອ່ານຂໍ້ມູນເອກະສານ' },
                { value: 'documents:view', label: 'ເບິ່ງເອກະສານ' },
                { value: 'documents:create', label: 'ສ້າງເອກະສານ' },
                { value: 'documents:update', label: 'ແກ້ໄຂເອກະສານ' },
                { value: 'documents:delete', label: 'ລຶບເອກະສານ' }
            ]}
        ];

        res.json({ success: true, data: allPermissions });
    } catch (error) {
        console.error('Get all permissions error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to get permissions' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET CURRENT USER'S MENU (filtered by roleRules.canRead — Level 2 of permission model)
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.get('/me/menu', authenticate, withTenantTx(), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const isSuperAdmin = authUser.isSuperAdmin === true;

        // Build permitted permission set from roleRules (canRead=true) — this is the authoritative check
        const rulePermSet = new Set<string>();
        if (!isSuperAdmin) {
            const dbUser = await db.query.users.findFirst({
                where: eq(users.id, authUser.userId),
                columns: { roleId: true, role: true },
            });

            let rrRows: any[] = [];
            if (dbUser?.roleId) {
                rrRows = await db.query.roleRules.findMany({
                    where: and(eq(roleRules.roleId, dbUser.roleId), eq(roleRules.canRead, true)),
                    with: { rule: true },
                });
                // Fallback: if tenant role has no rules, inherit from the global role of same name
                if (rrRows.length === 0 && dbUser.role) {
                    const globalRole = await db.query.roles.findFirst({
                        where: and(eq(roles.name, dbUser.role), isNull(roles.tenantId)),
                    });
                    if (globalRole) {
                        rrRows = await db.query.roleRules.findMany({
                            where: and(eq(roleRules.roleId, globalRole.id), eq(roleRules.canRead, true)),
                            with: { rule: true },
                        });
                    }
                }
            }
            // Collect all permission strings from canRead rules
            for (const rr of rrRows) {
                if (rr.rule?.permissions?.length) {
                    for (const p of rr.rule.permissions) rulePermSet.add(p);
                }
                // Also add rule name as a shorthand (e.g. 'products' covers 'products:view')
                if (rr.rule?.name) rulePermSet.add(rr.rule.name);
            }
        }

        // Legacy permissions array (for backward compat with roles that haven't been migrated to roleRules)
        const legacyPerms: string[] = authUser.permissions || [];

        function hasPermission(perm: string): boolean {
            if (isSuperAdmin) return true;
            // Primary check: rule-based permissions (canRead=true grants menu visibility)
            if (rulePermSet.has(perm)) return true;
            // Shorthand: if perm starts with a rule name we have canRead for
            const module = perm.split(':')[0];
            if (module && rulePermSet.has(module)) return true;
            // Legacy fallback: permissions array on the role object
            if (legacyPerms.includes('*')) return true;
            if (legacyPerms.includes(perm)) return true;
            if (perm.endsWith(':view')) return legacyPerms.includes(perm.replace(':view', ':read'));
            if (perm.endsWith(':read')) return legacyPerms.includes(perm.replace(':read', ':view'));
            return false;
        }

        // Load active menu items from DB
        let menus = await db.query.menuPermissions.findMany({
            where: and(eq(menuPermissions.isActive, true), isNull(menuPermissions.parentId)),
            orderBy: asc(menuPermissions.order),
            with: { children: true },
        });
        menus = menus.map(m => ({
            ...m,
            children: (m.children || []).filter((c: any) => c.isActive).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)),
        }));

        if (menus.length === 0) {
            return res.json({ success: true, data: [] });
        }

        // Filter children by their OWN permission first, then decide whether
        // to keep the parent category based on the surviving children —
        // not the parent's own requiredPermission in isolation. The old
        // order filtered on the parent's permission FIRST, so a child with
        // a lower/different permission requirement than its parent (e.g.
        // "Shifts" needing only sales:create, nested under "Management"
        // which needs staff:view) was unreachable no matter what the child
        // itself allowed — a plain cashier who could open/close their own
        // shift never saw the parent category at all, so the child never
        // even got evaluated.
        const filteredMenus = menus
            .map(menu => ({
                ...menu,
                children: (menu.children || []).filter(
                    child => !child.requiredPermission || hasPermission(child.requiredPermission),
                ),
            }))
            .filter(menu =>
                menu.children.length > 0 ||
                (!menu.path ? false : (!menu.requiredPermission || hasPermission(menu.requiredPermission)))
            );

        res.json({ success: true, data: filteredMenus });
    } catch (error) {
        console.error('Get user menu error:', error);
        // An empty menu is a valid authorization result, but it is not a safe
        // fallback for a database/cache failure. Returning success here made
        // the frontend hide navigation and incorrectly treat infrastructure
        // errors as "no permissions".
        res.status(503).json({
            success: false,
            error: { code: 'AUTHORIZATION_UNAVAILABLE', message: 'Menu authorization is temporarily unavailable' },
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET CURRENT USER'S RULES (Rule-Based RBAC)
// Returns: { rules: [{ name, module, routes[], crud: {read,create,update,delete} }] }
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.get('/me/rules', authenticate, withTenantTx(), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;

        // Super Admin gets all rules with full CRUD
        if (authUser.isSuperAdmin) {
            const allRules = await db.query.rules.findMany({
                where: eq(rules.isActive, true),
                orderBy: asc(rules.order),
            });
            const data = allRules.map(rule => ({
                name: rule.name,
                displayName: rule.displayName,
                module: rule.module,
                icon: rule.icon,
                routes: rule.routes,
                permissions: rule.permissions,
                crud: { read: true, create: true, update: true, delete: true },
            }));
            return res.json({ success: true, data });
        }

        // Load user's role
        const user = await db.query.users.findFirst({
            where: eq(users.id, authUser.userId),
            columns: { roleId: true },
        });

        if (!user?.roleId) {
            return res.json({ success: true, data: [] });
        }

        // Load role's rules with CRUD flags
        let rrRows = await db.query.roleRules.findMany({
            where: eq(roleRules.roleId, user.roleId),
            with: { rule: true },
        });

        // Fallback: if this tenant-specific role has no rules, inherit from the global role of the same name
        if (rrRows.length === 0 && authUser.role) {
            // Fetch all global roles with this name in one query, then all their rules in one query
            const globalRoles = await db.query.roles.findMany({
                where: and(eq(roles.name, authUser.role), isNull(roles.tenantId)),
                columns: { id: true },
            });
            if (globalRoles.length > 0) {
                const globalRoleIds = globalRoles.map(r => r.id);
                const allGlobalRows = await db.query.roleRules.findMany({
                    where: inArray(roleRules.roleId, globalRoleIds),
                    with: { rule: true },
                });
                // Pick the first roleId bucket that has rules
                for (const gid of globalRoleIds) {
                    const bucket = allGlobalRows.filter(r => r.roleId === gid);
                    if (bucket.length > 0) { rrRows = bucket; break; }
                }
            }
        }

        const rolePermissions = new Set(authUser.permissions || []);
        const hasLegacyAction = (module: string, action: 'read' | 'create' | 'update' | 'delete'): boolean => {
            if (rolePermissions.has('*')) return true;
            if (rolePermissions.has(`${module}:${action}`)) return true;
            if (action === 'read' && rolePermissions.has(`${module}:view`)) return true;
            if (action === 'read' && rolePermissions.has(`${module}:read`)) return true;
            return false;
        };

        const data = rrRows
            .filter(rr => rr.rule?.isActive)
            .sort((a, b) => (a.rule?.order ?? 0) - (b.rule?.order ?? 0))
            .map(rr => ({
                name: rr.rule!.name,
                displayName: rr.rule!.displayName,
                module: rr.rule!.module,
                icon: rr.rule!.icon,
                routes: rr.rule!.routes,
                permissions: rr.rule!.permissions,
                crud: {
                    // roleRules and the legacy role permission projection can
                    // coexist during migration. A grant from either source
                    // must not make the UI stricter than the API permission
                    // check, otherwise buttons disappear while the request is
                    // actually authorized.
                    read: rr.canRead || hasLegacyAction(rr.rule!.module, 'read'),
                    create: rr.canCreate || hasLegacyAction(rr.rule!.module, 'create'),
                    update: rr.canUpdate || hasLegacyAction(rr.rule!.module, 'update'),
                    delete: rr.canDelete || hasLegacyAction(rr.rule!.module, 'delete'),
                },
            }));

        res.json({ success: true, data });
    } catch (error) {
        console.error('Get user rules error:', error);
        res.status(503).json({
            success: false,
            error: { code: 'AUTHORIZATION_UNAVAILABLE', message: 'Rule authorization is temporarily unavailable' },
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET CURRENT USER PROFILE
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.get('/me/profile', authenticate, withTenantTx(), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const currentUser = req.authUser!;

        const user = await db.query.users.findFirst({
            where: eq(users.id, currentUser.userId),
            with: { branch: true, roleRelation: true },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        res.json({ success: true, data: user });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to get profile' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE CURRENT USER PROFILE
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.put('/me/profile', authenticate, withTenantTx(), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const currentUser = req.authUser!;
        const { name, phone, avatar } = req.body;

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone;
        if (avatar !== undefined) updateData.avatar = avatar;

        const [user] = await db.update(users)
            .set({ ...updateData, updatedAt: new Date() } as any)
            .where(eq(users.id, currentUser.userId))
            .returning();

        res.json({ success: true, data: stripSensitive(user) });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to update profile' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.put('/me/password', authenticate, withTenantTx(), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const currentUser = req.authUser!;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Current password and new password are required' }
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 6 characters' }
            });
        }

        const user = await db.query.users.findFirst({
            where: eq(users.id, currentUser.userId),
            columns: { id: true, password: true },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        const isValid = await argon2.verify(user.password, currentPassword);
        if (!isValid) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' }
            });
        }

        const hashedPassword = await argon2.hash(newPassword);
        await db.update(users)
            .set({ password: hashedPassword, updatedAt: new Date() })
            .where(eq(users.id, currentUser.userId));

        res.json({ success: true, data: { message: 'Password changed successfully' } });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to change password' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE AVATAR
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.post('/me/avatar', authenticate, withTenantTx(), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const currentUser = req.authUser!;
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Avatar URL is required' }
            });
        }

        const [user] = await db.update(users)
            .set({ avatar: url, updatedAt: new Date() })
            .where(eq(users.id, currentUser.userId))
            .returning();

        res.json({ success: true, data: { url: user.avatar } });
    } catch (error) {
        console.error('Update avatar error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to update avatar' }
        });
    }
});
