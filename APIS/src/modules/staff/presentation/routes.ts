// ═══════════════════════════════════════════════════════════════════════════
// Staff Module - Routes (Drizzle ORM + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, ensureScopeAccess, invalidateUserStoreCache, resolveAssignableRole, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { users, userStores, roles, branches, stores, permissionGroups, permissions as permissionCatalog, employeeWorkSchedules, attendanceRecords } from '@/db/schema/tables';
import { eq, and, or, ilike, inArray, notInArray, isNull, lt, lte, gt, gte, desc, asc, count } from 'drizzle-orm';
import argon2 from 'argon2';
import { invalidateUserPermissions } from '@/infrastructure/services/permission.service';
import { assignUserToStores } from '@/shared/store-assignment';
import { queueActivityLog } from '@/infrastructure/helpers/activity-log.helper';
import { getAllPermissionKeys, getGroupedPermissionKeys } from '@/infrastructure/permissions';
import { localClock, type EmployeeWorkSchedule } from '@/shared/employee-work-schedule';
import { calculateAttendanceMetrics } from '../domain/attendance-calculator';

export const staffRoutes = Router();

// `target` should be a full/unrestricted users-row fetch (not a `columns`-
// limited select) — branchId/storeId are read here for the ensureScopeAccess
// call, so a caller that trims those columns out silently breaks this check
// (it'd pass `undefined`/`undefined`, which ensureScopeAccess's "no
// accessible IDs at all" branch may treat differently than intended).
function canManageStaffRecord(req: any, target: { id: string; tenantId?: string | null; isSuperAdmin?: boolean | null; branchId?: string | null; storeId?: string | null; roleRelation?: { level: number } | null }): boolean {
    const authUser = req.authUser;
    if (!authUser) return false;
    if (authUser.isSuperAdmin) return true;
    if (target.tenantId !== authUser.tenantId) return false;
    if (target.isSuperAdmin) return false;
    // DB-backed level from the target's own linked `roles` row, not a
    // name-based lookup — a target holding a custom role name (anything
    // outside the ~20 built-ins) always resolved to the hardcoded map's
    // fallback level 7, which is <= almost every real caller level, so this
    // check silently let ANY non-superadmin caller "outrank" and therefore
    // edit/deactivate/reassign a custom-role staff member regardless of
    // their actual privilege. A target with no linked role at all (legacy
    // row, no roleId) still defaults to 7 — same as before.
    if ((target.roleRelation?.level ?? 7) <= (authUser.roleLevel ?? 7)) return false;
    // Role-ladder alone only proves "the caller outranks this staff member
    // somewhere in the tenant" — a branch/store-level supervisor is meant to
    // be confined to their own branch/store subtree, not every branch in the
    // tenant. Without this, a branch manager at Branch A could edit or
    // deactivate a lower-ranked staff member at an unrelated sibling branch
    // under the same store (or a different store entirely).
    return ensureScopeAccess({ branchId: target.branchId, storeId: target.storeId, tenantId: target.tenantId }, req);
}

function canViewStaffRecord(req: any, target: { id: string; tenantId?: string | null; isSuperAdmin?: boolean | null; branchId?: string | null; storeId?: string | null; roleRelation?: { level: number } | null }): boolean {
    if (req.authUser?.userId === target.id) return true;
    return canManageStaffRecord(req, target);
}

// Workflow settings are intentionally narrower than editing a staff profile.
// A Store Owner may configure their own maker/checker/shift flags, while a
// branch-level admin may configure only lower-level users in that branch.
function canManageWorkflowRecord(req: any, target: { id: string; tenantId?: string | null; isSuperAdmin?: boolean | null; branchId?: string | null; storeId?: string | null; roleRelation?: { level: number } | null }): boolean {
    const authUser = req.authUser;
    if (!authUser) return false;
    if (authUser.isSuperAdmin) return true;
    if (target.tenantId !== authUser.tenantId || target.isSuperAdmin) return false;
    if (authUser.userId === target.id && (authUser.roleLevel ?? 7) <= 2) return true;
    return canManageStaffRecord(req, target);
}

async function invalidateStaffAuthCaches(userId: string, tenantId?: string | null): Promise<void> {
    await invalidateUserStoreCache(userId);
    if (tenantId) await invalidateUserPermissions(userId, tenantId);
}

