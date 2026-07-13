// ═══════════════════════════════════════════════════════════════════════════
// Inventory Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, ensureScopeAccess, buildScopeCondition, buildBranchIdScope, invalidateQueryCache, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { queryCache } from '@/infrastructure/http/middleware/cache.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { setRequestContext, setSuperAdminBypassContext } from '@/db/set-tenant-context';
import { db as globalDb } from '@/config/database.config';
import { products, categories, inventory, stockMovements, vendors, purchaseOrders, purchaseOrderItems, stockTransfers, stockTransferItems, stockCounts, stockCountItems, branches, stores } from '@/db/schema/tables';
import { eq, and, or, ne, ilike, inArray, isNotNull, isNull, gte, lte, gt, lt, desc, asc, count, sum, sql } from 'drizzle-orm';
import { queueActivityLog } from '@/infrastructure/helpers/activity-log.helper';

export const inventoryRoutes = Router();

// req.tx (a reserved connection) doesn't support .transaction() — see
// tenant-tx.middleware.ts. Handlers that need real atomicity go through the
// pooled globalDb instead, setting the RLS context with SET LOCAL inside.
async function scopedTransaction(req, callback) {
    return globalDb.transaction(async (tx) => {
        const { tenantId, isSuperAdmin, activeBranchPath } = req.authUser ?? {};
        if (isSuperAdmin) {
            await setSuperAdminBypassContext(tx, { local: true });
        } else if (tenantId) {
            await setRequestContext(tx, { tenantId, branchPath: activeBranchPath }, { local: true });
        }
        return callback(tx);
    });
}

// Row-locked inventory read. IMPORTANT: `db.query.inventory.findFirst({ ...,
// for: 'update' })` (the relational query API) silently does NOT apply a
// row lock — `for` is not a field that API recognizes, so spreading
// `{ for: 'update' } as any` into its options is a no-op the `any` cast was
// hiding. Only the query-builder API's `.for('update')` actually emits
// `FOR UPDATE` SQL. Verified live: without this fix, 5 concurrent
// /inventory/adjust +10 calls on the same row landed as 130 instead of 150
// (lost updates); with it, exactly 150.
async function lockInventoryRow(tx: any, productId: string, branchId: string) {
    const rows = await tx.select().from(inventory)
        .where(and(eq(inventory.productId, productId), eq(inventory.branchId, branchId)))
        .for('update');
    return rows[0];
}

// Get inventory status with pagination, search, and filters
inventoryRoutes.get('/', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { 
            branchId, 
            lowStock, 
            outOfStock,
            search,
            page = 1, 
            limit = 10,
            all
        } = req.query;
        const returnAll = all === 'true';
        
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;
        
        // Determine branch ID based on filter or query
        let userBranchId = branchId ? String(branchId) : (req.user as any)?.branchId;
        
        // Apply branch filter for non-admin users
        if (filter?.branchIds?.length) {
            if (branchId && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                });
            }
            if (!userBranchId) {
                userBranchId = filter.branchIds[0];
            }
        }

        const prodConds: any[] = [eq(products.isActive, true)];
        // BE-41: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) {
            prodConds.push(eq(products.tenantId, tenantId));
        }
        const prodScope = buildBranchIdScope(filter, products.branchId);
        if (prodScope) prodConds.push(prodScope);
        else if (!filter && userBranchId) prodConds.push(eq(products.branchId, userBranchId));
        if (search) {
            const s = String(search);
            prodConds.push(or(ilike(products.name, `%${s}%`), ilike(products.sku, `%${s}%`), ilike(products.barcode, `%${s}%`)));
        }
        const prodWhere = and(...prodConds);

        const [productRows, [{ value: total }]] = await Promise.all([
            db.query.products.findMany({
                where: prodWhere,
                ...(returnAll ? {} : { offset: skip, limit: Number(limit) }),
                with: { category: { columns: { id: true, name: true } }, inventory: true },
                orderBy: asc(products.name),
            }),
            db.select({ value: count() }).from(products).where(prodWhere),
        ]);

        // Determine which branchIds are in scope so each product's inventory
        // is not cross-contaminated between branches that share a product.
        const scopedBranchIds = filter?.branchIds?.length
            ? filter.branchIds
            : (userBranchId ? [userBranchId] : null);

        // Transform data to include stock from inventory
        let productsWithStock = productRows.map(product => {
            const relevantInv = scopedBranchIds
                ? (product.inventory || []).filter((inv: any) => scopedBranchIds.includes(inv.branchId))
                : (product.inventory || []);
            const totalStock = relevantInv.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
            return {
                id: product.id,
                name: product.name,
                sku: product.sku,
                barcode: product.barcode,
                price: product.price,
                salePrice: product.price,
                cost: product.cost,
                unit: product.unit,
                stock: totalStock,
                minStock: product.lowStockThreshold || 5,
                category: product.category,
            };
        });

        // Apply stock filters
        if (lowStock === 'true') {
            productsWithStock = productsWithStock.filter(p => p.stock > 0 && p.stock <= p.minStock);
        }
        if (outOfStock === 'true') {
            productsWithStock = productsWithStock.filter(p => p.stock === 0);
        }

        const totalFiltered = productsWithStock.length;
        const totalPages = returnAll ? 1 : Math.ceil(total / Number(limit));

        res.json({ 
            success: true, 
            data: productsWithStock,
            total: lowStock === 'true' || outOfStock === 'true' ? totalFiltered : total,
            page: Number(page),
            limit: returnAll ? (lowStock === 'true' || outOfStock === 'true' ? totalFiltered : total) : Number(limit),
            totalPages,
            pagination: {
                page: Number(page),
                limit: returnAll ? total : Number(limit),
                total: lowStock === 'true' || outOfStock === 'true' ? totalFiltered : total,
                pages: totalPages,
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get inventory stats (for dashboard cards)
inventoryRoutes.get('/stats', authenticate, withTenantTx(), branchFilter(), queryCache(30, 'inventory'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const filter = req.branchFilter;
        const userBranchId = filter?.branchIds?.[0] || (req.user as any)?.branchId;
        
        // Get all products with inventory (filtered by branch for non-admin users)
        const statsConds: any[] = [eq(products.isActive, true)];
        // BE-76: Tenant isolation
        const statsTenantId = req.authUser?.tenantId;
        if (statsTenantId && !req.authUser?.isSuperAdmin) statsConds.push(eq(products.tenantId, statsTenantId));
        const statsScope = buildScopeCondition(filter, { branchId: products.branchId }, 'branchId');
        if (statsScope) statsConds.push(statsScope);
        const statsProducts = await db.query.products.findMany({
            where: and(...statsConds),
            with: { inventory: true },
        });
        
        let totalProducts = statsProducts.length;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let totalValue = 0;
        
        const statsScopedBranchIds = filter?.branchIds?.length
            ? filter.branchIds
            : (userBranchId ? [userBranchId] : null);

        statsProducts.forEach(product => {
            const statsRelevantInv = statsScopedBranchIds
                ? (product.inventory || []).filter((inv: any) => statsScopedBranchIds.includes(inv.branchId))
                : (product.inventory || []);
            const totalStock = statsRelevantInv.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
            const minStock = product.lowStockThreshold || 5;
            const cost = product.cost || product.price;
            
            if (totalStock === 0) {
                outOfStockCount++;
            } else if (totalStock <= minStock) {
                lowStockCount++;
            }
            
            totalValue += cost * totalStock;
        });
        
        res.json({
            success: true,
            data: {
                total: totalProducts,
                lowStock: lowStockCount,
                outOfStock: outOfStockCount,
                totalValue,
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get inventory movements
inventoryRoutes.get('/movements', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { productId, branchId, type, startDate, endDate, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;
        
        const mvConds: any[] = [];
        // BE-76: Tenant isolation
        const mvTenantId = req.authUser?.tenantId;
        if (mvTenantId && !req.authUser?.isSuperAdmin) mvConds.push(eq(stockMovements.tenantId, mvTenantId));
        const mvScope = buildScopeCondition(filter, { storeId: stockMovements.storeId }, 'storeId');
        if (mvScope) mvConds.push(mvScope);
        if (productId) mvConds.push(eq(stockMovements.productId, String(productId)));
        if (branchId) mvConds.push(eq(stockMovements.branchId, String(branchId)));
        if (type) mvConds.push(eq(stockMovements.type, String(type)));
        if (startDate) mvConds.push(gte(stockMovements.createdAt, new Date(String(startDate))));
        if (endDate) mvConds.push(lte(stockMovements.createdAt, new Date(String(endDate))));
        const mvWhere = mvConds.length > 0 ? and(...mvConds) : undefined;

        const [movements, [{ value: total }]] = await Promise.all([
            db.query.stockMovements.findMany({ where: mvWhere, offset: skip, limit: Number(limit), orderBy: desc(stockMovements.createdAt) }),
            db.select({ value: count() }).from(stockMovements).where(mvWhere),
        ]);

        res.json({
            success: true,
            data: movements,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Adjust inventory
inventoryRoutes.put('/adjust', authenticate, withTenantTx(), branchFilter(), authorize('inventory:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { productId, quantity, type, reason, reference } = req.body;
        const userId = req.user!.userId;
        // Get branchId from request body or from user's assigned branch
        const branchId = req.body.branchId || req.authUser?.activeBranchId || (req.user as any)?.branchId;
        const adjFilter = req.branchFilter;
        if (adjFilter && branchId && !req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) > 2) {
            if (!adjFilter.branchIds.includes(branchId)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
            }
        }
        
        if (!branchId) {
            return res.status(400).json({ 
                success: false, 
                error: { code: 'BRANCH_REQUIRED', message: 'Branch ID is required' } 
            });
        }

        const invTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const movementType = quantity > 0 ? 'IN' : 'OUT';

        // Row-locked read + write inside a transaction — previously this read
        // the row, computed newQty in JS, and wrote it back with a plain
        // UPDATE with no lock, so two concurrent adjustments to the same
        // product+branch (two staff correcting stock, or a double-click)
        // silently lost one adjustment with no error.
        const movement = await scopedTransaction(req, async (tx) => {
            const currentInventory = await lockInventoryRow(tx, productId, branchId);
            const previousQty = currentInventory?.quantity || 0;
            const newQty = Math.max(0, previousQty + quantity);

            const [mv] = await tx.insert(stockMovements).values({
                tenantId: invTenantId,
                productId, branchId, quantity: Math.abs(quantity), previousQty, newQty, type: movementType,
                reason: reason || (type === 'add' ? 'Stock Addition' : 'Stock Reduction'), reference, referenceType: 'ADJUSTMENT', userId,
            }).returning();

            if (currentInventory) {
                await tx.update(inventory).set({ quantity: newQty, available: Math.max(0, newQty - currentInventory.reserved) }).where(eq(inventory.id, currentInventory.id));
            } else {
                await tx.insert(inventory).values({ tenantId: invTenantId || null, productId, branchId, quantity: newQty, available: newQty, reserved: 0 });
            }

            return mv;
        });

        // Invalidate inventory cache after adjustment
        invalidateQueryCache('inventory*').catch(() => {});
        invalidateQueryCache('dashboard*').catch(() => {});

        // Log activity async
        queueActivityLog(userId, 'inventory_adjusted', 'inventory', `ປັບສະຕອກ ${productId} ${quantity > 0 ? '+' : ''}${quantity}`, { productId, branchId, quantity }, req).catch(() => {});

        res.status(201).json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// Stock transfer between branches
inventoryRoutes.post('/transfer', authenticate, withTenantTx(), authorize('inventory:transfer'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { productId, fromBranchId, toBranchId, quantity, reason } = req.body;
        const userId = req.user!.userId;

        if (!productId || !fromBranchId || !toBranchId || !quantity || quantity <= 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'VAL_001', message: 'ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບ' }
            });
        }

        // Validate: fromBranch and toBranch must be different
        if (fromBranchId === toBranchId) {
            return res.status(400).json({
                success: false,
                error: { code: 'SAME_BRANCH', message: 'ບໍ່ສາມາດໂອນພາຍໃນສາຂາດຽວກັນໄດ້' }
            });
        }

        // BE-42: Validate both branches exist AND belong to same tenant
        const tenantId = req.authUser?.tenantId;
        const [fromBranch, toBranch] = await Promise.all([
            db.query.branches.findFirst({ where: eq(branches.id, fromBranchId), columns: { id: true, name: true, tenantId: true } }),
            db.query.branches.findFirst({ where: eq(branches.id, toBranchId), columns: { id: true, name: true, tenantId: true } }),
        ]);

        if (!fromBranch) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'ບໍ່ພົບສາຂາຕົ້ນທາງ' }
            });
        }
        if (!toBranch) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'ບໍ່ພົບສາຂາປາຍທາງ' }
            });
        }

        // BE-42: Cross-tenant transfer prevention
        if (tenantId && !req.authUser?.isSuperAdmin) {
            if (fromBranch.tenantId !== tenantId || toBranch.tenantId !== tenantId) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'CROSS_TENANT', message: 'ບໍ່ສາມາດໂອນຂ້າມບໍລິສັດໄດ້' }
                });
            }
        }

        const transferReason = reason || `ໂອນຈາກ ${fromBranch.name} ໄປ ${toBranch.name}`;

        // Read + validate + write all inside one transaction with row-level
        // locks on both inventory rows — previously these were read outside
        // the transaction with no lock, then written with values computed
        // from that stale read. Two concurrent transfers of the same
        // product out of the same source branch would both pass the
        // stock-availability check and both write their own stale
        // fromNewQty/toNewQty, silently losing one transfer's decrement
        // (lost update — net effect is stock created or destroyed from
        // nothing). `for: 'update'` blocks the second transaction's read
        // until the first commits, so it sees the already-decremented
        // quantity and re-validates against it.
        const result = await scopedTransaction(req, async (tx) => {
            const fromInventory = await lockInventoryRow(tx, productId, fromBranchId);

            if (!fromInventory || fromInventory.quantity < quantity) {
                throw Object.assign(new Error(`ສະຕອກບໍ່ພຽງພໍ (ມີ: ${fromInventory?.quantity || 0}, ຕ້ອງການ: ${quantity})`), { statusCode: 400, code: 'INSUFFICIENT_STOCK' });
            }

            const toInventory = await lockInventoryRow(tx, productId, toBranchId);

            const fromPreviousQty = fromInventory.quantity;
            const toPreviousQty = toInventory?.quantity || 0;
            const fromNewQty = fromPreviousQty - quantity;
            const toNewQty = toPreviousQty + quantity;

            // BE-43: Inject tenantId into stock movement inserts
            const [outMovement] = await tx.insert(stockMovements).values({
                tenantId: tenantId || null,
                productId, branchId: fromBranchId, quantity, previousQty: fromPreviousQty, newQty: fromNewQty,
                type: 'TRANSFER_OUT', reason: transferReason, reference: toBranchId, referenceType: 'TRANSFER', userId,
            }).returning();

            await tx.insert(stockMovements).values({
                tenantId: tenantId || null,
                productId, branchId: toBranchId, quantity, previousQty: toPreviousQty, newQty: toNewQty,
                type: 'TRANSFER_IN', reason: transferReason, reference: fromBranchId, referenceType: 'TRANSFER', userId,
            });

            await tx.update(inventory).set({ quantity: fromNewQty, available: Math.max(0, fromNewQty - fromInventory.reserved) }).where(eq(inventory.id, fromInventory.id));

            if (toInventory) {
                await tx.update(inventory).set({ quantity: toNewQty, available: Math.max(0, toNewQty - toInventory.reserved) }).where(eq(inventory.id, toInventory.id));
            } else {
                // Was missing tenantId — orphaned NULL-tenant rows are
                // treated as globally shared by the RLS policy (`tenant_id
                // IS NULL OR ...`), so they leaked into every other
                // tenant's inventory reports.
                await tx.insert(inventory).values({ tenantId: tenantId || null, productId, branchId: toBranchId, quantity: toNewQty, available: toNewQty, reserved: 0 });
            }

            return { outMovement, fromPreviousQty, toPreviousQty, fromNewQty, toNewQty };
        });

        // Invalidate caches after transfer
        invalidateQueryCache('inventory*').catch(() => {});
        invalidateQueryCache('dashboard*').catch(() => {});

        // Log activity async
        queueActivityLog(userId, 'inventory_transferred', 'inventory', `ໂອນ ${quantity} ຈາກ ${fromBranch.name} → ${toBranch.name}`, { productId, fromBranchId, toBranchId, quantity }, req).catch(() => {});

        res.status(201).json({
            success: true,
            data: {
                message: 'ໂອນສິນຄ້າສຳເລັດ',
                transferId: result.outMovement.id,
                from: { branchId: fromBranchId, branchName: fromBranch.name, previousQty: result.fromPreviousQty, newQty: result.fromNewQty },
                to: { branchId: toBranchId, branchName: toBranch.name, previousQty: result.toPreviousQty, newQty: result.toNewQty },
                quantity,
            }
        });
    } catch (error) {
        next(error);
    }
});

