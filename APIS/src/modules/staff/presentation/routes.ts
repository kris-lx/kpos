// ═══════════════════════════════════════════════════════════════════════════
// Staff Module - Routes (Drizzle ORM + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, getRoleLevel, ROLE_LEVELS, ensureScopeAccess, invalidateUserStoreCache, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { users, userStores, roles, branches, stores } from '@/db/schema/tables';
import { eq, and, or, ilike, inArray, notInArray, isNull, desc, asc, count } from 'drizzle-orm';
import argon2 from 'argon2';
import { invalidateUserPermissions } from '@/infrastructure/services/permission.service';

export const staffRoutes = Router();

function canManageStaffRecord(req: any, target: { id: string; tenantId?: string | null; role?: string | null; isSuperAdmin?: boolean | null }): boolean {
    const authUser = req.authUser;
    if (!authUser) return false;
    if (authUser.isSuperAdmin) return true;
    if (target.tenantId !== authUser.tenantId) return false;
    if (target.isSuperAdmin) return false;
    return getRoleLevel(target.role || 'staff', false) > (authUser.roleLevel ?? 7);
}

function canViewStaffRecord(req: any, target: { id: string; tenantId?: string | null; role?: string | null; isSuperAdmin?: boolean | null }): boolean {
    if (req.authUser?.userId === target.id) return true;
    return canManageStaffRecord(req, target);
}

async function invalidateStaffAuthCaches(userId: string, tenantId?: string | null): Promise<void> {
    await invalidateUserStoreCache(userId);
    if (tenantId) await invalidateUserPermissions(userId, tenantId);
}

// Get all staff
staffRoutes.get('/', authenticate, withTenantTx(), authorize('staff:read'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { page = 1, limit = 20, search, branchId, role, status } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;

        const authUser = req.authUser;
        const isSuperAdmin = authUser?.isSuperAdmin;

        const conditions: any[] = [];
        let scopedUserIds: string[] | null = null;

        // Tenant isolation for staff list
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !isSuperAdmin) {
            conditions.push(eq(users.tenantId, tenantId));
        }

        if (!isSuperAdmin) {
            const activeStoreId = authUser?.activeStoreId;
            if (activeStoreId) {
                const usList = await db.query.userStores.findMany({
                    where: eq(userStores.storeId, activeStoreId),
                    columns: { userId: true },
                });
                scopedUserIds = usList.map(us => us.userId);
            } else if (filter?.branchIds?.length) {
                if (branchId && !filter.branchIds.includes(String(branchId))) {
                    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
                }
                const targetBranchIds = branchId ? [String(branchId)] : filter.branchIds;
                const usList = await db.query.userStores.findMany({
                    where: inArray(userStores.branchId, targetBranchIds),
                    columns: { userId: true },
                });
                scopedUserIds = usList.map(us => us.userId);
            } else if (branchId) {
                conditions.push(eq(users.branchId, String(branchId)));
            }
            conditions.push(eq(users.isSuperAdmin, false));
            conditions.push(notInArray(users.role, ['super_admin', 'admin']));
        } else if (branchId) {
            conditions.push(eq(users.branchId, String(branchId)));
        }

        if (scopedUserIds !== null) {
            if (scopedUserIds.length === 0) {
                return res.json({ success: true, data: [], meta: { page: Number(page), limit: Number(limit), total: 0, totalPages: 0 } });
            }
            conditions.push(inArray(users.id, scopedUserIds));
        }

        if (search) {
            const s = String(search);
            conditions.push(or(ilike(users.name, `%${s}%`), ilike(users.email, `%${s}%`), ilike(users.phone, `%${s}%`)));
        }
        if (role) conditions.push(eq(users.role, String(role)));
        if (status === 'active') conditions.push(eq(users.isActive, true));
        if (status === 'inactive') conditions.push(eq(users.isActive, false));

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [staffRows, [{ value: total }]] = await Promise.all([
            db.query.users.findMany({
                where: whereClause,
                offset: skip,
                limit: Number(limit),
                orderBy: desc(users.createdAt),
                columns: { password: false, twoFASecret: false },
                with: { branch: true, roleRelation: true },
            }),
            db.select({ value: count() }).from(users).where(whereClause),
        ]);

        res.json({
            success: true,
            data: staffRows,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get all roles (scoped: non-admins only see non-system roles for their level)
// MUST be before /:id to prevent Express matching /roles/list as /:id
staffRoutes.get('/roles/list', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const user = req.authUser || req.user!;
        const isSuperAdmin = req.authUser?.isSuperAdmin ?? false;
        const isAdmin = isSuperAdmin || ['admin', 'hq_admin', 'hq_manager'].includes(user.role);
        const isStoreOwner = user.role === 'store_owner';

        // BE-78: Tenant isolation on roles list
        const tenantId = req.authUser?.tenantId;
        const baseConds: any[] = [];
        if (!isSuperAdmin && tenantId) {
            baseConds.push(or(eq(roles.tenantId, tenantId), isNull(roles.tenantId)));
        }

        let roleRows;
        if (isSuperAdmin) {
            roleRows = await db.query.roles.findMany({ orderBy: asc(roles.name) });
        } else if (isAdmin) {
            // Tenant admin sees roles within their tenant + platform templates
            roleRows = await db.query.roles.findMany({
                where: baseConds.length > 0 ? and(...baseConds) : undefined,
                orderBy: asc(roles.name),
            });
        } else if (isStoreOwner) {
            roleRows = await db.query.roles.findMany({
                where: and(...baseConds, notInArray(roles.name, ['super_admin', 'admin', 'store_owner'])),
                orderBy: asc(roles.name),
            });
        } else {
            // branch_admin and below: show assignable system roles + tenant custom roles
            // Exclude elevated roles they cannot grant
            const excludeNames = ['super_admin', 'admin', 'hq_admin', 'hq_manager', 'store_owner'];
            roleRows = await db.query.roles.findMany({
                where: and(...baseConds, notInArray(roles.name, excludeNames)),
                orderBy: asc(roles.name),
            });
        }
        res.json({ success: true, data: roleRows });
    } catch (error) {
        next(error);
    }
});

// Get branches list for staff dropdown - scoped to user's accessible branches
// MUST be before /:id to prevent Express matching /branches/list as /:id
staffRoutes.get('/branches/list', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const isSuperAdmin = authUser.isSuperAdmin;
        const isAdmin = isSuperAdmin || ['admin', 'hq_admin', 'hq_manager'].includes(authUser.role);

        const conditions: any[] = [eq(branches.isActive, true)];

        // BE-78: Tenant isolation on branches list
        if (!isSuperAdmin && authUser.tenantId) {
            conditions.push(eq(branches.tenantId, authUser.tenantId));
        }

        if (!isAdmin && authUser.accessibleBranchIds?.length) {
            conditions.push(inArray(branches.id, authUser.accessibleBranchIds));
        }

        const branchRows = await db.query.branches.findMany({
            where: and(...conditions),
            orderBy: asc(branches.name),
        });
        res.json({ success: true, data: branchRows });
    } catch (error) {
        next(error);
    }
});

