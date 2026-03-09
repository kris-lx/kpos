// ═══════════════════════════════════════════════════════════════════════════
// Dashboard Module - Routes (Drizzle ORM + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, branchFilter, buildScopeCondition, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { queryCache } from '@/infrastructure/http/middleware/cache.middleware';
import { db, dbRead } from '@/config/database.config';
import { transactions, products, customers, inventory, transactionItems } from '@/db/schema/tables';
import { eq, and, gte, lt, lte, inArray, asc, desc, count, sum, sql } from 'drizzle-orm';

export const dashboardRoutes = Router();

// Helper: build branch check condition
function branchAccessCheck(filter: ScopeFilter | undefined, branchIdParam: string | undefined, res: any): { ok: boolean; branchCondition?: any } {
    if (branchIdParam && filter && !filter.branchIds.includes(String(branchIdParam))) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
        return { ok: false };
    }
    return { ok: true };
}

// Get dashboard stats
dashboardRoutes.get('/stats', authenticate, branchFilter(), queryCache(30, 'dashboard'), async (req, res, next) => {
    try {
        const { branchId } = req.query;
        const filter = req.branchFilter;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const check = branchAccessCheck(filter, branchId as string, res);
        if (!check.ok) return;

        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;

        // Transaction conditions
        const txConds: any[] = [
            gte(transactions.createdAt, today),
            lt(transactions.createdAt, tomorrow),
            eq(transactions.status, 'COMPLETED'),
            eq(transactions.type, 'SALE'),
        ];
        if (tenantId && !req.authUser?.isSuperAdmin) txConds.push(eq(transactions.tenantId, tenantId));
        const txScope = buildScopeCondition(filter, { storeId: transactions.storeId, branchId: transactions.branchId }, 'storeId');
        if (txScope) txConds.push(txScope);
        if (branchId) txConds.push(eq(transactions.branchId, String(branchId)));
        const txWhere = and(...txConds);

        // Product conditions
        const prodConds: any[] = [eq(products.isActive, true)];
        if (tenantId && !req.authUser?.isSuperAdmin) prodConds.push(eq(products.tenantId, tenantId));
        const prodScope = buildScopeCondition(filter, { branchId: products.branchId }, 'branchId');
        if (prodScope) prodConds.push(prodScope);

        // Customer conditions
        const custConds: any[] = [eq(customers.isActive, true)];
        if (tenantId && !req.authUser?.isSuperAdmin) custConds.push(eq(customers.tenantId, tenantId));
        const custScope = buildScopeCondition(filter, { storeId: customers.storeId, branchId: customers.branchId }, 'storeId');
        if (custScope) custConds.push(custScope);

        // Low stock conditions
        const invConds = [lte(inventory.quantity, 10)];
        const invScope = buildScopeCondition(filter, { branchId: inventory.branchId }, 'branchId');
        if (invScope) invConds.push(invScope);

        const [
            [{ salesSum, orderCount }],
            [{ value: totalProducts }],
            [{ value: totalCustomers }],
            [{ value: lowStockCount }],
        ] = await Promise.all([
            dbRead.select({ salesSum: sum(transactions.total), orderCount: count() }).from(transactions).where(txWhere),
            dbRead.select({ value: count() }).from(products).where(and(...prodConds)),
            dbRead.select({ value: count() }).from(customers).where(and(...custConds)),
            dbRead.select({ value: count() }).from(inventory).where(and(...invConds)),
        ]);

        const todaySalesNum = Number(salesSum) || 0;
        const todayOrders = Number(orderCount) || 0;
        const avgOrderValue = todayOrders > 0 ? todaySalesNum / todayOrders : 0;

        res.json({
            success: true,
            data: {
                todaySales: todaySalesNum,
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
        const filter = req.branchFilter;

        const check = branchAccessCheck(filter, branchId as string, res);
        if (!check.ok) return;

        const conditions = [lte(inventory.quantity, 10)];
        const scope = buildScopeCondition(filter, { branchId: inventory.branchId }, 'branchId');
        if (scope) conditions.push(scope);
        if (branchId) {
            conditions.push(eq(inventory.branchId, String(branchId)));
        } else if (!filter) {
            const authUser = req.authUser;
            if (authUser?.activeBranchId) conditions.push(eq(inventory.branchId, authUser.activeBranchId));
        }

        const lowStockItems = await dbRead.query.inventory.findMany({
            where: and(...conditions),
            with: { product: true },
            limit: 10,
            orderBy: asc(inventory.quantity),
        });

        const alerts = lowStockItems
            .filter(item => item.product?.isActive)
            .map(item => ({
                name: item.product!.name,
                sku: item.product!.sku,
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
        const filter = req.branchFilter;

        let startDate = new Date();
        switch (period) {
            case '7days': startDate.setDate(startDate.getDate() - 7); break;
            case '30days': startDate.setDate(startDate.getDate() - 30); break;
            case '90days': startDate.setDate(startDate.getDate() - 90); break;
        }
        startDate.setHours(0, 0, 0, 0);

        const check = branchAccessCheck(filter, branchId as string, res);
        if (!check.ok) return;

        const conditions: any[] = [
            gte(transactions.createdAt, startDate),
            eq(transactions.status, 'COMPLETED'),
            eq(transactions.type, 'SALE'),
        ];
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) conditions.push(eq(transactions.tenantId, tenantId));
        const scope = buildScopeCondition(filter, { storeId: transactions.storeId, branchId: transactions.branchId }, 'storeId');
        if (scope) conditions.push(scope);
        if (branchId) conditions.push(eq(transactions.branchId, String(branchId)));

        const rows = await dbRead.query.transactions.findMany({
            where: and(...conditions),
            orderBy: asc(transactions.createdAt),
        });

        // Group by date
        const groupedData = rows.reduce((acc: Record<string, number>, tx) => {
            const date = tx.createdAt.toISOString().split('T')[0];
            acc[date] = (acc[date] || 0) + tx.total;
            return acc;
        }, {});

        const chartData = Object.entries(groupedData).map(([date, total]) => ({ date, total }));

        res.json({ success: true, data: chartData });
    } catch (error) {
        next(error);
    }
});

// Get recent transactions
dashboardRoutes.get('/recent-transactions', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { branchId, limit = 10 } = req.query;
        const filter = req.branchFilter;

        const check = branchAccessCheck(filter, branchId as string, res);
        if (!check.ok) return;

        const conditions: any[] = [];
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) conditions.push(eq(transactions.tenantId, tenantId));
        const scope = buildScopeCondition(filter, { storeId: transactions.storeId, branchId: transactions.branchId }, 'storeId');
        if (scope) conditions.push(scope);
        if (branchId) conditions.push(eq(transactions.branchId, String(branchId)));

        const rows = await dbRead.query.transactions.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            limit: Number(limit),
            orderBy: desc(transactions.createdAt),
            with: {
                customer: true,
                user: true,
            },
        });

        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
});

// Get top selling products
dashboardRoutes.get('/top-products', authenticate, branchFilter(), queryCache(60, 'dashboard'), async (req, res, next) => {
    try {
        const { branchId, limit = 5 } = req.query;
        const filter = req.branchFilter;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const check = branchAccessCheck(filter, branchId as string, res);
        if (!check.ok) return;

        const conditions: any[] = [
            gte(transactions.createdAt, thirtyDaysAgo),
            eq(transactions.status, 'COMPLETED'),
            eq(transactions.type, 'SALE'),
        ];
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) conditions.push(eq(transactions.tenantId, tenantId));
        const scope = buildScopeCondition(filter, { storeId: transactions.storeId, branchId: transactions.branchId }, 'storeId');
        if (scope) conditions.push(scope);
        if (branchId) conditions.push(eq(transactions.branchId, String(branchId)));

        const txRows = await dbRead.query.transactions.findMany({
            where: and(...conditions),
            columns: { id: true },
        });

        const transactionIds = txRows.map(t => t.id);
        if (transactionIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const items = await dbRead.query.transactionItems.findMany({
            where: inArray(transactionItems.transactionId, transactionIds),
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

        const topProducts = Object.entries(productMap)
            .map(([id, data]) => ({ id, name: data.name, totalQuantity: data.quantity, totalRevenue: data.revenue }))
            .sort((a, b) => b.totalQuantity - a.totalQuantity)
            .slice(0, Number(limit));

        res.json({ success: true, data: topProducts });
    } catch (error) {
        next(error);
    }
});