// Out of stock items
inventoryRoutes.get('/out-of-stock', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { search, page = 1, limit = 20, branchId: qBranchId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;

        const oosConds: any[] = [lte(inventory.quantity, 0)];
        // BE-76: Tenant isolation
        const oosTenantId = req.authUser?.tenantId;
        if (oosTenantId && !req.authUser?.isSuperAdmin) oosConds.push(eq(inventory.tenantId, oosTenantId));
        if (qBranchId && filter?.branchIds?.includes(String(qBranchId))) {
            oosConds.push(eq(inventory.branchId, String(qBranchId)));
        } else if (filter?.branchIds?.length) {
            oosConds.push(inArray(inventory.branchId, filter.branchIds));
        }

        let outOfStockItems = await db.query.inventory.findMany({
            where: and(...oosConds),
            with: { product: { columns: { id: true, name: true, sku: true, barcode: true, images: true, lowStockThreshold: true } }, branch: { columns: { id: true, name: true } } },
            orderBy: desc(inventory.updatedAt),
        });

        // Transform data
        let data = outOfStockItems.map(item => ({
            id: item.id,
            productId: item.productId,
            productName: item.product?.name || 'Unknown',
            sku: item.product?.sku || '',
            barcode: item.product?.barcode || '',
            image: item.product?.images?.[0] || null,
            branchId: item.branchId,
            branchName: item.branch?.name || '',
            quantity: item.quantity,
            lowStockThreshold: item.product?.lowStockThreshold || 10,
            updatedAt: item.updatedAt,
        }));

        // Apply search filter
        if (search) {
            const searchLower = String(search).toLowerCase();
            data = data.filter(item => 
                item.productName.toLowerCase().includes(searchLower) ||
                item.sku.toLowerCase().includes(searchLower) ||
                item.barcode.toLowerCase().includes(searchLower)
            );
        }

        const total = data.length;
        const paginatedData = data.slice(skip, skip + Number(limit));

        res.json({ 
            success: true, 
            data: paginatedData,
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

// Low stock alerts
inventoryRoutes.get('/alerts', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user?.branchId || String(req.query.branchId);

        const alertConds: any[] = [lte(inventory.quantity, 10)];
        // BE-76: Tenant isolation
        const alertTenantId = req.authUser?.tenantId;
        if (alertTenantId && !req.authUser?.isSuperAdmin) alertConds.push(eq(inventory.tenantId, alertTenantId));
        if (filter?.branchIds?.length) alertConds.push(inArray(inventory.branchId, filter.branchIds));
        else if (branchId) alertConds.push(eq(inventory.branchId, branchId));

        const lowStock = await db.query.inventory.findMany({ where: and(...alertConds), with: { product: true } });

        res.json({ success: true, data: lowStock });
    } catch (error) {
        next(error);
    }
});

// Get all vendors (tenant-scoped)
inventoryRoutes.get('/vendors', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { search, isActive, page = 1, limit = 20, all } = req.query;
        const returnAll = all === 'true';
        const skip = (Number(page) - 1) * Number(limit);
        const vGetTenantId = req.authUser?.tenantId;
        const vGetConds: any[] = [];
        if (vGetTenantId && !req.authUser?.isSuperAdmin) vGetConds.push(eq(vendors.tenantId, vGetTenantId));
        if (search) vGetConds.push(ilike(vendors.name, `%${search}%`));
        if (isActive !== undefined) vGetConds.push(eq(vendors.isActive, isActive === 'true'));
        const vGetWhere = vGetConds.length > 0 ? and(...vGetConds) : undefined;
        const [rows, [{ value: total }]] = await Promise.all([
            returnAll
                ? dbRead.select().from(vendors).where(vGetWhere).orderBy(asc(vendors.name))
                : dbRead.select().from(vendors).where(vGetWhere).orderBy(asc(vendors.name)).offset(skip).limit(Number(limit)),
            dbRead.select({ value: count() }).from(vendors).where(vGetWhere),
        ]);
        res.json({ success: true, data: rows, meta: { page: Number(page), limit: returnAll ? total : Number(limit), total, totalPages: returnAll ? 1 : Math.ceil(total / Number(limit)) } });
    } catch (error) {
        next(error);
    }
});