// Get all staff
staffRoutes.get('/', authenticate, withTenantTx(), authorize('staff:read'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { page = 1, limit = 20, search, branchId, role, status } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;

        const authUser = req.authUser;
        const isSuperAdmin = authUser?.isSuperAdmin;

        const conditions: any[] = [];
        let scopedUserIds: string[] | null = null;

        // Tenant isolation for staff list
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !isSuperAdmin) {
            conditions.push(eq(users.tenantId, tenantId));
        }

        // Tenant-wide admins (roleLevel <= 2, e.g. store_owner) see every
        // staff member across the whole tenant — same "no restriction"
        // treatment roleLevel <= 2 gets everywhere else in the codebase
        // (branchFilter middleware, ensureScopeAccess, etc.). Without this,
        // the owner's list was silently narrowed to whichever ONE store
        // happened to be their `activeStoreId` at the time — invisible with
        // a single-store test tenant, but at 100 stores it meant the owner
        // saw ~100 of their ~10,000 staff instead of all of them.
        const isTenantWideAdmin = !isSuperAdmin && (authUser?.roleLevel ?? 7) <= 2;
        if (!isSuperAdmin && !isTenantWideAdmin) {
            // Branch is the narrower/authoritative scope — check it first,
            // same order as ensureScopeAccess/buildScopeCondition elsewhere.
            // This used to check activeStoreId FIRST, unconditionally, which
            // meant ANY staff member (cashier, inventory clerk, ...) whose
            // session has an activeStoreId set — i.e. virtually everyone —
            // saw every staff record across every sibling branch under that
            // store, regardless of which single branch `filter.branchIds`
            // actually restricted them to.
            if (filter?.branchIds?.length) {
                if (branchId && !filter.branchIds.includes(String(branchId))) {
                    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
                }
                const targetBranchIds = branchId ? [String(branchId)] : filter.branchIds;
                const usList = await db.query.userStores.findMany({
                    where: inArray(userStores.branchId, targetBranchIds),
                    columns: { userId: true },
                });
                scopedUserIds = usList.map(us => us.userId);
            } else if (authUser?.activeStoreId) {
                const usList = await db.query.userStores.findMany({
                    where: eq(userStores.storeId, authUser.activeStoreId),
                    columns: { userId: true },
                });
                scopedUserIds = usList.map(us => us.userId);
            } else if (branchId) {
                conditions.push(eq(users.branchId, String(branchId)));
            }
        } else if (branchId) {
            // isSuperAdmin or tenant-wide admin explicitly filtering to one
            // branch (e.g. via a branch-picker dropdown) — no scope check
            // needed since neither has any restriction in the first place.
            conditions.push(eq(users.branchId, String(branchId)));
        }

        // Never show actual platform-level accounts in a tenant's own staff
        // list, regardless of caller privilege level. Ladder-rule keyed off
        // the target's own linked `roles.level` (DB-backed) via a subquery,
        // not a hardcoded name blocklist — a custom-named role never matched
        // any entry in ROLE_LEVELS, so the old `notInArray(users.role, ...)`
        // exclusion silently never excluded it, regardless of how privileged
        // it actually was.
        if (!isSuperAdmin) {
            conditions.push(eq(users.isSuperAdmin, false));
            const callerLevel = authUser?.roleLevel ?? 7;
            const higherRoleIds = db.select({ id: roles.id }).from(roles).where(lt(roles.level, callerLevel));
            conditions.push(or(isNull(users.roleId), notInArray(users.roleId, higherRoleIds))!);
        }

        if (scopedUserIds !== null) {
            if (scopedUserIds.length === 0) {
                return res.json({ success: true, data: [], meta: { page: Number(page), limit: Number(limit), total: 0, totalPages: 0 } });
            }
            conditions.push(inArray(users.id, scopedUserIds));
        }

        if (search) {
            const s = String(search);
            conditions.push(or(ilike(users.name, `%${s}%`), ilike(users.email, `%${s}%`), ilike(users.phone, `%${s}%`)));
        }
        if (role) conditions.push(eq(users.role, String(role)));
        if (status === 'active') conditions.push(eq(users.isActive, true));
        if (status === 'inactive') conditions.push(eq(users.isActive, false));

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [staffRows, [{ value: total }]] = await Promise.all([
            db.query.users.findMany({
                where: whereClause,
                offset: skip,
                limit: Number(limit),
                orderBy: desc(users.createdAt),
                columns: { password: false, twoFASecret: false },
                with: { branch: true, roleRelation: true },
            }),
            db.select({ value: count() }).from(users).where(whereClause),
        ]);

        res.json({
            success: true,
            data: staffRows,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get all roles (scoped: non-admins only see non-system roles for their level)
// MUST be before /:id to prevent Express matching /roles/list as /:id
staffRoutes.get('/roles/list', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const isSuperAdmin = req.authUser?.isSuperAdmin ?? false;
        const callerLevel = req.authUser?.roleLevel ?? 7;

        // BE-78: Tenant isolation on roles list
        const tenantId = req.authUser?.tenantId;
        const baseConds: any[] = [];
        if (!isSuperAdmin && tenantId) {
            baseConds.push(or(eq(roles.tenantId, tenantId), isNull(roles.tenantId)));
        }

        // Ladder rule, name-based instead of hardcoded lists so it can't miss
        // a role whose name isn't on some hand-maintained exclude array (the
        // old isAdmin branch here had none at all — hq_admin/hq_manager
        // callers could see 'super_admin' in this list unfiltered). Branch-
        // level callers additionally only see tenant-wide templates or their
        // own branch's roles — other branches' private roles aren't actually
        // assignable to them anyway (resolveAssignableRole would reject).
        if (!isSuperAdmin) {
            baseConds.push(gte(roles.level, callerLevel));
            if (callerLevel >= 4) {
                const activeBranchId = req.authUser?.activeBranchId;
                baseConds.push(activeBranchId ? or(isNull(roles.branchId), eq(roles.branchId, activeBranchId)) : isNull(roles.branchId));
            }
        }

        const roleRows = await db.query.roles.findMany({
            where: baseConds.length > 0 ? and(...baseConds) : undefined,
            orderBy: asc(roles.name),
        });

        // If an owner customizes a built-in role, the role update endpoint
        // creates a tenant-local override and moves this tenant's users to
        // it. Do not expose both the override and the shared template in
        // staff dropdowns; the duplicate made it unclear which Store Owner
        // role would actually be assigned.
        const tenantOverrideNames = new Set(
            roleRows
                .filter((role) => tenantId && role.tenantId === tenantId && role.branchId === null)
                .map((role) => role.name),
        );
        const visibleRoleRows = roleRows.filter(
            (role) => !(role.tenantId === null && tenantOverrideNames.has(role.name)),
        );

        res.json({
            success: true,
            data: visibleRoleRows.map((role) => ({
                ...role,
                isTemplate: role.tenantId === null,
                assignable: isSuperAdmin || role.tenantId !== null,
            })),
        });
    } catch (error) {
        next(error);
    }
});

// Get branches list for staff dropdown - scoped to user's accessible branches
// MUST be before /:id to prevent Express matching /branches/list as /:id
staffRoutes.get('/branches/list', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const isSuperAdmin = authUser.isSuperAdmin;
        // Was a hardcoded role-NAME list ('admin'/'hq_admin'/'hq_manager')
        // that didn't include 'store_owner' — the most common tenant-admin
        // role name in this codebase. Any store_owner account got silently
        // narrowed to only their own directly-assigned branch here, making
        // it impossible to pick any other branch when creating staff via
        // this dropdown. roleLevel <= 4 matches the "unrestricted / HQ-tier"
        // cutoff used consistently elsewhere (branchFilter middleware, etc.)
        // instead of an incomplete, easily-stale name list.
        const isAdmin = isSuperAdmin || (authUser.roleLevel ?? 7) <= 4;

        const conditions: any[] = [eq(branches.isActive, true)];

        // BE-78: Tenant isolation on branches list
        if (!isSuperAdmin && authUser.tenantId) {
            conditions.push(eq(branches.tenantId, authUser.tenantId));
        }

        if (!isAdmin && authUser.accessibleBranchIds?.length) {
            conditions.push(inArray(branches.id, authUser.accessibleBranchIds));
        }

        // Found via a scale test: a single store can hold a very large
        // number of branches (franchise chains), and this endpoint used to
        // return every branch the caller could see with no filter or cap —
        // a 58MB, 100k-row response for one store in testing. storeId lets
        // the staff-creation dropdown (which is always scoped to one
        // selected store) narrow the query; the cap protects the other
        // caller (cash-register branch filter), which has no store concept
        // and would otherwise still pull the whole tenant.
        const { storeId, search } = req.query;
        if (storeId) {
            conditions.push(eq(branches.storeId, String(storeId)));
        }
        if (search) {
            conditions.push(ilike(branches.name, `%${String(search)}%`));
        }

        const BRANCH_LIST_CAP = 300;
        const branchRows = await db.query.branches.findMany({
            where: and(...conditions),
            orderBy: asc(branches.name),
            limit: BRANCH_LIST_CAP,
        });
        res.json({ success: true, data: branchRows, meta: { capped: branchRows.length === BRANCH_LIST_CAP } });
    } catch (error) {
        next(error);
    }
});

const WORK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

async function findEffectiveSchedule(db: any, userId: string, branchId: string, clockInAt: Date): Promise<EmployeeWorkSchedule | null> {
    const candidates = await db.query.employeeWorkSchedules.findMany({
        where: and(
            eq(employeeWorkSchedules.userId, userId),
            eq(employeeWorkSchedules.branchId, branchId),
            lte(employeeWorkSchedules.effectiveFrom, clockInAt),
            or(isNull(employeeWorkSchedules.effectiveTo), gt(employeeWorkSchedules.effectiveTo, clockInAt)),
        ),
        orderBy: desc(employeeWorkSchedules.effectiveFrom),
    });
    return candidates.find((row: any) => localClock(clockInAt, row.timezone).dayOfWeek === row.dayOfWeek) || null;
}

function attendanceValues(clockInAt: Date, clockOutAt: Date | null, schedule: EmployeeWorkSchedule | null) {
    const metrics = calculateAttendanceMetrics(clockInAt, clockOutAt, schedule);
    return {
        workDate: metrics.workDate,
        timezone: metrics.timezone,
        scheduledStartAt: metrics.scheduledStartAt,
        scheduledEndAt: metrics.scheduledEndAt,
        lateMinutes: metrics.lateMinutes,
        earlyLeaveMinutes: metrics.earlyLeaveMinutes,
        workedMinutes: metrics.workedMinutes,
    };
}

