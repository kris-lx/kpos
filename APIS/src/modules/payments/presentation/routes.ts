// ═══════════════════════════════════════════════════════════════════════════
// Payments Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const paymentRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

// Get all transactions
paymentRoutes.get('/transactions', authenticate, async (req, res, next) => {
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

        const where: Record<string, unknown> = {};
        if (branchId) where.branchId = String(branchId);
        if (status) where.status = String(status);

        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(String(dateFrom));
            if (dateTo) (where.createdAt as Record<string, Date>).lte = new Date(String(dateTo));
        }

        if (search) {
            where.OR = [
                { transactionNo: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                skip,
                take: Number(limit),
                include: {
                    customer: { select: { name: true } },
                    user: { select: { name: true } },
                    payments: {
                        include: { paymentMethod: { select: { name: true, code: true } } },
                    },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.transaction.count({ where }),
        ]);

        res.json({
            success: true,
            data: transactions,
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

// Get transaction by ID
paymentRoutes.get('/transactions/:id', authenticate, async (req, res, next) => {
    try {
        const transaction = await prisma.transaction.findUnique({
            where: { id: req.params.id },
            include: {
                customer: true,
                user: { select: { name: true } },
                items: true,
                payments: {
                    include: { paymentMethod: true },
                },
            },
        });

        if (!transaction) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Transaction not found' } });
            return;
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

        const where: Record<string, unknown> = {
            status: 'COMPLETED',
            type: 'SALE',
        };
        if (branchId) where.branchId = String(branchId);

        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(String(dateFrom));
            if (dateTo) (where.createdAt as Record<string, Date>).lte = new Date(String(dateTo));
        } else {
            where.createdAt = { gte: today, lt: tomorrow };
        }

        const [totals, countByStatus, paymentMethodTotals] = await Promise.all([
            prisma.transaction.aggregate({
                where,
                _sum: { total: true },
                _count: true,
            }),
            prisma.transaction.groupBy({
                by: ['status'],
                where: { branchId: branchId ? String(branchId) : undefined },
                _count: true,
            }),
            prisma.transactionPayment.groupBy({
                by: ['methodId'],
                where: {
                    transaction: {
                        ...where,
                    },
                },
                _sum: { amount: true },
            }),
        ]);

        // Get payment method names
        const methodIds = paymentMethodTotals.map(p => p.methodId);
        const methods = await prisma.paymentMethod.findMany({
            where: { id: { in: methodIds } },
            select: { id: true, name: true, code: true },
        });

        const paymentBreakdown = paymentMethodTotals.map(p => ({
            method: methods.find(m => m.id === p.methodId),
            total: p._sum.amount,
        }));

        res.json({
            success: true,
            data: {
                totalSales: totals._sum.total || 0,
                totalTransactions: totals._count,
                statusBreakdown: countByStatus,
                paymentBreakdown,
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

        const where: Record<string, unknown> = {};
        if (activeOnly === 'true') where.isActive = true;

        const methods = await prisma.paymentMethod.findMany({
            where,
            orderBy: { sortOrder: 'asc' },
        });

        res.json({ success: true, data: methods });
    } catch (error) {
        next(error);
    }
});

// Get payment method by ID
paymentRoutes.get('/methods/:id', authenticate, async (req, res, next) => {
    try {
        const method = await prisma.paymentMethod.findUnique({
            where: { id: req.params.id },
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
        const method = await prisma.paymentMethod.create({
            data: req.body,
        });

        res.status(201).json({ success: true, data: method });
    } catch (error) {
        next(error);
    }
});

// Update payment method
paymentRoutes.put('/methods/:id', authenticate, authorize('payments:manage'), async (req, res, next) => {
    try {
        const method = await prisma.paymentMethod.update({
            where: { id: req.params.id },
            data: req.body,
        });

        res.json({ success: true, data: method });
    } catch (error) {
        next(error);
    }
});

// Toggle payment method status
paymentRoutes.patch('/methods/:id/toggle', authenticate, authorize('payments:manage'), async (req, res, next) => {
    try {
        const current = await prisma.paymentMethod.findUnique({
            where: { id: req.params.id },
        });

        if (!current) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Payment method not found' } });
            return;
        }

        const method = await prisma.paymentMethod.update({
            where: { id: req.params.id },
            data: { isActive: !current.isActive },
        });

        res.json({ success: true, data: method });
    } catch (error) {
        next(error);
    }
});

// Delete payment method
paymentRoutes.delete('/methods/:id', authenticate, authorize('payments:manage'), async (req, res, next) => {
    try {
        await prisma.paymentMethod.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });

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
        const originalTx = await prisma.transaction.findUnique({
            where: { id: transactionId },
            include: { items: true, payments: true },
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
        const refund = await prisma.transaction.create({
            data: {
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
            },
        });

        // Update original transaction status
        await prisma.transaction.update({
            where: { id: transactionId },
            data: { status: 'REFUNDED' },
        });

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

        const transaction = await prisma.transaction.findUnique({
            where: { id: req.params.id },
        });

        if (!transaction) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Transaction not found' } });
            return;
        }

        if (transaction.status !== 'COMPLETED') {
            res.status(400).json({ success: false, error: { code: 'PMT_002', message: 'Can only void completed transactions' } });
            return;
        }

        const voided = await prisma.transaction.update({
            where: { id: req.params.id },
            data: {
                status: 'VOIDED',
                voidReason: reason,
            },
        });

        res.json({ success: true, data: voided });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SETTLEMENTS
// ═══════════════════════════════════════════════════════════════════════════

// Get all settlements
paymentRoutes.get('/settlements', authenticate, async (req, res, next) => {
    try {
        const { page = 1, limit = 20, status, dateFrom, dateTo } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {};
        if (status) where.status = String(status);
        if (dateFrom || dateTo) {
            where.settlementDate = {};
            if (dateFrom) (where.settlementDate as Record<string, Date>).gte = new Date(String(dateFrom));
            if (dateTo) (where.settlementDate as Record<string, Date>).lte = new Date(String(dateTo));
        }

        const [settlements, total] = await Promise.all([
            prisma.settlement.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { settlementDate: 'desc' },
            }),
            prisma.settlement.count({ where }),
        ]);

        res.json({
            success: true,
            data: settlements,
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
        const settlementDate = new Date(date);
        
        // Get totals for the date
        const startOfDay = new Date(settlementDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(settlementDate);
        endOfDay.setHours(23, 59, 59, 999);

        const transactions = await prisma.transaction.findMany({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay },
                status: 'COMPLETED',
            },
        });

        const totalAmount = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
        const totalCash = transactions.filter(t => t.paymentMethod === 'CASH').reduce((sum, t) => sum + (t.totalAmount || 0), 0);
        const totalCard = transactions.filter(t => t.paymentMethod === 'CARD').reduce((sum, t) => sum + (t.totalAmount || 0), 0);

        const settlement = await prisma.settlement.create({
            data: {
                settlementDate,
                totalAmount,
                cashAmount: totalCash,
                cardAmount: totalCard,
                transactionCount: transactions.length,
                status: 'completed',
                settledBy: userId,
            },
        });

        res.status(201).json({ success: true, data: settlement });
    } catch (error) {
        next(error);
    }
});