// Get vendor by ID
inventoryRoutes.get('/vendors/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const vOneTenantId = req.authUser?.tenantId;
        const vOneConds: any[] = [eq(vendors.id, req.params.id)];
        if (vOneTenantId && !req.authUser?.isSuperAdmin) vOneConds.push(eq(vendors.tenantId, vOneTenantId));
        const [vendor] = await dbRead.select().from(vendors).where(and(...vOneConds));
        if (!vendor) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ບໍ່ພົບຜູ້ສະໜອງ' } }); return; }
        res.json({ success: true, data: vendor });
    } catch (error) {
        next(error);
    }
}); // <--- Added missing closing });

// Create vendor
inventoryRoutes.post('/vendors', authenticate, withTenantTx(), authorize('inventory:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { name, code, contactName, phone, email, address, notes, taxId, paymentTerms, isActive, isStarred } = req.body;
        if (!name?.trim()) {
            res.status(400).json({ success: false, error: { code: 'VAL_001', message: 'ກະລຸນາປ້ອນຊື່ຜູ້ສະໜອງ' } });
            return;
        }
        const vCreateTenantId = req.authUser?.tenantId;
        const [vendor] = await db.insert(vendors).values({
            name: name.trim(),
            code: code?.trim() || null,
            contactName: contactName?.trim() || null,
            phone: phone?.trim() || null,
            email: email?.trim() || null,
            address: address?.trim() || null,
            notes: notes?.trim() || null,
            taxId: taxId?.trim() || null,
            paymentTerms: paymentTerms ?? 30,
            isActive: isActive !== false,
            isStarred: isStarred === true,
            tenantId: vCreateTenantId || null,
        }).returning();
        res.status(201).json({ success: true, data: vendor });
    } catch (error: any) {
        if (error.code === '23505') {
            res.status(400).json({ success: false, error: { code: 'DUP_001', message: 'ຜູ້ສະໜອງນີ້ມີຢູ່ແລ້ວ' } });
            return;
        }
        next(error);
    }
});

// Update vendor
inventoryRoutes.put('/vendors/:id', authenticate, withTenantTx(), authorize('inventory:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { name, contactName, phone, email, address, notes, code, taxId, paymentTerms, isActive, isStarred } = req.body;
        
        if (name !== undefined && (!name || !name.trim())) {
            res.status(400).json({ 
                success: false, 
                error: { code: 'VAL_001', message: 'ກະລຸນາປ້ອນຊື່ຜູ້ສະໜອງ' } 
            });
            return;
        }
        
        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name.trim();
        if (contactName !== undefined) updateData.contactName = contactName?.trim() || null;
        if (phone !== undefined) updateData.phone = phone?.trim() || null;
        if (email !== undefined) updateData.email = email?.trim() || null;
        if (address !== undefined) updateData.address = address?.trim() || null;
        if (notes !== undefined) updateData.notes = notes?.trim() || null;
        if (code !== undefined) updateData.code = code?.trim() || null;
        if (taxId !== undefined) updateData.taxId = taxId?.trim() || null;
        if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms || null;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (isStarred !== undefined) updateData.isStarred = isStarred;
        
        // BE-76: Tenant-scoped vendor update
        const vTenantId = req.authUser?.tenantId;
        const vUpdConds: any[] = [eq(vendors.id, req.params.id)];
        if (vTenantId && !req.authUser?.isSuperAdmin) vUpdConds.push(eq(vendors.tenantId, vTenantId));
        delete updateData.tenantId;
        const [vendor] = await db.update(vendors).set(updateData).where(and(...vUpdConds)).returning();
        if (!vendor) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'ບໍ່ພົບຜູ້ສະໜອງນີ້ ຫຼື ບໍ່ມີສິດ' } }); return; }
        res.json({ success: true, data: vendor });
    } catch (error: any) {
        if (error.code === '23505') {
            res.status(400).json({ 
                success: false, 
                error: { code: 'DUP_001', message: 'ຜູ້ສະໜອງນີ້ມີຢູ່ແລ້ວ' } 
            });
            return;
        }
        next(error);
    }
}); 

