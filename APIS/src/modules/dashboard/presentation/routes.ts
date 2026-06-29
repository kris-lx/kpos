// ═══════════════════════════════════════════════════════════════════════════
// Dashboard Module - Routes (Drizzle ORM + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, branchFilter, buildScopeCondition, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { queryCache } from '@/infrastructure/http/middleware/cache.middleware';
import { db, dbRead } from '@/config/database.config';
import { transactions, products, customers, inventory, transactionItems, transactionPayments, users } from '@/db/schema/tables';
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

// Get dashboard stats (comprehensive — D-01 through D-07)
dashboardRoutes.get('/stats', authenticate, branchFilter(), queryCache(30, 'dashboard'), async (req, res, next) => {
    try {
        const { branchId } = req.query;
        const filter = req.branchFilter;

        const check = branchAccessCheck(filter, branchId as string, res);
        if (!check.ok) return;

        const now = new Date();
        const today = new Date(now); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);

        const tenantId = req.authUser?.tenantId;
        const isSuperAdmin = req.authUser?.isSuperAdmin;
        const txScope = buildScopeCondition(filter, { storeId: transactions.storeId, branchId: transactions.branchId }, 'storeId');

        const baseTx = (from: Date, to: Date) => {
            const c: any[] = [gte(transactions.createdAt, from), lt(transactions.createdAt, to)];
            if (tenantId && !isSuperAdmin) c.push(eq(transactions.tenantId, tenantId));
            if (txScope) c.push(txScope);
            if (branchId) c.push(eq(transactions.branchId, String(branchId)));
            return c;
        };

        const todaySaleW    = and(...baseTx(today, tomorrow),       eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE'));
        const yesterdaySaleW = and(...baseTx(yesterday, today),      eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE'));
        const mtdSaleW      = and(...baseTx(mtdStart, tomorrow),     eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE'));
        const lastMoSaleW   = and(...baseTx(lastMonthStart, mtdStart), eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE'));
        const todayVoidW    = and(...baseTx(today, tomorrow),        eq(transactions.status, 'VOIDED'));
        const todayRefundW  = and(...baseTx(today, tomorrow),        eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'REFUND'));
        const sevenDaySaleW = and(...baseTx(sevenDaysAgo, tomorrow), eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE'));

        const prodConds: any[] = [eq(products.isActive, true)];
        if (tenantId && !isSuperAdmin) prodConds.push(eq(products.tenantId, tenantId));
        const prodScope = buildScopeCondition(filter, { branchId: products.branchId }, 'branchId');
        if (prodScope) prodConds.push(prodScope);

        const custConds: any[] = [eq(customers.isActive, true)];
        if (tenantId && !isSuperAdmin) custConds.push(eq(customers.tenantId, tenantId));
        const custScope = buildScopeCondition(filter, { storeId: customers.storeId, branchId: customers.branchId }, 'storeId');
        if (custScope) custConds.push(custScope);

        const invConds: any[] = [lte(inventory.quantity, 10)];
        const invScope = buildScopeCondition(filter, { branchId: inventory.branchId }, 'branchId');
        if (invScope) invConds.push(invScope);

        const [
            [todayStat],
            [yesterdayStat],
            [mtdStat],
            [lastMoStat],
            [voidStat],
            [refundStat],
            paymentRows,
            [{ value: totalProducts }],
            [{ value: totalCustomers }],
            [{ value: lowStockCount }],
            topProductsRows,
            topCashierRows,
            sevenDaysRows,
            lowStockItemsData,
        ] = await Promise.all([
            dbRead.select({ salesSum: sum(transactions.total), orderCount: count() }).from(transactions).where(todaySaleW),
            dbRead.select({ salesSum: sum(transactions.total) }).from(transactions).where(yesterdaySaleW),
            dbRead.select({ salesSum: sum(transactions.total) }).from(transactions).where(mtdSaleW),
            dbRead.select({ salesSum: sum(transactions.total) }).from(transactions).where(lastMoSaleW),
            dbRead.select({ cnt: count(), total: sum(transactions.total) }).from(transactions).where(todayVoidW),
            dbRead.select({ cnt: count(), total: sum(transactions.total) }).from(transactions).where(todayRefundW),
            dbRead.select({ methodName: transactionPayments.methodName, amount: sum(transactionPayments.amount) })
                .from(transactionPayments)
                .innerJoin(transactions, eq(transactionPayments.transactionId, transactions.id))
                .where(todaySaleW)
                .groupBy(transactionPayments.methodName),
            dbRead.select({ value: count() }).from(products).where(and(...prodConds)),
            dbRead.select({ value: count() }).from(customers).where(and(...custConds)),
            dbRead.select({ value: count() }).from(inventory).where(and(...invConds)),
            dbRead.select({
                productId: transactionItems.productId,
                productName: transactionItems.productName,
                qtySold: sum(transactionItems.quantity),
                revenue: sum(transactionItems.total),
            }).from(transactionItems)
              .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
              .where(todaySaleW)
              .groupBy(transactionItems.productId, transactionItems.productName)
              .orderBy(desc(sum(transactionItems.quantity)))
              .limit(5),
            dbRead.select({
                userId: transactions.userId,
                userName: users.name,
                orderCount: count(),
                totalSales: sum(transactions.total),
            }).from(transactions)
              .leftJoin(users, eq(transactions.userId, users.id))
              .where(todaySaleW)
              .groupBy(transactions.userId, users.name)
              .orderBy(desc(sum(transactions.total)))
              .limit(1),
            dbRead.select({ createdAt: transactions.createdAt, total: transactions.total }).from(transactions).where(sevenDaySaleW),
            dbRead.query.inventory.findMany({ where: and(...invConds), with: { product: true }, limit: 10, orderBy: asc(inventory.quantity) }),
        ]);

        const todaySalesNum   = Number(todayStat.salesSum)   || 0;
        const todayOrders     = Number(todayStat.orderCount) || 0;
        const avgOrderValue   = todayOrders > 0 ? todaySalesNum / todayOrders : 0;
        const yesterdaySalesNum = Number(yesterdayStat.salesSum) || 0;
        const salesGrowthPct  = yesterdaySalesNum > 0
            ? ((todaySalesNum - yesterdaySalesNum) / yesterdaySalesNum) * 100
            : todaySalesNum > 0 ? 100 : 0;
        const mtdSalesNum     = Number(mtdStat.salesSum)   || 0;
        const lastMoSalesNum  = Number(lastMoStat.salesSum) || 0;
        const mtdGrowthPct    = lastMoSalesNum > 0
            ? ((mtdSalesNum - lastMoSalesNum) / lastMoSalesNum) * 100
            : mtdSalesNum > 0 ? 100 : 0;
        const voidCount       = Number(voidStat.cnt)    || 0;
        const voidAmount      = Number(voidStat.total)  || 0;
        const refundCount     = Number(refundStat.cnt)  || 0;
        const refundAmount    = Number(refundStat.total) || 0;
        const netRevenue      = Math.max(0, todaySalesNum - refundAmount - voidAmount);

        const totalPayments = paymentRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const revenueByPaymentMethod = paymentRows.map(r => ({
            method: r.methodName,
            amount: Number(r.amount) || 0,
            pct: totalPayments > 0 ? Math.round(((Number(r.amount) || 0) / totalPayments) * 1000) / 10 : 0,
        }));

        const topProducts = topProductsRows.map(r => ({
            productId: r.productId,
            name: r.productName,
            qtySold: Number(r.qtySold) || 0,
            revenue: Number(r.revenue) || 0,
        }));

        const topCashier = topCashierRows[0] ? {
            userId: topCashierRows[0].userId,
            name: topCashierRows[0].userName || 'Unknown',
            totalSales: Number(topCashierRows[0].totalSales) || 0,
            orderCount: Number(topCashierRows[0].orderCount) || 0,
        } : null;

        // Build 7-day series with zero-fill for missing days
        const dayMap: Record<string, { amount: number; orders: number }> = {};
        sevenDaysRows.forEach(r => {
            const date = r.createdAt.toISOString().split('T')[0];
            if (!dayMap[date]) dayMap[date] = { amount: 0, orders: 0 };
            dayMap[date].amount += r.total;
            dayMap[date].orders++;
        });
        const last7DaysSales: { date: string; amount: number; orders: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today); d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            last7DaysSales.push({ date: dateStr, amount: dayMap[dateStr]?.amount ?? 0, orders: dayMap[dateStr]?.orders ?? 0 });
        }

        const lowStockItems = lowStockItemsData
            .filter(i => i.product?.isActive)
            .map(i => ({ productId: i.productId, name: i.product!.name, qty: i.quantity, minQty: i.product!.lowStockThreshold || 10 }));

        res.json({
            success: true,
            data: {
                todaySales: todaySalesNum,
                todayOrders,
                avgOrderValue,
                totalProducts,
                totalCustomers,
                lowStockCount,
                yesterdaySales: yesterdaySalesNum,
                salesGrowthPct: Math.round(salesGrowthPct * 10) / 10,
                monthToDateSales: mtdSalesNum,
                lastMonthSales: lastMoSalesNum,
                mtdGrowthPct: Math.round(mtdGrowthPct * 10) / 10,
                voidCount,
                voidAmount,
                refundCount,
                refundAmount,
                netRevenue,
                revenueByPaymentMethod,
                topProducts,
                topCashier,
                lowStockItems,
                last7DaysSales,
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
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const check = branchAccessCheck(filter, branchId as string, res);
        if (!check.ok) return;

        const tenantId = req.authUser?.tenantId;
        const txConds: any[] = [
            gte(transactions.createdAt, thirtyDaysAgo),
            eq(transactions.status, 'COMPLETED'),
            eq(transactions.type, 'SALE'),
        ];
        if (tenantId && !req.authUser?.isSuperAdmin) txConds.push(eq(transactions.tenantId, tenantId));
        const scope = buildScopeCondition(filter, { storeId: transactions.storeId, branchId: transactions.branchId }, 'storeId');
        if (scope) txConds.push(scope);
        if (branchId) txConds.push(eq(transactions.branchId, String(branchId)));

        const rows = await dbRead.select({
            id: transactionItems.productId,
            name: transactionItems.productName,
            totalQuantity: sum(transactionItems.quantity),
            totalRevenue: sum(transactionItems.total),
        }).from(transactionItems)
          .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
          .where(and(...txConds))
          .groupBy(transactionItems.productId, transactionItems.productName)
          .orderBy(desc(sum(transactionItems.quantity)))
          .limit(Number(limit));

        res.json({ success: true, data: rows.map(r => ({ ...r, totalQuantity: Number(r.totalQuantity) || 0, totalRevenue: Number(r.totalRevenue) || 0 })) });
    } catch (error) {
        next(error);
    }
});
