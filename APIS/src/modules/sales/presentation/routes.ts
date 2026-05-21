// ═══════════════════════════════════════════════════════════════════════════
// Sales Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, ensureScopeAccess, buildScopeCondition, tenantScope, invalidateQueryCache, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { publish, QUEUES } from '@/config/rabbitmq.config';
import { db } from '@/config/database.config';
import { transactions, transactionItems, transactionPayments, products, inventory, stockMovements, paymentMethods, shifts, cashRegisters, cashMovements, heldSales } from '@/db/schema/tables';
import { eq, and, or, ne, ilike, inArray, gte, lte, desc, asc, count, sum, sql } from 'drizzle-orm';
import { queueActivityLog } from '@/infrastructure/helpers/activity-log.helper';

export const salesRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// CREATE SALE (Transaction)
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.post('/', authenticate, async (req, res, next) => {
    try {
        const {
            items,
            customerId,
            memberId,
            paymentMethod,
            paymentMethodId,
            discountType,
            discountValue = 0,
            taxRate = 7,
            notes,
            orderType = 'WALKIN',
        } = req.body;

        const branchId = req.authUser?.activeBranchId || req.user?.branchId;
        const userId = req.authUser?.userId || req.user?.userId;
        const storeId = req.authUser?.activeStoreId || undefined;

        if (!branchId || !userId) {
            return res.status(400).json({ success: false, error: { code: 'AUTH_001', message: 'User or branch not resolved' } });
        }

        // BE-51: CRITICAL — tenant-scoped product lookup prevents cross-tenant purchases
        const saleTenantId = req.authUser?.tenantId || req.user?.tenantId;

        // Calculate totals
        let subtotal = 0;
        const txItems = [];

        for (const item of items) {
            const productConds: any[] = [eq(products.id, item.productId)];
            if (saleTenantId && !req.authUser?.isSuperAdmin) {
                productConds.push(eq(products.tenantId, saleTenantId));
            }
            const product = await db.query.products.findFirst({
                where: and(...productConds),
                columns: { id: true, name: true, sku: true, barcode: true, price: true, cost: true },
            });

            if (!product) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'PRODUCT_NOT_FOUND', message: `Product ${item.productId} not found` }
                });
            }

            const unitPrice = item.price || product.price;
            const quantity = item.quantity;
            const itemDiscount = item.discount || 0;
            const itemTotal = (unitPrice * quantity) - itemDiscount;
            subtotal += itemTotal;

            txItems.push({
                productId: item.productId,
                productName: product.name,
                sku: product.sku,
                barcode: product.barcode,
                quantity,
                unitPrice,
                cost: product.cost,
                discountType: item.discountType,
                discountValue: item.discountValue || 0,
                discountAmount: itemDiscount,
                taxRate: 0,
                taxAmount: 0,
                total: itemTotal,
                note: item.note,
            });
        }

        // Calculate discount
        let discountAmount = 0;
        if (discountType === 'PERCENTAGE') {
            discountAmount = (subtotal * discountValue) / 100;
        } else if (discountType === 'FIXED') {
            discountAmount = discountValue;
        }

        // Calculate tax
        const taxableAmount = subtotal - discountAmount;
        const taxAmount = (taxableAmount * taxRate) / 100;
        const totalAmount = taxableAmount + taxAmount;

        // Generate transaction number with timestamp for uniqueness
        const now = new Date();
        const today = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.getTime().toString().slice(-6); // Last 6 digits of timestamp
        const [{ value: txCount }] = await db.select({ value: count() }).from(transactions).where(gte(transactions.createdAt, new Date(now.setHours(0, 0, 0, 0))));
        const transactionNo = `TXN-${branchId.slice(-4)}-${today}-${String(txCount + 1).padStart(4, '0')}-${timeStr}`;

        // Get payment method details
        let methodName = paymentMethod || 'CASH';
        let methodId = paymentMethodId;

        if (!methodId) {
            const method = await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.type, methodName) });
            if (method) { methodId = method.id; methodName = method.name; }
        }

        // BE-52: Create transaction with tenantId
        const [transaction] = await db.insert(transactions).values({
            tenantId: saleTenantId,
            transactionNo, type: 'SALE', status: 'COMPLETED', branchId, storeId, userId, customerId, memberId, orderType,
            subtotal, discountType, discountValue, discountAmount, taxAmount, total: totalAmount, received: totalAmount, change: 0, note: notes,
        }).returning();

        // BE-53: Create items with tenantId
        if (txItems.length > 0) {
            await db.insert(transactionItems).values(txItems.map(ti => ({ ...ti, transactionId: transaction.id, tenantId: saleTenantId })));
        }

        // Create payment
        if (methodId) {
            await db.insert(transactionPayments).values({ transactionId: transaction.id, methodId, methodName, amount: totalAmount });
        }

        // Fetch full transaction with relations
        const fullTransaction = await db.query.transactions.findFirst({
            where: eq(transactions.id, transaction.id),
            with: { items: { with: { product: true } }, customer: true, payments: true },
        });

        // Publish stock deduction to RabbitMQ (async) or fall back to sync
        for (const item of items) {
            const published = publish(QUEUES.STOCK_MOVEMENT, {
                productId: item.productId,
                branchId,
                storeId,
                type: 'OUT',
                quantity: item.quantity,
                reason: 'Sale',
                reference: transaction.id,
                referenceType: 'SALE',
                userId,
            });

            if (!published) {
                const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, item.productId), eq(inventory.branchId, branchId)) });
                if (inv) {
                    const previousQty = inv.quantity;
                    const newQty = previousQty - item.quantity;
                    await db.update(inventory).set({ quantity: newQty, available: newQty - inv.reserved }).where(eq(inventory.id, inv.id));
                    await db.insert(stockMovements).values({
                        tenantId: saleTenantId,
                        productId: item.productId, branchId, storeId, type: 'OUT',
                        quantity: item.quantity, previousQty, newQty,
                        reason: 'Sale', reference: transaction.id, referenceType: 'SALE', userId,
                    });
                }
            }
        }

        // Invalidate dashboard & inventory caches after sale
        invalidateQueryCache('dashboard*').catch(() => {});
        invalidateQueryCache('inventory*').catch(() => {});

        // Log activity async
        queueActivityLog(userId, 'sale_created', 'sales', `ສ້າງການຂາຍ ${transaction.transactionNo} ມູນຄ່າ ${transaction.total}`, { transactionId: transaction.id }, req).catch(() => {});

        res.status(201).json({ success: true, data: fullTransaction });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL SALES (Transactions)
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { page = 1, limit = 50, startDate, endDate, status, type, branchId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const userPermissions = req.authUser?.permissions || [];
        const filter = req.branchFilter;

        const txConds: any[] = [eq(transactions.type, 'SALE')];

        // BE-79: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) {
            txConds.push(eq(transactions.tenantId, tenantId));
        }

        const canViewAllSales = userPermissions.includes('sales:view') || userPermissions.includes('*');
        const canViewOwnSales = userPermissions.includes('sales:view-own');
        if (!canViewAllSales && canViewOwnSales) txConds.push(eq(transactions.userId, req.authUser?.userId || req.user?.userId || ''));

        const scopeCond = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (scopeCond) txConds.push(scopeCond);

        if (branchId) txConds.push(eq(transactions.branchId, String(branchId)));
        else if (!filter) txConds.push(eq(transactions.branchId, req.authUser?.activeBranchId || req.user?.branchId || ''));

        if (status) txConds.push(eq(transactions.status, String(status)));
        if (type) txConds.push(eq(transactions.type, String(type)));
        if (startDate) txConds.push(gte(transactions.createdAt, new Date(String(startDate))));
        if (endDate) txConds.push(lte(transactions.createdAt, new Date(String(endDate))));

        const txWhere = and(...txConds);

        const [txRows, [{ value: total }]] = await Promise.all([
            db.query.transactions.findMany({
                where: txWhere,
                offset: skip,
                limit: Number(limit),
                with: { items: true, customer: true, payments: true, user: { columns: { id: true, name: true } } },
                orderBy: desc(transactions.createdAt),
            }),
            db.select({ value: count() }).from(transactions).where(txWhere),
        ]);

        res.json({
            success: true,
            data: txRows,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET SALE BY ID (must be after all specific routes like /held, /credit)
// Note: Using regex to match only valid MongoDB ObjectIds (24 hex characters)
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.get('/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', authenticate, async (req, res, next) => {
    try {
        // BE-54: Tenant-scoped transaction lookup
        const tenantId = req.authUser?.tenantId;
        const txConds: any[] = [eq(transactions.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            txConds.push(eq(transactions.tenantId, tenantId));
        }

        const transaction = await db.query.transactions.findFirst({
            where: and(...txConds),
            with: { items: { with: { product: true } }, customer: true, member: true, payments: true, user: { columns: { id: true, name: true } } },
        });

        if (!transaction) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Transaction not found or no access' }
            });
        }

        if (!ensureScopeAccess(transaction, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        res.json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// VOID SALE
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.post('/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/void', authenticate, authorize('sales:delete'), async (req, res, next) => {
    try {
        const { reason } = req.body;

        // BE-55: Tenant-scoped void
        const tenantId = req.authUser?.tenantId;
        const voidConds: any[] = [eq(transactions.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            voidConds.push(eq(transactions.tenantId, tenantId));
        }

        const transaction = await db.query.transactions.findFirst({
            where: and(...voidConds),
            with: { items: true },
        });

        if (!transaction) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Transaction not found or no access' } });
        }

        if (!ensureScopeAccess(transaction, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this transaction' } });
        }

        if (transaction.status === 'VOIDED') {
            return res.status(400).json({ success: false, error: { code: 'ALREADY_VOIDED', message: 'Transaction already voided' } });
        }

        await db.update(transactions).set({ status: 'VOIDED', voidReason: reason }).where(eq(transactions.id, req.params.id));

        for (const item of transaction.items) {
            const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, item.productId), eq(inventory.branchId, transaction.branchId)) });
            if (inv) {
                const previousQty = inv.quantity;
                const newQty = previousQty + item.quantity;
                await db.update(inventory).set({ quantity: newQty, available: newQty - inv.reserved }).where(eq(inventory.id, inv.id));
                await db.insert(stockMovements).values({
                    productId: item.productId, branchId: transaction.branchId, type: 'IN',
                    quantity: item.quantity, previousQty, newQty,
                    reason: `Void: ${reason || 'No reason provided'}`, reference: transaction.id, referenceType: 'VOID', userId: req.authUser?.userId || req.user?.userId || '',
                });
            }
        }

        // Invalidate caches after void
        invalidateQueryCache('dashboard*').catch(() => {});
        invalidateQueryCache('inventory*').catch(() => {});

        // Log activity async
        queueActivityLog(req.authUser?.userId || req.user?.userId || '', 'sale_voided', 'sales', `ຍົກເລີກການຂາຍ ${req.params.id}`, { transactionId: req.params.id }, req).catch(() => {});

        res.json({ success: true, message: 'Transaction voided successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// REFUND SALE
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.post('/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/refund', authenticate, authorize('sales:delete'), async (req, res, next) => {
    try {
        const { reason, items: refundItems } = req.body;

        // BE-55: Tenant-scoped refund
        const tenantId = req.authUser?.tenantId;
        const refConds: any[] = [eq(transactions.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            refConds.push(eq(transactions.tenantId, tenantId));
        }

        const transaction = await db.query.transactions.findFirst({
            where: and(...refConds),
            with: { items: true },
        });

        if (!transaction) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Transaction not found or no access' } });
        }

        if (!ensureScopeAccess(transaction, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this transaction' } });
        }

        if (transaction.status !== 'COMPLETED') {
            return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Can only refund completed transactions' } });
        }

        let refundAmount = 0;
        const itemsToRefund = refundItems || transaction.items;
        for (const item of itemsToRefund) { refundAmount += item.total || (item.unitPrice * item.quantity); }

        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const [{ value: refCnt }] = await db.select({ value: count() }).from(transactions).where(and(eq(transactions.type, 'REFUND'), gte(transactions.createdAt, new Date(new Date().setHours(0, 0, 0, 0)))));
        const transactionNo = `REF-${transaction.branchId.slice(-4)}-${today}-${String(refCnt + 1).padStart(4, '0')}`;

        const refundTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [refund] = await db.insert(transactions).values({
            tenantId: refundTenantId,
            transactionNo, type: 'REFUND', status: 'COMPLETED', branchId: transaction.branchId,
            userId: req.authUser?.userId || req.user?.userId || '', customerId: transaction.customerId, memberId: transaction.memberId,
            orderType: transaction.orderType, subtotal: -refundAmount, discountAmount: 0, taxAmount: 0,
            total: -refundAmount, received: 0, change: refundAmount, refundReason: reason, parentId: transaction.id,
        }).returning();

        await db.insert(transactionItems).values(itemsToRefund.map((item: any) => ({
            transactionId: refund.id, productId: item.productId, productName: item.productName,
            quantity: -item.quantity, unitPrice: item.unitPrice, cost: item.cost || 0,
            total: -(item.total || (item.unitPrice * item.quantity)),
        })));

        for (const item of itemsToRefund) {
            const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, item.productId), eq(inventory.branchId, transaction.branchId)) });
            if (inv) {
                const previousQty = inv.quantity;
                const newQty = previousQty + item.quantity;
                await db.update(inventory).set({ quantity: newQty, available: newQty - inv.reserved }).where(eq(inventory.id, inv.id));
                await db.insert(stockMovements).values({
                    productId: item.productId, branchId: transaction.branchId, type: 'IN',
                    quantity: item.quantity, previousQty, newQty,
                    reason: `Refund: ${reason || 'No reason provided'}`, reference: refund.id, referenceType: 'REFUND', userId: req.authUser?.userId || req.user?.userId || '',
                });
            }
        }

        await db.update(transactions).set({ status: 'REFUNDED' }).where(eq(transactions.id, req.params.id));

        const fullRefund = await db.query.transactions.findFirst({ where: eq(transactions.id, refund.id), with: { items: true } });
        res.json({ success: true, data: fullRefund });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DAILY SALES SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.get('/summary/daily', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { date } = req.query;
        const targetDate = date ? new Date(String(date)) : new Date();
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.authUser?.activeBranchId || req.user?.branchId;

        const baseConds: any[] = [gte(transactions.createdAt, startOfDay), lte(transactions.createdAt, endOfDay)];
        // BE-79: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) baseConds.push(eq(transactions.tenantId, tenantId));
        const dayScopeCond = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (dayScopeCond) baseConds.push(dayScopeCond);
        if (!filter) baseConds.push(eq(transactions.branchId, branchId));

        const [[salesStats], [{ value: voidedCount }], [refundStats]] = await Promise.all([
            db.select({ cnt: count(), total: sum(transactions.total) }).from(transactions).where(and(...baseConds, eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'))),
            db.select({ value: count() }).from(transactions).where(and(...baseConds, eq(transactions.status, 'VOIDED'))),
            db.select({ cnt: count(), total: sum(transactions.total) }).from(transactions).where(and(...baseConds, eq(transactions.type, 'REFUND'))),
        ]);

        res.json({
            success: true,
            data: {
                date: startOfDay.toISOString().slice(0, 10),
                salesCount: salesStats.cnt,
                totalRevenue: Number(salesStats.total) || 0,
                voidedCount,
                refundCount: refundStats.cnt,
                refundAmount: Math.abs(Number(refundStats.total) || 0),
                netRevenue: (Number(salesStats.total) || 0) + (Number(refundStats.total) || 0),
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SHIFTS
// ═══════════════════════════════════════════════════════════════════════════

// Get all shifts
salesRoutes.get('/shifts', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { branchId, userId, status, date, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;
        const authUser = req.authUser;
        const isSuperAdmin = authUser?.isSuperAdmin;

        const shiftConds: any[] = [];
        // G6: Tenant isolation for shifts
        const tc = tenantScope(req, shifts.tenantId);
        if (tc) shiftConds.push(tc);
        if (!isSuperAdmin) {
            const activeStoreId = authUser?.activeStoreId;
            if (activeStoreId) shiftConds.push(eq(shifts.storeId, activeStoreId));
            else if (filter?.branchIds?.length) shiftConds.push(inArray(shifts.branchId, filter.branchIds));
        }
        if (branchId) shiftConds.push(eq(shifts.branchId, String(branchId)));
        if (userId) shiftConds.push(eq(shifts.userId, String(userId)));
        if (status) shiftConds.push(eq(shifts.status, String(status)));
        // date = single day filter (e.g. "2026-05-19")
        if (date) {
            const dayStart = new Date(String(date) + 'T00:00:00.000Z');
            const dayEnd = new Date(String(date) + 'T23:59:59.999Z');
            shiftConds.push(gte(shifts.openedAt, dayStart), lte(shifts.openedAt, dayEnd));
        } else {
            if (dateFrom) shiftConds.push(gte(shifts.openedAt, new Date(String(dateFrom))));
            if (dateTo) shiftConds.push(lte(shifts.openedAt, new Date(String(dateTo))));
        }
        const shiftWhere = shiftConds.length > 0 ? and(...shiftConds) : undefined;

        const [shiftRows, [{ value: total }]] = await Promise.all([
            db.query.shifts.findMany({
                where: shiftWhere,
                offset: skip,
                limit: Number(limit),
                with: { user: { columns: { name: true, email: true } }, register: true },
                orderBy: desc(shifts.openedAt),
            }),
            db.select({ value: count() }).from(shifts).where(shiftWhere),
        ]);

        res.json({
            success: true,
            data: shiftRows,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get current user's active shift
salesRoutes.get('/shifts/current', authenticate, async (req, res, next) => {
    try {
        const shift = await db.query.shifts.findFirst({
            where: and(eq(shifts.userId, req.authUser?.userId || req.user?.userId || ''), eq(shifts.status, 'OPEN')),
            with: { user: { columns: { name: true } }, register: true },
        });

        res.json({ success: true, data: shift });
    } catch (error) {
        next(error);
    }
});

// Get shift by ID
salesRoutes.get('/shifts/:id', authenticate, async (req, res, next) => {
    try {
        const shift = await db.query.shifts.findFirst({
            where: eq(shifts.id, req.params.id),
            with: {
                user: { columns: { name: true, email: true } },
                register: true,
                transactions: { orderBy: desc(transactions.createdAt), limit: 50 },
                cashMovements: { orderBy: desc(cashMovements.createdAt) },
            },
        });

        if (!shift) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Shift not found' } });
            return;
        }

        res.json({ success: true, data: shift });
    } catch (error) {
        next(error);
    }
});

// Open shift
salesRoutes.post('/shifts/open', authenticate, async (req, res, next) => {
    try {
        const { openingBalance, registerId, notes } = req.body;
        const userId = req.authUser?.userId || req.user?.userId;
        const branchId = req.authUser?.activeBranchId || req.user?.branchId;

        if (!userId || !branchId) {
            return res.status(400).json({ success: false, error: { code: 'AUTH_001', message: 'User or branch not found' } });
        }

        // Check if user already has an open shift
        const existingShift = await db.query.shifts.findFirst({ where: and(eq(shifts.userId, userId), eq(shifts.status, 'OPEN')) });

        if (existingShift) {
            res.status(400).json({ success: false, error: { code: 'SHIFT_001', message: 'You already have an open shift' } });
            return;
        }

        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const [{ value: shiftCount }] = await db.select({ value: count() }).from(shifts).where(gte(shifts.createdAt, new Date(new Date().setHours(0, 0, 0, 0))));
        const shiftNo = `SFT-${today}-${String(shiftCount + 1).padStart(3, '0')}`;

        const shiftTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [newShift] = await db.insert(shifts).values({
            tenantId: shiftTenantId,
            shiftNo, branchId, userId, registerId, openingBalance: openingBalance || 0, notes,
            storeId: req.authUser?.activeStoreId || undefined,
        }).returning();

        const shift = await db.query.shifts.findFirst({
            where: eq(shifts.id, newShift.id),
            with: { user: { columns: { name: true } }, register: true },
        });

        res.status(201).json({ success: true, data: shift });
    } catch (error) {
        next(error);
    }
});

// Close shift
salesRoutes.post('/shifts/:id/close', authenticate, async (req, res, next) => {
    try {
        const { closingBalance, notes } = req.body;

        const shift = await db.query.shifts.findFirst({
            where: eq(shifts.id, req.params.id),
            with: { transactions: true, cashMovements: true },
        });

        if (!shift) { res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Shift not found' } }); return; }
        if (shift.status !== 'OPEN') { res.status(400).json({ success: false, error: { code: 'SHIFT_002', message: 'Shift is already closed' } }); return; }

        const completedTxns = (shift.transactions || []).filter(t => t.status === 'COMPLETED');
        const cashSales = completedTxns.reduce((s, t) => s + t.total, 0);
        const cashMovementsTotal = (shift.cashMovements || []).reduce((s, m) => {
            if (m.type === 'FLOAT') return s + m.amount;
            if (m.type === 'PICKUP' || m.type === 'PAYOUT') return s - m.amount;
            return s;
        }, 0);
        const expectedBalance = shift.openingBalance + cashSales + cashMovementsTotal;
        const difference = (closingBalance || 0) - expectedBalance;

        await db.update(shifts).set({
            status: 'CLOSED', closingBalance: closingBalance || 0, expectedBalance, difference, closedAt: new Date(), notes: notes || shift.notes,
        }).where(eq(shifts.id, req.params.id));

        const updatedShift = await db.query.shifts.findFirst({
            where: eq(shifts.id, req.params.id),
            with: { user: { columns: { name: true } }, register: true },
        });

        res.json({ success: true, data: updatedShift });
    } catch (error) {
        next(error);
    }
});

// Add cash movement to shift
salesRoutes.post('/shifts/:id/cash-movement', authenticate, async (req, res, next) => {
    try {
        const { type, amount, reason } = req.body;
        const userId = req.authUser?.userId || req.user?.userId || '';

        const [movement] = await db.insert(cashMovements).values({ shiftId: req.params.id, type, amount, reason, userId }).returning();

        res.status(201).json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CASH REGISTERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all cash registers
salesRoutes.get('/registers', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { branchId, isActive } = req.query;
        const filter = req.branchFilter;

        const regConds: any[] = [];
        // G6: Tenant isolation for registers
        const regTc = tenantScope(req, cashRegisters.tenantId);
        if (regTc) regConds.push(regTc);
        if (filter?.branchIds?.length) {
            if (branchId && filter.branchIds.includes(String(branchId))) regConds.push(eq(cashRegisters.branchId, String(branchId)));
            else regConds.push(inArray(cashRegisters.branchId, filter.branchIds));
        } else if (branchId) {
            regConds.push(eq(cashRegisters.branchId, String(branchId)));
        }
        if (isActive !== undefined) regConds.push(eq(cashRegisters.isActive, isActive === 'true'));

        const registers = await db.query.cashRegisters.findMany({
            where: regConds.length > 0 ? and(...regConds) : undefined,
            with: { branch: { columns: { name: true } } },
            orderBy: asc(cashRegisters.name),
        });

        res.json({ success: true, data: registers });
    } catch (error) {
        next(error);
    }
});

// Get register by ID
salesRoutes.get('/registers/:id', authenticate, async (req, res, next) => {
    try {
        const regIdConds: any[] = [eq(cashRegisters.id, req.params.id)];
        const regIdTc = tenantScope(req, cashRegisters.tenantId);
        if (regIdTc) regIdConds.push(regIdTc);
        const register = await db.query.cashRegisters.findFirst({
            where: and(...regIdConds),
            with: { branch: true, shifts: { orderBy: desc(shifts.openedAt), limit: 10 } },
        });

        if (!register) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Register not found' } });
            return;
        }

        res.json({ success: true, data: register });
    } catch (error) {
        next(error);
    }
});

// Create cash register
salesRoutes.post('/registers', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const { name, branchId, isActive } = req.body;
        if (!name || !branchId) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name and branchId are required' } });
        }
        const regTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const regStoreId = req.authUser?.activeStoreId || undefined;
        const [register] = await db.insert(cashRegisters).values({ tenantId: regTenantId, name, branchId, storeId: regStoreId, isActive: isActive !== undefined ? isActive : true }).returning();

        res.status(201).json({ success: true, data: register });
    } catch (error) {
        next(error);
    }
});

// Update cash register
salesRoutes.put('/registers/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const { id, _id, createdAt, updatedAt, branch, shifts, ...updateData } = req.body;
        if (updateData.branchId === '' || updateData.branchId === null) delete updateData.branchId;
        // G6: Tenant-scoped update
        const updConds: any[] = [eq(cashRegisters.id, req.params.id)];
        const updTc = tenantScope(req, cashRegisters.tenantId);
        if (updTc) updConds.push(updTc);
        const [register] = await db.update(cashRegisters).set(updateData).where(and(...updConds)).returning();

        res.json({ success: true, data: register });
    } catch (error) {
        next(error);
    }
});

// Delete cash register (soft delete)
salesRoutes.delete('/registers/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        // G6: Tenant-scoped delete
        const delConds: any[] = [eq(cashRegisters.id, req.params.id)];
        const delTc = tenantScope(req, cashRegisters.tenantId);
        if (delTc) delConds.push(delTc);
        await db.update(cashRegisters).set({ isActive: false }).where(and(...delConds));

        res.json({ success: true, data: { message: 'Register deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELD SALES
// ═══════════════════════════════════════════════════════════════════════════

// Get all held sales
salesRoutes.get('/held', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = req.branchFilter;

        const heldConds: any[] = [];
        // BE-79: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) heldConds.push(eq(heldSales.tenantId, tenantId));
        const heldScope = buildScopeCondition(filter, { storeId: heldSales.storeId }, 'storeId');
        if (heldScope) heldConds.push(heldScope);
        if (!filter) heldConds.push(eq(heldSales.branchId, req.authUser?.activeBranchId || req.user?.branchId || ''));

        const heldRows = await db.query.heldSales.findMany({
            where: heldConds.length > 0 ? and(...heldConds) : undefined,
            orderBy: desc(heldSales.createdAt),
        });

        res.json({ success: true, data: heldRows });
    } catch (error) {
        next(error);
    }
});

// Get held sale by ID
salesRoutes.get('/held/:id', authenticate, async (req, res, next) => {
    try {
        const heldSale = await db.query.heldSales.findFirst({ where: eq(heldSales.id, req.params.id) });

        if (!heldSale) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Held sale not found' } });
            return;
        }

        if (!ensureScopeAccess(heldSale, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this held sale' } });
        }

        res.json({ success: true, data: heldSale });
    } catch (error) {
        next(error);
    }
});

// Create held sale
salesRoutes.post('/held', authenticate, async (req, res, next) => {
    try {
        const userId = req.authUser?.userId || req.user?.userId;
        const branchId = req.authUser?.activeBranchId || req.user?.branchId;

        const heldTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [heldSale] = await db.insert(heldSales).values({
            ...req.body,
            tenantId: heldTenantId,
            userId,
            branchId,
            storeId: req.authUser?.activeStoreId || undefined,
        }).returning();

        res.status(201).json({ success: true, data: heldSale });
    } catch (error) {
        next(error);
    }
});

// Delete held sale (when recalled or completed)
salesRoutes.delete('/held/:id', authenticate, async (req, res, next) => {
    try {
        const existing = await db.query.heldSales.findFirst({ where: eq(heldSales.id, req.params.id) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Held sale not found' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        await db.delete(heldSales).where(eq(heldSales.id, req.params.id));

        res.json({ success: true, data: { message: 'Held sale deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREDIT SALES
// ═══════════════════════════════════════════════════════════════════════════

// Get all credit sales
salesRoutes.get('/credit', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.authUser?.activeBranchId || req.user?.branchId;
        const { status, customerId, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const creditConds: any[] = [eq(transactions.isCredit, true), eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED')];
        // BE-79: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) creditConds.push(eq(transactions.tenantId, tenantId));
        const creditScope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (creditScope) creditConds.push(creditScope);
        if (!filter) creditConds.push(eq(transactions.branchId, branchId));

        if (status && status !== 'all') creditConds.push(eq(transactions.creditStatus, String(status).toUpperCase()));
        if (customerId) creditConds.push(eq(transactions.customerId, String(customerId)));

        const creditWhere = and(...creditConds);
        const [txRows, [{ value: total }]] = await Promise.all([
            db.query.transactions.findMany({
                where: creditWhere,
                offset: skip,
                limit: Number(limit),
                with: { customer: true, items: true, payments: true },
                orderBy: desc(transactions.createdAt),
            }),
            db.select({ value: count() }).from(transactions).where(creditWhere),
        ]);

        // Map to credit sale format
        const creditSales = txRows.map(t => ({
            id: t.id,
            receiptNo: t.transactionNo,
            customer: t.customer,
            total: t.total,
            paid: t.paidAmount,
            remaining: t.total - t.paidAmount,
            status: t.creditStatus?.toLowerCase() || 'pending',
            dueDate: t.dueDate,
            createdAt: t.createdAt,
            items: t.items,
        }));

        res.json({
            success: true,
            data: creditSales,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create credit sale
salesRoutes.post('/credit', authenticate, async (req, res, next) => {
    try {
        const {
            items,
            customerId,
            memberId,
            discountType,
            discountValue = 0,
            taxRate = 0,
            notes,
            dueDate,
            initialPayment = 0,
        } = req.body;

        const branchId = req.authUser?.activeBranchId || req.user?.branchId;
        const userId = req.authUser?.userId || req.user?.userId;
        const creditStoreId = req.authUser?.activeStoreId || undefined;

        if (!customerId) {
            return res.status(400).json({
                success: false,
                error: { code: 'CUSTOMER_REQUIRED', message: 'Customer is required for credit sales' }
            });
        }

        // Calculate totals
        let subtotal = 0;
        const txItems2 = [];

        for (const item of items) {
            const product = await db.query.products.findFirst({
                where: eq(products.id, item.productId),
                columns: { id: true, name: true, sku: true, barcode: true, price: true, cost: true },
            });

            if (!product) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'PRODUCT_NOT_FOUND', message: `Product ${item.productId} not found` }
                });
            }

            const unitPrice = item.price || product.price;
            const quantity = item.quantity;
            const itemDiscount = item.discount || 0;
            const itemTotal = (unitPrice * quantity) - itemDiscount;
            subtotal += itemTotal;

            txItems2.push({
                productId: item.productId,
                productName: product.name,
                sku: product.sku,
                barcode: product.barcode,
                quantity,
                unitPrice,
                cost: product.cost,
                discountType: item.discountType,
                discountValue: item.discountValue || 0,
                discountAmount: itemDiscount,
                taxRate: 0,
                taxAmount: 0,
                total: itemTotal,
                note: item.note,
            });
        }

        // Calculate discount
        let discountAmount = 0;
        if (discountType === 'PERCENTAGE') {
            discountAmount = (subtotal * discountValue) / 100;
        } else if (discountType === 'FIXED') {
            discountAmount = discountValue;
        }

        // Calculate tax
        const taxableAmount = subtotal - discountAmount;
        const taxAmount = (taxableAmount * taxRate) / 100;
        const totalAmount = taxableAmount + taxAmount;

        // Generate transaction number
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const [{ value: crdCnt }] = await db.select({ value: count() }).from(transactions).where(gte(transactions.createdAt, new Date(new Date().setHours(0, 0, 0, 0))));
        const transactionNo = `CRD-${branchId.slice(-4)}-${today}-${String(crdCnt + 1).padStart(4, '0')}`;

        let creditStatus = 'PENDING';
        if (initialPayment >= totalAmount) creditStatus = 'PAID';
        else if (initialPayment > 0) creditStatus = 'PARTIAL';

        const creditTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [txn] = await db.insert(transactions).values({
            tenantId: creditTenantId,
            transactionNo, type: 'SALE', status: 'COMPLETED', branchId, storeId: creditStoreId, userId, customerId, memberId,
            orderType: 'CREDIT', subtotal, discountType, discountValue, discountAmount, taxAmount,
            total: totalAmount, received: initialPayment, change: 0, note: notes,
            isCredit: true, creditStatus, dueDate: dueDate ? new Date(dueDate) : null, paidAmount: initialPayment,
        }).returning();

        if (txItems2.length > 0) {
            await db.insert(transactionItems).values(txItems2.map(ti => ({ ...ti, transactionId: txn.id })));
        }

        for (const item of items) {
            const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.productId, item.productId), eq(inventory.branchId, branchId)) });
            if (inv) {
                const previousQty = inv.quantity;
                const newQty = previousQty - item.quantity;
                await db.update(inventory).set({ quantity: newQty, available: newQty - inv.reserved }).where(eq(inventory.id, inv.id));
                await db.insert(stockMovements).values({
                    productId: item.productId, branchId, type: 'OUT', quantity: item.quantity, previousQty, newQty,
                    reason: 'Credit Sale', reference: txn.id, referenceType: 'CREDIT_SALE', userId,
                });
            }
        }

        const transaction = await db.query.transactions.findFirst({
            where: eq(transactions.id, txn.id),
            with: { items: { with: { product: true } }, customer: true },
        });

        res.status(201).json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
});

// Record payment for credit sale
salesRoutes.post('/credit/:id/payment', authenticate, async (req, res, next) => {
    try {
        const { amount, paymentMethodId, reference, notes } = req.body;
        const transactionId = req.params.id;

        const transaction = await db.query.transactions.findFirst({ where: eq(transactions.id, transactionId) });

        if (!transaction) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
        if (!ensureScopeAccess(transaction, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this transaction' } });
        if (!transaction.isCredit) return res.status(400).json({ success: false, error: { code: 'NOT_CREDIT', message: 'Transaction is not a credit sale' } });

        const remaining = transaction.total - transaction.paidAmount;
        if (amount > remaining) return res.status(400).json({ success: false, error: { code: 'AMOUNT_EXCEEDS', message: 'Payment amount exceeds remaining balance' } });

        const newPaidAmount = transaction.paidAmount + amount;
        const newStatus = newPaidAmount >= transaction.total ? 'PAID' : 'PARTIAL';

        const [updated] = await db.update(transactions).set({ paidAmount: newPaidAmount, creditStatus: newStatus }).where(eq(transactions.id, transactionId)).returning();

        let methodId = paymentMethodId;
        let methodName = 'CASH';
        if (paymentMethodId) {
            const method = await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, paymentMethodId) });
            if (method) methodName = method.name;
        } else {
            const cashMethod = await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.type, 'cash') });
            if (cashMethod) { methodId = cashMethod.id; methodName = cashMethod.name; }
            else {
                const anyMethod = await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.isActive, true) });
                if (anyMethod) { methodId = anyMethod.id; methodName = anyMethod.name; }
                else return res.status(400).json({ success: false, error: { code: 'NO_PAYMENT_METHOD', message: 'No payment method available' } });
            }
        }

        await db.insert(transactionPayments).values({
            transactionId, methodId, methodName, amount,
            reference: reference || `Credit Payment - ${new Date().toISOString()}`,
        });

        res.json({
            success: true,
            data: {
                id: updated.id, total: updated.total, paid: updated.paidAmount,
                remaining: updated.total - updated.paidAmount, status: updated.creditStatus?.toLowerCase(),
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get credit sale details
salesRoutes.get('/credit/:id', authenticate, async (req, res, next) => {
    try {
        const transaction = await db.query.transactions.findFirst({
            where: eq(transactions.id, req.params.id),
            with: { customer: true, items: { with: { product: true } }, payments: true },
        });

        if (!transaction || !transaction.isCredit) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Credit sale not found' }
            });
        }

        if (!ensureScopeAccess(transaction, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        res.json({
            success: true,
            data: {
                id: transaction.id,
                receiptNo: transaction.transactionNo,
                customer: transaction.customer,
                total: transaction.total,
                paid: transaction.paidAmount,
                remaining: transaction.total - transaction.paidAmount,
                status: transaction.creditStatus?.toLowerCase() || 'pending',
                dueDate: transaction.dueDate,
                createdAt: transaction.createdAt,
                items: transaction.items,
                payments: transaction.payments,
            }
        });
    } catch (error) {
        next(error);
    }
});
