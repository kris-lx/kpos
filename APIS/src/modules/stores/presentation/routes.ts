// ═══════════════════════════════════════════════════════════════════════════
// Stores Module - Routes (Multi-Store Management)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, requireStoreAccess, applyScopeFilter, invalidateUserStoreCache, getRoleLevel, type ScopeFilter, buildScopeCondition } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { stores, branches, users, userStores, storeRequests } from '@/db/schema/tables';
import { eq, and, or, ilike, inArray, desc, asc, count } from 'drizzle-orm';

export const storeRoutes = Router();

type StoreScopeRecord = {
    id: string;
    tenantId?: string | null;
    branchId?: string | null;
};

type UserScopeRecord = {
    id: string;
    tenantId?: string | null;
    role?: string | null;
    isSuperAdmin?: boolean | null;
};

function canAccessStoreRecord(req: any, store: StoreScopeRecord): boolean {
    const authUser = req.authUser;
    if (!authUser) return false;
    if (authUser.isSuperAdmin) return true;
    if (store.tenantId && store.tenantId !== authUser.tenantId) return false;
    if ((authUser.roleLevel ?? 7) <= 2) return true;
    if (store.id && authUser.accessibleStoreIds?.includes(store.id)) return true;
    if (store.branchId && authUser.accessibleBranchIds?.includes(store.branchId)) return true;
    return false;
}

