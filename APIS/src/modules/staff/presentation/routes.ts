// ═══════════════════════════════════════════════════════════════════════════
// Staff Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';
import argon2 from 'argon2';

export const staffRoutes = Router();

// Get all staff
staffRoutes.get('/', authenticate, authorize('staff:read'), branchFilter(), async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search, branchId, role, status } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;

        const where: Record<string, unknown> = {};
        const authUser = (req as any).authUser;
        const isSuperAdmin = authUser?.isSuperAdmin;

        // Super admins see all; others scoped to their store
        if (!isSuperAdmin) {
            // Scope by storeId first (store-level isolation)
            const activeStoreId = authUser?.activeStoreId;
            if (activeStoreId) {
                where.storeId = activeStoreId;
            } else if (filter?.branchIds?.length) {
                // Fall back to branch-level filter
                if (branchId && !filter.branchIds.includes(String(branchId))) {
                    return res.status(403).json({
                        success: false,
                        error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                    });
                }
                where.branchId = branchId ? String(branchId) : { in: filter.branchIds };
            } else if (branchId) {
                where.branchId = String(branchId);
            }
            // Exclude super admins from non-superadmin views
            where.isSuperAdmin = false;
        } else if (branchId) {
            where.branchId = String(branchId);
        }
        
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { email: { contains: String(search), mode: 'insensitive' } },
                { phone: { contains: String(search) } },
            ];
        }
        if (role) where.role = String(role);
        if (status === 'active') where.isActive = true;
        if (status === 'inactive') where.isActive = false;

        const [staff, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: Number(limit),
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    avatar: true,
                    role: true,
                    branchId: true,
                    isActive: true,
                    lastLoginAt: true,
                    createdAt: true,
                    branch: { select: { name: true } },
                    roleRelation: { select: { name: true, displayName: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.user.count({ where }),
        ]);

        res.json({
            success: true,
            data: staff,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get all roles (scoped: non-admins only see non-system roles for their level)
// MUST be before /:id to prevent Express matching /roles/list as /:id
staffRoutes.get('/roles/list', authenticate, async (req, res, next) => {
    try {
        const user = (req as any).authUser || req.user!;
        const isAdmin = user.isSuperAdmin || user.role === 'admin';
        // Non-admin users (store_owner, branch_admin, etc.) cannot assign system-level roles
        const where: Record<string, unknown> = isAdmin
            ? {}
            : { name: { notIn: ['super_admin', 'admin', 'store_owner'] }, isSystem: false };
        const roles = await prisma.role.findMany({
            where,
            orderBy: { name: 'asc' },
        });
        res.json({ success: true, data: roles });
    } catch (error) {
        next(error);
    }
});

// Get branches list for staff dropdown - scoped to user's accessible branches
// MUST be before /:id to prevent Express matching /branches/list as /:id
staffRoutes.get('/branches/list', authenticate, async (req, res, next) => {
    try {
        const user = req.user!;
        const isAdmin = user.isSuperAdmin || user.role === 'admin';
        const where: Record<string, unknown> = { isActive: true };
        // Non-admin users only see their accessible branches
        if (!isAdmin && req.authUser?.accessibleBranchIds?.length) {
            where.id = { in: req.authUser.accessibleBranchIds };
        }
        const branches = await prisma.branch.findMany({
            where,
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
        });
        res.json({ success: true, data: branches });
    } catch (error) {
        next(error);
    }
});

// Get staff by ID
staffRoutes.get('/:id', authenticate, authorize('staff:read'), async (req, res, next) => {
    try {
        const staff = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                avatar: true,
                role: true,
                branchId: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                branch: { select: { id: true, name: true } },
                roleRelation: { select: { id: true, name: true, displayName: true, permissions: true } },
            },
        });

        if (!staff) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Staff not found' } });
            return;
        }

        res.json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
});

// Create staff
staffRoutes.post('/', authenticate, authorize('staff:create'), async (req, res, next) => {
    try {
        const { email, password, name, phone, role, branchId, roleId, isActive, permissions } = req.body;

        if (!email || !password || !name) {
            res.status(400).json({ success: false, error: { code: 'VAL_001', message: 'Email, password, and name are required' } });
            return;
        }

        // Check if email exists
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            res.status(400).json({ success: false, error: { code: 'VAL_002', message: 'Email already exists' } });
            return;
        }

        // Hash password
        const hashedPassword = await argon2.hash(password);

        // Sanitize ObjectID fields - empty strings cause Malformed ObjectID
        const sanitizedBranchId = branchId && branchId.trim() !== '' ? branchId : (req.user as any)?.branchId || undefined;
        const sanitizedRoleId = roleId && roleId.trim() !== '' ? roleId : undefined;

        const staff = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                phone: phone || undefined,
                role: role || 'staff',
                branchId: sanitizedBranchId,
                roleId: sanitizedRoleId,
                isActive: isActive !== undefined ? isActive : true,
                permissions: Array.isArray(permissions) ? permissions : undefined,
            },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                branchId: true,
                isActive: true,
                createdAt: true,
            },
        });

        res.status(201).json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
});

// Update staff
staffRoutes.put('/:id', authenticate, authorize('staff:update'), async (req, res, next) => {
    try {
        const { password, id, _id, createdAt, updatedAt, ...updateData } = req.body;

        // If password is being updated, hash it
        if (password) {
            updateData.password = await argon2.hash(password);
        }

        // Remove empty string ObjectID fields to prevent Malformed ObjectID error
        if (updateData.roleId === '' || updateData.roleId === null) delete updateData.roleId;
        if (updateData.branchId === '' || updateData.branchId === null) delete updateData.branchId;
        if (updateData.storeId === '' || updateData.storeId === null) delete updateData.storeId;

        const staff = await prisma.user.update({
            where: { id: req.params.id },
            data: updateData,
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                branchId: true,
                isActive: true,
                createdAt: true,
            },
        });

        res.json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
});

// Delete staff (soft delete)
staffRoutes.delete('/:id', authenticate, authorize('staff:delete'), async (req, res, next) => {
    try {
        await prisma.user.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });

        res.json({ success: true, message: 'Staff deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// Get staff member permissions (uses staff:read instead of users:read)
staffRoutes.get('/:id/permissions', authenticate, authorize('staff:read'), async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                name: true,
                email: true,
                permissions: true,
                isSuperAdmin: true,
                roleRelation: {
                    select: {
                        id: true,
                        name: true,
                        displayName: true,
                        permissions: true,
                    }
                }
            }
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

        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { permissions: validPermissions },
            select: {
                id: true,
                name: true,
                email: true,
                permissions: true,
                roleRelation: {
                    select: { id: true, name: true, displayName: true, permissions: true }
                }
            }
        });

        res.json({ success: true, data: user, message: 'Staff permissions updated successfully' });
    } catch (error) {
        next(error);
    }
});