// Get staff by ID
staffRoutes.get('/:id', authenticate, withTenantTx(), authorize('staff:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser;
        const isSuperAdmin = authUser?.isSuperAdmin;

        // Tenant-scoped staff lookup
        const tenantId = req.authUser?.tenantId;
        const staffConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !isSuperAdmin) {
            staffConds.push(eq(users.tenantId, tenantId));
        }

        const staff = await db.query.users.findFirst({
            where: and(...staffConds),
            columns: { password: false, twoFASecret: false },
            with: { branch: true, roleRelation: true },
        });

        if (!staff) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff not found or no access' } });
            return;
        }

        // Non-superadmins cannot view super_admin or admin-level users (role level ≤ 2)
        if (!isSuperAdmin && (staff.isSuperAdmin || getRoleLevel(staff.role ?? '', false) <= 2)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot view this user' } });
            return;
        }

        // Non-superadmins can only view users in their own store
        if (!isSuperAdmin && authUser?.activeStoreId) {
            const hasAccess = await db.query.userStores.findFirst({
                where: and(eq(userStores.userId, staff.id), eq(userStores.storeId, authUser.activeStoreId)),
            });
            if (!hasAccess) {
                res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'User not in your store' } });
                return;
            }
        }

        // Strip isSuperAdmin from response
        const { isSuperAdmin: _isSA, ...staffData } = staff;
        res.json({ success: true, data: staffData });
    } catch (error) {
        next(error);
    }
});

