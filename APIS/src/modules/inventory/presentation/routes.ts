// ═══════════════════════════════════════════════════════════════════════════
// Inventory Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, ensureScopeAccess, buildScopeCondition, invalidateQueryCache, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { queryCache } from '@/infrastructure/http/middleware/cache.middleware';
import { db } from '@/config/database.config';
import { products, categories, inventory, stockMovements, vendors, purchaseOrders, purchaseOrderItems, stockTransfers, stockTransferItems, stockCounts, stockCountItems, branches, stores } from '@/db/schema/tables';
import { eq, and, or, ne, ilike, inArray, isNotNull, isNull, gte, lte, gt, lt, desc, asc, count, sum, sql } from 'drizzle-orm';
import { queueActivityLog } from '@/infrastructure/helpers/activity-log.helper';

export const inventoryRoutes = Router();

// Get inventory status with pagination, search, and filters
inventoryRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { 
            branchId, 
            lowStock, 
            outOfStock,
            search,
            page = 1, 
            limit = 10 
        } = req.query;
        
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        
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
        const prodScope = buildScopeCondition(filter, { branchId: products.branchId }, 'branchId');
        if (prodScope) prodConds.push(prodScope);
        if (!filter && userBranchId) prodConds.push(eq(products.branchId, userBranchId));
        if (search) {
            const s = String(search);
            prodConds.push(or(ilike(products.name, `%${s}%`), ilike(products.sku, `%${s}%`), ilike(products.barcode, `%${s}%`)));
        }
        const prodWhere = and(...prodConds);

        const [productRows, [{ value: total }]] = await Promise.all([
            db.query.products.findMany({
                where: prodWhere,
                offset: skip,
                limit: Number(limit),
                with: { category: { columns: { id: true, name: true } }, inventory: true },
                orderBy: asc(products.name),
            }),
            db.select({ value: count() }).from(products).where(prodWhere),
        ]);

        // Transform data to include stock from inventory
        let productsWithStock = productRows.map(product => {
            const totalStock = product.inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
            return {
                id: product.id,
                name: product.name,
                sku: product.sku,
                barcode: product.barcode,
                price: product.price,
                salePrice: product.salePrice,
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
        const totalPages = Math.ceil(total / Number(limit));

        res.json({ 
            success: true, 
            data: productsWithStock,
            total: lowStock === 'true' || outOfStock === 'true' ? totalFiltered : total,
            page: Number(page),
            limit: Number(limit),
            totalPages,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: lowStock === 'true' || outOfStock === 'true' ? totalFiltered : total,
                pages: totalPages,
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get inventory stats (for dashboard cards)
inventoryRoutes.get('/stats', authenticate, branchFilter(), queryCache(30, 'inventory'), async (req, res, next) => {
    try {
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        const userBranchId = filter?.branchIds?.[0] || (req.user as any)?.branchId;
        
        // Get all products with inventory (filtered by branch for non-admin users)
        const statsConds: any[] = [eq(products.isActive, true)];
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
        
        statsProducts.forEach(product => {
            const totalStock = product.inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
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
inventoryRoutes.get('/movements', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { productId, branchId, type, startDate, endDate, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        
        const mvConds: any[] = [];
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
inventoryRoutes.put('/adjust', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { productId, quantity, type, reason, reference } = req.body;
        const userId = req.user!.userId;
        // Get branchId from request body or from user's assigned branch
        const branchId = req.body.branchId || (req.user as any)?.branchId;
        
        if (!branchId) {
            return res.status(400).json({ 
                success: false, 
                error: { code: 'BRANCH_REQUIRED', message: 'Branch ID is required' } 
            });
        }

        const currentInventory = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, productId), eq(inventory.branchId, branchId)) });
        const previousQty = currentInventory?.quantity || 0;
        const newQty = Math.max(0, previousQty + quantity);
        const movementType = quantity > 0 ? 'IN' : 'OUT';

        const [movement] = await db.insert(stockMovements).values({
            productId, branchId, quantity: Math.abs(quantity), previousQty, newQty, type: movementType,
            reason: reason || (type === 'add' ? 'Stock Addition' : 'Stock Reduction'), reference, referenceType: 'ADJUSTMENT', userId,
        }).returning();

        if (currentInventory) {
            await db.update(inventory).set({ quantity: newQty, available: Math.max(0, newQty - currentInventory.reserved) }).where(eq(inventory.id, currentInventory.id));
        } else {
            await db.insert(inventory).values({ productId, branchId, quantity: newQty, available: newQty, reserved: 0 });
        }

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
inventoryRoutes.post('/transfer', authenticate, authorize('inventory:transfer'), async (req, res, next) => {
    try {
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

        // Validate both branches exist
        const [fromBranch, toBranch] = await Promise.all([
            db.query.branches.findFirst({ where: eq(branches.id, fromBranchId), columns: { id: true, name: true } }),
            db.query.branches.findFirst({ where: eq(branches.id, toBranchId), columns: { id: true, name: true } }),
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

        const fromInventory = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, productId), eq(inventory.branchId, fromBranchId)) });

        // Validate stock availability at source
        if (!fromInventory || fromInventory.quantity < quantity) {
            return res.status(400).json({
                success: false,
                error: { 
                    code: 'INSUFFICIENT_STOCK', 
                    message: `ສະຕອກບໍ່ພຽງພໍ (ມີ: ${fromInventory?.quantity || 0}, ຕ້ອງການ: ${quantity})` 
                }
            });
        }

        const toInventory = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, productId), eq(inventory.branchId, toBranchId)) });

        const fromPreviousQty = fromInventory.quantity;
        const toPreviousQty = toInventory?.quantity || 0;
        const fromNewQty = fromPreviousQty - quantity;
        const toNewQty = toPreviousQty + quantity;
        const transferReason = reason || `ໂອນຈາກ ${fromBranch.name} ໄປ ${toBranch.name}`;

        const result = await db.transaction(async (tx) => {
            const [outMovement] = await tx.insert(stockMovements).values({
                productId, branchId: fromBranchId, quantity, previousQty: fromPreviousQty, newQty: fromNewQty,
                type: 'TRANSFER_OUT', reason: transferReason, reference: toBranchId, referenceType: 'TRANSFER', userId,
            }).returning();

            await tx.insert(stockMovements).values({
                productId, branchId: toBranchId, quantity, previousQty: toPreviousQty, newQty: toNewQty,
                type: 'TRANSFER_IN', reason: transferReason, reference: fromBranchId, referenceType: 'TRANSFER', userId,
            });

            await tx.update(inventory).set({ quantity: fromNewQty, available: Math.max(0, fromNewQty - fromInventory.reserved) }).where(eq(inventory.id, fromInventory.id));

            if (toInventory) {
                await tx.update(inventory).set({ quantity: toNewQty, available: Math.max(0, toNewQty - toInventory.reserved) }).where(eq(inventory.id, toInventory.id));
            } else {
                await tx.insert(inventory).values({ productId, branchId: toBranchId, quantity: toNewQty, available: toNewQty, reserved: 0 });
            }

            return outMovement;
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
                transferId: result.id,
                from: { branchId: fromBranchId, branchName: fromBranch.name, previousQty: fromPreviousQty, newQty: fromNewQty },
                to: { branchId: toBranchId, branchName: toBranch.name, previousQty: toPreviousQty, newQty: toNewQty },
                quantity,
            } 
        });
    } catch (error) {
        next(error);
    }
});

// Out of stock items
inventoryRoutes.get('/out-of-stock', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user?.branchId;

        const oosConds: any[] = [lte(inventory.quantity, 0)];
        if (filter?.branchIds?.length) oosConds.push(inArray(inventory.branchId, filter.branchIds));
        else if (branchId) oosConds.push(eq(inventory.branchId, branchId));

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
inventoryRoutes.get('/alerts', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = (req as any).branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user?.branchId || String(req.query.branchId);

        const alertConds: any[] = [lte(inventory.quantity, 10)];
        if (filter?.branchIds?.length) alertConds.push(inArray(inventory.branchId, filter.branchIds));
        else if (branchId) alertConds.push(eq(inventory.branchId, branchId));

        const lowStock = await db.query.inventory.findMany({ where: and(...alertConds), with: { product: true } });

        res.json({ success: true, data: lowStock });
    } catch (error) {
        next(error);
    }
});

// VENDORS
// ═══════════════════════════════════════════════════════════════════════════

// Get all vendors with pagination
inventoryRoutes.get('/vendors', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { search, isActive, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        
        const vConds: any[] = [];
        if (search) {
            const s = String(search);
            vConds.push(or(ilike(vendors.name, `%${s}%`), ilike(vendors.code, `%${s}%`), ilike(vendors.contactName, `%${s}%`)));
        }
        if (isActive !== undefined) vConds.push(eq(vendors.isActive, isActive === 'true'));
        const vWhere = vConds.length > 0 ? and(...vConds) : undefined;

        const [vendorRows, [{ value: total }]] = await Promise.all([
            db.query.vendors.findMany({ where: vWhere, offset: skip, limit: Number(limit), orderBy: asc(vendors.name) }),
            db.select({ value: count() }).from(vendors).where(vWhere),
        ]);

        res.json({ 
            success: true, 
            data: vendorRows,
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

// Get vendor by ID
inventoryRoutes.get('/vendors/:id', authenticate, async (req, res, next) => {
    try {
        const vendor = await db.query.vendors.findFirst({
            where: eq(vendors.id, req.params.id),
            with: { purchaseOrders: { limit: 10, orderBy: desc(purchaseOrders.createdAt) } },
        });

        if (!vendor) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Vendor not found' } });
            return;
        }

        res.json({ success: true, data: vendor });
    } catch (error) {
        next(error);
    }
});

// Create vendor
inventoryRoutes.post('/vendors', authenticate, authorize('inventory:create'), async (req, res, next) => {
    try {
        const { name, contactName, phone, email, address, notes, code, taxId, paymentTerms } = req.body;
        
        if (!name || !name.trim()) {
            res.status(400).json({ 
                success: false, 
                error: { code: 'VAL_001', message: 'ກະລຸນາປ້ອນຊື່ຜູ້ສະໜອງ' } 
            });
            return;
        }
        
        const [vendor] = await db.insert(vendors).values({
            name: name.trim(), contactName: contactName?.trim() || null, phone: phone?.trim() || null,
            email: email?.trim() || null, address: address?.trim() || null, notes: notes?.trim() || null,
            code: code?.trim() || null, taxId: taxId?.trim() || null, paymentTerms: paymentTerms ?? 30, isActive: true,
        }).returning();
        res.status(201).json({ success: true, data: vendor });
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

// Update vendor
inventoryRoutes.put('/vendors/:id', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { name, contactName, phone, email, address, notes, code, taxId, paymentTerms, isActive } = req.body;
        
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
        
        const [vendor] = await db.update(vendors).set(updateData).where(eq(vendors.id, req.params.id)).returning();
        if (!vendor) { res.status(404).json({ success: false, error: { code: 'RES_001', message: 'ບໍ່ພົບຜູ້ສະໜອງນີ້' } }); return; }
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
inventoryRoutes.delete('/vendors/:id', authenticate, authorize('inventory:delete'), async (req, res, next) => {
    try {
        const [{ value: orderCount }] = await db.select({ value: count() }).from(purchaseOrders).where(eq(purchaseOrders.vendorId, req.params.id));
        if (orderCount > 0) {
            res.status(400).json({ success: false, error: { code: 'REF_001', message: `ບໍ່ສາມາດລຶບໄດ້ ເນື່ອງຈາກມີ ${orderCount} ໃບສັ່ງຊື້ທີ່ກ່ຽວຂ້ອງ` } });
            return;
        }
        await db.delete(vendors).where(eq(vendors.id, req.params.id));
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
// PURCHASE ORDERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all purchase orders
inventoryRoutes.get('/purchase-orders', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { branchId, vendorId, status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;
        
        const poConds: any[] = [];
        const poScope = buildScopeCondition(filter, { branchId: purchaseOrders.branchId }, 'branchId');
        if (poScope) poConds.push(poScope);
        if (branchId) poConds.push(eq(purchaseOrders.branchId, String(branchId)));
        if (vendorId) poConds.push(eq(purchaseOrders.vendorId, String(vendorId)));
        if (status) poConds.push(eq(purchaseOrders.status, String(status)));
        const poWhere = poConds.length > 0 ? and(...poConds) : undefined;

        const [orders, [{ value: total }]] = await Promise.all([
            db.query.purchaseOrders.findMany({ where: poWhere, offset: skip, limit: Number(limit), with: { vendor: true, items: true }, orderBy: desc(purchaseOrders.createdAt) }),
            db.select({ value: count() }).from(purchaseOrders).where(poWhere),
        ]);

        res.json({
            success: true,
            data: orders,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get purchase order by ID (scope-checked)
inventoryRoutes.get('/purchase-orders/:id', authenticate, async (req, res, next) => {
    try {
        const order = await db.query.purchaseOrders.findFirst({
            where: eq(purchaseOrders.id, req.params.id),
            with: { vendor: true, items: true },
        });

        if (!order) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Purchase order not found' } });
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
inventoryRoutes.post('/purchase-orders', authenticate, authorize('inventory:create'), async (req, res, next) => {
    try {
        const { items, ...orderData } = req.body;
        const userId = req.user!.userId;

        const [{ value: poCnt }] = await db.select({ value: count() }).from(purchaseOrders);
        const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(poCnt + 1).padStart(4, '0')}`;

        const subtotal = items.reduce((s: number, item: { quantity: number; unitCost: number }) => s + (item.quantity * item.unitCost), 0);
        const tax = (subtotal * (orderData.taxRate || 0)) / 100;
        const discount = orderData.discount || 0;
        const total = subtotal + tax - discount;

        const [po] = await db.insert(purchaseOrders).values({ ...orderData, poNumber, subtotal, tax, discount, total, createdBy: userId }).returning();
        if (items.length > 0) {
            await db.insert(purchaseOrderItems).values(items.map((item: any) => ({
                purchaseOrderId: po.id, productId: item.productId, productName: item.productName,
                quantity: item.quantity, unitCost: item.unitCost, total: item.quantity * item.unitCost,
            })));
        }
        const order = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, po.id), with: { vendor: true, items: true } });
        res.status(201).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Update purchase order
inventoryRoutes.put('/purchase-orders/:id', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        await db.update(purchaseOrders).set(req.body).where(eq(purchaseOrders.id, req.params.id));
        const order = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, req.params.id), with: { vendor: true, items: true } });
        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Update purchase order status
inventoryRoutes.patch('/purchase-orders/:id/status', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { status } = req.body;
        const userId = req.user!.userId;

        const updateData: Record<string, unknown> = { status };
        if (status === 'APPROVED') {
            updateData.approvedBy = userId;
            updateData.approvedAt = new Date();
        }
        if (status === 'RECEIVED') {
            updateData.receivedDate = new Date();
        }

        await db.update(purchaseOrders).set(updateData).where(eq(purchaseOrders.id, req.params.id));
        const order = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, req.params.id), with: { items: true } });

        if (status === 'RECEIVED' && order) {
            for (const item of order.items) {
                const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, item.productId), eq(inventory.branchId, order.branchId)) });
                if (inv) {
                    await db.update(inventory).set({ quantity: inv.quantity + item.quantity }).where(eq(inventory.id, inv.id));
                } else {
                    await db.insert(inventory).values({ productId: item.productId, branchId: order.branchId, quantity: item.quantity });
                }
                await db.insert(stockMovements).values({
                    productId: item.productId, branchId: order.branchId, type: 'IN', quantity: item.quantity,
                    previousQty: inv?.quantity || 0, newQty: (inv?.quantity || 0) + item.quantity,
                    reason: 'Purchase Order Received', reference: order.id, referenceType: 'PURCHASE', userId,
                });
            }
        }

        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Delete purchase order
inventoryRoutes.delete('/purchase-orders/:id', authenticate, authorize('inventory:delete'), async (req, res, next) => {
    try {
        const order = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, req.params.id) });
        if (order?.status !== 'DRAFT') {
            res.status(400).json({ success: false, error: { code: 'INV_001', message: 'Can only delete draft orders' } });
            return;
        }
        await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, req.params.id));
        await db.delete(purchaseOrders).where(eq(purchaseOrders.id, req.params.id));
        
        res.json({ success: true, data: { message: 'Purchase order deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STOCK TRANSFERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all stock transfers
inventoryRoutes.get('/stock-transfers', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { fromBranchId, toBranchId, status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        
        const stConds: any[] = [];
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
inventoryRoutes.post('/stock-transfers', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { items, fromBranchId, toBranchId, ...transferData } = req.body;
        const userId = req.user!.userId;

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

        const [st] = await db.insert(stockTransfers).values({ ...transferData, fromBranchId, toBranchId, transferNo, requestedBy: userId }).returning();
        if (items.length > 0) {
            await db.insert(stockTransferItems).values(items.map((item: any) => ({ transferId: st.id, productId: item.productId, productName: item.productName, quantity: item.quantity })));
        }
        const transfer = await db.query.stockTransfers.findFirst({ where: eq(stockTransfers.id, st.id), with: { items: true } });
        res.status(201).json({ success: true, data: transfer });
    } catch (error) {
        next(error);
    }
});

// Expiry tracking with pagination
inventoryRoutes.get('/expiring', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { branchId, days = 90, page = 1, limit = 20, search, daysFilter } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + Number(days));
        const scopeFilter = (req as any).branchFilter as ScopeFilter | undefined;

        const expConds: any[] = [isNotNull(inventory.expiryDate), lte(inventory.expiryDate, futureDate), gt(inventory.quantity, 0)];
        if (branchId) expConds.push(eq(inventory.branchId, String(branchId)));
        else if (scopeFilter?.branchIds?.length) expConds.push(inArray(inventory.branchId, scopeFilter.branchIds));

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

// Get stock in records
inventoryRoutes.get('/stock-in', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;

        const siConds: any[] = [eq(stockMovements.type, 'IN')];
        if (filter?.branchIds?.length) siConds.push(inArray(stockMovements.branchId, filter.branchIds));
        if (search) {
            const s = String(search);
            siConds.push(or(ilike(stockMovements.reference, `%${s}%`), ilike(stockMovements.supplier, `%${s}%`), ilike(stockMovements.batchNumber, `%${s}%`)));
        }
        const siWhere = and(...siConds);

        const [movements, [{ value: total }]] = await Promise.all([
            db.query.stockMovements.findMany({ where: siWhere, offset: skip, limit: Number(limit), orderBy: desc(stockMovements.createdAt) }),
            db.select({ value: count() }).from(stockMovements).where(siWhere),
        ]);

        const productIds = [...new Set(movements.map(m => m.productId))];
        const prodRows = productIds.length > 0 ? await db.query.products.findMany({ where: inArray(products.id, productIds), columns: { id: true, name: true, sku: true } }) : [];
        const productMap = new Map(prodRows.map(p => [p.id, p]));

        res.json({
            success: true,
            data: movements.map(m => ({ ...m, product: productMap.get(m.productId) || null })),
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get stock out records
inventoryRoutes.get('/stock-out', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;

        const soConds: any[] = [eq(stockMovements.type, 'OUT')];
        if (filter?.branchIds?.length) soConds.push(inArray(stockMovements.branchId, filter.branchIds));
        if (search) {
            const s = String(search);
            soConds.push(or(ilike(stockMovements.reference, `%${s}%`), ilike(stockMovements.reason, `%${s}%`)));
        }
        const soWhere = and(...soConds);

        const [movements, [{ value: total }]] = await Promise.all([
            db.query.stockMovements.findMany({ where: soWhere, offset: skip, limit: Number(limit), orderBy: desc(stockMovements.createdAt) }),
            db.select({ value: count() }).from(stockMovements).where(soWhere),
        ]);

        const productIds = [...new Set(movements.map(m => m.productId))];
        const prodRows = productIds.length > 0 ? await db.query.products.findMany({ where: inArray(products.id, productIds), columns: { id: true, name: true, sku: true } }) : [];
        const productMap = new Map(prodRows.map(p => [p.id, p]));

        res.json({
            success: true,
            data: movements.map(m => ({ ...m, quantity: Math.abs(m.quantity), product: productMap.get(m.productId) || null })),
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create stock out
inventoryRoutes.post('/stock-out', authenticate, authorize('inventory:create'), async (req, res, next) => {
    try {
        const { productId, quantity, reason, reference, notes, date } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, productId), eq(inventory.branchId, branchId)) });
        const previousQty = inv?.quantity || 0;
        const outQty = Math.abs(Number(quantity));
        const newQty = Math.max(0, previousQty - outQty);

        const [movement] = await db.insert(stockMovements).values({
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
inventoryRoutes.post('/stock-in', authenticate, authorize('inventory:create'), async (req, res, next) => {
    try {
        const { productId, quantity, unitCost, supplier, reference, notes, date, expiryDate, batchNumber } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        const batchConds: any[] = [eq(inventory.productId, productId), eq(inventory.branchId, branchId)];
        if (batchNumber) batchConds.push(eq(inventory.batchNumber, batchNumber));
        else batchConds.push(isNull(inventory.batchNumber));
        const inv = await db.query.inventory.findFirst({ where: and(...batchConds) });
        const previousQty = inv?.quantity || 0;
        const newQty = previousQty + Number(quantity);

        const [movement] = await db.insert(stockMovements).values({
            productId, branchId, quantity: Number(quantity), previousQty, newQty,
            unitCost: unitCost ? Number(unitCost) : null, supplier: supplier || null,
            type: 'IN', reason: supplier || 'Stock In', reference, notes, userId,
            expiryDate: expiryDate ? new Date(expiryDate) : null, batchNumber: batchNumber || null,
            createdAt: date ? new Date(date) : new Date(),
        }).returning();

        if (inv) {
            await db.update(inventory).set({ quantity: newQty, expiryDate: expiryDate ? new Date(expiryDate) : inv.expiryDate }).where(eq(inventory.id, inv.id));
        } else {
            await db.insert(inventory).values({ productId, branchId, quantity: newQty, expiryDate: expiryDate ? new Date(expiryDate) : null, batchNumber: batchNumber || null });
        }

        res.status(201).json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// Update stock in
inventoryRoutes.put('/stock-in/:id', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { productId, quantity, unitCost, supplier, reference, notes, date, expiryDate, batchNumber } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        const existing = await db.query.stockMovements.findFirst({ where: eq(stockMovements.id, id) });
        if (!existing) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
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
        }).where(eq(stockMovements.id, id)).returning();

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
inventoryRoutes.delete('/stock-in/:id', authenticate, authorize('inventory:delete'), async (req, res, next) => {
    try {
        const movement = await db.query.stockMovements.findFirst({ where: eq(stockMovements.id, req.params.id) });
        if (!movement) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
        }
        const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, movement.productId), eq(inventory.branchId, movement.branchId)) });
        if (inv) await db.update(inventory).set({ quantity: Math.max(0, inv.quantity - Math.abs(movement.quantity)) }).where(eq(inventory.id, inv.id));
        await db.delete(stockMovements).where(eq(stockMovements.id, req.params.id));
        res.json({ success: true, data: { message: 'Deleted successfully' } });
    } catch (error) {
        next(error);
    }
});

// Update stock out
inventoryRoutes.put('/stock-out/:id', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { productId, quantity, reason, reference, notes, date } = req.body;
        const branchId = req.user!.branchId || 'default';

        const existing = await db.query.stockMovements.findFirst({ where: eq(stockMovements.id, id) });
        if (!existing) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
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
        }).where(eq(stockMovements.id, id)).returning();

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
inventoryRoutes.delete('/stock-out/:id', authenticate, authorize('inventory:delete'), async (req, res, next) => {
    try {
        const movement = await db.query.stockMovements.findFirst({ where: eq(stockMovements.id, req.params.id) });
        if (!movement) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
            return;
        }

        const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, movement.productId), eq(inventory.branchId, movement.branchId)) });
        if (inv) await db.update(inventory).set({ quantity: inv.quantity + Math.abs(movement.quantity) }).where(eq(inventory.id, inv.id));

        await db.delete(stockMovements).where(eq(stockMovements.id, req.params.id));
        res.json({ success: true, data: { message: 'Deleted successfully' } });
    } catch (error) {
        next(error);
    }
});

// Get adjustments
inventoryRoutes.get('/adjustments', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { search, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const scopeFilter = (req as any).branchFilter as ScopeFilter | undefined;

        const adjConds: any[] = [inArray(stockMovements.type, ['ADJUSTMENT', 'INCREASE', 'DECREASE'])];
        if (scopeFilter?.branchIds?.length) adjConds.push(inArray(stockMovements.branchId, scopeFilter.branchIds));
        if (search) {
            const s = String(search);
            adjConds.push(or(ilike(stockMovements.reference, `%${s}%`), ilike(stockMovements.reason, `%${s}%`)));
        }
        const adjWhere = and(...adjConds);

        const [movements, [{ value: total }]] = await Promise.all([
            db.query.stockMovements.findMany({ where: adjWhere, offset: skip, limit: Number(limit), orderBy: desc(stockMovements.createdAt) }),
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
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Update/Create adjustment (PUT for adjusting inventory)
inventoryRoutes.put('/adjustments', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { productId, adjustmentType, quantity, reason, reference, notes, date } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, productId), eq(inventory.branchId, branchId)) });
        const previousQty = inv?.quantity || 0;
        const adjustQty = adjustmentType === 'increase' ? Number(quantity) : -Number(quantity);
        const newQty = Math.max(0, previousQty + adjustQty);

        const [movement] = await db.insert(stockMovements).values({
            productId, branchId, quantity: adjustQty, previousQty, newQty,
            type: adjustmentType === 'increase' ? 'INCREASE' : 'DECREASE',
            reason, reference, notes, userId, createdAt: date ? new Date(date) : new Date(),
        }).returning();

        if (inv) {
            await db.update(inventory).set({ quantity: newQty }).where(eq(inventory.id, inv.id));
        } else {
            await db.insert(inventory).values({ productId, branchId, quantity: newQty });
        }

        res.status(201).json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// Get transfers
inventoryRoutes.get('/transfers', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { search, status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const scopeFilter = (req as any).branchFilter as ScopeFilter | undefined;

        const trConds: any[] = [];
        if (scopeFilter?.branchIds?.length) {
            trConds.push(or(inArray(stockTransfers.fromBranchId, scopeFilter.branchIds), inArray(stockTransfers.toBranchId, scopeFilter.branchIds)));
        }
        if (status) trConds.push(eq(stockTransfers.status, String(status)));
        const trWhere = trConds.length > 0 ? and(...trConds) : undefined;

        const [transfers, [{ value: total }]] = await Promise.all([
            db.query.stockTransfers.findMany({ where: trWhere, offset: skip, limit: Number(limit), with: { items: true }, orderBy: desc(stockTransfers.createdAt) }),
            db.select({ value: count() }).from(stockTransfers).where(trWhere),
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

// Create transfer
inventoryRoutes.post('/transfers', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { productId, quantity, fromBranchId, toBranchId, reference, notes, date } = req.body;
        const userId = req.user!.userId;

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

        const [tr] = await db.insert(stockTransfers).values({ transferNo, fromBranchId, toBranchId, status: 'completed', notes, requestedBy: userId }).returning();
        await db.insert(stockTransferItems).values([{ transferId: tr.id, productId, productName: product?.name || '', quantity: qty }]);

        await db.insert(stockMovements).values([
            { productId, branchId: fromBranchId, quantity: -qty, previousQty: fromPreviousQty, newQty: fromPreviousQty - qty, type: 'TRANSFER_OUT', reason: `ໂອນໄປ ${toBranchId}`, reference: transferNo, userId },
            { productId, branchId: toBranchId, quantity: qty, previousQty: toPreviousQty, newQty: toPreviousQty + qty, type: 'TRANSFER_IN', reason: `ໂອນມາຈາກ ${fromBranchId}`, reference: transferNo, userId },
        ]);

        if (fromInv) await db.update(inventory).set({ quantity: fromInv.quantity - qty }).where(eq(inventory.id, fromInv.id));
        if (toInv) {
            await db.update(inventory).set({ quantity: toInv.quantity + qty }).where(eq(inventory.id, toInv.id));
        } else {
            await db.insert(inventory).values({ productId, branchId: toBranchId, quantity: qty });
        }

        const transfer = await db.query.stockTransfers.findFirst({ where: eq(stockTransfers.id, tr.id), with: { items: true } });
        res.status(201).json({ success: true, data: transfer });
    } catch (error) {
        next(error);
    }
});

// Get stock counts
inventoryRoutes.get('/stock-counts', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;

        const scConds: any[] = [];
        if (filter?.branchIds?.length) scConds.push(inArray(stockCounts.branchId, filter.branchIds));
        if (status) scConds.push(eq(stockCounts.status, String(status)));
        const scWhere = scConds.length > 0 ? and(...scConds) : undefined;

        const [counts, [{ value: total }]] = await Promise.all([
            db.query.stockCounts.findMany({ where: scWhere, offset: skip, limit: Number(limit), with: { items: true }, orderBy: desc(stockCounts.createdAt) }),
            db.select({ value: count() }).from(stockCounts).where(scWhere),
        ]);

        res.json({
            success: true,
            data: counts,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create stock count
inventoryRoutes.post('/stock-counts', authenticate, authorize('inventory:adjust'), async (req, res, next) => {
    try {
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

        const [sc] = await db.insert(stockCounts).values({ countNo, branchId, date: date ? new Date(date) : new Date(), notes, status: 'pending', hasDiscrepancy, countedBy: userId }).returning();
        if (itemsWithProducts.length > 0) {
            await db.insert(stockCountItems).values(itemsWithProducts.map(i => ({ ...i, countId: sc.id })));
        }
        const stockCount = await db.query.stockCounts.findFirst({ where: eq(stockCounts.id, sc.id), with: { items: true } });
        res.status(201).json({ success: true, data: stockCount });
    } catch (error) {
        next(error);
    }
});