// ═══════════════════════════════════════════════════════════════════════════
// Stores Module - Routes (Multi-Store Management)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, requireStoreAccess, applyScopeFilter, invalidateUserStoreCache, type ScopeFilter, buildScopeCondition } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { stores, branches, users, userStores, storeRequests } from '@/db/schema/tables';
import { eq, and, or, ilike, inArray, desc, asc, count } from 'drizzle-orm';

export const storeRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL STORES (filtered by accessible branches)
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { branchId, search, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;
        
        const conditions: any[] = [eq(stores.isActive, true)];
        
        // BE-75: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) {
            conditions.push(eq(stores.tenantId, tenantId));
        }

        // Apply scope
        const scopeCond = buildScopeCondition(filter, { id: stores.id, branchId: stores.branchId }, 'store');
        if (scopeCond) conditions.push(scopeCond);
        
        if (branchId) {
            if (filter && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
            }
            conditions.push(eq(stores.branchId, String(branchId)));
        }
        
        if (search) {
            const s = String(search);
            conditions.push(or(ilike(stores.name, `%${s}%`), ilike(stores.code, `%${s}%`)));
        }

        const whereClause = and(...conditions);

        const [storeRows, [{ value: total }], userCountRows] = await Promise.all([
            db.query.stores.findMany({
                where: whereClause,
                offset: skip,
                limit: Number(limit),
                with: { branch: true },
                orderBy: [desc(stores.isDefault), asc(stores.name)],
            }),
            db.select({ value: count() }).from(stores).where(whereClause),
            db.select({ storeId: userStores.storeId, cnt: count() })
                .from(userStores)
                .groupBy(userStores.storeId),
        ]);

        const userCountMap = new Map(userCountRows.map((r: any) => [r.storeId, r.cnt]));
        const storeData = storeRows.map((s: any) => ({ ...s, userCount: Number(userCountMap.get(s.id) || 0) }));

        res.json({
            success: true,
            data: storeData,
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
// STORE REQUESTS - User can submit requests to open new store/branch
// MUST be before /:id to prevent Express matching 'requests' as :id
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /stores/requests - Get user's own store requests
 */
storeRoutes.get('/requests', authenticate, async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const { status, page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const reqConditions: any[] = [eq(storeRequests.requesterId, userId!)];
        if (status) reqConditions.push(eq(storeRequests.status, String(status)));
        const reqWhere = and(...reqConditions);

        const [requests, [{ value: total }]] = await Promise.all([
            db.query.storeRequests.findMany({
                where: reqWhere,
                offset: skip,
                limit: Number(limit),
                with: { reviewer: true, branch: true },
                orderBy: desc(storeRequests.createdAt),
            }),
            db.select({ value: count() }).from(storeRequests).where(reqWhere),
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
            branchId,
            documents,
            priority
        } = req.body;

        if (!type || !['new_store', 'new_branch'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid request type. Must be "new_store" or "new_branch"' }
            });
        }

        if (type === 'new_branch') {
            if (!branchName || !branchCode) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Branch name and code are required' }
                });
            }
            const existingBranch = await db.query.branches.findFirst({ where: eq(branches.code, branchCode) });
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
            const existingStore = await db.query.stores.findFirst({ where: eq(stores.code, storeCode) });
            if (existingStore) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Store code already exists' }
                });
            }
        }

        const reqTenantId = req.authUser?.tenantId || req.user?.tenantId;

        // Upload documents (base64) to cloud storage if provided
        let documentUrls: string[] = [];
        if (Array.isArray(documents) && documents.length > 0) {
            try {
                const { uploadService } = await import('@/infrastructure/services/upload.service');
                for (const doc of documents) {
                    const base64Data = typeof doc === 'string' ? doc : doc?.data;
                    if (base64Data) {
                        const result = await uploadService.uploadSingle(base64Data, {
                            folder: 'kpos/store-requests',
                            resourceType: 'auto',
                        });
                        if (result?.url) documentUrls.push(result.url);
                    }
                }
            } catch (uploadErr) {
                console.warn('[StoreRequest] Document upload failed:', uploadErr instanceof Error ? uploadErr.message : uploadErr);
            }
        }

        const [request] = await db.insert(storeRequests).values({
            tenantId: reqTenantId,
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
            documents: documentUrls.length > 0 ? documentUrls : (Array.isArray(documents) ? documents.map((d: any) => typeof d === 'string' ? d : d?.name || 'document').filter(Boolean) : []),
            priority: priority || 'normal',
            status: 'pending',
        }).returning();

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

        const request = await db.query.storeRequests.findFirst({
            where: eq(storeRequests.id, id),
            with: { reviewer: true, branch: true },
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Request not found' }
            });
        }

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

        const request = await db.query.storeRequests.findFirst({ where: eq(storeRequests.id, id) });

        if (!request) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Request not found' } });
        }

        if (request.requesterId !== userId) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You can only cancel your own requests' } });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Can only cancel pending requests' } });
        }

        await db.delete(storeRequests).where(eq(storeRequests.id, id));

        res.json({
            success: true,
            message: 'Request cancelled successfully'
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET STORE BY ID (MUST be after all specific named routes like /requests, /my-stores)
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.get('/:id', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = req.branchFilter;
        
        // BE-75: Tenant-scoped store lookup
        const tenantId = req.authUser?.tenantId;
        const getConds: any[] = [eq(stores.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            getConds.push(eq(stores.tenantId, tenantId));
        }

        const store = await db.query.stores.findFirst({
            where: and(...getConds),
            with: { branch: true, userAccess: { with: { user: true } } },
        });

        if (!store) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Store not found or no access' }
            });
        }

        // Check store-level or branch-level access
        if (filter) {
            const hasAccess = filter.scopeByStore
                ? filter.storeIds.includes(store.id)
                : filter.branchIds.includes(store.branchId);
            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No access to this store' }
                });
            }
        }

        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATE STORE
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.post('/', authenticate, authorize('stores:create', 'branches:create'), async (req, res, next) => {
    try {
        const { name, code, branchId, address, phone, email, description, isDefault, settings } = req.body;

        // Validate required fields
        if (!name || !code || !branchId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Name, code, and branchId are required' }
            });
        }

        const existing = await db.query.stores.findFirst({ where: eq(stores.code, code) });
        if (existing) {
            return res.status(400).json({ success: false, error: { code: 'DUPLICATE', message: 'Store code already exists' } });
        }

        const branch = await db.query.branches.findFirst({ where: eq(branches.id, branchId) });
        if (!branch) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_BRANCH', message: 'Branch not found' } });
        }

        if (isDefault) {
            await db.update(stores).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(stores.branchId, branchId), eq(stores.isDefault, true)));
        }

        const tenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [store] = await db.insert(stores).values({
            tenantId,
            name, code, branchId, address, phone, email, description,
            isDefault: isDefault || false,
            settings,
        }).returning();

        const creatorId = req.user?.userId;
        if (creatorId) {
            const existingUs = await db.query.userStores.findFirst({ where: and(eq(userStores.userId, creatorId), eq(userStores.storeId, store.id)) });
            if (existingUs) {
                await db.update(userStores).set({ canRead: true, canWrite: true, canDelete: true, canManage: true, isDefault: isDefault || false }).where(eq(userStores.id, existingUs.id));
            } else {
                await db.insert(userStores).values({ tenantId, userId: creatorId, storeId: store.id, branchId, canRead: true, canWrite: true, canDelete: true, canManage: true, isDefault: isDefault || false });
            }
            await invalidateUserStoreCache(creatorId);
        }

        res.status(201).json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE STORE
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.put('/:id', authenticate, authorize('stores:update', 'branches:update'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, code, address, phone, email, description, isActive, isDefault, settings } = req.body;

        // BE-75: Tenant-scoped store update
        const tenantId = req.authUser?.tenantId;
        const updConds: any[] = [eq(stores.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) updConds.push(eq(stores.tenantId, tenantId));
        const existing = await db.query.stores.findFirst({ where: and(...updConds) });
        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Store not found or no access' } });
        }

        if (code && code !== existing.code) {
            const codeExists = await db.query.stores.findFirst({ where: eq(stores.code, code) });
            if (codeExists) {
                return res.status(400).json({ success: false, error: { code: 'DUPLICATE', message: 'Store code already exists' } });
            }
        }

        if (isDefault && !existing.isDefault) {
            await db.update(stores).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(stores.branchId, existing.branchId), eq(stores.isDefault, true)));
        }

        const updateData: any = { updatedAt: new Date() };
        if (name) updateData.name = name;
        if (code) updateData.code = code;
        if (address !== undefined) updateData.address = address;
        if (phone !== undefined) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (description !== undefined) updateData.description = description;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (isDefault !== undefined) updateData.isDefault = isDefault;
        if (settings) updateData.settings = settings;

        delete updateData.tenantId;
        const [store] = await db.update(stores).set(updateData).where(and(...updConds)).returning();

        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFER STORE TO ANOTHER BRANCH
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.put('/:id/transfer', authenticate, authorize('stores:update', 'branches:update'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { toBranchId } = req.body;

        if (!toBranchId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION', message: 'toBranchId is required' }
            });
        }

        // BE-75: Tenant-scoped store transfer
        const tenantId = req.authUser?.tenantId;
        const trConds: any[] = [eq(stores.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) trConds.push(eq(stores.tenantId, tenantId));
        const store = await db.query.stores.findFirst({ where: and(...trConds), with: { branch: true } });
        if (!store) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Store not found or no access' } });
        }

        if (store.branchId === toBranchId) {
            return res.status(400).json({ success: false, error: { code: 'SAME_BRANCH', message: 'ຮ້ານຢູ່ສາຂານີ້ຢູ່ແລ້ວ' } });
        }

        // Verify target branch belongs to same tenant
        const brConds: any[] = [eq(branches.id, toBranchId)];
        if (tenantId && !req.authUser?.isSuperAdmin) brConds.push(eq(branches.tenantId, tenantId));
        const targetBranch = await db.query.branches.findFirst({ where: and(...brConds) });
        if (!targetBranch) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Target branch not found' } });
        }

        const [[updatedStore]] = await Promise.all([
            db.update(stores).set({ branchId: toBranchId, updatedAt: new Date() }).where(eq(stores.id, id)).returning(),
            db.update(userStores).set({ branchId: toBranchId }).where(eq(userStores.storeId, id)),
        ]);

        res.json({
            success: true,
            data: updatedStore,
            message: `ໂອນຮ້ານ ${store.name} ຈາກ ${store.branch.name} ໄປ ${targetBranch.name} ສຳເລັດ`
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE STORE (Soft delete)
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.delete('/:id', authenticate, authorize('stores:delete', 'branches:delete'), async (req, res, next) => {
    try {
        // BE-75: Tenant-scoped store delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(stores.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) delConds.push(eq(stores.tenantId, tenantId));
        await db.update(stores).set({ isActive: false, updatedAt: new Date() }).where(and(...delConds));

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

        const store = await db.query.stores.findFirst({ where: eq(stores.id, storeId) });
        if (!store) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        }

        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (!user) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
        }

        const existing = await db.query.userStores.findFirst({
            where: and(eq(userStores.userId, userId), eq(userStores.storeId, storeId)),
        });

        if (existing) {
            const [updated] = await db.update(userStores).set({ canRead, canWrite, canDelete, canManage, isDefault }).where(eq(userStores.id, existing.id)).returning();
            await invalidateUserStoreCache(userId);
            return res.json({ success: true, data: updated });
        }

        if (isDefault) {
            await db.update(userStores).set({ isDefault: false }).where(and(eq(userStores.userId, userId), eq(userStores.isDefault, true)));
        }

        const [assignment] = await db.insert(userStores).values({
            userId, storeId, branchId: store.branchId,
            canRead, canWrite, canDelete, canManage, isDefault,
            assignedBy: req.user?.userId,
        }).returning();

        await invalidateUserStoreCache(userId);
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

        const assignment = await db.query.userStores.findFirst({
            where: and(eq(userStores.userId, userId), eq(userStores.storeId, storeId)),
        });

        if (!assignment) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User store assignment not found' } });
        }

        await db.delete(userStores).where(eq(userStores.id, assignment.id));
        await invalidateUserStoreCache(userId);

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
        const filter = req.branchFilter;

        const store = await db.query.stores.findFirst({ where: eq(stores.id, storeId) });
        if (!store) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        }

        if (filter) {
            const hasAccess = filter.scopeByStore ? filter.storeIds.includes(store.id) : filter.branchIds.includes(store.branchId);
            if (!hasAccess) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this store' } });
            }
        }

        const storeUsers = await db.query.userStores.findMany({
            where: eq(userStores.storeId, storeId),
            with: { user: true },
        });

        res.json({ success: true, data: storeUsers });
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

        const assignments = await db.query.userStores.findMany({
            where: eq(userStores.userId, userId),
            with: { store: true, branch: true },
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

        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (!user) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
        }

        const storeList = await db.query.stores.findMany({
            where: and(inArray(stores.id, storeIds), eq(stores.isActive, true)),
        });

        const results = [];
        for (const store of storeList) {
            const existing = await db.query.userStores.findFirst({
                where: and(eq(userStores.userId, userId), eq(userStores.storeId, store.id)),
            });

            if (existing) {
                const [updated] = await db.update(userStores).set({
                    canRead: permissions.canRead ?? true,
                    canWrite: permissions.canWrite ?? true,
                    canDelete: permissions.canDelete ?? false,
                    canManage: permissions.canManage ?? false,
                }).where(eq(userStores.id, existing.id)).returning();
                results.push(updated);
            } else {
                const [created] = await db.insert(userStores).values({
                    userId, storeId: store.id, branchId: store.branchId,
                    canRead: permissions.canRead ?? true,
                    canWrite: permissions.canWrite ?? true,
                    canDelete: permissions.canDelete ?? false,
                    canManage: permissions.canManage ?? false,
                    assignedBy: req.user?.userId,
                }).returning();
                results.push(created);
            }
        }

        await invalidateUserStoreCache(userId);
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

        const delConditions: any[] = [eq(userStores.userId, userId)];
        if (Array.isArray(storeIds) && storeIds.length > 0) {
            delConditions.push(inArray(userStores.storeId, storeIds));
        }

        const result = await db.delete(userStores).where(and(...delConditions));
        await invalidateUserStoreCache(userId);

        res.json({
            success: true,
            data: { deleted: result.rowCount ?? 0 }
        });
    } catch (error) {
        next(error);
    }
});

