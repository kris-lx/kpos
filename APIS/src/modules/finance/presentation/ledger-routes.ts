// Finance write-side APIs: expense ledger, compensation and payroll.
// Read-only P&L/cash-flow endpoints remain in routes.ts, while all mutable
// state transitions live here so maker/checker and audit rules are explicit.

import { Router } from 'express';
import { authenticate, authorize, branchFilter, buildScopeCondition } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { setRequestContext, setSuperAdminBypassContext } from '@/db/set-tenant-context';
import {
    expenses, employeeCompensation, payrollPeriods, payrollItems, payrollPayments,
    payrollTaxProfiles, payrollWorkPolicies, payrollAdjustments,
    users, userStores, branches, shifts, employeeWorkSchedules, attendanceRecords, transactions,
} from '@/db/schema/tables';
import { queueActivityLog } from '@/infrastructure/helpers/activity-log.helper';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, lt, or, sql } from 'drizzle-orm';
import { calculatePayroll, validateTaxBrackets } from '../domain/payroll-calculator';
import { calculatePayrollWork, validateWorkPolicy } from '../domain/payroll-work-calculator';
import { hasPayrollScopeAccess, payrollGrants, type PayrollScopeAccess } from '../domain/payroll-scope';

export const financeLedgerRoutes = Router();

type PayrollTransaction = Parameters<Parameters<typeof globalDb.transaction>[0]>[0];

/**
 * Payroll changes are financial writes and must be atomic. `req.tx` only
 * reserves an RLS-scoped connection; it intentionally is not a transaction.
 * Use a real pooled transaction and re-establish the caller's RLS context.
 */
async function scopedPayrollTransaction<T>(req: any, callback: (tx: PayrollTransaction) => Promise<T>): Promise<T> {
    return globalDb.transaction(async (tx) => {
        const { tenantId, isSuperAdmin, activeBranchPath, activeStorePath } = req.authUser ?? {};
        if (isSuperAdmin) {
            await setSuperAdminBypassContext(tx, { local: true });
        } else if (tenantId) {
            await setRequestContext(tx, {
                tenantId,
                branchPath: activeBranchPath,
                storePath: activeStorePath,
            }, { local: true });
        } else {
            throw new Error('Payroll transaction requires an authenticated tenant context');
        }
        return callback(tx);
    });
}

const expenseStatuses = new Set(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'VOID', 'PAID']);
const payTypes = new Set(['MONTHLY', 'DAILY', 'HOURLY', 'COMMISSION']);
const payrollAdditionTypes = new Set(['BONUS', 'COMMISSION', 'ALLOWANCE', 'REIMBURSEMENT']);
const payrollDeductionTypes = new Set(['DEDUCTION', 'UNPAID_LEAVE', 'LATE_DEDUCTION', 'ABSENCE_DEDUCTION']);
const payrollPaymentMethods = new Set(['BANK_TRANSFER', 'CASH', 'MOBILE', 'OTHER']);

function money(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function dateValue(value: unknown, fallback = new Date()): Date {
    const result = value ? new Date(String(value)) : fallback;
    return Number.isNaN(result.getTime()) ? fallback : result;
}

function dateRange(from: unknown, to: unknown): { start: Date; end: Date } {
    const start = dateValue(from, new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const end = to ? dateValue(to) : new Date();
    // UI sends YYYY-MM-DD. Treat the selected end date as inclusive while
    // queries use the safer half-open [start, end) interval.
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(to))) {
        end.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() + 1);
    }
    return { start, end };
}

function tenantScope(req: any, table: any, modelType: 'storeId' | 'branchId' = 'storeId'): any[] {
    const conditions: any[] = [];
    const tenantId = req.authUser?.tenantId;
    if (tenantId && !req.authUser?.isSuperAdmin && table.tenantId) conditions.push(eq(table.tenantId, tenantId));
    const scoped = buildScopeCondition(req.branchFilter, {
        tenantId: table.tenantId,
        branchId: table.branchId,
        storeId: table.storeId,
    }, modelType);
    if (scoped) conditions.push(scoped);
    return conditions;
}

async function branchContext(db: any, branchId: string): Promise<{ id: string; tenantId: string | null; storeId: string } | null> {
    const [row] = await db.select({ id: branches.id, tenantId: branches.tenantId, storeId: branches.storeId })
        .from(branches).where(eq(branches.id, branchId)).limit(1);
    return row || null;
}

function canUseBranch(req: any, branch: { id: string; storeId: string } | null): boolean {
    if (!branch) return false;
    if (req.authUser?.isSuperAdmin) return true;
    const filter = req.branchFilter;
    if (!filter) return false;
    return filter.branchIds.includes(branch.id) || (filter.scopeByStore && filter.storeIds.includes(branch.storeId));
}

/** Payroll is always assignment-scoped, even for a level-2 store owner. */
function canUsePayrollScope(
    req: any,
    scope: { storeId: string | null; branchId?: string | null; id?: string },
    access: PayrollScopeAccess = 'read',
): boolean {
    return hasPayrollScopeAccess(req.authUser, scope, access);
}

function payrollScopeConditions(req: any, table: any, access: PayrollScopeAccess = 'read'): any[] {
    const conditions: any[] = [];
    if (req.authUser?.isSuperAdmin) return conditions;
    const tenantId = req.authUser?.tenantId;
    if (tenantId && table.tenantId) conditions.push(eq(table.tenantId, tenantId));

    const grants = payrollGrants(req.authUser, access);
    const wholeStoreIds = [...new Set(grants.filter((grant: any) => !grant.branchId).map((grant: any) => grant.storeId))] as string[];
    const branchIds = [...new Set(grants.filter((grant: any) => grant.branchId).map((grant: any) => grant.branchId))] as string[];
    const scopeParts: any[] = [];
    if (wholeStoreIds.length && table.storeId) scopeParts.push(inArray(table.storeId, wholeStoreIds));
    if (branchIds.length && table.branchId) scopeParts.push(inArray(table.branchId, branchIds));
    conditions.push(scopeParts.length ? or(...scopeParts)! : sql`false`);
    return conditions;
}

async function resolveTaxProfile(db: any, period: any): Promise<any | null> {
    if (!period.tenantId) return null;
    const rows = await db.select().from(payrollTaxProfiles).where(and(
        eq(payrollTaxProfiles.tenantId, period.tenantId),
        eq(payrollTaxProfiles.status, 'ACTIVE'),
        lte(payrollTaxProfiles.effectiveFrom, period.periodEnd),
        or(isNull(payrollTaxProfiles.effectiveTo), gte(payrollTaxProfiles.effectiveTo, period.periodStart)),
        or(
            period.branchId ? eq(payrollTaxProfiles.branchId, period.branchId) : sql`false`,
            and(eq(payrollTaxProfiles.storeId, period.storeId), isNull(payrollTaxProfiles.branchId)),
            and(isNull(payrollTaxProfiles.storeId), isNull(payrollTaxProfiles.branchId)),
        ),
    ));
    const sorted = rows.sort((a: any, b: any) => {
        const specificity = (row: any) => row.branchId ? 3 : row.storeId ? 2 : 1;
        return specificity(b) - specificity(a)
            || new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
    });
    const selected = sorted[0];
    if (!selected) return null;
    const sameScopeVersions = sorted.filter((row: any) => row.branchId === selected.branchId && row.storeId === selected.storeId);
    return { ...selected, overlappingVersionCount: sameScopeVersions.length };
}

async function resolveWorkPolicy(db: any, period: any): Promise<any | null> {
    if (!period.tenantId || !period.branchId) return null;
    const rows = await db.select().from(payrollWorkPolicies).where(and(
        eq(payrollWorkPolicies.tenantId, period.tenantId),
        eq(payrollWorkPolicies.storeId, period.storeId),
        eq(payrollWorkPolicies.branchId, period.branchId),
        eq(payrollWorkPolicies.status, 'ACTIVE'),
        lte(payrollWorkPolicies.effectiveFrom, period.periodEnd),
        or(isNull(payrollWorkPolicies.effectiveTo), gte(payrollWorkPolicies.effectiveTo, period.periodStart)),
    ));
    const sorted = rows.sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
    return sorted[0] ? { ...sorted[0], overlappingVersionCount: sorted.length } : null;
}

function canCheck(req: any): boolean {
    return Boolean(req.authUser?.isSuperAdmin || req.authUser?.checkerEnabled);
}

