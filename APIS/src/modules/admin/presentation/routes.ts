// ═══════════════════════════════════════════════════════════════════════════
// Admin Module - Super Admin Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, requireSuperAdmin, requireAdmin, isSuperAdmin, isAdmin, invalidateRoleRulesCache, invalidateAllUserStoreCache } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { publish, QUEUES, isRabbitMQConnected } from '@/config/rabbitmq.config';
import argon2 from 'argon2';
import { users, sessions, roles, rules, roleRules, permissionGroups, permissions, menuPermissions, stores, userStores, productStores, storeRequests, branches, activityLogs, transactions, transactionItems, transactionPayments, heldSales, orders, orderItems, reservations, tables, cashMovements, shifts, cashRegisters, stockTransferItems, stockTransfers, stockMovements, stockCounts, stockCountItems, inventory, purchaseOrderItems, purchaseOrders, vendors, billOfMaterials, productPriceLevels, skuVariants, products, categories, priceLevels, pointsHistory, customers, pointHistory, members, membershipTiers, pointSettings, promotions, coupons, paymentMethods, discounts, systemEnums } from '@/db/schema/tables';
import { eq, and, or, ne, ilike, inArray, notInArray, gte, lte, desc, asc, count, sql, isNull, isNotNull } from 'drizzle-orm';
import { ENUM_SEED_DATA } from '@/modules/settings/presentation/routes';

export const adminRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC STORE REGISTRATION (No Auth Required)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/register-and-apply
 * Public endpoint: create account + submit store application in one step.
 * User is created with isActive=false until approved by super_admin.
 */