// Delete vendor
inventoryRoutes.delete('/vendors/:id', authenticate, withTenantTx(), authorize('inventory:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        // BE-76: Tenant-scoped vendor delete
        const vDelTenantId = req.authUser?.tenantId;
        const vDelConds: any[] = [eq(vendors.id, req.params.id)];
        if (vDelTenantId && !req.authUser?.isSuperAdmin) vDelConds.push(eq(vendors.tenantId, vDelTenantId));
        const [{ value: orderCount }] = await db.select({ value: count() }).from(purchaseOrders).where(eq(purchaseOrders.vendorId, req.params.id));
        if (orderCount > 0) {
            res.status(400).json({ success: false, error: { code: 'REF_001', message: `ບໍ່ສາມາດລຶບໄດ້ ເນື່ອງຈາກມີ ${orderCount} ໃບສັ່ງຊື້ທີ່ກ່ຽວຂ້ອງ` } });
            return;
        }
        await db.delete(vendors).where(and(...vDelConds));
        res.json({ success: true, data: { message: 'Vendor deleted' } });
    } catch (error: any) {
        if (error.code === '23503') {
            res.status(404).json({ 
                success: false, 
                error: { code: 'RES_001', message: 'ບໍ່ພົບຜູ້ສະໜອງນີ້' } 
            });
            return;
        }
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all purchase orders
inventoryRoutes.get('/purchase-orders', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { branchId, vendorId, status, page = 1, limit = 50, all } = req.query;
        const returnAll = all === 'true';
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;
        
        const poConds: any[] = [];
        // BE-76: Tenant isolation
        const poTenantId = req.authUser?.tenantId;
        if (poTenantId && !req.authUser?.isSuperAdmin) poConds.push(eq(purchaseOrders.tenantId, poTenantId));
        const poScope = buildScopeCondition(filter, { branchId: purchaseOrders.branchId }, 'branchId');
        if (poScope) poConds.push(poScope);
        if (branchId) poConds.push(eq(purchaseOrders.branchId, String(branchId)));
        if (vendorId) poConds.push(eq(purchaseOrders.vendorId, String(vendorId)));
        if (status) poConds.push(eq(purchaseOrders.status, String(status)));
        const poWhere = poConds.length > 0 ? and(...poConds) : undefined;

        const [orders, [{ value: total }]] = await Promise.all([
            db.query.purchaseOrders.findMany({
                where: poWhere,
                ...(returnAll ? {} : { offset: skip, limit: Number(limit) }),
                with: { vendor: true, items: true },
                orderBy: desc(purchaseOrders.createdAt),
            }),
            db.select({ value: count() }).from(purchaseOrders).where(poWhere),
        ]);

        res.json({
            success: true,
            data: orders,
            meta: { page: Number(page), limit: returnAll ? total : Number(limit), total, totalPages: returnAll ? 1 : Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get purchase order by ID (scope-checked)
inventoryRoutes.get('/purchase-orders/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        // BE-76: Tenant-scoped PO lookup
        const poGetTenantId = req.authUser?.tenantId;
        const poGetConds: any[] = [eq(purchaseOrders.id, req.params.id)];
        if (poGetTenantId && !req.authUser?.isSuperAdmin) poGetConds.push(eq(purchaseOrders.tenantId, poGetTenantId));
        const order = await db.query.purchaseOrders.findFirst({
            where: and(...poGetConds),
            with: { vendor: true, items: true },
        });

        if (!order) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Purchase order not found or no access' } });
            return;
        }

        if (!ensureScopeAccess(order, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Create purchase order
inventoryRoutes.post('/purchase-orders', authenticate, withTenantTx(), branchFilter(), authorize('inventory:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { items, ...orderData } = req.body;
        const userId = req.user!.userId;

        const [{ value: poCnt }] = await db.select({ value: count() }).from(purchaseOrders);
        const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(poCnt + 1).padStart(4, '0')}`;

        const subtotal = items.reduce((s: number, item: { quantity: number; unitCost: number }) => s + (item.quantity * item.unitCost), 0);
        const tax = (subtotal * (orderData.taxRate || 0)) / 100;
        const discount = orderData.discount || 0;
        const total = subtotal + tax - discount;

        // BE-76: Inject tenantId + validate branchId scope
        const poCreateTenantId = req.authUser?.tenantId || req.user?.tenantId;
        if (!orderData.branchId) {
            orderData.branchId = req.authUser?.activeBranchId || req.authUser?.branchId || req.user?.branchId;
        }
        const filter = req.branchFilter;
        if (filter && orderData.branchId && !req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) > 2) {
            if (!filter.branchIds.includes(orderData.branchId)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
            }
        }
        const [po] = await db.insert(purchaseOrders).values({ ...orderData, tenantId: poCreateTenantId, poNumber, subtotal, tax, discount, total, createdBy: userId }).returning();
        if (items && items.length > 0) {
            await db.insert(purchaseOrderItems).values(items.map((item: any) => ({
                purchaseOrderId: po.id,
                tenantId: poCreateTenantId,
                productId: item.productId,
                productName: item.productName || item.name || 'Unknown',
                quantity: Number(item.quantity),
                unitCost: Number(item.unitCost || item.cost || 0),
                total: Number(item.quantity) * Number(item.unitCost || item.cost || 0),
            })));
        }
        const order = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, po.id), with: { vendor: true, items: true } });
        res.status(201).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Update purchase order
inventoryRoutes.put('/purchase-orders/:id', authenticate, withTenantTx(), authorize('inventory:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        // BE-76: Tenant-scoped PO update
        const poUpdTenantId = req.authUser?.tenantId;
        const poUpdConds: any[] = [eq(purchaseOrders.id, req.params.id)];
        if (poUpdTenantId && !req.authUser?.isSuperAdmin) poUpdConds.push(eq(purchaseOrders.tenantId, poUpdTenantId));
        const poUpdateData = { ...req.body };
        delete poUpdateData.tenantId;
        await db.update(purchaseOrders).set(poUpdateData).where(and(...poUpdConds));
        const order = await db.query.purchaseOrders.findFirst({ where: and(...poUpdConds), with: { vendor: true, items: true } });
        if (!order) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Purchase order not found or no access' } }); return; }
        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Update purchase order status
inventoryRoutes.patch('/purchase-orders/:id/status', authenticate, withTenantTx(), authorize('inventory:update'), async (req, res, next) => {
    try {
        const { status } = req.body;
        const userId = req.user!.userId;
        const poTenantId = req.authUser?.tenantId;

        const updateData: Record<string, unknown> = { status };
        if (status === 'APPROVED') {
            updateData.approvedBy = userId;
            updateData.approvedAt = new Date();
        }
        if (status === 'RECEIVED') {
            updateData.receivedDate = new Date();
        }

        // Whole status transition (including the stock-in loop below) is now
        // one transaction with an atomic status-claim guard — previously
        // this read the PO's current status with a plain SELECT, then
        // unconditionally applied the stock increment with no re-check.
        // Two concurrent PATCH .../status(RECEIVED) requests for the same PO
        // (e.g. a double-click) both passed, both looped adding stock, so
        // inventory was credited twice for one PO. `WHERE status != status`
        // (only when transitioning TO 'RECEIVED') claims the row atomically:
        // if another request already moved it to RECEIVED, this UPDATE
        // matches zero rows and the stock loop is skipped.
        const result = await scopedTransaction(req, async (tx) => {
            const poConds: any[] = [eq(purchaseOrders.id, req.params.id)];
            if (poTenantId && !req.authUser?.isSuperAdmin) poConds.push(eq(purchaseOrders.tenantId, poTenantId));
            if (status === 'RECEIVED') poConds.push(ne(purchaseOrders.status, 'RECEIVED'));

            const [claimed] = await tx.update(purchaseOrders).set(updateData).where(and(...poConds)).returning({ id: purchaseOrders.id });
            if (!claimed) {
                return { order: null, alreadyProcessed: status === 'RECEIVED' };
            }

            const order = await tx.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, claimed.id), with: { items: true } });
            if (!order) return { order: null, alreadyProcessed: false };

            if (status === 'RECEIVED') {
                for (const item of order.items) {
                    const inv = await lockInventoryRow(tx, item.productId, order.branchId);
                    if (inv) {
                        await tx.update(inventory).set({ quantity: inv.quantity + item.quantity }).where(eq(inventory.id, inv.id));
                    } else {
                        await tx.insert(inventory).values({ tenantId: poTenantId || null, productId: item.productId, branchId: order.branchId, quantity: item.quantity });
                    }
                    // BE-43: Inject tenantId into stock movement on PO receive
                    await tx.insert(stockMovements).values({
                        tenantId: poTenantId || null,
                        productId: item.productId, branchId: order.branchId, type: 'IN', quantity: item.quantity,
                        previousQty: inv?.quantity || 0, newQty: (inv?.quantity || 0) + item.quantity,
                        reason: 'Purchase Order Received', reference: order.id, referenceType: 'PURCHASE', userId,
                    });
                }
            }

            return { order, alreadyProcessed: false };
        });

        if (result.alreadyProcessed) {
            return res.status(409).json({ success: false, error: { code: 'ALREADY_RECEIVED', message: 'This purchase order was already marked as received' } });
        }
        if (!result.order) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Purchase order not found or no access' } });
        }

        res.json({ success: true, data: result.order });
    } catch (error) {
        next(error);
    }
});

// Delete purchase order
inventoryRoutes.delete('/purchase-orders/:id', authenticate, withTenantTx(), authorize('inventory:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        // BE-76: Tenant-scoped PO delete
        const poDelTenantId = req.authUser?.tenantId;
        const poDelConds: any[] = [eq(purchaseOrders.id, req.params.id)];
        if (poDelTenantId && !req.authUser?.isSuperAdmin) poDelConds.push(eq(purchaseOrders.tenantId, poDelTenantId));
        const order = await db.query.purchaseOrders.findFirst({ where: and(...poDelConds) });
        if (!order) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Purchase order not found or no access' } }); return; }
        if (order.status !== 'DRAFT') {
            res.status(400).json({ success: false, error: { code: 'INV_001', message: 'Can only delete draft orders' } });
            return;
        }
        await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, req.params.id));
        await db.delete(purchaseOrders).where(and(...poDelConds));
        
        res.json({ success: true, data: { message: 'Purchase order deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STOCK TRANSFERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all stock transfers
inventoryRoutes.get('/stock-transfers', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { fromBranchId, toBranchId, status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;
        
        const stConds: any[] = [];
        // BE-76: Tenant isolation
        const stTenantId = req.authUser?.tenantId;
        if (stTenantId && !req.authUser?.isSuperAdmin) stConds.push(eq(stockTransfers.tenantId, stTenantId));
        if (filter?.branchIds?.length) {
            stConds.push(or(inArray(stockTransfers.fromBranchId, filter.branchIds), inArray(stockTransfers.toBranchId, filter.branchIds)));
        }
        if (fromBranchId) stConds.push(eq(stockTransfers.fromBranchId, String(fromBranchId)));
        if (toBranchId) stConds.push(eq(stockTransfers.toBranchId, String(toBranchId)));
        if (status) stConds.push(eq(stockTransfers.status, String(status)));
        const stWhere = stConds.length > 0 ? and(...stConds) : undefined;

        const [transfers, [{ value: total }]] = await Promise.all([
            db.query.stockTransfers.findMany({ where: stWhere, offset: skip, limit: Number(limit), with: { items: true }, orderBy: desc(stockTransfers.createdAt) }),
            db.select({ value: count() }).from(stockTransfers).where(stWhere),
        ]);

        res.json({
            success: true,
            data: transfers,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create stock transfer
inventoryRoutes.post('/stock-transfers', authenticate, withTenantTx(), authorize('inventory:update'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { items, fromBranchId, toBranchId, ...transferData } = req.body;
        const userId = req.user!.userId;
        const filter = req.branchFilter;

        // Branch access guard: non-HQ users can only initiate from their own branches
        if (filter && filter.branchIds.length > 0) {
            if (!filter.branchIds.includes(String(fromBranchId))) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'ບໍ່ມີສິດໂອນສິນຄ້າຈາກສາຂານີ້' } });
            }
        }

        // Validate: fromBranch and toBranch must be different
        if (fromBranchId === toBranchId) {
            return res.status(400).json({
                success: false,
                error: { code: 'SAME_BRANCH', message: 'ບໍ່ສາມາດໂອນພາຍໃນສາຂາດຽວກັນໄດ້' }
            });
        }

        const [fromStore, toStore] = await Promise.all([
            db.query.stores.findFirst({ where: eq(stores.id, fromBranchId), columns: { id: true, branchId: true, name: true } }),
            db.query.stores.findFirst({ where: eq(stores.id, toBranchId), columns: { id: true, branchId: true, name: true } }),
        ]);

        // If stores exist, validate they are in the same branch
        if (fromStore && toStore) {
            if (fromStore.branchId !== toStore.branchId) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DIFFERENT_BRANCH', message: 'ການໂອນສິນຄ້າຕ້ອງຢູ່ໃນສາຂາດຽວກັນເທົ່ານັ້ນ' }
                });
            }
        }

        // Validate stock availability for each item
        for (const item of items) {
            const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, item.productId), eq(inventory.branchId, fromBranchId)) });
            if (!inv || inv.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    error: { 
                        code: 'INSUFFICIENT_STOCK', 
                        message: `ສິນຄ້າ ${item.productName} ມີສະຕອກບໍ່ພຽງພໍ (ມີ: ${inv?.quantity || 0}, ຕ້ອງການ: ${item.quantity})` 
                    }
                });
            }
        }

        const [{ value: stCnt }] = await db.select({ value: count() }).from(stockTransfers);
        const transferNo = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(stCnt + 1).padStart(4, '0')}`;

        const stCreateTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [st] = await db.insert(stockTransfers).values({
            ...transferData,
            tenantId: stCreateTenantId,
            fromBranchId, toBranchId, transferNo,
            requestedBy: userId,
            status: 'PENDING',  // stock only moves on approval
        }).returning();
        if (items.length > 0) {
            await db.insert(stockTransferItems).values(
                items.map((item: any) => ({ transferId: st.id, productId: item.productId, productName: item.productName, quantity: item.quantity }))
            );
        }

        queueActivityLog(userId, 'transfer_created', 'inventory', `ສ້າງການໂອນ ${transferNo}`, { transferId: st.id }, req).catch(() => {});
        const transfer = await db.query.stockTransfers.findFirst({ where: eq(stockTransfers.id, st.id), with: { items: true } });
        res.status(201).json({ success: true, data: transfer });
    } catch (error) {
        next(error);
    }
});

// ─── Approve a stock transfer (deduct from source, add to destination) ───────
inventoryRoutes.patch('/stock-transfers/:id/approve', authenticate, withTenantTx(), authorize('inventory:update'), branchFilter(), async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const tenantId = req.authUser?.tenantId;
        const filter = req.branchFilter;

        // Whole approval (stock move + status transition) is one transaction
        // with an atomic status-claim guard, same pattern as PO receive:
        // previously this read status with a plain SELECT then unconditionally
        // moved stock, so two concurrent approve clicks both moved stock.
        const result = await scopedTransaction(req, async (tx) => {
            const transfer = await tx.query.stockTransfers.findFirst({
                where: eq(stockTransfers.id, id),
                with: { items: true },
            });

            if (!transfer) return { code: 'NOT_FOUND' as const };
            if (tenantId && transfer.tenantId && transfer.tenantId !== tenantId) return { code: 'FORBIDDEN' as const };
            if (filter && filter.branchIds.length > 0) {
                if (!filter.branchIds.includes(String(transfer.fromBranchId)) && !filter.branchIds.includes(String(transfer.toBranchId))) {
                    return { code: 'FORBIDDEN' as const };
                }
            }

            const [claimed] = await tx.update(stockTransfers)
                .set({ status: 'COMPLETED', approvedBy: userId, approvedAt: new Date(), completedBy: userId, completedAt: new Date() })
                .where(and(eq(stockTransfers.id, id), eq(stockTransfers.status, 'PENDING')))
                .returning({ id: stockTransfers.id });
            if (!claimed) return { code: 'INVALID_STATE' as const, status: transfer.status };

            for (const item of transfer.items) {
                const [fromInv, toInv] = await Promise.all([
                    lockInventoryRow(tx, item.productId, transfer.fromBranchId),
                    lockInventoryRow(tx, item.productId, transfer.toBranchId),
                ]);
                if (!fromInv || fromInv.quantity < item.quantity) {
                    return { code: 'INSUFFICIENT_STOCK' as const, productName: item.productName, available: fromInv?.quantity || 0, required: item.quantity };
                }

                const qty = Number(item.quantity);
                const fromPrev = fromInv.quantity;
                const toPrev = toInv?.quantity || 0;

                await tx.insert(stockMovements).values([
                    { tenantId, productId: item.productId, branchId: transfer.fromBranchId, quantity: -qty, previousQty: fromPrev, newQty: fromPrev - qty, type: 'TRANSFER_OUT', reason: `ໂອນໄປ ${transfer.toBranchId}`, reference: transfer.transferNo, userId },
                    { tenantId, productId: item.productId, branchId: transfer.toBranchId, quantity: qty, previousQty: toPrev, newQty: toPrev + qty, type: 'TRANSFER_IN', reason: `ໂອນຈາກ ${transfer.fromBranchId}`, reference: transfer.transferNo, userId },
                ]);

                await tx.update(inventory).set({ quantity: fromInv.quantity - qty }).where(eq(inventory.id, fromInv.id));
                if (toInv) {
                    await tx.update(inventory).set({ quantity: toInv.quantity + qty }).where(eq(inventory.id, toInv.id));
                } else {
                    await tx.insert(inventory).values({ tenantId: tenantId || null, productId: item.productId, branchId: transfer.toBranchId, quantity: qty });
                }
            }

            const updated = await tx.query.stockTransfers.findFirst({ where: eq(stockTransfers.id, id), with: { items: true } });
            return { code: 'OK' as const, transfer: updated };
        });

        if (result.code === 'NOT_FOUND') {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transfer not found' } });
        }
        if (result.code === 'FORBIDDEN') {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'ບໍ່ມີສິດອະນຸມັດການໂອນນີ້' } });
        }
        if (result.code === 'INVALID_STATE') {
            return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Transfer is already ${result.status}` } });
        }
        if (result.code === 'INSUFFICIENT_STOCK') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INSUFFICIENT_STOCK',
                    message: `ສິນຄ້າ ${result.productName} ມີສະຕອກບໍ່ພຽງພໍ (ມີ: ${result.available}, ຕ້ອງການ: ${result.required})`,
                },
            });
        }

        invalidateQueryCache('inventory*').catch(() => {});
        queueActivityLog(userId, 'transfer_approved', 'inventory', `ອະນຸມັດການໂອນ ${result.transfer?.transferNo}`, { transferId: id }, req).catch(() => {});
        res.json({ success: true, data: result.transfer });
    } catch (error) {
        next(error);
    }
});

// ─── Reject a stock transfer ──────────────────────────────────────────────────
inventoryRoutes.patch('/stock-transfers/:id/reject', authenticate, withTenantTx(), authorize('inventory:update'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user!.userId;
        const tenantId = req.authUser?.tenantId;
        const filter = req.branchFilter;

        const transfer = await db.query.stockTransfers.findFirst({ where: eq(stockTransfers.id, id) });
        if (!transfer) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transfer not found' } });
        }
        if (transfer.status !== 'PENDING') {
            return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Transfer is already ${transfer.status}` } });
        }
        if (tenantId && transfer.tenantId && transfer.tenantId !== tenantId) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
        }
        // Branch access guard
        if (filter && filter.branchIds.length > 0) {
            if (!filter.branchIds.includes(String(transfer.fromBranchId)) && !filter.branchIds.includes(String(transfer.toBranchId))) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'ບໍ່ມີສິດປະຕິເສດການໂອນນີ້' } });
            }
        }

        await db.update(stockTransfers).set({ status: 'REJECTED', approvedBy: userId, approvedAt: new Date(), notes: reason ? String(reason) : transfer.notes }).where(eq(stockTransfers.id, id));
        queueActivityLog(userId, 'transfer_rejected', 'inventory', `ປະຕິເສດການໂອນ ${transfer.transferNo}`, { transferId: id, reason }, req).catch(() => {});

        const updated = await db.query.stockTransfers.findFirst({ where: eq(stockTransfers.id, id), with: { items: true } });
        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});