async function audit(req: any, action: string, entity: string, entityId: string, details: string, oldData?: unknown, newData?: unknown) {
    const scoped = [newData, oldData].find((value: any) => value?.storeId || value?.branchId) as any;
    await queueActivityLog(
        req.authUser?.userId || req.user?.userId || '', action, entity, details,
        {
            branchId: scoped?.branchId || req.authUser?.activeBranchId,
            storeId: scoped?.storeId || req.authUser?.activeStoreId,
        }, req,
        { entity, entityId, oldData, newData },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Expense ledger
// ─────────────────────────────────────────────────────────────────────────────

financeLedgerRoutes.get('/expenses', authenticate, withTenantTx(), authorize('expenses:view', 'reports:financial'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const { start, end } = dateRange(req.query.from, req.query.to);
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
        const conditions = tenantScope(req, expenses, 'storeId');
        conditions.push(gte(expenses.expenseDate, start), lt(expenses.expenseDate, end));
        if (req.query.status && expenseStatuses.has(String(req.query.status))) conditions.push(eq(expenses.status, String(req.query.status)));
        if (req.query.category) conditions.push(eq(expenses.category, String(req.query.category)));
        if (req.query.branchId) {
            const branch = await branchContext(db, String(req.query.branchId));
            if (!canUseBranch(req, branch)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
            conditions.push(eq(expenses.branchId, String(req.query.branchId)));
        }
        const where = and(...conditions);
        const [rows, totals] = await Promise.all([
            db.select({
                id: expenses.id, tenantId: expenses.tenantId, storeId: expenses.storeId, branchId: expenses.branchId,
                category: expenses.category, vendor: expenses.vendor, reference: expenses.reference,
                description: expenses.description, amount: expenses.amount, taxAmount: expenses.taxAmount,
                paymentMethod: expenses.paymentMethod, expenseDate: expenses.expenseDate, status: expenses.status,
                createdBy: expenses.createdBy, approvedBy: expenses.approvedBy, paidBy: expenses.paidBy,
                approvedAt: expenses.approvedAt, paidAt: expenses.paidAt, createdAt: expenses.createdAt,
                branchName: branches.name, creatorName: users.name,
            }).from(expenses)
                .leftJoin(branches, eq(expenses.branchId, branches.id))
                .leftJoin(users, eq(expenses.createdBy, users.id))
                .where(where).orderBy(desc(expenses.expenseDate)).limit(limit).offset((page - 1) * limit),
            db.select({ count: sql<number>`count(*)`, amount: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
                .from(expenses).where(where),
        ]);
        res.json({ success: true, data: rows, meta: { page, limit, total: Number(totals[0]?.count || 0), totalAmount: money(totals[0]?.amount) }, period: { from: start, to: end } });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/expenses', authenticate, withTenantTx(), authorize('expenses:create', 'finance:manage'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const body = req.body || {};
        const amount = money(body.amount);
        const branchId = String(body.branchId || req.authUser?.activeBranchId || req.authUser?.branchId || '');
        if (!branchId || amount <= 0 || !String(body.category || '').trim()) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'branchId, category and a positive amount are required' } });
        }
        const branch = await branchContext(db, branchId);
        if (!canUseBranch(req, branch)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
        const tenantId = branch?.tenantId || req.authUser?.tenantId || null;
        const [created] = await db.insert(expenses).values({
            tenantId, storeId: branch?.storeId || req.authUser?.activeStoreId || null, branchId,
            category: String(body.category).trim(), vendor: body.vendor ? String(body.vendor).trim() : null,
            reference: body.reference ? String(body.reference).trim() : null,
            description: body.description ? String(body.description).trim() : null,
            amount, taxAmount: money(body.taxAmount), paymentMethod: body.paymentMethod ? String(body.paymentMethod) : null,
            expenseDate: dateValue(body.expenseDate), status: 'DRAFT', createdBy: req.authUser!.userId,
        }).returning();
        await audit(req, 'expense_created', 'expense', created.id, `Created expense ${created.category}`, undefined, created);
        res.status(201).json({ success: true, data: created });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/expenses/:id/submit', authenticate, withTenantTx(), authorize('expenses:create', 'finance:manage'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const conditions = [eq(expenses.id, String(req.params.id)), ...tenantScope(req, expenses)];
        const [current] = await db.select().from(expenses).where(and(...conditions)).limit(1);
        if (!current) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Expense not found' } });
        if (current.status !== 'DRAFT' && current.status !== 'REJECTED') return res.status(409).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Only draft or rejected expenses can be submitted' } });
        const [updated] = await db.update(expenses).set({ status: 'PENDING_APPROVAL', submittedBy: req.authUser!.userId, rejectionReason: null }).where(eq(expenses.id, current.id)).returning();
        await audit(req, 'expense_submitted', 'expense', current.id, `Submitted expense ${current.category}`, current, updated);
        res.json({ success: true, data: updated });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/expenses/:id/approve', authenticate, withTenantTx(), authorize('expenses:approve', 'finance:manage'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        if (!canCheck(req)) return res.status(403).json({ success: false, error: { code: 'CHECKER_REQUIRED', message: 'A checker must be assigned before approval' } });
        const [current] = await db.select().from(expenses).where(and(eq(expenses.id, String(req.params.id)), ...tenantScope(req, expenses))).limit(1);
        if (!current) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Expense not found' } });
        if (current.createdBy === req.authUser!.userId && !req.authUser?.isSuperAdmin) return res.status(403).json({ success: false, error: { code: 'SELF_APPROVAL', message: 'The maker cannot approve their own expense' } });
        if (current.status !== 'PENDING_APPROVAL') return res.status(409).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Expense is not waiting for approval' } });
        const [updated] = await db.update(expenses).set({ status: 'APPROVED', approvedBy: req.authUser!.userId, approvedAt: new Date() }).where(eq(expenses.id, current.id)).returning();
        await audit(req, 'expense_approved', 'expense', current.id, `Approved expense ${current.category}`, current, updated);
        res.json({ success: true, data: updated });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/expenses/:id/reject', authenticate, withTenantTx(), authorize('expenses:approve', 'finance:manage'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        if (!canCheck(req)) return res.status(403).json({ success: false, error: { code: 'CHECKER_REQUIRED', message: 'A checker must be assigned before review' } });
        const [current] = await db.select().from(expenses).where(and(eq(expenses.id, String(req.params.id)), ...tenantScope(req, expenses))).limit(1);
        if (!current) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Expense not found' } });
        if (current.status !== 'PENDING_APPROVAL') return res.status(409).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Expense is not waiting for approval' } });
        const [updated] = await db.update(expenses).set({ status: 'REJECTED', rejectionReason: String(req.body?.reason || 'Rejected by checker') }).where(eq(expenses.id, current.id)).returning();
        await audit(req, 'expense_rejected', 'expense', current.id, `Rejected expense ${current.category}`, current, updated);
        res.json({ success: true, data: updated });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/expenses/:id/pay', authenticate, withTenantTx(), authorize('expenses:pay', 'finance:manage'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const [current] = await db.select().from(expenses).where(and(eq(expenses.id, String(req.params.id)), ...tenantScope(req, expenses))).limit(1);
        if (!current) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Expense not found' } });
        if (current.status !== 'APPROVED') return res.status(409).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Only approved expenses can be paid' } });
        const [updated] = await db.update(expenses).set({ status: 'PAID', paidBy: req.authUser!.userId, paidAt: new Date(), paymentMethod: String(req.body?.paymentMethod || current.paymentMethod || 'CASH') }).where(eq(expenses.id, current.id)).returning();
        await audit(req, 'expense_paid', 'expense', current.id, `Paid expense ${current.category}`, current, updated);
        res.json({ success: true, data: updated });
    } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Payroll compensation and periods
// ─────────────────────────────────────────────────────────────────────────────

financeLedgerRoutes.get('/payroll/tax-profiles', authenticate, withTenantTx(), authorize('payroll:view'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const conditions = payrollScopeConditions(req, payrollTaxProfiles, 'read');
        if (req.query.branchId) {
            const branch = await branchContext(db, String(req.query.branchId));
            if (!branch || !canUsePayrollScope(req, branch, 'read')) return res.status(403).json({ success: false, error: { code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll access is not assigned for this branch' } });
            conditions.push(or(eq(payrollTaxProfiles.branchId, branch.id), and(eq(payrollTaxProfiles.storeId, branch.storeId), isNull(payrollTaxProfiles.branchId)))!);
        }
        const rows = await db.select().from(payrollTaxProfiles)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(payrollTaxProfiles.effectiveFrom));
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/tax-profiles', authenticate, withTenantTx(), authorize('payroll:policy'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const body = req.body || {};
        const branchId = body.branchId ? String(body.branchId) : null;
        const branch = branchId ? await branchContext(db, branchId) : null;
        if (branchId && !branch) return res.status(404).json({ success: false, error: { code: 'BRANCH_NOT_FOUND', message: 'Branch not found' } });
        const storeId = branch?.storeId || (body.storeId ? String(body.storeId) : req.authUser?.activeStoreId || null);
        const brackets = validateTaxBrackets(body.taxBrackets);
        const effectiveFrom = dateValue(body.effectiveFrom, new Date(NaN));
        const sourceReference = String(body.sourceReference || '').trim();
        const employeeSocialRate = Number(body.employeeSocialRate || 0);
        const employerSocialRate = Number(body.employerSocialRate || 0);
        if (!storeId || !brackets || !sourceReference || Number.isNaN(effectiveFrom.getTime())
            || ![employeeSocialRate, employerSocialRate].every(rate => Number.isFinite(rate) && rate >= 0 && rate <= 1)) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_TAX_PROFILE', message: 'Store, effective date, ordered tax brackets with a final open bracket, and rates from 0 to 1 are required' } });
        }
        if (!canUsePayrollScope(req, { storeId, branchId }, 'manage')) return res.status(403).json({ success: false, error: { code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll management access is not assigned for this scope' } });
        const tenantId = branch?.tenantId || req.authUser?.tenantId || null;
        if (!tenantId) return res.status(409).json({ success: false, error: { code: 'TENANT_SCOPE_MISSING', message: 'Payroll tax profile requires a tenant scope' } });
        const requestedEffectiveTo = body.effectiveTo ? dateValue(body.effectiveTo, new Date(NaN)) : null;
        if (requestedEffectiveTo && (Number.isNaN(requestedEffectiveTo.getTime()) || requestedEffectiveTo < effectiveFrom)) return res.status(400).json({ success: false, error: { code: 'INVALID_EFFECTIVE_RANGE', message: 'Tax profile effective-to date must be after effective-from' } });
        const result: any = await scopedPayrollTransaction(req, async (tx) => {
            const scopeCondition = branchId
                ? eq(payrollTaxProfiles.branchId, branchId)
                : and(eq(payrollTaxProfiles.storeId, storeId), isNull(payrollTaxProfiles.branchId));
            const activeVersions = await tx.select({ id: payrollTaxProfiles.id, effectiveFrom: payrollTaxProfiles.effectiveFrom }).from(payrollTaxProfiles).where(and(
                eq(payrollTaxProfiles.tenantId, tenantId), scopeCondition!, eq(payrollTaxProfiles.status, 'ACTIVE'),
            )).for('update');
            if (activeVersions.some((version: any) => new Date(version.effectiveFrom) >= effectiveFrom)) return { error: { status: 409, code: 'TAX_PROFILE_BACKDATE_CONFLICT', message: 'The effective date must be later than the current tax profile version' } };
            await tx.update(payrollTaxProfiles).set({
                effectiveTo: new Date(effectiveFrom.getTime() - 1), updatedBy: req.authUser!.userId,
            }).where(and(
                eq(payrollTaxProfiles.tenantId, tenantId), scopeCondition!, eq(payrollTaxProfiles.status, 'ACTIVE'),
                isNull(payrollTaxProfiles.effectiveTo), lt(payrollTaxProfiles.effectiveFrom, effectiveFrom),
            ));
            const [row] = await tx.insert(payrollTaxProfiles).values({
                tenantId, storeId, branchId, name: String(body.name || 'Payroll tax profile').trim(),
                currency: String(body.currency || 'LAK').toUpperCase(), effectiveFrom,
                effectiveTo: requestedEffectiveTo,
                taxBrackets: brackets, taxableDeduction: money(body.taxableDeduction),
                employeeSocialRate, employerSocialRate,
                socialContributionCap: money(body.socialContributionCap),
                sourceReference,
                status: 'ACTIVE', createdBy: req.authUser!.userId,
            }).returning();
            return { created: row };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        const created = result.created;
        await audit(req, 'payroll_tax_profile_created', 'payroll_tax_profile', created.id, `Created payroll tax profile ${created.name}`, undefined, created);
        res.status(201).json({ success: true, data: created });
    } catch (error) { next(error); }
});

financeLedgerRoutes.get('/payroll/work-policies', authenticate, withTenantTx(), authorize('payroll:view'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const branchId = String(req.query.branchId || '');
        if (!branchId) return res.status(400).json({ success: false, error: { code: 'BRANCH_REQUIRED', message: 'Select a branch to view its payroll work policy' } });
        const branch = await branchContext(db, branchId);
        if (!branch || !canUsePayrollScope(req, branch, 'read')) return res.status(403).json({ success: false, error: { code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll access is not assigned for this branch' } });
        const rows = await db.select().from(payrollWorkPolicies).where(and(
            eq(payrollWorkPolicies.branchId, branchId),
            ...payrollScopeConditions(req, payrollWorkPolicies, 'read'),
        )).orderBy(desc(payrollWorkPolicies.effectiveFrom));
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/work-policies', authenticate, withTenantTx(), authorize('payroll:policy'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const body = req.body || {};
        const branchId = String(body.branchId || '');
        const branch = branchId ? await branchContext(db, branchId) : null;
        const effectiveFrom = dateValue(body.effectiveFrom, new Date(NaN));
        const policy = validateWorkPolicy(body);
        if (!branch?.tenantId || !policy || Number.isNaN(effectiveFrom.getTime()) || !String(body.sourceReference || '').trim()) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_WORK_POLICY', message: 'Branch, effective date, valid work/OT values and a source reference are required' } });
        }
        if (!canUsePayrollScope(req, branch, 'manage')) return res.status(403).json({ success: false, error: { code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll policy access is not assigned for this branch' } });
        const branchTenantId = branch.tenantId;
        const requestedEffectiveTo = body.effectiveTo ? dateValue(body.effectiveTo, new Date(NaN)) : null;
        if (requestedEffectiveTo && (Number.isNaN(requestedEffectiveTo.getTime()) || requestedEffectiveTo < effectiveFrom)) return res.status(400).json({ success: false, error: { code: 'INVALID_EFFECTIVE_RANGE', message: 'Work policy effective-to date must be after effective-from' } });
        const result: any = await scopedPayrollTransaction(req, async (tx) => {
            const activeVersions = await tx.select({ id: payrollWorkPolicies.id, effectiveFrom: payrollWorkPolicies.effectiveFrom }).from(payrollWorkPolicies).where(and(
                eq(payrollWorkPolicies.branchId, branch.id), eq(payrollWorkPolicies.status, 'ACTIVE'),
            )).for('update');
            if (activeVersions.some((version: any) => new Date(version.effectiveFrom) >= effectiveFrom)) return { error: { status: 409, code: 'WORK_POLICY_BACKDATE_CONFLICT', message: 'The effective date must be later than the current work policy version' } };
            await tx.update(payrollWorkPolicies).set({
                effectiveTo: new Date(effectiveFrom.getTime() - 1), updatedBy: req.authUser!.userId,
            }).where(and(
                eq(payrollWorkPolicies.branchId, branch.id), eq(payrollWorkPolicies.status, 'ACTIVE'),
                isNull(payrollWorkPolicies.effectiveTo), lt(payrollWorkPolicies.effectiveFrom, effectiveFrom),
            ));
            const [row] = await tx.insert(payrollWorkPolicies).values({
                tenantId: branchTenantId, storeId: branch.storeId, branchId: branch.id,
                name: String(body.name || 'Branch work and OT policy').trim(), effectiveFrom,
                effectiveTo: requestedEffectiveTo,
                ...policy, sourceReference: String(body.sourceReference).trim(),
                status: 'ACTIVE', createdBy: req.authUser!.userId,
            }).returning();
            return { created: row };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        const created = result.created;
        await audit(req, 'payroll_work_policy_created', 'payroll_work_policy', created.id, `Created work policy ${created.name}`, undefined, created);
        res.status(201).json({ success: true, data: created });
    } catch (error) { next(error); }
});

financeLedgerRoutes.get('/payroll/staff', authenticate, withTenantTx(), authorize('payroll:compensation', 'payroll:manage'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const branchId = String(req.query.branchId || '');
        const branch = branchId ? await branchContext(db, branchId) : null;
        if (!branch || !canUsePayrollScope(req, branch, 'write')) return res.status(403).json({ success: false, error: { code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll staff access is not assigned for this branch' } });
        const assignments = await db.select({ userId: userStores.userId }).from(userStores).where(eq(userStores.branchId, branchId));
        const assignedIds = assignments.map((row: any) => row.userId);
        const memberCondition = or(
            eq(users.branchId, branchId),
            assignedIds.length ? inArray(users.id, assignedIds) : sql`false`,
            eq(users.id, req.authUser!.userId),
        )!;
        const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, branchId: users.branchId })
            .from(users).where(and(
                branch.tenantId ? eq(users.tenantId, branch.tenantId) : sql`true`,
                eq(users.isActive, true), eq(users.isSuperAdmin, false), memberCondition,
            )).orderBy(asc(users.name));
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
});

financeLedgerRoutes.get('/payroll/me/periods', authenticate, withTenantTx(), authorize('payroll:view_self'), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const rows = await db.select({
            id: payrollPeriods.id, periodStart: payrollPeriods.periodStart, periodEnd: payrollPeriods.periodEnd,
            status: payrollPeriods.status, currency: payrollPeriods.currency, branchId: payrollPeriods.branchId,
            branchName: branches.name, grossPay: payrollItems.grossPay, deductions: payrollItems.deductions,
            netPay: payrollItems.netPay, itemStatus: payrollItems.status,
        }).from(payrollItems)
            .innerJoin(payrollPeriods, eq(payrollItems.periodId, payrollPeriods.id))
            .leftJoin(branches, eq(payrollPeriods.branchId, branches.id))
            .where(and(
                eq(payrollItems.userId, req.authUser!.userId),
                inArray(payrollPeriods.status, ['APPROVED', 'PARTIALLY_PAID', 'PAID', 'CLOSED']),
            )).orderBy(desc(payrollPeriods.periodEnd));
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
});

financeLedgerRoutes.get('/payroll/me/periods/:id', authenticate, withTenantTx(), authorize('payroll:view_self'), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const [item] = await db.select({
            id: payrollItems.id, periodId: payrollItems.periodId, payType: payrollItems.payType,
            currency: payrollItems.currency, hoursWorked: payrollItems.hoursWorked, regularHours: payrollItems.regularHours,
            overtimeHours: payrollItems.overtimeHours, weekendHours: payrollItems.weekendHours,
            holidayHours: payrollItems.holidayHours, attendanceDays: payrollItems.attendanceDays,
            scheduledDays: payrollItems.scheduledDays, absenceDays: payrollItems.absenceDays,
            lateMinutes: payrollItems.lateMinutes, earlyLeaveMinutes: payrollItems.earlyLeaveMinutes,
            attendanceDeduction: payrollItems.attendanceDeduction, basePay: payrollItems.basePay,
            overtimePay: payrollItems.overtimePay, commission: payrollItems.commission,
            allowance: payrollItems.allowance, reimbursement: payrollItems.reimbursement,
            taxableIncome: payrollItems.taxableIncome, incomeTax: payrollItems.incomeTax,
            employeeSocialSecurity: payrollItems.employeeSocialSecurity,
            otherDeductions: payrollItems.otherDeductions, deductions: payrollItems.deductions,
            grossPay: payrollItems.grossPay, netPay: payrollItems.netPay, status: payrollItems.status,
            calculationDetails: payrollItems.calculationDetails,
            periodStart: payrollPeriods.periodStart, periodEnd: payrollPeriods.periodEnd,
            periodStatus: payrollPeriods.status, branchName: branches.name,
        }).from(payrollItems)
            .innerJoin(payrollPeriods, eq(payrollItems.periodId, payrollPeriods.id))
            .leftJoin(branches, eq(payrollPeriods.branchId, branches.id))
            .where(and(
                eq(payrollPeriods.id, String(req.params.id)), eq(payrollItems.userId, req.authUser!.userId),
                inArray(payrollPeriods.status, ['APPROVED', 'PARTIALLY_PAID', 'PAID', 'CLOSED']),
            )).limit(1);
        if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payslip not found' } });
        const payments = await db.select({ amount: payrollPayments.amount, currency: payrollPayments.currency, paymentMethod: payrollPayments.paymentMethod, reference: payrollPayments.reference, paidAt: payrollPayments.paidAt })
            .from(payrollPayments).where(and(eq(payrollPayments.payrollItemId, item.id), eq(payrollPayments.userId, req.authUser!.userId))).orderBy(desc(payrollPayments.paidAt));
        res.json({ success: true, data: { ...item, payments } });
    } catch (error) { next(error); }
});

financeLedgerRoutes.get('/payroll/compensation', authenticate, withTenantTx(), authorize('payroll:view_detail', 'payroll:compensation', 'payroll:manage'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const conditions = payrollScopeConditions(req, employeeCompensation, 'read');
        if (req.query.userId) conditions.push(eq(employeeCompensation.userId, String(req.query.userId)));
        if (req.query.branchId) {
            const branch = await branchContext(db, String(req.query.branchId));
            if (!branch || !canUsePayrollScope(req, branch, 'read')) return res.status(403).json({ success: false, error: { code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll access is not assigned for this branch' } });
            conditions.push(eq(employeeCompensation.branchId, String(req.query.branchId)));
        }
        const rows = await db.select({ id: employeeCompensation.id, storeId: employeeCompensation.storeId, branchId: employeeCompensation.branchId, userId: employeeCompensation.userId, payType: employeeCompensation.payType, baseRate: employeeCompensation.baseRate, allowance: employeeCompensation.allowance, defaultDeduction: employeeCompensation.defaultDeduction, taxExemptAmount: employeeCompensation.taxExemptAmount, socialSecurityEnabled: employeeCompensation.socialSecurityEnabled, overtimeEligible: employeeCompensation.overtimeEligible, commissionRate: employeeCompensation.commissionRate, effectiveFrom: employeeCompensation.effectiveFrom, effectiveTo: employeeCompensation.effectiveTo, status: employeeCompensation.status, userName: users.name, userEmail: users.email }).from(employeeCompensation).leftJoin(users, eq(employeeCompensation.userId, users.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(employeeCompensation.effectiveFrom));
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/compensation', authenticate, withTenantTx(), authorize('payroll:compensation'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const body = req.body || {};
        const userId = String(body.userId || '');
        const payType = String(body.payType || 'MONTHLY').toUpperCase();
        if (!userId || !payTypes.has(payType) || money(body.baseRate) < 0 || !body.effectiveFrom) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'userId, payType, baseRate and effectiveFrom are required' } });
        const [target] = await db.select({ id: users.id, tenantId: users.tenantId, storeId: users.storeId, branchId: users.branchId, isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, userId)).limit(1);
        if (!target || target.isSuperAdmin) return res.status(404).json({ success: false, error: { code: 'STAFF_NOT_FOUND', message: 'Staff member not found' } });
        if (req.authUser?.tenantId && target.tenantId !== req.authUser.tenantId && !req.authUser.isSuperAdmin) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this staff member' } });
        const requestedBranch = body.branchId ? await branchContext(db, String(body.branchId)) : null;
        if (!requestedBranch) return res.status(400).json({ success: false, error: { code: 'BRANCH_REQUIRED', message: 'Select the employee branch before setting compensation' } });
        const compensationScope = { storeId: requestedBranch.storeId, branchId: requestedBranch.id };
        if (!canUsePayrollScope(req, compensationScope, 'write')) return res.status(403).json({ success: false, error: { code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll write access is not assigned for this staff scope' } });
        const targetAssignments = await db.select({ branchId: userStores.branchId }).from(userStores).where(and(
            eq(userStores.userId, userId), eq(userStores.storeId, compensationScope.storeId),
            eq(userStores.branchId, compensationScope.branchId),
        )).limit(1);
        const anchorMatches = target.storeId === compensationScope.storeId
            && target.branchId === compensationScope.branchId;
        const ownerAssigningSelf = target.id === req.authUser!.userId;
        if (!anchorMatches && !targetAssignments.length && !ownerAssigningSelf) return res.status(400).json({ success: false, error: { code: 'STAFF_SCOPE_MISMATCH', message: 'Assign this staff member to the selected branch before setting compensation' } });
        const effectiveFrom = dateValue(body.effectiveFrom);
        if (Number.isNaN(effectiveFrom.getTime())) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'effectiveFrom must be a valid date' } });
        const requestedEffectiveTo = body.effectiveTo ? dateValue(body.effectiveTo, new Date(NaN)) : null;
        const commissionRate = Number(body.commissionRate || 0);
        if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) return res.status(400).json({ success: false, error: { code: 'INVALID_COMMISSION_RATE', message: 'Commission rate must be between 0 and 1' } });
        if (requestedEffectiveTo && (Number.isNaN(requestedEffectiveTo.getTime()) || requestedEffectiveTo < effectiveFrom)) return res.status(400).json({ success: false, error: { code: 'INVALID_EFFECTIVE_RANGE', message: 'Compensation effective-to date must be after effective-from' } });
        const result: any = await scopedPayrollTransaction(req, async (tx) => {
            const activeVersions = await tx.select().from(employeeCompensation).where(and(
                eq(employeeCompensation.userId, userId), eq(employeeCompensation.storeId, compensationScope.storeId),
                eq(employeeCompensation.branchId, compensationScope.branchId), eq(employeeCompensation.status, 'ACTIVE'),
            )).for('update');
            if (activeVersions.some((version: any) => new Date(version.effectiveFrom) >= effectiveFrom)) {
                return { error: { status: 409, code: 'COMPENSATION_BACKDATE_CONFLICT', message: 'The effective date must be later than the current compensation version' } };
            }
            const [lockedPeriod] = await tx.select({ id: payrollPeriods.id }).from(payrollPeriods).where(and(
                eq(payrollPeriods.branchId, compensationScope.branchId),
                lte(payrollPeriods.periodStart, effectiveFrom), gte(payrollPeriods.periodEnd, effectiveFrom),
                sql`${payrollPeriods.status} NOT IN ('OPEN', 'CALCULATING', 'CANCELLED', 'REVERSED')`,
            )).for('update');
            if (lockedPeriod) return { error: { status: 409, code: 'PAYROLL_PERIOD_LOCKED', message: 'Compensation cannot be changed inside a submitted, approved, paid, or closed payroll period' } };
            await tx.update(employeeCompensation).set({
                effectiveTo: new Date(effectiveFrom.getTime() - 1), status: 'SUPERSEDED', updatedBy: req.authUser!.userId,
            }).where(and(
                eq(employeeCompensation.userId, userId), eq(employeeCompensation.storeId, compensationScope.storeId),
                eq(employeeCompensation.branchId, compensationScope.branchId), eq(employeeCompensation.status, 'ACTIVE'),
                lt(employeeCompensation.effectiveFrom, effectiveFrom),
            ));
            const [created] = await tx.insert(employeeCompensation).values({
                tenantId: target.tenantId, storeId: compensationScope.storeId, branchId: compensationScope.branchId,
                userId, payType, baseRate: money(body.baseRate), allowance: money(body.allowance),
                defaultDeduction: money(body.defaultDeduction), taxExemptAmount: money(body.taxExemptAmount),
                socialSecurityEnabled: body.socialSecurityEnabled !== false,
                overtimeEligible: body.overtimeEligible !== false, commissionRate, effectiveFrom,
                effectiveTo: requestedEffectiveTo, status: 'ACTIVE', createdBy: req.authUser!.userId,
            }).returning();
            return { created };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        const created = result.created;
        await audit(req, 'compensation_created', 'employee_compensation', created.id, `Created compensation for ${userId}`, undefined, created);
        res.status(201).json({ success: true, data: created });
    } catch (error) { next(error); }
});

financeLedgerRoutes.get('/payroll/periods', authenticate, withTenantTx(), authorize('payroll:view'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const conditions = payrollScopeConditions(req, payrollPeriods, 'read');
        if (req.query.branchId) {
            const branch = await branchContext(db, String(req.query.branchId));
            if (!branch || !canUsePayrollScope(req, branch, 'read')) return res.status(403).json({ success: false, error: { code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll access is not assigned for this branch' } });
            conditions.push(eq(payrollPeriods.branchId, String(req.query.branchId)));
        }
        const rows = await db.select({ id: payrollPeriods.id, storeId: payrollPeriods.storeId, branchId: payrollPeriods.branchId, periodStart: payrollPeriods.periodStart, periodEnd: payrollPeriods.periodEnd, status: payrollPeriods.status, totalGross: payrollPeriods.totalGross, totalDeductions: payrollPeriods.totalDeductions, totalIncomeTax: payrollPeriods.totalIncomeTax, totalEmployeeSocial: payrollPeriods.totalEmployeeSocial, totalEmployerSocial: payrollPeriods.totalEmployerSocial, totalEmployerCost: payrollPeriods.totalEmployerCost, totalNet: payrollPeriods.totalNet, taxProfileId: payrollPeriods.taxProfileId, workPolicyId: payrollPeriods.workPolicyId, createdBy: payrollPeriods.createdBy, submittedBy: payrollPeriods.submittedBy, approvedBy: payrollPeriods.approvedBy, branchName: branches.name, createdAt: payrollPeriods.createdAt }).from(payrollPeriods).leftJoin(branches, eq(payrollPeriods.branchId, branches.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(payrollPeriods.periodStart));
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods', authenticate, withTenantTx(), authorize('payroll:manage'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const body = req.body || {};
        const start = dateValue(body.periodStart, new Date(NaN));
        const end = dateValue(body.periodEnd, new Date(NaN));
        const branchId = body.branchId ? String(body.branchId) : null;
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'periodStart and periodEnd must be valid and ordered' } });
        const selectedBranch = branchId ? await branchContext(db, branchId) : null;
        if (!selectedBranch) return res.status(400).json({ success: false, error: { code: 'BRANCH_REQUIRED', message: 'Payroll periods must belong to one branch' } });
        const scopedBranchId = selectedBranch.id;
        const selectedStoreId = selectedBranch.storeId;
        if (!canUsePayrollScope(req, { storeId: selectedStoreId, branchId: scopedBranchId }, 'write')) return res.status(403).json({ success: false, error: { code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll write access is not assigned for this store or branch' } });
        const result: any = await scopedPayrollTransaction(req, async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${scopedBranchId}))`);
            const [overlap] = await tx.select({ id: payrollPeriods.id }).from(payrollPeriods).where(and(
                eq(payrollPeriods.branchId, scopedBranchId),
                lte(payrollPeriods.periodStart, end), gte(payrollPeriods.periodEnd, start),
                sql`${payrollPeriods.status} NOT IN ('CANCELLED', 'REVERSED')`,
            )).limit(1);
            if (overlap) return { error: { status: 409, code: 'PAYROLL_PERIOD_OVERLAP', message: 'This branch already has a payroll period covering some of the selected dates' } };
            const [created] = await tx.insert(payrollPeriods).values({
                tenantId: selectedBranch.tenantId || req.authUser?.tenantId || null,
                storeId: selectedStoreId,
                branchId: scopedBranchId,
                periodStart: start,
                periodEnd: end,
                status: 'OPEN',
                createdBy: req.authUser!.userId,
            }).returning();
            return { created };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        const created = result.created;
        await audit(req, 'payroll_period_created', 'payroll_period', created.id, `Created payroll period`, undefined, created);
        res.status(201).json({ success: true, data: created });
    } catch (error) { next(error); }
});

async function findPeriod(db: any, req: any, id: string) {
    const conditions = [eq(payrollPeriods.id, id), ...payrollScopeConditions(req, payrollPeriods, 'read')];
    const [period] = await db.select().from(payrollPeriods).where(and(...conditions)).limit(1);
    return period || null;
}

financeLedgerRoutes.get('/payroll/periods/:id', authenticate, withTenantTx(), authorize('payroll:view_detail', 'payroll:manage', 'payroll:approve', 'payroll:pay'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const period = await findPeriod(db, req, String(req.params.id));
        if (!period) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payroll period not found' } });
        const items = await db.select({ id: payrollItems.id, periodId: payrollItems.periodId, userId: payrollItems.userId, storeId: payrollItems.storeId, branchId: payrollItems.branchId, payType: payrollItems.payType, hoursWorked: payrollItems.hoursWorked, regularHours: payrollItems.regularHours, overtimeHours: payrollItems.overtimeHours, weekendHours: payrollItems.weekendHours, holidayHours: payrollItems.holidayHours, attendanceDays: payrollItems.attendanceDays, scheduledDays: payrollItems.scheduledDays, absenceDays: payrollItems.absenceDays, lateMinutes: payrollItems.lateMinutes, earlyLeaveMinutes: payrollItems.earlyLeaveMinutes, attendanceDeduction: payrollItems.attendanceDeduction, basePay: payrollItems.basePay, overtimePay: payrollItems.overtimePay, commission: payrollItems.commission, allowance: payrollItems.allowance, reimbursement: payrollItems.reimbursement, taxableIncome: payrollItems.taxableIncome, incomeTax: payrollItems.incomeTax, employeeSocialSecurity: payrollItems.employeeSocialSecurity, employerSocialSecurity: payrollItems.employerSocialSecurity, otherDeductions: payrollItems.otherDeductions, deductions: payrollItems.deductions, grossPay: payrollItems.grossPay, netPay: payrollItems.netPay, employerCost: payrollItems.employerCost, taxProfileId: payrollItems.taxProfileId, calculationDetails: payrollItems.calculationDetails, status: payrollItems.status, userName: users.name, userEmail: users.email }).from(payrollItems).leftJoin(users, eq(payrollItems.userId, users.id)).where(and(eq(payrollItems.periodId, period.id), ...payrollScopeConditions(req, payrollItems, 'read'))).orderBy(asc(users.name));
        const adjustments = await db.select().from(payrollAdjustments).where(and(eq(payrollAdjustments.periodId, period.id), ...payrollScopeConditions(req, payrollAdjustments, 'read'))).orderBy(desc(payrollAdjustments.createdAt));
        const payments = await db.select().from(payrollPayments).where(and(eq(payrollPayments.periodId, period.id), ...payrollScopeConditions(req, payrollPayments, 'read'))).orderBy(desc(payrollPayments.paidAt));
        res.json({ success: true, data: { period, items, adjustments, payments } });
    } catch (error) { next(error); }
});

function csvValue(value: unknown): string {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

financeLedgerRoutes.get('/payroll/periods/:id/export', authenticate, withTenantTx(), authorize('payroll:export'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const period = await findPeriod(db, req, String(req.params.id));
        if (!period) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payroll period not found' } });
        const rows = await db.select({
            employee: users.name, email: users.email, payType: payrollItems.payType,
            attendanceDays: payrollItems.attendanceDays, scheduledDays: payrollItems.scheduledDays, absenceDays: payrollItems.absenceDays, regularHours: payrollItems.regularHours,
            overtimeHours: payrollItems.overtimeHours, weekendHours: payrollItems.weekendHours,
            holidayHours: payrollItems.holidayHours, lateMinutes: payrollItems.lateMinutes,
            earlyLeaveMinutes: payrollItems.earlyLeaveMinutes, basePay: payrollItems.basePay,
            overtimePay: payrollItems.overtimePay, commission: payrollItems.commission,
            allowance: payrollItems.allowance, reimbursement: payrollItems.reimbursement,
            attendanceDeduction: payrollItems.attendanceDeduction, incomeTax: payrollItems.incomeTax,
            employeeSocialSecurity: payrollItems.employeeSocialSecurity, otherDeductions: payrollItems.otherDeductions,
            grossPay: payrollItems.grossPay, netPay: payrollItems.netPay, employerCost: payrollItems.employerCost,
            status: payrollItems.status,
        }).from(payrollItems).leftJoin(users, eq(payrollItems.userId, users.id)).where(and(
            eq(payrollItems.periodId, period.id), ...payrollScopeConditions(req, payrollItems, 'read'),
        )).orderBy(asc(users.name));
        const headers = ['Employee', 'Email', 'Pay type', 'Attendance days', 'Regular hours', 'OT hours', 'Weekend hours', 'Holiday hours', 'Late minutes', 'Early-leave minutes', 'Base pay', 'OT pay', 'Additions', 'Attendance deduction', 'Income tax', 'Employee social security', 'Other deductions', 'Gross pay', 'Net pay', 'Employer cost', 'Status'];
        const csv = [headers, ...rows.map((row: any) => Object.values(row))]
            .map((row) => row.map(csvValue).join(','))
            .join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="payroll-${String(period.periodStart).slice(0, 10)}-${String(period.periodEnd).slice(0, 10)}.csv"`);
        res.send(`\uFEFF${csv}`);
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods/:id/calculate', authenticate, withTenantTx(), authorize('payroll:manage'), branchFilter(), async (req, res, next) => {
    try {
        const result: any = await scopedPayrollTransaction(req, async (db) => {
        const periodConditions = [eq(payrollPeriods.id, String(req.params.id)), ...payrollScopeConditions(req, payrollPeriods, 'read')];
        const [period] = await db.select().from(payrollPeriods).where(and(...periodConditions)).for('update');
        if (!period) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll period not found' } };
        if (!period.tenantId || !period.storeId || !period.branchId) return { error: { status: 409, code: 'PAYROLL_SCOPE_INCOMPLETE', message: 'Payroll period is missing its tenant, store, or branch scope' } };
        const periodStoreId = period.storeId;
        const periodBranchId = period.branchId;
        if (!canUsePayrollScope(req, { storeId: period.storeId, branchId: period.branchId }, 'write')) return { error: { status: 403, code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll write access is not assigned for this period' } };
        if (!['OPEN', 'CALCULATING'].includes(period.status)) return { error: { status: 409, code: 'INVALID_STATUS', message: 'Only open payroll periods can be calculated' } };
        const taxProfile = await resolveTaxProfile(db, period);
        const taxBrackets = validateTaxBrackets(taxProfile?.taxBrackets);
        if (!taxProfile || !taxBrackets) return { error: { status: 400, code: 'TAX_PROFILE_REQUIRED', message: 'Create an active tax profile for this store or branch before calculating payroll' } };
        if (taxProfile.overlappingVersionCount > 1) return { error: { status: 409, code: 'TAX_PROFILE_VERSION_SPLIT_REQUIRED', message: 'A tax profile changes inside this payroll period. Split the period at the effective date.' } };
        const workPolicy = await resolveWorkPolicy(db, period);
        const validatedWorkPolicy = validateWorkPolicy(workPolicy);
        if (!workPolicy || !validatedWorkPolicy) return { error: { status: 400, code: 'WORK_POLICY_REQUIRED', message: 'Create an active work and OT policy for this branch before calculating payroll' } };
        if (workPolicy.overlappingVersionCount > 1) return { error: { status: 409, code: 'WORK_POLICY_VERSION_SPLIT_REQUIRED', message: 'A work policy changes inside this payroll period. Split the period at the effective date.' } };
        const conditions: any[] = [inArray(employeeCompensation.status, ['ACTIVE', 'SUPERSEDED']), lte(employeeCompensation.effectiveFrom, period.periodEnd), or(isNull(employeeCompensation.effectiveTo), gte(employeeCompensation.effectiveTo, period.periodStart))];
        if (period.tenantId && !req.authUser?.isSuperAdmin) conditions.push(eq(employeeCompensation.tenantId, period.tenantId));
        conditions.push(eq(employeeCompensation.storeId, periodStoreId));
        conditions.push(eq(employeeCompensation.branchId, periodBranchId));
        const comps = await db.select().from(employeeCompensation).where(and(...conditions));
        if (!comps.length) return { error: { status: 400, code: 'NO_COMPENSATION', message: 'No active employee compensation found for this period' } };
        const compensationVersionsByUser = new Map<string, any[]>();
        for (const comp of comps) compensationVersionsByUser.set(comp.userId, [...(compensationVersionsByUser.get(comp.userId) || []), comp]);
        const versionConflict = [...compensationVersionsByUser.entries()].find(([, versions]) => versions.length > 1);
        if (versionConflict) return { error: { status: 409, code: 'COMPENSATION_VERSION_SPLIT_REQUIRED', message: 'An employee compensation rate changes inside this payroll period. Split the payroll period at the compensation effective date to avoid an incorrect payment.' } };
        const userIds = comps.map((c: any) => c.userId);
        const periodEndExclusive = new Date(period.periodEnd);
        periodEndExclusive.setDate(periodEndExclusive.getDate() + 1);
        const openAttendanceRows = userIds.length ? await db.select({ userId: attendanceRecords.userId }).from(attendanceRecords).where(and(
            inArray(attendanceRecords.userId, userIds), eq(attendanceRecords.branchId, periodBranchId),
            lt(attendanceRecords.clockInAt, periodEndExclusive), isNull(attendanceRecords.clockOutAt),
            eq(attendanceRecords.status, 'OPEN'),
        )) : [];
        if (openAttendanceRows.length) return { error: {
            status: 409, code: 'OPEN_ATTENDANCE_EXISTS',
            message: `${new Set(openAttendanceRows.map((row: any) => row.userId)).size} employee attendance record(s) are still open. Close or correct them before calculating payroll.`,
        } };
        const attendanceRows = userIds.length ? await db.select({
            userId: attendanceRecords.userId,
            openedAt: attendanceRecords.clockInAt,
            closedAt: attendanceRecords.clockOutAt,
        }).from(attendanceRecords).where(and(
            inArray(attendanceRecords.userId, userIds), eq(attendanceRecords.branchId, periodBranchId),
            lt(attendanceRecords.clockInAt, periodEndExclusive), gt(attendanceRecords.clockOutAt, period.periodStart),
            inArray(attendanceRecords.status, ['CLOSED', 'ADJUSTED']),
        )) : [];
        const attendanceByUser = new Map<string, Array<{ openedAt: Date; closedAt: Date }>>();
        for (const row of attendanceRows) {
            if (!row.closedAt) continue;
            const entries = attendanceByUser.get(row.userId) || [];
            entries.push({ openedAt: row.openedAt, closedAt: row.closedAt });
            attendanceByUser.set(row.userId, entries);
        }

        // Historical fallback only: payroll periods created before attendance
        // existed still use closed cash shifts, but once an employee has any
        // attendance in the period we never mix the two sources (which would
        // double their hours).
        const legacyUserIds = userIds.filter((userId: string) => !attendanceByUser.has(userId));
        const shiftRows = legacyUserIds.length ? await db.select({ userId: shifts.userId, openedAt: shifts.openedAt, closedAt: shifts.closedAt }).from(shifts).where(and(
            inArray(shifts.userId, legacyUserIds), eq(shifts.branchId, periodBranchId),
            lt(shifts.openedAt, periodEndExclusive), gt(shifts.closedAt, period.periodStart), eq(shifts.status, 'CLOSED'),
        )) : [];
        const shiftsByUser = new Map<string, Array<{ openedAt: Date; closedAt: Date }>>();
        for (const shift of shiftRows) {
            if (!shift.closedAt) continue;
            const entries = shiftsByUser.get(shift.userId) || [];
            entries.push({ openedAt: shift.openedAt, closedAt: shift.closedAt });
            shiftsByUser.set(shift.userId, entries);
        }
        // Real OT: compare each employee's actual worked hours against THEIR
        // OWN roster for that day (employee_work_schedules), not just the
        // tenant's flat standardHoursPerDay — see scheduleRowsToDailyHours.
        // Falls back to the flat policy number for any employee/day with no
        // schedule row, so tenants that haven't set up rosters see no change.
        const scheduleRows = userIds.length ? await db.select({ userId: employeeWorkSchedules.userId, dayOfWeek: employeeWorkSchedules.dayOfWeek, startTime: employeeWorkSchedules.startTime, endTime: employeeWorkSchedules.endTime, timezone: employeeWorkSchedules.timezone, earlyClockOutGraceMinutes: employeeWorkSchedules.earlyClockOutGraceMinutes, effectiveFrom: employeeWorkSchedules.effectiveFrom, effectiveTo: employeeWorkSchedules.effectiveTo }).from(employeeWorkSchedules).where(and(
            inArray(employeeWorkSchedules.userId, userIds), eq(employeeWorkSchedules.branchId, periodBranchId),
            lte(employeeWorkSchedules.effectiveFrom, period.periodEnd),
            or(isNull(employeeWorkSchedules.effectiveTo), gte(employeeWorkSchedules.effectiveTo, period.periodStart)),
        )) : [];
        const scheduleRowsByUser = new Map<string, Array<{ dayOfWeek: number; startTime: string; endTime: string; timezone: string; earlyClockOutGraceMinutes: number; effectiveFrom: Date; effectiveTo: Date | null }>>();
        for (const row of scheduleRows) {
            const entries = scheduleRowsByUser.get(row.userId) || [];
            entries.push({ dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime, timezone: row.timezone, earlyClockOutGraceMinutes: row.earlyClockOutGraceMinutes, effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo });
            scheduleRowsByUser.set(row.userId, entries);
        }
        const salesRows = await db.select({
            id: transactions.id, userId: transactions.userId, type: transactions.type,
            status: transactions.status, total: transactions.total, parentId: transactions.parentId,
        }).from(transactions).where(and(
            eq(transactions.branchId, periodBranchId),
            gte(transactions.createdAt, period.periodStart), lt(transactions.createdAt, periodEndExclusive),
            inArray(transactions.type, ['SALE', 'REFUND']), inArray(transactions.status, ['COMPLETED', 'REFUNDED']),
        ));
        const refundParentIds = salesRows.filter((row: any) => row.type === 'REFUND' && row.parentId).map((row: any) => row.parentId);
        const refundParents = refundParentIds.length ? await db.select({ id: transactions.id, userId: transactions.userId }).from(transactions).where(inArray(transactions.id, refundParentIds)) : [];
        const parentOwnerById = new Map(refundParents.map((row: any) => [row.id, row.userId]));
        const netSalesByUser = new Map<string, number>();
        for (const row of salesRows) {
            const creditedUserId = row.type === 'REFUND' && row.parentId ? parentOwnerById.get(row.parentId) : row.userId;
            if (!creditedUserId || !userIds.includes(creditedUserId)) continue;
            netSalesByUser.set(creditedUserId, money((netSalesByUser.get(creditedUserId) || 0) + money(row.total)));
        }
        const approvedAdjustments = userIds.length ? await db.select().from(payrollAdjustments).where(and(
            eq(payrollAdjustments.periodId, period.id), eq(payrollAdjustments.status, 'APPROVED'), inArray(payrollAdjustments.userId, userIds),
            eq(payrollAdjustments.branchId, periodBranchId),
        )) : [];
        const adjustmentsByUser = new Map<string, any[]>();
        for (const adjustment of approvedAdjustments) adjustmentsByUser.set(adjustment.userId, [...(adjustmentsByUser.get(adjustment.userId) || []), adjustment]);
        await db.delete(payrollItems).where(eq(payrollItems.periodId, period.id));
        let totalGross = 0; let totalDeductions = 0; let totalIncomeTax = 0;
        let totalEmployeeSocial = 0; let totalEmployerSocial = 0;
        let totalEmployerCost = 0; let totalNet = 0;
        const itemValues = comps.map((comp: any) => {
            const employeeSchedules = scheduleRowsByUser.get(comp.userId) || [];
            const workEntries = attendanceByUser.get(comp.userId) || shiftsByUser.get(comp.userId) || [];
            const attendanceSource = attendanceByUser.has(comp.userId) ? 'ATTENDANCE' : 'LEGACY_CASH_SHIFT';
            const work = calculatePayrollWork(comp.payType, money(comp.baseRate), workEntries, validatedWorkPolicy, new Date(period.periodStart), periodEndExclusive, comp.overtimeEligible !== false, undefined, employeeSchedules);
            const employeeAdjustments = adjustmentsByUser.get(comp.userId) || [];
            const adjustmentTotal = (type: string) => money(employeeAdjustments.filter((entry: any) => entry.type === type).reduce((sum: number, entry: any) => sum + money(entry.amount), 0));
            const salesCommissionBase = money(Math.max(0, netSalesByUser.get(comp.userId) || 0));
            const automaticCommission = money(salesCommissionBase * Math.max(0, Number(comp.commissionRate) || 0));
            const manualCommission = adjustmentTotal('COMMISSION');
            const bonus = adjustmentTotal('BONUS');
            const commission = money(automaticCommission + manualCommission + bonus);
            const allowance = money(comp.allowance + adjustmentTotal('ALLOWANCE'));
            const reimbursement = adjustmentTotal('REIMBURSEMENT');
            const otherDeductions = money(comp.defaultDeduction + work.attendanceDeduction + [...payrollDeductionTypes].reduce((sum, type) => sum + adjustmentTotal(type), 0));
            const calculated = calculatePayroll({
                basePay: work.basePay, overtimePay: work.overtimePay, commission, allowance, reimbursement, otherDeductions,
                taxExemptAmount: money(comp.taxExemptAmount), socialSecurityEnabled: comp.socialSecurityEnabled !== false,
            }, {
                id: taxProfile.id, taxBrackets,
                taxableDeduction: money(taxProfile.taxableDeduction),
                employeeSocialRate: Number(taxProfile.employeeSocialRate) || 0,
                employerSocialRate: Number(taxProfile.employerSocialRate) || 0,
                socialContributionCap: money(taxProfile.socialContributionCap),
            });
            totalGross += calculated.grossPay; totalDeductions += calculated.deductions;
            totalIncomeTax += calculated.incomeTax; totalEmployeeSocial += calculated.employeeSocialSecurity;
            totalEmployerSocial += calculated.employerSocialSecurity; totalEmployerCost += calculated.employerCost;
            totalNet += calculated.netPay;
            return {
                tenantId: period.tenantId, storeId: comp.storeId || period.storeId,
                branchId: comp.branchId || period.branchId, currency: taxProfile.currency || 'LAK', periodId: period.id, userId: comp.userId,
                payType: comp.payType, hoursWorked: work.hoursWorked, regularHours: work.regularHours,
                overtimeHours: work.overtimeHours, weekendHours: work.weekendHours,
                holidayHours: work.holidayHours, attendanceDays: work.attendanceDays,
                scheduledDays: work.scheduledDays, absenceDays: work.absenceDays,
                lateMinutes: work.lateMinutes, earlyLeaveMinutes: work.earlyLeaveMinutes,
                attendanceDeduction: work.attendanceDeduction,
                basePay: work.basePay, overtimePay: work.overtimePay, commission, allowance, reimbursement,
                taxableIncome: calculated.taxableIncome,
                incomeTax: calculated.incomeTax, employeeSocialSecurity: calculated.employeeSocialSecurity,
                employerSocialSecurity: calculated.employerSocialSecurity,
                otherDeductions: calculated.otherDeductions, deductions: calculated.deductions,
                grossPay: calculated.grossPay, netPay: calculated.netPay,
                employerCost: calculated.employerCost, taxProfileId: taxProfile.id,
                calculationDetails: {
                    taxProfileName: taxProfile.name, taxSourceReference: taxProfile.sourceReference,
                    workPolicyName: workPolicy.name, workPolicySourceReference: workPolicy.sourceReference,
                    hourlyRate: work.hourlyRate, shiftCount: work.shiftCount,
                    nightPremiumHours: work.nightPremiumHours,
                    eveningOvertimeHours: work.eveningOvertimeHours,
                    nightOvertimeHours: work.nightOvertimeHours,
                    complianceWarnings: work.complianceWarnings,
                    absenceDates: work.absenceDates,
                    attendanceSource,
                    lateMinutes: work.lateMinutes, earlyLeaveMinutes: work.earlyLeaveMinutes,
                    attendanceDeduction: work.attendanceDeduction,
                    salesCommissionBase, commissionRate: Number(comp.commissionRate) || 0,
                    automaticCommission, manualCommission, bonus,
                    bracketBreakdown: calculated.bracketBreakdown,
                    adjustments: employeeAdjustments.map((entry: any) => ({ id: entry.id, type: entry.type, amount: entry.amount, reason: entry.reason })),
                },
                status: 'DRAFT',
            };
        });
        await db.insert(payrollItems).values(itemValues);
        const [updated] = await db.update(payrollPeriods).set({
            status: 'CALCULATING', taxProfileId: taxProfile.id, workPolicyId: workPolicy.id,
            currency: taxProfile.currency || 'LAK',
            totalGross: money(totalGross), totalDeductions: money(totalDeductions),
            totalIncomeTax: money(totalIncomeTax), totalEmployeeSocial: money(totalEmployeeSocial),
            totalEmployerSocial: money(totalEmployerSocial), totalEmployerCost: money(totalEmployerCost),
            totalNet: money(totalNet),
        }).where(eq(payrollPeriods.id, period.id)).returning();
        return { period: updated, previousPeriod: period, itemCount: itemValues.length };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        await audit(req, 'payroll_calculated', 'payroll_period', result.period.id, `Calculated ${result.itemCount} payroll items`, result.previousPeriod, result.period);
        res.json({ success: true, data: { period: result.period, itemCount: result.itemCount } });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods/:id/adjustments', authenticate, withTenantTx(), authorize('payroll:manage'), branchFilter(), async (req, res, next) => {
    try {
        const db: any = req.tx ?? globalDb;
        const period = await findPeriod(db, req, String(req.params.id));
        if (!period) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payroll period not found' } });
        if (!period.branchId || !period.storeId || !period.tenantId || !canUsePayrollScope(req, period, 'write')) return res.status(403).json({ success: false, error: { code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll write access is not assigned for this branch' } });
        if (!['OPEN', 'CALCULATING'].includes(period.status)) return res.status(409).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Adjustments can only be added before payroll submission' } });
        const type = String(req.body?.type || '').toUpperCase();
        const amount = money(req.body?.amount);
        const userId = String(req.body?.userId || '');
        const reason = String(req.body?.reason || '').trim();
        if ((!payrollAdditionTypes.has(type) && !payrollDeductionTypes.has(type)) || amount <= 0 || !userId || !reason) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_ADJUSTMENT', message: 'Employee, adjustment type, positive amount and reason are required' } });
        }
        const [compensation] = await db.select({ id: employeeCompensation.id }).from(employeeCompensation).where(and(
            eq(employeeCompensation.userId, userId), eq(employeeCompensation.branchId, period.branchId),
            eq(employeeCompensation.status, 'ACTIVE'), lte(employeeCompensation.effectiveFrom, period.periodEnd),
            or(isNull(employeeCompensation.effectiveTo), gte(employeeCompensation.effectiveTo, period.periodStart)),
        )).limit(1);
        if (!compensation) return res.status(400).json({ success: false, error: { code: 'COMPENSATION_REQUIRED', message: 'The employee must have active compensation in this branch' } });
        const [created] = await db.insert(payrollAdjustments).values({
            tenantId: period.tenantId, storeId: period.storeId, branchId: period.branchId,
            periodId: period.id, userId, type, amount, reason,
            status: 'PENDING_APPROVAL', createdBy: req.authUser!.userId,
        }).returning();
        await audit(req, 'payroll_adjustment_created', 'payroll_adjustment', created.id, `Created ${type} adjustment`, undefined, created);
        res.status(201).json({ success: true, data: created });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods/:id/adjustments/:adjustmentId/approve', authenticate, withTenantTx(), authorize('payroll:approve'), branchFilter(), async (req, res, next) => {
    try {
        if (!canCheck(req)) return res.status(403).json({ success: false, error: { code: 'CHECKER_REQUIRED', message: 'A checker must be assigned before adjustment approval' } });
        const result: any = await scopedPayrollTransaction(req, async (db) => {
            const periodConditions = [eq(payrollPeriods.id, String(req.params.id)), ...payrollScopeConditions(req, payrollPeriods, 'read')];
            const [period] = await db.select().from(payrollPeriods).where(and(...periodConditions)).for('update');
            if (!period?.branchId) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll period not found' } };
            if (!canUsePayrollScope(req, period, 'write')) return { error: { status: 403, code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll approval access is not assigned for this branch' } };
            const [current] = await db.select().from(payrollAdjustments).where(and(
                eq(payrollAdjustments.id, String(req.params.adjustmentId)), eq(payrollAdjustments.periodId, period.id),
                eq(payrollAdjustments.branchId, period.branchId),
            )).for('update');
            if (!current) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll adjustment not found' } };
            if (current.createdBy === req.authUser!.userId && !req.authUser?.isSuperAdmin) return { error: { status: 403, code: 'SELF_APPROVAL', message: 'The maker cannot approve their own payroll adjustment' } };
            if (current.status !== 'PENDING_APPROVAL') return { error: { status: 409, code: 'INVALID_STATUS', message: 'Adjustment is not waiting for approval' } };
            const [updated] = await db.update(payrollAdjustments).set({ status: 'APPROVED', approvedBy: req.authUser!.userId, approvedAt: new Date() }).where(and(
                eq(payrollAdjustments.id, current.id), eq(payrollAdjustments.status, 'PENDING_APPROVAL'),
            )).returning();
            if (!updated) throw new Error(`PAYROLL_ADJUSTMENT_STATE_CONFLICT:${current.id}`);
            if (period.status === 'CALCULATING') {
                await db.delete(payrollItems).where(eq(payrollItems.periodId, period.id));
                await db.update(payrollPeriods).set({
                    status: 'OPEN', taxProfileId: null, workPolicyId: null,
                    totalGross: 0, totalDeductions: 0, totalIncomeTax: 0,
                    totalEmployeeSocial: 0, totalEmployerSocial: 0,
                    totalEmployerCost: 0, totalNet: 0,
                }).where(and(eq(payrollPeriods.id, period.id), eq(payrollPeriods.status, 'CALCULATING')));
            }
            return { current, updated };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        await audit(req, 'payroll_adjustment_approved', 'payroll_adjustment', result.current.id, `Approved ${result.current.type} adjustment`, result.current, result.updated);
        res.json({ success: true, data: result.updated });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods/:id/adjustments/:adjustmentId/reject', authenticate, withTenantTx(), authorize('payroll:approve'), branchFilter(), async (req, res, next) => {
    try {
        if (!canCheck(req)) return res.status(403).json({ success: false, error: { code: 'CHECKER_REQUIRED', message: 'A checker must be assigned before adjustment review' } });
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 3) return res.status(400).json({ success: false, error: { code: 'REASON_REQUIRED', message: 'A rejection reason of at least 3 characters is required' } });
        const result: any = await scopedPayrollTransaction(req, async (db) => {
            const periodConditions = [eq(payrollPeriods.id, String(req.params.id)), ...payrollScopeConditions(req, payrollPeriods, 'read')];
            const [period] = await db.select().from(payrollPeriods).where(and(...periodConditions)).for('update');
            if (!period?.branchId) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll period not found' } };
            if (!canUsePayrollScope(req, period, 'write')) return { error: { status: 403, code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll approval access is not assigned for this branch' } };
            const [current] = await db.select().from(payrollAdjustments).where(and(
                eq(payrollAdjustments.id, String(req.params.adjustmentId)), eq(payrollAdjustments.periodId, period.id),
                eq(payrollAdjustments.branchId, period.branchId),
            )).for('update');
            if (!current) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll adjustment not found' } };
            if (current.createdBy === req.authUser!.userId && !req.authUser?.isSuperAdmin) return { error: { status: 403, code: 'SELF_REVIEW', message: 'The maker cannot reject their own payroll adjustment' } };
            if (current.status !== 'PENDING_APPROVAL') return { error: { status: 409, code: 'INVALID_STATUS', message: 'Adjustment is not waiting for review' } };
            const [updated] = await db.update(payrollAdjustments).set({
                status: 'REJECTED', reviewedBy: req.authUser!.userId, reviewedAt: new Date(), reviewReason: reason,
            }).where(and(eq(payrollAdjustments.id, current.id), eq(payrollAdjustments.status, 'PENDING_APPROVAL'))).returning();
            if (!updated) throw new Error(`PAYROLL_ADJUSTMENT_STATE_CONFLICT:${current.id}`);
            if (period.status === 'CALCULATING') {
                await db.delete(payrollItems).where(eq(payrollItems.periodId, period.id));
                await db.update(payrollPeriods).set({
                    status: 'OPEN', taxProfileId: null, workPolicyId: null,
                    totalGross: 0, totalDeductions: 0, totalIncomeTax: 0,
                    totalEmployeeSocial: 0, totalEmployerSocial: 0,
                    totalEmployerCost: 0, totalNet: 0,
                }).where(and(eq(payrollPeriods.id, period.id), eq(payrollPeriods.status, 'CALCULATING')));
            }
            return { current, updated };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        await audit(req, 'payroll_adjustment_rejected', 'payroll_adjustment', result.current.id, `Rejected ${result.current.type} adjustment: ${reason}`, result.current, result.updated);
        res.json({ success: true, data: result.updated });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods/:id/adjustments/:adjustmentId/cancel', authenticate, withTenantTx(), authorize('payroll:manage'), branchFilter(), async (req, res, next) => {
    try {
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 3) return res.status(400).json({ success: false, error: { code: 'REASON_REQUIRED', message: 'A cancellation reason of at least 3 characters is required' } });
        const result: any = await scopedPayrollTransaction(req, async (db) => {
            const periodConditions = [eq(payrollPeriods.id, String(req.params.id)), ...payrollScopeConditions(req, payrollPeriods, 'read')];
            const [period] = await db.select().from(payrollPeriods).where(and(...periodConditions)).for('update');
            if (!period?.branchId) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll period not found' } };
            if (!canUsePayrollScope(req, period, 'write')) return { error: { status: 403, code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll write access is not assigned for this branch' } };
            if (!['OPEN', 'CALCULATING'].includes(period.status)) return { error: { status: 409, code: 'INVALID_STATUS', message: 'Adjustments can only be cancelled before payroll submission' } };
            const [current] = await db.select().from(payrollAdjustments).where(and(
                eq(payrollAdjustments.id, String(req.params.adjustmentId)), eq(payrollAdjustments.periodId, period.id),
                eq(payrollAdjustments.branchId, period.branchId),
            )).for('update');
            if (!current) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll adjustment not found' } };
            if (current.createdBy !== req.authUser!.userId && !req.authUser?.isSuperAdmin) return { error: { status: 403, code: 'MAKER_REQUIRED', message: 'Only the adjustment maker can cancel it' } };
            if (current.status !== 'PENDING_APPROVAL') return { error: { status: 409, code: 'INVALID_STATUS', message: 'Only a pending adjustment can be cancelled' } };
            const [updated] = await db.update(payrollAdjustments).set({
                status: 'CANCELLED', reviewedBy: req.authUser!.userId, reviewedAt: new Date(), reviewReason: reason,
            }).where(and(eq(payrollAdjustments.id, current.id), eq(payrollAdjustments.status, 'PENDING_APPROVAL'))).returning();
            if (!updated) throw new Error(`PAYROLL_ADJUSTMENT_STATE_CONFLICT:${current.id}`);
            if (period.status === 'CALCULATING') {
                await db.delete(payrollItems).where(eq(payrollItems.periodId, period.id));
                await db.update(payrollPeriods).set({
                    status: 'OPEN', taxProfileId: null, workPolicyId: null,
                    totalGross: 0, totalDeductions: 0, totalIncomeTax: 0,
                    totalEmployeeSocial: 0, totalEmployerSocial: 0,
                    totalEmployerCost: 0, totalNet: 0,
                }).where(and(eq(payrollPeriods.id, period.id), eq(payrollPeriods.status, 'CALCULATING')));
            }
            return { current, updated };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        await audit(req, 'payroll_adjustment_cancelled', 'payroll_adjustment', result.current.id, `Cancelled ${result.current.type} adjustment: ${reason}`, result.current, result.updated);
        res.json({ success: true, data: result.updated });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods/:id/submit', authenticate, withTenantTx(), authorize('payroll:manage'), branchFilter(), async (req, res, next) => {
    try {
        const result: any = await scopedPayrollTransaction(req, async (db) => {
            const periodConditions = [eq(payrollPeriods.id, String(req.params.id)), ...payrollScopeConditions(req, payrollPeriods, 'read')];
            const [period] = await db.select().from(payrollPeriods).where(and(...periodConditions)).for('update');
            if (!period) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll period not found' } };
            if (!canUsePayrollScope(req, period, 'write')) return { error: { status: 403, code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll write access is not assigned for this period' } };
            if (period.status !== 'CALCULATING') return { error: { status: 409, code: 'INVALID_STATUS', message: 'Calculate payroll before submitting' } };
            const [pendingAdjustment] = await db.select({ id: payrollAdjustments.id }).from(payrollAdjustments).where(and(eq(payrollAdjustments.periodId, period.id), eq(payrollAdjustments.status, 'PENDING_APPROVAL'))).limit(1);
            if (pendingAdjustment) return { error: { status: 409, code: 'PENDING_ADJUSTMENTS', message: 'Approve or reject all payroll adjustments and recalculate before submission' } };
            const [updated] = await db.update(payrollPeriods).set({ status: 'PENDING_APPROVAL', submittedBy: req.authUser!.userId }).where(and(eq(payrollPeriods.id, period.id), eq(payrollPeriods.status, 'CALCULATING'))).returning();
            if (!updated) throw new Error(`PAYROLL_PERIOD_STATE_CONFLICT:${period.id}`);
            await db.update(payrollItems).set({ status: 'PENDING_APPROVAL' }).where(and(eq(payrollItems.periodId, period.id), eq(payrollItems.status, 'DRAFT')));
            return { period, updated };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        await audit(req, 'payroll_submitted', 'payroll_period', result.period.id, 'Submitted payroll for approval', result.period, result.updated);
        res.json({ success: true, data: result.updated });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods/:id/approve', authenticate, withTenantTx(), authorize('payroll:approve'), branchFilter(), async (req, res, next) => {
    try {
        if (!canCheck(req)) return res.status(403).json({ success: false, error: { code: 'CHECKER_REQUIRED', message: 'A checker must be assigned before approval' } });
        const result: any = await scopedPayrollTransaction(req, async (db) => {
            const periodConditions = [eq(payrollPeriods.id, String(req.params.id)), ...payrollScopeConditions(req, payrollPeriods, 'read')];
            const [period] = await db.select().from(payrollPeriods).where(and(...periodConditions)).for('update');
            if (!period) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll period not found' } };
            if (!canUsePayrollScope(req, period, 'write')) return { error: { status: 403, code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll approval access is not assigned for this period' } };
            if ((period.createdBy === req.authUser!.userId || period.submittedBy === req.authUser!.userId) && !req.authUser?.isSuperAdmin) return { error: { status: 403, code: 'SELF_APPROVAL', message: 'The maker or submitter cannot approve their own payroll' } };
            if (period.status !== 'PENDING_APPROVAL') return { error: { status: 409, code: 'INVALID_STATUS', message: 'Payroll is not waiting for approval' } };
            const [updated] = await db.update(payrollPeriods).set({ status: 'APPROVED', approvedBy: req.authUser!.userId, approvedAt: new Date(), rejectionReason: null }).where(and(eq(payrollPeriods.id, period.id), eq(payrollPeriods.status, 'PENDING_APPROVAL'))).returning();
            if (!updated) throw new Error(`PAYROLL_PERIOD_STATE_CONFLICT:${period.id}`);
            await db.update(payrollItems).set({ status: 'APPROVED' }).where(and(eq(payrollItems.periodId, period.id), eq(payrollItems.status, 'PENDING_APPROVAL')));
            return { period, updated };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        await audit(req, 'payroll_approved', 'payroll_period', result.period.id, 'Approved payroll', result.period, result.updated);
        res.json({ success: true, data: result.updated });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods/:id/reject', authenticate, withTenantTx(), authorize('payroll:approve'), branchFilter(), async (req, res, next) => {
    try {
        if (!canCheck(req)) return res.status(403).json({ success: false, error: { code: 'CHECKER_REQUIRED', message: 'A checker must be assigned before rejection' } });
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 3) return res.status(400).json({ success: false, error: { code: 'INVALID_REJECTION', message: 'A rejection reason of at least 3 characters is required' } });
        const result: any = await scopedPayrollTransaction(req, async (db) => {
            const periodConditions = [eq(payrollPeriods.id, String(req.params.id)), ...payrollScopeConditions(req, payrollPeriods, 'read')];
            const [period] = await db.select().from(payrollPeriods).where(and(...periodConditions)).for('update');
            if (!period) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll period not found' } };
            if (!canUsePayrollScope(req, period, 'write')) return { error: { status: 403, code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll approval access is not assigned for this period' } };
            if ((period.createdBy === req.authUser!.userId || period.submittedBy === req.authUser!.userId) && !req.authUser?.isSuperAdmin) return { error: { status: 403, code: 'SELF_REVIEW', message: 'The maker or submitter cannot review their own payroll' } };
            if (period.status !== 'PENDING_APPROVAL') return { error: { status: 409, code: 'INVALID_STATUS', message: 'Payroll is not waiting for approval' } };
            const [updated] = await db.update(payrollPeriods).set({ status: 'CALCULATING', submittedBy: null, rejectionReason: reason }).where(and(eq(payrollPeriods.id, period.id), eq(payrollPeriods.status, 'PENDING_APPROVAL'))).returning();
            if (!updated) throw new Error(`PAYROLL_PERIOD_STATE_CONFLICT:${period.id}`);
            await db.update(payrollItems).set({ status: 'DRAFT' }).where(and(eq(payrollItems.periodId, period.id), eq(payrollItems.status, 'PENDING_APPROVAL')));
            return { period, updated };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        await audit(req, 'payroll_rejected', 'payroll_period', result.period.id, `Rejected payroll: ${reason}`, result.period, result.updated);
        res.json({ success: true, data: result.updated });
    } catch (error) { next(error); }
});

async function payPayrollItems(req: any, periodId: string, requestedItemId?: string) {
    const paymentMethod = String(req.body?.paymentMethod || '').toUpperCase();
    const reference = String(req.body?.reference || '').trim();
    if (!payrollPaymentMethods.has(paymentMethod) || (paymentMethod !== 'CASH' && !reference)) {
        return { error: { status: 400, code: 'INVALID_PAYMENT', message: 'Select a payment method and provide a reference for non-cash payment' } };
    }

    return scopedPayrollTransaction(req, async (db) => {
        const periodConditions = [eq(payrollPeriods.id, periodId), ...payrollScopeConditions(req, payrollPeriods, 'read')];
        const [period] = await db.select().from(payrollPeriods).where(and(...periodConditions)).for('update');
        if (!period) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll period not found' } };
        if (!canUsePayrollScope(req, period, 'write')) return { error: { status: 403, code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll payment access is not assigned for this period' } };
        if (!['APPROVED', 'PARTIALLY_PAID'].includes(period.status)) return { error: { status: 409, code: 'INVALID_STATUS', message: 'Only approved payroll can be paid' } };

        const itemConditions: any[] = [eq(payrollItems.periodId, period.id), eq(payrollItems.status, 'APPROVED')];
        if (requestedItemId) itemConditions.push(eq(payrollItems.id, requestedItemId));
        const items = await db.select().from(payrollItems).where(and(...itemConditions)).for('update');
        if (!items.length) {
            const existingConditions: any[] = [eq(payrollPayments.periodId, period.id), gt(payrollPayments.amount, 0)];
            if (requestedItemId) existingConditions.push(eq(payrollPayments.payrollItemId, requestedItemId));
            const existing = await db.select({ id: payrollPayments.id }).from(payrollPayments).where(and(...existingConditions)).limit(1);
            return existing.length
                ? { period, previousPeriod: period, paidCount: 0, alreadyPaid: true, paymentMethod }
                : { error: { status: 409, code: 'NO_ITEMS', message: 'No approved payroll items remain to be paid' } };
        }

        let paidCount = 0;
        for (const item of items) {
            const inserted = await db.insert(payrollPayments).values({
                tenantId: period.tenantId, storeId: item.storeId || period.storeId,
                branchId: item.branchId || period.branchId, currency: item.currency || period.currency || 'LAK', periodId: period.id,
                payrollItemId: item.id, userId: item.userId, amount: item.netPay,
                paymentMethod, reference: reference || null,
                idempotencyKey: `payroll:${item.id}`, paidBy: req.authUser!.userId,
            }).onConflictDoNothing().returning({ id: payrollPayments.id });
            if (!inserted.length) continue;
            const paidItems = await db.update(payrollItems).set({ status: 'PAID' }).where(and(
                eq(payrollItems.id, item.id), eq(payrollItems.status, 'APPROVED'),
            )).returning({ id: payrollItems.id });
            if (paidItems.length !== 1) throw new Error(`PAYROLL_ITEM_STATE_CONFLICT:${item.id}`);
            paidCount++;
        }

        const [remaining] = await db.select({ id: payrollItems.id }).from(payrollItems).where(and(
            eq(payrollItems.periodId, period.id), eq(payrollItems.status, 'APPROVED'),
        )).limit(1);
        const [updated] = await db.update(payrollPeriods).set({
            status: remaining ? 'PARTIALLY_PAID' : 'PAID',
            paidBy: req.authUser!.userId,
            paidAt: remaining ? null : new Date(),
        }).where(and(
            eq(payrollPeriods.id, period.id),
            inArray(payrollPeriods.status, ['APPROVED', 'PARTIALLY_PAID']),
        )).returning();
        if (!updated) throw new Error(`PAYROLL_PERIOD_STATE_CONFLICT:${period.id}`);
        return { period: updated, previousPeriod: period, paidCount, alreadyPaid: paidCount === 0, paymentMethod };
    });
}

financeLedgerRoutes.post('/payroll/periods/:id/items/:itemId/pay', authenticate, withTenantTx(), authorize('payroll:pay'), branchFilter(), async (req, res, next) => {
    try {
        const result: any = await payPayrollItems(req, String(req.params.id), String(req.params.itemId));
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        if (result.paidCount > 0) await audit(req, 'payroll_paid', 'payroll_period', result.period.id, `Paid ${result.paidCount} payroll item(s) by ${result.paymentMethod}`, result.previousPeriod, result.period);
        res.json({ success: true, data: result });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods/:id/pay', authenticate, withTenantTx(), authorize('payroll:pay'), branchFilter(), async (req, res, next) => {
    try {
        const result: any = await payPayrollItems(req, String(req.params.id));
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        if (result.paidCount > 0) await audit(req, 'payroll_paid', 'payroll_period', result.period.id, `Paid ${result.paidCount} payroll item(s) by ${result.paymentMethod}`, result.previousPeriod, result.period);
        res.json({ success: true, data: result });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods/:id/close', authenticate, withTenantTx(), authorize('payroll:manage'), branchFilter(), async (req, res, next) => {
    try {
        const result: any = await scopedPayrollTransaction(req, async (db) => {
            const periodConditions = [eq(payrollPeriods.id, String(req.params.id)), ...payrollScopeConditions(req, payrollPeriods, 'read')];
            const [period] = await db.select().from(payrollPeriods).where(and(...periodConditions)).for('update');
            if (!period) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll period not found' } };
            if (!canUsePayrollScope(req, period, 'manage')) return { error: { status: 403, code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll close access is not assigned for this period' } };
            if (period.status !== 'PAID') return { error: { status: 409, code: 'INVALID_STATUS', message: 'Only a fully paid payroll period can be closed' } };
            const [updated] = await db.update(payrollPeriods).set({ status: 'CLOSED', closedAt: new Date() }).where(and(eq(payrollPeriods.id, period.id), eq(payrollPeriods.status, 'PAID'))).returning();
            if (!updated) throw new Error(`PAYROLL_PERIOD_STATE_CONFLICT:${period.id}`);
            return { period, updated };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        await audit(req, 'payroll_closed', 'payroll_period', result.period.id, 'Closed payroll period', result.period, result.updated);
        res.json({ success: true, data: result.updated });
    } catch (error) { next(error); }
});

financeLedgerRoutes.post('/payroll/periods/:id/reverse', authenticate, withTenantTx(), authorize('payroll:pay'), branchFilter(), async (req, res, next) => {
    try {
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 5) return res.status(400).json({ success: false, error: { code: 'INVALID_REVERSAL', message: 'A reversal reason of at least 5 characters is required' } });
        const result: any = await scopedPayrollTransaction(req, async (db) => {
            const periodConditions = [eq(payrollPeriods.id, String(req.params.id)), ...payrollScopeConditions(req, payrollPeriods, 'read')];
            const [period] = await db.select().from(payrollPeriods).where(and(...periodConditions)).for('update');
            if (!period) return { error: { status: 404, code: 'NOT_FOUND', message: 'Payroll period not found' } };
            if (!canUsePayrollScope(req, period, 'manage')) return { error: { status: 403, code: 'PAYROLL_SCOPE_FORBIDDEN', message: 'Payroll reversal access is not assigned for this period' } };
            if (!['PAID', 'CLOSED'].includes(period.status)) return { error: { status: 409, code: 'INVALID_STATUS', message: 'Only paid or closed payroll can be reversed' } };
            const payments = await db.select().from(payrollPayments).where(and(eq(payrollPayments.periodId, period.id), gt(payrollPayments.amount, 0))).for('update');
            if (!payments.length) return { error: { status: 409, code: 'NO_PAYMENTS', message: 'No payroll payments remain to reverse' } };
            let reversedCount = 0;
            for (const payment of payments) {
                const inserted = await db.insert(payrollPayments).values({
                    tenantId: payment.tenantId, storeId: payment.storeId, branchId: payment.branchId,
                    currency: payment.currency || period.currency || 'LAK', periodId: payment.periodId, payrollItemId: payment.payrollItemId, userId: payment.userId,
                    amount: -Math.abs(payment.amount), paymentMethod: 'REVERSAL', reference: reason,
                    idempotencyKey: `payroll:reverse:${payment.id}`, reversalOfPaymentId: payment.id,
                    paidBy: req.authUser!.userId,
                }).onConflictDoNothing().returning({ id: payrollPayments.id });
                reversedCount += inserted.length;
            }
            if (reversedCount !== payments.length) throw new Error(`PAYROLL_REVERSAL_STATE_CONFLICT:${period.id}`);
            await db.update(payrollItems).set({ status: 'REVERSED' }).where(and(eq(payrollItems.periodId, period.id), eq(payrollItems.status, 'PAID')));
            const [updated] = await db.update(payrollPeriods).set({ status: 'REVERSED', reversalReason: reason }).where(and(
                eq(payrollPeriods.id, period.id), inArray(payrollPeriods.status, ['PAID', 'CLOSED']),
            )).returning();
            if (!updated) throw new Error(`PAYROLL_PERIOD_STATE_CONFLICT:${period.id}`);
            return { period, updated, reversedCount };
        });
        if (result.error) return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
        await audit(req, 'payroll_reversed', 'payroll_period', result.period.id, `Reversed payroll: ${reason}`, result.period, result.updated);
        res.json({ success: true, data: result.updated });
    } catch (error) { next(error); }
});
