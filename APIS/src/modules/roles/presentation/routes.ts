// ═══════════════════════════════════════════════════════════════════════════
// Roles Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { roles, users } from '@/db/schema/tables';
import { eq, and, or, ilike, notInArray, desc, count } from 'drizzle-orm';

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
        const authUser = req.authUser!;
        const isSuperAdmin = authUser.isSuperAdmin;
        const isAdmin = isSuperAdmin || authUser.role === 'admin';
        const isStoreOwner = authUser.role === 'store_owner';

        const conditions = [];
        if (isSuperAdmin || isAdmin) {
            // See all roles
        } else if (isStoreOwner) {
            // Store owner sees all non-privileged roles (including system roles like cashier, manager)
            conditions.push(notInArray(roles.name, ['super_admin', 'admin', 'store_owner']));
        } else {
            // Other roles: only non-system, non-privileged
            conditions.push(notInArray(roles.name, ['super_admin', 'admin', 'store_owner']));
            conditions.push(eq(roles.isSystem, false));
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
roleRoutes.get('/:id', authenticate, authorize('roles:read'), async (req, res) => {
    try {
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
        const existing = await db.query.roles.findFirst({
            where: or(eq(roles.name, name), eq(roles.displayName, displayName || name)),
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

        const [role] = await db.insert(roles).values({
            name,
            displayName: displayName || name,
            description,
            permissions,
            isSystem: false,
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
roleRoutes.put('/:id', authenticate, authorize('roles:update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, displayName, description, permissions } = req.body;

        // Check if role exists
        const existing = await db.query.roles.findFirst({ where: eq(roles.id, id) });
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

        const [role] = await db.update(roles)
            .set({
                ...(name && { name }),
                ...(displayName && { displayName }),
                ...(description !== undefined && { description }),
                ...(permissions && { permissions }),
                updatedAt: new Date(),
            })
            .where(eq(roles.id, id))
            .returning();

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
        const existing = await db.query.roles.findFirst({ where: eq(roles.id, id) });

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

        await db.delete(roles).where(eq(roles.id, id));

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
        const role = await db.query.roles.findFirst({ where: eq(roles.id, id) });
        if (!role) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
            });
        }

        // Check if user exists
        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // Update user's role
        const [updatedUser] = await db.update(users)
            .set({ roleId: id, role: role.name, updatedAt: new Date() })
            .where(eq(users.id, userId))
            .returning();

        res.json({ success: true, data: updatedUser });
    } catch (error) {
        console.error('Assign role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to assign role' }
        });
    }
});
