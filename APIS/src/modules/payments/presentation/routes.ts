// ═══════════════════════════════════════════════════════════════════════════
// Payments Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, ensureScopeAccess, buildScopeCondition, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { transactions, transactionPayments, paymentMethods, settlements } from '@/db/schema/tables';
import { eq, and, or, ilike, inArray, gte, lte, lt, desc, asc, count, sum, sql } from 'drizzle-orm';

export const paymentRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

// Get all transactions
paymentRoutes.get('/transactions', authenticate, branchFilter(), async (req, res, next) => {
    try {
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
        const filter = (req as any).branchFilter as ScopeFilter | undefined;

        const conditions: any[] = [];
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
paymentRoutes.get('/transactions/:id', authenticate, async (req, res, next) => {
    try {
        const transaction = await db.query.transactions.findFirst({
            where: eq(transactions.id, req.params.id),
            with: { customer: true, user: true, items: true, payments: { with: { paymentMethod: true } } },
        });

        if (!transaction) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Transaction not found' } });
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
paymentRoutes.get('/summary', authenticate, async (req, res, next) => {
    try {
        const { branchId, dateFrom, dateTo } = req.query;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const sumConditions: any[] = [eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE')];
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
paymentRoutes.get('/methods', authenticate, async (req, res, next) => {
    try {
        const { activeOnly } = req.query;

        const mWhere = activeOnly === 'true' ? eq(paymentMethods.isActive, true) : undefined;

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
paymentRoutes.get('/methods/:id', authenticate, async (req, res, next) => {
    try {
        const method = await db.query.paymentMethods.findFirst({
            where: eq(paymentMethods.id, req.params.id),
        });

        if (!method) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Payment method not found' } });
            return;
        }

        res.json({ success: true, data: method });
    } catch (error) {
        next(error);
    }
});

// Create payment method
paymentRoutes.post('/methods', authenticate, authorize('payments:manage'), async (req, res, next) => {
    try {
        const [method] = await db.insert(paymentMethods).values(req.body).returning();

        res.status(201).json({ success: true, data: method });
    } catch (error) {
        next(error);
    }
});

// Update payment method
paymentRoutes.put('/methods/:id', authenticate, authorize('payments:manage'), async (req, res, next) => {
    try {
        const [method] = await db.update(paymentMethods).set({ ...req.body, updatedAt: new Date() }).where(eq(paymentMethods.id, req.params.id)).returning();

        res.json({ success: true, data: method });
    } catch (error) {
        next(error);
    }
});

// Toggle payment method status
paymentRoutes.patch('/methods/:id/toggle', authenticate, authorize('payments:manage'), async (req, res, next) => {
    try {
        const current = await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, req.params.id) });

        if (!current) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Payment method not found' } });
            return;
        }

        const [method] = await db.update(paymentMethods).set({ isActive: !current.isActive, updatedAt: new Date() }).where(eq(paymentMethods.id, req.params.id)).returning();

        res.json({ success: true, data: method });
    } catch (error) {
        next(error);
    }
});

// Delete payment method
paymentRoutes.delete('/methods/:id', authenticate, authorize('payments:manage'), async (req, res, next) => {
    try {
        await db.update(paymentMethods).set({ isActive: false, updatedAt: new Date() }).where(eq(paymentMethods.id, req.params.id));

        res.json({ success: true, message: 'Payment method deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// REFUNDS
// ═══════════════════════════════════════════════════════════════════════════

// Process refund
paymentRoutes.post('/refunds', authenticate, authorize('payments:refund'), async (req, res, next) => {
    try {
        const { transactionId, amount, reason, items } = req.body;
        const user = (req as unknown as { user: { id: string; branchId: string } }).user;

        // Get original transaction
        const originalTx = await db.query.transactions.findFirst({
            where: eq(transactions.id, transactionId),
            with: { items: true, payments: true },
        });

        if (!originalTx) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Transaction not found' } });
            return;
        }

        if (originalTx.status !== 'COMPLETED') {
            res.status(400).json({ success: false, error: { code: 'PMT_001', message: 'Can only refund completed transactions' } });
            return;
        }

        // Generate refund transaction number
        const refundNo = `REF-${Date.now()}`;

        // Create refund transaction
        const [refund] = await db.insert(transactions).values({
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
paymentRoutes.post('/void/:id', authenticate, authorize('payments:void'), async (req, res, next) => {
    try {
        const { reason } = req.body;

        const transaction = await db.query.transactions.findFirst({ where: eq(transactions.id, req.params.id) });

        if (!transaction) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Transaction not found' } });
            return;
        }

        if (transaction.status !== 'COMPLETED') {
            res.status(400).json({ success: false, error: { code: 'PMT_002', message: 'Can only void completed transactions' } });
            return;
        }

        const [voided] = await db.update(transactions)
            .set({ status: 'VOIDED', voidReason: reason, updatedAt: new Date() })
            .where(eq(transactions.id, req.params.id))
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
paymentRoutes.get('/settlements', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { page = 1, limit = 20, status, dateFrom, dateTo } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;

        const sConditions: any[] = [];
        if (branchId) sConditions.push(eq(settlements.branchId, branchId));
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
paymentRoutes.post('/settlements', authenticate, authorize('payments:settle'), async (req, res, next) => {
    try {
        const { date } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId;
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

        const [settlement] = await db.insert(settlements).values({
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