adminRoutes.post('/register-and-apply', async (req, res, next) => {
    try {
        const {
            // Account fields
            name, email, password, phone,
            // Business fields
            storeName, storeCode, storeAddress, storePhone, storeEmail, businessType,
            // KYC fields (stored in metadata)
            ownerIdType, ownerIdNumber, ownerName, ownerPhone, ownerNationality,
            businessLicenseNo, taxCertificateNo,
            // Request fields
            reason,
            // Document URLs (uploaded separately or as base64 refs)
            documents,
        } = req.body;

        // Validate required fields
        if (!name || !email || !password || !storeName || !storeCode) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'name, email, password, storeName, storeCode are required' }
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' }
            });
        }

        // Check email uniqueness
        const existing = await db.query.users.findFirst({ where: eq(users.email, String(email).toLowerCase()) });
        if (existing) {
            return res.status(409).json({
                success: false,
                error: { code: 'EMAIL_EXISTS', message: 'Email already registered' }
            });
        }

        const hashedPassword = await argon2.hash(String(password));

        // Create user + store request atomically
        const [newUser] = await db.transaction(async (tx) => {
            const [user] = await tx.insert(users).values({
                email: String(email).toLowerCase(),
                password: hashedPassword,
                name: String(name),
                phone: phone ? String(phone) : undefined,
                role: 'store_owner',
                isActive: false,
                emailVerified: false,
                permissions: [],
            }).returning();

            await tx.insert(storeRequests).values({
                requesterId: user.id,
                type: 'new_store',
                storeName: String(storeName),
                storeCode: String(storeCode).toUpperCase(),
                storeAddress: storeAddress ? String(storeAddress) : undefined,
                storePhone: storePhone ? String(storePhone) : undefined,
                storeEmail: storeEmail ? String(storeEmail) : undefined,
                reason: reason ? String(reason) : undefined,
                documents: Array.isArray(documents) ? documents : [],
                metadata: {
                    businessType: businessType || 'retail',
                    ownerIdType: ownerIdType || 'national_id',
                    ownerIdNumber: ownerIdNumber || '',
                    ownerName: ownerName || name,
                    ownerPhone: ownerPhone || phone || '',
                    ownerNationality: ownerNationality || 'LAO',
                    businessLicenseNo: businessLicenseNo || '',
                    taxCertificateNo: taxCertificateNo || '',
                },
                status: 'pending',
                priority: 'normal',
            });

            return [user];
        });

        res.status(201).json({
            success: true,
            data: {
                userId: newUser.id,
                email: newUser.email,
                message: 'Application submitted. Your account will be activated after approval.',
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STORE REQUESTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/requests/count - Get count of pending requests (for notification badge)
 * Must be before /requests/:id to avoid route conflict
 */
adminRoutes.get('/requests/count', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const [{ value: pending }] = await db.select({ value: count() }).from(storeRequests).where(eq(storeRequests.status, 'pending'));
        res.json({ success: true, data: { pending } });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/requests - Get all store/branch requests (Super Admin only)
 */
adminRoutes.get('/requests', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { status, type, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const reqConds: any[] = [];
        if (status) reqConds.push(eq(storeRequests.status, String(status)));
        if (type) reqConds.push(eq(storeRequests.type, String(type)));
        const reqWhere = reqConds.length > 0 ? and(...reqConds) : undefined;

        const [requests, [{ value: total }]] = await Promise.all([
            db.query.storeRequests.findMany({
                where: reqWhere,
                offset: skip,
                limit: Number(limit),
                with: {
                    requester: { columns: { id: true, name: true, email: true, phone: true } },
                    reviewer: { columns: { id: true, name: true, email: true } },
                    branch: { columns: { id: true, name: true, code: true } },
                },
                orderBy: [desc(storeRequests.priority), desc(storeRequests.createdAt)],
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
 * GET /admin/requests/:id - Get single request details
 */
adminRoutes.get('/requests/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;

        const request = await db.query.storeRequests.findFirst({
            where: eq(storeRequests.id, id),
            with: {
                requester: { columns: { id: true, name: true, email: true, phone: true, avatar: true } },
                reviewer: { columns: { id: true, name: true, email: true } },
                branch: { columns: { id: true, name: true, code: true, address: true } },
            },
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

        const request = await db.query.storeRequests.findFirst({ where: eq(storeRequests.id, id) });

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
            const [br] = await db.insert(branches).values({
                name: request.branchName, code: request.branchCode,
                address: request.branchAddress, phone: request.branchPhone, email: request.branchEmail, isActive: true,
            }).returning();
            createdEntity = br;
        } else if (request.type === 'new_store' && request.storeName && request.storeCode) {
            let targetBranchId = request.branchId;
            if (!targetBranchId) {
                const [defaultBranch] = await db.insert(branches).values({
                    name: `${request.storeName} - ສາຂາຫຼັກ`, code: `BR-${request.storeCode}`,
                    address: request.storeAddress, phone: request.storePhone, email: request.storeEmail, isActive: true,
                }).returning();
                targetBranchId = defaultBranch.id;
            }

            const [store] = await db.insert(stores).values({
                name: request.storeName, code: request.storeCode, branchId: targetBranchId,
                address: request.storeAddress, phone: request.storePhone, email: request.storeEmail, isActive: true,
            }).returning();
            createdEntity = store;

            await db.insert(userStores).values([{
                userId: request.requesterId as string, storeId: createdEntity.id as string, branchId: targetBranchId as string,
                canRead: true, canWrite: true, canDelete: true, canManage: true, isDefault: true, assignedBy: reviewerId as string,
            }]);

            let storeOwnerRole = await db.query.roles.findFirst({ where: eq(roles.name, 'store_owner') });
            if (!storeOwnerRole) {
                const [created] = await db.insert(roles).values({
                    name: 'store_owner', displayName: 'Store Owner',
                    description: 'ເຈົ້າຂອງຮ້ານ - ສິດຄວບຄຸມຮ້ານທັງໝົດ',
                    permissions: DEFAULT_ROLES.find(r => r.name === 'store_owner')?.permissions || [],
                    isSystem: true,
                }).returning();
                storeOwnerRole = created;
            }
            await db.update(users).set({ roleId: storeOwnerRole.id, role: 'store_owner', branchId: targetBranchId }).where(eq(users.id, request.requesterId));
        }

        await db.update(storeRequests).set({ status: 'approved', reviewerId, reviewNote: note, reviewedAt: new Date() }).where(eq(storeRequests.id, id));
        const updatedRequest = await db.query.storeRequests.findFirst({
            where: eq(storeRequests.id, id),
            with: {
                requester: { columns: { id: true, name: true, email: true } },
                reviewer: { columns: { id: true, name: true } },
            },
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

        const request = await db.query.storeRequests.findFirst({ where: eq(storeRequests.id, id) });

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

        await db.update(storeRequests).set({ status: 'rejected', reviewerId, reviewNote: note || 'ຄຳຂໍຖືກປະຕິເສດ', reviewedAt: new Date() }).where(eq(storeRequests.id, id));
        const updatedRequest = await db.query.storeRequests.findFirst({
            where: eq(storeRequests.id, id),
            with: {
                requester: { columns: { id: true, name: true, email: true } },
                reviewer: { columns: { id: true, name: true } },
            },
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
        const authUser = (req as any).authUser;

        // Non-super-admins only see branches linked to their accessible stores
        let allowedBranchIds: string[] | null = null;
        if (!authUser?.isSuperAdmin) {
            const activeStoreId = authUser?.activeStoreId;
            if (activeStoreId) {
                const storeRow = await db.query.stores.findFirst({ where: eq(stores.id, activeStoreId), columns: { branchId: true } });
                allowedBranchIds = storeRow ? [storeRow.branchId] : [];
            } else {
                const usRows = await db.query.userStores.findMany({ where: eq(userStores.userId, authUser.userId), columns: { branchId: true } });
                allowedBranchIds = [...new Set(usRows.map(r => r.branchId))];
            }
        }

        const brConds: any[] = [];
        if (allowedBranchIds !== null) {
            if (allowedBranchIds.length === 0) brConds.push(eq(branches.id, 'no-access'));
            else brConds.push(inArray(branches.id, allowedBranchIds));
        }
        if (isActive !== undefined) brConds.push(eq(branches.isActive, isActive === 'true'));
        if (search) {
            const s = String(search);
            brConds.push(or(ilike(branches.name, `%${s}%`), ilike(branches.code, `%${s}%`)));
        }
        const brWhere = brConds.length > 0 ? and(...brConds) : undefined;

        const [branchList, [{ value: total }]] = await Promise.all([
            db.query.branches.findMany({ where: brWhere, offset: skip, limit: Number(limit), orderBy: [desc(branches.isMain), asc(branches.name)] }),
            db.select({ value: count() }).from(branches).where(brWhere),
        ]);

        res.json({
            success: true,
            data: branchList,
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

        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Branch name is required' } });
        }
        if (!code || !String(code).trim()) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Branch code is required' } });
        }

        const existing = await db.query.branches.findFirst({ where: eq(branches.code, String(code).trim()) });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Branch code already exists' }
            });
        }

        if (isMain) {
            await db.update(branches).set({ isMain: false }).where(eq(branches.isMain, true));
        }

        const [branch] = await db.insert(branches).values({
            name: String(name).trim(), code: String(code).trim(),
            address: address || undefined, phone: phone || undefined, email: email || undefined,
            taxId: taxId || undefined, logo: logo || undefined,
            isMain: isMain || false, settings: settings || {},
        }).returning();

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

        const existing = await db.query.branches.findFirst({ where: eq(branches.id, id) });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Branch not found' }
            });
        }

        if (code && code !== existing.code) {
            const duplicate = await db.query.branches.findFirst({ where: eq(branches.code, code) });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Branch code already exists' }
                });
            }
        }

        if (isMain && !existing.isMain) {
            await db.update(branches).set({ isMain: false }).where(eq(branches.isMain, true));
        }

        const [branch] = await db.update(branches).set({ name, code, address, phone, email, taxId, logo, isMain, isActive, settings }).where(eq(branches.id, id)).returning();

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

        const branch = await db.query.branches.findFirst({ where: eq(branches.id, id) });

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

        await db.update(branches).set({ isActive: false }).where(eq(branches.id, id));

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

        const stConds: any[] = [];
        if (isActive !== undefined) stConds.push(eq(stores.isActive, isActive === 'true'));
        if (branchId) stConds.push(eq(stores.branchId, String(branchId)));
        if (search) {
            const s = String(search);
            stConds.push(or(ilike(stores.name, `%${s}%`), ilike(stores.code, `%${s}%`)));
        }
        const stWhere = stConds.length > 0 ? and(...stConds) : undefined;

        const [storeList, [{ value: total }]] = await Promise.all([
            db.query.stores.findMany({ where: stWhere, offset: skip, limit: Number(limit), with: { branch: { columns: { id: true, name: true, code: true } } }, orderBy: asc(stores.name) }),
            db.select({ value: count() }).from(stores).where(stWhere),
        ]);

        res.json({
            success: true,
            data: storeList,
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

        const existing = await db.query.stores.findFirst({ where: eq(stores.code, code) });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Store code already exists' }
            });
        }

        const [store] = await db.insert(stores).values({ name, code, branchId, address, phone, email, settings: settings || {}, isActive: true }).returning();
        const storeWithBranch = await db.query.stores.findFirst({ where: eq(stores.id, store.id), with: { branch: { columns: { id: true, name: true } } } });

        res.status(201).json({ success: true, data: storeWithBranch });
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

        const existing = await db.query.stores.findFirst({ where: eq(stores.id, id) });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        if (code && code !== existing.code) {
            const duplicate = await db.query.stores.findFirst({ where: eq(stores.code, code) });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Store code already exists' }
                });
            }
        }

        await db.update(stores).set({ name, code, branchId, address, phone, email, isActive, settings }).where(eq(stores.id, id));
        const store = await db.query.stores.findFirst({ where: eq(stores.id, id), with: { branch: { columns: { id: true, name: true } } } });

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

        const store = await db.query.stores.findFirst({ where: eq(stores.id, id) });
        if (!store) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        await db.update(stores).set({ isActive: false }).where(eq(stores.id, id));

        res.json({ success: true, message: 'Store deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STORE DETAIL ENDPOINTS (for My Store page)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/stores/:id/details - Get store with full details
 */
adminRoutes.get('/stores/:id/details', authenticate, async (req, res, next) => {
    try {
        const store = await db.query.stores.findFirst({
            where: eq(stores.id, req.params.id),
            with: { branch: { columns: { id: true, name: true, code: true, address: true, phone: true } } },
        });
        if (!store) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        }
        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/stores/:id/stats - Get store statistics
 */
adminRoutes.get('/stores/:id/stats', authenticate, async (req, res, next) => {
    try {
        const store = await db.query.stores.findFirst({ where: eq(stores.id, req.params.id) });
        if (!store) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        }

        const branchId = store.branchId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [[{ value: totalProducts }], [{ value: totalUsers }], [{ value: todayTransactions }], todaySales] = await Promise.all([
            db.select({ value: count() }).from(productStores).where(and(eq(productStores.storeId, req.params.id), eq(productStores.isActive, true))),
            db.select({ value: count() }).from(userStores).where(eq(userStores.storeId, req.params.id)),
            db.select({ value: count() }).from(transactions).where(and(eq(transactions.branchId, branchId), gte(transactions.createdAt, today), eq(transactions.status, 'COMPLETED'))),
            db.query.transactions.findMany({ where: and(eq(transactions.branchId, branchId), gte(transactions.createdAt, today), eq(transactions.status, 'COMPLETED')), columns: { total: true } }),
        ]);

        const totalSalesToday = todaySales.reduce((sum: number, t: any) => sum + t.total, 0);

        res.json({
            success: true,
            data: {
                totalProducts,
                totalUsers,
                todayTransactions,
                totalSalesToday,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/stores/:id/branches - Get branches related to store
 */
adminRoutes.get('/stores/:id/branches', authenticate, async (req, res, next) => {
    try {
        const store = await db.query.stores.findFirst({ where: eq(stores.id, req.params.id), columns: { branchId: true } });
        if (!store) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        }
        const branchList = await db.query.branches.findMany({ where: eq(branches.id, store.branchId), columns: { id: true, name: true, code: true, address: true, phone: true, isActive: true } });
        res.json({ success: true, data: branchList });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/stores/:id/users - Get users with access to store
 */
adminRoutes.get('/stores/:id/users', authenticate, async (req, res, next) => {
    try {
        const usList = await db.query.userStores.findMany({
            where: eq(userStores.storeId, req.params.id),
            with: { user: { columns: { id: true, name: true, email: true, phone: true, role: true, avatar: true, isActive: true } } },
        });
        const userList = usList.map((us: any) => ({
            ...us.user,
            canRead: us.canRead,
            canWrite: us.canWrite,
            canDelete: us.canDelete,
            canManage: us.canManage,
            isDefault: us.isDefault,
        }));
        res.json({ success: true, data: userList });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/stores/:id/update - Update store (non-admin users for their own store)
 */
adminRoutes.put('/stores/:id/update', authenticate, async (req, res, next) => {
    try {
        const { name, address, phone, email, description, settings } = req.body;
        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (address !== undefined) updateData.address = address;
        if (phone !== undefined) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (description !== undefined) updateData.description = description;
        if (settings !== undefined) updateData.settings = settings;

        const [store] = await db.update(stores).set(updateData).where(eq(stores.id, req.params.id)).returning();
        if (!store) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        }
        res.json({ success: true, data: store });
    } catch (error: any) {
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
            [{ value: totalBranches }],
            [{ value: activeBranches }],
            [{ value: totalStores }],
            [{ value: activeStores }],
            [{ value: totalUsers }],
            [{ value: activeUsers }],
            [{ value: pendingRequests }],
            recentRequests,
            [{ value: todayTransactions }]
        ] = await Promise.all([
            db.select({ value: count() }).from(branches),
            db.select({ value: count() }).from(branches).where(eq(branches.isActive, true)),
            db.select({ value: count() }).from(stores),
            db.select({ value: count() }).from(stores).where(eq(stores.isActive, true)),
            db.select({ value: count() }).from(users),
            db.select({ value: count() }).from(users).where(eq(users.isActive, true)),
            db.select({ value: count() }).from(storeRequests).where(eq(storeRequests.status, 'pending')),
            db.query.storeRequests.findMany({
                where: eq(storeRequests.status, 'pending'),
                limit: 5,
                orderBy: desc(storeRequests.createdAt),
                with: { requester: { columns: { name: true, email: true } } },
            }),
            db.select({ value: count() }).from(transactions).where(gte(transactions.createdAt, new Date(new Date().setHours(0, 0, 0, 0)))),
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

        const uConds: any[] = [];
        if (isActive !== undefined) uConds.push(eq(users.isActive, isActive === 'true'));
        if (isSuperAdmin !== undefined) uConds.push(eq(users.isSuperAdmin, isSuperAdmin === 'true'));
        if (branchId) uConds.push(eq(users.branchId, String(branchId)));
        if (search) {
            const s = String(search);
            uConds.push(or(ilike(users.name, `%${s}%`), ilike(users.email, `%${s}%`)));
        }
        const uWhere = uConds.length > 0 ? and(...uConds) : undefined;

        const [userList, [{ value: total }]] = await Promise.all([
            db.query.users.findMany({
                where: uWhere,
                offset: skip,
                limit: Number(limit),
                columns: { id: true, email: true, name: true, phone: true, role: true, isActive: true, isSuperAdmin: true, lastLoginAt: true, createdAt: true },
                with: {
                    branch: { columns: { id: true, name: true, code: true } },
                    roleRelation: { columns: { id: true, name: true, displayName: true } },
                },
                orderBy: [desc(users.isSuperAdmin), asc(users.name)],
            }),
            db.select({ value: count() }).from(users).where(uWhere),
        ]);

        res.json({
            success: true,
            data: userList,
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

        if (id === req.authUser!.userId && newStatus === false) {
            return res.status(400).json({
                success: false,
                error: { code: 'SELF_DEMOTION', message: 'Cannot remove your own Super Admin status' }
            });
        }

        const [user] = await db.update(users).set({ isSuperAdmin: Boolean(newStatus) }).where(eq(users.id, id)).returning({ id: users.id, name: users.name, email: users.email, isSuperAdmin: users.isSuperAdmin });

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



        const dupConds: any[] = [eq(storeRequests.requesterId, requesterId), eq(storeRequests.status, 'pending'), eq(storeRequests.type, type)];
        const orConds: any[] = [];
        if (storeCode) orConds.push(eq(storeRequests.storeCode, storeCode));
        if (branchCode) orConds.push(eq(storeRequests.branchCode, branchCode));
        if (orConds.length > 0) dupConds.push(or(...orConds));
        const existingRequest = await db.query.storeRequests.findFirst({ where: and(...dupConds) });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE_REQUEST', message: 'Similar request already pending' }
            });
        }

        const [created] = await db.insert(storeRequests).values({
            requesterId, type, branchId, storeName, storeCode, storeAddress, storePhone, storeEmail,
            branchName, branchCode, branchAddress, branchPhone, branchEmail, reason,
            documents: documents || [], priority: priority || 'normal', status: 'pending',
        }).returning();
        const request = await db.query.storeRequests.findFirst({ where: eq(storeRequests.id, created.id), with: { requester: { columns: { name: true, email: true } } } });

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

        const myConds: any[] = [eq(storeRequests.requesterId, requesterId)];
        if (status) myConds.push(eq(storeRequests.status, String(status)));
        const myWhere = and(...myConds);

        const [requests, [{ value: total }]] = await Promise.all([
            db.query.storeRequests.findMany({
                where: myWhere, offset: skip, limit: Number(limit),
                with: { reviewer: { columns: { name: true } }, branch: { columns: { name: true, code: true } } },
                orderBy: desc(storeRequests.createdAt),
            }),
            db.select({ value: count() }).from(storeRequests).where(myWhere),
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
        const dbPermissions = await db.query.permissionGroups.findMany({
            where: eq(permissionGroups.isActive, true),
            orderBy: asc(permissionGroups.order),
            with: { permissions: true },
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
        res.json({ success: true, data: DEFAULT_PERMISSION_GROUPS });
    } catch (error) {
        res.json({ success: true, data: DEFAULT_PERMISSION_GROUPS });
    }
});

/**
 * POST /admin/permissions - Create/Update permission groups (Super Admin only)
 */
adminRoutes.post('/permissions', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { groups } = req.body;

        await db.delete(permissions);
        await db.delete(permissionGroups);

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const [pg] = await db.insert(permissionGroups).values({ key: group.key, label: group.label, icon: group.icon, color: group.color, order: i, isActive: true }).returning();
            for (let j = 0; j < group.permissions.length; j++) {
                const p = group.permissions[j];
                await db.insert(permissions).values({ key: p.key, label: p.label, groupId: pg.id, order: j, isActive: true });
            }
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

        const rConds: any[] = [];
        if (search) {
            const s = String(search);
            rConds.push(or(ilike(roles.name, `%${s}%`), ilike(roles.displayName, `%${s}%`)));
        }
        const rWhere = rConds.length > 0 ? and(...rConds) : undefined;

        const [roleList, [{ value: total }]] = await Promise.all([
            db.query.roles.findMany({ where: rWhere, offset: skip, limit: Number(limit), orderBy: [desc(roles.isSystem), asc(roles.name)] }),
            db.select({ value: count() }).from(roles).where(rWhere),
        ]);

        res.json({
            success: true,
            data: roleList,
            meta: { page: Number(page), limit: Number(limit), total }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/roles/templates - Get default role templates
 * MUST be before /roles/:id to prevent Express matching 'templates' as :id
 */
adminRoutes.get('/roles/templates', authenticate, requireAdmin(), async (req, res) => {
    res.json({ success: true, data: DEFAULT_ROLES });
});

/**
 * POST /admin/roles/seed - Seed default roles to database
 * MUST be before /roles/:id to prevent Express matching 'seed' as :id
 */
adminRoutes.post('/roles/seed', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const results = [];

        for (const roleData of DEFAULT_ROLES) {
            const existing = await db.query.roles.findFirst({ where: eq(roles.name, roleData.name) });
            
            if (existing) {
                const [updated] = await db.update(roles).set({
                    displayName: roleData.displayName, description: roleData.description,
                    permissions: roleData.permissions, isSystem: roleData.isSystem,
                }).where(eq(roles.name, roleData.name)).returning();
                results.push({ ...updated, action: 'updated' });
            } else {
                const [created] = await db.insert(roles).values(roleData).returning();
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
 * GET /admin/roles/:id - Get single role
 */
adminRoutes.get('/roles/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;

        const role = await db.query.roles.findFirst({ where: eq(roles.id, id) });

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

        const existing = await db.query.roles.findFirst({ where: eq(roles.name, name) });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Role name already exists' }
            });
        }

        const [role] = await db.insert(roles).values({ name, displayName, description, permissions: permissions || [], isSystem: false }).returning();

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

        const existing = await db.query.roles.findFirst({ where: eq(roles.id, id) });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
            });
        }

        if (name && name !== existing.name) {
            const duplicate = await db.query.roles.findFirst({ where: eq(roles.name, name) });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Role name already exists' }
                });
            }
        }

        const [role] = await db.update(roles).set({
            name: name || existing.name,
            displayName: displayName || existing.displayName,
            description: description !== undefined ? description : existing.description,
            permissions: permissions || existing.permissions,
        }).where(eq(roles.id, id)).returning();

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

        const role = await db.query.roles.findFirst({ where: eq(roles.id, id) });

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

        const [{ value: userCount }] = await db.select({ value: count() }).from(users).where(eq(users.roleId, id));
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'HAS_USERS', message: 'Cannot delete role with assigned users' }
            });
        }

        await db.delete(roles).where(eq(roles.id, id));

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
 * Helper function to log activity — publishes to queue if available, else writes sync
 */
async function logActivity(
    userId: string,
    action: string,
    description: string,
    metadata?: Record<string, unknown>,
    req?: any
) {
    try {
        const payload = {
            userId,
            action,
            resource: action.split('_')[0] || 'admin',
            details: description,
            metadata: metadata || {},
            ip: req?.ip || req?.headers?.['x-forwarded-for'] || null,
            userAgent: req?.headers?.['user-agent'] || null,
        };

        // Try async queue first; fall back to synchronous DB write
        const queued = isRabbitMQConnected() && publish(QUEUES.ACTIVITY_LOG, payload as Record<string, unknown>);
        if (!queued) {
            await db.insert(activityLogs).values({
                userId,
                action,
                description,
                metadata: metadata || {},
                ip: payload.ip,
                userAgent: payload.userAgent,
            });
        }
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

        const activities = await db.query.activityLogs.findMany({
            limit: Number(limit),
            orderBy: desc(activityLogs.createdAt),
            with: { user: { columns: { id: true, name: true, email: true } } },
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

        const aConds: any[] = [];
        if (action) aConds.push(eq(activityLogs.action, String(action)));
        if (userId) aConds.push(eq(activityLogs.userId, String(userId)));
        if (dateFrom) aConds.push(gte(activityLogs.createdAt, new Date(String(dateFrom))));
        if (dateTo) aConds.push(lte(activityLogs.createdAt, new Date(String(dateTo) + 'T23:59:59.999Z')));
        if (search) {
            const s = String(search);
            aConds.push(or(ilike(activityLogs.description, `%${s}%`), ilike(activityLogs.action, `%${s}%`)));
        }
        const aWhere = aConds.length > 0 ? and(...aConds) : undefined;

        const [logs, [{ value: total }], stats] = await Promise.all([
            db.query.activityLogs.findMany({
                where: aWhere, offset: skip, limit: Number(limit),
                orderBy: desc(activityLogs.createdAt),
                with: { user: { columns: { id: true, name: true, email: true } } },
            }),
            db.select({ value: count() }).from(activityLogs).where(aWhere),
            Promise.all([
                db.select({ value: count() }).from(activityLogs).where(ilike(activityLogs.action, '%login%')),
                db.select({ value: count() }).from(activityLogs).where(ilike(activityLogs.action, '%updated%')),
                db.select({ value: count() }).from(activityLogs).where(ilike(activityLogs.action, '%failed%')),
            ])
        ]);

        res.json({
            success: true,
            data: logs,
            total,
            stats: {
                logins: stats[0][0].value,
                changes: stats[1][0].value,
                errors: stats[2][0].value,
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

        const eConds: any[] = [];
        if (action) eConds.push(eq(activityLogs.action, String(action)));
        if (userId) eConds.push(eq(activityLogs.userId, String(userId)));
        if (dateFrom) eConds.push(gte(activityLogs.createdAt, new Date(String(dateFrom))));
        if (dateTo) eConds.push(lte(activityLogs.createdAt, new Date(String(dateTo) + 'T23:59:59.999Z')));
        const eWhere = eConds.length > 0 ? and(...eConds) : undefined;

        const logs = await db.query.activityLogs.findMany({
            where: eWhere, orderBy: desc(activityLogs.createdAt), limit: 10000,
            with: { user: { columns: { name: true, email: true } } },
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
            await db.execute(sql`SELECT 1`);
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

        const user = await db.query.users.findFirst({
            where: eq(users.id, id),
            columns: { id: true, email: true, name: true, phone: true, role: true, roleId: true, branchId: true, permissions: true, isActive: true, isSuperAdmin: true, lastLoginAt: true, createdAt: true, updatedAt: true },
            with: {
                branch: { columns: { id: true, name: true, code: true } },
                roleRelation: { columns: { id: true, name: true, displayName: true, permissions: true } },
                accessibleStores: { with: { store: { columns: { id: true, name: true, code: true } } } },
            },
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

        const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        if (email && email !== existing.email) {
            const duplicate = await db.query.users.findFirst({ where: eq(users.email, email) });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Email already exists' }
                });
            }
        }

        let roleName = existing.role;
        if (roleId) {
            const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
            if (role) roleName = role.name;
        }

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (roleId !== undefined) { updateData.roleId = roleId; updateData.role = roleName; }
        if (branchId !== undefined) updateData.branchId = branchId;
        if (permissions !== undefined) updateData.permissions = permissions;
        if (isActive !== undefined) updateData.isActive = isActive;

        await db.update(users).set(updateData).where(eq(users.id, id));
        const user = await db.query.users.findFirst({
            where: eq(users.id, id),
            columns: { id: true, email: true, name: true, phone: true, role: true, isActive: true, isSuperAdmin: true, createdAt: true },
            with: { branch: { columns: { id: true, name: true } }, roleRelation: { columns: { id: true, name: true, displayName: true } } },
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

        const user = await db.query.users.findFirst({ where: eq(users.id, id) });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        await db.update(users).set({ isActive: false }).where(eq(users.id, id));

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

        const [user] = await db.update(users).set({ isSuperAdmin: Boolean(newStatus) }).where(eq(users.id, id)).returning({ id: users.id, name: users.name, email: users.email, isSuperAdmin: users.isSuperAdmin });

        const action = newStatus ? 'ເພີ່ມ Super Admin' : 'ຖອນ Super Admin';
        await logActivity(req.authUser!.userId, 'user_updated', `${action}: ${user.name}`, { targetUserId: id }, req);

        res.json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM ENUMS MANAGEMENT (Admin CRUD for dropdown values)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/enums/seed - Seed all enum values into DB from hardcoded defaults
 */
adminRoutes.post('/enums/seed', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        let inserted = 0;
        let skipped = 0;
        for (const [type, entries] of Object.entries(ENUM_SEED_DATA)) {
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                const existing = await db.query.systemEnums.findFirst({
                    where: and(eq(systemEnums.type, type), eq(systemEnums.value, e.value)),
                });
                if (!existing) {
                    await db.insert(systemEnums).values({
                        type, value: e.value, label: e.label, labelLao: e.labelLao,
                        order: i, isSystem: e.isSystem ?? true, isActive: true,
                    });
                    inserted++;
                } else {
                    skipped++;
                }
            }
        }
        res.json({ success: true, data: { inserted, skipped } });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/enums - List all enum types or a specific type
 */
adminRoutes.get('/enums', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { type } = req.query;
        const rows = await db.query.systemEnums.findMany({
            where: type ? eq(systemEnums.type, String(type)) : undefined,
            orderBy: [asc(systemEnums.type), asc(systemEnums.order), asc(systemEnums.label)],
        });

        // Return as grouped by type
        const grouped: Record<string, any[]> = {};
        for (const row of rows) {
            if (!grouped[row.type]) grouped[row.type] = [];
            grouped[row.type].push(row);
        }

        // Also return list of all types
        const types = [...new Set(rows.map(r => r.type))].sort();

        res.json({ success: true, data: { types, grouped, flat: rows } });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/enums - Create a new enum value
 */
adminRoutes.post('/enums', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { type, value, label, labelLao, order = 0, isActive = true } = req.body;
        if (!type || !value || !label) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'type, value, label are required' } });
        }
        const existing = await db.query.systemEnums.findFirst({
            where: and(eq(systemEnums.type, String(type)), eq(systemEnums.value, String(value))),
        });
        if (existing) {
            return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Enum value already exists for this type' } });
        }
        const [created] = await db.insert(systemEnums).values({
            type: String(type), value: String(value), label: String(label),
            labelLao: labelLao ? String(labelLao) : undefined,
            order: Number(order), isActive: Boolean(isActive), isSystem: false,
        }).returning();
        res.status(201).json({ success: true, data: created });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/enums/:id - Update an enum value
 */
adminRoutes.put('/enums/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { label, labelLao, order, isActive } = req.body;
        const existing = await db.query.systemEnums.findFirst({ where: eq(systemEnums.id, id) });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Enum not found' } });
        }
        const [updated] = await db.update(systemEnums).set({
            ...(label !== undefined && { label: String(label) }),
            ...(labelLao !== undefined && { labelLao: String(labelLao) }),
            ...(order !== undefined && { order: Number(order) }),
            ...(isActive !== undefined && { isActive: Boolean(isActive) }),
            updatedAt: new Date(),
        }).where(eq(systemEnums.id, id)).returning();
        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /admin/enums/:id - Delete a non-system enum value
 */
adminRoutes.delete('/enums/:id', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const existing = await db.query.systemEnums.findFirst({ where: eq(systemEnums.id, id) });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Enum not found' } });
        }
        if (existing.isSystem) {
            return res.status(400).json({ success: false, error: { code: 'SYSTEM_ENUM', message: 'System enums cannot be deleted. Disable them instead.' } });
        }
        await db.delete(systemEnums).where(eq(systemEnums.id, id));
        res.json({ success: true, data: { message: 'Deleted successfully' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT PERMISSION GROUPS (CRUD structure matching ALL_PERMISSIONS)
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PERMISSION_GROUPS = [
    {
        key: "dashboard", label: "ແຜງຄວບຄຸມ", icon: "LayoutDashboard", color: "from-indigo-500 to-blue-500",
        permissions: [
            { key: "dashboard:view", label: "ເບິ່ງແຜງຄວບຄຸມ" },
        ]
    },
    {
        key: "pos", label: "ຂາຍໜ້າຮ້ານ (POS)", icon: "ShoppingCart", color: "from-emerald-500 to-green-500",
        permissions: [
            { key: "pos:access", label: "ເຂົ້າໃຊ້ POS" },
            { key: "pos:discount", label: "ໃຫ້ສ່ວນຫຼຸດ" },
            { key: "pos:void", label: "ຍົກເລີກລາຍການ" },
            { key: "pos:credit", label: "ຂາຍສິນເຊື່ອ" },
        ]
    },
    {
        key: "sales", label: "ການຂາຍ", icon: "ShoppingBag", color: "from-teal-500 to-emerald-500",
        permissions: [
            { key: "sales:view", label: "ເບິ່ງການຂາຍ" },
            { key: "sales:create", label: "ສ້າງການຂາຍ" },
            { key: "sales:update", label: "ແກ້ໄຂການຂາຍ" },
            { key: "sales:delete", label: "ລຶບການຂາຍ" },
            { key: "sales:void", label: "ຍົກເລີກບິນ" },
            { key: "sales:refund", label: "ຄືນເງິນ" },
        ]
    },
    {
        key: "products", label: "ສິນຄ້າ", icon: "Package", color: "from-blue-500 to-cyan-500",
        permissions: [
            { key: "products:view", label: "ເບິ່ງສິນຄ້າ" },
            { key: "products:create", label: "ເພີ່ມສິນຄ້າ" },
            { key: "products:update", label: "ແກ້ໄຂສິນຄ້າ" },
            { key: "products:delete", label: "ລຶບສິນຄ້າ" },
        ]
    },
    {
        key: "categories", label: "ໝວດໝູ່", icon: "Tags", color: "from-sky-500 to-blue-500",
        permissions: [
            { key: "categories:view", label: "ເບິ່ງໝວດໝູ່" },
            { key: "categories:create", label: "ເພີ່ມໝວດໝູ່" },
            { key: "categories:update", label: "ແກ້ໄຂໝວດໝູ່" },
            { key: "categories:delete", label: "ລຶບໝວດໝູ່" },
        ]
    },
    {
        key: "inventory", label: "ສາງສິນຄ້າ", icon: "Boxes", color: "from-amber-500 to-orange-500",
        permissions: [
            { key: "inventory:view", label: "ເບິ່ງສາງ" },
            { key: "inventory:create", label: "ນຳເຂົ້າ/ນຳອອກ" },
            { key: "inventory:update", label: "ແກ້ໄຂສາງ" },
            { key: "inventory:delete", label: "ລຶບສາງ" },
            { key: "inventory:transfer", label: "ໂອນຍ້າຍສິນຄ້າ" },
            { key: "inventory:adjust", label: "ປັບປ່ຽນສະຕ໋ອກ" },
            { key: "inventory:stockin", label: "ນຳເຂົ້າສິນຄ້າ" },
            { key: "inventory:stockout", label: "ນຳອອກສິນຄ້າ" },
        ]
    },
    {
        key: "customers", label: "ລູກຄ້າ (CRM)", icon: "Users", color: "from-rose-500 to-pink-500",
        permissions: [
            { key: "customers:view", label: "ເບິ່ງລູກຄ້າ" },
            { key: "customers:create", label: "ເພີ່ມລູກຄ້າ" },
            { key: "customers:update", label: "ແກ້ໄຂລູກຄ້າ" },
            { key: "customers:delete", label: "ລຶບລູກຄ້າ" },
        ]
    },
    {
        key: "promotions", label: "ໂປຣໂມຊັ່ນ", icon: "Gift", color: "from-fuchsia-500 to-purple-500",
        permissions: [
            { key: "promotions:view", label: "ເບິ່ງໂປຣໂມຊັ່ນ" },
            { key: "promotions:create", label: "ສ້າງໂປຣໂມຊັ່ນ" },
            { key: "promotions:update", label: "ແກ້ໄຂໂປຣໂມຊັ່ນ" },
            { key: "promotions:delete", label: "ລຶບໂປຣໂມຊັ່ນ" },
        ]
    },
    {
        key: "payments", label: "ການຊຳລະ", icon: "Wallet", color: "from-lime-500 to-green-500",
        permissions: [
            { key: "payments:view", label: "ເບິ່ງການຊຳລະ" },
            { key: "payments:create", label: "ສ້າງການຊຳລະ" },
            { key: "payments:void", label: "ຍົກເລີກການຊຳລະ" },
            { key: "payments:settle", label: "ປິດບັນຊີ" },
            { key: "payments:manage", label: "ຈັດການການຊຳລະ" },
        ]
    },
    {
        key: "documents", label: "ເອກະສານ", icon: "FileText", color: "from-cyan-500 to-teal-500",
        permissions: [
            { key: "documents:view", label: "ເບິ່ງເອກະສານ" },
            { key: "documents:create", label: "ສ້າງເອກະສານ" },
            { key: "documents:update", label: "ແກ້ໄຂເອກະສານ" },
            { key: "documents:delete", label: "ລຶບເອກະສານ" },
        ]
    },
    {
        key: "reports", label: "ລາຍງານ", icon: "BarChart3", color: "from-violet-500 to-purple-500",
        permissions: [
            { key: "reports:view", label: "ເບິ່ງລາຍງານ" },
            { key: "reports:sales", label: "ລາຍງານຂາຍ" },
            { key: "reports:inventory", label: "ລາຍງານສາງ" },
            { key: "reports:financial", label: "ລາຍງານການເງິນ" },
            { key: "reports:staff", label: "ລາຍງານພະນັກງານ" },
        ]
    },
    {
        key: "staff", label: "ພະນັກງານ", icon: "UserCog", color: "from-orange-500 to-red-500",
        permissions: [
            { key: "staff:view", label: "ເບິ່ງພະນັກງານ" },
            { key: "staff:create", label: "ເພີ່ມພະນັກງານ" },
            { key: "staff:update", label: "ແກ້ໄຂພະນັກງານ" },
            { key: "staff:delete", label: "ລຶບພະນັກງານ" },
        ]
    },
    {
        key: "roles", label: "ບົດບາດ", icon: "Key", color: "from-yellow-500 to-amber-500",
        permissions: [
            { key: "roles:view", label: "ເບິ່ງບົດບາດ" },
            { key: "roles:create", label: "ສ້າງບົດບາດ" },
            { key: "roles:update", label: "ແກ້ໄຂບົດບາດ" },
            { key: "roles:delete", label: "ລຶບບົດບາດ" },
        ]
    },
    {
        key: "branches", label: "ສາຂາ", icon: "Building2", color: "from-stone-500 to-zinc-500",
        permissions: [
            { key: "branches:view", label: "ເບິ່ງສາຂາ" },
            { key: "branches:create", label: "ສ້າງສາຂາ" },
            { key: "branches:update", label: "ແກ້ໄຂສາຂາ" },
            { key: "branches:delete", label: "ລຶບສາຂາ" },
        ]
    },
    {
        key: "stores", label: "ຮ້ານຄ້າ", icon: "Store", color: "from-emerald-500 to-teal-500",
        permissions: [
            { key: "stores:view", label: "ເບິ່ງຮ້ານຄ້າ" },
            { key: "stores:create", label: "ສ້າງຮ້ານຄ້າ" },
            { key: "stores:update", label: "ແກ້ໄຂຮ້ານຄ້າ" },
            { key: "stores:delete", label: "ລຶບຮ້ານຄ້າ" },
        ]
    },
    {
        key: "settings", label: "ຕັ້ງຄ່າ", icon: "Settings", color: "from-gray-500 to-slate-500",
        permissions: [
            { key: "settings:view", label: "ເບິ່ງຕັ້ງຄ່າ" },
            { key: "settings:update", label: "ແກ້ໄຂຕັ້ງຄ່າ" },
        ]
    },
    {
        key: "restaurant", label: "ຮ້ານອາຫານ", icon: "UtensilsCrossed", color: "from-pink-500 to-rose-500",
        permissions: [
            { key: "restaurant:view", label: "ເບິ່ງຮ້ານອາຫານ" },
            { key: "restaurant:manage", label: "ຈັດການຮ້ານອາຫານ" },
            { key: "tables:create", label: "ສ້າງໂຕະ" },
            { key: "tables:update", label: "ແກ້ໄຂໂຕະ" },
            { key: "tables:delete", label: "ລຶບໂຕະ" },
        ]
    },
];

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
        requiredPermission: "dashboard:view",
        children: []
    },
    {
        key: "sales",
        label: "Sales",
        labelLao: "ຂາຍ",
        icon: "ShoppingCart",
        requiredPermission: "sales:create",
        children: [
            { key: "sales.pos", label: "POS", labelLao: "ໜ້າຂາຍ POS", icon: "ShoppingCart", path: "/pos", requiredPermission: "sales:create" },
            { key: "sales.pos_fullscreen", label: "POS Fullscreen", labelLao: "ໜ້າຂາຍເຕັມຈໍ", icon: "Monitor", path: "/pos?mode=fullscreen", requiredPermission: "sales:create" },
            { key: "sales.credit", label: "Credit Sales", labelLao: "ຂາຍສິນເຊື່ອ", icon: "CreditCard", path: "/pos/credit", requiredPermission: "sales:create" },
            { key: "sales.held", label: "Held Orders", labelLao: "ບິນທີ່ພັກໄວ້", icon: "ClipboardList", path: "/pos/held", requiredPermission: "sales:create" },
            { key: "sales.display", label: "Customer Display", labelLao: "ຈໍລູກຄ້າ", icon: "Monitor", path: "/display/customer", requiredPermission: "sales:view" },
        ]
    },
    {
        key: "products",
        label: "Products",
        labelLao: "ສິນຄ້າ",
        icon: "Package",
        requiredPermission: "products:view",
        children: [
            { key: "products.list", label: "Product List", labelLao: "ລາຍການສິນຄ້າ", icon: "Package", path: "/products", requiredPermission: "products:view" },
            { key: "products.categories", label: "Categories", labelLao: "ໝວດໝູ່", icon: "Tags", path: "/categories", requiredPermission: "categories:view" },
            { key: "products.barcode", label: "Barcode/QR", labelLao: "Barcode / QR Code", icon: "Barcode", path: "/barcode", requiredPermission: "products:view" },
            { key: "products.sku", label: "SKU/Variants", labelLao: "SKU / ຕົວເລືອກ", icon: "Layers", path: "/products/sku", requiredPermission: "products:view" },
            { key: "products.pricing", label: "Pricing", labelLao: "ລະດັບລາຄາ", icon: "DollarSign", path: "/products/pricing", requiredPermission: "products:update" },
        ]
    },
    {
        key: "inventory",
        label: "Inventory",
        labelLao: "ສາງ",
        icon: "Boxes",
        requiredPermission: "inventory:view",
        children: [
            { key: "inventory.stock", label: "Stock", labelLao: "ສາງສິນຄ້າ", icon: "Boxes", path: "/inventory", requiredPermission: "inventory:view" },
            { key: "inventory.stockin", label: "Stock In", labelLao: "ນຳເຂົ້າສິນຄ້າ", icon: "TrendingUp", path: "/inventory/stockin", requiredPermission: "inventory:create" },
            { key: "inventory.stockout", label: "Stock Out", labelLao: "ນຳອອກສິນຄ້າ", icon: "TrendingDown", path: "/inventory/stockout", requiredPermission: "inventory:create" },
            { key: "inventory.adjust", label: "Adjust", labelLao: "ປັບປ່ຽນສະຕ໋ອກ", icon: "Scale", path: "/inventory/adjust", requiredPermission: "inventory:update" },
            { key: "inventory.transfer", label: "Transfer", labelLao: "ໂອນຍ້າຍສິນຄ້າ", icon: "ArrowRightLeft", path: "/inventory/transfer", requiredPermission: "inventory:transfer" },
            { key: "inventory.count", label: "Stock Count", labelLao: "ກວດນັບສະຕ໋ອກ", icon: "ClipboardCheck", path: "/inventory/count", requiredPermission: "inventory:adjust" },
            { key: "inventory.po", label: "Purchase Orders", labelLao: "ສັ່ງຊື້ (PO)", icon: "ClipboardList", path: "/inventory/purchase-orders", requiredPermission: "inventory:create" },
            { key: "inventory.vendors", label: "Vendors", labelLao: "ຜູ້ສະໜອງ", icon: "Truck", path: "/inventory/vendors", requiredPermission: "inventory:view" },
            { key: "inventory.expiry", label: "Expiry", labelLao: "ວັນໝົດອາຍຸ", icon: "CalendarClock", path: "/inventory/expiry", requiredPermission: "inventory:view" },
            { key: "inventory.outofstock", label: "Out of Stock", labelLao: "ສິນຄ້າໝົດສະຕ໋ອກ", icon: "PackageX", path: "/inventory/out-of-stock", requiredPermission: "inventory:view" },
        ]
    },
    {
        key: "restaurant",
        label: "Restaurant",
        labelLao: "ຮ້ານອາຫານ",
        icon: "UtensilsCrossed",
        requiredPermission: "restaurant:view",
        children: [
            { key: "restaurant.tables", label: "Tables", labelLao: "ໂຕະ", icon: "Table", path: "/restaurant/tables", requiredPermission: "restaurant:view" },
            { key: "restaurant.orders", label: "Orders", labelLao: "ອໍເດີ", icon: "ClipboardList", path: "/restaurant/orders", requiredPermission: "restaurant:view" },
            { key: "restaurant.kitchen", label: "Kitchen (KDS)", labelLao: "ຄົວ (KDS)", icon: "ChefHat", path: "/restaurant/kitchen", requiredPermission: "restaurant:manage" },
            { key: "restaurant.reservations", label: "Reservations", labelLao: "ຈອງໂຕະ", icon: "CalendarClock", path: "/restaurant/reservations", requiredPermission: "restaurant:view" },
            { key: "restaurant.emenu", label: "e-Menu", labelLao: "e-Menu", icon: "QrCode", path: "/restaurant/e-menu", requiredPermission: "restaurant:view" },
        ]
    },
    {
        key: "promotions",
        label: "Promotions",
        labelLao: "ໂປຣໂມຊັ່ນ",
        icon: "Gift",
        requiredPermission: "promotions:view",
        children: [
            { key: "promotions.list", label: "Promotions", labelLao: "ໂປຣໂມຊັ່ນ", icon: "Gift", path: "/promotions", requiredPermission: "promotions:view" },
            { key: "promotions.coupons", label: "Coupons", labelLao: "ຄູປອງ", icon: "TicketPercent", path: "/promotions/coupons", requiredPermission: "promotions:view" },
            { key: "promotions.discounts", label: "Discounts", labelLao: "ສ່ວນຫຼຸດ", icon: "Percent", path: "/promotions/discounts", requiredPermission: "promotions:view" },
        ]
    },
    {
        key: "customers",
        label: "Customers (CRM)",
        labelLao: "ລູກຄ້າ (CRM)",
        icon: "Users",
        requiredPermission: "customers:view",
        children: [
            { key: "customers.list", label: "Customers", labelLao: "ລູກຄ້າ", icon: "Users", path: "/customers", requiredPermission: "customers:view" },
            { key: "customers.members", label: "Members", labelLao: "ສະມາຊິກ", icon: "Crown", path: "/customers/members", requiredPermission: "customers:view" },
            { key: "customers.points", label: "Points", labelLao: "ຄະແນນສະສົມ", icon: "Star", path: "/customers/points", requiredPermission: "customers:view" },
            { key: "customers.loyalty", label: "Loyalty Program", labelLao: "ໂປຣແກຣມ Loyalty", icon: "Heart", path: "/customers/loyalty", requiredPermission: "customers:update" },
        ]
    },
    {
        key: "payments",
        label: "Payments",
        labelLao: "ການຊຳລະ",
        icon: "Wallet",
        requiredPermission: "payments:view",
        children: [
            { key: "payments.methods", label: "Payment Methods", labelLao: "ວິທີຊຳລະ", icon: "CreditCard", path: "/payments", requiredPermission: "payments:view" },
            { key: "payments.transactions", label: "Transactions", labelLao: "ລາຍການຊຳລະ", icon: "Receipt", path: "/payments/transactions", requiredPermission: "payments:view" },
            { key: "payments.settlements", label: "Settlements", labelLao: "ປິດບັນຊີ", icon: "DollarSign", path: "/payments/settlements", requiredPermission: "payments:manage" },
        ]
    },
    {
        key: "documents",
        label: "Documents",
        labelLao: "ເອກະສານ",
        icon: "FileText",
        requiredPermission: "documents:view",
        children: [
            { key: "documents.receipts", label: "Receipts", labelLao: "ໃບບິນ", icon: "Receipt", path: "/documents", requiredPermission: "documents:view" },
            { key: "documents.design", label: "Receipt Design", labelLao: "ອອກແບບໃບບິນ", icon: "Printer", path: "/documents/design", requiredPermission: "settings:update" },
            { key: "documents.invoices", label: "Invoices", labelLao: "ໃບແຈ້ງໜີ້", icon: "FileText", path: "/documents/invoices", requiredPermission: "documents:view" },
            { key: "documents.tax", label: "Tax Invoices", labelLao: "ໃບກຳກັບພາສີ", icon: "FileSpreadsheet", path: "/documents/tax-invoices", requiredPermission: "documents:view" },
        ]
    },
    {
        key: "reports",
        label: "Reports",
        labelLao: "ລາຍງານ",
        icon: "BarChart3",
        requiredPermission: "reports:view",
        children: [
            { key: "reports.sales", label: "Sales Report", labelLao: "ລາຍງານການຂາຍ", icon: "BarChart3", path: "/reports", requiredPermission: "reports:view" },
            { key: "reports.products", label: "Product Report", labelLao: "ລາຍງານສິນຄ້າ", icon: "Package", path: "/reports/products", requiredPermission: "reports:view" },
            { key: "reports.inventory", label: "Inventory Report", labelLao: "ລາຍງານສາງ", icon: "Boxes", path: "/reports/inventory", requiredPermission: "reports:view" },
            { key: "reports.financial", label: "Financial Report", labelLao: "ລາຍງານການເງິນ", icon: "DollarSign", path: "/reports/financial", requiredPermission: "reports:view" },
            { key: "reports.staff", label: "Staff Report", labelLao: "ລາຍງານພະນັກງານ", icon: "UserCog", path: "/reports/staff", requiredPermission: "reports:view" },
            { key: "reports.customers", label: "Customer Report", labelLao: "ລາຍງານລູກຄ້າ", icon: "Users", path: "/reports/customers", requiredPermission: "reports:view" },
        ]
    },
    {
        key: "management",
        label: "Management",
        labelLao: "ຈັດການ",
        icon: "Building2",
        requiredPermission: "staff:view",
        children: [
            { key: "management.branches", label: "Branches", labelLao: "ສາຂາ", icon: "Building2", path: "/branches", requiredPermission: "branches:view" },
            { key: "management.stores", label: "Stores", labelLao: "ຮ້ານຄ້າ", icon: "Store", path: "/management/stores", requiredPermission: "stores:view" },
            { key: "management.staff", label: "Staff", labelLao: "ພະນັກງານ", icon: "Users", path: "/staff", requiredPermission: "staff:view" },
            { key: "management.roles", label: "Roles", labelLao: "ບົດບາດ", icon: "Key", path: "/staff/roles", requiredPermission: "roles:view" },
            { key: "management.shifts", label: "Shifts", labelLao: "ກະວຽກ", icon: "Clock", path: "/staff/shifts", requiredPermission: "staff:view" },
            { key: "management.registers", label: "Cash Registers", labelLao: "ເຄື່ອງຄິດເງິນ", icon: "Monitor", path: "/management/cashregisters", requiredPermission: "settings:view" },
        ]
    },
    {
        key: "settings",
        label: "Settings",
        labelLao: "ຕັ້ງຄ່າ",
        icon: "Settings",
        requiredPermission: "settings:view",
        children: [
            { key: "settings.general", label: "General", labelLao: "ທົ່ວໄປ", icon: "Settings", path: "/settings", requiredPermission: "settings:view" },
            { key: "settings.display", label: "Display", labelLao: "ຈໍສະແດງ", icon: "Monitor", path: "/settings/display", requiredPermission: "settings:view" },
            { key: "settings.receipt", label: "Receipt Settings", labelLao: "ຕັ້ງຄ່າໃບບິນ", icon: "Receipt", path: "/settings/receipt", requiredPermission: "settings:update" },
            { key: "settings.payment", label: "Payment Settings", labelLao: "ຕັ້ງຄ່າການຊຳລະ", icon: "CreditCard", path: "/settings/payments", requiredPermission: "settings:update" },
            { key: "settings.printer", label: "Printer Settings", labelLao: "ຕັ້ງຄ່າເຄື່ອງພິມ", icon: "Printer", path: "/settings/printers", requiredPermission: "settings:update" },
            { key: "settings.tax", label: "Tax Settings", labelLao: "ຕັ້ງຄ່າອາກອນ", icon: "Percent", path: "/settings/tax", requiredPermission: "settings:update" },
            { key: "settings.notifications", label: "Notifications", labelLao: "ການແຈ້ງເຕືອນ", icon: "Bell", path: "/settings/notifications", requiredPermission: "settings:view" },
            { key: "settings.integrations", label: "Integrations", labelLao: "ເຊື່ອມຕໍ່", icon: "Plug", path: "/settings/integrations", requiredPermission: "settings:update" },
        ]
    },
    {
        key: "super-admin",
        label: "Super Admin",
        labelLao: "Super Admin",
        icon: "ShieldCheck",
        requiredPermission: "*",
        children: [
            { key: "super-admin.dashboard", label: "Admin Dashboard", labelLao: "ແຜງຄວບຄຸມ", icon: "Shield", path: "/admin", requiredPermission: "*" },
            { key: "super-admin.requests", label: "Store Requests", labelLao: "ຄຳຂໍເປີດຮ້ານ", icon: "FileCheck", path: "/admin/requests", requiredPermission: "*" },
            { key: "super-admin.branches", label: "All Branches", labelLao: "ຈັດການສາຂາ", icon: "Building2", path: "/admin/branches", requiredPermission: "*" },
            { key: "super-admin.users", label: "All Users", labelLao: "ຈັດການຜູ້ໃຊ້", icon: "Users", path: "/admin/users", requiredPermission: "*" },
            { key: "super-admin.roles", label: "System Roles", labelLao: "ຈັດການບົດບາດ", icon: "Key", path: "/admin/roles", requiredPermission: "*" },
            { key: "super-admin.permissions", label: "Permissions", labelLao: "ຈັດການສິດ", icon: "Shield", path: "/admin/permissions", requiredPermission: "*" },
            { key: "super-admin.audit", label: "Audit Log", labelLao: "ປະຫວັດການໃຊ້ງານ", icon: "History", path: "/admin/audit", requiredPermission: "*" },
        ]
    },
    {
        key: "help",
        label: "Help",
        labelLao: "ຊ່ວຍເຫຼືອ",
        icon: "HelpCircle",
        path: "/help",
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
        permissions: ["*"],
        isSystem: true
    },
    {
        name: "admin",
        displayName: "Admin",
        description: "ຜູ້ດູແລລະບົບ - ຈັດການຮ້ານ ແລະ ພະນັກງານ",
        permissions: [
            "dashboard:view",
            "sales:view", "sales:create", "sales:update", "sales:delete", "sales:void", "sales:refund",
            "pos:access", "pos:discount", "pos:void", "pos:credit",
            "products:view", "products:create", "products:update", "products:delete",
            "categories:view", "categories:create", "categories:update", "categories:delete",
            "inventory:view", "inventory:create", "inventory:update", "inventory:delete", "inventory:transfer", "inventory:adjust", "inventory:stockin", "inventory:stockout",
            "promotions:view", "promotions:create", "promotions:update", "promotions:delete",
            "customers:view", "customers:create", "customers:update", "customers:delete",
            "payments:view", "payments:create", "payments:void", "payments:settle", "payments:manage",
            "documents:view", "documents:create", "documents:update", "documents:delete",
            "reports:view", "reports:sales", "reports:inventory", "reports:financial", "reports:staff",
            "staff:view", "staff:create", "staff:update", "staff:delete",
            "roles:view", "roles:create", "roles:update", "roles:delete",
            "branches:view", "branches:create", "branches:update", "branches:delete",
            "stores:view", "stores:create", "stores:update", "stores:delete",
            "settings:view", "settings:update",
            "restaurant:view", "restaurant:manage", "tables:create", "tables:update", "tables:delete",
        ],
        isSystem: true
    },
    {
        name: "branch_admin",
        displayName: "Branch Admin",
        description: "ຜູ້ຈັດການສາຂາ - ຈັດການສາຂາ ແລະ ຮ້ານໃນສາຂາ",
        permissions: [
            "dashboard:view",
            "sales:view", "sales:create", "sales:update", "pos:access", "pos:discount", "pos:credit",
            "products:view", "products:create", "products:update",
            "categories:view", "categories:create", "categories:update",
            "inventory:view", "inventory:create", "inventory:update", "inventory:transfer", "inventory:adjust", "inventory:stockin", "inventory:stockout",
            "promotions:view", "promotions:create",
            "customers:view", "customers:create", "customers:update",
            "payments:view", "payments:create", "payments:manage",
            "documents:view", "documents:create",
            "reports:view", "reports:sales", "reports:inventory",
            "staff:view", "staff:create", "staff:update",
            "roles:view",
            "stores:view", "stores:update",
            "settings:view", "settings:update",
            "restaurant:view", "restaurant:manage", "tables:create", "tables:update",
        ],
        isSystem: true
    },
    {
        name: "store_owner",
        displayName: "Store Owner",
        description: "ເຈົ້າຂອງຮ້ານ - ສິດຄວບຄຸມຮ້ານທັງໝົດ",
        permissions: [
            "dashboard:view",
            "sales:view", "sales:create", "sales:update", "sales:delete", "sales:void", "sales:refund",
            "pos:access", "pos:discount", "pos:void", "pos:credit",
            "products:view", "products:create", "products:update", "products:delete",
            "categories:view", "categories:create", "categories:update", "categories:delete",
            "inventory:view", "inventory:create", "inventory:update", "inventory:delete", "inventory:transfer", "inventory:adjust", "inventory:stockin", "inventory:stockout",
            "promotions:view", "promotions:create", "promotions:update", "promotions:delete",
            "customers:view", "customers:create", "customers:update", "customers:delete",
            "payments:view", "payments:create", "payments:void", "payments:settle", "payments:manage",
            "documents:view", "documents:create", "documents:update", "documents:delete",
            "reports:view", "reports:sales", "reports:inventory", "reports:financial", "reports:staff",
            "staff:view", "staff:create", "staff:update", "staff:delete",
            "roles:view", "roles:create", "roles:update", "roles:delete",
            "stores:view", "stores:update",
            "settings:view", "settings:update",
            "restaurant:view", "restaurant:manage", "tables:create", "tables:update", "tables:delete",
        ],
        isSystem: true
    },
    {
        name: "store_manager",
        displayName: "Store Manager",
        description: "ຜູ້ຈັດການຮ້ານ - ຈັດການຮ້ານດຽວ",
        permissions: [
            "dashboard:view",
            "sales:view", "sales:create", "sales:update", "pos:access", "pos:discount", "pos:credit",
            "products:view", "products:create", "products:update",
            "categories:view", "categories:create",
            "inventory:view", "inventory:create", "inventory:update", "inventory:stockin", "inventory:stockout",
            "promotions:view", "promotions:create",
            "customers:view", "customers:create", "customers:update",
            "payments:view", "payments:create",
            "documents:view", "documents:create",
            "reports:view", "reports:sales",
            "staff:view", "staff:create", "staff:update",
            "roles:view",
            "settings:view",
        ],
        isSystem: true
    },
    {
        name: "cashier",
        displayName: "Cashier",
        description: "ພະນັກງານຂາຍ - ຂາຍສິນຄ້າ ແລະ ຮັບເງິນ",
        permissions: [
            "dashboard:view",
            "sales:view", "sales:create", "pos:access",
            "products:view",
            "customers:view",
            "payments:view", "payments:create",
            "documents:view",
        ],
        isSystem: true
    },
    {
        name: "inventory_staff",
        displayName: "Inventory Staff",
        description: "ພະນັກງານສາງ - ຈັດການສາງສິນຄ້າ",
        permissions: [
            "dashboard:view",
            "products:view", "categories:view",
            "inventory:view", "inventory:create", "inventory:update", "inventory:adjust", "inventory:transfer", "inventory:stockin", "inventory:stockout",
            "reports:view", "reports:inventory",
        ],
        isSystem: true
    },
    {
        name: "kitchen_staff",
        displayName: "Kitchen Staff",
        description: "ພະນັກງານຄົວ - ເບິ່ງອໍເດີ ແລະ ຈັດການຄົວ",
        permissions: [
            "restaurant:view", "restaurant:manage",
        ],
        isSystem: true
    },
    {
        name: "waiter",
        displayName: "Waiter",
        description: "ພະນັກງານເສີບ - ຮັບອໍເດີ ແລະ ຈັດການໂຕະ",
        permissions: [
            "restaurant:view", "tables:create", "tables:update",
        ],
        isSystem: true
    }
];

/**
 * Default Rules: Each rule groups sidebar routes + API permissions for a module
 */
const DEFAULT_RULES = [
    {
        name: "dashboard",
        displayName: "Dashboard",
        description: "ໜ້າ Dashboard ຫຼັກ",
        module: "dashboard",
        icon: "LayoutDashboard",
        routes: ["/dashboard"],
        permissions: ["dashboard:view"],
        order: 0,
        isSystem: true,
    },
    {
        name: "sales",
        displayName: "ການຂາຍ (POS)",
        description: "ໜ້າຂາຍ POS, ຂາຍສິນເຊື່ອ, ບິນພັກໄວ້",
        module: "sales",
        icon: "ShoppingCart",
        routes: ["/pos", "/pos/credit", "/pos/held"],
        permissions: ["sales:view", "sales:create", "sales:update", "sales:delete", "sales:void", "sales:refund", "pos:access", "pos:discount", "pos:void", "pos:credit"],
        order: 1,
        isSystem: true,
    },
    {
        name: "products",
        displayName: "ການຈັດການສິນຄ້າ",
        description: "ສິນຄ້າ, ໝວດໝູ່, Barcode, SKU, ລະດັບລາຄາ",
        module: "products",
        icon: "Package",
        routes: ["/products", "/products/sku", "/products/pricing", "/categories", "/barcode"],
        permissions: ["products:view", "products:create", "products:update", "products:delete", "categories:view", "categories:create", "categories:update", "categories:delete"],
        order: 2,
        isSystem: true,
    },
    {
        name: "inventory",
        displayName: "ການຈັດການສາງ",
        description: "ສາງ, ນຳເຂົ້າ/ອອກ, ປັບ, ໂອນ, ກວດນັບ, PO, ຜູ້ສະໜອງ",
        module: "inventory",
        icon: "Boxes",
        routes: ["/inventory", "/inventory/stockin", "/inventory/stockout", "/inventory/adjust", "/inventory/transfer", "/inventory/count", "/inventory/purchase-orders", "/inventory/vendors", "/inventory/expiry", "/inventory/out-of-stock"],
        permissions: ["inventory:view", "inventory:create", "inventory:update", "inventory:delete", "inventory:transfer", "inventory:adjust", "inventory:stockin", "inventory:stockout"],
        order: 3,
        isSystem: true,
    },
    {
        name: "restaurant",
        displayName: "ຮ້ານອາຫານ",
        description: "ໂຕະ, ອໍເດີ, ຄົວ KDS, ຈອງໂຕະ, e-Menu",
        module: "restaurant",
        icon: "UtensilsCrossed",
        routes: ["/restaurant/tables", "/restaurant/orders", "/restaurant/kitchen", "/restaurant/reservations", "/restaurant/e-menu"],
        permissions: ["restaurant:view", "restaurant:manage", "tables:create", "tables:update", "tables:delete"],
        order: 4,
        isSystem: true,
    },
    {
        name: "promotions",
        displayName: "ໂປຣໂມຊັ່ນ",
        description: "ໂປຣໂມຊັ່ນ, ຄູປອງ, ສ່ວນຫຼຸດ",
        module: "promotions",
        icon: "Gift",
        routes: ["/promotions", "/promotions/coupons", "/promotions/discounts"],
        permissions: ["promotions:view", "promotions:create", "promotions:update", "promotions:delete"],
        order: 5,
        isSystem: true,
    },
    {
        name: "customers",
        displayName: "ລູກຄ້າ (CRM)",
        description: "ລູກຄ້າ, ສະມາຊິກ, ຄະແນນ, Loyalty",
        module: "customers",
        icon: "Users",
        routes: ["/customers", "/customers/members", "/customers/points", "/customers/loyalty"],
        permissions: ["customers:view", "customers:create", "customers:update", "customers:delete"],
        order: 6,
        isSystem: true,
    },
    {
        name: "payments",
        displayName: "ການຊຳລະ",
        description: "ວິທີຊຳລະ, ລາຍການ, ປິດບັນຊີ",
        module: "payments",
        icon: "Wallet",
        routes: ["/payments", "/payments/transactions", "/payments/settlements"],
        permissions: ["payments:view", "payments:create", "payments:void", "payments:settle", "payments:manage"],
        order: 7,
        isSystem: true,
    },
    {
        name: "documents",
        displayName: "ເອກະສານ",
        description: "ໃບບິນ, ອອກແບບໃບບິນ, ໃບແຈ້ງໜີ້, ໃບກຳກັບພາສີ",
        module: "documents",
        icon: "FileText",
        routes: ["/documents", "/documents/design", "/documents/invoices", "/documents/tax-invoices"],
        permissions: ["documents:view", "documents:create", "documents:update", "documents:delete"],
        order: 8,
        isSystem: true,
    },
    {
        name: "reports",
        displayName: "ລາຍງານ",
        description: "ລາຍງານການຂາຍ, ສິນຄ້າ, ສາງ, ການເງິນ, ພະນັກງານ, ລູກຄ້າ",
        module: "reports",
        icon: "BarChart3",
        routes: ["/reports", "/reports/products", "/reports/inventory", "/reports/financial", "/reports/staff", "/reports/customers"],
        permissions: ["reports:view", "reports:sales", "reports:inventory", "reports:financial", "reports:staff"],
        order: 9,
        isSystem: true,
    },
    {
        name: "management.stores",
        displayName: "ຈັດການຮ້ານ/ສາຂາ",
        description: "ຮ້ານ, ສາຂາ, ຄຳຂໍເປີດຮ້ານ",
        module: "management.stores",
        icon: "Store",
        routes: ["/branches", "/management/stores", "/my-store", "/store-request"],
        permissions: ["branches:view", "branches:create", "branches:update", "branches:delete", "stores:view", "stores:create", "stores:update", "stores:delete"],
        order: 10,
        isSystem: true,
    },
    {
        name: "management.staff",
        displayName: "ຈັດການພະນັກງານ",
        description: "ພະນັກງານ, ກະວຽກ",
        module: "management.staff",
        icon: "UserCog",
        routes: ["/staff", "/staff/shifts", "/management/shifts"],
        permissions: ["staff:view", "staff:create", "staff:update", "staff:delete"],
        order: 11,
        isSystem: true,
    },
    {
        name: "management.roles",
        displayName: "ຈັດການບົດບາດ",
        description: "ບົດບາດ, ສິດ",
        module: "management.roles",
        icon: "Shield",
        routes: ["/staff/roles"],
        permissions: ["roles:view", "roles:create", "roles:update", "roles:delete"],
        order: 12,
        isSystem: true,
    },
    {
        name: "management.operations",
        displayName: "ຈັດການປະຈຳວັນ",
        description: "ເຄື່ອງ POS, ກະວຽກ",
        module: "management.operations",
        icon: "Monitor",
        routes: ["/management/cashregisters"],
        permissions: ["stores:view", "stores:update"],
        order: 13,
        isSystem: true,
    },
    {
        name: "settings",
        displayName: "ຕັ້ງຄ່າ",
        description: "ຕັ້ງຄ່າທົ່ວໄປ, ຈໍສະແດງ, ໃບບິນ, ພາສີ, ການຊຳລະ, ເຄື່ອງພິມ",
        module: "settings",
        icon: "Settings",
        routes: ["/settings", "/settings/display", "/settings/receipt", "/settings/tax", "/settings/payments", "/settings/printers", "/settings/notifications", "/settings/integrations"],
        permissions: ["settings:view", "settings:update"],
        order: 11,
        isSystem: true,
    },
    {
        name: "admin",
        displayName: "Super Admin",
        description: "ແຜງຄວບຄຸມລະບົບ, ຄຳຂໍເປີດຮ້ານ, ຈັດການທຸກຢ່າງ",
        module: "admin",
        icon: "ShieldCheck",
        routes: ["/admin", "/admin/requests", "/admin/branches", "/admin/users", "/admin/roles", "/admin/rules", "/admin/permissions", "/admin/audit"],
        permissions: ["*"],
        order: 12,
        isSystem: true,
    },
];

/**
 * Default Role→Rule CRUD mapping
 * { roleName: { ruleName: { read, create, update, delete } } }
 */
const DEFAULT_ROLE_RULES: Record<string, Record<string, { r: boolean; c: boolean; u: boolean; d: boolean }>> = {
    super_admin: {
        dashboard: { r: true, c: true, u: true, d: true },
        sales: { r: true, c: true, u: true, d: true },
        products: { r: true, c: true, u: true, d: true },
        inventory: { r: true, c: true, u: true, d: true },
        restaurant: { r: true, c: true, u: true, d: true },
        promotions: { r: true, c: true, u: true, d: true },
        customers: { r: true, c: true, u: true, d: true },
        payments: { r: true, c: true, u: true, d: true },
        documents: { r: true, c: true, u: true, d: true },
        reports: { r: true, c: true, u: true, d: true },
        "management.stores": { r: true, c: true, u: true, d: true },
        "management.staff": { r: true, c: true, u: true, d: true },
        "management.roles": { r: true, c: true, u: true, d: true },
        "management.operations": { r: true, c: true, u: true, d: true },
        settings: { r: true, c: true, u: true, d: true },
        admin: { r: true, c: true, u: true, d: true },
    },
    admin: {
        dashboard: { r: true, c: true, u: true, d: true },
        sales: { r: true, c: true, u: true, d: true },
        products: { r: true, c: true, u: true, d: true },
        inventory: { r: true, c: true, u: true, d: true },
        restaurant: { r: true, c: true, u: true, d: true },
        promotions: { r: true, c: true, u: true, d: true },
        customers: { r: true, c: true, u: true, d: true },
        payments: { r: true, c: true, u: true, d: true },
        documents: { r: true, c: true, u: true, d: true },
        reports: { r: true, c: true, u: true, d: true },
        "management.stores": { r: true, c: true, u: true, d: true },
        "management.staff": { r: true, c: true, u: true, d: true },
        "management.roles": { r: true, c: true, u: true, d: true },
        "management.operations": { r: true, c: true, u: true, d: true },
        settings: { r: true, c: true, u: true, d: true },
    },
    store_owner: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: true },
        products: { r: true, c: true, u: true, d: true },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: true, u: true, d: true },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        "management.stores": { r: true, c: true, u: true, d: true },
        "management.staff": { r: true, c: true, u: true, d: true },
        "management.roles": { r: true, c: false, u: false, d: false },
        "management.operations": { r: true, c: true, u: true, d: false },
        settings: { r: true, c: false, u: true, d: false },
    },
    branch_admin: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: true, u: false, d: false },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        "management.stores": { r: true, c: true, u: true, d: false },
        "management.staff": { r: true, c: true, u: true, d: false },
        "management.roles": { r: true, c: false, u: false, d: false },
        "management.operations": { r: true, c: true, u: true, d: false },
        settings: { r: true, c: false, u: true, d: false },
    },
    store_manager: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: true, u: false, d: false },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        "management.stores": { r: true, c: false, u: false, d: false },
        "management.staff": { r: true, c: true, u: true, d: false },
        "management.roles": { r: false, c: false, u: false, d: false },
        "management.operations": { r: true, c: true, u: true, d: false },
        settings: { r: true, c: false, u: false, d: false },
    },
    cashier: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: false, d: false },
        products: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: false, u: false, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: false, u: false, d: false },
    },
    inventory_staff: {
        dashboard: { r: true, c: false, u: false, d: false },
        products: { r: true, c: false, u: false, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        reports: { r: true, c: false, u: false, d: false },
    },
    kitchen_staff: {
        restaurant: { r: true, c: true, u: true, d: false },
    },
    waiter: {
        restaurant: { r: true, c: true, u: true, d: false },
        sales: { r: true, c: true, u: false, d: false },
    },
};

/**
 * GET /admin/menu-permissions - Get menu structure for role assignment
 */
adminRoutes.get('/menu-permissions', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        // Try to get from database first
        const dbMenus = await db.query.menuPermissions.findMany({
            where: and(eq(menuPermissions.isActive, true), isNull(menuPermissions.parentId)),
            orderBy: asc(menuPermissions.order),
            with: { children: true },
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
        await db.delete(menuPermissions);

        for (let i = 0; i < DEFAULT_MENU_STRUCTURE.length; i++) {
            const menu = DEFAULT_MENU_STRUCTURE[i];
            const [parent] = await (db.insert(menuPermissions) as any).values({
                key: menu.key, label: menu.label, labelLao: menu.labelLao, icon: menu.icon,
                path: (menu as any).path || null, requiredPermission: menu.requiredPermission || null,
                order: i, isActive: true,
            }).returning();

            if (menu.children && menu.children.length > 0) {
                for (let j = 0; j < menu.children.length; j++) {
                    const child = menu.children[j];
                    await (db.insert(menuPermissions) as any).values({
                        key: child.key, label: child.label, labelLao: child.labelLao, icon: child.icon,
                        path: child.path, requiredPermission: child.requiredPermission || null,
                        parentId: parent.id, order: j, isActive: true,
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
 * POST /admin/rules/seed - Seed default rules + role-rule CRUD mappings
 */
adminRoutes.post('/rules/seed', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        await db.delete(roleRules);
        await db.delete(rules);

        const ruleMap: Record<string, string> = {};
        for (const ruleDef of DEFAULT_RULES) {
            const [rule] = await db.insert(rules).values({
                name: ruleDef.name, displayName: ruleDef.displayName, description: ruleDef.description || null,
                module: ruleDef.module, icon: ruleDef.icon || null, routes: ruleDef.routes,
                permissions: ruleDef.permissions, order: ruleDef.order, isSystem: ruleDef.isSystem, isActive: true,
            }).returning();
            ruleMap[ruleDef.name] = rule.id;
        }

        const allRoles = await db.query.roles.findMany();
        const roleMap: Record<string, string> = {};
        for (const role of allRoles) { roleMap[role.name] = role.id; }

        let roleRuleCount = 0;
        for (const [roleName, ruleEntries] of Object.entries(DEFAULT_ROLE_RULES)) {
            const roleId = roleMap[roleName];
            if (!roleId) continue;
            for (const [ruleName, crud] of Object.entries(ruleEntries)) {
                const ruleId = ruleMap[ruleName];
                if (!ruleId) continue;
                await db.insert(roleRules).values({ roleId, ruleId, canRead: crud.r, canCreate: crud.c, canUpdate: crud.u, canDelete: crud.d });
                roleRuleCount++;
            }
        }

        await logActivity(req.authUser!.userId, 'rules_seeded', `ສ້າງ ${Object.keys(ruleMap).length} rules, ${roleRuleCount} role-rules`, {}, req);

        // Invalidate all cached role rules so middleware picks up new mappings
        await invalidateRoleRulesCache();
        await invalidateAllUserStoreCache();

        res.json({
            success: true,
            message: `Seeded ${Object.keys(ruleMap).length} rules, ${roleRuleCount} role-rule mappings`,
            data: { rules: Object.keys(ruleMap).length, roleRules: roleRuleCount }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/rules - Get all rules
 */
adminRoutes.get('/rules', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const allRules = await db.query.rules.findMany({
            where: eq(rules.isActive, true),
            orderBy: asc(rules.order),
            with: { roleRules: { with: { role: { columns: { id: true, name: true, displayName: true } } } } },
        });
        res.json({ success: true, data: allRules });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/roles/:id/rules - Get rules for a specific role with CRUD flags
 */
adminRoutes.get('/roles/:id/rules', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const rrList = await db.query.roleRules.findMany({
            where: eq(roleRules.roleId, req.params.id),
            with: { rule: true },
        });
        res.json({ success: true, data: rrList });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/roles/:id/rules - Update rules for a specific role
 * Body: { rules: [{ ruleId, canRead, canCreate, canUpdate, canDelete }] }
 */
adminRoutes.put('/roles/:id/rules', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { id: roleId } = req.params;
        const { rules } = req.body;

        if (!Array.isArray(rules)) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'rules must be an array' } });
        }

        await db.delete(roleRules).where(eq(roleRules.roleId, roleId));

        const created = [];
        for (const rr of rules) {
            if (!rr.ruleId) continue;
            const [entry] = await db.insert(roleRules).values({
                roleId, ruleId: rr.ruleId,
                canRead: rr.canRead ?? true, canCreate: rr.canCreate ?? false,
                canUpdate: rr.canUpdate ?? false, canDelete: rr.canDelete ?? false,
            }).returning();
            created.push(entry);
        }

        const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId), columns: { name: true } });
        await logActivity(req.authUser!.userId, 'role_rules_updated', `ອັບເດດ rules ສຳລັບ ${role?.name}: ${created.length} rules`, { roleId }, req);

        // Invalidate cached rules for this role
        await invalidateRoleRulesCache(roleId);

        res.json({ success: true, data: created, message: `${created.length} rules assigned` });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/rules/matrix - Get the full CRUD matrix in one call
 * Returns: { roles, rules, matrix: { [roleId]: { [ruleId]: { r, c, u, d } } } }
 */
adminRoutes.get('/rules/matrix', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const [matrixRules, matrixRoles, matrixRoleRules] = await Promise.all([
            db.query.rules.findMany({ where: eq(rules.isActive, true), orderBy: asc(rules.order) }),
            db.query.roles.findMany({ orderBy: asc(roles.name) }),
            db.query.roleRules.findMany(),
        ]);

        const matrix: Record<string, Record<string, { r: boolean; c: boolean; u: boolean; d: boolean }>> = {};
        for (const role of matrixRoles) {
            matrix[role.id] = {};
            for (const rule of matrixRules) {
                matrix[role.id][rule.id] = { r: false, c: false, u: false, d: false };
            }
        }
        for (const rr of matrixRoleRules) {
            if (matrix[rr.roleId]?.[rr.ruleId]) {
                matrix[rr.roleId][rr.ruleId] = { r: rr.canRead, c: rr.canCreate, u: rr.canUpdate, d: rr.canDelete };
            }
        }

        const roleStats: Record<string, { total: number; read: number; create: number; update: number; delete: number }> = {};
        for (const role of matrixRoles) {
            const stats = { total: matrixRules.length, read: 0, create: 0, update: 0, delete: 0 };
            for (const rule of matrixRules) {
                const crud = matrix[role.id]?.[rule.id];
                if (crud?.r) stats.read++;
                if (crud?.c) stats.create++;
                if (crud?.u) stats.update++;
                if (crud?.d) stats.delete++;
            }
            roleStats[role.id] = stats;
        }

        res.json({
            success: true,
            data: {
                roles: matrixRoles.map(r => ({ id: r.id, name: r.name, displayName: r.displayName, description: r.description, isSystem: r.isSystem })),
                rules: matrixRules.map(r => ({ id: r.id, name: r.name, displayName: r.displayName, module: r.module, icon: r.icon, routes: r.routes, permissions: r.permissions, order: r.order })),
                matrix,
                roleStats,
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/rules/matrix - Batch save the entire CRUD matrix in one call
 * Body: { matrix: { [roleId]: { [ruleId]: { r, c, u, d } } } }
 */
adminRoutes.put('/rules/matrix', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const { matrix } = req.body;
        if (!matrix || typeof matrix !== 'object') {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'matrix is required' } });
        }

        await db.delete(roleRules);

        let count = 0;
        const entries: { roleId: string; ruleId: string; canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean }[] = [];
        
        for (const [roleId, ruleMap] of Object.entries(matrix) as [string, Record<string, { r: boolean; c: boolean; u: boolean; d: boolean }>][]) {
            for (const [ruleId, crud] of Object.entries(ruleMap)) {
                if (crud.r || crud.c || crud.u || crud.d) {
                    entries.push({ roleId, ruleId, canRead: crud.r, canCreate: crud.c, canUpdate: crud.u, canDelete: crud.d });
                }
            }
        }

        for (const entry of entries) {
            await db.insert(roleRules).values(entry);
            count++;
        }

        await logActivity(req.authUser!.userId, 'rules_matrix_saved', `ບັນທຶກ CRUD matrix: ${count} role-rules`, {}, req);

        // Invalidate all cached role rules (matrix affects all roles)
        await invalidateRoleRulesCache();

        res.json({ success: true, message: `ບັນທຶກ ${count} role-rules ສຳເລັດ`, data: { count } });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/roles/:id/copy-rules - Copy rules from one role to another
 * Body: { sourceRoleId: string }
 */
adminRoutes.post('/roles/:id/copy-rules', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const targetRoleId = req.params.id;
        const { sourceRoleId } = req.body;

        if (!sourceRoleId) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'sourceRoleId is required' } });
        }

        const sourceRulesList = await db.query.roleRules.findMany({ where: eq(roleRules.roleId, sourceRoleId) });
        await db.delete(roleRules).where(eq(roleRules.roleId, targetRoleId));

        let count = 0;
        for (const sr of sourceRulesList) {
            await db.insert(roleRules).values({
                roleId: targetRoleId, ruleId: sr.ruleId,
                canRead: sr.canRead, canCreate: sr.canCreate, canUpdate: sr.canUpdate, canDelete: sr.canDelete,
            });
            count++;
        }

        const [sourceRole, targetRole] = await Promise.all([
            db.query.roles.findFirst({ where: eq(roles.id, sourceRoleId), columns: { name: true } }),
            db.query.roles.findFirst({ where: eq(roles.id, targetRoleId), columns: { name: true } }),
        ]);
        await logActivity(req.authUser!.userId, 'role_rules_copied', `ຄັດລອກ rules ຈາກ ${sourceRole?.name} → ${targetRole?.name}: ${count} rules`, { sourceRoleId, targetRoleId }, req);

        // Invalidate cached rules for the target role
        await invalidateRoleRulesCache(targetRoleId);

        res.json({ success: true, message: `ຄັດລອກ ${count} rules ສຳເລັດ`, data: { count } });
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
                          (req.authUser as any).storeId === id;

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Access denied' }
            });
        }

        const [store] = await (db.update(stores) as any).set({ isActive: Boolean(isActive) }).where(eq(stores.id, id)).returning();

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
        const superAdmins = await db.query.users.findMany({
            where: eq(users.isSuperAdmin, true),
            columns: { id: true, email: true, name: true },
        });
        const superAdminIds = superAdmins.map(u => u.id);
        
        const [{ value: rolesCount }] = await db.select({ value: count() }).from(roles);
        
        // Delete all data in order (child tables first)
        // 1. Transaction related
        await db.delete(transactionPayments);
        await db.delete(transactionItems);
        await db.delete(transactions);
        await db.delete(heldSales);
        
        // 2. Order related
        await db.delete(orderItems);
        await db.delete(orders);
        await db.delete(reservations);
        await db.delete(tables);
        
        // 3. Shift related
        await db.delete(cashMovements);
        await db.delete(shifts);
        await db.delete(cashRegisters);
        
        // 4. Inventory related
        await db.delete(stockTransferItems);
        await db.delete(stockTransfers);
        await db.delete(stockMovements);
        await db.delete(stockCounts);
        await db.delete(inventory);
        
        // 5. Purchase Order related
        await db.delete(purchaseOrderItems);
        await db.delete(purchaseOrders);
        await db.delete(vendors);
        
        // 6. Product related
        await db.delete(billOfMaterials);
        await db.delete(productPriceLevels);
        await db.delete(skuVariants);
        await db.delete(productStores);
        await db.delete(products);
        await db.delete(categories);
        await db.delete(priceLevels);
        
        // 7. Customer related
        await db.delete(pointsHistory);
        await db.delete(customers);
        
        // 8. Member related
        await db.delete(pointHistory);
        await db.delete(members);
        await db.delete(membershipTiers);
        await db.delete(pointSettings);
        
        // 9. Promotion related
        await db.delete(promotions);
        await db.delete(coupons);
        
        // 10. User related (except Super Admins)
        await db.delete(sessions);
        await db.delete(activityLogs);
        await db.delete(storeRequests);
        await db.delete(userStores);
        if (superAdminIds.length > 0) {
            await db.delete(users).where(notInArray(users.id, superAdminIds));
        } else {
            await db.delete(users);
        }
        
        // 11. Store related
        await db.delete(stores);
        
        // 12. Branch related
        await db.delete(branches);
        
        // 13. Payment methods
        await db.delete(paymentMethods);
        
        // 14. Permissions
        await db.delete(permissions);
        await db.delete(permissionGroups);
        await db.delete(menuPermissions);
        
        // Create default branch for Super Admins
        const [defaultBranch] = await (db.insert(branches) as any).values({
            name: 'ສຳນັກງານໃຫຍ່', code: 'HQ', isMain: true,
        }).returning();
        
        // Update Super Admin users with new branch
        if (superAdminIds.length > 0) {
            await (db.update(users) as any).set({ branchId: defaultBranch.id }).where(inArray(users.id, superAdminIds));
        }
        
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

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE BACKUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/backup
 * Export all tables as a JSON backup file (super admin only).
 */
adminRoutes.post('/backup', authenticate, requireSuperAdmin(), async (req, res, next) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        const [
            branchRows, userRows, sessionRows, roleRows, ruleRows, roleRuleRows,
            permGroupRows, permRows, menuPermRows, storeRows, userStoreRows, productStoreRows,
            storeRequestRows, categoryRows, productRows, skuVariantRows, bomRows,
            priceLevelRows, productPriceLevelRows, inventoryRows, stockMovementRows,
            customerRows, pointsHistoryRows, transactionRows, transactionItemRows,
            transactionPaymentRows, heldSaleRows, paymentMethodRows, shiftRows,
            cashRegisterRows, cashMovementRows, tableRows, orderRows, orderItemRows,
            reservationRows, memberRows, membershipTierRows, pointHistoryRows,
            pointSettingsRows, promotionRows, couponRows, discountRows, settlementRows,
            vendorRows, purchaseOrderRows, purchaseOrderItemRows, stockTransferRows,
            stockTransferItemRows, stockCountRows, stockCountItemRows, documentRows,
            documentTemplateRows, settingRows, notificationRows, activityLogRows,
        ] = await Promise.all([
            db.select().from(branches),
            db.select({ id: users.id, email: users.email, name: users.name, role: users.role,
                roleId: users.roleId, branchId: users.branchId, isActive: users.isActive,
                isSuperAdmin: users.isSuperAdmin, createdAt: users.createdAt }).from(users),
            db.select().from(sessions),
            db.select().from(roles),
            db.select().from(rules),
            db.select().from(roleRules),
            db.select().from(permissionGroups),
            db.select().from(permissions),
            db.select().from(menuPermissions),
            db.select().from(stores),
            db.select().from(userStores),
            db.select().from(productStores),
            db.select().from(storeRequests),
            db.select().from(categories),
            db.select().from(products),
            db.select().from(skuVariants),
            db.select().from(billOfMaterials),
            db.select().from(priceLevels),
            db.select().from(productPriceLevels),
            db.select().from(inventory),
            db.select().from(stockMovements),
            db.select().from(customers),
            db.select().from(pointsHistory),
            db.select().from(transactions),
            db.select().from(transactionItems),
            db.select().from(transactionPayments),
            db.select().from(heldSales),
            db.select().from(paymentMethods),
            db.select().from(shifts),
            db.select().from(cashRegisters),
            db.select().from(cashMovements),
            db.select().from(tables),
            db.select().from(orders),
            db.select().from(orderItems),
            db.select().from(reservations),
            db.select().from(members),
            db.select().from(membershipTiers),
            db.select().from(pointHistory),
            db.select().from(pointSettings),
            db.select().from(promotions),
            db.select().from(coupons),
            db.select().from(discounts),
            db.select().from(settlements),
            db.select().from(vendors),
            db.select().from(purchaseOrders),
            db.select().from(purchaseOrderItems),
            db.select().from(stockTransfers),
            db.select().from(stockTransferItems),
            db.select().from(stockCounts),
            db.select().from(stockCountItems),
            db.select().from(documents),
            db.select().from(documentTemplates),
            db.select().from(settings),
            db.select().from(notifications),
            db.select().from(activityLogs),
        ]);

        const backup = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            tables: {
                branches: branchRows, users: userRows, sessions: sessionRows,
                roles: roleRows, rules: ruleRows, roleRules: roleRuleRows,
                permissionGroups: permGroupRows, permissions: permRows, menuPermissions: menuPermRows,
                stores: storeRows, userStores: userStoreRows, productStores: productStoreRows,
                storeRequests: storeRequestRows, categories: categoryRows, products: productRows,
                skuVariants: skuVariantRows, billOfMaterials: bomRows, priceLevels: priceLevelRows,
                productPriceLevels: productPriceLevelRows, inventory: inventoryRows,
                stockMovements: stockMovementRows, customers: customerRows,
                pointsHistory: pointsHistoryRows, transactions: transactionRows,
                transactionItems: transactionItemRows, transactionPayments: transactionPaymentRows,
                heldSales: heldSaleRows, paymentMethods: paymentMethodRows, shifts: shiftRows,
                cashRegisters: cashRegisterRows, cashMovements: cashMovementRows, tables: tableRows,
                orders: orderRows, orderItems: orderItemRows, reservations: reservationRows,
                members: memberRows, membershipTiers: membershipTierRows,
                pointHistory: pointHistoryRows, pointSettings: pointSettingsRows,
                promotions: promotionRows, coupons: couponRows, discounts: discountRows,
                settlements: settlementRows, vendors: vendorRows, purchaseOrders: purchaseOrderRows,
                purchaseOrderItems: purchaseOrderItemRows, stockTransfers: stockTransferRows,
                stockTransferItems: stockTransferItemRows, stockCounts: stockCountRows,
                stockCountItems: stockCountItemRows, documents: documentRows,
                documentTemplates: documentTemplateRows, settings: settingRows,
                notifications: notificationRows, activityLogs: activityLogRows,
            },
            stats: {
                branches: branchRows.length, users: userRows.length, roles: roleRows.length,
                stores: storeRows.length, products: productRows.length, customers: customerRows.length,
                transactions: transactionRows.length, inventory: inventoryRows.length,
                activityLogs: activityLogRows.length,
            },
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="kpos-backup-${timestamp}.json"`);
        res.json(backup);
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BACKFILL USER STORE RECORDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/backfill-user-stores
 * Creates UserStore records for existing users who have none.
 * Associates each user with the store that belongs to their branch.
 * Safe to run multiple times (upsert).
 */
adminRoutes.post('/backfill-user-stores', authenticate, requireAdmin(), async (req, res, next) => {
    try {
        const usersWithoutStores = await db.query.users.findMany({
            where: and(eq(users.isSuperAdmin, false), ne(users.branchId, '')),
            columns: { id: true, branchId: true, name: true, email: true },
        });

        let created = 0;
        let skipped = 0;

        for (const user of usersWithoutStores) {
            const [{ value: existing }] = await db.select({ value: count() }).from(userStores).where(eq(userStores.userId, user.id));
            if (existing > 0) { skipped++; continue; }

            const store = await db.query.stores.findFirst({
                where: and(eq(stores.branchId, user.branchId!), eq(stores.isActive, true)),
                orderBy: desc(stores.isDefault),
            });

            if (!store) { skipped++; continue; }

            await db.insert(userStores).values({
                userId: user.id, storeId: store.id, branchId: user.branchId!,
                canRead: true, canWrite: true, canDelete: false, canManage: false, isDefault: true,
            });
            created++;
        }

        res.json({
            success: true,
            data: {
                message: 'Backfill complete',
                total: usersWithoutStores.length,
                created,
                skipped,
            },
        });
    } catch (error) {
        next(error);
    }
});