// Expiry tracking with pagination
inventoryRoutes.get('/expiring', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { branchId, days = 90, page = 1, limit = 20, search, daysFilter, all } = req.query;
        const returnAll = all === 'true';
        const skip = (Number(page) - 1) * Number(limit);
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + Number(days));
        const scopeFilter = req.branchFilter;

        const expConds: any[] = [isNotNull(inventory.expiryDate), lte(inventory.expiryDate, futureDate), gt(inventory.quantity, 0)];
        // BE-76: Tenant isolation
        const expTenantId = req.authUser?.tenantId;
        if (expTenantId && !req.authUser?.isSuperAdmin) expConds.push(eq(inventory.tenantId, expTenantId));
        if (branchId && scopeFilter?.branchIds?.includes(String(branchId))) {
            expConds.push(eq(inventory.branchId, String(branchId)));
        } else if (scopeFilter?.branchIds?.length) {
            expConds.push(inArray(inventory.branchId, scopeFilter.branchIds));
        }

        let expiringItems = await db.query.inventory.findMany({
            where: and(...expConds),
            with: { product: { columns: { id: true, name: true, sku: true, barcode: true, images: true } }, branch: { columns: { id: true, name: true } } },
            orderBy: asc(inventory.expiryDate),
        });

        // Transform data for frontend
        let data = expiringItems.map(item => ({
            id: item.id,
            productId: item.productId,
            productName: item.product?.name || 'Unknown',
            sku: item.product?.sku || '',
            barcode: item.product?.barcode || '',
            image: item.product?.images?.[0] || null,
            branchId: item.branchId,
            branchName: item.branch?.name || '',
            quantity: item.quantity,
            expiryDate: item.expiryDate,
            batchNo: item.batchNumber || '',
        }));

        // Apply search filter
        if (search) {
            const searchLower = String(search).toLowerCase();
            data = data.filter(item => 
                item.productName.toLowerCase().includes(searchLower) ||
                item.sku.toLowerCase().includes(searchLower) ||
                item.barcode.toLowerCase().includes(searchLower)
            );
        }

        // Apply days filter (expired, critical, warning, ok)
        if (daysFilter !== undefined && daysFilter !== null && daysFilter !== '') {
            const filterDays = Number(daysFilter);
            const today = new Date();
            data = data.filter(item => {
                if (!item.expiryDate) return false;
                const expiry = new Date(item.expiryDate);
                const daysUntil = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                
                if (filterDays === -1) return daysUntil < 0; // Already expired
                if (filterDays === 7) return daysUntil >= 0 && daysUntil <= 7; // Critical (0-7 days)
                if (filterDays === 30) return daysUntil > 7 && daysUntil <= 30; // Warning (8-30 days)
                if (filterDays === 90) return daysUntil > 30; // OK (30+ days)
                return true;
            });
        }

        const total = data.length;
        const paginatedData = returnAll ? data : data.slice(skip, skip + Number(limit));

        res.json({ 
            success: true, 
            data: paginatedData,
            meta: {
                page: Number(page),
                limit: returnAll ? total : Number(limit),
                total,
                totalPages: returnAll ? 1 : Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get stock in records
inventoryRoutes.get('/stock-in', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { search, page = 1, limit = 10, branchId: qBranchId, all } = req.query;
        const returnAll = all === 'true';
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;

        const siConds: any[] = [eq(stockMovements.type, 'IN')];
        // BE-76: Tenant isolation
        const siTenantId = req.authUser?.tenantId;
        if (siTenantId && !req.authUser?.isSuperAdmin) siConds.push(eq(stockMovements.tenantId, siTenantId));
        // Hard-block out-of-scope branch requests (consistent with GET /inventory)
        if (qBranchId && filter?.branchIds && filter.branchIds.length > 0 && !filter.branchIds.includes(String(qBranchId))) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
        }
        if (qBranchId && filter?.branchIds?.includes(String(qBranchId))) {
            siConds.push(eq(stockMovements.branchId, String(qBranchId)));
        } else if (filter?.branchIds?.length) {
            siConds.push(inArray(stockMovements.branchId, filter.branchIds));
        }
        if (search) {
            const s = String(search);
            siConds.push(or(ilike(stockMovements.reference, `%${s}%`), ilike(stockMovements.supplier, `%${s}%`), ilike(stockMovements.batchNumber, `%${s}%`)));
        }
        const siWhere = and(...siConds);

        const [movements, [{ value: total }]] = await Promise.all([
            db.query.stockMovements.findMany({
                where: siWhere,
                ...(returnAll ? {} : { offset: skip, limit: Number(limit) }),
                orderBy: desc(stockMovements.createdAt),
            }),
            db.select({ value: count() }).from(stockMovements).where(siWhere),
        ]);

        const productIds = [...new Set(movements.map(m => m.productId))];
        const prodRows = productIds.length > 0 ? await db.query.products.findMany({ where: inArray(products.id, productIds), columns: { id: true, name: true, sku: true } }) : [];
        const productMap = new Map(prodRows.map(p => [p.id, p]));

        res.json({
            success: true,
            data: movements.map(m => ({ ...m, product: productMap.get(m.productId) || null })),
            meta: { page: Number(page), limit: returnAll ? total : Number(limit), total, totalPages: returnAll ? 1 : Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get stock out records
inventoryRoutes.get('/stock-out', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { search, page = 1, limit = 10, branchId: qBranchId, all } = req.query;
        const returnAll = all === 'true';
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;

        const soConds: any[] = [eq(stockMovements.type, 'OUT')];
        // BE-76: Tenant isolation
        const soTenantId = req.authUser?.tenantId;
        if (soTenantId && !req.authUser?.isSuperAdmin) soConds.push(eq(stockMovements.tenantId, soTenantId));
        if (qBranchId && filter?.branchIds?.includes(String(qBranchId))) {
            soConds.push(eq(stockMovements.branchId, String(qBranchId)));
        } else if (filter?.branchIds?.length) {
            soConds.push(inArray(stockMovements.branchId, filter.branchIds));
        }
        if (search) {
            const s = String(search);
            soConds.push(or(ilike(stockMovements.reference, `%${s}%`), ilike(stockMovements.reason, `%${s}%`)));
        }
        const soWhere = and(...soConds);

        const [movements, [{ value: total }]] = await Promise.all([
            db.query.stockMovements.findMany({
                where: soWhere,
                ...(returnAll ? {} : { offset: skip, limit: Number(limit) }),
                orderBy: desc(stockMovements.createdAt),
            }),
            db.select({ value: count() }).from(stockMovements).where(soWhere),
        ]);

        const productIds = [...new Set(movements.map(m => m.productId))];
        const prodRows = productIds.length > 0 ? await db.query.products.findMany({ where: inArray(products.id, productIds), columns: { id: true, name: true, sku: true } }) : [];
        const productMap = new Map(prodRows.map(p => [p.id, p]));

        res.json({
            success: true,
            data: movements.map(m => ({ ...m, quantity: Math.abs(m.quantity), product: productMap.get(m.productId) || null })),
            meta: { page: Number(page), limit: returnAll ? total : Number(limit), total, totalPages: returnAll ? 1 : Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create stock out
inventoryRoutes.post('/stock-out', authenticate, withTenantTx(), authorize('inventory:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { productId, quantity, reason, reference, notes, date } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, productId), eq(inventory.branchId, branchId)) });
        const previousQty = inv?.quantity || 0;
        const outQty = Math.abs(Number(quantity));
        const newQty = Math.max(0, previousQty - outQty);

        const soTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [movement] = await db.insert(stockMovements).values({
            tenantId: soTenantId,
            productId, branchId, quantity: -outQty, previousQty, newQty, type: 'OUT',
            reason: reason || 'Stock Out', reference: reference || null, notes: notes || null,
            userId, createdAt: date ? new Date(date) : new Date(),
        }).returning();

        if (inv) await db.update(inventory).set({ quantity: newQty }).where(eq(inventory.id, inv.id));

        const product = await db.query.products.findFirst({ where: eq(products.id, productId), columns: { id: true, name: true, sku: true } });
        res.status(201).json({ success: true, data: { ...movement, quantity: outQty, product } });
    } catch (error) {
        next(error);
    }
});

// Create stock in
inventoryRoutes.post('/stock-in', authenticate, withTenantTx(), authorize('inventory:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { productId, quantity, unitCost, supplier, reference, notes, date, expiryDate, batchNumber } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        const batchConds: any[] = [eq(inventory.productId, productId), eq(inventory.branchId, branchId)];
        if (batchNumber) batchConds.push(eq(inventory.batchNumber, batchNumber));
        else batchConds.push(isNull(inventory.batchNumber));
        const inv = await db.query.inventory.findFirst({ where: and(...batchConds) });
        const previousQty = inv?.quantity || 0;
        const newQty = previousQty + Number(quantity);

        const siTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [movement] = await db.insert(stockMovements).values({
            tenantId: siTenantId,
            productId, branchId, quantity: Number(quantity), previousQty, newQty,
            unitCost: unitCost ? Number(unitCost) : null, supplier: supplier || null,
            type: 'IN', reason: supplier || 'Stock In', reference, notes, userId,
            expiryDate: expiryDate ? new Date(expiryDate) : null, batchNumber: batchNumber || null,
            createdAt: date ? new Date(date) : new Date(),
        }).returning();

        if (inv) {
            await db.update(inventory).set({ quantity: newQty, expiryDate: expiryDate ? new Date(expiryDate) : inv.expiryDate }).where(eq(inventory.id, inv.id));
        } else {
            await db.insert(inventory).values({ tenantId: siTenantId, productId, branchId, quantity: newQty, expiryDate: expiryDate ? new Date(expiryDate) : null, batchNumber: batchNumber || null });
        }

        res.status(201).json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// Update stock in
inventoryRoutes.put('/stock-in/:id', authenticate, withTenantTx(), authorize('inventory:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { id } = req.params;
        const { productId, quantity, unitCost, supplier, reference, notes, date, expiryDate, batchNumber } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        // BE-76: Tenant-scoped stock-in update
        const siUpdTenantId = req.authUser?.tenantId;
        const siUpdConds: any[] = [eq(stockMovements.id, id)];
        if (siUpdTenantId && !req.authUser?.isSuperAdmin) siUpdConds.push(eq(stockMovements.tenantId, siUpdTenantId));
        const existing = await db.query.stockMovements.findFirst({ where: and(...siUpdConds) });
        if (!existing) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Record not found or no access' } });
            return;
        }

        const quantityDiff = Number(quantity) - existing.quantity;

        const [movement] = await db.update(stockMovements).set({
            productId: productId || existing.productId,
            quantity: Number(quantity),
            unitCost: unitCost !== undefined ? Number(unitCost) : existing.unitCost,
            supplier: supplier ?? existing.supplier,
            reason: supplier || existing.reason,
            reference: reference ?? existing.reference,
            notes: notes ?? existing.notes,
            expiryDate: expiryDate ? new Date(expiryDate) : existing.expiryDate,
            batchNumber: batchNumber ?? existing.batchNumber,
        }).where(and(...siUpdConds)).returning();

        if (quantityDiff !== 0) {
            const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, existing.productId), eq(inventory.branchId, branchId)) });
            if (inv) await db.update(inventory).set({ quantity: inv.quantity + quantityDiff }).where(eq(inventory.id, inv.id));
        }

        res.json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// Delete stock in (reverses inventory)
inventoryRoutes.delete('/stock-in/:id', authenticate, withTenantTx(), authorize('inventory:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        // BE-76: Tenant-scoped stock-in delete
        const siDelTenantId = req.authUser?.tenantId;
        const siDelConds: any[] = [eq(stockMovements.id, req.params.id)];
        if (siDelTenantId && !req.authUser?.isSuperAdmin) siDelConds.push(eq(stockMovements.tenantId, siDelTenantId));
        const movement = await db.query.stockMovements.findFirst({ where: and(...siDelConds) });
        if (!movement) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Record not found or no access' } });
        }
        const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, movement.productId), eq(inventory.branchId, movement.branchId)) });
        if (inv) await db.update(inventory).set({ quantity: Math.max(0, inv.quantity - Math.abs(movement.quantity)) }).where(eq(inventory.id, inv.id));
        await db.delete(stockMovements).where(and(...siDelConds));
        res.json({ success: true, data: { message: 'Deleted successfully' } });
    } catch (error) {
        next(error);
    }
});

// Update stock out
inventoryRoutes.put('/stock-out/:id', authenticate, withTenantTx(), authorize('inventory:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { id } = req.params;
        const { productId, quantity, reason, reference, notes, date } = req.body;
        const branchId = req.user!.branchId || 'default';

        // BE-76: Tenant-scoped stock-out update
        const soUpdTenantId = req.authUser?.tenantId;
        const soUpdConds: any[] = [eq(stockMovements.id, id)];
        if (soUpdTenantId && !req.authUser?.isSuperAdmin) soUpdConds.push(eq(stockMovements.tenantId, soUpdTenantId));
        const existing = await db.query.stockMovements.findFirst({ where: and(...soUpdConds) });
        if (!existing) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Record not found or no access' } });
            return;
        }

        const oldQty = Math.abs(existing.quantity);
        const newQty = Math.abs(Number(quantity));
        const quantityDiff = oldQty - newQty;

        const [movement] = await db.update(stockMovements).set({
            productId: productId || existing.productId,
            quantity: -newQty,
            reason: reason ?? existing.reason,
            reference: reference ?? existing.reference,
            notes: notes ?? existing.notes,
        }).where(and(...soUpdConds)).returning();

        if (quantityDiff !== 0) {
            const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, existing.productId), eq(inventory.branchId, branchId)) });
            if (inv) await db.update(inventory).set({ quantity: inv.quantity + quantityDiff }).where(eq(inventory.id, inv.id));
        }

        res.json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// Delete stock out