function parseAttendanceDate(value: unknown, field: string): Date {
    const parsed = new Date(String(value || ''));
    if (!value || Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid date`);
    return parsed;
}

async function getSchedulableStaff(db: any, req: any, userId: string, branchId: string) {
    const targetConds: any[] = [eq(users.id, userId)];
    if (req.authUser?.tenantId && !req.authUser.isSuperAdmin) {
        targetConds.push(eq(users.tenantId, req.authUser.tenantId));
    }
    const target = await db.query.users.findFirst({
        where: and(...targetConds),
        with: { roleRelation: { columns: { level: true } } },
    });
    if (!target || !canManageWorkflowRecord(req, target)) return null;

    const branchConds: any[] = [eq(branches.id, branchId), eq(branches.isActive, true)];
    if (req.authUser?.tenantId && !req.authUser.isSuperAdmin) {
        branchConds.push(eq(branches.tenantId, req.authUser.tenantId));
    }
    const branch = await db.query.branches.findFirst({ where: and(...branchConds) });
    if (!branch || !ensureScopeAccess({ branchId: branch.id, storeId: branch.storeId, tenantId: branch.tenantId }, req)) return null;

    const directBranchMatch = target.branchId === branch.id;
    const assigned = directBranchMatch || Boolean(await db.query.userStores.findFirst({
        where: and(eq(userStores.userId, target.id), eq(userStores.branchId, branch.id)),
        columns: { id: true },
    }));
    return assigned ? { target, branch } : null;
}

// Which branches a work schedule can actually be set for this staff member.
// A schedule requires one explicit branch (see getSchedulableStaff below —
// it checks the target is actually assigned to that exact branch, either via
// their own users.branchId or a userStores row), but a staff member can be
// assigned at the STORE level across many branches with no single
// users.branchId of their own. Without this, the owner had no way to even
// discover which branch to pick for such a person — the schedule modal could
// only ever use users.branchId directly.
staffRoutes.get('/:id/schedulable-branches', authenticate, withTenantTx(), authorize('staff:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const targetConds: any[] = [eq(users.id, req.params.id)];
        if (req.authUser?.tenantId && !req.authUser.isSuperAdmin) {
            targetConds.push(eq(users.tenantId, req.authUser.tenantId));
        }
        const target = await db.query.users.findFirst({ where: and(...targetConds), with: { roleRelation: { columns: { level: true } } } });
        if (!target || !canManageWorkflowRecord(req, target)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this staff member' } });
        }

        const storeRows = await db.query.userStores.findMany({
            where: eq(userStores.userId, target.id),
            columns: { branchId: true },
        });
        const branchIds = [...new Set([target.branchId, ...storeRows.map((r: any) => r.branchId)].filter(Boolean))] as string[];
        if (branchIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const branchConds: any[] = [inArray(branches.id, branchIds), eq(branches.isActive, true)];
        if (req.authUser?.tenantId && !req.authUser.isSuperAdmin) {
            branchConds.push(eq(branches.tenantId, req.authUser.tenantId));
        }
        const rows = await db.query.branches.findMany({ where: and(...branchConds), orderBy: asc(branches.name) });
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
});

// Read the current weekly schedule for one staff member in one branch.
// The branch is explicit to prevent a schedule from silently crossing into a
// sibling branch where the same employee has no assignment.
staffRoutes.get('/:id/work-schedules', authenticate, withTenantTx(), authorize('staff:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = String(req.query.branchId || '');
        if (!branchId) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'branchId is required' } });
        }
        const scope = await getSchedulableStaff(db, req, req.params.id, branchId);
        if (!scope) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot view schedules for this staff member and branch' } });
        }
        const rows = await db.query.employeeWorkSchedules.findMany({
            where: and(
                eq(employeeWorkSchedules.userId, scope.target.id),
                eq(employeeWorkSchedules.branchId, scope.branch.id),
                eq(employeeWorkSchedules.isActive, true),
            ),
            orderBy: asc(employeeWorkSchedules.dayOfWeek),
        });
        return res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
});

// Replace the current weekly schedule using effective dating. Old schedules
// are retained for payroll/audit and for shifts opened before a later change.
staffRoutes.put('/:id/work-schedules', authenticate, withTenantTx(), authorize('staff:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = String(req.body?.branchId || '');
        const timezone = String(req.body?.timezone || 'Asia/Vientiane');
        const scheduleRows = req.body?.schedules;
        if (!branchId || !Array.isArray(scheduleRows)) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'branchId and schedules are required' } });
        }
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
        } catch {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid timezone' } });
        }
        const seenDays = new Set<number>();
        for (const row of scheduleRows) {
            const dayOfWeek = Number(row?.dayOfWeek);
            const grace = Number(row?.earlyClockOutGraceMinutes ?? 0);
            if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || seenDays.has(dayOfWeek)) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Schedule days must be unique values from 0 to 6' } });
            }
            if (!WORK_TIME_PATTERN.test(String(row?.startTime || '')) || !WORK_TIME_PATTERN.test(String(row?.endTime || ''))) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Schedule time must use HH:mm format' } });
            }
            if (!Number.isInteger(grace) || grace < 0 || grace > 180) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Clock-out grace must be from 0 to 180 minutes' } });
            }
            seenDays.add(dayOfWeek);
        }

        const scope = await getSchedulableStaff(db, req, req.params.id, branchId);
        if (!scope) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot manage schedules for this staff member and branch' } });
        }
        const now = new Date();
        await db.update(employeeWorkSchedules)
            .set({ isActive: false, effectiveTo: now, updatedBy: req.authUser!.userId, updatedAt: now })
            .where(and(
                eq(employeeWorkSchedules.userId, scope.target.id),
                eq(employeeWorkSchedules.branchId, scope.branch.id),
                eq(employeeWorkSchedules.isActive, true),
            ));

        const inserted = scheduleRows.length > 0
            ? await db.insert(employeeWorkSchedules).values(scheduleRows.map((row: any) => ({
                tenantId: scope.branch.tenantId || req.authUser!.tenantId,
                storeId: scope.branch.storeId,
                branchId: scope.branch.id,
                userId: scope.target.id,
                dayOfWeek: Number(row.dayOfWeek),
                startTime: String(row.startTime),
                endTime: String(row.endTime),
                timezone,
                earlyClockOutGraceMinutes: Number(row.earlyClockOutGraceMinutes ?? 0),
                effectiveFrom: now,
                createdBy: req.authUser!.userId,
                updatedBy: req.authUser!.userId,
            }))).returning()
            : [];

        queueActivityLog(
            req.authUser!.userId,
            'staff_schedule_updated',
            'staff',
            `Updated work schedule for ${scope.target.name}`,
            { targetUserId: scope.target.id, branchId: scope.branch.id, timezone, schedules: inserted.map((row: any) => ({ dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime, earlyClockOutGraceMinutes: row.earlyClockOutGraceMinutes })) },
            req,
        ).catch(() => {});
        return res.json({ success: true, data: inserted });
    } catch (error) {
        next(error);
    }
});

// Update per-user maker/checker/shift assignment. Kept separate from the
// profile endpoint so an owner can configure their own workflow flags without
// being able to change their own role/profile through the staff-management
// ladder.
staffRoutes.put('/:id/workflow', authenticate, withTenantTx(), authorize('staff:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { makerEnabled, checkerEnabled, requiresShift } = req.body;
        const supplied = { makerEnabled, checkerEnabled, requiresShift };
        if (!Object.values(supplied).some((value) => value !== undefined)) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'At least one workflow setting is required' } });
        }
        for (const [key, value] of Object.entries(supplied)) {
            if (value !== undefined && typeof value !== 'boolean') {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `${key} must be a boolean` } });
            }
        }

        const targetConds: any[] = [eq(users.id, req.params.id)];
        if (req.authUser?.tenantId && !req.authUser.isSuperAdmin) {
            targetConds.push(eq(users.tenantId, req.authUser.tenantId));
        }
        const target = await db.query.users.findFirst({
            where: and(...targetConds),
            with: { roleRelation: { columns: { level: true } } },
        });
        if (!target || !canManageWorkflowRecord(req, target)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot manage workflow settings for this user' } });
        }

        const [updated] = await db.update(users)
            .set({
                ...(makerEnabled !== undefined ? { makerEnabled } : {}),
                ...(checkerEnabled !== undefined ? { checkerEnabled } : {}),
                ...(requiresShift !== undefined ? { requiresShift } : {}),
                updatedAt: new Date(),
            })
            .where(eq(users.id, target.id))
            .returning({
                id: users.id,
                tenantId: users.tenantId,
                email: users.email,
                name: users.name,
                role: users.role,
                roleId: users.roleId,
                branchId: users.branchId,
                makerEnabled: users.makerEnabled,
                checkerEnabled: users.checkerEnabled,
                requiresShift: users.requiresShift,
                isActive: users.isActive,
            });

        await invalidateStaffAuthCaches(target.id, target.tenantId);
        queueActivityLog(
            req.authUser?.userId || req.user?.userId || '',
            'staff_workflow_updated',
            'staff',
            `Updated workflow settings for ${target.name}`,
            {
                targetUserId: target.id,
                makerEnabled,
                checkerEnabled,
                requiresShift,
                branchId: target.branchId,
            },
            req,
        ).catch(() => {});
        return res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});

// Attendance is a work-time record, not a cash-register shift. Every active
// staff member can clock themselves in/out. Viewing or correcting somebody
// else's record remains behind owner-granted staff permissions and scope.
staffRoutes.get('/attendance/current', authenticate, withTenantTx(), authorize('attendance:clock'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const current = await db.query.attendanceRecords.findFirst({
            where: and(
                eq(attendanceRecords.userId, req.authUser!.userId),
                eq(attendanceRecords.status, 'OPEN'),
            ),
            orderBy: desc(attendanceRecords.clockInAt),
        });
        return res.json({ success: true, data: current || null });
    } catch (error) {
        next(error);
    }
});

staffRoutes.post('/attendance/clock-in', authenticate, withTenantTx(), authorize('attendance:clock'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const branchId = String(req.body?.branchId || authUser.activeBranchId || authUser.branchId || '');
        if (!branchId) {
            return res.status(400).json({ success: false, error: { code: 'BRANCH_REQUIRED', message: 'Select a branch before clocking in' } });
        }
        const branch = await db.query.branches.findFirst({
            where: and(eq(branches.id, branchId), eq(branches.isActive, true)),
        });
        if (!branch || !ensureScopeAccess({ tenantId: branch.tenantId, storeId: branch.storeId, branchId: branch.id }, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
        }
        const tenantId = branch.tenantId || authUser.tenantId;
        if (!tenantId) return res.status(400).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'The selected branch has no tenant' } });

        const existing = await db.query.attendanceRecords.findFirst({
            where: and(eq(attendanceRecords.userId, authUser.userId), eq(attendanceRecords.status, 'OPEN')),
        });
        if (existing) {
            return res.status(409).json({ success: false, error: { code: 'ALREADY_CLOCKED_IN', message: 'You already have an open attendance record' }, data: existing });
        }

        const now = new Date();
        const schedule = await findEffectiveSchedule(db, authUser.userId, branch.id, now);
        const [created] = await db.insert(attendanceRecords).values({
            tenantId,
            storeId: branch.storeId,
            branchId: branch.id,
            userId: authUser.userId,
            clockInAt: now,
            ...attendanceValues(now, null, schedule),
            status: 'OPEN',
            clockInSource: 'WEB',
            note: req.body?.note ? String(req.body.note).trim().slice(0, 500) : null,
            createdBy: authUser.userId,
            updatedBy: authUser.userId,
        }).returning();

        queueActivityLog(authUser.userId, 'attendance_clock_in', 'attendance', 'Clocked in for work', {
            attendanceId: created.id, branchId: branch.id, storeId: branch.storeId,
            workDate: created.workDate, lateMinutes: created.lateMinutes,
        }, req, { entity: 'attendance_record', entityId: created.id, newData: created }).catch(() => {});
        return res.status(201).json({ success: true, data: created });
    } catch (error: any) {
        if (error?.code === '23505') {
            return res.status(409).json({ success: false, error: { code: 'ALREADY_CLOCKED_IN', message: 'You already have an open attendance record' } });
        }
        next(error);
    }
});

staffRoutes.post('/attendance/clock-out', authenticate, withTenantTx(), authorize('attendance:clock'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const current = await db.query.attendanceRecords.findFirst({
            where: and(eq(attendanceRecords.userId, authUser.userId), eq(attendanceRecords.status, 'OPEN')),
            orderBy: desc(attendanceRecords.clockInAt),
        });
        if (!current) {
            return res.status(409).json({ success: false, error: { code: 'NOT_CLOCKED_IN', message: 'No open attendance record was found' } });
        }
        const now = new Date();
        const workedMinutes = Math.max(0, Math.floor((now.getTime() - current.clockInAt.getTime()) / 60_000));
        const earlyLeaveMinutes = current.scheduledEndAt ? Math.max(0, Math.ceil((current.scheduledEndAt.getTime() - now.getTime()) / 60_000)) : 0;
        const [updated] = await db.update(attendanceRecords).set({
            clockOutAt: now,
            clockOutSource: 'WEB',
            workedMinutes,
            earlyLeaveMinutes,
            status: 'CLOSED',
            note: req.body?.note ? String(req.body.note).trim().slice(0, 500) : current.note,
            updatedBy: authUser.userId,
            updatedAt: now,
        }).where(and(eq(attendanceRecords.id, current.id), eq(attendanceRecords.status, 'OPEN'))).returning();
        if (!updated) {
            return res.status(409).json({ success: false, error: { code: 'ALREADY_CLOCKED_OUT', message: 'Attendance record is already closed' } });
        }
        queueActivityLog(authUser.userId, 'attendance_clock_out', 'attendance', 'Clocked out from work', {
            attendanceId: updated.id, branchId: updated.branchId, storeId: updated.storeId,
            workedMinutes, earlyLeaveMinutes,
        }, req, { entity: 'attendance_record', entityId: updated.id, oldData: current, newData: updated }).catch(() => {});
        return res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});

staffRoutes.get('/attendance/staff-options', authenticate, withTenantTx(), authorize('attendance:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = String(req.query.branchId || '');
        if (!branchId) return res.status(400).json({ success: false, error: { code: 'BRANCH_REQUIRED', message: 'branchId is required' } });
        const branch = await db.query.branches.findFirst({ where: and(eq(branches.id, branchId), eq(branches.isActive, true)) });
        if (!branch || !ensureScopeAccess({ tenantId: branch.tenantId, storeId: branch.storeId, branchId: branch.id }, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
        }
        const assignedRows = await db.query.userStores.findMany({ where: eq(userStores.branchId, branchId), columns: { userId: true } });
        const assignedIds = assignedRows.map((row: any) => row.userId);
        const assignmentCondition = assignedIds.length
            ? or(eq(users.branchId, branchId), inArray(users.id, assignedIds))
            : eq(users.branchId, branchId);
        const conditions: any[] = [assignmentCondition, eq(users.isActive, true), eq(users.isSuperAdmin, false)];
        if (branch.tenantId) conditions.push(eq(users.tenantId, branch.tenantId));
        const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
            .from(users).where(and(...conditions)).orderBy(asc(users.name)).limit(500);
        return res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
});

staffRoutes.get('/attendance', authenticate, withTenantTx(), authorize('attendance:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { branchId, userId, status, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
        const authUser = req.authUser!;
        const conditions: any[] = [];
        if (authUser.tenantId && !authUser.isSuperAdmin) conditions.push(eq(attendanceRecords.tenantId, authUser.tenantId));

        if (branchId) {
            const branch = await db.query.branches.findFirst({ where: eq(branches.id, String(branchId)) });
            if (!branch || !ensureScopeAccess({ tenantId: branch.tenantId, storeId: branch.storeId, branchId: branch.id }, req)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
            }
            conditions.push(eq(attendanceRecords.branchId, String(branchId)));
        } else if (!authUser.isSuperAdmin && (authUser.roleLevel ?? 7) > 2) {
            const allowedBranches = req.branchFilter?.branchIds?.length
                ? req.branchFilter.branchIds
                : [authUser.activeBranchId].filter(Boolean);
            if (!allowedBranches.length) return res.json({ success: true, data: [], meta: { page: 1, limit: Number(limit), total: 0, totalPages: 0 } });
            conditions.push(inArray(attendanceRecords.branchId, allowedBranches));
        } else if (authUser.isSuperAdmin && !authUser.tenantId) {
            // Platform accounts must choose one tenant-owned branch; never
            // return cross-tenant employee attendance in one response.
            return res.status(400).json({ success: false, error: { code: 'BRANCH_REQUIRED', message: 'branchId is required for platform accounts' } });
        }
        if (userId) conditions.push(eq(attendanceRecords.userId, String(userId)));
        if (status && ['OPEN', 'CLOSED', 'ADJUSTED', 'VOID'].includes(String(status))) conditions.push(eq(attendanceRecords.status, String(status)));
        if (dateFrom) conditions.push(gte(attendanceRecords.workDate, String(dateFrom)));
        if (dateTo) conditions.push(lte(attendanceRecords.workDate, String(dateTo)));

        const pageNo = Math.max(1, Number(page) || 1);
        const pageSize = Math.min(200, Math.max(1, Number(limit) || 50));
        const where = and(...conditions);
        const [rows, [{ value: total }]] = await Promise.all([
            db.select({
                id: attendanceRecords.id, tenantId: attendanceRecords.tenantId, storeId: attendanceRecords.storeId,
                branchId: attendanceRecords.branchId, branchName: branches.name, userId: attendanceRecords.userId,
                userName: users.name, userEmail: users.email, workDate: attendanceRecords.workDate,
                clockInAt: attendanceRecords.clockInAt, clockOutAt: attendanceRecords.clockOutAt,
                scheduledStartAt: attendanceRecords.scheduledStartAt, scheduledEndAt: attendanceRecords.scheduledEndAt,
                timezone: attendanceRecords.timezone, status: attendanceRecords.status,
                lateMinutes: attendanceRecords.lateMinutes, earlyLeaveMinutes: attendanceRecords.earlyLeaveMinutes,
                workedMinutes: attendanceRecords.workedMinutes, note: attendanceRecords.note,
                adjustmentReason: attendanceRecords.adjustmentReason, updatedAt: attendanceRecords.updatedAt,
            }).from(attendanceRecords)
                .leftJoin(users, eq(attendanceRecords.userId, users.id))
                .leftJoin(branches, eq(attendanceRecords.branchId, branches.id))
                .where(where).orderBy(desc(attendanceRecords.clockInAt)).limit(pageSize).offset((pageNo - 1) * pageSize),
            db.select({ value: count() }).from(attendanceRecords).where(where),
        ]);
        return res.json({ success: true, data: rows, meta: { page: pageNo, limit: pageSize, total, totalPages: Math.ceil(Number(total) / pageSize) } });
    } catch (error) {
        next(error);
    }
});

staffRoutes.post('/attendance/manual', authenticate, withTenantTx(), authorize('attendance:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const userId = String(req.body?.userId || '');
        const branchId = String(req.body?.branchId || '');
        const reason = String(req.body?.reason || '').trim();
        if (!userId || !branchId || reason.length < 3) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'userId, branchId and an adjustment reason are required' } });
        }
        let clockInAt: Date;
        let clockOutAt: Date | null;
        try {
            clockInAt = parseAttendanceDate(req.body?.clockInAt, 'clockInAt');
            clockOutAt = req.body?.clockOutAt ? parseAttendanceDate(req.body.clockOutAt, 'clockOutAt') : null;
        } catch (error: any) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
        }
        if (clockOutAt && clockOutAt <= clockInAt) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'clockOutAt must be after clockInAt' } });
        }
        const scope = await getSchedulableStaff(db, req, userId, branchId);
        if (!scope) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot manage attendance for this staff member and branch' } });
        const tenantId = scope.branch.tenantId || req.authUser!.tenantId;
        if (!tenantId) return res.status(400).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'The selected branch has no tenant' } });
        const schedule = await findEffectiveSchedule(db, userId, branchId, clockInAt);
        const [created] = await db.insert(attendanceRecords).values({
            tenantId,
            storeId: scope.branch.storeId, branchId, userId, clockInAt, clockOutAt,
            ...attendanceValues(clockInAt, clockOutAt, schedule),
            status: clockOutAt ? 'ADJUSTED' : 'OPEN',
            clockInSource: 'MANUAL', clockOutSource: clockOutAt ? 'MANUAL' : null,
            note: req.body?.note ? String(req.body.note).trim().slice(0, 500) : null,
            adjustmentReason: reason.slice(0, 500), createdBy: req.authUser!.userId, updatedBy: req.authUser!.userId,
        }).returning();
        queueActivityLog(req.authUser!.userId, 'attendance_manual_created', 'attendance', `Created attendance for ${scope.target.name}`, {
            attendanceId: created.id, targetUserId: userId, branchId, storeId: scope.branch.storeId, reason,
        }, req, { entity: 'attendance_record', entityId: created.id, newData: created }).catch(() => {});
        return res.status(201).json({ success: true, data: created });
    } catch (error: any) {
        if (error?.code === '23505') return res.status(409).json({ success: false, error: { code: 'OPEN_RECORD_EXISTS', message: 'This employee already has an open attendance record' } });
        next(error);
    }
});

staffRoutes.put('/attendance/:attendanceId', authenticate, withTenantTx(), authorize('attendance:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const current = await db.query.attendanceRecords.findFirst({ where: eq(attendanceRecords.id, req.params.attendanceId) });
        if (!current || current.status === 'VOID') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Attendance record not found' } });
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 3) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'An adjustment reason is required' } });
        const scope = await getSchedulableStaff(db, req, current.userId, current.branchId);
        if (!scope) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot edit this attendance record' } });
        let clockInAt: Date;
        let clockOutAt: Date | null;
        try {
            clockInAt = parseAttendanceDate(req.body?.clockInAt || current.clockInAt, 'clockInAt');
            clockOutAt = req.body?.clockOutAt === null ? null : parseAttendanceDate(req.body?.clockOutAt || current.clockOutAt, 'clockOutAt');
        } catch (error: any) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
        }
        if (clockOutAt && clockOutAt <= clockInAt) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'clockOutAt must be after clockInAt' } });
        const schedule = await findEffectiveSchedule(db, current.userId, current.branchId, clockInAt);
        const [updated] = await db.update(attendanceRecords).set({
            clockInAt, clockOutAt, ...attendanceValues(clockInAt, clockOutAt, schedule),
            status: clockOutAt ? 'ADJUSTED' : 'OPEN', clockInSource: 'MANUAL', clockOutSource: clockOutAt ? 'MANUAL' : null,
            note: req.body?.note !== undefined ? String(req.body.note || '').trim().slice(0, 500) || null : current.note,
            adjustmentReason: reason.slice(0, 500), updatedBy: req.authUser!.userId, updatedAt: new Date(),
        }).where(eq(attendanceRecords.id, current.id)).returning();
        queueActivityLog(req.authUser!.userId, 'attendance_adjusted', 'attendance', `Adjusted attendance for ${scope.target.name}`, {
            attendanceId: updated.id, targetUserId: current.userId, branchId: current.branchId, storeId: current.storeId, reason,
        }, req, { entity: 'attendance_record', entityId: updated.id, oldData: current, newData: updated }).catch(() => {});
        return res.json({ success: true, data: updated });
    } catch (error: any) {
        if (error?.code === '23505') return res.status(409).json({ success: false, error: { code: 'OPEN_RECORD_EXISTS', message: 'This employee already has an open attendance record' } });
        next(error);
    }
});

staffRoutes.post('/attendance/:attendanceId/void', authenticate, withTenantTx(), authorize('attendance:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const current = await db.query.attendanceRecords.findFirst({ where: eq(attendanceRecords.id, req.params.attendanceId) });
        if (!current || current.status === 'VOID') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Attendance record not found' } });
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 3) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A void reason is required' } });
        const scope = await getSchedulableStaff(db, req, current.userId, current.branchId);
        if (!scope) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot void this attendance record' } });
        const [updated] = await db.update(attendanceRecords).set({
            status: 'VOID', adjustmentReason: reason.slice(0, 500), updatedBy: req.authUser!.userId, updatedAt: new Date(),
        }).where(eq(attendanceRecords.id, current.id)).returning();
        queueActivityLog(req.authUser!.userId, 'attendance_voided', 'attendance', `Voided attendance for ${scope.target.name}`, {
            attendanceId: updated.id, targetUserId: current.userId, branchId: current.branchId, storeId: current.storeId, reason,
        }, req, { entity: 'attendance_record', entityId: updated.id, oldData: current, newData: updated }).catch(() => {});
        return res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});

// Get staff by ID
staffRoutes.get('/:id', authenticate, withTenantTx(), authorize('staff:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser;
        const isSuperAdmin = authUser?.isSuperAdmin;

        // Tenant-scoped staff lookup
        const tenantId = req.authUser?.tenantId;
        const staffConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !isSuperAdmin) {
            staffConds.push(eq(users.tenantId, tenantId));
        }

        const staff = await db.query.users.findFirst({
            where: and(...staffConds),
            columns: { password: false, twoFASecret: false },
            with: { branch: true, roleRelation: true },
        });

        if (!staff) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff not found or no access' } });
            return;
        }

        // Non-superadmins cannot view super_admin or admin-level users (role level ≤ 2)
        if (!isSuperAdmin && (staff.isSuperAdmin || (staff.roleRelation?.level ?? 7) <= 2)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot view this user' } });
            return;
        }

        // Branch/store-scoped staff can only view users within their own
        // scope. ensureScopeAccess checks branchId first (narrower), falling
        // back to storeId — this used to check ONLY store membership, so any
        // staff member whose access was actually restricted to one specific
        // branch (via `filter.branchIds`, e.g. a branch supervisor) could
        // still look up any staff record anywhere else in the same store,
        // across every sibling branch. Tenant-wide admins (roleLevel <= 2)
        // are exempt inside ensureScopeAccess itself, same as everywhere else.
        if (!ensureScopeAccess({ branchId: staff.branchId, storeId: staff.storeId, tenantId: staff.tenantId }, req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this staff member' } });
            return;
        }

        // Strip isSuperAdmin from response
        const { isSuperAdmin: _isSA, ...staffData } = staff;
        res.json({ success: true, data: staffData });
    } catch (error) {
        next(error);
    }
});

// Create staff
staffRoutes.post('/', authenticate, withTenantTx(), branchFilter(), authorize('staff:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { email, password, name, phone, role, branchId, storeId, storeIds, storeScope, defaultStoreId, roleId, isActive, permissions, makerEnabled, checkerEnabled, requiresShift } = req.body;
        const authUser = req.authUser;

        if (!email || !password || !name) {
            res.status(400).json({ success: false, error: { code: 'VAL_001', message: 'Email, password, and name are required' } });
            return;
        }
        // Login always looks up by email.toLowerCase() (auth.service.ts) — storing
        // the raw-case value here made any mixed-case staff email permanently
        // unable to log in.
        const normalizedEmail = String(email).toLowerCase().trim();
        if (!roleId && !role) {
            res.status(400).json({ success: false, error: { code: 'VAL_003', message: 'roleId or role is required' } });
            return;
        }
        for (const [key, value] of Object.entries({ makerEnabled, checkerEnabled, requiresShift })) {
            if (value !== undefined && typeof value !== 'boolean') {
                res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `${key} must be a boolean` } });
                return;
            }
        }

        // Resolve the target role to an actual, visible-to-this-caller `roles`
        // row — never grant permissions from a bare name string alone. See
        // resolveAssignableRole() for the visibility/precedence rules. This
        // also IS the privilege ladder check now: a caller can only assign a
        // role strictly less privileged than their own.
        const tenantId = req.authUser?.tenantId || req.user?.tenantId || null;
        let resolvedRole: { id: string; name: string; roleLevel: number } | null = null;
        if (!authUser?.isSuperAdmin) {
            resolvedRole = await resolveAssignableRole(db, {
                roleId: roleId || undefined,
                roleName: role || undefined,
                callerTenantId: tenantId,
                callerBranchId: authUser?.activeBranchId,
                callerRoleLevel: authUser?.roleLevel ?? 7,
                callerIsSuperAdmin: false,
                callerPermissions: authUser?.permissions || [],
            });
            if (!resolvedRole) {
                res.status(400).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'No such role is available to assign — ask an admin to create it first' } });
                return;
            }
            if (resolvedRole.roleLevel <= (authUser?.roleLevel ?? 7)) {
                res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot create staff with equal or higher privileges than your own' } });
                return;
            }
        } else if (roleId || role) {
            resolvedRole = await resolveAssignableRole(db, {
                roleId: roleId || undefined,
                roleName: role || undefined,
                callerTenantId: tenantId,
                callerBranchId: authUser?.activeBranchId,
                callerRoleLevel: 1,
                callerIsSuperAdmin: true,
                callerPermissions: authUser?.permissions || [],
            });
            if (!resolvedRole) {
                res.status(400).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'No such role found' } });
                return;
            }
        }

        // Check if email exists (tenant-scoped for multi-tenancy)
        const emailConds: any[] = [eq(users.email, normalizedEmail)];
        if (tenantId) emailConds.push(eq(users.tenantId, tenantId));
        const existing = await db.query.users.findFirst({ where: and(...emailConds) });
        if (existing) {
            res.status(400).json({ success: false, error: { code: 'VAL_002', message: 'Email already exists' } });
            return;
        }

        const hashedPassword = await argon2.hash(password);

        const sanitizedBranchId = branchId && branchId.trim() !== '' ? branchId : req.authUser?.activeBranchId || (req.user as any)?.branchId || undefined;
        // Validate branchId is within user's accessible scope
        const staffFilter = req.branchFilter;
        if (staffFilter && sanitizedBranchId && !req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) > 2) {
            if (!staffFilter.branchIds.includes(sanitizedBranchId)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot create staff in a branch outside your scope' } });
            }
        }

        // Store scope: 'branch' means branch-wide access (no userStores rows —
        // matches how a level 3-4 HQ user with zero userStores rows already
        // gets branch-wide visibility, just made an explicit choice instead of
        // an accident of whether anyone called the store-assignment endpoints).
        // 'stores' (default when storeIds/storeId given) assigns one or more
        // specific stores. Falls back to the previous single-store resolution
        // chain when neither storeIds nor storeScope is given, for compatibility.
        //
        // A branch belongs to exactly one store now (branches.storeId, NOT
        // NULL) — so the "which store does this branch belong to" lookup is a
        // direct FK read, not a reverse search across candidate stores.
        const explicitStoreIds: string[] = Array.isArray(storeIds) && storeIds.length > 0
            ? storeIds.map(String)
            : (storeId && String(storeId).trim() !== '' ? [String(storeId)] : []);

        let resolvedStoreIds = explicitStoreIds;
        if (storeScope !== 'branch' && resolvedStoreIds.length === 0) {
            // Legacy single-store fallback: creator's own active store > the target branch's owning store.
            let fallbackStoreId = authUser?.activeStoreId || undefined;
            if (!fallbackStoreId && sanitizedBranchId) {
                const owningBranch = await db.query.branches.findFirst({
                    where: eq(branches.id, sanitizedBranchId),
                    columns: { storeId: true },
                });
                if (owningBranch) fallbackStoreId = owningBranch.storeId;
            }
            if (fallbackStoreId) resolvedStoreIds = [fallbackStoreId];
        }

        // Validate every explicitly-requested store belongs to this tenant.
        if (resolvedStoreIds.length > 0) {
            const validConds: any[] = [inArray(stores.id, resolvedStoreIds)];
            if (tenantId) validConds.push(eq(stores.tenantId, tenantId));
            const validStores = await db.query.stores.findMany({ where: and(...validConds), columns: { id: true } });
            if (validStores.length !== resolvedStoreIds.length) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_001', message: 'One or more storeIds do not belong to your tenant' } });
            }
        }

        // Cannot grant a permission you don't personally hold — without this,
        // any caller with staff:create could hand a brand-new account
        // permissions: ["*"] (or any other permission) regardless of the
        // resolved role, since this array is merged into the user's effective
        // permission set at auth-load time. Same guard as PUT /:id/permissions.
        const rawPermissions = Array.isArray(permissions) ? permissions.filter((p: unknown) => typeof p === 'string') : [];
        const scopedCreatePermissions = req.authUser?.isSuperAdmin || (req.authUser?.permissions || []).includes('*')
            ? rawPermissions
            : rawPermissions.filter((p: string) => (req.authUser?.permissions || []).includes(p));

        const [staff] = await db.insert(users).values({
            tenantId,
            email: normalizedEmail,
            password: hashedPassword,
            name,
            phone: phone || null,
            role: resolvedRole?.name || 'staff',
            branchId: sanitizedBranchId,
            roleId: resolvedRole?.id,
            isActive: isActive !== undefined ? isActive : true,
            makerEnabled: makerEnabled !== undefined ? makerEnabled : true,
            checkerEnabled: checkerEnabled !== undefined ? checkerEnabled : false,
            requiresShift: requiresShift !== undefined ? requiresShift : true,
            permissions: scopedCreatePermissions,
        }).returning({
            id: users.id,
            tenantId: users.tenantId,
            email: users.email,
            name: users.name,
            phone: users.phone,
            avatar: users.avatar,
            role: users.role,
            roleId: users.roleId,
            branchId: users.branchId,
            permissions: users.permissions,
            isActive: users.isActive,
            makerEnabled: users.makerEnabled,
            checkerEnabled: users.checkerEnabled,
            requiresShift: users.requiresShift,
            isSuperAdmin: users.isSuperAdmin,
            emailVerified: users.emailVerified,
            twoFAEnabled: users.twoFAEnabled,
            lastLoginAt: users.lastLoginAt,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
        });

        if (resolvedStoreIds.length > 0) {
            // Narrow to the target branch only for the store that branch
            // actually belongs to — a branch belongs to exactly one store, so
            // that grant is "just this branch"; any other store in
            // resolvedStoreIds is a separate whole-store grant.
            let owningStoreId: string | undefined;
            if (sanitizedBranchId) {
                const owningBranch = await db.query.branches.findFirst({
                    where: eq(branches.id, sanitizedBranchId),
                    columns: { storeId: true },
                });
                owningStoreId = owningBranch?.storeId;
            }
            await assignUserToStores(db, {
                userId: staff.id,
                tenantId: tenantId || null,
                assignments: resolvedStoreIds.map(sId => ({
                    storeId: sId,
                    branchId: sId === owningStoreId ? sanitizedBranchId : null,
                })),
                defaultStoreId: defaultStoreId || resolvedStoreIds[0],
                assignedBy: req.user?.userId,
            });
        }

        queueActivityLog(req.authUser?.userId || req.user?.userId || '', 'staff_created', 'staff', 'Created staff ' + staff.name, { targetUserId: staff.id, role: staff.role }, req).catch(() => {});
        res.status(201).json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
});

// Update staff
staffRoutes.put('/:id', authenticate, withTenantTx(), authorize('staff:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { password, id, _id, createdAt, updatedAt, makerEnabled: _makerEnabled, checkerEnabled: _checkerEnabled, requiresShift: _requiresShift, ...updateData } = req.body;

        const tenantId = req.authUser?.tenantId;
        const targetConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            targetConds.push(eq(users.tenantId, tenantId));
        }
        const target = await db.query.users.findFirst({ where: and(...targetConds), with: { roleRelation: { columns: { level: true } } } });
        if (!target || !canManageStaffRecord(req, target)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff not found or no access' } });
        }

        if (password) {
            updateData.password = await argon2.hash(password);
        }
        if (updateData.email) {
            updateData.email = String(updateData.email).toLowerCase().trim();
        }

        // Remove empty string fields
        if (updateData.roleId === '' || updateData.roleId === null) delete updateData.roleId;
        if (updateData.branchId === '' || updateData.branchId === null) delete updateData.branchId;
        if (updateData.storeId === '' || updateData.storeId === null) delete updateData.storeId;

        if (updateData.roleId !== undefined || updateData.role) {
            // Resolve to an actual, visible-to-this-caller `roles` row —
            // never accept a bare role-name string on its own (see
            // resolveAssignableRole for why: that used to let permissions
            // materialize from a name with no corresponding role ever
            // created for the tenant).
            const resolved = await resolveAssignableRole(db, {
                roleId: updateData.roleId || undefined,
                roleName: updateData.role || undefined,
                callerTenantId: target.tenantId,
                callerBranchId: req.authUser?.activeBranchId,
                callerRoleLevel: req.authUser?.roleLevel ?? 7,
                callerIsSuperAdmin: req.authUser?.isSuperAdmin ?? false,
                callerPermissions: req.authUser?.permissions || [],
            });
            if (!resolved) {
                return res.status(400).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'No such role is available to assign' } });
            }
            if (!req.authUser?.isSuperAdmin && resolved.roleLevel <= (req.authUser?.roleLevel ?? 7)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot assign equal or higher role' } });
            }
            updateData.role = resolved.name;
            updateData.roleId = resolved.id;
        }

        if (updateData.branchId) {
            const branchConds: any[] = [eq(branches.id, updateData.branchId)];
            if (target.tenantId && !req.authUser?.isSuperAdmin) branchConds.push(eq(branches.tenantId, target.tenantId));
            const branch = await db.query.branches.findFirst({ where: and(...branchConds), columns: { id: true, tenantId: true } });
            if (!branch || !ensureScopeAccess({ tenantId: branch.tenantId, branchId: branch.id }, req)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Branch not found or outside your scope' } });
            }
        }

        // storeId had no validation at all — a caller with staff:update could
        // repoint a staff member's store anchor to any store UUID, including
        // one belonging to a different tenant, corrupting their scope
        // resolution. Same check shape as branchId above.
        if (updateData.storeId) {
            const storeConds: any[] = [eq(stores.id, updateData.storeId)];
            if (target.tenantId && !req.authUser?.isSuperAdmin) storeConds.push(eq(stores.tenantId, target.tenantId));
            const store = await db.query.stores.findFirst({ where: and(...storeConds), columns: { id: true, tenantId: true } });
            if (!store || !ensureScopeAccess({ tenantId: store.tenantId, storeId: store.id }, req)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Store not found or outside your scope' } });
            }
        }

        // Cannot grant a permission you don't personally hold — same escalation
        // risk and fix as staff create above.
        if (updateData.permissions !== undefined) {
            const rawUpdatePermissions = Array.isArray(updateData.permissions)
                ? updateData.permissions.filter((p: unknown) => typeof p === 'string')
                : [];
            updateData.permissions = req.authUser?.isSuperAdmin || (req.authUser?.permissions || []).includes('*')
                ? rawUpdatePermissions
                : rawUpdatePermissions.filter((p: string) => (req.authUser?.permissions || []).includes(p));
        }

        updateData.updatedAt = new Date();

        // Never allow changing tenantId
        delete updateData.tenantId;
        delete updateData.isSuperAdmin;

        const [staff] = await db.update(users)
            .set(updateData)
            .where(and(...targetConds))
            .returning({
                id: users.id,
                tenantId: users.tenantId,
                email: users.email,
                name: users.name,
                phone: users.phone,
                avatar: users.avatar,
                role: users.role,
                roleId: users.roleId,
                branchId: users.branchId,
                permissions: users.permissions,
                isActive: users.isActive,
                isSuperAdmin: users.isSuperAdmin,
                emailVerified: users.emailVerified,
                twoFAEnabled: users.twoFAEnabled,
                lastLoginAt: users.lastLoginAt,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt,
            });

        await invalidateStaffAuthCaches(req.params.id, target.tenantId);
        queueActivityLog(req.authUser?.userId || req.user?.userId || '', 'staff_updated', 'staff', 'Updated staff ' + staff.name, { targetUserId: staff.id, role: staff.role }, req).catch(() => {});
        res.json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
});

// Delete staff (soft delete)
staffRoutes.delete('/:id', authenticate, withTenantTx(), authorize('staff:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // Tenant-scoped delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            delConds.push(eq(users.tenantId, tenantId));
        }

        // This used to go straight to the UPDATE below with only a tenant
        // filter — no role-ladder check, no branch/store scope check, not
        // even a self-delete guard. Any user holding staff:delete could
        // deactivate ANY staff account anywhere in the tenant, including a
        // higher-privileged account or one at an unrelated branch. Same
        // fetch-then-check pattern as PUT /:id above.
        const target = await db.query.users.findFirst({ where: and(...delConds), with: { roleRelation: { columns: { level: true } } } });
        if (!target || !canManageStaffRecord(req, target)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff not found or no access' } });
        }

        await db.update(users)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(users.id, target.id));

        await invalidateStaffAuthCaches(target.id, target.tenantId);
        res.json({ success: true, message: 'Staff deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// Get staff member permissions (uses staff:read instead of users:read)
staffRoutes.get('/:id/permissions', authenticate, withTenantTx(), authorize('staff:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const userConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) userConds.push(eq(users.tenantId, tenantId));
        const user = await db.query.users.findFirst({
            where: and(...userConds),
            with: { roleRelation: true },
        });

        if (!user) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Staff not found' } });
            return;
        }
        if (!canViewStaffRecord(req, user)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot view this staff permissions' } });
        }

        const legacyPermissions = [
            { module: 'dashboard', label: 'ແຜງຄວບຄຸມ', permissions: [{ value: 'dashboard:view', label: 'ເບິ່ງແຜງຄວບຄຸມ' }] },
            { module: 'pos', label: 'ຂາຍໜ້າຮ້ານ', permissions: [
                { value: 'pos:view', label: 'ເບິ່ງໜ້າຂາຍ' },
                { value: 'pos:sell', label: 'ຂາຍສິນຄ້າ' },
                { value: 'pos:discount', label: 'ໃຫ້ສ່ວນຫຼຸດ' },
                { value: 'pos:void', label: 'ຍົກເລີກ' },
                { value: 'pos:refund', label: 'ຄືນເງິນ' },
            ]},
            { module: 'sales', label: 'ການຂາຍ', permissions: [
                { value: 'sales:view', label: 'ເບິ່ງ' },
                { value: 'sales:create', label: 'ສ້າງ' },
                { value: 'sales:update', label: 'ແກ້ໄຂ' },
                { value: 'sales:delete', label: 'ລຶບ' },
            ]},
            { module: 'products', label: 'ສິນຄ້າ', permissions: [
                { value: 'products:view', label: 'ເບິ່ງ' },
                { value: 'products:create', label: 'ສ້າງ' },
                { value: 'products:update', label: 'ແກ້ໄຂ' },
                { value: 'products:delete', label: 'ລຶບ' },
            ]},
            { module: 'inventory', label: 'ສາງ', permissions: [
                { value: 'inventory:view', label: 'ເບິ່ງ' },
                { value: 'inventory:update', label: 'ແກ້ໄຂ' },
                { value: 'inventory:adjust', label: 'ປັບສະຕ໋ອກ' },
            ]},
            { module: 'customers', label: 'ລູກຄ້າ', permissions: [
                { value: 'customers:view', label: 'ເບິ່ງ' },
                { value: 'customers:create', label: 'ສ້າງ' },
                { value: 'customers:update', label: 'ແກ້ໄຂ' },
                { value: 'customers:delete', label: 'ລຶບ' },
            ]},
            { module: 'staff', label: 'ພະນັກງານ', permissions: [
                { value: 'staff:view', label: 'ເບິ່ງ' },
                { value: 'staff:create', label: 'ສ້າງ' },
                { value: 'staff:update', label: 'ແກ້ໄຂ' },
                { value: 'staff:delete', label: 'ລຶບ' },
            ]},
            { module: 'reports', label: 'ລາຍງານ', permissions: [
                { value: 'reports:view', label: 'ເບິ່ງ' },
                { value: 'reports:export', label: 'ສົ່ງອອກ' },
            ]},
            { module: 'payroll', label: 'ເງິນເດືອນ ແລະ ບັນຊີ', permissions: [
                { value: 'payroll:view', label: 'ເບິ່ງ Payroll' },
                { value: 'payroll:view_detail', label: 'ເບິ່ງລາຍລະອຽດເງິນເດືອນພະນັກງານ' },
                { value: 'payroll:view_self', label: 'ເບິ່ງໃບເງິນເດືອນຂອງຕົນເອງ' },
                { value: 'payroll:compensation', label: 'ກຳນົດຄ່າແຮງງານ' },
                { value: 'payroll:policy', label: 'ກຳນົດ Tax/Social ແລະ Work/OT Policy (Owner)' },
                { value: 'payroll:manage', label: 'ສ້າງ ແລະ ຄຳນວນ Payroll' },
                { value: 'payroll:approve', label: 'ອະນຸມັດ Payroll' },
                { value: 'payroll:pay', label: 'ຈ່າຍ Payroll' },
                { value: 'payroll:export', label: 'Export Payroll' },
            ]},
            { module: 'printing', label: 'Printing', permissions: [
                { value: 'printing:view', label: 'View print jobs' },
                { value: 'printing:receipt', label: 'Print receipts' },
                { value: 'printing:label', label: 'Print barcode labels' },
                { value: 'printing:reprint', label: 'Retry and reprint jobs' },
                { value: 'printing:manage', label: 'Manage printers' },
            ]},
            { module: 'settings', label: 'ຕັ້ງຄ່າ', permissions: [
                { value: 'settings:view', label: 'ເບິ່ງ' },
                { value: 'settings:update', label: 'ແກ້ໄຂ' },
            ]},
        ];

        // Use the same editable catalog as the role editor. The inline list
        // above remains only as a migration fallback for databases that have
        // not been seeded yet; it must never be the primary source of truth.
        const catalogGroups = await db.query.permissionGroups.findMany({
            where: eq(permissionGroups.isActive, true),
            orderBy: asc(permissionGroups.order),
            with: {
                permissions: {
                    where: eq(permissionCatalog.isActive, true),
                    orderBy: asc(permissionCatalog.order),
                },
            },
        });
        const canonicalKeys = new Set(Object.values(getGroupedPermissionKeys()).flat());
        const allPermissions = catalogGroups.length > 0
            ? catalogGroups.map(group => ({
                module: group.key,
                label: group.label,
                permissions: group.permissions.map(permission => ({
                    value: permission.key,
                    label: permission.label,
                })),
            }))
            : legacyPermissions
                .map(group => ({ ...group, permissions: group.permissions.filter(permission => canonicalKeys.has(permission.value)) }))
                .filter(group => group.permissions.length > 0);

        // The editable DB catalog may lag behind newly deployed permission
        // keys. Merge canonical fallback groups instead of hiding those keys
        // until someone reruns a destructive seed.
        const listedKeys = new Set(allPermissions.flatMap(group => group.permissions.map(permission => permission.value)));
        for (const fallbackGroup of legacyPermissions) {
            const missing = fallbackGroup.permissions.filter(permission => canonicalKeys.has(permission.value) && !listedKeys.has(permission.value));
            if (!missing.length) continue;
            const existingGroup = allPermissions.find(group => group.module === fallbackGroup.module);
            if (existingGroup) existingGroup.permissions.push(...missing);
            else allPermissions.push({ ...fallbackGroup, permissions: missing });
            missing.forEach(permission => listedKeys.add(permission.value));
        }

        res.json({
            success: true,
            data: {
                user: { id: user.id, name: user.name, email: user.email, isSuperAdmin: user.isSuperAdmin },
                rolePermissions: user.roleRelation?.permissions || [],
                userPermissions: user.permissions || [],
                role: user.roleRelation,
                allPermissions,
            }
        });
    } catch (error) {
        next(error);
    }
});

// Update staff member permissions (uses staff:update instead of users:update)
staffRoutes.put('/:id/permissions', authenticate, withTenantTx(), authorize('staff:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Permissions must be an array' } });
            return;
        }

        const validPermissions = permissions.filter((p: unknown) => typeof p === 'string');
        const catalogRows = await db.query.permissions.findMany({
            where: eq(permissionCatalog.isActive, true),
            columns: { key: true },
        });
        const allowedPermissionKeys = new Set([
            ...getAllPermissionKeys(),
            ...catalogRows.map(row => row.key),
        ]);
        const invalidPermissions = validPermissions.filter(permission => !allowedPermissionKeys.has(permission));
        if (invalidPermissions.length > 0) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PERMISSIONS',
                    message: `Unknown permission: ${invalidPermissions[0]}`,
                    details: { invalidPermissions },
                },
            });
            return;
        }

        // Tenant + role scope: target user must belong to caller's tenant and be lower privilege
        const tenantId = req.authUser?.tenantId;
        const targetConds: any[] = [eq(users.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) targetConds.push(eq(users.tenantId, tenantId));
        const targetUser = await db.query.users.findFirst({
            where: and(...targetConds),
            columns: { id: true, tenantId: true, role: true, isSuperAdmin: true, branchId: true, storeId: true, permissions: true },
            with: { roleRelation: { columns: { level: true } } },
        });
        if (!targetUser || !canManageStaffRecord(req, targetUser)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify this user permissions' } });
            return;
        }

        // Scope constraint: non-superadmin callers can only grant permissions they themselves hold
        let scopedPermissions = validPermissions;
        if (!req.authUser!.isSuperAdmin) {
            let callerRolePerms: string[] = [];
            if (req.authUser!.role) {
                const roleConds: any[] = [eq(roles.name, req.authUser!.role)];
                if (req.authUser!.tenantId) roleConds.push(or(eq(roles.tenantId, req.authUser!.tenantId), isNull(roles.tenantId)));
                const callerRole = await db.query.roles.findFirst({
                    where: and(...roleConds),
                    columns: { permissions: true },
                });
                callerRolePerms = (callerRole?.permissions as string[]) ?? [];
            }
            const callerEffectivePerms = new Set([
                ...(req.authUser!.permissions as string[] || []),
                ...callerRolePerms,
            ]);
            scopedPermissions = validPermissions.filter((p: string) => callerEffectivePerms.has(p));
        }

        const [user] = await db.update(users)
            .set({ permissions: scopedPermissions, updatedAt: new Date() })
            .where(and(...targetConds))
            .returning({
                id: users.id,
                tenantId: users.tenantId,
                email: users.email,
                name: users.name,
                role: users.role,
                permissions: users.permissions,
                isActive: users.isActive,
                updatedAt: users.updatedAt,
            });

        await invalidateStaffAuthCaches(req.params.id, targetUser.tenantId);
        const previousPermissions = Array.isArray(targetUser.permissions) ? targetUser.permissions : [];
        const addedPermissions = scopedPermissions.filter(permission => !previousPermissions.includes(permission));
        const removedPermissions = previousPermissions.filter(permission => !scopedPermissions.includes(permission));
        queueActivityLog(
            req.authUser?.userId || req.user?.userId || '',
            'staff_permissions_updated',
            'staff',
            `Updated permissions for ${user?.name || req.params.id}`,
            {
                targetUserId: req.params.id,
                addedPermissions,
                removedPermissions,
                permissionCount: scopedPermissions.length,
                branchId: targetUser.branchId,
                storeId: targetUser.storeId,
            },
            req,
        ).catch(() => {});
        res.json({ success: true, data: user, message: 'Staff permissions updated successfully' });
    } catch (error) {
        next(error);
    }
});
