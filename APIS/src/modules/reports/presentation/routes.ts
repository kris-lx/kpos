// ═══════════════════════════════════════════════════════════════════════════
// Reports Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, buildScopeCondition, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { db, dbRead } from '@/config/database.config';
import { transactions, transactionItems, transactionPayments, products, customers, inventory, users } from '@/db/schema/tables';
import { eq, and, or, not, ilike, inArray, isNotNull, gte, lte, lt, desc, asc, count, sum, sql } from 'drizzle-orm';

export const reportRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/summary', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;

        // Build scope conditions
        const txConds: any[] = [eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE'), gte(transactions.createdAt, today), lt(transactions.createdAt, tomorrow)];
        if (tenantId && !req.authUser?.isSuperAdmin) txConds.push(eq(transactions.tenantId, tenantId));
        const scopeCond = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (scopeCond) txConds.push(scopeCond);
        if (!filter) txConds.push(eq(transactions.branchId, branchId));

        const [todaySales] = await dbRead.select({ total: sum(transactions.total), cnt: count() }).from(transactions).where(and(...txConds));

        // Total products
        const prodConds: any[] = [eq(products.isActive, true)];
        if (tenantId && !req.authUser?.isSuperAdmin) prodConds.push(eq(products.tenantId, tenantId));
        const prodScope = buildScopeCondition(filter, { branchId: products.branchId }, 'branchId');
        if (prodScope) prodConds.push(prodScope);
        if (!filter) prodConds.push(eq(products.branchId, branchId));
        const [{ value: totalProducts }] = await dbRead.select({ value: count() }).from(products).where(and(...prodConds));

        // Total customers
        const custConds: any[] = [eq(customers.isActive, true)];
        if (tenantId && !req.authUser?.isSuperAdmin) custConds.push(eq(customers.tenantId, tenantId));
        const custScope = buildScopeCondition(filter, { storeId: customers.storeId }, 'storeId');
        if (custScope) custConds.push(custScope);
        const [{ value: totalCustomers }] = await dbRead.select({ value: count() }).from(customers).where(and(...custConds));

        // Low stock
        const invConds: any[] = [lte(inventory.quantity, 10)];
        const invScope = buildScopeCondition(filter, { branchId: inventory.branchId }, 'branchId');
        if (invScope) invConds.push(invScope);
        if (!filter) invConds.push(eq(inventory.branchId, branchId));
        const [{ value: lowStock }] = await dbRead.select({ value: count() }).from(inventory).where(and(...invConds));

        // Recent sales
        const recentConds: any[] = [eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE')];
        if (scopeCond) recentConds.push(scopeCond);
        if (!filter) recentConds.push(eq(transactions.branchId, branchId));
        const recentSales = await dbRead.query.transactions.findMany({
            where: and(...recentConds),
            limit: 5,
            orderBy: desc(transactions.createdAt),
            with: { customer: true },
        });

        res.json({
            success: true,
            data: {
                todaySales: Number(todaySales.total) || 0,
                todayOrders: todaySales.cnt || 0,
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
        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;

        const start = startDate ? new Date(String(startDate)) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = endDate ? new Date(String(endDate)) : new Date();
        end.setHours(23, 59, 59, 999);

        const salesConds: any[] = [eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'), gte(transactions.createdAt, start), lte(transactions.createdAt, end)];
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) salesConds.push(eq(transactions.tenantId, tenantId));
        const salesScope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (salesScope) salesConds.push(salesScope);
        if (!filter) salesConds.push(eq(transactions.branchId, branchId));

        const sales = await dbRead.query.transactions.findMany({
            where: and(...salesConds),
            columns: { id: true, total: true, subtotal: true, taxAmount: true, discountAmount: true, createdAt: true },
            orderBy: asc(transactions.createdAt),
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
        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;

        const start = startDate ? new Date(String(startDate)) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = endDate ? new Date(String(endDate)) : new Date();
        end.setHours(23, 59, 59, 999);

        const tpConds: any[] = [eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'), gte(transactions.createdAt, start), lte(transactions.createdAt, end)];
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) tpConds.push(eq(transactions.tenantId, tenantId));
        const tpScope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (tpScope) tpConds.push(tpScope);
        if (!filter) tpConds.push(eq(transactions.branchId, branchId));

        const txIds = await dbRead.query.transactions.findMany({
            where: and(...tpConds),
            columns: { id: true },
        });
        const transactionIds = txIds.map(t => t.id);

        const items = transactionIds.length > 0
            ? await dbRead.select({
                productId: transactionItems.productId,
                productName: transactionItems.productName,
                quantitySold: sum(transactionItems.quantity),
                revenue: sum(transactionItems.total),
            }).from(transactionItems)
                .where(inArray(transactionItems.transactionId, transactionIds))
                .groupBy(transactionItems.productId, transactionItems.productName)
                .orderBy(desc(sum(transactionItems.total)))
                .limit(Number(limit))
            : [];

        res.json({
            success: true,
            data: items.map((item, index) => ({
                rank: index + 1,
                productId: item.productId,
                productName: item.productName,
                quantitySold: Number(item.quantitySold) || 0,
                revenue: Number(item.revenue) || 0,
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
        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const invConds2: any[] = [];
        const invScope2 = buildScopeCondition(filter, { branchId: inventory.branchId }, 'branchId');
        if (invScope2) invConds2.push(invScope2);
        if (!filter) invConds2.push(eq(inventory.branchId, branchId));
        if (lowStockOnly === 'true' || stockFilter === 'low') {
            invConds2.push(lte(inventory.quantity, 10), sql`${inventory.quantity} > 0`);
        } else if (stockFilter === 'out') {
            invConds2.push(lte(inventory.quantity, 0));
        } else if (stockFilter === 'ok') {
            invConds2.push(sql`${inventory.quantity} > 10`);
        }

        const invWhere2 = invConds2.length > 0 ? and(...invConds2) : undefined;
        const [{ value: total }] = await dbRead.select({ value: count() }).from(inventory).where(invWhere2);

        const invRows = await dbRead.query.inventory.findMany({
            where: invWhere2,
            with: { product: true },
            orderBy: asc(inventory.quantity),
            offset: skip,
            limit: limitNum,
        });

        // Filter by search if provided
        let data = invRows.map(inv => ({
            productId: inv.productId,
            name: inv.product?.name || '',
            sku: inv.product?.sku || '',
            currentStock: inv.quantity,
            minStock: 10,
            unitCost: inv.product?.cost || 0,
            price: inv.product?.price || 0,
            stockValue: inv.quantity * (inv.product?.cost || 0),
            retailValue: inv.quantity * (inv.product?.price || 0),
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

        const sumConds: any[] = [];
        if (invScope2) sumConds.push(invScope2);
        if (!filter) sumConds.push(eq(inventory.branchId, branchId));
        const allInventory = await dbRead.query.inventory.findMany({
            where: sumConds.length > 0 ? and(...sumConds) : undefined,
            with: { product: { columns: { cost: true, price: true } } },
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
        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;

        const start = startDate ? new Date(String(startDate)) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = endDate ? new Date(String(endDate)) : new Date();
        end.setHours(23, 59, 59, 999);

        const pmConds: any[] = [eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'), gte(transactions.createdAt, start), lte(transactions.createdAt, end)];
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) pmConds.push(eq(transactions.tenantId, tenantId));
        const pmScope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (pmScope) pmConds.push(pmScope);
        if (!filter) pmConds.push(eq(transactions.branchId, branchId));

        const pmTxIds = await dbRead.query.transactions.findMany({ where: and(...pmConds), columns: { id: true } });
        const pmTransactionIds = pmTxIds.map(t => t.id);

        const payments = pmTransactionIds.length > 0
            ? await dbRead.select({
                methodName: transactionPayments.methodName,
                total: sum(transactionPayments.amount),
                cnt: count(),
            }).from(transactionPayments)
                .where(inArray(transactionPayments.transactionId, pmTransactionIds))
                .groupBy(transactionPayments.methodName)
            : [];

        res.json({
            success: true,
            data: payments.map(p => ({
                method: p.methodName,
                total: Number(p.total) || 0,
                count: p.cnt || 0,
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
        const filter = req.branchFilter;
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

        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;

        // Build scope conditions
        const custBaseConds: any[] = [eq(customers.isActive, true)];
        if (tenantId && !req.authUser?.isSuperAdmin) custBaseConds.push(eq(customers.tenantId, tenantId));
        const crScope = buildScopeCondition(filter, { storeId: customers.storeId }, 'storeId');
        if (crScope) custBaseConds.push(crScope);

        const txBaseConds: any[] = [eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE')];
        if (tenantId && !req.authUser?.isSuperAdmin) txBaseConds.push(eq(transactions.tenantId, tenantId));
        const trScope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (trScope) txBaseConds.push(trScope);
        if (!filter) txBaseConds.push(eq(transactions.branchId, branchId));

        const custSearchConds = [...custBaseConds];
        if (search) {
            const s = String(search);
            custSearchConds.push(or(ilike(customers.name, `%${s}%`), ilike(customers.phone, `%${s}%`)));
        }

        const [
            [{ value: totalCustomers }],
            [{ value: newCustomers }],
            [{ value: prevNewCustomers }],
            activeCustomersData,
            [revenueData],
            topCustomers,
            [{ value: topCustomersTotal }],
        ] = await Promise.all([
            dbRead.select({ value: count() }).from(customers).where(and(...custBaseConds)),
            dbRead.select({ value: count() }).from(customers).where(and(...custBaseConds, gte(customers.createdAt, startDate), lte(customers.createdAt, endDate))),
            dbRead.select({ value: count() }).from(customers).where(and(...custBaseConds, gte(customers.createdAt, prevStartDate), lte(customers.createdAt, prevEndDate))),
            dbRead.select({ customerId: transactions.customerId }).from(transactions)
                .where(and(...txBaseConds, gte(transactions.createdAt, startDate), lte(transactions.createdAt, endDate), isNotNull(transactions.customerId)))
                .groupBy(transactions.customerId),
            dbRead.select({ total: sum(transactions.total), cnt: count() }).from(transactions)
                .where(and(...txBaseConds, gte(transactions.createdAt, startDate), lte(transactions.createdAt, endDate))),
            dbRead.query.customers.findMany({
                where: and(...custSearchConds),
                columns: { id: true, name: true, phone: true, email: true, totalSpent: true, visitCount: true, lastVisitAt: true, memberCode: true },
                orderBy: desc(customers.totalSpent),
                offset: skip,
                limit: limitNum,
            }),
            dbRead.select({ value: count() }).from(customers).where(and(...custSearchConds)),
        ]);

        const activeCustomers = activeCustomersData.length;
        const totalRevenue = Number(revenueData.total) || 0;
        const totalOrders = revenueData.cnt || 0;
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
        const filter = req.branchFilter;
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

        const prConds: any[] = [eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'), gte(transactions.createdAt, start)];
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) prConds.push(eq(transactions.tenantId, tenantId));
        const prScope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (prScope) prConds.push(prScope);
        if (!filter) prConds.push(eq(transactions.branchId, branchId));

        const prTxIds = await dbRead.query.transactions.findMany({ where: and(...prConds), columns: { id: true } });
        const prTransactionIds = prTxIds.map(t => t.id);

        if (prTransactionIds.length === 0) {
            return res.json({ success: true, data: [], pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 } });
        }

        const itemConds: any[] = [inArray(transactionItems.transactionId, prTransactionIds)];
        if (search) {
            const s = String(search);
            itemConds.push(or(ilike(transactionItems.productName, `%${s}%`), ilike(transactionItems.sku, `%${s}%`)));
        }
        const itemWhere = and(...itemConds);

        // Count unique products
        const allProds = await dbRead.select({ productId: transactionItems.productId }).from(transactionItems).where(itemWhere).groupBy(transactionItems.productId);
        const total = allProds.length;

        const items = await dbRead.select({
            productId: transactionItems.productId,
            productName: transactionItems.productName,
            sku: transactionItems.sku,
            totalSales: sum(transactionItems.quantity),
            revenue: sum(transactionItems.total),
        }).from(transactionItems)
            .where(itemWhere)
            .groupBy(transactionItems.productId, transactionItems.productName, transactionItems.sku)
            .orderBy(desc(sum(transactionItems.total)))
            .offset(skip)
            .limit(limitNum);

        res.json({
            success: true,
            data: items.map((item) => ({
                productId: item.productId,
                name: item.productName,
                sku: item.sku,
                totalSales: Number(item.totalSales) || 0,
                revenue: Number(item.revenue) || 0,
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
        const filter = req.branchFilter;
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

        const finConds: any[] = [eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'), gte(transactions.createdAt, start)];
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) finConds.push(eq(transactions.tenantId, tenantId));
        const finScope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (finScope) finConds.push(finScope);
        if (!filter) finConds.push(eq(transactions.branchId, branchId));

        const prevConds: any[] = [eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'), gte(transactions.createdAt, previousStart), lt(transactions.createdAt, previousEnd)];
        if (tenantId && !req.authUser?.isSuperAdmin) prevConds.push(eq(transactions.tenantId, tenantId));
        if (finScope) prevConds.push(finScope);
        if (!filter) prevConds.push(eq(transactions.branchId, branchId));

        const [[currentSales], [previousSales]] = await Promise.all([
            dbRead.select({ total: sum(transactions.total), tax: sum(transactions.taxAmount), discount: sum(transactions.discountAmount) }).from(transactions).where(and(...finConds)),
            dbRead.select({ total: sum(transactions.total) }).from(transactions).where(and(...prevConds)),
        ]);

        const finTxIds = await dbRead.query.transactions.findMany({ where: and(...finConds), columns: { id: true } });
        const transactionIds = finTxIds.map(t => t.id);

        let cogs = 0;
        let payments: { methodName: string | null; total: string | null; cnt: number }[] = [];
        if (transactionIds.length > 0) {
            const [cogsRow] = await dbRead.select({ cost: sum(transactionItems.cost) }).from(transactionItems).where(inArray(transactionItems.transactionId, transactionIds));
            cogs = Number(cogsRow.cost) || 0;

            payments = await dbRead.select({
                methodName: transactionPayments.methodName,
                total: sum(transactionPayments.amount),
                cnt: count(),
            }).from(transactionPayments)
                .where(inArray(transactionPayments.transactionId, transactionIds))
                .groupBy(transactionPayments.methodName);
        }

        const revenue = Number(currentSales.total) || 0;
        const expenses = cogs;
        const profit = revenue - expenses;

        const totalPaymentAmount = payments.reduce((s, p) => s + (Number(p.total) || 0), 0) || 1;
        const paymentMethods = payments.map(p => ({
            type: p.methodName?.toLowerCase() || 'cash',
            method: p.methodName?.toLowerCase() || 'cash',
            methodName: p.methodName || 'Cash',
            label: p.methodName || 'Cash',
            total: Number(p.total) || 0,
            count: p.cnt || 0,
            percentage: Math.round(((Number(p.total) || 0) / totalPaymentAmount) * 100 * 10) / 10,
        }));

        const dailyTransactions = await dbRead.query.transactions.findMany({
            where: and(...finConds),
            columns: { id: true, total: true, createdAt: true },
            with: { items: { columns: { cost: true, quantity: true } } },
            orderBy: asc(transactions.createdAt),
        });

        const dailyMap: Record<string, { revenue: number; expenses: number; transactions: number }> = {};
        for (const t of dailyTransactions) {
            const date = t.createdAt.toISOString().split('T')[0];
            if (!dailyMap[date]) dailyMap[date] = { revenue: 0, expenses: 0, transactions: 0 };
            dailyMap[date].revenue += t.total;
            dailyMap[date].expenses += (t.items || []).reduce((sum: number, item: any) => sum + ((item.cost || 0) * (item.quantity || 1)), 0);
            dailyMap[date].transactions += 1;
        }
        const dailyData = Object.entries(dailyMap).map(([date, d]) => ({
            date,
            revenue: d.revenue,
            expenses: d.expenses,
            transactions: d.transactions,
        }));

        res.json({
            success: true,
            data: {
                revenue,
                expenses,
                profit,
                profitMargin: revenue > 0 ? Math.round((profit / revenue) * 100 * 10) / 10 : 0,
                previousRevenue: Number(previousSales.total) || 0,
                previousExpenses: 0,
                cogs,
                taxCollected: Number(currentSales.tax) || 0,
                discountsGiven: Number(currentSales.discount) || 0,
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
        const filter = req.branchFilter;
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

        const stConds: any[] = [eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'), gte(transactions.createdAt, start)];
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) stConds.push(eq(transactions.tenantId, tenantId));
        const stScope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (stScope) stConds.push(stScope);
        if (!filter) stConds.push(eq(transactions.branchId, branchId));
        const stWhere = and(...stConds);

        // Get total unique users with sales
        const allSalesByUser = await dbRead.select({ userId: transactions.userId }).from(transactions).where(stWhere).groupBy(transactions.userId);
        const total = allSalesByUser.length;

        // Get sales grouped by user with pagination
        const salesByUser = await dbRead.select({
            userId: transactions.userId,
            totalSales: count(),
            revenue: sum(transactions.total),
        }).from(transactions)
            .where(stWhere)
            .groupBy(transactions.userId)
            .orderBy(desc(sum(transactions.total)))
            .offset(skip)
            .limit(limitNum);

        // Get user details
        const userIds = salesByUser.map(s => s.userId);
        const authUser = req.authUser;
        const isSuper = authUser?.isSuperAdmin;
        const userRows = userIds.length > 0
            ? await dbRead.query.users.findMany({
                where: inArray(users.id, userIds),
                columns: { id: true, name: true, email: true },
            }) : [];

        const userMap = new Map(userRows.map(u => [u.id, u]));

        let data = salesByUser.map((s, index) => {
            const user = userMap.get(s.userId);
            const rev = Number(s.revenue) || 0;
            const cnt = s.totalSales || 0;
            return {
                rank: skip + index + 1,
                userId: s.userId,
                name: user?.name || 'Unknown',
                email: user?.email || '',
                totalSales: cnt,
                revenue: rev,
                avgOrderValue: cnt > 0 ? rev / cnt : 0,
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