inventoryRoutes.delete('/stock-out/:id', authenticate, withTenantTx(), authorize('inventory:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        // BE-76: Tenant-scoped stock-out delete
        const soDelTenantId = req.authUser?.tenantId;
        const soDelConds: any[] = [eq(stockMovements.id, req.params.id)];
        if (soDelTenantId && !req.authUser?.isSuperAdmin) soDelConds.push(eq(stockMovements.tenantId, soDelTenantId));
        const movement = await db.query.stockMovements.findFirst({ where: and(...soDelConds) });
        if (!movement) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Record not found or no access' } });
            return;
        }

        const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, movement.productId), eq(inventory.branchId, movement.branchId)) });
        if (inv) await db.update(inventory).set({ quantity: inv.quantity + Math.abs(movement.quantity) }).where(eq(inventory.id, inv.id));

        await db.delete(stockMovements).where(and(...soDelConds));
        res.json({ success: true, data: { message: 'Deleted successfully' } });
    } catch (error) {
        next(error);
    }
});

// Get adjustments
inventoryRoutes.get('/adjustments', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { search, page = 1, limit = 50, branchId: qBranchId, all, type, adjustmentType } = req.query;
        const returnAll = all === 'true';
        const skip = (Number(page) - 1) * Number(limit);
        const scopeFilter = req.branchFilter;

        const adjConds: any[] = [inArray(stockMovements.type, ['ADJUSTMENT', 'INCREASE', 'DECREASE'])];
        // BE-76: Tenant isolation
        const adjTenantId = req.authUser?.tenantId;
        if (adjTenantId && !req.authUser?.isSuperAdmin) adjConds.push(eq(stockMovements.tenantId, adjTenantId));
        // Hard-block out-of-scope branch requests
        if (qBranchId && scopeFilter?.branchIds && scopeFilter.branchIds.length > 0 && !scopeFilter.branchIds.includes(String(qBranchId))) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
        }
        if (qBranchId && scopeFilter?.branchIds?.includes(String(qBranchId))) {
            adjConds.push(eq(stockMovements.branchId, String(qBranchId)));
        } else if (scopeFilter?.branchIds?.length) {
            adjConds.push(inArray(stockMovements.branchId, scopeFilter.branchIds));
        }
        if (search) {
            const s = String(search);
            adjConds.push(or(ilike(stockMovements.reference, `%${s}%`), ilike(stockMovements.reason, `%${s}%`)));
        }
        const requestedType = String(type || adjustmentType || '').toLowerCase();
        if (requestedType === 'increase') adjConds.push(gt(stockMovements.quantity, 0));
        if (requestedType === 'decrease') adjConds.push(lt(stockMovements.quantity, 0));
        const adjWhere = and(...adjConds);

        const [movements, [{ value: total }]] = await Promise.all([
            db.query.stockMovements.findMany({
                where: adjWhere,
                ...(returnAll ? {} : { offset: skip, limit: Number(limit) }),
                orderBy: desc(stockMovements.createdAt),
            }),
            db.select({ value: count() }).from(stockMovements).where(adjWhere),
        ]);

        const productIds = [...new Set(movements.map(m => m.productId))];
        const prodRows = productIds.length > 0 ? await db.query.products.findMany({ where: inArray(products.id, productIds), columns: { id: true, name: true, sku: true } }) : [];
        const productMap = new Map(prodRows.map(p => [p.id, p]));

        res.json({
            success: true,
            data: movements.map(m => ({
                ...m,
                product: productMap.get(m.productId) || null,
                adjustmentType: m.quantity > 0 ? 'increase' : 'decrease',
                quantity: Math.abs(m.quantity),
            })),
            meta: { page: Number(page), limit: returnAll ? total : Number(limit), total, totalPages: returnAll ? 1 : Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get transfers
inventoryRoutes.get('/transfers', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { search, status, page = 1, limit = 50, branchId: qBranchId, all } = req.query;
        const returnAll = all === 'true';
        const skip = (Number(page) - 1) * Number(limit);
        const scopeFilter = req.branchFilter;

        const trConds: any[] = [];
        // BE-76: Tenant isolation
        const trTenantId = req.authUser?.tenantId;
        if (trTenantId && !req.authUser?.isSuperAdmin) trConds.push(eq(stockTransfers.tenantId, trTenantId));
        if (qBranchId && scopeFilter?.branchIds?.includes(String(qBranchId))) {
            trConds.push(or(eq(stockTransfers.fromBranchId, String(qBranchId)), eq(stockTransfers.toBranchId, String(qBranchId))));
        } else if (scopeFilter?.branchIds?.length) {
            trConds.push(or(inArray(stockTransfers.fromBranchId, scopeFilter.branchIds), inArray(stockTransfers.toBranchId, scopeFilter.branchIds)));
        }
        if (status) trConds.push(eq(stockTransfers.status, String(status)));
        const trWhere = trConds.length > 0 ? and(...trConds) : undefined;

        const [transfers, [{ value: total }]] = await Promise.all([
            db.query.stockTransfers.findMany({
                where: trWhere,
                ...(returnAll ? {} : { offset: skip, limit: Number(limit) }),
                with: { items: true },
                orderBy: desc(stockTransfers.createdAt),
            }),
            db.select({ value: count() }).from(stockTransfers).where(trWhere),
        ]);

        res.json({
            success: true,
            data: transfers,
            meta: { page: Number(page), limit: returnAll ? total : Number(limit), total, totalPages: returnAll ? 1 : Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create transfer
inventoryRoutes.post('/transfers', authenticate, withTenantTx(), authorize('inventory:update'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { productId, quantity, fromBranchId, toBranchId, reference, notes, date } = req.body;
        const userId = req.user!.userId;
        const filter = req.branchFilter;

        // Access guard: user must own the source branch
        if (filter && filter.branchIds.length > 0) {
            if (!filter.branchIds.includes(String(fromBranchId))) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'ບໍ່ມີສິດໂອນສິນຄ້າຈາກສາຂານີ້' } });
            }
        }

        const product = await db.query.products.findFirst({ where: eq(products.id, productId), columns: { name: true } });

        const fromInv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, productId), eq(inventory.branchId, fromBranchId)) });
        const toInv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, productId), eq(inventory.branchId, toBranchId)) });

        const fromPreviousQty = fromInv?.quantity || 0;
        const toPreviousQty = toInv?.quantity || 0;
        const qty = Number(quantity);

        if (fromPreviousQty < qty) {
            res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_STOCK', message: `ສະຕ໋ອກບໍ່ພຽງພໍ (ມີ ${fromPreviousQty}, ຕ້ອງການ ${qty})` } });
            return;
        }

        const [{ value: trCnt }] = await db.select({ value: count() }).from(stockTransfers);
        const transferNo = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(trCnt + 1).padStart(4, '0')}`;

        const trCreateTenantId = req.authUser?.tenantId || req.user?.tenantId;
        // Create as PENDING — stock only moves on approval
        const [tr] = await db.insert(stockTransfers).values({ tenantId: trCreateTenantId, transferNo, fromBranchId, toBranchId, status: 'PENDING', notes, requestedBy: userId }).returning();
        await db.insert(stockTransferItems).values([{ transferId: tr.id, productId, productName: product?.name || '', quantity: qty }]);

        queueActivityLog(userId, 'transfer_created', 'inventory', `ສ້າງການໂອນ ${transferNo}`, { transferId: tr.id }, req).catch(() => {});
        const transfer = await db.query.stockTransfers.findFirst({ where: eq(stockTransfers.id, tr.id), with: { items: true } });
        res.status(201).json({ success: true, data: transfer });
    } catch (error) {
        next(error);
    }
});

// Approve a simple transfer (deduct from source, credit destination)
inventoryRoutes.patch('/transfers/:id/approve', authenticate, withTenantTx(), authorize('inventory:update'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const tenantId = req.authUser?.tenantId;

        // Same atomic-claim + row-locking pattern as /stock-transfers/:id/approve
        // (this is a duplicate implementation of the same feature).
        const result = await scopedTransaction(req, async (tx) => {
            const transfer = await tx.query.stockTransfers.findFirst({ where: eq(stockTransfers.id, id), with: { items: true } });
            if (!transfer) return { code: 'NOT_FOUND' as const };
            if (tenantId && transfer.tenantId && transfer.tenantId !== tenantId) return { code: 'FORBIDDEN' as const };

            const [claimed] = await tx.update(stockTransfers)
                .set({ status: 'COMPLETED', approvedBy: userId, approvedAt: new Date(), completedBy: userId, completedAt: new Date() })
                .where(and(eq(stockTransfers.id, id), eq(stockTransfers.status, 'PENDING')))
                .returning({ id: stockTransfers.id });
            if (!claimed) return { code: 'INVALID_STATE' as const, status: transfer.status };

            for (const item of transfer.items) {
                const qty = Number(item.quantity);
                const [fromInv, toInv] = await Promise.all([
                    lockInventoryRow(tx, item.productId, transfer.fromBranchId),
                    lockInventoryRow(tx, item.productId, transfer.toBranchId),
                ]);
                if (!fromInv || fromInv.quantity < qty) {
                    return { code: 'INSUFFICIENT_STOCK' as const, productName: item.productName, available: fromInv?.quantity || 0, required: qty };
                }
                const fromPrev = fromInv.quantity;
                const toPrev = toInv?.quantity || 0;
                await tx.insert(stockMovements).values([
                    { tenantId, productId: item.productId, branchId: transfer.fromBranchId, quantity: -qty, previousQty: fromPrev, newQty: fromPrev - qty, type: 'TRANSFER_OUT', reason: `ໂອນໄປ ${transfer.toBranchId}`, reference: transfer.transferNo, userId },
                    { tenantId, productId: item.productId, branchId: transfer.toBranchId, quantity: qty, previousQty: toPrev, newQty: toPrev + qty, type: 'TRANSFER_IN', reason: `ໂອນຈາກ ${transfer.fromBranchId}`, reference: transfer.transferNo, userId },
                ]);
                await tx.update(inventory).set({ quantity: fromInv.quantity - qty }).where(eq(inventory.id, fromInv.id));
                if (toInv) {
                    await tx.update(inventory).set({ quantity: toInv.quantity + qty }).where(eq(inventory.id, toInv.id));
                } else {
                    await tx.insert(inventory).values({ tenantId: tenantId || null, productId: item.productId, branchId: transfer.toBranchId, quantity: qty });
                }
            }

            const updated = await tx.query.stockTransfers.findFirst({ where: eq(stockTransfers.id, id), with: { items: true } });
            return { code: 'OK' as const, transfer: updated };
        });

        if (result.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transfer not found' } });
        if (result.code === 'FORBIDDEN') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
        if (result.code === 'INVALID_STATE') return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Transfer is already ${result.status}` } });
        if (result.code === 'INSUFFICIENT_STOCK') {
            return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_STOCK', message: `ສິນຄ້າ ${result.productName} ສະຕອກບໍ່ພຽງພໍ (ມີ: ${result.available}, ຕ້ອງການ: ${result.required})` } });
        }

        invalidateQueryCache('inventory*').catch(() => {});
        queueActivityLog(userId, 'transfer_approved', 'inventory', `ອະນຸມັດ ${result.transfer?.transferNo}`, { transferId: id }, req).catch(() => {});
        res.json({ success: true, data: result.transfer });
    } catch (error) { next(error); }
});

