// ═══════════════════════════════════════════════════════════════════════════
// Reports Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, buildScopeCondition, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { transactions, transactionItems, transactionPayments, products, customers, inventory, users, promotions, coupons, pointsHistory, members, membershipTiers, branches, shifts } from '@/db/schema/tables';
import { eq, and, or, not, ilike, inArray, isNotNull, gte, lte, lt, desc, asc, count, sum, sql } from 'drizzle-orm';
import { computeDerivedFields, sortByTotalSales, summarise } from '../domain/branch-compare.js';

export const reportRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/summary', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
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
        if (!filter && branchId)txConds.push(eq(transactions.branchId, branchId));

        const [todaySales] = await dbRead.select({ total: sum(transactions.total), cnt: count() }).from(transactions).where(and(...txConds));

        // Total products
        const prodConds: any[] = [eq(products.isActive, true)];
        if (tenantId && !req.authUser?.isSuperAdmin) prodConds.push(eq(products.tenantId, tenantId));
        const prodScope = buildScopeCondition(filter, { branchId: products.branchId }, 'branchId');
        if (prodScope) prodConds.push(prodScope);
        if (!filter && branchId)prodConds.push(eq(products.branchId, branchId));
        const [{ value: totalProducts }] = await dbRead.select({ value: count() }).from(products).where(and(...prodConds));

        // Total customers
        const custConds: any[] = [eq(customers.isActive, true)];
        if (tenantId && !req.authUser?.isSuperAdmin) custConds.push(eq(customers.tenantId, tenantId));
        const custScope = buildScopeCondition(filter, { storeId: customers.storeId }, 'storeId');
        if (custScope) custConds.push(custScope);
        const [{ value: totalCustomers }] = await dbRead.select({ value: count() }).from(customers).where(and(...custConds));

        // Low stock
        const invConds: any[] = [lte(inventory.quantity, 10)];
        // Was missing the tenant filter every sibling query in this handler
        // has (transactions/products/customers all add this) — inventory
        // rows with tenant_id NULL (see inventory/presentation/routes.ts
        // transfer/PO-receive fixes) were RLS-visible as "globally shared,"
        // so this leaked other tenants' orphaned rows into this count, and
        // for tenant-admin/HQ users (no branch scope) this query previously
        // ran with the tenant boundary enforced by RLS alone.
        if (tenantId && !req.authUser?.isSuperAdmin) invConds.push(eq(inventory.tenantId, tenantId));
        const invScope = buildScopeCondition(filter, { branchId: inventory.branchId }, 'branchId');
        if (invScope) invConds.push(invScope);
        if (!filter && branchId)invConds.push(eq(inventory.branchId, branchId));
        const [{ value: lowStock }] = await dbRead.select({ value: count() }).from(inventory).where(and(...invConds));

        // Recent sales
        const recentConds: any[] = [eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE')];
        if (tenantId && !req.authUser?.isSuperAdmin) recentConds.push(eq(transactions.tenantId, tenantId));
        if (scopeCond) recentConds.push(scopeCond);
        if (!filter && branchId)recentConds.push(eq(transactions.branchId, branchId));
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
reportRoutes.get('/sales', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
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
        if (!filter && branchId)salesConds.push(eq(transactions.branchId, branchId));

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
reportRoutes.get('/top-products', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
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
        if (!filter && branchId)tpConds.push(eq(transactions.branchId, branchId));

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
reportRoutes.get('/inventory', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { lowStockOnly, page = '1', limit = '20', search, stockFilter } = req.query;
        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user!.branchId;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const invConds2: any[] = [];
        // Was missing the tenant filter entirely — for tenant-admin/HQ-level
        // users (roleLevel <= 2, branchFilter() intentionally returns no
        // branch scope for them) this query could run with zero WHERE
        // conditions, returning every tenant's inventory rows.
        const invTenantId = req.authUser?.tenantId;
        if (invTenantId && !req.authUser?.isSuperAdmin) invConds2.push(eq(inventory.tenantId, invTenantId));
        const invScope2 = buildScopeCondition(filter, { branchId: inventory.branchId }, 'branchId');
        if (invScope2) invConds2.push(invScope2);
        if (!filter && branchId)invConds2.push(eq(inventory.branchId, branchId));
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
        if (!filter && branchId)sumConds.push(eq(inventory.branchId, branchId));
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
reportRoutes.get('/payments', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
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
        if (!filter && branchId)pmConds.push(eq(transactions.branchId, branchId));

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
reportRoutes.get('/customers', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { from, to, limit = 20, page = '1', search, branchId: qBranchId } = req.query;
        const filter = req.branchFilter;
        const requestedBranchId = qBranchId ? String(qBranchId) : undefined;
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
        if (requestedBranchId && filter?.branchIds?.includes(requestedBranchId)) {
            custBaseConds.push(eq(customers.branchId, requestedBranchId));
        } else {
            const crScope = buildScopeCondition(filter, { storeId: customers.storeId }, 'storeId');
            if (crScope) custBaseConds.push(crScope);
        }

        const txBaseConds: any[] = [eq(transactions.status, 'COMPLETED'), eq(transactions.type, 'SALE')];
        if (tenantId && !req.authUser?.isSuperAdmin) txBaseConds.push(eq(transactions.tenantId, tenantId));
        if (requestedBranchId && filter?.branchIds?.includes(requestedBranchId)) {
            txBaseConds.push(eq(transactions.branchId, requestedBranchId));
        } else {
            const trScope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
            if (trScope) txBaseConds.push(trScope);
            if (!filter && branchId) txBaseConds.push(eq(transactions.branchId, branchId));
        }

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
reportRoutes.get('/products', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
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
        if (!filter && branchId)prConds.push(eq(transactions.branchId, branchId));

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
reportRoutes.get('/financial', authenticate, withTenantTx(), authorize('reports:financial'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
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
        if (!filter && branchId)finConds.push(eq(transactions.branchId, branchId));

        const prevConds: any[] = [eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'), gte(transactions.createdAt, previousStart), lt(transactions.createdAt, previousEnd)];
        if (tenantId && !req.authUser?.isSuperAdmin) prevConds.push(eq(transactions.tenantId, tenantId));
        if (finScope) prevConds.push(finScope);
        if (!filter && branchId)prevConds.push(eq(transactions.branchId, branchId));

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
reportRoutes.get('/staff', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { period = 'month', page = '1', limit = '20', search, branchId: qBranchId } = req.query;
        const filter = req.branchFilter;
        // If branchId query param provided and in accessible branches, use it as a drill-down filter
        const requestedBranchId = qBranchId ? String(qBranchId) : undefined;
        const effectiveBranchId = (requestedBranchId && filter?.branchIds?.includes(requestedBranchId))
            ? requestedBranchId
            : (filter?.branchIds?.[0] || req.user!.branchId);
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
        // Apply branchId filter: use explicit drill-down branchId if provided, else scope from filter
        if (requestedBranchId && filter?.branchIds?.includes(requestedBranchId)) {
            stConds.push(eq(transactions.branchId, requestedBranchId));
        } else {
            const stScope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
            if (stScope) stConds.push(stScope);
            if (!filter && effectiveBranchId) stConds.push(eq(transactions.branchId, effectiveBranchId));
        }
        const stWhere = and(...stConds);

        // Aggregate first, then apply staff-name search and pagination. Filtering
        // after SQL pagination produced incomplete pages and an incorrect total.
        const salesByUser = await dbRead.select({
            userId: transactions.userId,
            totalSales: count(),
            revenue: sum(transactions.total),
        }).from(transactions)
            .where(stWhere)
            .groupBy(transactions.userId)
            .orderBy(desc(sum(transactions.total)));

        // Get user details
        const userIds = salesByUser.map(s => s.userId);
        const authUser = req.authUser;
        const isSuper = authUser?.isSuperAdmin;
        const userRows = userIds.length > 0
            ? await dbRead.query.users.findMany({
                where: inArray(users.id, userIds),
                columns: { id: true, name: true, email: true, role: true },
            }) : [];

        const userMap = new Map(userRows.map(u => [u.id, u]));

        // Sum closed-shift hours per user within the same period
        const shiftsConds: any[] = [
            isNotNull(shifts.closedAt),
            gte(shifts.openedAt, start),
        ];
        if (tenantId && !isSuper) shiftsConds.push(eq(shifts.tenantId, tenantId));
        if (userIds.length > 0) shiftsConds.push(inArray(shifts.userId, userIds));
        if (requestedBranchId && filter?.branchIds?.includes(requestedBranchId)) {
            shiftsConds.push(eq(shifts.branchId, requestedBranchId));
        }

        const shiftHoursRows = userIds.length > 0
            ? await dbRead.select({
                userId: shifts.userId,
                hoursWorked: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${shifts.closedAt} - ${shifts.openedAt})) / 3600), 0)`,
            }).from(shifts)
                .where(and(...shiftsConds))
                .groupBy(shifts.userId)
            : [];

        const hoursMap = new Map(shiftHoursRows.map(r => [r.userId, Number(r.hoursWorked) || 0]));

        let allData = salesByUser.map((s) => {
            const user = userMap.get(s.userId);
            const rev = Number(s.revenue) || 0;
            const cnt = s.totalSales || 0;
            const hrs = hoursMap.get(s.userId) ?? 0;
            return {
                userId: s.userId,
                name: user?.name || 'Unknown',
                email: user?.email || '',
                role: user?.role || '',
                totalSales: cnt,
                revenue: rev,
                avgOrderValue: cnt > 0 ? rev / cnt : 0,
                hoursWorked: Math.round(hrs * 100) / 100,
                revenuePerHour: hrs > 0 ? Math.round(rev / hrs) : 0,
            };
        });

        // Apply search filter
        if (search) {
            const searchLower = String(search).toLowerCase();
            allData = allData.filter(d =>
                d.name?.toLowerCase().includes(searchLower) ||
                d.email?.toLowerCase().includes(searchLower) ||
                d.role?.toLowerCase().includes(searchLower)
            );
        }

        const total = allData.length;
        const summary = {
            totalSales: allData.reduce((sum, row) => sum + row.totalSales, 0),
            totalRevenue: allData.reduce((sum, row) => sum + row.revenue, 0),
            totalHours: allData.reduce((sum, row) => sum + row.hoursWorked, 0),
            topPerformer: allData[0] || null,
        };
        const data = allData.slice(skip, skip + limitNum).map((row, index) => ({
            ...row,
            rank: skip + index + 1,
        }));

        res.json({
            success: true,
            data,
            summary,
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
// R-01  PERIOD COMPARE
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/period-compare', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { from1, to1, from2, to2, branchId: qBranchId } = req.query;
        const filter = req.branchFilter;
        const tenantId = req.authUser?.tenantId;
        const isSuperAdmin = req.authUser?.isSuperAdmin;
        const now = new Date();
        const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMoStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMoEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        lastMoEnd.setHours(23, 59, 59, 999);
        const p1Start = from1 ? new Date(String(from1)) : mtdStart;
        const p1End = to1 ? new Date(String(to1)) : new Date(now); p1End.setHours(23, 59, 59, 999);
        const p2Start = from2 ? new Date(String(from2)) : lastMoStart;
        const p2End = to2 ? new Date(String(to2)) : new Date(lastMoEnd);
        const baseConds = (from: Date, to: Date) => {
            const c: any[] = [eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'), gte(transactions.createdAt, from), lte(transactions.createdAt, to)];
            if (tenantId && !isSuperAdmin) c.push(eq(transactions.tenantId, tenantId));
            const scope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
            if (scope) c.push(scope);
            if (qBranchId) c.push(eq(transactions.branchId, String(qBranchId)));
            return c;
        };
        const [[p1], [p2]] = await Promise.all([
            dbRead.select({ total: sum(transactions.total), cnt: count(), tax: sum(transactions.taxAmount), discount: sum(transactions.discountAmount) }).from(transactions).where(and(...baseConds(p1Start, p1End))),
            dbRead.select({ total: sum(transactions.total), cnt: count(), tax: sum(transactions.taxAmount), discount: sum(transactions.discountAmount) }).from(transactions).where(and(...baseConds(p2Start, p2End))),
        ]);
        const p1Sales = Number(p1.total) || 0; const p2Sales = Number(p2.total) || 0;
        const p1Orders = Number(p1.cnt) || 0; const p2Orders = Number(p2.cnt) || 0;
        const p1Avg = p1Orders > 0 ? Math.round(p1Sales / p1Orders) : 0;
        const p2Avg = p2Orders > 0 ? Math.round(p2Sales / p2Orders) : 0;
        res.json({ success: true, data: {
            period1: { from: p1Start, to: p1End, sales: p1Sales, orders: p1Orders, avgOrder: p1Avg, tax: Number(p1.tax) || 0, discount: Number(p1.discount) || 0 },
            period2: { from: p2Start, to: p2End, sales: p2Sales, orders: p2Orders, avgOrder: p2Avg, tax: Number(p2.tax) || 0, discount: Number(p2.discount) || 0 },
            diff: { salesChangePct: p2Sales > 0 ? Math.round(((p1Sales - p2Sales) / p2Sales) * 1000) / 10 : p1Sales > 0 ? 100 : 0, ordersChangePct: p2Orders > 0 ? Math.round(((p1Orders - p2Orders) / p2Orders) * 1000) / 10 : p1Orders > 0 ? 100 : 0, avgOrderChangePct: p2Avg > 0 ? Math.round(((p1Avg - p2Avg) / p2Avg) * 1000) / 10 : 0 },
        }});
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════════════════
// R-03  STAFF PERFORMANCE (enhanced: voidCount + discountTotal)
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/staff-performance', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { from, to, branchId: qBranchId, limit: qLimit = '20' } = req.query;
        const filter = req.branchFilter;
        const tenantId = req.authUser?.tenantId;
        const isSuperAdmin = req.authUser?.isSuperAdmin;
        const now = new Date();
        const start = from ? new Date(String(from)) : new Date(now.getFullYear(), now.getMonth(), 1);
        const end = to ? new Date(String(to)) : new Date(now); end.setHours(23, 59, 59, 999);
        const addScope = (c: any[]) => {
            if (tenantId && !isSuperAdmin) c.push(eq(transactions.tenantId, tenantId));
            const scope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
            if (scope) c.push(scope);
            if (qBranchId) c.push(eq(transactions.branchId, String(qBranchId)));
            return c;
        };
        const [salesRows, voidRows] = await Promise.all([
            dbRead.select({ userId: transactions.userId, orderCount: count(), totalSales: sum(transactions.total), discountTotal: sum(transactions.discountAmount) }).from(transactions)
                .where(and(...addScope([eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'), gte(transactions.createdAt, start), lte(transactions.createdAt, end)])))
                .groupBy(transactions.userId).orderBy(desc(sum(transactions.total))).limit(Number(qLimit)),
            dbRead.select({ userId: transactions.userId, voidCount: count() }).from(transactions)
                .where(and(...addScope([eq(transactions.status, 'VOIDED'), gte(transactions.createdAt, start), lte(transactions.createdAt, end)])))
                .groupBy(transactions.userId),
        ]);
        const voidMap = new Map(voidRows.map(r => [r.userId, Number(r.voidCount) || 0]));
        const userIds = salesRows.map(r => r.userId);
        const userRows = userIds.length > 0 ? await dbRead.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds)) : [];
        const userMap = new Map(userRows.map(u => [u.id, u]));
        res.json({ success: true, data: salesRows.map((r, idx) => {
            const user = userMap.get(r.userId); const rev = Number(r.totalSales) || 0; const cnt = Number(r.orderCount) || 0;
            return { rank: idx + 1, userId: r.userId, name: user?.name || 'Unknown', email: user?.email || '', orderCount: cnt, totalSales: rev, avgOrder: cnt > 0 ? Math.round(rev / cnt) : 0, discountTotal: Number(r.discountTotal) || 0, voidCount: voidMap.get(r.userId) || 0 };
        }), period: { from: start, to: end } });
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════════════════
// R-04  BEST-SELLING PRODUCTS (with cost + gross profit)
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/products/best-selling', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { from, to, limit: qLimit = '20', branchId: qBranchId } = req.query;
        const filter = req.branchFilter;
        const tenantId = req.authUser?.tenantId;
        const isSuperAdmin = req.authUser?.isSuperAdmin;
        const now = new Date();
        const start = from ? new Date(String(from)) : new Date(now.getFullYear(), now.getMonth(), 1);
        const end = to ? new Date(String(to)) : new Date(now); end.setHours(23, 59, 59, 999);
        const txConds: any[] = [eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'), gte(transactions.createdAt, start), lte(transactions.createdAt, end)];
        if (tenantId && !isSuperAdmin) txConds.push(eq(transactions.tenantId, tenantId));
        const scope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (scope) txConds.push(scope);
        if (qBranchId) txConds.push(eq(transactions.branchId, String(qBranchId)));
        const rows = await dbRead.select({
            productId: transactionItems.productId, productName: transactionItems.productName, sku: transactionItems.sku,
            qtySold: sum(transactionItems.quantity), revenue: sum(transactionItems.total),
            costTotal: sql<number>`sum(${transactionItems.cost} * ${transactionItems.quantity})`,
        }).from(transactionItems).innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
            .where(and(...txConds)).groupBy(transactionItems.productId, transactionItems.productName, transactionItems.sku)
            .orderBy(desc(sum(transactionItems.total))).limit(Number(qLimit));
        res.json({ success: true, data: rows.map((r, i) => {
            const rev = Number(r.revenue) || 0; const cost = Number(r.costTotal) || 0;
            return { rank: i + 1, productId: r.productId, name: r.productName, sku: r.sku || '', qtySold: Number(r.qtySold) || 0, revenue: rev, costTotal: cost, grossProfit: rev - cost, grossMarginPct: rev > 0 ? Math.round(((rev - cost) / rev) * 1000) / 10 : 0 };
        }), period: { from: start, to: end } });
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════════════════
// R-05  PROMOTIONS PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/promotions', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 10));
        const offset = (page - 1) * limit;
        const filter = req.branchFilter;
        const tenantId = req.authUser?.tenantId;
        const isSuperAdmin = req.authUser?.isSuperAdmin;
        const promoConds: any[] = [];
        const couponConds: any[] = [];
        if (tenantId && !isSuperAdmin) { promoConds.push(eq(promotions.tenantId, tenantId)); couponConds.push(eq(coupons.tenantId, tenantId)); }
        const promoScope = buildScopeCondition(filter, { storeId: promotions.storeId }, 'storeId');
        if (promoScope) promoConds.push(promoScope);
        const couponScope = buildScopeCondition(filter, { storeId: coupons.storeId }, 'storeId');
        if (couponScope) couponConds.push(couponScope);
        const [promoRows, couponRows, [{ value: promotionsTotal }], [{ value: couponsTotal }]] = await Promise.all([
            dbRead.query.promotions.findMany({ where: promoConds.length > 0 ? and(...promoConds) : undefined, orderBy: desc(promotions.usageCount), limit, offset }),
            dbRead.query.coupons.findMany({ where: couponConds.length > 0 ? and(...couponConds) : undefined, orderBy: desc(coupons.usageCount), limit, offset }),
            dbRead.select({ value: count() }).from(promotions).where(promoConds.length > 0 ? and(...promoConds) : undefined),
            dbRead.select({ value: count() }).from(coupons).where(couponConds.length > 0 ? and(...couponConds) : undefined),
        ]);
        res.json({ success: true, data: {
            promotions: promoRows.map(p => ({ id: p.id, name: p.name, type: p.type, value: p.value, isActive: p.isActive, startDate: p.startDate, endDate: p.endDate, usageCount: p.usageCount, usageLimit: p.usageLimit, usagePct: p.usageLimit ? Math.round((p.usageCount / p.usageLimit) * 1000) / 10 : null })),
            coupons: couponRows.map(c => ({ id: c.id, code: c.code, name: c.name, type: c.type, value: c.value, isActive: c.isActive, startDate: c.startDate, endDate: c.endDate, usageCount: c.usageCount, usageLimit: c.usageLimit, usagePct: c.usageLimit ? Math.round((c.usageCount / c.usageLimit) * 1000) / 10 : null })),
        }, pagination: { page, limit, promotionsTotal: Number(promotionsTotal) || 0, couponsTotal: Number(couponsTotal) || 0 } });
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════════════════
// R-06  LOYALTY STATS
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/loyalty', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { from, to } = req.query;
        const tenantId = req.authUser?.tenantId;
        const isSuperAdmin = req.authUser?.isSuperAdmin;
        const now = new Date();
        const start = from ? new Date(String(from)) : new Date(now.getFullYear(), now.getMonth(), 1);
        const end = to ? new Date(String(to)) : new Date(now); end.setHours(23, 59, 59, 999);
        const phConds: any[] = [gte(pointsHistory.createdAt, start), lte(pointsHistory.createdAt, end)];
        if (tenantId && !isSuperAdmin) phConds.push(eq(pointsHistory.tenantId, tenantId));
        const mbConds: any[] = [];
        if (tenantId && !isSuperAdmin) mbConds.push(eq(members.tenantId, tenantId));
        const [[earnStat], [redeemStat], [{ value: newMembers }], activeMemberRows, tierCounts] = await Promise.all([
            dbRead.select({ total: sum(pointsHistory.points) }).from(pointsHistory).where(and(...phConds, eq(pointsHistory.type, 'EARN'))),
            dbRead.select({ total: sum(pointsHistory.points) }).from(pointsHistory).where(and(...phConds, eq(pointsHistory.type, 'REDEEM'))),
            dbRead.select({ value: count() }).from(members).where(and(...mbConds, gte(members.createdAt, start), lte(members.createdAt, end))),
            dbRead.select({ customerId: pointsHistory.customerId }).from(pointsHistory).where(and(...phConds)).groupBy(pointsHistory.customerId),
            dbRead.select({ tierName: membershipTiers.name, memberCount: count() }).from(members)
                .leftJoin(membershipTiers, eq(members.tierId, membershipTiers.id))
                .where(mbConds.length > 0 ? and(...mbConds) : undefined).groupBy(membershipTiers.name),
        ]);
        const pointsIssued = Number(earnStat.total) || 0;
        const pointsRedeemed = Math.abs(Number(redeemStat.total) || 0);
        res.json({ success: true, data: { pointsIssued, pointsRedeemed, redemptionRate: pointsIssued > 0 ? Math.round((pointsRedeemed / pointsIssued) * 1000) / 10 : 0, newMembers, activeMembers: activeMemberRows.length, tierBreakdown: tierCounts.map(t => ({ tier: t.tierName || 'ບໍ່ມີລະດັບ', count: Number(t.memberCount) || 0 })) }, period: { from: start, to: end } });
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════════════════
// R-02  BRANCH COMPARE
// ═══════════════════════════════════════════════════════════════════════════
reportRoutes.get('/branch-compare', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { from, to } = req.query;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 10));
        const offset = (page - 1) * limit;
        const filter = req.branchFilter;
        const tenantId = req.authUser?.tenantId;
        const isSuperAdmin = req.authUser?.isSuperAdmin;

        const now = new Date();
        const start = from ? new Date(String(from)) : new Date(now.getFullYear(), now.getMonth(), 1);
        const end = to ? new Date(String(to)) : new Date(now); end.setHours(23, 59, 59, 999);

        // Resolve accessible branch IDs for this user
        const accessibleBranchIds = filter?.branchIds || [];
        const branchConds: any[] = [];
        if (tenantId && !isSuperAdmin) branchConds.push(eq(branches.tenantId, tenantId));
        if (!isSuperAdmin && accessibleBranchIds.length > 0) branchConds.push(inArray(branches.id, accessibleBranchIds));

        const branchRows = await dbRead.select({ id: branches.id, name: branches.name, code: branches.code })
            .from(branches)
            .where(branchConds.length > 0 ? and(...branchConds) : undefined)
            .orderBy(asc(branches.name));

        if (branchRows.length === 0) {
            return res.json({ success: true, data: [], period: { from: start, to: end }, pagination: { page, limit, total: 0 } });
        }

        const branchIds = branchRows.map(b => b.id);

        // Fetch sales per branch for the period
        const salesRows = await dbRead
            .select({
                branchId: transactions.branchId,
                totalSales: sum(transactions.total),
                orderCount: count(),
                discountTotal: sum(transactions.discountAmount),
                taxTotal: sum(transactions.taxAmount),
            })
            .from(transactions)
            .where(and(
                eq(transactions.type, 'SALE'),
                eq(transactions.status, 'COMPLETED'),
                gte(transactions.createdAt, start),
                lte(transactions.createdAt, end),
                inArray(transactions.branchId, branchIds),
                ...(tenantId && !isSuperAdmin ? [eq(transactions.tenantId, tenantId)] : []),
            ))
            .groupBy(transactions.branchId);

        // Fetch void count per branch
        const voidRows = await dbRead
            .select({ branchId: transactions.branchId, voidCount: count() })
            .from(transactions)
            .where(and(
                eq(transactions.status, 'VOIDED'),
                gte(transactions.createdAt, start),
                lte(transactions.createdAt, end),
                inArray(transactions.branchId, branchIds),
                ...(tenantId && !isSuperAdmin ? [eq(transactions.tenantId, tenantId)] : []),
            ))
            .groupBy(transactions.branchId);

        const salesMap = new Map(salesRows.map(r => [r.branchId, r]));
        const voidMap = new Map(voidRows.map(r => [r.branchId, Number(r.voidCount) || 0]));

        const rawData = branchRows.map(b => {
            const s = salesMap.get(b.id);
            return {
                branchId: b.id,
                branchName: b.name,
                branchCode: b.code,
                totalSales: Number(s?.totalSales) || 0,
                orderCount: Number(s?.orderCount) || 0,
                discountTotal: Number(s?.discountTotal) || 0,
                taxTotal: Number(s?.taxTotal) || 0,
                voidCount: voidMap.get(b.id) || 0,
            };
        });

        const allData = sortByTotalSales(rawData).map(computeDerivedFields);
        const data = allData.slice(offset, offset + limit);

        res.json({ success: true, data, period: { from: start, to: end }, pagination: { page, limit, total: allData.length } });
    } catch (error) { next(error); }
});
