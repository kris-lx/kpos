// ═══════════════════════════════════════════════════════════════════════════
// Users Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';
import argon2 from 'argon2';

export const userRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL USERS
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.get('/', authenticate, authorize('users:read'), async (req, res) => {
    try {
        const { page = '1', limit = '50', search, branchId, role, isActive } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const where: Record<string, unknown> = {};

        if (search) {
            where.OR = [
                { name: { contains: search as string, mode: 'insensitive' } },
                { email: { contains: search as string, mode: 'insensitive' } },
                { phone: { contains: search as string, mode: 'insensitive' } },
            ];
        }

        if (branchId) where.branchId = branchId;
        if (role) where.role = role;
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: parseInt(limit as string),
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    avatar: true,
                    role: true,
                    isActive: true,
                    lastLoginAt: true,
                    createdAt: true,
                    branch: {
                        select: { id: true, name: true }
                    },
                    roleRelation: {
                        select: { id: true, name: true, displayName: true }
                    }
                }
            }),
            prisma.user.count({ where })
        ]);

        res.json({
            success: true,
            data: users,
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
userRoutes.get('/:id', authenticate, authorize('users:read'), async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                avatar: true,
                role: true,
                isActive: true,
                emailVerified: true,
                twoFAEnabled: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                branch: {
                    select: { id: true, name: true, code: true }
                },
                roleRelation: {
                    select: { id: true, name: true, displayName: true, permissions: true }
                }
            }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
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
userRoutes.post('/', authenticate, authorize('users:create'), async (req, res) => {
    try {
        const { email, password, name, phone, avatar, role, roleId, branchId, isActive = true } = req.body;

        // Validate required fields
        if (!email || !password || !name || !branchId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Email, password, name, and branchId are required' }
            });
        }

        // Check if email exists
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Email already exists' }
            });
        }

        // Check if branch exists
        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) {
            return res.status(400).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Branch not found' }
            });
        }

        // Hash password
        const hashedPassword = await argon2.hash(password);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                phone,
                avatar,
                role: role || 'staff',
                roleId,
                branchId,
                isActive
            },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                createdAt: true,
                branch: { select: { id: true, name: true } }
            }
        });

        res.status(201).json({ success: true, data: user });
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
userRoutes.put('/:id', authenticate, authorize('users:update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { email, password, name, phone, avatar, role, roleId, branchId, isActive } = req.body;

        // Check if user exists
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // Check if new email conflicts
        if (email && email !== existing.email) {
            const emailExists = await prisma.user.findUnique({ where: { email } });
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Email already exists' }
                });
            }
        }

        // Build update data
        const updateData: Record<string, unknown> = {};
        if (email) updateData.email = email;
        if (name) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone;
        if (avatar !== undefined) updateData.avatar = avatar;
        if (role) updateData.role = role;
        if (roleId !== undefined) updateData.roleId = roleId;
        if (branchId) updateData.branchId = branchId;
        if (isActive !== undefined) updateData.isActive = isActive;

        // Hash new password if provided
        if (password) {
            updateData.password = await argon2.hash(password);
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                avatar: true,
                role: true,
                isActive: true,
                updatedAt: true,
                branch: { select: { id: true, name: true } },
                roleRelation: { select: { id: true, name: true, displayName: true } }
            }
        });

        res.json({ success: true, data: user });
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
userRoutes.delete('/:id', authenticate, authorize('users:delete'), async (req, res) => {
    try {
        const { id } = req.params;

        // Check if user exists
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // Prevent self-deletion
        const currentUser = (req as any).user;
        if (currentUser?.id === id) {
            return res.status(400).json({
                success: false,
                error: { code: 'SELF_DELETE', message: 'Cannot delete your own account' }
            });
        }

        // Check for related transactions
        const transactionCount = await prisma.transaction.count({
            where: { userId: id }
        });

        if (transactionCount > 0) {
            // Soft delete by deactivating
            await prisma.user.update({
                where: { id },
                data: { isActive: false }
            });

            return res.json({
                success: true,
                message: 'User deactivated (has related transactions)',
                deactivated: true
            });
        }

        // Hard delete if no transactions
        await prisma.user.delete({ where: { id } });

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
userRoutes.patch('/:id/toggle-active', authenticate, authorize('users:update'), async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        const user = await prisma.user.update({
            where: { id },
            data: { isActive: !existing.isActive },
            select: {
                id: true,
                name: true,
                email: true,
                isActive: true
            }
        });

        res.json({ success: true, data: user });
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
userRoutes.get('/:id/permissions', authenticate, authorize('users:read'), async (req, res) => {
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
                        permissions: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
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
userRoutes.put('/:id/permissions', authenticate, authorize('users:update'), async (req, res) => {
    try {
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Permissions must be an array' }
            });
        }

        // Validate that all permissions are strings
        const validPermissions = permissions.filter(p => typeof p === 'string');

        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { permissions: validPermissions },
            select: {
                id: true,
                name: true,
                email: true,
                permissions: true,
                roleRelation: {
                    select: {
                        id: true,
                        name: true,
                        displayName: true,
                        permissions: true
                    }
                }
            }
        });

        res.json({
            success: true,
            data: user,
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
userRoutes.get('/permissions/all', authenticate, authorize('users:read'), async (_req, res) => {
    try {
        const allPermissions = [
            { module: 'dashboard', label: 'ແຜງຄວບຄຸມ', permissions: [
                { value: 'dashboard:view', label: 'ເບິ່ງແຜງຄວບຄຸມ' }
            ]},
            { module: 'pos', label: 'ຂາຍໜ້າຮ້ານ', permissions: [
                { value: 'pos:view', label: 'ເບິ່ງໜ້າຂາຍ' },
                { value: 'pos:sell', label: 'ຂາຍສິນຄ້າ' }
            ]},
            { module: 'sales', label: 'ການຂາຍ', permissions: [
                { value: 'sales:view', label: 'ເບິ່ງການຂາຍ' },
                { value: 'sales:create', label: 'ສ້າງການຂາຍ' },
                { value: 'sales:update', label: 'ແກ້ໄຂການຂາຍ' },
                { value: 'sales:delete', label: 'ລຶບການຂາຍ' },
                { value: 'sales:view-own', label: 'ເບິ່ງການຂາຍຂອງຕົນ' },
                { value: 'sales:void', label: 'ຍົກເລີກການຂາຍ' },
                { value: 'sales:refund', label: 'ຄືນເງິນ' }
            ]},
            { module: 'products', label: 'ສິນຄ້າ', permissions: [
                { value: 'products:view', label: 'ເບິ່ງສິນຄ້າ' },
                { value: 'products:create', label: 'ສ້າງສິນຄ້າ' },
                { value: 'products:update', label: 'ແກ້ໄຂສິນຄ້າ' },
                { value: 'products:delete', label: 'ລຶບສິນຄ້າ' }
            ]},
            { module: 'categories', label: 'ໝວດໝູ່', permissions: [
                { value: 'categories:view', label: 'ເບິ່ງໝວດໝູ່' },
                { value: 'categories:create', label: 'ສ້າງໝວດໝູ່' },
                { value: 'categories:update', label: 'ແກ້ໄຂໝວດໝູ່' },
                { value: 'categories:delete', label: 'ລຶບໝວດໝູ່' }
            ]},
            { module: 'inventory', label: 'ສາງ', permissions: [
                { value: 'inventory:view', label: 'ເບິ່ງສາງ' },
                { value: 'inventory:update', label: 'ອັບເດດສາງ' },
                { value: 'inventory:adjust', label: 'ປັບສາງ' }
            ]},
            { module: 'restaurant', label: 'ຮ້ານອາຫານ', permissions: [
                { value: 'restaurant:view', label: 'ເບິ່ງຮ້ານອາຫານ' },
                { value: 'restaurant:update', label: 'ແກ້ໄຂຮ້ານອາຫານ' },
                { value: 'restaurant:manage-tables', label: 'ຈັດການໂຕະ' },
                { value: 'restaurant:manage-orders', label: 'ຈັດການອໍເດີ' }
            ]},
            { module: 'promotions', label: 'ໂປຣໂມຊັ່ນ', permissions: [
                { value: 'promotions:view', label: 'ເບິ່ງໂປຣໂມຊັ່ນ' },
                { value: 'promotions:create', label: 'ສ້າງໂປຣໂມຊັ່ນ' },
                { value: 'promotions:update', label: 'ແກ້ໄຂໂປຣໂມຊັ່ນ' },
                { value: 'promotions:delete', label: 'ລຶບໂປຣໂມຊັ່ນ' }
            ]},
            { module: 'customers', label: 'ລູກຄ້າ', permissions: [
                { value: 'customers:view', label: 'ເບິ່ງລູກຄ້າ' },
                { value: 'customers:create', label: 'ສ້າງລູກຄ້າ' },
                { value: 'customers:update', label: 'ແກ້ໄຂລູກຄ້າ' },
                { value: 'customers:delete', label: 'ລຶບລູກຄ້າ' }
            ]},
            { module: 'payments', label: 'ການຊຳລະ', permissions: [
                { value: 'payments:view', label: 'ເບິ່ງການຊຳລະ' },
                { value: 'payments:manage', label: 'ຈັດການການຊຳລະ' }
            ]},
            { module: 'reports', label: 'ລາຍງານ', permissions: [
                { value: 'reports:view', label: 'ເບິ່ງລາຍງານ' },
                { value: 'reports:export', label: 'ສົ່ງອອກລາຍງານ' }
            ]},
            { module: 'staff', label: 'ພະນັກງານ', permissions: [
                { value: 'staff:view', label: 'ເບິ່ງພະນັກງານ' },
                { value: 'staff:create', label: 'ສ້າງພະນັກງານ' },
                { value: 'staff:update', label: 'ແກ້ໄຂພະນັກງານ' },
                { value: 'staff:delete', label: 'ລຶບພະນັກງານ' }
            ]},
            { module: 'users', label: 'ຜູ້ໃຊ້', permissions: [
                { value: 'users:view', label: 'ເບິ່ງຜູ້ໃຊ້' },
                { value: 'users:create', label: 'ສ້າງຜູ້ໃຊ້' },
                { value: 'users:update', label: 'ແກ້ໄຂຜູ້ໃຊ້' },
                { value: 'users:delete', label: 'ລຶບຜູ້ໃຊ້' }
            ]},
            { module: 'roles', label: 'ບົດບາດ', permissions: [
                { value: 'roles:view', label: 'ເບິ່ງບົດບາດ' },
                { value: 'roles:create', label: 'ສ້າງບົດບາດ' },
                { value: 'roles:update', label: 'ແກ້ໄຂບົດບາດ' },
                { value: 'roles:delete', label: 'ລຶບບົດບາດ' }
            ]},
            { module: 'branches', label: 'ສາຂາ', permissions: [
                { value: 'branches:view', label: 'ເບິ່ງສາຂາ' },
                { value: 'branches:create', label: 'ສ້າງສາຂາ' },
                { value: 'branches:update', label: 'ແກ້ໄຂສາຂາ' },
                { value: 'branches:delete', label: 'ລຶບສາຂາ' }
            ]},
            { module: 'settings', label: 'ຕັ້ງຄ່າ', permissions: [
                { value: 'settings:view', label: 'ເບິ່ງຕັ້ງຄ່າ' },
                { value: 'settings:update', label: 'ແກ້ໄຂຕັ້ງຄ່າ' }
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
// GET CURRENT USER PROFILE
// ═══════════════════════════════════════════════════════════════════════════
userRoutes.get('/me/profile', authenticate, async (req, res) => {
    try {
        const currentUser = (req as any).user;

        const user = await prisma.user.findUnique({
            where: { id: currentUser.id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                avatar: true,
                role: true,
                isActive: true,
                twoFAEnabled: true,
                lastLoginAt: true,
                createdAt: true,
                branch: { select: { id: true, name: true, code: true } },
                roleRelation: {
                    select: {
                        id: true,
                        name: true,
                        displayName: true,
                        permissions: true
                    }
                }
            }
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