// Reject a simple transfer
inventoryRoutes.patch('/transfers/:id/reject', authenticate, withTenantTx(), authorize('inventory:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user!.userId;
        const tenantId = req.authUser?.tenantId;

        const transfer = await db.query.stockTransfers.findFirst({ where: eq(stockTransfers.id, id) });
        if (!transfer) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transfer not found' } });
        if (transfer.status !== 'PENDING') return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Transfer is already ${transfer.status}` } });
        if (tenantId && transfer.tenantId && transfer.tenantId !== tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });

        await db.update(stockTransfers).set({ status: 'REJECTED', approvedBy: userId, approvedAt: new Date(), notes: reason ? String(reason) : transfer.notes }).where(eq(stockTransfers.id, id));
        queueActivityLog(userId, 'transfer_rejected', 'inventory', `ປະຕິເສດ ${transfer.transferNo}`, { transferId: id, reason }, req).catch(() => {});
        const updated = await db.query.stockTransfers.findFirst({ where: eq(stockTransfers.id, id), with: { items: true } });
        res.json({ success: true, data: updated });
    } catch (error) { next(error); }
});

// Get stock counts
inventoryRoutes.get('/stock-counts', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { status, page = 1, limit = 50, all } = req.query;
        const returnAll = all === 'true';
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;

        const scConds: any[] = [];
        // BE-76: Tenant isolation
        const scTenantId = req.authUser?.tenantId;
        if (scTenantId && !req.authUser?.isSuperAdmin) scConds.push(eq(stockCounts.tenantId, scTenantId));
        if (filter?.branchIds?.length) scConds.push(inArray(stockCounts.branchId, filter.branchIds));
        if (status) scConds.push(eq(stockCounts.status, String(status)));
        const scWhere = scConds.length > 0 ? and(...scConds) : undefined;

        const [counts, [{ value: total }]] = await Promise.all([
            db.query.stockCounts.findMany({
                where: scWhere,
                ...(returnAll ? {} : { offset: skip, limit: Number(limit) }),
                with: { items: true },
                orderBy: desc(stockCounts.createdAt),
            }),
            db.select({ value: count() }).from(stockCounts).where(scWhere),
        ]);

        res.json({
            success: true,
            data: counts,
            meta: { page: Number(page), limit: returnAll ? total : Number(limit), total, totalPages: returnAll ? 1 : Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create stock count
inventoryRoutes.post('/stock-counts', authenticate, withTenantTx(), authorize('inventory:adjust'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { date, notes, items } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        const [{ value: scCnt }] = await db.select({ value: count() }).from(stockCounts);
        const countNo = `CNT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(scCnt + 1).padStart(4, '0')}`;

        let hasDiscrepancy = false;
        const itemsWithProducts = await Promise.all(
            items.map(async (item: { productId: string; systemQty: number; actualQty: number }) => {
                const product = await db.query.products.findFirst({ where: eq(products.id, item.productId) });
                const diff = item.actualQty - item.systemQty;
                if (diff !== 0) hasDiscrepancy = true;
                return { productId: item.productId, productName: product?.name || '', systemQty: item.systemQty, actualQty: item.actualQty, difference: diff };
            })
        );

        // BE-76: Inject tenantId
        const scCreateTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [sc] = await db.insert(stockCounts).values({ tenantId: scCreateTenantId, countNo, branchId, date: date ? new Date(date) : new Date(), notes, status: 'pending', hasDiscrepancy, countedBy: userId }).returning();
        if (itemsWithProducts.length > 0) {
            await db.insert(stockCountItems).values(itemsWithProducts.map(i => ({ ...i, countId: sc.id })));
        }
        const stockCount = await db.query.stockCounts.findFirst({ where: eq(stockCounts.id, sc.id), with: { items: true } });
        res.status(201).json({ success: true, data: stockCount });
    } catch (error) {
        next(error);
    }
});

// Approve stock count (maker/checker) — only roleLevel ≤ 4 (hq_admin, hq_manager) or admin
inventoryRoutes.patch('/stock-counts/:id/approve', authenticate, withTenantTx(), authorize('inventory:adjust'), async (req, res, next) => {
    try {
        const userId = req.authUser?.userId || req.user?.userId;
        const roleLevel = req.authUser?.roleLevel ?? 7;
        if (!userId) {
            return res.status(400).json({ success: false, error: { code: 'AUTH_001', message: 'User not resolved' } });
        }
        if (!req.authUser?.isSuperAdmin && roleLevel > 4) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only HQ admins or above can approve stock counts' } });
        }

        const scTenantId = req.authUser?.tenantId;

        // Atomic status-claim guard, same pattern as PO receive / transfer approve:
        // previously a plain SELECT status check let two concurrent approvals both
        // apply the inventory adjustment loop.
        const result = await scopedTransaction(req, async (tx) => {
            const scConds: any[] = [eq(stockCounts.id, req.params.id)];
            if (scTenantId && !req.authUser?.isSuperAdmin) scConds.push(eq(stockCounts.tenantId, scTenantId));

            const claimConds = [...scConds, eq(stockCounts.status, 'pending')];
            const [claimed] = await tx.update(stockCounts)
                .set({ status: 'approved', approvedBy: userId, approvedAt: new Date() })
                .where(and(...claimConds))
                .returning({ id: stockCounts.id });
            if (!claimed) {
                const sc = await tx.query.stockCounts.findFirst({ where: and(...scConds) });
                if (!sc) return { code: 'NOT_FOUND' as const };
                return { code: 'INVALID_STATE' as const, status: sc.status };
            }

            const sc = await tx.query.stockCounts.findFirst({ where: eq(stockCounts.id, claimed.id), with: { items: true } });
            if (!sc) return { code: 'NOT_FOUND' as const };

            for (const item of (sc.items || [])) {
                if (item.difference === 0) continue;
                const inv = await lockInventoryRow(tx, item.productId, sc.branchId);
                const prevQty = inv?.quantity || 0;
                const newQty = Math.max(0, prevQty + item.difference);
                if (inv) {
                    await tx.update(inventory).set({ quantity: newQty, available: Math.max(0, newQty - (inv.reserved || 0)) }).where(eq(inventory.id, inv.id));
                } else {
                    await tx.insert(inventory).values({ tenantId: scTenantId || null, productId: item.productId, branchId: sc.branchId, quantity: newQty, available: newQty, reserved: 0 });
                }
                await tx.insert(stockMovements).values({
                    tenantId: scTenantId || null, productId: item.productId, branchId: sc.branchId,
                    quantity: Math.abs(item.difference), previousQty: prevQty, newQty,
                    type: 'ADJUSTMENT', reason: `Stock count ${sc.countNo} approved`, referenceType: 'STOCK_COUNT',
                    reference: sc.countNo, userId,
                });
            }

            return { code: 'OK' as const, countNo: sc.countNo, countId: sc.id };
        });

        if (result.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Stock count not found' } });
        if (result.code === 'INVALID_STATE') return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Stock count is already ${result.status}` } });

        queueActivityLog(userId!, 'stock_count_approved', 'inventory', `ອະນຸມັດການນັບສະຕອກ ${result.countNo}`, { countId: result.countId }, req).catch(() => {});
        invalidateQueryCache('inventory*').catch(() => {});

        res.json({ success: true, data: { message: 'Stock count approved', countNo: result.countNo } });
    } catch (error) {
        next(error);
    }
});

