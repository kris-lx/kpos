// ═══════════════════════════════════════════════════════════════════════════
// Stores Module - Routes (Multi-Store Management)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, requireStoreAccess } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const storeRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL STORES (filtered by accessible branches)
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { branchId, search, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;
        
        const where: Record<string, unknown> = { isActive: true };
        
        // Filter by accessible branches
        if (filter?.branchIds?.length) {
            where.branchId = { in: filter.branchIds };
        }
        
        // Additional branch filter from query
        if (branchId) {
            // Verify user has access to this branch
            if (filter && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                });
            }
            where.branchId = String(branchId);
        }
        
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { code: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        const [stores, total] = await Promise.all([
            prisma.store.findMany({
                where,
                skip,
                take: Number(limit),
                include: {
                    branch: { select: { id: true, name: true, code: true } },
                    _count: { select: { userAccess: true, products: true } }
                },
                orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
            }),
            prisma.store.count({ where })
        ]);

        res.json({
            success: true,
            data: stores,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET USER'S ACCESSIBLE STORES
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.get('/my-stores', authenticate, async (req, res, next) => {
    try {
        if (!req.authUser) {
            return res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Not authenticated' }
            });
        }

        res.json({
            success: true,
            data: {
                stores: req.authUser.accessibleStores,
                activeStoreId: req.authUser.activeStoreId,
                activeBranchId: req.authUser.activeBranchId,
                accessibleBranchIds: req.authUser.accessibleBranchIds
            }
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET STORE BY ID
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.get('/:id', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = (req as any).branchFilter;
        
        const store = await prisma.store.findUnique({
            where: { id: req.params.id },
            include: {
                branch: { select: { id: true, name: true, code: true } },
                userAccess: {
                    include: {
                        user: { select: { id: true, name: true, email: true, avatar: true } }
                    }
                },
                _count: { select: { products: true } }
            }
        });

        if (!store) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        // Check branch access
        if (filter && !filter.branchIds.includes(store.branchId)) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'No access to this store' }
            });
        }

        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATE STORE (Admin/Branch Manager only)
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.post('/', authenticate, authorize('branches:create'), async (req, res, next) => {
    try {
        const { name, code, branchId, address, phone, email, description, isDefault, settings } = req.body;

        // Validate required fields
        if (!name || !code || !branchId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Name, code, and branchId are required' }
            });
        }

        // Check if code exists
        const existing = await prisma.store.findUnique({ where: { code } });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Store code already exists' }
            });
        }

        // Check if branch exists
        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_BRANCH', message: 'Branch not found' }
            });
        }

        // If this is default, unset other defaults in the branch
        if (isDefault) {
            await prisma.store.updateMany({
                where: { branchId, isDefault: true },
                data: { isDefault: false }
            });
        }

        const store = await prisma.store.create({
            data: {
                name,
                code,
                branchId,
                address,
                phone,
                email,
                description,
                isDefault: isDefault || false,
                settings
            },
            include: {
                branch: { select: { id: true, name: true, code: true } }
            }
        });

        res.status(201).json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE STORE
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.put('/:id', authenticate, authorize('branches:update'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, code, address, phone, email, description, isActive, isDefault, settings } = req.body;

        const existing = await prisma.store.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        // Check code uniqueness if changed
        if (code && code !== existing.code) {
            const codeExists = await prisma.store.findUnique({ where: { code } });
            if (codeExists) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Store code already exists' }
                });
            }
        }

        // If setting as default, unset others
        if (isDefault && !existing.isDefault) {
            await prisma.store.updateMany({
                where: { branchId: existing.branchId, isDefault: true },
                data: { isDefault: false }
            });
        }

        const store = await prisma.store.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(code && { code }),
                ...(address !== undefined && { address }),
                ...(phone !== undefined && { phone }),
                ...(email !== undefined && { email }),
                ...(description !== undefined && { description }),
                ...(isActive !== undefined && { isActive }),
                ...(isDefault !== undefined && { isDefault }),
                ...(settings && { settings })
            },
            include: {
                branch: { select: { id: true, name: true, code: true } }
            }
        });

        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE STORE (Soft delete)
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.delete('/:id', authenticate, authorize('branches:delete'), async (req, res, next) => {
    try {
        await prisma.store.update({
            where: { id: req.params.id },
            data: { isActive: false }
        });

        res.json({ success: true, data: { message: 'Store deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ASSIGN USER TO STORE
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.post('/:id/users', authenticate, authorize('staff:update'), async (req, res, next) => {
    try {
        const { id: storeId } = req.params;
        const { userId, canRead = true, canWrite = true, canDelete = false, canManage = false, isDefault = false } = req.body;

        // Validate store exists
        const store = await prisma.store.findUnique({ where: { id: storeId } });
        if (!store) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        // Validate user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // Check if assignment already exists
        const existing = await prisma.userStore.findUnique({
            where: { userId_storeId: { userId, storeId } }
        });

        if (existing) {
            // Update existing assignment
            const updated = await prisma.userStore.update({
                where: { id: existing.id },
                data: { canRead, canWrite, canDelete, canManage, isDefault },
                include: {
                    user: { select: { id: true, name: true, email: true } },
                    store: { select: { id: true, name: true, code: true } }
                }
            });
            return res.json({ success: true, data: updated });
        }

        // If setting as default, unset other defaults for this user
        if (isDefault) {
            await prisma.userStore.updateMany({
                where: { userId, isDefault: true },
                data: { isDefault: false }
            });
        }

        const assignment = await prisma.userStore.create({
            data: {
                userId,
                storeId,
                branchId: store.branchId,
                canRead,
                canWrite,
                canDelete,
                canManage,
                isDefault,
                assignedBy: req.user?.userId
            },
            include: {
                user: { select: { id: true, name: true, email: true } },
                store: { select: { id: true, name: true, code: true } }
            }
        });

        res.status(201).json({ success: true, data: assignment });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// REMOVE USER FROM STORE
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.delete('/:id/users/:userId', authenticate, authorize('staff:update'), async (req, res, next) => {
    try {
        const { id: storeId, userId } = req.params;

        const assignment = await prisma.userStore.findUnique({
            where: { userId_storeId: { userId, storeId } }
        });

        if (!assignment) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User store assignment not found' }
            });
        }

        await prisma.userStore.delete({ where: { id: assignment.id } });

        res.json({ success: true, data: { message: 'User removed from store' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET STORE USERS
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.get('/:id/users', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { id: storeId } = req.params;
        const filter = (req as any).branchFilter;

        const store = await prisma.store.findUnique({ where: { id: storeId } });
        if (!store) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        // Check branch access
        if (filter && !filter.branchIds.includes(store.branchId)) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'No access to this store' }
            });
        }

        const users = await prisma.userStore.findMany({
            where: { storeId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        avatar: true,
                        role: true,
                        isActive: true
                    }
                }
            }
        });

        res.json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET USER'S STORE ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.get('/users/:userId/stores', authenticate, authorize('staff:read'), async (req, res, next) => {
    try {
        const { userId } = req.params;

        const assignments = await prisma.userStore.findMany({
            where: { userId },
            include: {
                store: {
                    select: { id: true, name: true, code: true, isActive: true }
                },
                branch: {
                    select: { id: true, name: true, code: true }
                }
            }
        });

        res.json({ success: true, data: assignments });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BULK ASSIGN USER TO MULTIPLE STORES
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.post('/users/:userId/bulk-assign', authenticate, authorize('staff:update'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { storeIds, permissions = {} } = req.body;

        if (!Array.isArray(storeIds) || storeIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'storeIds array is required' }
            });
        }

        // Validate user
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // Get stores
        const stores = await prisma.store.findMany({
            where: { id: { in: storeIds }, isActive: true }
        });

        const results = [];
        for (const store of stores) {
            const existing = await prisma.userStore.findUnique({
                where: { userId_storeId: { userId, storeId: store.id } }
            });

            if (existing) {
                // Update
                const updated = await prisma.userStore.update({
                    where: { id: existing.id },
                    data: {
                        canRead: permissions.canRead ?? true,
                        canWrite: permissions.canWrite ?? true,
                        canDelete: permissions.canDelete ?? false,
                        canManage: permissions.canManage ?? false
                    }
                });
                results.push(updated);
            } else {
                // Create
                const created = await prisma.userStore.create({
                    data: {
                        userId,
                        storeId: store.id,
                        branchId: store.branchId,
                        canRead: permissions.canRead ?? true,
                        canWrite: permissions.canWrite ?? true,
                        canDelete: permissions.canDelete ?? false,
                        canManage: permissions.canManage ?? false,
                        assignedBy: req.user?.userId
                    }
                });
                results.push(created);
            }
        }

        res.json({
            success: true,
            data: results,
            message: `Assigned ${results.length} stores to user`
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// REMOVE ALL STORE ASSIGNMENTS FOR USER
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.delete('/users/:userId/stores', authenticate, authorize('staff:update'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { storeIds } = req.body;

        const where: Record<string, unknown> = { userId };
        if (Array.isArray(storeIds) && storeIds.length > 0) {
            where.storeId = { in: storeIds };
        }

        const result = await prisma.userStore.deleteMany({ where });

        res.json({
            success: true,
            data: { deleted: result.count }
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STORE REQUESTS - User can submit requests to open new store/branch
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /stores/requests - Get user's own store requests
 */
storeRoutes.get('/requests', authenticate, async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const { status, page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = { requesterId: userId };
        if (status) {
            where.status = String(status);
        }

        const [requests, total] = await Promise.all([
            prisma.storeRequest.findMany({
                where,
                skip,
                take: Number(limit),
                include: {
                    reviewer: {
                        select: { id: true, name: true }
                    },
                    branch: {
                        select: { id: true, name: true, code: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.storeRequest.count({ where })
        ]);

        res.json({
            success: true,
            data: requests,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /stores/requests - Submit a new store/branch request
 */
storeRoutes.post('/requests', authenticate, async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Not authenticated' }
            });
        }

        const {
            type,
            // Store info
            storeName,
            storeCode,
            storeAddress,
            storePhone,
            storeEmail,
            // Branch info
            branchName,
            branchCode,
            branchAddress,
            branchPhone,
            branchEmail,
            // Other
            reason,
            branchId,
            priority
        } = req.body;

        // Validate type
        if (!type || !['new_store', 'new_branch'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid request type. Must be "new_store" or "new_branch"' }
            });
        }

        // Validate required fields based on type
        if (type === 'new_branch') {
            if (!branchName || !branchCode) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Branch name and code are required' }
                });
            }
            // Check if branch code already exists
            const existingBranch = await prisma.branch.findUnique({ where: { code: branchCode } });
            if (existingBranch) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Branch code already exists' }
                });
            }
        } else if (type === 'new_store') {
            if (!storeName || !storeCode) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Store name and code are required' }
                });
            }
            // Check if store code already exists
            const existingStore = await prisma.store.findUnique({ where: { code: storeCode } });
            if (existingStore) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Store code already exists' }
                });
            }
        }

        // Create the request
        const request = await prisma.storeRequest.create({
            data: {
                requesterId: userId,
                type,
                storeName: storeName || null,
                storeCode: storeCode || null,
                storeAddress: storeAddress || null,
                storePhone: storePhone || null,
                storeEmail: storeEmail || null,
                branchName: branchName || null,
                branchCode: branchCode || null,
                branchAddress: branchAddress || null,
                branchPhone: branchPhone || null,
                branchEmail: branchEmail || null,
                reason: reason || null,
                branchId: branchId || null,
                priority: priority || 'normal',
                status: 'pending'
            }
        });

        res.status(201).json({
            success: true,
            data: request,
            message: 'Request submitted successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /stores/requests/:id - Get a specific request
 */
storeRoutes.get('/requests/:id', authenticate, async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;

        const request = await prisma.storeRequest.findUnique({
            where: { id },
            include: {
                reviewer: {
                    select: { id: true, name: true }
                },
                branch: {
                    select: { id: true, name: true, code: true }
                }
            }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Request not found' }
            });
        }

        // Check ownership
        if (request.requesterId !== userId) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'You can only view your own requests' }
            });
        }

        res.json({ success: true, data: request });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /stores/requests/:id - Cancel a pending request
 */
storeRoutes.delete('/requests/:id', authenticate, async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;

        const request = await prisma.storeRequest.findUnique({
            where: { id }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Request not found' }
            });
        }

        // Check ownership
        if (request.requesterId !== userId) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'You can only cancel your own requests' }
            });
        }

        // Can only cancel pending requests
        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_STATUS', message: 'Can only cancel pending requests' }
            });
        }

        await prisma.storeRequest.delete({
            where: { id }
        });

        res.json({
            success: true,
            message: 'Request cancelled successfully'
        });
    } catch (error) {
        next(error);
    }
});
