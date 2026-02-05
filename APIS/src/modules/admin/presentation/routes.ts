// ═══════════════════════════════════════════════════════════════════════════
// Admin Module - Super Admin Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, requireSuperAdmin, requireAdmin, isSuperAdmin, isAdmin } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const adminRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// STORE REQUESTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/requests - Get all store/branch requests (Super Admin only)
 */
adminRoutes.get('/requests', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { status, type, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {};
        
        if (status) {
            where.status = String(status);
        }
        if (type) {
            where.type = String(type);
        }

        const [requests, total] = await Promise.all([
            prisma.storeRequest.findMany({
                where,
                skip,
                take: Number(limit),
                include: {
                    requester: {
                        select: { id: true, name: true, email: true, phone: true }
                    },
                    reviewer: {
                        select: { id: true, name: true, email: true }
                    },
                    branch: {
                        select: { id: true, name: true, code: true }
                    }
                },
                orderBy: [
                    { priority: 'desc' },
                    { createdAt: 'desc' }
                ]
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
 * GET /admin/requests/:id - Get single request details
 */
adminRoutes.get('/requests/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;

        const request = await prisma.storeRequest.findUnique({
            where: { id },
            include: {
                requester: {
                    select: { id: true, name: true, email: true, phone: true, avatar: true }
                },
                reviewer: {
                    select: { id: true, name: true, email: true }
                },
                branch: {
                    select: { id: true, name: true, code: true, address: true }
                }
            }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Request not found' }
            });
        }

        res.json({ success: true, data: request });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/requests/:id/approve - Approve a store/branch request
 */
adminRoutes.post('/requests/:id/approve', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { note } = req.body;
        const reviewerId = req.authUser!.userId;

        const request = await prisma.storeRequest.findUnique({
            where: { id }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Request not found' }
            });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: { code: 'ALREADY_PROCESSED', message: 'Request already processed' }
            });
        }

        // Process based on request type
        let createdEntity: any = null;

        if (request.type === 'new_branch' && request.branchName && request.branchCode) {
            // Create new branch
            createdEntity = await prisma.branch.create({
                data: {
                    name: request.branchName,
                    code: request.branchCode,
                    address: request.branchAddress,
                    phone: request.branchPhone,
                    email: request.branchEmail,
                    isActive: true
                }
            });
        } else if (request.type === 'new_store' && request.storeName && request.storeCode && request.branchId) {
            // Create new store
            createdEntity = await prisma.store.create({
                data: {
                    name: request.storeName,
                    code: request.storeCode,
                    branchId: request.branchId,
                    address: request.storeAddress,
                    phone: request.storePhone,
                    email: request.storeEmail,
                    isActive: true
                }
            });

            // Assign requester to the new store with full access
            await prisma.userStore.create({
                data: {
                    userId: request.requesterId,
                    storeId: createdEntity.id,
                    branchId: request.branchId,
                    canRead: true,
                    canWrite: true,
                    canDelete: true,
                    canManage: true,
                    isDefault: true,
                    assignedBy: reviewerId
                }
            });
        }

        // Update request status
        const updatedRequest = await prisma.storeRequest.update({
            where: { id },
            data: {
                status: 'approved',
                reviewerId,
                reviewNote: note,
                reviewedAt: new Date()
            },
            include: {
                requester: { select: { id: true, name: true, email: true } },
                reviewer: { select: { id: true, name: true } }
            }
        });

        res.json({
            success: true,
            data: updatedRequest,
            createdEntity
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/requests/:id/reject - Reject a store/branch request
 */
adminRoutes.post('/requests/:id/reject', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { note } = req.body;
        const reviewerId = req.authUser!.userId;

        const request = await prisma.storeRequest.findUnique({
            where: { id }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Request not found' }
            });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: { code: 'ALREADY_PROCESSED', message: 'Request already processed' }
            });
        }

        const updatedRequest = await prisma.storeRequest.update({
            where: { id },
            data: {
                status: 'rejected',
                reviewerId,
                reviewNote: note || 'ຄຳຂໍຖືກປະຕິເສດ',
                reviewedAt: new Date()
            },
            include: {
                requester: { select: { id: true, name: true, email: true } },
                reviewer: { select: { id: true, name: true } }
            }
        });

        res.json({ success: true, data: updatedRequest });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BRANCH MANAGEMENT (Super Admin)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/branches - Get all branches with full details
 */
adminRoutes.get('/branches', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { search, isActive, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {};
        
        if (isActive !== undefined) {
            where.isActive = isActive === 'true';
        }
        
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { code: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        const [branches, total] = await Promise.all([
            prisma.branch.findMany({
                where,
                skip,
                take: Number(limit),
                include: {
                    _count: {
                        select: {
                            users: true,
                            stores: true,
                            products: true,
                            transactions: true
                        }
                    }
                },
                orderBy: [{ isMain: 'desc' }, { name: 'asc' }]
            }),
            prisma.branch.count({ where })
        ]);

        res.json({
            success: true,
            data: branches,
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
 * POST /admin/branches - Create a new branch (Super Admin only)
 */
adminRoutes.post('/branches', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { name, code, address, phone, email, taxId, logo, isMain, settings } = req.body;

        // Check for duplicate code
        const existing = await prisma.branch.findUnique({ where: { code } });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Branch code already exists' }
            });
        }

        // If this is main branch, unset other main branches
        if (isMain) {
            await prisma.branch.updateMany({
                where: { isMain: true },
                data: { isMain: false }
            });
        }

        const branch = await prisma.branch.create({
            data: {
                name,
                code,
                address,
                phone,
                email,
                taxId,
                logo,
                isMain: isMain || false,
                settings: settings || {},
                isActive: true
            }
        });

        res.status(201).json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/branches/:id - Update a branch
 */
adminRoutes.put('/branches/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, code, address, phone, email, taxId, logo, isMain, isActive, settings } = req.body;

        // Check if branch exists
        const existing = await prisma.branch.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Branch not found' }
            });
        }

        // Check for duplicate code if changed
        if (code && code !== existing.code) {
            const duplicate = await prisma.branch.findUnique({ where: { code } });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Branch code already exists' }
                });
            }
        }

        // If setting as main, unset other main branches
        if (isMain && !existing.isMain) {
            await prisma.branch.updateMany({
                where: { isMain: true },
                data: { isMain: false }
            });
        }

        const branch = await prisma.branch.update({
            where: { id },
            data: {
                name,
                code,
                address,
                phone,
                email,
                taxId,
                logo,
                isMain,
                isActive,
                settings
            }
        });

        res.json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /admin/branches/:id - Deactivate a branch
 */
adminRoutes.delete('/branches/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;

        const branch = await prisma.branch.findUnique({ 
            where: { id },
            include: { _count: { select: { users: true, stores: true } } }
        });

        if (!branch) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Branch not found' }
            });
        }

        if (branch.isMain) {
            return res.status(400).json({
                success: false,
                error: { code: 'MAIN_BRANCH', message: 'Cannot delete main branch' }
            });
        }

        // Soft delete - deactivate instead of hard delete
        await prisma.branch.update({
            where: { id },
            data: { isActive: false }
        });

        res.json({ success: true, message: 'Branch deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STORE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/stores - Get all stores
 */
adminRoutes.get('/stores', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { search, branchId, isActive, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {};
        
        if (isActive !== undefined) {
            where.isActive = isActive === 'true';
        }
        if (branchId) {
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
                    _count: { select: { users: true } }
                },
                orderBy: { name: 'asc' }
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

/**
 * POST /admin/stores - Create a new store
 */
adminRoutes.post('/stores', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { name, code, branchId, address, phone, email, settings } = req.body;

        // Check for duplicate code
        const existing = await prisma.store.findUnique({ where: { code } });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Store code already exists' }
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
                settings: settings || {},
                isActive: true
            },
            include: {
                branch: { select: { id: true, name: true } }
            }
        });

        res.status(201).json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/stores/:id - Update a store
 */
adminRoutes.put('/stores/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, code, branchId, address, phone, email, isActive, settings } = req.body;

        const existing = await prisma.store.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        // Check for duplicate code if changed
        if (code && code !== existing.code) {
            const duplicate = await prisma.store.findUnique({ where: { code } });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Store code already exists' }
                });
            }
        }

        const store = await prisma.store.update({
            where: { id },
            data: { name, code, branchId, address, phone, email, isActive, settings },
            include: {
                branch: { select: { id: true, name: true } }
            }
        });

        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /admin/stores/:id - Deactivate a store
 */