// Create staff
staffRoutes.post('/', authenticate, withTenantTx(), branchFilter(), authorize('staff:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { email, password, name, phone, role, branchId, storeId, roleId, isActive, permissions } = req.body;
        const authUser = req.authUser;

        if (!email || !password || !name) {
            res.status(400).json({ success: false, error: { code: 'VAL_001', message: 'Email, password, and name are required' } });
            return;
        }

        // Privilege ladder: a caller can only create staff strictly less privileged
        // than themselves (e.g. branch_admin → manager/staff, never another admin).
        if (!authUser?.isSuperAdmin) {
            const targetRoleLevel = ROLE_LEVELS[role || 'staff'] ?? 7;
            if (targetRoleLevel < (authUser?.roleLevel ?? 7)) {
                res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot create staff with higher privileges than your own' } });
                return;
            }
        }

        // Check if email exists (tenant-scoped for multi-tenancy)
        const tenantId = req.authUser?.tenantId || req.user?.tenantId;
        const emailConds: any[] = [eq(users.email, email)];
        if (tenantId) emailConds.push(eq(users.tenantId, tenantId));
        const existing = await db.query.users.findFirst({ where: and(...emailConds) });
        if (existing) {
            res.status(400).json({ success: false, error: { code: 'VAL_002', message: 'Email already exists' } });
            return;
        }

        const hashedPassword = await argon2.hash(password);

        const sanitizedBranchId = branchId && branchId.trim() !== '' ? branchId : req.authUser?.activeBranchId || (req.user as any)?.branchId || undefined;
        const sanitizedRoleId = roleId && roleId.trim() !== '' ? roleId : undefined;
        // Validate branchId is within user's accessible scope
        const staffFilter = req.branchFilter;
        if (staffFilter && sanitizedBranchId && !req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) > 2) {
            if (!staffFilter.branchIds.includes(sanitizedBranchId)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot create staff in a branch outside your scope' } });
            }
        }
        // Resolve the store to scope this staff member to: explicit storeId >
        // creator's own active store > branch's default store. Without this
        // fallback, an owner with no activeStoreId (no userStores row of their
        // own) would create staff with no userStores mapping at all, making
        // the new staff member invisible in list/detail views that scope by
        // userStores membership — even to the owner who just created them.
        let sanitizedStoreId = storeId && String(storeId).trim() !== '' ? String(storeId) : (authUser?.activeStoreId || undefined);
        if (!sanitizedStoreId && sanitizedBranchId) {
            const branchStore = await db.query.stores.findFirst({
                where: and(eq(stores.branchId, sanitizedBranchId), eq(stores.isDefault, true)),
                columns: { id: true },
            }) ?? await db.query.stores.findFirst({
                where: eq(stores.branchId, sanitizedBranchId),
                columns: { id: true },
            });
            if (branchStore) sanitizedStoreId = branchStore.id;
        }

        const [staff] = await db.insert(users).values({
            tenantId,
            email,
            password: hashedPassword,
            name,
            phone: phone || null,
            role: role || 'staff',
            branchId: sanitizedBranchId,
            roleId: sanitizedRoleId,
            isActive: isActive !== undefined ? isActive : true,
            permissions: Array.isArray(permissions) ? permissions : [],
        }).returning({
            id: users.id,
            tenantId: users.tenantId,
            email: users.email,
            name: users.name,
            phone: users.phone,
            avatar: users.avatar,
            role: users.role,
            roleId: users.roleId,
            branchId: users.branchId,
            permissions: users.permissions,
            isActive: users.isActive,
            isSuperAdmin: users.isSuperAdmin,
            emailVerified: users.emailVerified,
            twoFAEnabled: users.twoFAEnabled,
            lastLoginAt: users.lastLoginAt,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
        });

        // Auto-create UserStore record so staff is scoped to the store
        if (sanitizedStoreId && sanitizedBranchId) {
            const existingUs = await db.query.userStores.findFirst({
                where: and(eq(userStores.userId, staff.id), eq(userStores.storeId, sanitizedStoreId)),
            });
            if (!existingUs) {
                await db.insert(userStores).values({
                    tenantId,
                    userId: staff.id,
                    storeId: sanitizedStoreId,
                    branchId: sanitizedBranchId,
                    canRead: true,
                    canWrite: true,
                    canDelete: false,
                    canManage: false,
                    isDefault: true,
                });
            }
        }

        res.status(201).json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
});

