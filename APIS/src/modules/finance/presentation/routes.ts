// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════
// Finance / GL / Compliance Module
// Endpoints:
//   GET /finance/pl               — P&L by branch / date range
//   GET /finance/tax-summary      — Tax/VAT compliance summary
//   GET /finance/audit-trail      — Activity log viewer (compliance)
//   GET /finance/cash-flow        — Cash in/out summary
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, buildScopeCondition } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import {
    transactions, transactionItems, transactionPayments,
    activityLogs, users, branches, stores,
    stockMovements, cashMovements, shifts, settlements,
} from '@/db/schema/tables';
import { eq, and, or, gte, lte, desc, asc, count, sum, sql, inArray, ilike, isNotNull } from 'drizzle-orm';

export const financeRoutes = Router();

// ─── Helper: parse date range from query ─────────────────────────────────────
function parseDateRange(from: any, to: any) {
    const start = from ? new Date(String(from)) : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
    const end = to ? new Date(String(to)) : new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /finance/pl  — Profit & Loss by branch
// ─────────────────────────────────────────────────────────────────────────────
financeRoutes.get('/pl', authenticate, withTenantTx(), authorize('reports:financial'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const filter = req.branchFilter;
        const tenantId = req.authUser?.tenantId;
        const isSuperAdmin = req.authUser?.isSuperAdmin;
        const { from, to, branchId: qBranchId, groupBy = 'branch' } = req.query;
        const { start, end } = parseDateRange(from, to);

        // Build tenant + date scope
        const baseConds: any[] = [
            eq(transactions.status, 'COMPLETED'),
            eq(transactions.type, 'SALE'),
            gte(transactions.createdAt, start),
            lte(transactions.createdAt, end),
        ];
        if (tenantId && !isSuperAdmin) baseConds.push(eq(transactions.tenantId, tenantId));

        // Branch scope — validate the requested branch is within the caller's
        // scope using path-aware rules (tenant-admin: any branch in tenant;
        // HQ admin/manager: own branch + descendants via branch_path; branch
        // user: own branch). This matches what the branches dropdown offers, so
        // HQ users can drill into child branches instead of getting a 403.
        let effectiveBranchId: string | null = null;
        if (qBranchId && !isSuperAdmin) {
            const reqBranch = await dbRead.query.branches.findFirst({
                where: eq(branches.id, String(qBranchId)),
                columns: { id: true, tenantId: true, branchPath: true },
            });
            const u = req.authUser!;
            const sameTenant = !tenantId || reqBranch?.tenantId === tenantId;
            let allowed = false;
            if (reqBranch && sameTenant) {
                const path = reqBranch.branchPath || '';
                if (u.roleLevel <= 2) {
                    // tenant admin — any branch within the (already-checked) tenant
                    allowed = true;
                } else if (u.roleLevel <= 4) {
                    // HQ admin/manager — own branch + descendants via materialized path
                    allowed = (u.accessibleBranchPaths || []).some(p => path === p || path.startsWith(p + '.'));
                } else {
                    // branch user — exact branch membership (branchPath is code-based,
                    // so match by id, not by path-includes-uuid)
                    allowed = (u.accessibleBranchIds || []).includes(reqBranch.id);
                }
            }
            if (!allowed) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
            }
            effectiveBranchId = String(qBranchId);
        }
        if (effectiveBranchId) {
            baseConds.push(eq(transactions.branchId, effectiveBranchId));
        } else {
            const scopeCond = buildScopeCondition(filter, { branchId: transactions.branchId }, 'branchId');
            if (scopeCond) baseConds.push(scopeCond);
        }

        // Revenue: sum of completed sales
        const revenueRows = await dbRead
            .select({
                branchId: transactions.branchId,
                revenue: sum(transactions.total),
                discount: sum(transactions.discountAmount),
                tax: sum(transactions.taxAmount),
                txCount: count(),
            })
            .from(transactions)
            .where(and(...baseConds))
            .groupBy(transactions.branchId);

        // COGS: sum of (cost * qty) from transaction items in the same period
        const cogsConds: any[] = [
            gte(transactions.createdAt, start),
            lte(transactions.createdAt, end),
            eq(transactions.status, 'COMPLETED'),
        ];
        if (tenantId && !isSuperAdmin) cogsConds.push(eq(transactions.tenantId, tenantId));
        if (effectiveBranchId) cogsConds.push(eq(transactions.branchId, effectiveBranchId));

        const cogsRows = await dbRead
            .select({
                branchId: transactions.branchId,
                cogs: sum(sql`${transactionItems.cost} * ${transactionItems.quantity}`),
            })
            .from(transactionItems)
            .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
            .where(and(...cogsConds))
            .groupBy(transactions.branchId);

        const cogsMap = new Map(cogsRows.map((r: any) => [r.branchId, Number(r.cogs || 0)]));

        // Load branch names
        const branchIds = [...new Set(revenueRows.map((r: any) => r.branchId).filter(Boolean))];
        const branchRows = branchIds.length
            ? await dbRead.select({ id: branches.id, name: branches.name, code: branches.code }).from(branches).where(inArray(branches.id, branchIds as string[]))
            : [];
        const branchMap = new Map(branchRows.map(b => [b.id, b]));

        const plData = revenueRows.map((r: any) => {
            const revenue = Number(r.revenue || 0);
            const discount = Number(r.discount || 0);
            const tax = Number(r.tax || 0);
            const cogs = cogsMap.get(r.branchId) || 0;
            const netRevenue = revenue - discount;
            const grossProfit = netRevenue - cogs;
            const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
            const branch = branchMap.get(r.branchId);
            return {
                branchId: r.branchId,
                branchName: branch?.name || 'Unknown',
                branchCode: branch?.code || '',
                revenue,
                discount,
                netRevenue,
                tax,
                cogs,
                grossProfit,
                grossMargin: Math.round(grossMargin * 100) / 100,
                txCount: Number(r.txCount || 0),
            };
        });

        // Totals
        const totals = plData.reduce((acc, r) => ({
            revenue: acc.revenue + r.revenue,
            discount: acc.discount + r.discount,
            netRevenue: acc.netRevenue + r.netRevenue,
            tax: acc.tax + r.tax,
            cogs: acc.cogs + r.cogs,
            grossProfit: acc.grossProfit + r.grossProfit,
            txCount: acc.txCount + r.txCount,
        }), { revenue: 0, discount: 0, netRevenue: 0, tax: 0, cogs: 0, grossProfit: 0, txCount: 0 });

        res.json({
            success: true,
            data: plData,
            totals,
            meta: { from: start, to: end, rows: plData.length },
        });
    } catch (error) {
        next(error);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /finance/tax-summary  — VAT / Tax compliance summary
// ─────────────────────────────────────────────────────────────────────────────
financeRoutes.get('/tax-summary', authenticate, withTenantTx(), authorize('reports:financial'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const filter = req.branchFilter;
        const tenantId = req.authUser?.tenantId;
        const isSuperAdmin = req.authUser?.isSuperAdmin;
        const { from, to, period = 'monthly' } = req.query;
        const { start, end } = parseDateRange(from, to);

        const conds: any[] = [
            eq(transactions.status, 'COMPLETED'),
            eq(transactions.type, 'SALE'),
            gte(transactions.createdAt, start),
            lte(transactions.createdAt, end),
        ];
        if (tenantId && !isSuperAdmin) conds.push(eq(transactions.tenantId, tenantId));
        const scopeCond = buildScopeCondition(filter, { branchId: transactions.branchId }, 'branchId');
        if (scopeCond) conds.push(scopeCond);

        // Group by date period
        const dateTrunc = period === 'daily'
            ? sql`DATE_TRUNC('day', ${transactions.createdAt})`
            : period === 'weekly'
                ? sql`DATE_TRUNC('week', ${transactions.createdAt})`
                : sql`DATE_TRUNC('month', ${transactions.createdAt})`;

        const rows = await dbRead
            .select({
                period: dateTrunc,
                branchId: transactions.branchId,
                grossSales: sum(transactions.total),
                discount: sum(transactions.discountAmount),
                taxAmount: sum(transactions.taxAmount),
                txCount: count(),
            })
            .from(transactions)
            .where(and(...conds))
            .groupBy(dateTrunc, transactions.branchId)
            .orderBy(asc(dateTrunc));

        // Load branch names
        const branchIds = [...new Set(rows.map((r: any) => r.branchId).filter(Boolean))];
        const branchRows = branchIds.length
            ? await dbRead.select({ id: branches.id, name: branches.name }).from(branches).where(inArray(branches.id, branchIds as string[]))
            : [];
        const branchMap = new Map(branchRows.map(b => [b.id, b.name]));

        const taxData = rows.map((r: any) => ({
            period: r.period,
            branchId: r.branchId,
            branchName: branchMap.get(r.branchId) || 'Unknown',
            grossSales: Number(r.grossSales || 0),
            discount: Number(r.discount || 0),
            netSales: Number(r.grossSales || 0) - Number(r.discount || 0),
            taxAmount: Number(r.taxAmount || 0),
            txCount: Number(r.txCount || 0),
        }));

        const totals = taxData.reduce((acc, r) => ({
            grossSales: acc.grossSales + r.grossSales,
            discount: acc.discount + r.discount,
            netSales: acc.netSales + r.netSales,
            taxAmount: acc.taxAmount + r.taxAmount,
            txCount: acc.txCount + r.txCount,
        }), { grossSales: 0, discount: 0, netSales: 0, taxAmount: 0, txCount: 0 });

        res.json({ success: true, data: taxData, totals, meta: { from: start, to: end, period } });
    } catch (error) {
        next(error);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /finance/audit-trail  — Compliance audit log
// ─────────────────────────────────────────────────────────────────────────────
financeRoutes.get('/audit-trail', authenticate, withTenantTx(), authorize('reports:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const tenantId = req.authUser?.tenantId;
        const isSuperAdmin = req.authUser?.isSuperAdmin;
        const { page = 1, limit = 50, action, entity, userId: qUserId, from, to, search } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const { start, end } = parseDateRange(from, to);

        const conds: any[] = [
            gte(activityLogs.createdAt, start),
            lte(activityLogs.createdAt, end),
        ];
        if (tenantId && !isSuperAdmin) conds.push(eq(activityLogs.tenantId, tenantId));
        if (action) conds.push(eq(activityLogs.action, String(action)));
        if (entity) conds.push(eq(activityLogs.entity, String(entity)));
        if (qUserId) conds.push(eq(activityLogs.userId, String(qUserId)));
        if (search) {
            conds.push(or(
                ilike(activityLogs.description, `%${search}%`),
                ilike(activityLogs.action, `%${search}%`),
            ));
        }

        const [logs, [{ total }]] = await Promise.all([
            dbRead.select({
                id: activityLogs.id,
                action: activityLogs.action,
                description: activityLogs.description,
                entity: activityLogs.entity,
                entityId: activityLogs.entityId,
                ip: activityLogs.ip,
                createdAt: activityLogs.createdAt,
                userId: activityLogs.userId,
                checksum: activityLogs.checksum,
                metadata: activityLogs.metadata,
                userName: users.name,
                userEmail: users.email,
                userRole: users.role,
            })
            .from(activityLogs)
            .leftJoin(users, eq(activityLogs.userId, users.id))
            .where(and(...conds))
            .orderBy(desc(activityLogs.createdAt))
            .limit(Number(limit))
            .offset(skip),

            dbRead.select({ total: count() }).from(activityLogs).where(and(...conds)),
        ]);

        // Distinct action types for filter dropdown
        const actionTypes = await dbRead
            .selectDistinct({ action: activityLogs.action })
            .from(activityLogs)
            .where(tenantId && !isSuperAdmin ? eq(activityLogs.tenantId, tenantId) : undefined)
            .orderBy(asc(activityLogs.action))
            .limit(100);

        res.json({
            success: true,
            data: logs,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
            filterOptions: { actions: actionTypes.map(r => r.action) },
        });
    } catch (error) {
        next(error);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /finance/cash-flow  — Cash in/out per shift summary
// ─────────────────────────────────────────────────────────────────────────────
financeRoutes.get('/cash-flow', authenticate, withTenantTx(), authorize('reports:financial'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const filter = req.branchFilter;
        const tenantId = req.authUser?.tenantId;
        const isSuperAdmin = req.authUser?.isSuperAdmin;
        const { from, to } = req.query;
        const { start, end } = parseDateRange(from, to);

        const conds: any[] = [
            gte(cashMovements.createdAt, start),
            lte(cashMovements.createdAt, end),
        ];
        // Cash movements don't have tenantId directly — scope via shift → branch
        const shiftConds: any[] = [];
        if (tenantId && !isSuperAdmin) shiftConds.push(eq(shifts.tenantId, tenantId));
        const scopeCond = buildScopeCondition(filter, { branchId: shifts.branchId }, 'branchId');
        if (scopeCond) shiftConds.push(scopeCond);

        const rows = await dbRead
            .select({
                branchId: shifts.branchId,
                type: cashMovements.type,
                total: sum(cashMovements.amount),
                cnt: count(),
            })
            .from(cashMovements)
            .innerJoin(shifts, eq(cashMovements.shiftId, shifts.id))
            .where(and(...conds, ...shiftConds))
            .groupBy(shifts.branchId, cashMovements.type);

        // Pivot by branch
        const pivotMap = new Map<string, any>();
        for (const r of rows) {
            const branchId = r.branchId || 'unknown';
            if (!pivotMap.has(branchId)) pivotMap.set(branchId, { branchId, cashIn: 0, cashOut: 0, netCash: 0 });
            const entry = pivotMap.get(branchId);
            const amt = Number(r.total || 0);
            if (String(r.type).toUpperCase() === 'IN') entry.cashIn += amt;
            else entry.cashOut += amt;
        }
        const branchIds = [...pivotMap.keys()].filter(id => id !== 'unknown');
        const branchRows = branchIds.length
            ? await dbRead.select({ id: branches.id, name: branches.name }).from(branches).where(inArray(branches.id, branchIds))
            : [];
        const branchNameMap = new Map(branchRows.map(b => [b.id, b.name]));

        const cashFlow = [...pivotMap.values()].map(r => ({
            ...r,
            netCash: r.cashIn - r.cashOut,
            branchName: branchNameMap.get(r.branchId) || 'Unknown',
        }));

        const totals = cashFlow.reduce((acc, r) => ({
            cashIn: acc.cashIn + r.cashIn,
            cashOut: acc.cashOut + r.cashOut,
            netCash: acc.netCash + r.netCash,
        }), { cashIn: 0, cashOut: 0, netCash: 0 });

        res.json({ success: true, data: cashFlow, totals, meta: { from: start, to: end } });
    } catch (error) {
        next(error);
    }
});
