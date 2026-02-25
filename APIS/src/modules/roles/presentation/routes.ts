// ═══════════════════════════════════════════════════════════════════════════
// Roles Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const roleRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// LIST OF AVAILABLE PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════
const ALL_PERMISSIONS = [
    // Dashboard
    'dashboard:view',

    // POS
    'pos:access',
    'pos:sell',
    'pos:discount',
    'pos:refund',
    'pos:void',
    'pos:credit',

    // Products
    'products:read',
    'products:view',
    'products:create',
    'products:update',
    'products:delete',

    // Categories
    'categories:read',
    'categories:view',
    'categories:create',
    'categories:update',
    'categories:delete',

    // Inventory
    'inventory:read',
    'inventory:view',
    'inventory:create',
    'inventory:update',
    'inventory:delete',
    'inventory:adjust',
    'inventory:transfer',
    'inventory:stockin',
    'inventory:stockout',

    // Sales/Transactions
    'sales:read',
    'sales:view',
    'sales:create',
    'sales:update',
    'sales:delete',
    'sales:export',
    'sales:void',
    'sales:refund',
    'sales:view-own',

    // Customers
    'customers:read',
    'customers:view',
    'customers:create',
    'customers:update',
    'customers:delete',

    // Reports
    'reports:view',
    'reports:export',
    'reports:sales',
    'reports:inventory',
    'reports:financial',
    'reports:staff',

    // Staff
    'staff:read',
    'staff:view',
    'staff:create',
    'staff:update',
    'staff:delete',

    // Users
    'users:read',
    'users:view',
    'users:create',
    'users:update',
    'users:delete',

    // Roles & Permissions
    'roles:read',
    'roles:view',
    'roles:create',
    'roles:update',
    'roles:delete',

    // Settings
    'settings:read',
    'settings:view',
    'settings:update',

    // Branches
    'branches:read',
    'branches:view',
    'branches:create',
    'branches:update',
    'branches:delete',

    // Stores (Multi-store management)
    'stores:read',
    'stores:view',
    'stores:create',
    'stores:update',
    'stores:delete',
    'stores:assign',
    'stores:products',

    // Promotions
    'promotions:read',
    'promotions:view',
    'promotions:create',
    'promotions:update',
    'promotions:delete',

    // Restaurant
    'restaurant:access',
    'restaurant:view',
    'restaurant:manage',
    'restaurant:tables',
    'restaurant:kitchen',
    'restaurant:reservations',

    // Tables (Restaurant table CRUD)
    'tables:create',
    'tables:update',
    'tables:delete',

    // Payments
    'payments:read',
    'payments:view',
    'payments:refund',
    'payments:settings',
    'payments:manage',
    'payments:void',
    'payments:settle',

    // Documents
    'documents:read',
    'documents:view',
    'documents:create',
    'documents:update',
    'documents:delete',
];

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL AVAILABLE PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.get('/permissions', authenticate, authorize('roles:read'), async (_req, res) => {
    try {
        // Group permissions by module
        const grouped: Record<string, string[]> = {};

        ALL_PERMISSIONS.forEach(perm => {
            const [module] = perm.split(':');
            if (!grouped[module]) {
                grouped[module] = [];
            }
            grouped[module].push(perm);
        });

        res.json({
            success: true,
            data: {
                all: ALL_PERMISSIONS,
                grouped
            }
        });
    } catch (error) {
        console.error('Get permissions error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to get permissions' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL ROLES
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.get('/', authenticate, authorize('roles:read'), async (req, res) => {
    try {
        const { page = '1', limit = '50', search } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const user = req.user!;
        const isAdmin = user.isSuperAdmin || user.role === 'admin';

        const where: Record<string, unknown> = {};
        // Non-admin users only see non-system roles (cannot manage super_admin/admin/store_owner)
        if (!isAdmin) {
            where.name = { notIn: ['super_admin', 'admin', 'store_owner'] };
            where.isSystem = false;
        }
        if (search) {
            where.OR = [
                { name: { contains: search as string, mode: 'insensitive' } },
                { displayName: { contains: search as string, mode: 'insensitive' } },
            ];
        }

        const [roles, total] = await Promise.all([
            prisma.role.findMany({
                where,
                skip,
                take: parseInt(limit as string),
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: {
                        select: { users: true }
                    }
                }
            }),
            prisma.role.count({ where })
        ]);

        res.json({
            success: true,
            data: roles,
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
roleRoutes.get('/:id', authenticate, authorize('roles:read'), async (req, res) => {
    try {
        const role = await prisma.role.findUnique({
            where: { id: req.params.id },
            include: {
                users: {
                    select: { id: true, name: true, email: true }
                }
            }
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
roleRoutes.post('/', authenticate, authorize('roles:create'), async (req, res) => {
    try {
        const { name, displayName, description, permissions = [] } = req.body;

        // Validate required fields - only name is required now
        if (!name) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Name is required' }
            });
        }

        // Check if role name already exists
        const existing = await prisma.role.findFirst({
            where: { 
                OR: [
                    { name: name },
                    { displayName: displayName || name }
                ]
            } 
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Role name or display name already exists' }
            });
        }

        // Validate permissions
        const invalidPermissions = permissions.filter((p: string) => !ALL_PERMISSIONS.includes(p));
        if (invalidPermissions.length > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PERMISSIONS',
                    message: `Invalid permissions: ${invalidPermissions.join(', ')}`
                }
            });
        }

        const role = await prisma.role.create({
            data: {
                name,
                displayName: displayName || name, // Use name as displayName if not provided
                description,
                permissions,
                isSystem: false
            }
        });

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
roleRoutes.put('/:id', authenticate, authorize('roles:update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, displayName, description, permissions } = req.body;

        // Check if role exists
        const existing = await prisma.role.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
            });
        }

        // Prevent editing system roles
        if (existing.isSystem) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot modify system roles' }
            });
        }

        // Check if new name conflicts with another role
        if (name && name !== existing.name) {
            const nameExists = await prisma.role.findUnique({ where: { name } });
            if (nameExists) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Role name already exists' }
                });
            }
        }

        // Validate permissions if provided
        if (permissions) {
            const invalidPermissions = permissions.filter((p: string) => !ALL_PERMISSIONS.includes(p));
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

        const role = await prisma.role.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(displayName && { displayName }),
                ...(description !== undefined && { description }),
                ...(permissions && { permissions })
            }
        });

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
roleRoutes.delete('/:id', authenticate, authorize('roles:delete'), async (req, res) => {
    try {
        const { id } = req.params;

        // Check if role exists
        const existing = await prisma.role.findUnique({
            where: { id },
            include: {
                _count: { select: { users: true } }
            }
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
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
        if (existing._count.users > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'HAS_USERS',
                    message: `Cannot delete role with ${existing._count.users} assigned users`
                }
            });
        }

        await prisma.role.delete({ where: { id } });

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
roleRoutes.post('/:id/assign', authenticate, authorize('roles:update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'userId is required' }
            });
        }

        // Check if role exists
        const role = await prisma.role.findUnique({ where: { id } });
        if (!role) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
            });
        }

        // Check if user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // Update user's role
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                roleId: id,
                role: role.name
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                roleRelation: {
                    select: { name: true, displayName: true }
                }
            }
        });

        res.json({ success: true, data: updatedUser });
    } catch (error) {
        console.error('Assign role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to assign role' }
        });
    }
});