// Update staff
staffRoutes.put('/:id', authenticate, withTenantTx(), authorize('staff:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { password, id, _id, createdAt, updatedAt, ...updateData } = req.body;

        const tenantId = req.authUser?.tenantId;
        const targetConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            targetConds.push(eq(users.tenantId, tenantId));
        }
        const target = await db.query.users.findFirst({ where: and(...targetConds) });
        if (!target || !canManageStaffRecord(req, target)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff not found or no access' } });
        }

        if (password) {
            updateData.password = await argon2.hash(password);
        }

        // Remove empty string fields
        if (updateData.roleId === '' || updateData.roleId === null) delete updateData.roleId;
        if (updateData.branchId === '' || updateData.branchId === null) delete updateData.branchId;
        if (updateData.storeId === '' || updateData.storeId === null) delete updateData.storeId;

        if (updateData.roleId !== undefined) {
            if (updateData.roleId) {
                const roleConds: any[] = [eq(roles.id, updateData.roleId)];
                if (target.tenantId && !req.authUser?.isSuperAdmin) roleConds.push(or(eq(roles.tenantId, target.tenantId), isNull(roles.tenantId)));
                const roleRow = await db.query.roles.findFirst({ where: and(...roleConds), columns: { id: true, name: true } });
                if (!roleRow) {
                    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Role not found or no access' } });
                }
                if (!req.authUser?.isSuperAdmin && getRoleLevel(roleRow.name, false) <= (req.authUser?.roleLevel ?? 7)) {
                    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot assign equal or higher role' } });
                }
                updateData.role = roleRow.name;
            }
        } else if (updateData.role) {
            if (!req.authUser?.isSuperAdmin && getRoleLevel(updateData.role, false) <= (req.authUser?.roleLevel ?? 7)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot assign equal or higher role' } });
            }
        }

        if (updateData.branchId) {
            const branchConds: any[] = [eq(branches.id, updateData.branchId)];
            if (target.tenantId && !req.authUser?.isSuperAdmin) branchConds.push(eq(branches.tenantId, target.tenantId));
            const branch = await db.query.branches.findFirst({ where: and(...branchConds), columns: { id: true, tenantId: true } });
            if (!branch || !ensureScopeAccess({ tenantId: branch.tenantId, branchId: branch.id }, req)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Branch not found or outside your scope' } });
            }
        }

        updateData.updatedAt = new Date();

        // Never allow changing tenantId
        delete updateData.tenantId;
        delete updateData.isSuperAdmin;

        const [staff] = await db.update(users)
            .set(updateData)
            .where(and(...targetConds))
            .returning({
                id: users.id,
                tenantId: users.tenantId,
                email: users.email,
                name: users.name,
                phone: users.phone,
                avatar: users.avatar,
                role: users.role,
                roleId: users.roleId,
                branchId: users.branchId,
                permissions: users.permissions,
                isActive: users.isActive,
                isSuperAdmin: users.isSuperAdmin,
                emailVerified: users.emailVerified,
                twoFAEnabled: users.twoFAEnabled,
                lastLoginAt: users.lastLoginAt,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt,
            });

        await invalidateStaffAuthCaches(req.params.id, target.tenantId);
        res.json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
});

