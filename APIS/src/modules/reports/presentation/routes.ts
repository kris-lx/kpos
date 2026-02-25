// ═══════════════════════════════════════════════════════════════════════════
// Reports Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const reportRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/summary', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Today's sales — build where with store-level scope
        const txWhere: Record<string, unknown> = {
            status: 'COMPLETED',
            type: 'SALE',
            createdAt: { gte: today, lt: tomorrow },
        };
        applyScopeFilter(txWhere, filter, 'storeId');
        if (!filter) txWhere.branchId = branchId;

        const todaySales = await prisma.transaction.aggregate({
            where: txWhere as any,
            _sum: { total: true },
            _count: { id: true },
        });

        // Total products
        const totalProducts = await prisma.product.count({ where: { isActive: true } });

        // Total customers
        const totalCustomers = await prisma.customer.count({ where: { isActive: true } });

        // Low stock count
        const lowStock = await prisma.inventory.count({
            where: {
                branchId,
                quantity: { lte: 10 },
            },
        });

        // Recent sales
        const recentSales = await prisma.transaction.findMany({
            where: { branchId, status: 'COMPLETED', type: 'SALE' },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { customer: { select: { name: true } } },
        });

        res.json({
            success: true,
            data: {
                todaySales: todaySales._sum.total || 0,
                todayOrders: todaySales._count.id || 0,
                totalProducts,
                totalCustomers,
                lowStockCount: lowStock,
                recentSales: recentSales.map(s => ({
                    id: s.id,
                    transactionNo: s.transactionNo,
                    total: s.total,
                    customerName: s.customer?.name || 'Walk-in',
                    createdAt: s.createdAt,
                })),
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SALES REPORT
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/sales', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { startDate, endDate, groupBy = 'day' } = req.query;
        const filter = (req as any).branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;

        const start = startDate ? new Date(String(startDate)) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = endDate ? new Date(String(endDate)) : new Date();
        end.setHours(23, 59, 59, 999);

        const txWhere: Record<string, unknown> = {
            type: 'SALE',
            status: 'COMPLETED',
            createdAt: { gte: start, lte: end },
        };
        applyScopeFilter(txWhere, filter, 'storeId');
        if (!filter) txWhere.branchId = branchId;

        const sales = await prisma.transaction.findMany({
            where: txWhere as any,
            select: {
                id: true,
                total: true,
                subtotal: true,
                taxAmount: true,
                discountAmount: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        // Group by day/week/month
        const grouped: Record<string, { date: string; total: number; count: number; tax: number; discount: number }> = {};

        sales.forEach(sale => {
            let key: string;
            const d = new Date(sale.createdAt);

            if (groupBy === 'month') {
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            } else if (groupBy === 'week') {
                const weekStart = new Date(d);
                weekStart.setDate(d.getDate() - d.getDay());
                key = weekStart.toISOString().slice(0, 10);
            } else {
                key = d.toISOString().slice(0, 10);
            }

            if (!grouped[key]) {
                grouped[key] = { date: key, total: 0, count: 0, tax: 0, discount: 0 };
            }
            grouped[key].total += sale.total;
            grouped[key].count += 1;
            grouped[key].tax += sale.taxAmount;
            grouped[key].discount += sale.discountAmount;
        });

        const data = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));

        res.json({
            success: true,
            data,
            summary: {
                totalSales: sales.reduce((sum, s) => sum + s.total, 0),
                totalOrders: sales.length,
                totalTax: sales.reduce((sum, s) => sum + s.taxAmount, 0),
                totalDiscount: sales.reduce((sum, s) => sum + s.discountAmount, 0),
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// TOP PRODUCTS REPORT
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/top-products', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { startDate, endDate, limit = 10 } = req.query;
        const filter = (req as any).branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;

        const start = startDate ? new Date(String(startDate)) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = endDate ? new Date(String(endDate)) : new Date();
        end.setHours(23, 59, 59, 999);

        // Get all completed transactions in date range
        const txWhere: Record<string, unknown> = {
            type: 'SALE',
            status: 'COMPLETED',
            createdAt: { gte: start, lte: end },
        };
        applyScopeFilter(txWhere, filter, 'storeId');
        if (!filter) txWhere.branchId = branchId;

        const transactions = await prisma.transaction.findMany({
            where: txWhere as any,
            select: { id: true },
        });

        const transactionIds = transactions.map(t => t.id);

        // Aggregate by product
        const items = await prisma.transactionItem.groupBy({
            by: ['productId', 'productName'],
            where: {
                transactionId: { in: transactionIds },
            },
            _sum: { quantity: true, total: true },
            orderBy: { _sum: { total: 'desc' } },
            take: Number(limit),
        });

        res.json({
            success: true,
            data: items.map((item, index) => ({
                rank: index + 1,
                productId: item.productId,
                productName: item.productName,
                quantitySold: item._sum.quantity || 0,
                revenue: item._sum.total || 0,
            })),
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY REPORT
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/inventory', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { lowStockOnly, page = '1', limit = '20', search, stockFilter } = req.query;
        const filter = (req as any).branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const where: Record<string, unknown> = {};
        applyScopeFilter(where, filter, 'storeId');
        if (!filter) where.branchId = branchId;
        if (lowStockOnly === 'true' || stockFilter === 'low') {
            where.quantity = { lte: 10, gt: 0 };
        } else if (stockFilter === 'out') {
            where.quantity = { lte: 0 };
        } else if (stockFilter === 'ok') {
            where.quantity = { gt: 10 };
        }

        // Get total count for pagination
        const total = await prisma.inventory.count({ where });

        const inventory = await prisma.inventory.findMany({
            where,
            include: {
                product: {
                    select: { id: true, name: true, sku: true, price: true, cost: true }
                }
            },
            orderBy: { quantity: 'asc' },
            skip,
            take: limitNum,
        });

        // Filter by search if provided
        let data = inventory.map(inv => ({
            productId: inv.productId,
            name: inv.product.name,
            sku: inv.product.sku,
            currentStock: inv.quantity,
            minStock: 10, // Default min stock
            unitCost: inv.product.cost,
            price: inv.product.price,
            stockValue: inv.quantity * inv.product.cost,
            retailValue: inv.quantity * inv.product.price,
            isLowStock: inv.quantity <= 10,
        }));

        // Apply search filter
        if (search) {
            const searchLower = String(search).toLowerCase();
            data = data.filter(d => 
                d.name?.toLowerCase().includes(searchLower) || 
                d.sku?.toLowerCase().includes(searchLower)
            );
        }

        // Get summary stats (unfiltered by pagination)
        const summaryWhere: Record<string, unknown> = {};
        applyScopeFilter(summaryWhere, filter, 'storeId');
        if (!filter) summaryWhere.branchId = branchId;
        const allInventory = await prisma.inventory.findMany({
            where: summaryWhere,
            include: { product: { select: { cost: true, price: true } } },
        });

        res.json({
            success: true,
            data,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
            summary: {
                totalItems: allInventory.length,
                lowStockItems: allInventory.filter(i => i.quantity <= 10 && i.quantity > 0).length,
                outOfStock: allInventory.filter(i => i.quantity <= 0).length,
                totalStockValue: allInventory.reduce((sum, i) => sum + i.quantity * i.product.cost, 0),
                totalRetailValue: allInventory.reduce((sum, i) => sum + i.quantity * i.product.price, 0),
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT METHODS REPORT
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/payments', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;

        const start = startDate ? new Date(String(startDate)) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = endDate ? new Date(String(endDate)) : new Date();
        end.setHours(23, 59, 59, 999);

        // Get transactions in date range
        const txWhere: Record<string, unknown> = {
            type: 'SALE',
            status: 'COMPLETED',
            createdAt: { gte: start, lte: end },
        };
        applyScopeFilter(txWhere, filter, 'storeId');
        if (!filter) txWhere.branchId = branchId;

        const transactions = await prisma.transaction.findMany({
            where: txWhere as any,
            select: { id: true },
        });

        const transactionIds = transactions.map(t => t.id);

        // Aggregate payments by method
        const payments = await prisma.transactionPayment.groupBy({
            by: ['methodName'],
            where: {
                transactionId: { in: transactionIds },
            },
            _sum: { amount: true },
            _count: { id: true },
        });

        res.json({
            success: true,
            data: payments.map(p => ({
                method: p.methodName,
                total: p._sum.amount || 0,
                count: p._count.id || 0,
            })),
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER REPORT
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/customers', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { from, to, limit = 20, page = '1', search } = req.query;
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        // Parse date range
        const startDate = from ? new Date(String(from)) : new Date(new Date().setMonth(new Date().getMonth() - 1));
        const endDate = to ? new Date(String(to)) : new Date();
        endDate.setHours(23, 59, 59, 999);

        // Previous period for comparison
        const periodMs = endDate.getTime() - startDate.getTime();
        const prevStartDate = new Date(startDate.getTime() - periodMs);
        const prevEndDate = new Date(startDate.getTime() - 1);

        // Run all queries in parallel for better performance
        const [
            totalCustomers,
            newCustomers,
            prevNewCustomers,
            activeCustomersData,
            revenueData,
            topCustomers,
            topCustomersTotal,
            customersByTier,
        ] = await Promise.all([
            // Total customers
            prisma.customer.count({ where: { isActive: true } }),
            
            // New customers in period
            prisma.customer.count({
                where: {
                    isActive: true,
                    createdAt: { gte: startDate, lte: endDate },
                },
            }),
            
            // New customers in previous period (for growth comparison)
            prisma.customer.count({
                where: {
                    isActive: true,
                    createdAt: { gte: prevStartDate, lte: prevEndDate },
                },
            }),
            
            // Active customers (who made purchases in period)
            prisma.transaction.groupBy({
                by: ['customerId'],
                where: {
                    ...(filter ? {} : { branchId }),
                    ...(filter?.scopeByStore && filter.storeIds.length > 0 ? { storeId: { in: filter.storeIds } } : {}),
                    ...(filter && !filter.scopeByStore && filter.branchIds.length > 0 ? { branchId: { in: filter.branchIds } } : {}),
                    status: 'COMPLETED',
                    type: 'SALE',
                    createdAt: { gte: startDate, lte: endDate },
                    customerId: { not: null },
                },
            }),
            
            // Revenue from customers in period
            prisma.transaction.aggregate({
                where: {
                    ...(filter ? {} : { branchId }),
                    ...(filter?.scopeByStore && filter.storeIds.length > 0 ? { storeId: { in: filter.storeIds } } : {}),
                    ...(filter && !filter.scopeByStore && filter.branchIds.length > 0 ? { branchId: { in: filter.branchIds } } : {}),
                    status: 'COMPLETED',
                    type: 'SALE',
                    createdAt: { gte: startDate, lte: endDate },
                },
                _sum: { total: true },
                _count: true,
            }),
            
            // Top customers by spending (optimized - no nested transactions)
            prisma.customer.findMany({
                where: search ? {
                    isActive: true,
                    OR: [
                        { name: { contains: String(search), mode: 'insensitive' } },
                        { phone: { contains: String(search), mode: 'insensitive' } },
                    ],
                } : { isActive: true },
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    email: true,
                    totalSpent: true,
                    visitCount: true,
                    lastVisitAt: true,
                    memberCode: true,
                },
                orderBy: { totalSpent: 'desc' },
                skip,
                take: limitNum,
            }),
            
            // Get total customer count for pagination
            prisma.customer.count({
                where: search ? {
                    isActive: true,
                    OR: [
                        { name: { contains: String(search), mode: 'insensitive' } },
                        { phone: { contains: String(search), mode: 'insensitive' } },
                    ],
                } : { isActive: true },
            }),
            
            // Customers by tier/segment
            prisma.customer.groupBy({
                by: ['memberCode'],
                where: { isActive: true },
                _count: true,
            }),
        ]);

        // Calculate metrics
        const activeCustomers = activeCustomersData.length;
        const totalRevenue = revenueData._sum.total || 0;
        const totalOrders = revenueData._count || 0;
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        const avgOrdersPerCustomer = activeCustomers > 0 ? totalOrders / activeCustomers : 0;

        // Calculate retention rate (active customers / total customers)
        const retentionRate = totalCustomers > 0 ? (activeCustomers / totalCustomers) * 100 : 0;

        // Customer growth rate
        const growthRate = prevNewCustomers > 0 
            ? ((newCustomers - prevNewCustomers) / prevNewCustomers) * 100 
            : newCustomers > 0 ? 100 : 0;

        // Segment data with percentage and revenue
        const vipCustomers = topCustomers.filter(c => c.totalSpent >= 10000000);
        const regularCustomers = topCustomers.filter(c => c.totalSpent >= 1000000 && c.totalSpent < 10000000);
        const inactiveCount = Math.max(0, totalCustomers - activeCustomers);
        const segmentsRaw = [
            { name: 'VIP', count: vipCustomers.length, revenue: vipCustomers.reduce((s, c) => s + (c.totalSpent || 0), 0), color: '#8B5CF6' },
            { name: 'ປະຈຳ', count: regularCustomers.length, revenue: regularCustomers.reduce((s, c) => s + (c.totalSpent || 0), 0), color: '#3B82F6' },
            { name: 'ໃໝ່', count: newCustomers, revenue: 0, color: '#10B981' },
            { name: 'ທົ່ວໄປ', count: inactiveCount, revenue: 0, color: '#6B7280' },
        ];
        const segTotal = segmentsRaw.reduce((s, seg) => s + seg.count, 0) || 1;
        const segments = segmentsRaw.map(seg => ({
            ...seg,
            percentage: Math.round((seg.count / segTotal) * 100 * 10) / 10,
        }));

        res.json({
            success: true,
            data: {
                summary: {
                    totalCustomers,
                    newCustomers,
                    activeCustomers,
                    totalRevenue,
                    avgOrderValue: Math.round(avgOrderValue),
                    avgOrdersPerCustomer: Math.round(avgOrdersPerCustomer * 10) / 10,
                    growthRate: Math.round(growthRate * 10) / 10,
                },
                topCustomers: topCustomers.map((c, index) => ({
                    rank: skip + index + 1,
                    id: c.id,
                    name: c.name,
                    phone: c.phone,
                    email: c.email,
                    memberCode: c.memberCode,
                    totalSpent: c.totalSpent,
                    orderCount: c.visitCount,
                    lastOrder: c.lastVisitAt,
                    averageOrder: c.visitCount > 0 ? Math.round(c.totalSpent / c.visitCount) : 0,
                })),
                segments,
                retentionRate: Math.round(retentionRate * 10) / 10,
                customerGrowth: [], // Could add monthly growth data if needed
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: topCustomersTotal,
                    totalPages: Math.ceil(topCustomersTotal / limitNum),
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS REPORT (with sales data)
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/products', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { period = 'month', page = '1', limit = '20', search } = req.query;
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        // Calculate date range based on period
        const now = new Date();
        let start: Date;
        switch (period) {
            case 'day':
                start = new Date(now.setHours(0, 0, 0, 0));
                break;
            case 'week':
                start = new Date(now);
                start.setDate(start.getDate() - 7);
                break;
            case 'year':
                start = new Date(now);
                start.setFullYear(start.getFullYear() - 1);
                break;
            default: // month
                start = new Date(now);
                start.setMonth(start.getMonth() - 1);
        }

        // Get all completed transactions in date range
        const txWhere: Record<string, unknown> = {
            type: 'SALE',
            status: 'COMPLETED',
            createdAt: { gte: start },
        };
        applyScopeFilter(txWhere, filter, 'storeId');
        if (!filter) txWhere.branchId = branchId;

        const transactions = await prisma.transaction.findMany({
            where: txWhere as any,
            select: { id: true },
        });

        const transactionIds = transactions.map(t => t.id);

        // Build where clause for search
        const itemWhere: Record<string, unknown> = {
            transactionId: { in: transactionIds },
        };
        if (search) {
            itemWhere.OR = [
                { productName: { contains: String(search), mode: 'insensitive' } },
                { sku: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        // Get total count for pagination
        const allItems = await prisma.transactionItem.groupBy({
            by: ['productId'],
            where: itemWhere,
        });
        const total = allItems.length;

        // Aggregate by product with pagination
        const items = await prisma.transactionItem.groupBy({
            by: ['productId', 'productName', 'sku'],
            where: itemWhere,
            _sum: { quantity: true, total: true },
            orderBy: { _sum: { total: 'desc' } },
            skip,
            take: limitNum,
        });

        res.json({
            success: true,
            data: items.map((item) => ({
                productId: item.productId,
                name: item.productName,
                sku: item.sku,
                totalSales: item._sum.quantity || 0,
                revenue: item._sum.total || 0,
            })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// FINANCIAL REPORT
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/financial', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { period = 'month' } = req.query;
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;

        // Calculate date range based on period
        const now = new Date();
        let start: Date;
        let previousStart: Date;
        let previousEnd: Date;

        switch (period) {
            case 'day':
                start = new Date(now);
                start.setHours(0, 0, 0, 0);
                previousStart = new Date(start);
                previousStart.setDate(previousStart.getDate() - 1);
                previousEnd = new Date(start);
                break;
            case 'week':
                start = new Date(now);
                start.setDate(start.getDate() - 7);
                previousStart = new Date(start);
                previousStart.setDate(previousStart.getDate() - 7);
                previousEnd = new Date(start);
                break;
            case 'year':
                start = new Date(now);
                start.setFullYear(start.getFullYear() - 1);
                previousStart = new Date(start);
                previousStart.setFullYear(previousStart.getFullYear() - 1);
                previousEnd = new Date(start);
                break;
            default: // month
                start = new Date(now);
                start.setMonth(start.getMonth() - 1);
                previousStart = new Date(start);
                previousStart.setMonth(previousStart.getMonth() - 1);
                previousEnd = new Date(start);
        }

        // Build scoped where clause
        const txWhere: Record<string, unknown> = {
            type: 'SALE',
            status: 'COMPLETED',
            createdAt: { gte: start },
        };
        applyScopeFilter(txWhere, filter, 'storeId');
        if (!filter) txWhere.branchId = branchId;

        const prevTxWhere: Record<string, unknown> = {
            type: 'SALE',
            status: 'COMPLETED',
            createdAt: { gte: previousStart, lt: previousEnd },
        };
        applyScopeFilter(prevTxWhere, filter, 'storeId');
        if (!filter) prevTxWhere.branchId = branchId;

        // Current period revenue
        const currentSales = await prisma.transaction.aggregate({
            where: txWhere as any,
            _sum: { total: true, taxAmount: true, discountAmount: true },
        });

        // Previous period revenue
        const previousSales = await prisma.transaction.aggregate({
            where: prevTxWhere as any,
            _sum: { total: true },
        });

        // Get transactions for payment method breakdown
        const currentTransactions = await prisma.transaction.findMany({
            where: txWhere as any,
            select: { id: true },
        });

        const transactionIds = currentTransactions.map(t => t.id);

        // Payment methods breakdown
        const payments = await prisma.transactionPayment.groupBy({
            by: ['methodName'],
            where: {
                transactionId: { in: transactionIds },
            },
            _sum: { amount: true },
            _count: { id: true },
        });

        const revenue = currentSales._sum.total || 0;
        const expenses = 0; // Would need expense tracking
        const profit = revenue - expenses;

        // Calculate payment method percentages
        const totalPaymentAmount = payments.reduce((s, p) => s + (p._sum.amount || 0), 0) || 1;
        const paymentMethods = payments.map(p => ({
            type: p.methodName?.toLowerCase() || 'cash',
            method: p.methodName?.toLowerCase() || 'cash',
            methodName: p.methodName || 'Cash',
            label: p.methodName || 'Cash',
            total: p._sum.amount || 0,
            count: p._count.id || 0,
            percentage: Math.round(((p._sum.amount || 0) / totalPaymentAmount) * 100 * 10) / 10,
        }));

        // Build daily data from transactions
        const dailyTransactions = await prisma.transaction.findMany({
            where: txWhere as any,
            select: { total: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
        });

        const dailyMap: Record<string, { revenue: number; transactions: number }> = {};
        for (const t of dailyTransactions) {
            const date = t.createdAt.toISOString().split('T')[0];
            if (!dailyMap[date]) dailyMap[date] = { revenue: 0, transactions: 0 };
            dailyMap[date].revenue += t.total;
            dailyMap[date].transactions += 1;
        }
        const dailyData = Object.entries(dailyMap).map(([date, d]) => ({
            date,
            revenue: d.revenue,
            expenses: 0,
            transactions: d.transactions,
        }));

        res.json({
            success: true,
            data: {
                revenue,
                expenses,
                profit,
                profitMargin: revenue > 0 ? Math.round((profit / revenue) * 100 * 10) / 10 : 0,
                previousRevenue: previousSales._sum.total || 0,
                previousExpenses: 0,
                taxCollected: currentSales._sum.taxAmount || 0,
                discountsGiven: currentSales._sum.discountAmount || 0,
                paymentMethods,
                dailyData,
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STAFF REPORT
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/staff', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { period = 'month', page = '1', limit = '20', search } = req.query;
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        // Calculate date range based on period
        const now = new Date();
        let start: Date;
        switch (period) {
            case 'day':
                start = new Date(now.setHours(0, 0, 0, 0));
                break;
            case 'week':
                start = new Date(now);
                start.setDate(start.getDate() - 7);
                break;
            case 'year':
                start = new Date(now);
                start.setFullYear(start.getFullYear() - 1);
                break;
            default: // month
                start = new Date(now);
                start.setMonth(start.getMonth() - 1);
        }

        // Build scoped where
        const txWhere: Record<string, unknown> = {
            type: 'SALE',
            status: 'COMPLETED',
            createdAt: { gte: start },
        };
        applyScopeFilter(txWhere, filter, 'storeId');
        if (!filter) txWhere.branchId = branchId;

        // Get total unique users with sales
        const allSalesByUser = await prisma.transaction.groupBy({
            by: ['userId'],
            where: txWhere as any,
        });
        const total = allSalesByUser.length;

        // Get sales grouped by user with pagination
        const salesByUser = await prisma.transaction.groupBy({
            by: ['userId'],
            where: txWhere as any,
            _sum: { total: true },
            _count: { id: true },
            orderBy: { _sum: { total: 'desc' } },
            skip,
            take: limitNum,
        });

        // Get user details
        const userIds = salesByUser.map(s => s.userId);
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
        });

        const userMap = new Map(users.map(u => [u.id, u]));

        let data = salesByUser.map((s, index) => {
            const user = userMap.get(s.userId);
            return {
                rank: skip + index + 1,
                userId: s.userId,
                name: user?.name || 'Unknown',
                email: user?.email || '',
                totalSales: s._count.id || 0,
                revenue: s._sum.total || 0,
                avgOrderValue: s._count.id > 0 ? (s._sum.total || 0) / s._count.id : 0,
            };
        });

        // Apply search filter
        if (search) {
            const searchLower = String(search).toLowerCase();
            data = data.filter(d => d.name?.toLowerCase().includes(searchLower));
        }

        res.json({
            success: true,
            data,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        next(error);
    }
});