adminRoutes.delete('/stores/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;

        const store = await prisma.store.findUnique({ where: { id } });
        if (!store) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        await prisma.store.update({
            where: { id },
            data: { isActive: false }
        });

        res.json({ success: true, message: 'Store deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM OVERVIEW (Super Admin Dashboard)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/dashboard - System overview statistics
 */
adminRoutes.get('/dashboard', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const [
            totalBranches,
            activeBranches,
            totalStores,
            activeStores,
            totalUsers,
            activeUsers,
            pendingRequests,
            recentRequests,
            todayTransactions
        ] = await Promise.all([
            prisma.branch.count(),
            prisma.branch.count({ where: { isActive: true } }),
            prisma.store.count(),
            prisma.store.count({ where: { isActive: true } }),
            prisma.user.count(),
            prisma.user.count({ where: { isActive: true } }),
            prisma.storeRequest.count({ where: { status: 'pending' } }),
            prisma.storeRequest.findMany({
                where: { status: 'pending' },
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: {
                    requester: { select: { name: true, email: true } }
                }
            }),
            prisma.transaction.count({
                where: {
                    createdAt: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0))
                    }
                }
            })
        ]);

        res.json({
            success: true,
            data: {
                branches: { total: totalBranches, active: activeBranches },
                stores: { total: totalStores, active: activeStores },
                users: { total: totalUsers, active: activeUsers },
                requests: { pending: pendingRequests, recent: recentRequests },
                transactions: { today: todayTransactions }
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/users - List all users (Super Admin)
 */
adminRoutes.get('/users', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { search, branchId, isActive, isSuperAdmin, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {};

        if (isActive !== undefined) {
            where.isActive = isActive === 'true';
        }
        if (isSuperAdmin !== undefined) {
            where.isSuperAdmin = isSuperAdmin === 'true';
        }
        if (branchId) {
            where.branchId = String(branchId);
        }
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { email: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: Number(limit),
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    role: true,
                    isActive: true,
                    isSuperAdmin: true,
                    lastLoginAt: true,
                    createdAt: true,
                    branch: { select: { id: true, name: true, code: true } },
                    roleRelation: { select: { id: true, name: true, displayName: true } },
                    _count: { select: { accessibleStores: true } }
                },
                orderBy: [{ isSuperAdmin: 'desc' }, { name: 'asc' }]
            }),
            prisma.user.count({ where })
        ]);

        res.json({
            success: true,
            data: users,
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
 * PUT /admin/users/:id/super-admin - Toggle Super Admin status
 */
adminRoutes.put('/users/:id/super-admin', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isSuperAdmin: newStatus } = req.body;

        // Prevent self-demotion
        if (id === req.authUser!.userId && newStatus === false) {
            return res.status(400).json({
                success: false,
                error: { code: 'SELF_DEMOTION', message: 'Cannot remove your own Super Admin status' }
            });
        }

        const user = await prisma.user.update({
            where: { id },
            data: { isSuperAdmin: Boolean(newStatus) },
            select: {
                id: true,
                name: true,
                email: true,
                isSuperAdmin: true
            }
        });

        res.json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STORE REQUEST CREATION (For regular users to request new store/branch)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/requests - Create a new store/branch request (Any authenticated user)
 */
adminRoutes.post('/requests', authenticate, async (req, res, next) => {
    try {
        const requesterId = req.authUser!.userId;
        const {
            type,
            branchId,
            storeName, storeCode, storeAddress, storePhone, storeEmail,
            branchName, branchCode, branchAddress, branchPhone, branchEmail,
            reason,
            documents,
            priority
        } = req.body;

        // Validate type
        if (!['new_store', 'new_branch', 'branch_update'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_TYPE', message: 'Invalid request type' }
            });
        }

        // For new_store, branchId is required
        if (type === 'new_store' && !branchId) {
            return res.status(400).json({
                success: false,
                error: { code: 'MISSING_BRANCH', message: 'Branch ID required for new store request' }
            });
        }

        // Check for duplicate pending requests
        const existingRequest = await prisma.storeRequest.findFirst({
            where: {
                requesterId,
                status: 'pending',
                type,
                OR: [
                    { storeCode: storeCode || undefined },
                    { branchCode: branchCode || undefined }
                ]
            }
        });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE_REQUEST', message: 'Similar request already pending' }
            });
        }

        const request = await prisma.storeRequest.create({
            data: {
                requesterId,
                type,
                branchId,
                storeName,
                storeCode,
                storeAddress,
                storePhone,
                storeEmail,
                branchName,
                branchCode,
                branchAddress,
                branchPhone,
                branchEmail,
                reason,
                documents: documents || [],
                priority: priority || 'normal',
                status: 'pending'
            },
            include: {
                requester: { select: { name: true, email: true } }
            }
        });

        res.status(201).json({ success: true, data: request });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/my-requests - Get current user's requests
 */
adminRoutes.get('/my-requests', authenticate, async (req, res, next) => {
    try {
        const requesterId = req.authUser!.userId;
        const { status, page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = { requesterId };
        if (status) {
            where.status = String(status);
        }

        const [requests, total] = await Promise.all([
            prisma.storeRequest.findMany({
                where,
                skip,
                take: Number(limit),
                include: {
                    reviewer: { select: { name: true } },
                    branch: { select: { name: true, code: true } }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.storeRequest.count({ where })
        ]);

        res.json({
            success: true,
            data: requests,
            meta: { page: Number(page), limit: Number(limit), total }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/check-super-admin - Check if current user is Super Admin
 */
adminRoutes.get('/check-super-admin', authenticate, async (req, res) => {
    res.json({
        success: true,
        data: {
            isSuperAdmin: isSuperAdmin(req),
            userId: req.authUser?.userId
        }
    });
});

/**
 * GET /admin/permissions - Get all permission groups (dynamic from database or default)
 */
adminRoutes.get('/permissions', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        // Try to get from database first
        const dbPermissions = await prisma.permissionGroup.findMany({
            where: { isActive: true },
            orderBy: { order: 'asc' },
            include: {
                permissions: {
                    where: { isActive: true },
                    orderBy: { order: 'asc' },
                    select: { key: true, label: true }
                }
            }
        });

        if (dbPermissions.length > 0) {
            const formattedPermissions = dbPermissions.map(group => ({
                key: group.key,
                label: group.label,
                icon: group.icon || 'Shield',
                color: group.color || 'from-gray-500 to-slate-500',
                permissions: group.permissions
            }));

            return res.json({ success: true, data: formattedPermissions });
        }

        // Return default permission groups if none in database
        const defaultPermissions = [
            {
                key: "pos",
                label: "ຂາຍໜ້າຮ້ານ (POS)",
                icon: "ShoppingCart",
                color: "from-emerald-500 to-green-500",
                permissions: [
                    { key: "pos.view", label: "ເບິ່ງໜ້າ POS" },
                    { key: "pos.sale", label: "ຂາຍສິນຄ້າ" },
                    { key: "pos.discount", label: "ໃຫ້ສ່ວນຫຼຸດ" },
                    { key: "pos.void", label: "ຍົກເລີກລາຍການ" },
                    { key: "pos.refund", label: "ຄືນເງິນ" }
                ]
            },
            {
                key: "products",
                label: "ສິນຄ້າ",
                icon: "Package",
                color: "from-blue-500 to-cyan-500",
                permissions: [
                    { key: "products.view", label: "ເບິ່ງສິນຄ້າ" },
                    { key: "products.create", label: "ເພີ່ມສິນຄ້າ" },
                    { key: "products.edit", label: "ແກ້ໄຂສິນຄ້າ" },
                    { key: "products.delete", label: "ລຶບສິນຄ້າ" },
                    { key: "products.import", label: "ນຳເຂົ້າສິນຄ້າ" }
                ]
            },
            {
                key: "inventory",
                label: "ສາງສິນຄ້າ",
                icon: "Package",
                color: "from-amber-500 to-orange-500",
                permissions: [
                    { key: "inventory.view", label: "ເບິ່ງສາງ" },
                    { key: "inventory.adjust", label: "ປັບສາງ" },
                    { key: "inventory.transfer", label: "ໂອນສິນຄ້າ" },
                    { key: "inventory.count", label: "ນັບສາງ" }
                ]
            },
            {
                key: "reports",
                label: "ລາຍງານ",
                icon: "BarChart3",
                color: "from-violet-500 to-purple-500",
                permissions: [
                    { key: "reports.sales", label: "ລາຍງານຂາຍ" },
                    { key: "reports.products", label: "ລາຍງານສິນຄ້າ" },
                    { key: "reports.inventory", label: "ລາຍງານສາງ" },
                    { key: "reports.staff", label: "ລາຍງານພະນັກງານ" },
                    { key: "reports.customers", label: "ລາຍງານລູກຄ້າ" },
                    { key: "reports.export", label: "ສົ່ງອອກລາຍງານ" }
                ]
            },
            {
                key: "restaurant",
                label: "ຮ້ານອາຫານ",
                icon: "Utensils",
                color: "from-pink-500 to-rose-500",
                permissions: [
                    { key: "restaurant.view", label: "ເບິ່ງໂຕະ" },
                    { key: "restaurant.manage", label: "ຈັດການໂຕະ" },
                    { key: "restaurant.kitchen", label: "ເບິ່ງຄົວ" }
                ]
            },
            {
                key: "settings",
                label: "ຕັ້ງຄ່າ",
                icon: "Settings",
                color: "from-gray-500 to-slate-500",
                permissions: [
                    { key: "settings.general", label: "ຕັ້ງຄ່າທົ່ວໄປ" },
                    { key: "settings.payment", label: "ຕັ້ງຄ່າການຊຳລະ" },
                    { key: "settings.printer", label: "ຕັ້ງຄ່າເຄື່ອງພິມ" },
                    { key: "settings.tax", label: "ຕັ້ງຄ່າອາກອນ" }
                ]
            }
        ];

        res.json({ success: true, data: defaultPermissions });
    } catch (error) {
        // If table doesn't exist, return defaults
        const defaultPermissions = [
            {
                key: "pos",
                label: "ຂາຍໜ້າຮ້ານ (POS)",
                icon: "ShoppingCart",
                color: "from-emerald-500 to-green-500",
                permissions: [
                    { key: "pos.view", label: "ເບິ່ງໜ້າ POS" },
                    { key: "pos.sale", label: "ຂາຍສິນຄ້າ" },
                    { key: "pos.discount", label: "ໃຫ້ສ່ວນຫຼຸດ" },
                    { key: "pos.void", label: "ຍົກເລີກລາຍການ" },
                    { key: "pos.refund", label: "ຄືນເງິນ" }
                ]
            },
            {
                key: "products",
                label: "ສິນຄ້າ",
                icon: "Package",
                color: "from-blue-500 to-cyan-500",
                permissions: [
                    { key: "products.view", label: "ເບິ່ງສິນຄ້າ" },
                    { key: "products.create", label: "ເພີ່ມສິນຄ້າ" },
                    { key: "products.edit", label: "ແກ້ໄຂສິນຄ້າ" },
                    { key: "products.delete", label: "ລຶບສິນຄ້າ" },
                    { key: "products.import", label: "ນຳເຂົ້າສິນຄ້າ" }
                ]
            },
            {
                key: "inventory",
                label: "ສາງສິນຄ້າ",
                icon: "Package",
                color: "from-amber-500 to-orange-500",
                permissions: [
                    { key: "inventory.view", label: "ເບິ່ງສາງ" },
                    { key: "inventory.adjust", label: "ປັບສາງ" },
                    { key: "inventory.transfer", label: "ໂອນສິນຄ້າ" },
                    { key: "inventory.count", label: "ນັບສາງ" }
                ]
            },
            {
                key: "reports",
                label: "ລາຍງານ",
                icon: "BarChart3",
                color: "from-violet-500 to-purple-500",
                permissions: [
                    { key: "reports.sales", label: "ລາຍງານຂາຍ" },
                    { key: "reports.products", label: "ລາຍງານສິນຄ້າ" },
                    { key: "reports.inventory", label: "ລາຍງານສາງ" },
                    { key: "reports.staff", label: "ລາຍງານພະນັກງານ" },
                    { key: "reports.customers", label: "ລາຍງານລູກຄ້າ" },
                    { key: "reports.export", label: "ສົ່ງອອກລາຍງານ" }
                ]
            },
            {
                key: "restaurant",
                label: "ຮ້ານອາຫານ",
                icon: "Utensils",
                color: "from-pink-500 to-rose-500",
                permissions: [
                    { key: "restaurant.view", label: "ເບິ່ງໂຕະ" },
                    { key: "restaurant.manage", label: "ຈັດການໂຕະ" },
                    { key: "restaurant.kitchen", label: "ເບິ່ງຄົວ" }
                ]
            },
            {
                key: "settings",
                label: "ຕັ້ງຄ່າ",
                icon: "Settings",
                color: "from-gray-500 to-slate-500",
                permissions: [
                    { key: "settings.general", label: "ຕັ້ງຄ່າທົ່ວໄປ" },
                    { key: "settings.payment", label: "ຕັ້ງຄ່າການຊຳລະ" },
                    { key: "settings.printer", label: "ຕັ້ງຄ່າເຄື່ອງພິມ" },
                    { key: "settings.tax", label: "ຕັ້ງຄ່າອາກອນ" }
                ]
            }
        ];
        res.json({ success: true, data: defaultPermissions });
    }
});

/**
 * POST /admin/permissions - Create/Update permission groups (Super Admin only)
 */
adminRoutes.post('/permissions', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { groups } = req.body;

        // Delete existing and recreate
        await prisma.permission.deleteMany({});
        await prisma.permissionGroup.deleteMany({});

        // Create new permission groups
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            await prisma.permissionGroup.create({
                data: {
                    key: group.key,
                    label: group.label,
                    icon: group.icon,
                    color: group.color,
                    order: i,
                    isActive: true,
                    permissions: {
                        create: group.permissions.map((p: any, j: number) => ({
                            key: p.key,
                            label: p.label,
                            order: j,
                            isActive: true
                        }))
                    }
                }
            });
        }

        res.json({ success: true, message: 'Permissions updated successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROLES MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/roles - Get all roles
 */
adminRoutes.get('/roles', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { search, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {};
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { displayName: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        const [roles, total] = await Promise.all([
            prisma.role.findMany({
                where,
                skip,
                take: Number(limit),
                include: {
                    _count: { select: { users: true } }
                },
                orderBy: [{ isSystem: 'desc' }, { name: 'asc' }]
            }),
            prisma.role.count({ where })
        ]);

        res.json({
            success: true,
            data: roles,
            meta: { page: Number(page), limit: Number(limit), total }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/roles/:id - Get single role
 */
adminRoutes.get('/roles/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;

        const role = await prisma.role.findUnique({
            where: { id },
            include: {
                _count: { select: { users: true } }
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
        next(error);
    }
});

/**
 * POST /admin/roles - Create a new role
 */
adminRoutes.post('/roles', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { name, displayName, description, permissions } = req.body;

        // Check for duplicate name
        const existing = await prisma.role.findUnique({ where: { name } });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Role name already exists' }
            });
        }

        const role = await prisma.role.create({
            data: {
                name,
                displayName,
                description,
                permissions: permissions || [],
                isSystem: false
            }
        });

        // Log activity
        await logActivity(req.authUser!.userId, 'role_created', `ສ້າງບົດບາດ: ${displayName}`, { roleId: role.id }, req);

        res.status(201).json({ success: true, data: role });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /admin/roles/:id - Update a role
 */
adminRoutes.patch('/roles/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, displayName, description, permissions } = req.body;

        const existing = await prisma.role.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
            });
        }

        // Check for duplicate name if changed
        if (name && name !== existing.name) {
            const duplicate = await prisma.role.findUnique({ where: { name } });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Role name already exists' }
                });
            }
        }

        const role = await prisma.role.update({
            where: { id },
            data: {
                name: name || existing.name,
                displayName: displayName || existing.displayName,
                description: description !== undefined ? description : existing.description,
                permissions: permissions || existing.permissions
            }
        });

        // Log activity
        await logActivity(req.authUser!.userId, 'role_updated', `ແກ້ໄຂບົດບາດ: ${role.displayName}`, { roleId: role.id }, req);

        res.json({ success: true, data: role });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /admin/roles/:id - Delete a role
 */
adminRoutes.delete('/roles/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;

        const role = await prisma.role.findUnique({
            where: { id },
            include: { _count: { select: { users: true } } }
        });

        if (!role) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
            });
        }

        if (role.isSystem) {
            return res.status(400).json({
                success: false,
                error: { code: 'SYSTEM_ROLE', message: 'Cannot delete system role' }
            });
        }

        if (role._count.users > 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'HAS_USERS', message: 'Cannot delete role with assigned users' }
            });
        }

        await prisma.role.delete({ where: { id } });

        // Log activity
        await logActivity(req.authUser!.userId, 'role_deleted', `ລຶບບົດບາດ: ${role.displayName}`, { roleId: id }, req);

        res.json({ success: true, message: 'Role deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY LOGS & AUDIT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper function to log activity
 */
async function logActivity(
    userId: string,
    action: string,
    description: string,
    metadata?: Record<string, unknown>,
    req?: any
) {
    try {
        await prisma.activityLog.create({
            data: {
                userId,
                action,
                description,
                metadata: metadata || {},
                ip: req?.ip || req?.headers?.['x-forwarded-for'] || null,
                userAgent: req?.headers?.['user-agent'] || null
            }
        });
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
}

/**
 * GET /admin/activity - Get recent activity (for dashboard)
 */
adminRoutes.get('/activity', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { limit = 10 } = req.query;

        const activities = await prisma.activityLog.findMany({
            take: Number(limit),
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        res.json({ success: true, data: activities });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/audit - Get audit logs with filtering
 */
adminRoutes.get('/audit', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { search, action, userId, dateFrom, dateTo, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {};

        if (action) {
            where.action = String(action);
        }
        if (userId) {
            where.userId = String(userId);
        }
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) {
                (where.createdAt as Record<string, unknown>).gte = new Date(String(dateFrom));
            }
            if (dateTo) {
                (where.createdAt as Record<string, unknown>).lte = new Date(String(dateTo) + 'T23:59:59.999Z');
            }
        }
        if (search) {
            where.OR = [
                { description: { contains: String(search), mode: 'insensitive' } },
                { action: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        const [logs, total, stats] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: { id: true, name: true, email: true }
                    }
                }
            }),
            prisma.activityLog.count({ where }),
            Promise.all([
                prisma.activityLog.count({ where: { action: { contains: 'login' } } }),
                prisma.activityLog.count({ where: { action: { contains: 'updated' } } }),
                prisma.activityLog.count({ where: { action: { contains: 'failed' } } })
            ])
        ]);

        res.json({
            success: true,
            data: logs,
            total,
            stats: {
                logins: stats[0],
                changes: stats[1],
                errors: stats[2]
            },
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
 * GET /admin/audit/export - Export audit logs as CSV
 */
adminRoutes.get('/audit/export', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { action, userId, dateFrom, dateTo } = req.query;

        const where: Record<string, unknown> = {};
        if (action) where.action = String(action);
        if (userId) where.userId = String(userId);
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(String(dateFrom));
            if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(String(dateTo) + 'T23:59:59.999Z');
        }

        const logs = await prisma.activityLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 10000,
            include: {
                user: { select: { name: true, email: true } }
            }
        });

        // Generate CSV
        const csvHeader = 'Date,Time,User,Email,Action,Description,IP\n';
        const csvRows = logs.map(log => {
            const date = new Date(log.createdAt);
            return `"${date.toLocaleDateString()}","${date.toLocaleTimeString()}","${log.user?.name || 'System'}","${log.user?.email || ''}","${log.action}","${log.description || ''}","${log.ip || ''}"`;
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvHeader + csvRows);
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM HEALTH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/system/health - Get system health status
 */
adminRoutes.get('/system/health', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const startTime = Date.now();
        
        // Check database connection
        let dbStatus = 'healthy';
        let dbLatency = 0;
        try {
            const dbStart = Date.now();
            await prisma.$queryRaw`SELECT 1`;
            dbLatency = Date.now() - dbStart;
        } catch {
            dbStatus = 'unhealthy';
        }

        // Get memory usage
        const memUsage = process.memoryUsage();
        const totalMem = require('os').totalmem();
        const freeMem = require('os').freemem();
        const usedMemPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

        // Calculate uptime
        const uptime = process.uptime();
        const uptimePercent = '99.9%'; // Placeholder

        res.json({
            success: true,
            data: {
                database: {
                    status: dbStatus,
                    latency: dbLatency
                },
                api: {
                    status: 'healthy',
                    uptime: uptimePercent,
                    uptimeSeconds: uptime
                },
                storage: {
                    used: 45, // Placeholder - would need disk usage check
                    total: 100
                },
                memory: {
                    used: usedMemPercent,
                    total: 100,
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
                },
                responseTime: Date.now() - startTime
            }
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT (Extended)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/users/:id - Get single user details
 */
adminRoutes.get('/users/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                roleId: true,
                branchId: true,
                permissions: true,
                isActive: true,
                isSuperAdmin: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                branch: { select: { id: true, name: true, code: true } },
                roleRelation: { select: { id: true, name: true, displayName: true, permissions: true } },
                accessibleStores: {
                    include: {
                        store: { select: { id: true, name: true, code: true } }
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
        next(error);
    }
});

/**
 * PATCH /admin/users/:id - Update user
 */
adminRoutes.patch('/users/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, email, phone, roleId, branchId, permissions, isActive } = req.body;

        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // Check for duplicate email if changed
        if (email && email !== existing.email) {
            const duplicate = await prisma.user.findUnique({ where: { email } });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Email already exists' }
                });
            }
        }

        // Get role name if roleId provided
        let roleName = existing.role;
        if (roleId) {
            const role = await prisma.role.findUnique({ where: { id: roleId } });
            if (role) {
                roleName = role.name;
            }
        }

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (roleId !== undefined) {
            updateData.roleId = roleId;
            updateData.role = roleName;
        }
        if (branchId !== undefined) updateData.branchId = branchId;
        if (permissions !== undefined) updateData.permissions = permissions;
        if (isActive !== undefined) updateData.isActive = isActive;

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                isSuperAdmin: true,
                createdAt: true,
                branch: { select: { id: true, name: true } },
                roleRelation: { select: { id: true, name: true, displayName: true } }
            }
        });

        // Log activity
        await logActivity(req.authUser!.userId, 'user_updated', `ແກ້ໄຂຜູ້ໃຊ້: ${user.name}`, { targetUserId: id }, req);

        res.json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /admin/users/:id - Deactivate user
 */
adminRoutes.delete('/users/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (id === req.authUser!.userId) {
            return res.status(400).json({
                success: false,
                error: { code: 'SELF_DELETE', message: 'Cannot delete yourself' }
            });
        }

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // Soft delete - deactivate
        await prisma.user.update({
            where: { id },
            data: { isActive: false }
        });

        // Log activity
        await logActivity(req.authUser!.userId, 'user_deleted', `ປິດການໃຊ້ງານຜູ້ໃຊ້: ${user.name}`, { targetUserId: id }, req);

        res.json({ success: true, message: 'User deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /admin/users/:id/super-admin - Toggle Super Admin (alternative endpoint)
 */
adminRoutes.patch('/users/:id/super-admin', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isSuperAdmin: newStatus } = req.body;

        // Prevent self-demotion
        if (id === req.authUser!.userId && newStatus === false) {
            return res.status(400).json({
                success: false,
                error: { code: 'SELF_DEMOTION', message: 'Cannot remove your own Super Admin status' }
            });
        }

        const user = await prisma.user.update({
            where: { id },
            data: { isSuperAdmin: Boolean(newStatus) },
            select: {
                id: true,
                name: true,
                email: true,
                isSuperAdmin: true
            }
        });

        // Log activity
        const action = newStatus ? 'ເພີ່ມ Super Admin' : 'ຖອນ Super Admin';
        await logActivity(req.authUser!.userId, 'user_updated', `${action}: ${user.name}`, { targetUserId: id }, req);

        res.json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// MENU PERMISSIONS (Tree Structure)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default menu structure for the system
 */
const DEFAULT_MENU_STRUCTURE = [
    {
        key: "dashboard",
        label: "Dashboard",
        labelLao: "ແຜງຄວບຄຸມ",
        icon: "LayoutDashboard",
        path: "/dashboard",
        children: []
    },
    {
        key: "sales",
        label: "Sales",
        labelLao: "ຂາຍ",
        icon: "ShoppingCart",
        children: [
            { key: "sales.pos", label: "POS", labelLao: "ໜ້າຂາຍ POS", icon: "ShoppingCart", path: "/pos" },
            { key: "sales.pos_fullscreen", label: "POS Fullscreen", labelLao: "ໜ້າຂາຍເຕັມຈໍ", icon: "Monitor", path: "/pos?mode=fullscreen" },
            { key: "sales.credit", label: "Credit Sales", labelLao: "ຂາຍສິນເຊື່ອ", icon: "CreditCard", path: "/pos/credit" },
            { key: "sales.held", label: "Held Orders", labelLao: "ບິນທີ່ພັກໄວ້", icon: "ClipboardList", path: "/pos/held" },
            { key: "sales.display", label: "Customer Display", labelLao: "ຈໍລູກຄ້າ", icon: "Monitor", path: "/display/customer" },
        ]
    },
    {
        key: "products",
        label: "Products",
        labelLao: "ສິນຄ້າ",
        icon: "Package",
        children: [
            { key: "products.list", label: "Product List", labelLao: "ລາຍການສິນຄ້າ", icon: "Package", path: "/products" },
            { key: "products.categories", label: "Categories", labelLao: "ໝວດໝູ່", icon: "Tags", path: "/categories" },
            { key: "products.barcode", label: "Barcode/QR", labelLao: "Barcode / QR Code", icon: "Barcode", path: "/barcode" },
            { key: "products.sku", label: "SKU/Variants", labelLao: "SKU / ຕົວເລືອກ", icon: "Layers", path: "/products/sku" },
            { key: "products.pricing", label: "Pricing", labelLao: "ລະດັບລາຄາ", icon: "DollarSign", path: "/products/pricing" },
        ]
    },
    {
        key: "inventory",
        label: "Inventory",
        labelLao: "ສາງ",
        icon: "Boxes",
        children: [
            { key: "inventory.stock", label: "Stock", labelLao: "ສາງສິນຄ້າ", icon: "Boxes", path: "/inventory" },
            { key: "inventory.stockin", label: "Stock In", labelLao: "ນຳເຂົ້າສິນຄ້າ", icon: "TrendingUp", path: "/inventory/stockin" },
            { key: "inventory.stockout", label: "Stock Out", labelLao: "ນຳອອກສິນຄ້າ", icon: "TrendingDown", path: "/inventory/stockout" },
            { key: "inventory.adjust", label: "Adjust", labelLao: "ປັບປ່ຽນສະຕ໋ອກ", icon: "Scale", path: "/inventory/adjust" },
            { key: "inventory.transfer", label: "Transfer", labelLao: "ໂອນຍ້າຍສິນຄ້າ", icon: "ArrowRightLeft", path: "/inventory/transfer" },
            { key: "inventory.count", label: "Stock Count", labelLao: "ກວດນັບສະຕ໋ອກ", icon: "ClipboardCheck", path: "/inventory/count" },
            { key: "inventory.po", label: "Purchase Orders", labelLao: "ສັ່ງຊື້ (PO)", icon: "ClipboardList", path: "/inventory/purchase-orders" },
            { key: "inventory.vendors", label: "Vendors", labelLao: "ຜູ້ສະໜອງ", icon: "Truck", path: "/inventory/vendors" },
            { key: "inventory.expiry", label: "Expiry", labelLao: "ວັນໝົດອາຍຸ", icon: "CalendarClock", path: "/inventory/expiry" },
            { key: "inventory.outofstock", label: "Out of Stock", labelLao: "ສິນຄ້າໝົດສະຕ໋ອກ", icon: "PackageX", path: "/inventory/out-of-stock" },
        ]
    },
    {
        key: "restaurant",
        label: "Restaurant",
        labelLao: "ຮ້ານອາຫານ",
        icon: "UtensilsCrossed",
        children: [
            { key: "restaurant.tables", label: "Tables", labelLao: "ໂຕະ", icon: "Table", path: "/restaurant/tables" },
            { key: "restaurant.orders", label: "Orders", labelLao: "ອໍເດີ", icon: "ClipboardList", path: "/restaurant/orders" },
            { key: "restaurant.kitchen", label: "Kitchen (KDS)", labelLao: "ຄົວ (KDS)", icon: "ChefHat", path: "/restaurant/kitchen" },
            { key: "restaurant.reservations", label: "Reservations", labelLao: "ຈອງໂຕະ", icon: "CalendarClock", path: "/restaurant/reservations" },
            { key: "restaurant.emenu", label: "e-Menu", labelLao: "e-Menu", icon: "QrCode", path: "/restaurant/e-menu" },
        ]
    },
    {
        key: "promotions",
        label: "Promotions",
        labelLao: "ໂປຣໂມຊັ່ນ",
        icon: "Gift",
        children: [
            { key: "promotions.list", label: "Promotions", labelLao: "ໂປຣໂມຊັ່ນ", icon: "Gift", path: "/promotions" },
            { key: "promotions.coupons", label: "Coupons", labelLao: "ຄູປອງ", icon: "TicketPercent", path: "/promotions/coupons" },
            { key: "promotions.discounts", label: "Discounts", labelLao: "ສ່ວນຫຼຸດ", icon: "Percent", path: "/promotions/discounts" },
        ]
    },
    {
        key: "customers",
        label: "Customers (CRM)",
        labelLao: "ລູກຄ້າ (CRM)",
        icon: "Users",
        children: [
            { key: "customers.list", label: "Customers", labelLao: "ລູກຄ້າ", icon: "Users", path: "/customers" },
            { key: "customers.members", label: "Members", labelLao: "ສະມາຊິກ", icon: "Crown", path: "/customers/members" },
            { key: "customers.points", label: "Points", labelLao: "ຄະແນນສະສົມ", icon: "Star", path: "/customers/points" },
            { key: "customers.loyalty", label: "Loyalty Program", labelLao: "ໂປຣແກຣມ Loyalty", icon: "Heart", path: "/customers/loyalty" },
        ]
    },
    {
        key: "payments",
        label: "Payments",
        labelLao: "ການຊຳລະ",
        icon: "Wallet",
        children: [
            { key: "payments.methods", label: "Payment Methods", labelLao: "ວິທີຊຳລະ", icon: "CreditCard", path: "/payments" },
            { key: "payments.transactions", label: "Transactions", labelLao: "ລາຍການຊຳລະ", icon: "Receipt", path: "/payments/transactions" },
            { key: "payments.settlements", label: "Settlements", labelLao: "ປິດບັນຊີ", icon: "DollarSign", path: "/payments/settlements" },
        ]
    },
    {
        key: "documents",
        label: "Documents",
        labelLao: "ເອກະສານ",
        icon: "FileText",
        children: [
            { key: "documents.receipts", label: "Receipts", labelLao: "ໃບບິນ", icon: "Receipt", path: "/documents" },
            { key: "documents.design", label: "Receipt Design", labelLao: "ອອກແບບໃບບິນ", icon: "Printer", path: "/documents/design" },
            { key: "documents.invoices", label: "Invoices", labelLao: "ໃບແຈ້ງໜີ້", icon: "FileText", path: "/documents/invoices" },
            { key: "documents.tax", label: "Tax Invoices", labelLao: "ໃບກຳກັບພາສີ", icon: "FileSpreadsheet", path: "/documents/tax-invoices" },
        ]
    },
    {
        key: "reports",
        label: "Reports",
        labelLao: "ລາຍງານ",
        icon: "BarChart3",
        children: [
            { key: "reports.sales", label: "Sales Report", labelLao: "ລາຍງານການຂາຍ", icon: "BarChart3", path: "/reports" },
            { key: "reports.products", label: "Product Report", labelLao: "ລາຍງານສິນຄ້າ", icon: "Package", path: "/reports/products" },
            { key: "reports.inventory", label: "Inventory Report", labelLao: "ລາຍງານສາງ", icon: "Boxes", path: "/reports/inventory" },
            { key: "reports.financial", label: "Financial Report", labelLao: "ລາຍງານການເງິນ", icon: "DollarSign", path: "/reports/financial" },
            { key: "reports.staff", label: "Staff Report", labelLao: "ລາຍງານພະນັກງານ", icon: "UserCog", path: "/reports/staff" },
            { key: "reports.customers", label: "Customer Report", labelLao: "ລາຍງານລູກຄ້າ", icon: "Users", path: "/reports/customers" },
        ]
    },
    {
        key: "management",
        label: "Management",
        labelLao: "ຈັດການ",
        icon: "Building2",
        children: [
            { key: "management.branches", label: "Branches", labelLao: "ສາຂາ", icon: "Building2", path: "/branches" },
            { key: "management.stores", label: "Stores", labelLao: "ຮ້ານຄ້າ", icon: "Store", path: "/management/stores" },
            { key: "management.staff", label: "Staff", labelLao: "ພະນັກງານ", icon: "Users", path: "/staff" },
            { key: "management.roles", label: "Roles", labelLao: "ບົດບາດ", icon: "Key", path: "/management/roles" },
            { key: "management.shifts", label: "Shifts", labelLao: "ກະວຽກ", icon: "Clock", path: "/management/shifts" },
            { key: "management.registers", label: "Cash Registers", labelLao: "ເຄື່ອງຄິດເງິນ", icon: "Monitor", path: "/management/cashregisters" },
        ]
    },
    {
        key: "settings",
        label: "Settings",
        labelLao: "ຕັ້ງຄ່າ",
        icon: "Settings",
        children: [
            { key: "settings.general", label: "General", labelLao: "ທົ່ວໄປ", icon: "Settings", path: "/settings" },
            { key: "settings.store", label: "Store Settings", labelLao: "ຕັ້ງຄ່າຮ້ານ", icon: "Store", path: "/settings/store" },
            { key: "settings.payment", label: "Payment Settings", labelLao: "ຕັ້ງຄ່າການຊຳລະ", icon: "CreditCard", path: "/settings/payment" },
            { key: "settings.printer", label: "Printer Settings", labelLao: "ຕັ້ງຄ່າເຄື່ອງພິມ", icon: "Printer", path: "/settings/printer" },
            { key: "settings.tax", label: "Tax Settings", labelLao: "ຕັ້ງຄ່າອາກອນ", icon: "Percent", path: "/settings/tax" },
            { key: "settings.notifications", label: "Notifications", labelLao: "ການແຈ້ງເຕືອນ", icon: "Bell", path: "/settings/notifications" },
            { key: "settings.integrations", label: "Integrations", labelLao: "ເຊື່ອມຕໍ່", icon: "Plug", path: "/settings/integrations" },
        ]
    },
];

/**
 * Default role templates
 */
const DEFAULT_ROLES = [
    {
        name: "super_admin",
        displayName: "Super Admin",
        description: "ຜູ້ດູແລລະບົບສູງສຸດ - ເຂົ້າເຖິງທຸກຢ່າງ",
        permissions: ["*"], // All permissions
        isSystem: true
    },
    {
        name: "admin",
        displayName: "Admin",
        description: "ຜູ້ດູແລລະບົບ - ຈັດການຮ້ານ ແລະ ພະນັກງານ",
        permissions: [
            "dashboard", "sales", "sales.pos", "sales.pos_fullscreen", "sales.credit", "sales.held",
            "products", "products.list", "products.categories", "products.barcode", "products.sku", "products.pricing",
            "inventory", "inventory.stock", "inventory.stockin", "inventory.stockout", "inventory.adjust", "inventory.transfer", "inventory.count", "inventory.po", "inventory.vendors", "inventory.expiry", "inventory.outofstock",
            "promotions", "promotions.list", "promotions.coupons", "promotions.discounts",
            "customers", "customers.list", "customers.members", "customers.points", "customers.loyalty",
            "payments", "payments.methods", "payments.transactions", "payments.settlements",
            "documents", "documents.receipts", "documents.design", "documents.invoices", "documents.tax",
            "reports", "reports.sales", "reports.products", "reports.inventory", "reports.financial", "reports.staff", "reports.customers",
            "management", "management.stores", "management.staff", "management.roles", "management.shifts", "management.registers",
            "settings", "settings.general", "settings.store", "settings.payment", "settings.printer", "settings.tax", "settings.notifications"
        ],
        isSystem: true
    },
    {
        name: "branch_admin",
        displayName: "Branch Admin",
        description: "ຜູ້ຈັດການສາຂາ - ຈັດການສາຂາ ແລະ ຮ້ານໃນສາຂາ",
        permissions: [
            "dashboard", "sales", "sales.pos", "sales.pos_fullscreen", "sales.credit", "sales.held",
            "products", "products.list", "products.categories",
            "inventory", "inventory.stock", "inventory.stockin", "inventory.stockout", "inventory.adjust", "inventory.transfer", "inventory.count",
            "promotions", "promotions.list",
            "customers", "customers.list", "customers.members", "customers.points",
            "payments", "payments.methods", "payments.transactions",
            "documents", "documents.receipts", "documents.invoices",
            "reports", "reports.sales", "reports.products", "reports.inventory",
            "management", "management.stores", "management.staff", "management.shifts", "management.registers"
        ],
        isSystem: true
    },
    {
        name: "store_manager",
        displayName: "Store Manager",
        description: "ຜູ້ຈັດການຮ້ານ - ຈັດການຮ້ານດຽວ",
        permissions: [
            "dashboard", "sales", "sales.pos", "sales.pos_fullscreen", "sales.credit", "sales.held",
            "products", "products.list", "products.categories",
            "inventory", "inventory.stock", "inventory.stockin", "inventory.stockout", "inventory.adjust",
            "promotions", "promotions.list",
            "customers", "customers.list", "customers.members",
            "payments", "payments.methods", "payments.transactions",
            "documents", "documents.receipts",
            "reports", "reports.sales", "reports.products",
            "management", "management.staff", "management.shifts", "management.registers"
        ],
        isSystem: true
    },
    {
        name: "cashier",
        displayName: "Cashier",
        description: "ພະນັກງານຂາຍ - ຂາຍສິນຄ້າ ແລະ ຮັບເງິນ",
        permissions: [
            "dashboard", "sales", "sales.pos", "sales.pos_fullscreen", "sales.held",
            "products", "products.list",
            "customers", "customers.list",
            "payments", "payments.transactions",
            "documents", "documents.receipts"
        ],
        isSystem: true
    },
    {
        name: "inventory_staff",
        displayName: "Inventory Staff",
        description: "ພະນັກງານສາງ - ຈັດການສາງສິນຄ້າ",
        permissions: [
            "dashboard",
            "products", "products.list", "products.categories",
            "inventory", "inventory.stock", "inventory.stockin", "inventory.stockout", "inventory.adjust", "inventory.transfer", "inventory.count", "inventory.expiry", "inventory.outofstock",
            "reports", "reports.inventory"
        ],
        isSystem: true
    },
    {
        name: "kitchen_staff",
        displayName: "Kitchen Staff",
        description: "ພະນັກງານຄົວ - ເບິ່ງອໍເດີ ແລະ ຈັດການຄົວ",
        permissions: [
            "restaurant", "restaurant.orders", "restaurant.kitchen"
        ],
        isSystem: true
    },
    {
        name: "waiter",
        displayName: "Waiter",
        description: "ພະນັກງານເສີບ - ຮັບອໍເດີ ແລະ ຈັດການໂຕະ",
        permissions: [
            "restaurant", "restaurant.tables", "restaurant.orders", "restaurant.reservations"
        ],
        isSystem: true
    }
];

/**
 * GET /admin/menu-permissions - Get menu structure for role assignment
 */
adminRoutes.get('/menu-permissions', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        // Try to get from database first
        const dbMenus = await prisma.menuPermission.findMany({
            where: { isActive: true, parentId: null },
            orderBy: { order: 'asc' },
            include: {
                children: {
                    where: { isActive: true },
                    orderBy: { order: 'asc' }
                }
            }
        });

        if (dbMenus.length > 0) {
            return res.json({ success: true, data: dbMenus });
        }

        // Return default structure if none in database
        res.json({ success: true, data: DEFAULT_MENU_STRUCTURE });
    } catch (error) {
        // If table doesn't exist, return defaults
        res.json({ success: true, data: DEFAULT_MENU_STRUCTURE });
    }
});

/**
 * POST /admin/menu-permissions/seed - Seed menu permissions to database
 */
adminRoutes.post('/menu-permissions/seed', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        // Clear existing
        await prisma.menuPermission.deleteMany({});

        // Create menu structure
        for (let i = 0; i < DEFAULT_MENU_STRUCTURE.length; i++) {
            const menu = DEFAULT_MENU_STRUCTURE[i];
            const parent = await prisma.menuPermission.create({
                data: {
                    key: menu.key,
                    label: menu.label,
                    labelLao: menu.labelLao,
                    icon: menu.icon,
                    path: menu.path || null,
                    order: i,
                    isActive: true
                }
            });

            // Create children
            if (menu.children && menu.children.length > 0) {
                for (let j = 0; j < menu.children.length; j++) {
                    const child = menu.children[j];
                    await prisma.menuPermission.create({
                        data: {
                            key: child.key,
                            label: child.label,
                            labelLao: child.labelLao,
                            icon: child.icon,
                            path: child.path,
                            parentId: parent.id,
                            order: j,
                            isActive: true
                        }
                    });
                }
            }
        }

        res.json({ success: true, message: 'Menu permissions seeded successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/roles/seed - Seed default roles to database
 */
adminRoutes.post('/roles/seed', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const results = [];

        for (const roleData of DEFAULT_ROLES) {
            // Check if role exists
            const existing = await prisma.role.findUnique({ where: { name: roleData.name } });
            
            if (existing) {
                // Update existing
                const updated = await prisma.role.update({
                    where: { name: roleData.name },
                    data: {
                        displayName: roleData.displayName,
                        description: roleData.description,
                        permissions: roleData.permissions,
                        isSystem: roleData.isSystem
                    }
                });
                results.push({ ...updated, action: 'updated' });
            } else {
                // Create new
                const created = await prisma.role.create({
                    data: roleData
                });
                results.push({ ...created, action: 'created' });
            }
        }

        await logActivity(req.authUser!.userId, 'roles_seeded', 'ສ້າງບົດບາດເລີ່ມຕົ້ນ', { count: results.length }, req);

        res.json({ success: true, data: results, message: `${results.length} roles seeded` });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/roles/templates - Get default role templates
 */
adminRoutes.get('/roles/templates', authenticate, requireAdmin(), async (req, res) => {
    res.json({ success: true, data: DEFAULT_ROLES });
});

// ═══════════════════════════════════════════════════════════════════════════
// STORE OWNER ENDPOINTS (For store owners to manage their store)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /stores/:id - Get store details (for store owner)
 */
adminRoutes.get('/stores/:id/details', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.authUser!.userId;

        // Check if user has access to this store
        const store = await prisma.store.findUnique({
            where: { id },
            include: {
                branch: { select: { id: true, name: true, code: true } },
                _count: { select: { users: true } }
            }
        });

        if (!store) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        // Check access (Super Admin, Admin, or store owner)
        const hasAccess = req.authUser!.isSuperAdmin || 
                          req.authUser!.role === 'admin' ||
                          req.authUser!.storeId === id;

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Access denied' }
            });
        }

        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /stores/:id/stats - Get store statistics
 */
adminRoutes.get('/stores/:id/stats', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [todaySales, todayOrders, totalProducts, totalUsers] = await Promise.all([
            prisma.transaction.aggregate({
                where: {
                    storeId: id,
                    createdAt: { gte: today },
                    status: 'completed'
                },
                _sum: { total: true }
            }),
            prisma.transaction.count({
                where: {
                    storeId: id,
                    createdAt: { gte: today }
                }
            }),
            prisma.product.count({
                where: { storeId: id, isActive: true }
            }),
            prisma.user.count({
                where: { storeId: id, isActive: true }
            })
        ]);

        res.json({
            success: true,
            data: {
                todaySales: todaySales._sum.total || 0,
                todayOrders,
                totalProducts,
                totalUsers
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /stores/:id/branches - Get store branches
 */
adminRoutes.get('/stores/:id/branches', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;

        const store = await prisma.store.findUnique({
            where: { id },
            select: { branchId: true }
        });

        if (!store) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        // Get branches related to this store's branch
        const branches = await prisma.branch.findMany({
            where: {
                OR: [
                    { id: store.branchId },
                    { stores: { some: { id } } }
                ]
            },
            select: {
                id: true,
                name: true,
                code: true,
                address: true,
                phone: true,
                isActive: true,
                isMain: true
            },
            orderBy: { isMain: 'desc' }
        });

        res.json({ success: true, data: branches });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /stores/:id/users - Get store users
 */
adminRoutes.get('/stores/:id/users', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;

        const users = await prisma.user.findMany({
            where: { storeId: id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                isActive: true,
                isSuperAdmin: true,
                lastLoginAt: true,
                roleRelation: { select: { id: true, displayName: true } }
            },
            orderBy: { name: 'asc' }
        });

        res.json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /stores/:id - Update store (for store owner)
 */
adminRoutes.put('/stores/:id/update', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, address, phone, email, description } = req.body;
        const userId = req.authUser!.userId;

        // Check access
        const hasAccess = req.authUser!.isSuperAdmin || 
                          req.authUser!.role === 'admin' ||
                          req.authUser!.storeId === id;

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Access denied' }
            });
        }

        const store = await prisma.store.update({
            where: { id },
            data: { name, address, phone, email, description }
        });

        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /stores/:id/status - Toggle store status
 */
adminRoutes.patch('/stores/:id/status', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        // Check access
        const hasAccess = req.authUser!.isSuperAdmin || 
                          req.authUser!.role === 'admin' ||
                          req.authUser!.storeId === id;

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Access denied' }
            });
        }

        const store = await prisma.store.update({
            where: { id },
            data: { isActive: Boolean(isActive) }
        });

        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/reset-database - Reset database (Super Admin only)
 * ລົບຂໍ້ມູນທັງໝົດແຕ່ຈົ່ງໄວ້ Super Admin users ແລະ roles
 */
adminRoutes.post('/reset-database', authenticate, requireSuperAdmin(), async (req, res, next) => {
    try {
        // Get Super Admin IDs to preserve
        const superAdmins = await prisma.user.findMany({
            where: { isSuperAdmin: true },
            select: { id: true, email: true, name: true }
        });
        const superAdminIds = superAdmins.map(u => u.id);
        
        // Get roles count
        const rolesCount = await prisma.role.count();
        
        // Delete all data in order (child tables first)
        // 1. Transaction related
        await prisma.transactionPayment.deleteMany({});
        await prisma.transactionItem.deleteMany({});
        await prisma.transaction.deleteMany({});
        await prisma.heldSale.deleteMany({});
        
        // 2. Order related
        await prisma.orderItem.deleteMany({});
        await prisma.order.deleteMany({});
        await prisma.reservation.deleteMany({});
        await prisma.table.deleteMany({});
        
        // 3. Shift related
        await prisma.cashMovement.deleteMany({});
        await prisma.shift.deleteMany({});
        await prisma.cashRegister.deleteMany({});
        
        // 4. Inventory related
        await prisma.stockTransferItem.deleteMany({});
        await prisma.stockTransfer.deleteMany({});
        await prisma.stockMovement.deleteMany({});
        await prisma.stockCount.deleteMany({});
        await prisma.inventory.deleteMany({});
        
        // 5. Purchase Order related
        await prisma.purchaseOrderItem.deleteMany({});
        await prisma.purchaseOrder.deleteMany({});
        await prisma.vendor.deleteMany({});
        
        // 6. Product related
        await prisma.billOfMaterial.deleteMany({});
        await prisma.productPriceLevel.deleteMany({});
        await prisma.sKUVariant.deleteMany({});
        await prisma.productStore.deleteMany({});
        await prisma.product.deleteMany({});
        await prisma.category.deleteMany({});
        await prisma.priceLevel.deleteMany({});
        
        // 7. Customer related
        await prisma.pointsHistory.deleteMany({});
        await prisma.customer.deleteMany({});
        
        // 8. Member related
        await prisma.pointHistory.deleteMany({});
        await prisma.member.deleteMany({});
        await prisma.membershipTier.deleteMany({});
        await prisma.pointSettings.deleteMany({});
        
        // 9. Promotion related
        await prisma.promotion.deleteMany({});
        await prisma.coupon.deleteMany({});
        
        // 10. User related (except Super Admins)
        await prisma.session.deleteMany({});
        await prisma.activityLog.deleteMany({});
        await prisma.storeRequest.deleteMany({});
        await prisma.userStore.deleteMany({});
        await prisma.user.deleteMany({ where: { id: { notIn: superAdminIds } } });
        
        // 11. Store related
        await prisma.store.deleteMany({});
        
        // 12. Branch related
        await prisma.branch.deleteMany({});
        
        // 13. Payment methods
        await prisma.paymentMethod.deleteMany({});
        
        // 14. Permissions
        await prisma.permission.deleteMany({});
        await prisma.permissionGroup.deleteMany({});
        await prisma.menuPermission.deleteMany({});
        
        // Create default branch for Super Admins
        const defaultBranch = await prisma.branch.create({
            data: {
                name: 'ສຳນັກງານໃຫຍ່',
                code: 'HQ',
                isMain: true,
                isActive: true
            }
        });
        
        // Update Super Admin users with new branch
        await prisma.user.updateMany({
            where: { id: { in: superAdminIds } },
            data: { branchId: defaultBranch.id }
        });
        
        res.json({
            success: true,
            data: {
                message: 'Database reset completed',
                preserved: {
                    superAdmins: superAdmins.length,
                    roles: rolesCount
                },
                created: {
                    defaultBranch: defaultBranch.name
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

