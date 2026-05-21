// ═══════════════════════════════════════════════════════════════════════════
// Staff Module - Routes (Drizzle ORM + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { users, userStores, roles, branches } from '@/db/schema/tables';
import { eq, and, or, ilike, inArray, notInArray, isNull, desc, asc, count } from 'drizzle-orm';
import argon2 from 'argon2';

export const staffRoutes = Router();

// Get all staff
staffRoutes.get('/', authenticate, authorize('staff:read'), branchFilter(), async (req, res, next) => {
    try {
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
staffRoutes.get('/roles/list', authenticate, async (req, res, next) => {
    try {
        const user = req.authUser || req.user!;
        const isSuperAdmin = user.isSuperAdmin;
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
staffRoutes.get('/branches/list', authenticate, async (req, res, next) => {
    try {
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
staffRoutes.get('/:id', authenticate, authorize('staff:read'), async (req, res, next) => {
    try {
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
            with: { branch: true, roleRelation: true },
        });

        if (!staff) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff not found or no access' } });
            return;
        }

        // Non-superadmins cannot view super_admin or admin users
        if (!isSuperAdmin && (staff.isSuperAdmin || staff.role === 'super_admin' || staff.role === 'admin')) {
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
staffRoutes.post('/', authenticate, branchFilter(), authorize('staff:create'), async (req, res, next) => {
    try {
        const { email, password, name, phone, role, branchId, storeId, roleId, isActive, permissions } = req.body;
        const authUser = req.authUser;
        const creatorStoreId = storeId || authUser?.activeStoreId || undefined;

        if (!email || !password || !name) {
            res.status(400).json({ success: false, error: { code: 'VAL_001', message: 'Email, password, and name are required' } });
            return;
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
        const sanitizedStoreId = creatorStoreId && creatorStoreId.trim() !== '' ? creatorStoreId : undefined;

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
        }).returning();

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
staffRoutes.put('/:id', authenticate, authorize('staff:update'), async (req, res, next) => {
    try {
        const { password, id, _id, createdAt, updatedAt, ...updateData } = req.body;

        if (password) {
            updateData.password = await argon2.hash(password);
        }

        // Remove empty string fields
        if (updateData.roleId === '' || updateData.roleId === null) delete updateData.roleId;
        if (updateData.branchId === '' || updateData.branchId === null) delete updateData.branchId;
        if (updateData.storeId === '' || updateData.storeId === null) delete updateData.storeId;

        updateData.updatedAt = new Date();

        // Tenant-scoped update
        const tenantId = req.authUser?.tenantId;
        const updConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            updConds.push(eq(users.tenantId, tenantId));
        }
        // Never allow changing tenantId
        delete updateData.tenantId;

        const [staff] = await db.update(users)
            .set(updateData)
            .where(and(...updConds))
            .returning();

        res.json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
});

// Delete staff (soft delete)
staffRoutes.delete('/:id', authenticate, authorize('staff:delete'), async (req, res, next) => {
    try {
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
staffRoutes.get('/:id/permissions', authenticate, authorize('staff:read'), async (req, res, next) => {
    try {
        const user = await db.query.users.findFirst({
            where: eq(users.id, req.params.id),
            with: { roleRelation: true },
        });

        if (!user) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Staff not found' } });
            return;
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
staffRoutes.put('/:id/permissions', authenticate, authorize('staff:update'), async (req, res, next) => {
    try {
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Permissions must be an array' } });
            return;
        }

        const validPermissions = permissions.filter((p: unknown) => typeof p === 'string');

        // Tenant scope: target user must belong to caller's tenant
        if (!req.authUser!.isSuperAdmin) {
            const targetUser = await db.query.users.findFirst({
                where: eq(users.id, req.params.id),
                columns: { tenantId: true },
            });
            if (!targetUser || targetUser.tenantId !== req.authUser!.tenantId) {
                res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify user outside your tenant' } });
                return;
            }
        }

        // Scope constraint: non-superadmin callers can only grant permissions they themselves hold
        let scopedPermissions = validPermissions;
        if (!req.authUser!.isSuperAdmin) {
            let callerRolePerms: string[] = [];
            if (req.authUser!.role) {
                const callerRole = await db.query.roles.findFirst({
                    where: eq(roles.name, req.authUser!.role),
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
            .where(eq(users.id, req.params.id))
            .returning();

        res.json({ success: true, data: user, message: 'Staff permissions updated successfully' });
    } catch (error) {
        next(error);
    }
});
