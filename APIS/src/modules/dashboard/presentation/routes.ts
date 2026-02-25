// ═══════════════════════════════════════════════════════════════════════════
// Dashboard Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, branchFilter, applyScopeFilter, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { queryCache } from '@/infrastructure/http/middleware/cache.middleware';
import { prisma } from '@/config/database.config';

export const dashboardRoutes = Router();

// Get dashboard stats
dashboardRoutes.get('/stats', authenticate, branchFilter(), queryCache(30, 'dashboard'), async (req, res, next) => {
    try {
        const { branchId } = req.query;
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Build where clause with store/branch filtering
        const transactionWhere: Record<string, unknown> = {
            createdAt: { gte: today, lt: tomorrow },
            status: 'COMPLETED',
            type: 'SALE',
        };
        
        // Apply store-level or branch-level scope (Transaction now has storeId)
        applyScopeFilter(transactionWhere, filter, 'storeId');
        // Override with specific branchId if provided and user has access
        if (branchId) {
            if (filter && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                });
            }
            transactionWhere.branchId = String(branchId);
        }

        // Get today's stats
        const [
            todaySales,
            todayOrders,
            totalProducts,
            totalCustomers,
            lowStockCount,
        ] = await Promise.all([
            prisma.transaction.aggregate({
                where: transactionWhere,
                _sum: { total: true },
            }),
            prisma.transaction.count({ where: transactionWhere }),
            prisma.product.count({ where: { isActive: true } }),
            prisma.customer.count({ where: { isActive: true } }),
            prisma.inventory.count({
                where: {
                    quantity: { lte: 10 },
                    product: { isActive: true },
                },
            }),
        ]);

        // Calculate average order value
        const avgOrderValue = todayOrders > 0
            ? (todaySales._sum.total || 0) / todayOrders
            : 0;

        res.json({
            success: true,
            data: {
                todaySales: todaySales._sum.total || 0,
                todayOrders,
                avgOrderValue,
                totalProducts,
                totalCustomers,
                lowStockCount,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get low stock alerts
dashboardRoutes.get('/low-stock', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { branchId } = req.query;
        const filter = (req as any).branchFilter as ScopeFilter | undefined;

        const where: Record<string, unknown> = {
            quantity: { lte: 10 },
            product: { isActive: true },
        };
        
        // Apply store-level or branch-level scope (Inventory now has storeId)
        applyScopeFilter(where, filter, 'storeId');
        if (branchId) {
            if (filter && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                });
            }
            where.branchId = String(branchId);
        }

        const lowStockItems = await prisma.inventory.findMany({
            where,
            include: {
                product: { select: { name: true, sku: true } },
            },
            take: 10,
            orderBy: { quantity: 'asc' },
        });

        const alerts = lowStockItems.map(item => ({
            name: item.product.name,
            sku: item.product.sku,
            currentStock: item.quantity,
            minStock: 10,
        }));

        res.json({ success: true, data: alerts });
    } catch (error) {
        next(error);
    }
});

// Get sales chart data
dashboardRoutes.get('/sales-chart', authenticate, branchFilter(), queryCache(60, 'dashboard'), async (req, res, next) => {
    try {
        const { branchId, period = '7days' } = req.query;
        const filter = (req as any).branchFilter as ScopeFilter | undefined;

        let startDate = new Date();
        switch (period) {
            case '7days':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case '30days':
                startDate.setDate(startDate.getDate() - 30);
                break;
            case '90days':
                startDate.setDate(startDate.getDate() - 90);
                break;
        }
        startDate.setHours(0, 0, 0, 0);

        const where: Record<string, unknown> = {
            createdAt: { gte: startDate },
            status: 'COMPLETED',
            type: 'SALE',
        };
        
        // Apply store-level or branch-level scope
        applyScopeFilter(where, filter, 'storeId');
        if (branchId) {
            if (filter && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                });
            }
            where.branchId = String(branchId);
        }

        const transactions = await prisma.transaction.findMany({
            where,
            select: {
                total: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        // Group by date
        const groupedData = transactions.reduce((acc: Record<string, number>, tx) => {
            const date = tx.createdAt.toISOString().split('T')[0];
            acc[date] = (acc[date] || 0) + tx.total;
            return acc;
        }, {});

        const chartData = Object.entries(groupedData).map(([date, total]) => ({
            date,
            total,
        }));

        res.json({ success: true, data: chartData });
    } catch (error) {
        next(error);
    }
});

// Get recent transactions
dashboardRoutes.get('/recent-transactions', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { branchId, limit = 10 } = req.query;
        const filter = (req as any).branchFilter as ScopeFilter | undefined;

        const where: Record<string, unknown> = {};
        
        // Apply store-level or branch-level scope
        applyScopeFilter(where, filter, 'storeId');
        if (branchId) {
            if (filter && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                });
            }
            where.branchId = String(branchId);
        }

        const transactions = await prisma.transaction.findMany({
            where,
            take: Number(limit),
            orderBy: { createdAt: 'desc' },
            include: {
                customer: { select: { name: true } },
                user: { select: { name: true } },
            },
        });

        res.json({ success: true, data: transactions });
    } catch (error) {
        next(error);
    }
});

// Get top selling products
dashboardRoutes.get('/top-products', authenticate, branchFilter(), queryCache(60, 'dashboard'), async (req, res, next) => {
    try {
        const { branchId, limit = 5 } = req.query;
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get completed transactions from last 30 days
        const transactionWhere: Record<string, unknown> = {
            createdAt: { gte: thirtyDaysAgo },
            status: 'COMPLETED',
            type: 'SALE',
        };
        
        // Apply store-level or branch-level scope
        applyScopeFilter(transactionWhere, filter, 'storeId');
        if (branchId) {
            if (filter && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                });
            }
            transactionWhere.branchId = String(branchId);
        }

        const transactions = await prisma.transaction.findMany({
            where: transactionWhere,
            select: { id: true },
        });

        const transactionIds = transactions.map(t => t.id);

        // Get all items from these transactions
        const items = await prisma.transactionItem.findMany({
            where: { transactionId: { in: transactionIds } },
            select: {
                productId: true,
                productName: true,
                quantity: true,
                total: true,
            },
        });

        // Aggregate by product
        const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
        items.forEach(item => {
            if (!productMap[item.productId]) {
                productMap[item.productId] = { name: item.productName, quantity: 0, revenue: 0 };
            }
            productMap[item.productId].quantity += item.quantity;
            productMap[item.productId].revenue += item.total;
        });

        // Sort and take top N
        const topProducts = Object.entries(productMap)
            .map(([id, data]) => ({
                id,
                name: data.name,
                totalQuantity: data.quantity,
                totalRevenue: data.revenue,
            }))
            .sort((a, b) => b.totalQuantity - a.totalQuantity)
            .slice(0, Number(limit));

        res.json({ success: true, data: topProducts });
    } catch (error) {
        next(error);
    }
});
