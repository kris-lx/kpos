// ═══════════════════════════════════════════════════════════════════════════
// Payments Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, ensureScopeAccess, buildScopeCondition, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { transactions, transactionPayments, paymentMethods, settlements } from '@/db/schema/tables';
import { eq, and, or, ilike, inArray, gte, lte, lt, desc, asc, count, sum, sql, isNull } from 'drizzle-orm';

export const paymentRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

// Get all transactions
paymentRoutes.get('/transactions', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const {
            page = 1,
            limit = 20,
            branchId,
            status,
            dateFrom,
            dateTo,
            search
        } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;

        const conditions: any[] = [];
        // BE-73: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) {
            conditions.push(eq(transactions.tenantId, tenantId));
        }
        const scopeCond = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (scopeCond) conditions.push(scopeCond);
        if (branchId) conditions.push(eq(transactions.branchId, String(branchId)));
        if (status) conditions.push(eq(transactions.status, String(status)));
        if (dateFrom) conditions.push(gte(transactions.createdAt, new Date(String(dateFrom))));
        if (dateTo) conditions.push(lte(transactions.createdAt, new Date(String(dateTo))));
        if (search) conditions.push(ilike(transactions.transactionNo, `%${String(search)}%`));

        const txWhere = conditions.length > 0 ? and(...conditions) : undefined;

        const [txRows, [{ value: total }]] = await Promise.all([
            db.query.transactions.findMany({
                where: txWhere,
                offset: skip,
                limit: Number(limit),
                with: { customer: true, user: true, store: true, payments: { with: { paymentMethod: true } } },
                orderBy: desc(transactions.createdAt),
            }),
            db.select({ value: count() }).from(transactions).where(txWhere),
        ]);

        res.json({
            success: true,
            data: txRows,
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

// Get transaction by ID (scope-checked)
paymentRoutes.get('/transactions/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-73: Tenant-scoped transaction lookup
        const tenantId = req.authUser?.tenantId;
        const getConds: any[] = [eq(transactions.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            getConds.push(eq(transactions.tenantId, tenantId));
        }

        const transaction = await db.query.transactions.findFirst({
            where: and(...getConds),
            with: { customer: true, user: true, items: true, payments: { with: { paymentMethod: true } } },
        });

        if (!transaction) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Transaction not found or no access' } });
            return;
        }

        if (!ensureScopeAccess(transaction, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        res.json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
});

// Get transaction summary (for dashboard/reports)
paymentRoutes.get('/summary', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { branchId, dateFrom, dateTo } = req.query;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const sumConditions: any[] = [eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE')];
        // BE-73: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) sumConditions.push(eq(transactions.tenantId, tenantId));
        if (branchId) sumConditions.push(eq(transactions.branchId, String(branchId)));
        if (dateFrom) sumConditions.push(gte(transactions.createdAt, new Date(String(dateFrom))));
        if (dateTo) sumConditions.push(lte(transactions.createdAt, new Date(String(dateTo))));
        if (!dateFrom && !dateTo) {
            sumConditions.push(gte(transactions.createdAt, today), lt(transactions.createdAt, tomorrow));
        }
        const sumWhere = and(...sumConditions);

        const [totalsRow] = await db.select({
            totalSales: sum(transactions.total),
            totalTransactions: count(),
        }).from(transactions).where(sumWhere);

        // Status breakdown
        const statusRows = await db.select({
            status: transactions.status,
            cnt: count(),
        }).from(transactions)
            .where(branchId ? eq(transactions.branchId, String(branchId)) : undefined)
            .groupBy(transactions.status);

        res.json({
            success: true,
            data: {
                totalSales: Number(totalsRow.totalSales) || 0,
                totalTransactions: totalsRow.totalTransactions,
                statusBreakdown: statusRows.map(r => ({ status: r.status, _count: r.cnt })),
                paymentBreakdown: [],
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT METHODS
// ═══════════════════════════════════════════════════════════════════════════

// Get all payment methods
paymentRoutes.get('/methods', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { activeOnly } = req.query;

        // BE-73: Tenant isolation on payment methods
        const tenantId = req.authUser?.tenantId;
        const mConds: any[] = [];
        if (activeOnly === 'true') mConds.push(eq(paymentMethods.isActive, true));
        if (tenantId && !req.authUser?.isSuperAdmin) mConds.push(or(isNull(paymentMethods.tenantId), eq(paymentMethods.tenantId, tenantId)));
        const mWhere = mConds.length > 0 ? and(...mConds) : undefined;

        const methods = await db.query.paymentMethods.findMany({
            where: mWhere,
            orderBy: asc(paymentMethods.sortOrder),
        });

        res.json({ success: true, data: methods });
    } catch (error) {
        next(error);
    }
});

// Get payment method by ID
paymentRoutes.get('/methods/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-73: Tenant-scoped payment method lookup
        const tenantId = req.authUser?.tenantId;
        const pmConds: any[] = [eq(paymentMethods.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) pmConds.push(or(isNull(paymentMethods.tenantId), eq(paymentMethods.tenantId, tenantId)));
        const method = await db.query.paymentMethods.findFirst({
            where: and(...pmConds),
        });

        if (!method) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Payment method not found or no access' } });
            return;
        }

        res.json({ success: true, data: method });
    } catch (error) {
        next(error);
    }
});

// Create payment method
paymentRoutes.post('/methods', authenticate, withTenantTx(), authorize('payments:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const pmTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [method] = await db.insert(paymentMethods).values({ ...req.body, tenantId: pmTenantId }).returning();

        res.status(201).json({ success: true, data: method });
    } catch (error) {
        next(error);
    }
});

// Update payment method
paymentRoutes.put('/methods/:id', authenticate, withTenantTx(), authorize('payments:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-73: Tenant-scoped payment method update
        const tenantId = req.authUser?.tenantId;
        const updConds: any[] = [eq(paymentMethods.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) updConds.push(eq(paymentMethods.tenantId, tenantId));
        const updateData = { ...req.body, updatedAt: new Date() };
        delete updateData.tenantId;
        const [method] = await db.update(paymentMethods).set(updateData).where(and(...updConds)).returning();

        res.json({ success: true, data: method });
    } catch (error) {
        next(error);
    }
});

// Toggle payment method status
paymentRoutes.patch('/methods/:id/toggle', authenticate, withTenantTx(), authorize('payments:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-73: Tenant-scoped payment method toggle
        const tenantId = req.authUser?.tenantId;
        const togConds: any[] = [eq(paymentMethods.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) togConds.push(eq(paymentMethods.tenantId, tenantId));
        const current = await db.query.paymentMethods.findFirst({ where: and(...togConds) });

        if (!current) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Payment method not found or no access' } });
            return;
        }

        const [method] = await db.update(paymentMethods).set({ isActive: !current.isActive, updatedAt: new Date() }).where(and(...togConds)).returning();

        res.json({ success: true, data: method });
    } catch (error) {
        next(error);
    }
});

// Delete payment method
paymentRoutes.delete('/methods/:id', authenticate, withTenantTx(), authorize('payments:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-73: Tenant-scoped payment method delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(paymentMethods.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) delConds.push(eq(paymentMethods.tenantId, tenantId));
        await db.update(paymentMethods).set({ isActive: false, updatedAt: new Date() }).where(and(...delConds));

        res.json({ success: true, message: 'Payment method deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// REFUNDS
// ═══════════════════════════════════════════════════════════════════════════

// Process refund
paymentRoutes.post('/refunds', authenticate, withTenantTx(), authorize('payments:refund'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { transactionId, amount, reason, items } = req.body;
        const user = (req as unknown as { user: { id: string; branchId: string } }).user;

        // BE-73: Tenant-scoped refund
        const tenantId = req.authUser?.tenantId;
        const refConds: any[] = [eq(transactions.id, transactionId)];
        if (tenantId && !req.authUser?.isSuperAdmin) refConds.push(eq(transactions.tenantId, tenantId));
        const originalTx = await db.query.transactions.findFirst({
            where: and(...refConds),
            with: { items: true, payments: true },
        });

        if (!originalTx) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Transaction not found or no access' } });
            return;
        }

        if (originalTx.status !== 'COMPLETED') {
            res.status(400).json({ success: false, error: { code: 'PMT_001', message: 'Can only refund completed transactions' } });
            return;
        }

        // Generate refund transaction number
        const refundNo = `REF-${Date.now()}`;

        // Create refund transaction
        const refTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [refund] = await db.insert(transactions).values({
            tenantId: refTenantId,
            transactionNo: refundNo,
            type: 'REFUND',
            status: 'COMPLETED',
            branchId: originalTx.branchId,
            userId: user.id,
            customerId: originalTx.customerId,
            subtotal: -amount,
            total: -amount,
            refundReason: reason,
            parentId: transactionId,
        }).returning();

        await db.update(transactions).set({ status: 'REFUNDED', updatedAt: new Date() }).where(eq(transactions.id, transactionId));

        res.status(201).json({ success: true, data: refund });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// VOID
// ═══════════════════════════════════════════════════════════════════════════

// Void transaction
paymentRoutes.post('/void/:id', authenticate, withTenantTx(), authorize('payments:void'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { reason } = req.body;

        // BE-73: Tenant-scoped void
        const tenantId = req.authUser?.tenantId;
        const voidConds: any[] = [eq(transactions.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) voidConds.push(eq(transactions.tenantId, tenantId));
        const transaction = await db.query.transactions.findFirst({ where: and(...voidConds) });

        if (!transaction) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Transaction not found or no access' } });
            return;
        }

        if (transaction.status !== 'COMPLETED') {
            res.status(400).json({ success: false, error: { code: 'PMT_002', message: 'Can only void completed transactions' } });
            return;
        }

        const [voided] = await db.update(transactions)
            .set({ status: 'VOIDED', voidReason: reason, updatedAt: new Date() })
            .where(and(...voidConds))
            .returning();

        res.json({ success: true, data: voided });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SETTLEMENTS
// ═══════════════════════════════════════════════════════════════════════════

// Get all settlements
paymentRoutes.get('/settlements', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { page = 1, limit = 20, status, dateFrom, dateTo } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.authUser?.activeBranchId || req.user?.branchId;

        const sConditions: any[] = [];
        const stlTenantId = req.authUser?.tenantId || filter?.tenantId;
        if (stlTenantId && !req.authUser?.isSuperAdmin) sConditions.push(eq(settlements.tenantId, stlTenantId));
        if (branchId) sConditions.push(eq(settlements.branchId, branchId));
        if (filter?.storeIds?.length) sConditions.push(inArray(settlements.storeId, filter.storeIds));
        if (status) sConditions.push(eq(settlements.status, String(status)));
        if (dateFrom) sConditions.push(gte(settlements.settlementDate, new Date(String(dateFrom))));
        if (dateTo) sConditions.push(lte(settlements.settlementDate, new Date(String(dateTo))));
        const sWhere = sConditions.length > 0 ? and(...sConditions) : undefined;

        const [settlementRows, [{ value: total }]] = await Promise.all([
            db.query.settlements.findMany({
                where: sWhere,
                offset: skip,
                limit: Number(limit),
                orderBy: desc(settlements.settlementDate),
            }),
            db.select({ value: count() }).from(settlements).where(sWhere),
        ]);

        res.json({
            success: true,
            data: settlementRows,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create settlement
paymentRoutes.post('/settlements', authenticate, withTenantTx(), authorize('payments:settle'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { date } = req.body;
        const userId = req.authUser?.userId || req.user?.userId;
        const branchId = req.authUser?.activeBranchId || req.user?.branchId;
        if (!branchId || !userId) {
            return res.status(400).json({ success: false, error: { code: 'AUTH_001', message: 'User or branch not resolved' } });
        }
        const settlementDate = new Date(date);
        
        // Get totals for the date
        const startOfDay = new Date(settlementDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(settlementDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Get transactions with their payments for the date
        const txList = await db.query.transactions.findMany({
            where: and(gte(transactions.createdAt, startOfDay), lte(transactions.createdAt, endOfDay), eq(transactions.status, 'COMPLETED'), eq(transactions.branchId, branchId)),
            with: { payments: true },
        });

        const totalAmount = txList.reduce((s, t) => s + t.total, 0);
        
        let totalCash = 0;
        let totalCard = 0;
        let totalOther = 0;
        for (const t of txList) {
            for (const p of t.payments) {
                const name = (p as any).methodName?.toUpperCase() || '';
                if (name.includes('CASH')) totalCash += p.amount;
                else if (name.includes('CARD') || name.includes('CREDIT') || name.includes('DEBIT')) totalCard += p.amount;
                else totalOther += p.amount;
            }
        }

        const stlTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const stlBranchId = req.authUser?.activeBranchId || req.user?.branchId || (branchId ? String(branchId) : undefined);
        const stlStoreId = req.authUser?.activeStoreId || undefined;
        const [settlement] = await db.insert(settlements).values({
            tenantId: stlTenantId,
            branchId: stlBranchId,
            storeId: stlStoreId,
            settlementDate,
            totalAmount,
            cashAmount: totalCash,
            cardAmount: totalCard,
            otherAmount: totalOther,
            transactionCount: txList.length,
            status: 'completed',
            settledBy: userId,
        }).returning();

        res.status(201).json({ success: true, data: settlement });
    } catch (error) {
        next(error);
    }
});

