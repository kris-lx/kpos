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
    expenses, payrollPeriods, payrollPayments,
} from '@/db/schema/tables';
import { eq, and, or, gte, lte, lt, desc, asc, count, sum, sql, inArray, ilike, isNotNull } from 'drizzle-orm';
import { financeLedgerRoutes } from './ledger-routes';

export const financeRoutes = Router();
financeRoutes.use('/', financeLedgerRoutes);

// ─── Helper: parse date range from query ─────────────────────────────────────
function parseDateRange(from: any, to: any) {
    const start = from ? new Date(String(from)) : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
    const end = to ? new Date(String(to)) : new Date();
    // The UI sends an inclusive YYYY-MM-DD end date. Convert it to a
    // half-open interval so milliseconds at the boundary cannot be missed or
    // counted twice by adjacent reports.
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(to))) {
        end.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() + 1);
    }
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
            lt(transactions.createdAt, end),
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

        // Revenue is based on the stored pre-tax subtotal. Discount includes
        // both explicit discount and loyalty redemption, so `total` is never
        // reused as revenue (it already includes tax and payment reductions).
        const revenueRows = await dbRead
            .select({
                branchId: transactions.branchId,
                grossSales: sum(transactions.subtotal),
                discount: sum(sql`${transactions.discountAmount} + ${transactions.pointsRedeemAmount}`),
                tax: sum(transactions.taxAmount),
                txCount: count(),
            })
            .from(transactions)
            .where(and(...baseConds))
            .groupBy(transactions.branchId);

        // COGS: sum of (cost * qty) from transaction items in the same period
        const cogsConds: any[] = [
            gte(transactions.createdAt, start),
            lt(transactions.createdAt, end),
            eq(transactions.status, 'COMPLETED'),
        ];
        if (tenantId && !isSuperAdmin) cogsConds.push(eq(transactions.tenantId, tenantId));
        if (effectiveBranchId) cogsConds.push(eq(transactions.branchId, effectiveBranchId));
        else {
            const scopeCond = buildScopeCondition(filter, { branchId: transactions.branchId }, 'branchId');
            if (scopeCond) cogsConds.push(scopeCond);
        }

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

        // Approved expenses are operating costs; COGS is derived from sold
        // items and must never be entered into this ledger a second time.
        const expenseConds: any[] = [
            gte(expenses.expenseDate, start), lt(expenses.expenseDate, end),
            inArray(expenses.status, ['APPROVED', 'PAID']),
        ];
        if (tenantId && !isSuperAdmin) expenseConds.push(eq(expenses.tenantId, tenantId));
        if (effectiveBranchId) expenseConds.push(eq(expenses.branchId, effectiveBranchId));
        else {
            const scopeCond = buildScopeCondition(filter, { branchId: expenses.branchId, storeId: expenses.storeId }, 'storeId');
            if (scopeCond) expenseConds.push(scopeCond);
        }
        const expenseRows = await dbRead.select({ branchId: expenses.branchId, total: sum(expenses.amount) })
            .from(expenses).where(and(...expenseConds)).groupBy(expenses.branchId);
        const expenseMap = new Map(expenseRows.map((r: any) => [r.branchId, Number(r.total || 0)]));

        // Payroll is an accrual expense once approved and is paid cash only
        // once the period reaches PAID. The same amount is therefore not read
        // again from a separate generic expense row.
        const payrollConds: any[] = [
            inArray(payrollPeriods.status, ['APPROVED', 'PARTIALLY_PAID', 'PAID', 'CLOSED']),
            gte(payrollPeriods.periodStart, start),
            lte(payrollPeriods.periodEnd, end),
        ];
        if (tenantId && !isSuperAdmin) payrollConds.push(eq(payrollPeriods.tenantId, tenantId));
        if (effectiveBranchId) payrollConds.push(eq(payrollPeriods.branchId, effectiveBranchId));
        else {
            const scopeCond = buildScopeCondition(filter, { branchId: payrollPeriods.branchId, storeId: payrollPeriods.storeId }, 'storeId');
            if (scopeCond) payrollConds.push(scopeCond);
        }
        const payrollRows = await dbRead.select({ branchId: payrollPeriods.branchId, total: sum(payrollPeriods.totalEmployerCost) })
            .from(payrollPeriods).where(and(...payrollConds)).groupBy(payrollPeriods.branchId);
        const payrollMap = new Map(payrollRows.map((r: any) => [r.branchId, Number(r.total || 0)]));

        // Load branch names
        const branchIds = [...new Set([
            ...revenueRows.map((r: any) => r.branchId),
            ...cogsRows.map((r: any) => r.branchId),
            ...expenseRows.map((r: any) => r.branchId),
            ...payrollRows.map((r: any) => r.branchId),
        ].filter(Boolean))];
        const branchRows = branchIds.length
            ? await dbRead.select({ id: branches.id, name: branches.name, code: branches.code }).from(branches).where(inArray(branches.id, branchIds as string[]))
            : [];
        const branchMap = new Map(branchRows.map(b => [b.id, b]));

        const branchSet = new Set(branchIds);
        const salesMap = new Map(revenueRows.map((r: any) => [r.branchId, r]));
        const plData = [...branchSet].map((branchId: any) => {
            const r = salesMap.get(branchId) || {};
            const revenue = Number(r.grossSales || 0);
            const discount = Number(r.discount || 0);
            const tax = Number(r.tax || 0);
            const cogs = cogsMap.get(branchId) || 0;
            const operatingExpenses = expenseMap.get(branchId) || 0;
            const payrollExpense = payrollMap.get(branchId) || 0;
            const netRevenue = revenue - discount;
            const grossProfit = netRevenue - cogs;
            const netProfit = grossProfit - operatingExpenses - payrollExpense;
            const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
            const branch = branchMap.get(branchId);
            return {
                branchId,
                branchName: branch?.name || 'Unknown',
                branchCode: branch?.code || '',
                revenue,
                grossSales: revenue,
                discount,
                netRevenue,
                tax,
                cogs,
                operatingExpenses,
                payrollExpense,
                grossProfit,
                netProfit,
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
            operatingExpenses: acc.operatingExpenses + r.operatingExpenses,
            payrollExpense: acc.payrollExpense + r.payrollExpense,
            grossProfit: acc.grossProfit + r.grossProfit,
            netProfit: acc.netProfit + r.netProfit,
            txCount: acc.txCount + r.txCount,
        }), { revenue: 0, discount: 0, netRevenue: 0, tax: 0, cogs: 0, operatingExpenses: 0, payrollExpense: 0, grossProfit: 0, netProfit: 0, txCount: 0 });

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
            lt(transactions.createdAt, end),
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
                grossSales: sum(transactions.subtotal),
                discount: sum(sql`${transactions.discountAmount} + ${transactions.pointsRedeemAmount}`),
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
            lt(activityLogs.createdAt, end),
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
            lt(cashMovements.createdAt, end),
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

        // Normalize legacy shift movement names in one place. The previous
        // implementation only recognized the literal string "IN", so SALE,
        // CASH_IN and DEPOSIT were incorrectly reported as cash-out.
        const pivotMap = new Map<string, any>();
        const ensureBranch = (branchId: string) => {
            if (!pivotMap.has(branchId)) pivotMap.set(branchId, { branchId, cashIn: 0, cashOut: 0, netCash: 0 });
            return pivotMap.get(branchId);
        };
        const cashInTypes = new Set(['CASH_IN', 'SALE', 'DEPOSIT', 'FLOAT', 'IN']);
        for (const r of rows) {
            const branchId = r.branchId || 'unknown';
            const entry = ensureBranch(branchId);
            const amt = Number(r.total || 0);
            if (cashInTypes.has(String(r.type).toUpperCase())) entry.cashIn += amt;
            else entry.cashOut += amt;
        }

        // Expense and payroll payments may not belong to an open register,
        // therefore they are read directly from their ledgers instead of
        // being forced into cash_movements with a fake shift id.
        const expenseConds: any[] = [gte(expenses.paidAt, start), lt(expenses.paidAt, end), eq(expenses.status, 'PAID')];
        if (tenantId && !isSuperAdmin) expenseConds.push(eq(expenses.tenantId, tenantId));
        const expenseScope = buildScopeCondition(filter, { branchId: expenses.branchId, storeId: expenses.storeId }, 'storeId');
        if (expenseScope) expenseConds.push(expenseScope);
        const paidExpenseRows = await dbRead.select({ branchId: expenses.branchId, total: sum(expenses.amount) })
            .from(expenses).where(and(...expenseConds)).groupBy(expenses.branchId);
        for (const row of paidExpenseRows) ensureBranch(row.branchId).cashOut += Number(row.total || 0);

        const payrollConds: any[] = [gte(payrollPayments.paidAt, start), lt(payrollPayments.paidAt, end)];
        if (tenantId && !isSuperAdmin) payrollConds.push(eq(payrollPayments.tenantId, tenantId));
        const payrollScope = buildScopeCondition(filter, { branchId: payrollPeriods.branchId, storeId: payrollPeriods.storeId }, 'storeId');
        if (payrollScope) payrollConds.push(payrollScope);
        const paidPayrollRows = await dbRead.select({ branchId: payrollPeriods.branchId, total: sum(payrollPayments.amount) })
            .from(payrollPayments).innerJoin(payrollPeriods, eq(payrollPayments.periodId, payrollPeriods.id))
            .where(and(...payrollConds)).groupBy(payrollPeriods.branchId);
        for (const row of paidPayrollRows) if (row.branchId) ensureBranch(row.branchId).cashOut += Number(row.total || 0);

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
