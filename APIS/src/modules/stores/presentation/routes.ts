// ═══════════════════════════════════════════════════════════════════════════
// Stores Module - Routes (Multi-Store Management)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, requireStoreAccess, invalidateUserStoreCache, invalidateAllUserStoreCache, getRoleLevel, canAccessStore, type ScopeFilter, buildStoreIdScope } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { stores, branches, users, userStores, storeRequests } from '@/db/schema/tables';
import { eq, and, or, ilike, inArray, desc, asc, count } from 'drizzle-orm';
import { assignUserToStores } from '@/shared/store-assignment';

export const storeRoutes = Router();

type StoreScopeRecord = {
    id: string;
    tenantId?: string | null;
    storePath?: string | null;
};

type UserScopeRecord = {
    id: string;
    tenantId?: string | null;
    role?: string | null;
    isSuperAdmin?: boolean | null;
};

// Stores are now the top-level, tenant-rooted tier (Tenant → Store → Branch) —
// a store no longer has a branchId to check against accessibleBranchIds.
// Access is: superadmin, tenant-level (roleLevel<=2), direct membership in
// accessibleStoreIds, or (level-3 store-tree HQ) the store falls under one of
// the caller's store-path subtrees.
function canAccessStoreRecord(req: any, store: StoreScopeRecord): boolean {
    const authUser = req.authUser;
    if (!authUser) return false;
    if (authUser.isSuperAdmin) return true;
    if (store.tenantId && store.tenantId !== authUser.tenantId) return false;
    if ((authUser.roleLevel ?? 7) <= 2) return true;
    if (store.id && authUser.accessibleStoreIds?.includes(store.id)) return true;
    if (store.storePath && canAccessStore(authUser, store.storePath)) return true;
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
// GET ALL STORES (filtered by accessible store subtree)
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.get('/', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { search, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;

        const conditions: any[] = [eq(stores.isActive, true)];

        // BE-75: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) {
            conditions.push(eq(stores.tenantId, tenantId));
        }

        // Apply scope — stores are the top-level tier now, so scoping is by
        // store subtree (exact ids, or a level-3 store-tree path prefix), not
        // by branch at all.
        const scopeCond = buildStoreIdScope(filter, stores.id);
        if (scopeCond) conditions.push(scopeCond);

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
                with: { branches: true },
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
storeRoutes.get('/my-stores', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
storeRoutes.get('/requests', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
storeRoutes.post('/requests', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
storeRoutes.get('/requests/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
storeRoutes.delete('/requests/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
storeRoutes.get('/:id', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const filter = req.branchFilter;
        
        // BE-75: Tenant-scoped store lookup
        const tenantId = req.authUser?.tenantId;
        const getConds: any[] = [eq(stores.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            getConds.push(eq(stores.tenantId, tenantId));
        }

        const store = await db.query.stores.findFirst({
            where: and(...getConds),
            with: { branches: true, userAccess: { with: { user: true } } },
        });

        if (!store) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Store not found or no access' }
            });
        }

        if (!canAccessStoreRecord(req, store)) {
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
// CREATE STORE
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.post('/', authenticate, withTenantTx(), authorize('stores:create', 'branches:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, code, parentStoreId, address, phone, email, description, logo, isDefault, settings } = req.body;

        // Validate required fields — stores are the top-level tier now, no
        // branchId to nest under. parentStoreId is optional (store subtree,
        // e.g. a chain/brand with its own sub-concepts).
        if (!name || !code) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Name and code are required' }
            });
        }
        // `code` feeds storePath (materialized path, '.'-joined) — same
        // constraint branches.code already enforces for branchPath.
        if (!/^[\w -]+$/.test(code)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: "Store code may only contain letters, numbers, spaces, underscores and hyphens (no '.')" }
            });
        }

        const tenantId = (req.authUser?.tenantId || req.user?.tenantId) || null;
        const dupConds: any[] = [eq(stores.code, code)];
        if (tenantId) dupConds.push(eq(stores.tenantId, tenantId));
        const existing = await db.query.stores.findFirst({ where: and(...dupConds) });
        if (existing) {
            return res.status(400).json({ success: false, error: { code: 'DUPLICATE', message: 'Store code already exists' } });
        }

        // Compute storePath: parent.path + '.' + code, or just code for a root store.
        let storePath = code;
        if (parentStoreId) {
            const parentConds: any[] = [eq(stores.id, parentStoreId)];
            if (tenantId) parentConds.push(eq(stores.tenantId, tenantId));
            const parent = await db.query.stores.findFirst({ where: and(...parentConds), columns: { storePath: true } });
            if (!parent) {
                return res.status(400).json({ success: false, error: { code: 'INVALID_PARENT', message: 'Parent store not found' } });
            }
            if (parent.storePath) storePath = parent.storePath + '.' + code;
        }

        if (isDefault) {
            await db.update(stores).set({ isDefault: false, updatedAt: new Date() })
                .where(and(eq(stores.isDefault, true), ...(tenantId ? [eq(stores.tenantId, tenantId)] : [])));
        }

        const [store] = await db.insert(stores).values({
            tenantId,
            parentStoreId: parentStoreId || null,
            storePath,
            name, code, address, phone, email, description, logo,
            isDefault: isDefault || false,
            settings,
        }).returning();

        const creatorId = req.user?.userId;
        if (creatorId) {
            const existingUs = await db.query.userStores.findFirst({ where: and(eq(userStores.userId, creatorId), eq(userStores.storeId, store.id)) });
            if (existingUs) {
                await db.update(userStores).set({ canRead: true, canWrite: true, canDelete: true, canManage: true, isDefault: isDefault || false }).where(eq(userStores.id, existingUs.id));
            } else {
                // branchId left null — a whole-store grant (see UserStoreAccess doc comment).
                await db.insert(userStores).values({ tenantId, userId: creatorId, storeId: store.id, branchId: null, canRead: true, canWrite: true, canDelete: true, canManage: true, isDefault: isDefault || false });
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
storeRoutes.put('/:id', authenticate, withTenantTx(), authorize('stores:update', 'branches:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { name, code, address, phone, email, description, logo, isActive, isDefault, settings } = req.body;

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
            // isDefault now means "the tenant's root/default store" (mirrors
            // branches.isMain) — scope the reset by tenant, not by branch.
            await db.update(stores).set({ isDefault: false, updatedAt: new Date() })
                .where(and(eq(stores.isDefault, true), ...(existing.tenantId ? [eq(stores.tenantId, existing.tenantId)] : [])));
        }

        const updateData: any = { updatedAt: new Date() };
        if (name) updateData.name = name;
        if (code) updateData.code = code;
        if (address !== undefined) updateData.address = address;
        if (phone !== undefined) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (description !== undefined) updateData.description = description;
        if (logo !== undefined) updateData.logo = logo;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (isDefault !== undefined) updateData.isDefault = isDefault;
        if (settings) updateData.settings = settings;

        delete updateData.tenantId;
        const [store] = await db.update(stores).set(updateData).where(and(...updConds)).returning();

        // Logo/name changes affect every user with access to this store, not just
        // the editor — a per-user cache bust wouldn't reach the others' sidebars.
        await invalidateAllUserStoreCache();

        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// REPARENT STORE (move within the store tree — stores no longer belong to a
// branch, so "transfer to another branch" became "move to another parent
// store" — the closest equivalent operation left on this entity).
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.put('/:id/transfer', authenticate, withTenantTx(), authorize('stores:update', 'branches:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { toParentStoreId } = req.body;

        // BE-75: Tenant-scoped store transfer
        const tenantId = req.authUser?.tenantId;
        const trConds: any[] = [eq(stores.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) trConds.push(eq(stores.tenantId, tenantId));
        const store = await db.query.stores.findFirst({ where: and(...trConds) });
        if (!store) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Store not found or no access' } });
        }

        if (store.parentStoreId === (toParentStoreId || null)) {
            return res.status(400).json({ success: false, error: { code: 'SAME_PARENT', message: 'ຮ້ານຢູ່ພາຍໃຕ້ນີ້ຢູ່ແລ້ວ' } });
        }

        let newStorePath = store.code;
        let targetParentName = '(root)';
        if (toParentStoreId) {
            if (toParentStoreId === id) {
                return res.status(400).json({ success: false, error: { code: 'INVALID_PARENT', message: 'A store cannot be its own parent' } });
            }
            const parConds: any[] = [eq(stores.id, toParentStoreId)];
            if (tenantId && !req.authUser?.isSuperAdmin) parConds.push(eq(stores.tenantId, tenantId));
            const targetParent = await db.query.stores.findFirst({ where: and(...parConds) });
            if (!targetParent) {
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Target parent store not found' } });
            }
            // Prevent creating a cycle: target can't be a descendant of the store being moved.
            if (targetParent.storePath === store.storePath || targetParent.storePath.startsWith(store.storePath + '.')) {
                return res.status(400).json({ success: false, error: { code: 'INVALID_PARENT', message: 'Cannot move a store under its own descendant' } });
            }
            newStorePath = (targetParent.storePath ? targetParent.storePath + '.' : '') + store.code;
            targetParentName = targetParent.name;
        }

        const [updatedStore] = await db.update(stores)
            .set({ parentStoreId: toParentStoreId || null, storePath: newStorePath, updatedAt: new Date() })
            .where(eq(stores.id, id))
            .returning();

        res.json({
            success: true,
            data: updatedStore,
            message: `ຍ້າຍຮ້ານ ${store.name} ໄປພາຍໃຕ້ ${targetParentName} ສຳເລັດ`
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE STORE (Soft delete)
// ═══════════════════════════════════════════════════════════════════════════
storeRoutes.delete('/:id', authenticate, withTenantTx(), authorize('stores:delete', 'branches:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
storeRoutes.post('/:id/users', authenticate, withTenantTx(), authorize('staff:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
            userId, storeId, branchId: null, // whole-store grant (every branch under this store)
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
storeRoutes.delete('/:id/users/:userId', authenticate, withTenantTx(), authorize('staff:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
storeRoutes.get('/:id/users', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
storeRoutes.get('/users/:userId/stores', authenticate, withTenantTx(), authorize('staff:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
storeRoutes.post('/users/:userId/bulk-assign', authenticate, withTenantTx(), authorize('staff:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { userId } = req.params;
        const { storeIds, permissions = {}, defaultStoreId } = req.body;

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

        // assignUserToStores also enforces exactly one isDefault=true row for
        // this user across ALL their store assignments (not just this batch) —
        // this loop previously wrote rows directly and never touched isDefault
        // at all, so a user could end up with 0 or 2+ default stores depending
        // on whether they were also assigned via the single-store endpoint.
        const results = await assignUserToStores(db, {
            userId,
            tenantId: user.tenantId || tenantId || null,
            assignments: storeList.map(store => ({
                storeId: store.id,
                branchId: null, // whole-store grant
                canRead: permissions.canRead ?? true,
                canWrite: permissions.canWrite ?? true,
                canDelete: permissions.canDelete ?? false,
                canManage: permissions.canManage ?? false,
            })),
            defaultStoreId,
            assignedBy: req.user?.userId,
        });

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
storeRoutes.delete('/users/:userId/stores', authenticate, withTenantTx(), authorize('staff:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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