// Reject stock count (maker/checker)
inventoryRoutes.patch('/stock-counts/:id/reject', authenticate, withTenantTx(), authorize('inventory:adjust'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const userId = req.authUser?.userId || req.user?.userId;
        const roleLevel = req.authUser?.roleLevel ?? 7;
        if (!req.authUser?.isSuperAdmin && roleLevel > 4) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only HQ admins or above can reject stock counts' } });
        }

        const { reason } = req.body;
        const scTenantId = req.authUser?.tenantId;
        const scConds: any[] = [eq(stockCounts.id, req.params.id)];
        if (scTenantId && !req.authUser?.isSuperAdmin) scConds.push(eq(stockCounts.tenantId, scTenantId));
        const sc = await db.query.stockCounts.findFirst({ where: and(...scConds) });

        if (!sc) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Stock count not found' } });
        if (sc.status !== 'pending') {
            return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Stock count is already ${sc.status}` } });
        }

        await db.update(stockCounts).set({ status: 'rejected', approvedBy: userId, approvedAt: new Date(), notes: reason ? String(reason) : sc.notes }).where(and(...scConds));
        queueActivityLog(userId!, 'stock_count_rejected', 'inventory', `ປະຕິເສດການນັບສະຕອກ ${sc.countNo}`, { countId: sc.id, reason }, req).catch(() => {});

        res.json({ success: true, data: { message: 'Stock count rejected', countNo: sc.countNo } });
    } catch (error) {
        next(error);
    }
});