// Delete staff (soft delete)
staffRoutes.delete('/:id', authenticate, withTenantTx(), authorize('staff:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // Tenant-scoped delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            delConds.push(eq(users.tenantId, tenantId));
        }

        await db.update(users)
            .set({ isActive: false, updatedAt: new Date() })
            .where(and(...delConds));

        res.json({ success: true, message: 'Staff deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// Get staff member permissions (uses staff:read instead of users:read)
staffRoutes.get('/:id/permissions', authenticate, withTenantTx(), authorize('staff:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const userConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) userConds.push(eq(users.tenantId, tenantId));
        const user = await db.query.users.findFirst({
            where: and(...userConds),
            with: { roleRelation: true },
        });

        if (!user) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Staff not found' } });
            return;
        }
        if (!canViewStaffRecord(req, user)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot view this staff permissions' } });
        }

        const allPermissions = [
            { module: 'dashboard', label: 'ແຜງຄວບຄຸມ', permissions: [{ value: 'dashboard:view', label: 'ເບິ່ງແຜງຄວບຄຸມ' }] },
            { module: 'pos', label: 'ຂາຍໜ້າຮ້ານ', permissions: [
                { value: 'pos:view', label: 'ເບິ່ງໜ້າຂາຍ' },
                { value: 'pos:sell', label: 'ຂາຍສິນຄ້າ' },
                { value: 'pos:discount', label: 'ໃຫ້ສ່ວນຫຼຸດ' },
                { value: 'pos:void', label: 'ຍົກເລີກ' },
                { value: 'pos:refund', label: 'ຄືນເງິນ' },
            ]},
            { module: 'sales', label: 'ການຂາຍ', permissions: [
                { value: 'sales:view', label: 'ເບິ່ງ' },
                { value: 'sales:create', label: 'ສ້າງ' },
                { value: 'sales:update', label: 'ແກ້ໄຂ' },
                { value: 'sales:delete', label: 'ລຶບ' },
            ]},
            { module: 'products', label: 'ສິນຄ້າ', permissions: [
                { value: 'products:view', label: 'ເບິ່ງ' },
                { value: 'products:create', label: 'ສ້າງ' },
                { value: 'products:update', label: 'ແກ້ໄຂ' },
                { value: 'products:delete', label: 'ລຶບ' },
            ]},
            { module: 'inventory', label: 'ສາງ', permissions: [
                { value: 'inventory:view', label: 'ເບິ່ງ' },
                { value: 'inventory:update', label: 'ແກ້ໄຂ' },
                { value: 'inventory:adjust', label: 'ປັບສະຕ໋ອກ' },
            ]},
            { module: 'customers', label: 'ລູກຄ້າ', permissions: [
                { value: 'customers:view', label: 'ເບິ່ງ' },
                { value: 'customers:create', label: 'ສ້າງ' },
                { value: 'customers:update', label: 'ແກ້ໄຂ' },
                { value: 'customers:delete', label: 'ລຶບ' },
            ]},
            { module: 'staff', label: 'ພະນັກງານ', permissions: [
                { value: 'staff:view', label: 'ເບິ່ງ' },
                { value: 'staff:create', label: 'ສ້າງ' },
                { value: 'staff:update', label: 'ແກ້ໄຂ' },
                { value: 'staff:delete', label: 'ລຶບ' },
            ]},
            { module: 'reports', label: 'ລາຍງານ', permissions: [
                { value: 'reports:view', label: 'ເບິ່ງ' },
                { value: 'reports:export', label: 'ສົ່ງອອກ' },
            ]},
            { module: 'settings', label: 'ຕັ້ງຄ່າ', permissions: [
                { value: 'settings:view', label: 'ເບິ່ງ' },
                { value: 'settings:update', label: 'ແກ້ໄຂ' },
            ]},
        ];

        res.json({
            success: true,
            data: {
                user: { id: user.id, name: user.name, email: user.email, isSuperAdmin: user.isSuperAdmin },
                rolePermissions: user.roleRelation?.permissions || [],
                userPermissions: user.permissions || [],
                role: user.roleRelation,
                allPermissions,
            }
        });
    } catch (error) {
        next(error);
    }
});

// Update staff member permissions (uses staff:update instead of users:update)
staffRoutes.put('/:id/permissions', authenticate, withTenantTx(), authorize('staff:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Permissions must be an array' } });
            return;
        }

        const validPermissions = permissions.filter((p: unknown) => typeof p === 'string');

        // Tenant + role scope: target user must belong to caller's tenant and be lower privilege
        const tenantId = req.authUser?.tenantId;
        const targetConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) targetConds.push(eq(users.tenantId, tenantId));
        const targetUser = await db.query.users.findFirst({
            where: and(...targetConds),
            columns: { id: true, tenantId: true, role: true, isSuperAdmin: true },
        });
        if (!targetUser || !canManageStaffRecord(req, targetUser)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify this user permissions' } });
            return;
        }

        // Scope constraint: non-superadmin callers can only grant permissions they themselves hold
        let scopedPermissions = validPermissions;
        if (!req.authUser!.isSuperAdmin) {
            let callerRolePerms: string[] = [];
            if (req.authUser!.role) {
                const roleConds: any[] = [eq(roles.name, req.authUser!.role)];
                if (req.authUser!.tenantId) roleConds.push(or(eq(roles.tenantId, req.authUser!.tenantId), isNull(roles.tenantId)));
                const callerRole = await db.query.roles.findFirst({
                    where: and(...roleConds),
                    columns: { permissions: true },
                });
                callerRolePerms = (callerRole?.permissions as string[]) ?? [];
            }
            const callerEffectivePerms = new Set([
                ...(req.authUser!.permissions as string[] || []),
                ...callerRolePerms,
            ]);
            scopedPermissions = validPermissions.filter((p: string) => callerEffectivePerms.has(p));
        }

        const [user] = await db.update(users)
            .set({ permissions: scopedPermissions, updatedAt: new Date() })
            .where(and(...targetConds))
            .returning({
                id: users.id,
                tenantId: users.tenantId,
                email: users.email,
                name: users.name,
                role: users.role,
                permissions: users.permissions,
                isActive: users.isActive,
                updatedAt: users.updatedAt,
            });

        await invalidateStaffAuthCaches(req.params.id, targetUser.tenantId);
        res.json({ success: true, data: user, message: 'Staff permissions updated successfully' });
    } catch (error) {
        next(error);
    }
});