function canManageTargetUser(req: any, target: UserScopeRecord): boolean {
    const authUser = req.authUser;
    if (!authUser) return false;
    if (authUser.isSuperAdmin) return true;
    if (target.tenantId !== authUser.tenantId) return false;
    if (target.isSuperAdmin) return false;
    return getRoleLevel(target.role || 'staff', false) > (authUser.roleLevel ?? 7);
}

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

        const tenantId = (req.authUser?.tenantId || req.user?.tenantId) || null;
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

        const tenantId = req.authUser?.tenantId;
        const storeConds: any[] = [eq(stores.id, storeId)];
        if (tenantId && !req.authUser?.isSuperAdmin) storeConds.push(eq(stores.tenantId, tenantId));
        const store = await db.query.stores.findFirst({ where: and(...storeConds) });
        if (!store) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Store not found or no access' } });
        }
        if (!canAccessStoreRecord(req, store)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this store' } });
        }

        const userConds: any[] = [eq(users.id, userId)];
        if (tenantId && !req.authUser?.isSuperAdmin) userConds.push(eq(users.tenantId, tenantId));
        const user = await db.query.users.findFirst({ where: and(...userConds) });
        if (!user) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'User not found or no access' } });
        }
        if (user.tenantId !== store.tenantId) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot assign a user to another tenant store' } });
        }
        if (!canManageTargetUser(req, user)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot manage this user' } });
        }

        const existingConds: any[] = [eq(userStores.userId, userId), eq(userStores.storeId, storeId)];
        if (store.tenantId) existingConds.push(eq(userStores.tenantId, store.tenantId));
        const existing = await db.query.userStores.findFirst({
            where: and(...existingConds),
        });

        if (existing) {
            const [updated] = await db.update(userStores).set({ tenantId: store.tenantId, canRead, canWrite, canDelete, canManage, isDefault }).where(eq(userStores.id, existing.id)).returning();
            await invalidateUserStoreCache(userId);
            return res.json({ success: true, data: updated });
        }

        if (isDefault) {
            const defaultConds: any[] = [eq(userStores.userId, userId), eq(userStores.isDefault, true)];
            if (store.tenantId) defaultConds.push(eq(userStores.tenantId, store.tenantId));
            await db.update(userStores).set({ isDefault: false }).where(and(...defaultConds));
        }

        const [assignment] = await db.insert(userStores).values({
            tenantId: store.tenantId,
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

        const tenantId = req.authUser?.tenantId;
        const assignmentConds: any[] = [eq(userStores.userId, userId), eq(userStores.storeId, storeId)];
        if (tenantId && !req.authUser?.isSuperAdmin) assignmentConds.push(eq(userStores.tenantId, tenantId));
        const assignment = await db.query.userStores.findFirst({
            where: and(...assignmentConds),
            with: { store: true, user: true },
        });

        if (!assignment) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User store assignment not found' } });
        }
        if (!canAccessStoreRecord(req, assignment.store as any) || !canManageTargetUser(req, assignment.user as any)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this assignment' } });
        }

        await db.delete(userStores).where(and(...assignmentConds));
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

        const tenantId = req.authUser?.tenantId;
        const storeConds: any[] = [eq(stores.id, storeId)];
        if (tenantId && !req.authUser?.isSuperAdmin) storeConds.push(eq(stores.tenantId, tenantId));
        const store = await db.query.stores.findFirst({ where: and(...storeConds) });
        if (!store) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Store not found or no access' } });
        }

        if (!canAccessStoreRecord(req, store)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this store' } });
        }

        const usConds: any[] = [eq(userStores.storeId, storeId)];
        if (store.tenantId) usConds.push(eq(userStores.tenantId, store.tenantId));
        const storeUsers = await db.query.userStores.findMany({
            where: and(...usConds),
            with: { user: { columns: { password: false, twoFASecret: false } }, branch: true },
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

        const tenantId = req.authUser?.tenantId;
        const userConds: any[] = [eq(users.id, userId)];
        if (tenantId && !req.authUser?.isSuperAdmin) userConds.push(eq(users.tenantId, tenantId));
        const targetUser = await db.query.users.findFirst({ where: and(...userConds) });
        if (!targetUser || !canManageTargetUser(req, targetUser)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'User not found or no access' } });
        }

        const assignmentConds: any[] = [eq(userStores.userId, userId)];
        if (targetUser.tenantId) assignmentConds.push(eq(userStores.tenantId, targetUser.tenantId));
        const assignments = await db.query.userStores.findMany({
            where: and(...assignmentConds),
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

        const tenantId = req.authUser?.tenantId;
        const userConds: any[] = [eq(users.id, userId)];
        if (tenantId && !req.authUser?.isSuperAdmin) userConds.push(eq(users.tenantId, tenantId));
        const user = await db.query.users.findFirst({ where: and(...userConds) });
        if (!user || !canManageTargetUser(req, user)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'User not found or no access' } });
        }

        const storeConds: any[] = [inArray(stores.id, storeIds), eq(stores.isActive, true)];
        if (tenantId && !req.authUser?.isSuperAdmin) storeConds.push(eq(stores.tenantId, tenantId));
        const storeList = await db.query.stores.findMany({
            where: and(...storeConds),
        });
        if (storeList.length !== storeIds.length || storeList.some(store => !canAccessStoreRecord(req, store) || store.tenantId !== user.tenantId)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'One or more stores are outside your tenant or scope' } });
        }

        const results: any[] = [];
        for (const store of storeList) {
            const assignmentTenantId = store.tenantId || user.tenantId || tenantId;
            if (!assignmentTenantId) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required for store assignment' } });
            }

            const existing = await db.query.userStores.findFirst({
                where: and(eq(userStores.userId, userId), eq(userStores.storeId, store.id), eq(userStores.tenantId, assignmentTenantId)),
            });

            if (existing) {
                const [updated] = await db.update(userStores).set({
                    tenantId: assignmentTenantId,
                    canRead: permissions.canRead ?? true,
                    canWrite: permissions.canWrite ?? true,
                    canDelete: permissions.canDelete ?? false,
                    canManage: permissions.canManage ?? false,
                }).where(eq(userStores.id, existing.id)).returning();
                results.push(updated);
            } else {
                const [created] = await db.insert(userStores).values({
                    tenantId: assignmentTenantId,
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

        const tenantId = req.authUser?.tenantId;
        const userConds: any[] = [eq(users.id, userId)];
        if (tenantId && !req.authUser?.isSuperAdmin) userConds.push(eq(users.tenantId, tenantId));
        const targetUser = await db.query.users.findFirst({ where: and(...userConds) });
        if (!targetUser || !canManageTargetUser(req, targetUser)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'User not found or no access' } });
        }

        const delConditions: any[] = [eq(userStores.userId, userId)];
        if (targetUser.tenantId) delConditions.push(eq(userStores.tenantId, targetUser.tenantId));
        if (Array.isArray(storeIds) && storeIds.length > 0) {
            const scopedStores = await db.query.stores.findMany({
                where: and(inArray(stores.id, storeIds), targetUser.tenantId ? eq(stores.tenantId, targetUser.tenantId) : eq(stores.isActive, true)),
            });
            if (scopedStores.length !== storeIds.length || scopedStores.some(store => !canAccessStoreRecord(req, store))) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'One or more stores are outside your scope' } });
            }
            delConditions.push(inArray(userStores.storeId, storeIds));
        } else if (!req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) > 2) {
            const accessibleStoreIds = req.authUser?.accessibleStoreIds || [];
            if (accessibleStoreIds.length === 0) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No store scope available' } });
            }
            delConditions.push(inArray(userStores.storeId, accessibleStoreIds));
        }

        await db.delete(userStores).where(and(...delConditions));
        await invalidateUserStoreCache(userId);

        res.json({
            success: true,
            data: { deleted: Array.isArray(storeIds) && storeIds.length > 0 ? storeIds.length : null }
        });
    } catch (error) {
        next(error);
    }
});

