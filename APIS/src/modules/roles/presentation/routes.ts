// ═══════════════════════════════════════════════════════════════════════════
// Roles Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, ROLE_LEVELS, invalidateUserStoreCache } from '@/infrastructure/http/middleware/auth.middleware';
import { permissionsToMask, maskToStrings, getAllPermissionKeys, getGroupedPermissionKeys } from '@/infrastructure/permissions';
import { invalidateAllTenantPermissions, invalidateUserPermissions } from '@/infrastructure/services/permission.service';
import { queueActivityLog } from '@/infrastructure/helpers/activity-log.helper';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { roles, users, permissionGroups, permissions, branches } from '@/db/schema/tables';
import { eq, and, or, ilike, gte, isNull, desc, count, asc } from 'drizzle-orm';

export const roleRoutes = Router();

export function grantablePermissionCatalog(req: any, grouped: Record<string, any>) {
    if (req.authUser?.isSuperAdmin || (req.authUser?.permissions || []).includes('*')) {
        const all = Object.values(grouped).flatMap((group: any) => group.permissions.map((permission: any) => permission.key));
        return { all, grouped, excludedCount: 0 };
    }
    const held = new Set(req.authUser?.permissions || []);
    let excludedCount = 0;
    const filtered: Record<string, any> = {};
    for (const [key, group] of Object.entries(grouped)) {
        const allowed = (group as any).permissions.filter((permission: any) => held.has(permission.key));
        excludedCount += (group as any).permissions.length - allowed.length;
        if (allowed.length) filtered[key] = { ...(group as any), permissions: allowed };
    }
    const all = Object.values(filtered).flatMap((group: any) => group.permissions.map((permission: any) => permission.key));
    return { all, grouped: filtered, excludedCount };
}

async function loadActivePermissionKeys(): Promise<Set<string>> {
    // permissions is a global system catalog (no tenantId column) — not tenant-scoped.
    // eslint-disable-next-line no-restricted-syntax -- permissions is a global system catalog (no tenantId column)
    const rows = await globalDb.query.permissions.findMany({
        where: eq(permissions.isActive, true),
        columns: { key: true },
    });
    // The permission_groups/permissions tables exist for an editable-catalog
    // UI but are never actually seeded in this deployment — if the DB table
    // is empty, falling back to it as "zero valid permissions" rejects every
    // role create/update that includes any permission at all, which is
    // exactly what was happening (confirmed via QA: POST /roles with
    // permissions:["products:view"] returned INVALID_PERMISSIONS). Union
    // with the hardcoded LEGACY_PERM_MAP catalog, which is guaranteed to be
    // in sync with what authorize() actually checks.
    return new Set([...rows.map(row => row.key), ...getAllPermissionKeys()]);
}

// ═══════════════════════════════════════════════════════════════════════════
// LIST OF AVAILABLE PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// GET ALL AVAILABLE PERMISSIONS — DB-driven, falls back to hardcoded list
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.get('/permissions', authenticate, withTenantTx(), authorize('roles:read'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        // Try to load from DB (permission_groups + permissions tables)
        const groups = await db.query.permissionGroups.findMany({
            where: eq(permissionGroups.isActive, true),
            orderBy: asc(permissionGroups.order),
            with: {
                permissions: {
                    where: eq(permissions.isActive, true),
                    orderBy: asc(permissions.order),
                },
            },
        });

        if (groups.length > 0) {
            const grouped: Record<string, { key: string; label: string; icon?: string; permissions: { key: string; label: string }[] }> = {};
            const all: string[] = [];

            for (const group of groups) {
                grouped[group.key] = {
                    key: group.key,
                    label: group.label,
                    icon: group.icon ?? undefined,
                    permissions: group.permissions.map(p => ({ key: p.key, label: p.label })),
                };
                all.push(...group.permissions.map(p => p.key));
            }

            // A non-empty editable catalog may still lag behind permission
            // keys introduced by a newer deployment. Merge missing canonical
            // keys so Super Admin can grant payroll permissions immediately
            // without rerunning or resetting production seed data.
            const listed = new Set(all);
            for (const [module, keys] of Object.entries(getGroupedPermissionKeys())) {
                const missing = keys.filter(key => !listed.has(key));
                if (!missing.length) continue;
                grouped[module] ??= { key: module, label: module, permissions: [] };
                grouped[module].permissions.push(...missing.map(key => ({ key, label: key })));
                all.push(...missing);
                missing.forEach(key => listed.add(key));
            }

            return res.json({ success: true, data: grantablePermissionCatalog(req, grouped) });
        }

        // DB catalog is unseeded — fall back to the hardcoded LEGACY_PERM_MAP
        // catalog instead of an empty list (see loadActivePermissionKeys for
        // why this fallback is load-bearing, not cosmetic: the role editor's
        // checkbox list would otherwise render with nothing to select).
        const fallbackGrouped = getGroupedPermissionKeys();
        const grouped: Record<string, { key: string; label: string; permissions: { key: string; label: string }[] }> = {};
        for (const [module, keys] of Object.entries(fallbackGrouped)) {
            grouped[module] = { key: module, label: module, permissions: keys.map(k => ({ key: k, label: k })) };
        }
        res.json({ success: true, data: grantablePermissionCatalog(req, grouped) });
    } catch (error) {
        console.error('Get permissions error:', error);
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to get permissions' } });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ROLE LEVELS — returns the same hierarchy used by auth.middleware.ts.
// Keeping this catalog server-owned prevents the UI from offering a role
// scope that the authorization layer interprets differently.
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.get('/levels', authenticate, withTenantTx(), async (req, res) => {
    const authUser = req.authUser!;
    const userLevel = authUser.isSuperAdmin ? 1 : (authUser.roleLevel ?? 7);

    const levels = [
        { level: 1, name: 'system_admin', displayName: 'System Admin', description: 'Full platform access across all tenants' },
        { level: 2, name: 'merchant_owner', displayName: 'Merchant Owner', description: 'Full control of the tenant and all stores/branches' },
        { level: 3, name: 'merchant_manager', displayName: 'Merchant Manager', description: 'Management across the assigned store tree' },
        { level: 4, name: 'supervisor', displayName: 'Supervisor', description: 'Operations within the assigned branch tree' },
        { level: 5, name: 'cashier', displayName: 'Cashier', description: 'POS and assigned branch operations' },
        { level: 6, name: 'specialist', displayName: 'Specialist', description: 'Inventory, kitchen, waiter, or other specialist operations' },
        { level: 7, name: 'custom', displayName: 'Custom Staff Role', description: 'Least-privileged custom role; scope is limited by permissions and assignments' },
    ].filter(l => l.level >= userLevel); // users cannot assign roles above their own level

    res.json({ success: true, data: levels });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL ROLES
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.get('/', authenticate, withTenantTx(), authorize('roles:read'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { page = '1', limit = '50', search } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const authUser = req.authUser!;
        const isSuperAdmin = authUser.isSuperAdmin;

        const conditions: any[] = [];
        // BE-60: Tenant-scoped role list
        const tenantId = req.authUser?.tenantId;
        if (!isSuperAdmin && tenantId) {
            // Show own tenant roles + platform template roles (tenantId=null)
            conditions.push(or(eq(roles.tenantId, tenantId), isNull(roles.tenantId)));
        }

        // Branch-scoped visibility:
        // HQ / tenant admins (roleLevel ≤ 4) see every role in the tenant.
        // Branch-level users (roleLevel ≥ 5) see only tenant-wide templates
        // (branchId IS NULL) plus roles created for their own branch.
        const roleLevel = authUser.roleLevel ?? 7;
        const myBranchId = authUser.activeBranchId;
        if (!isSuperAdmin && roleLevel >= 4 && myBranchId) {
            conditions.push(or(isNull(roles.branchId), eq(roles.branchId, myBranchId)));
        }

        // Ladder rule: never show a role more privileged than the caller's own
        // level, regardless of tier. The tenantId=null OR-clause above exists
        // to surface legitimate platform templates (cashier, staff, etc.), but
        // without this it also surfaced super_admin/admin's own global template
        // to every tenant-scoped caller — including store_owner. Reads the
        // DB `level` column directly now (works for custom roles too) instead
        // of excluding a precomputed list of built-in NAMES from ROLE_LEVELS,
        // which could never match/exclude a custom role in the first place.
        if (!isSuperAdmin) {
            conditions.push(gte(roles.level, roleLevel));
        }
        if (search) {
            conditions.push(or(ilike(roles.name, `%${search}%`), ilike(roles.displayName, `%${search}%`)));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [roleRows, [{ value: total }]] = await Promise.all([
            db.query.roles.findMany({
                where: whereClause,
                offset: skip,
                limit: parseInt(limit as string),
                orderBy: desc(roles.createdAt),
                with: { users: true },
            }),
            db.select({ value: count() }).from(roles).where(whereClause),
        ]);

        // Map to include _count for backward compatibility
        // A tenant owner can customize a built-in role for their own tenant.
        // Once that happens, prefer the tenant override over the shared global
        // template so the Roles page (and staff role selectors) do not show
        // two entries with the same role name.
        const tenantOverrideNames = new Set(
            roleRows
                .filter(r => tenantId && r.tenantId === tenantId && r.branchId === null)
                .map(r => r.name),
        );
        const visibleRoleRows = roleRows.filter(
            r => !(r.tenantId === null && tenantOverrideNames.has(r.name)),
        );

        const rolesWithCount = visibleRoleRows.map(r => ({
            ...r,
            users: undefined,
            _count: { users: (r as any).users?.length || 0 },
            isTemplate: r.tenantId === null,
            assignable: isSuperAdmin || r.tenantId !== null,
        }));

        res.json({
            success: true,
            data: rolesWithCount,
            meta: {
                total: rolesWithCount.length,
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                totalPages: Math.ceil(rolesWithCount.length / parseInt(limit as string))
            }
        });
    } catch (error) {
        console.error('Get roles error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to get roles' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ROLE BY ID
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.get('/:id', authenticate, withTenantTx(), authorize('roles:read'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        // Every sibling route in this file (list, update, delete, assign)
        // tenant-scopes its lookup — this one didn't, letting any caller with
        // roles:read fetch another tenant's role (permission set + assigned
        // users) by guessing/enumerating its UUID.
        const tenantId = req.authUser?.tenantId;
        const getConds: any[] = [eq(roles.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            getConds.push(or(eq(roles.tenantId, tenantId), isNull(roles.tenantId)));
        }
        const role = await db.query.roles.findFirst({
            where: and(...getConds),
            with: { users: true },
        });

        if (!role) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
            });
        }

        // Ladder rule: the tenantId=null clause above lets tenant-scoped
        // callers reach global platform templates by ID (needed for legit
        // ones like cashier/staff) — without a level check that also let a
        // store_owner fetch super_admin's full permission set by guessing
        // its UUID. 404 (not 403) so the response doesn't confirm a
        // higher-privileged role exists at that ID.
        if (!req.authUser?.isSuperAdmin) {
            const targetLevel = role.level;
            const callerLevel = req.authUser?.roleLevel ?? 7;
            if (targetLevel < callerLevel) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Role not found' }
                });
            }
        }

        res.json({ success: true, data: role });
    } catch (error) {
        console.error('Get role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to get role' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATE ROLE
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.post('/', authenticate, withTenantTx(), authorize('roles:create'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, displayName, description, permissions = [], level } = req.body;

        // Validate required fields - only name is required now
        if (!name) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Name is required' }
            });
        }

        // BE-61: Inject tenantId on create, block null by non-platform users
        const tenantId = req.authUser?.tenantId;
        if (!tenantId && !req.authUser?.isSuperAdmin) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot create platform-level roles' }
            });
        }

        // Explicit level from the caller wins; unset falls back to the
        // matching built-in name's level (so creating e.g. a role literally
        // named "cashier" without specifying a level still lands where
        // ROLE_LEVELS always put it), then 7 (lowest/least-privileged) —
        // never inferred as privileged by default.
        const requestedLevel = Number.isInteger(level) ? Number(level) : (ROLE_LEVELS[name] ?? 7);
        if (requestedLevel < 1 || requestedLevel > 7) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'level must be between 1 and 7' }
            });
        }

        // Privilege escalation guard: cannot create a role at a higher level than caller
        if (!req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) > 2) {
            if (requestedLevel < (req.authUser?.roleLevel ?? 7)) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Cannot create a role with higher privileges than your own' }
                });
            }
        }

        // ── Branch ownership of the new role ─────────────────────────────────
        // Branch-level callers (roleLevel ≥ 4 — branch_admin/branch_manager/
        // store_manager included) may ONLY create roles private to their own
        // branch — they can never create a tenant-wide template, even by
        // omitting branchId from the request. Previously this cutoff was
        // roleLevel ≥ 5, which grouped branch_admin (level 4) in with real
        // tenant-level admins (level ≤ 3): a branch_admin who simply left
        // branchId out of the create form got a tenant-wide role back,
        // usable at every branch in the tenant — expanding their effective
        // reach outside their own branch, the exact escalation-shaped gap
        // this scope check exists to prevent.
        // HQ / tenant admins (roleLevel ≤ 3) may create a tenant-wide template
        // (no branchId) OR a role for a specific child branch (branchId in body).
        const callerLevel = req.authUser?.roleLevel ?? 7;
        let roleBranchId: string | null = null;
        if (!req.authUser?.isSuperAdmin && callerLevel >= 4) {
            roleBranchId = req.authUser?.activeBranchId || null;
            if (!roleBranchId) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No branch context available to create a branch role' }
                });
            }
        } else if (req.body.branchId) {
            // HQ/admin explicitly targeting a child branch — validate same tenant
            const targetBranch = await db.query.branches.findFirst({
                where: eq(branches.id, req.body.branchId),
                columns: { id: true, tenantId: true },
            });
            if (!targetBranch || (tenantId && targetBranch.tenantId !== tenantId)) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_BRANCH', message: 'Branch not found in your tenant' }
                });
            }
            roleBranchId = targetBranch.id;
        }

        // Check if role name already exists within the same tenant + branch scope
        const dupConds: any[] = [or(eq(roles.name, name), eq(roles.displayName, displayName || name))];
        if (tenantId) dupConds.push(eq(roles.tenantId, tenantId));
        dupConds.push(roleBranchId ? eq(roles.branchId, roleBranchId) : isNull(roles.branchId));
        const existing = await db.query.roles.findFirst({
            where: and(...dupConds),
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Role name or display name already exists' }
            });
        }

        // Validate permissions
        const activePermissionKeys = await loadActivePermissionKeys();
        const invalidPermissions = permissions.filter((p: string) => !activePermissionKeys.has(p));
        if (invalidPermissions.length > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PERMISSIONS',
                    message: `Invalid permissions: ${invalidPermissions.join(', ')}`
                }
            });
        }

        // Cannot grant a permission you don't personally hold. The "higher
        // privileges than your own" check above keys off ROLE_LEVELS[name],
        // which defaults any custom (non-builtin) role name to level 7 — for
        // a role named anything other than a recognized builtin, that check
        // never blocks anything. This closes the actual escalation path
        // regardless of what the role is named.
        if (!req.authUser?.isSuperAdmin && !(req.authUser?.permissions || []).includes('*')) {
            const callerPermissions = new Set(req.authUser?.permissions || []);
            const ungranted = permissions.filter((p: string) => !callerPermissions.has(p));
            if (ungranted.length > 0) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: `Cannot grant permissions you do not hold: ${ungranted.join(', ')}` }
                });
            }
        }

        const mask = permissionsToMask(permissions);

        const [role] = await db.insert(roles).values({
            tenantId: tenantId || null,
            branchId: roleBranchId,
            name,
            displayName: displayName || name,
            description,
            permissions,
            isSystem: false,
            level: requestedLevel,
            maskLow:  mask.low,
            maskHigh: mask.high,
        }).returning();

        queueActivityLog(
            req.authUser!.userId,
            'role_created',
            'access',
            `Created role ${role.displayName}`,
            { roleId: role.id, roleLevel: role.level, tenantId: role.tenantId, branchId: role.branchId },
            req,
        ).catch(() => {});

        res.status(201).json({ success: true, data: role });
    } catch (error) {
        console.error('Create role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to create role' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE ROLE
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.put('/:id', authenticate, withTenantTx(), authorize('roles:update'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { name, displayName, description, permissions, level } = req.body;

        // BE-60: Tenant-scoped role update
        const tenantId = req.authUser?.tenantId;
        const roleConds: any[] = [eq(roles.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            // Tenant owners may open a global built-in template in order to
            // create a tenant-local override. Other tenant users must never
            // update global roles.
            if ((req.authUser?.roleLevel ?? 7) <= 2) {
                roleConds.push(or(eq(roles.tenantId, tenantId), isNull(roles.tenantId)));
            } else {
                roleConds.push(eq(roles.tenantId, tenantId));
            }
        }
        // Branch-level callers can only edit roles owned by their own branch
        // (never tenant-wide templates or other branches' roles) — see the
        // matching comment on POST / for why the cutoff is 4, not 5.
        if (!req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) >= 4) {
            roleConds.push(eq(roles.branchId, req.authUser?.activeBranchId ?? '__none__'));
        }

        let existing = await db.query.roles.findFirst({ where: and(...roleConds) });
        if (!existing) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Role not found or no access' }
            });
        }

        const canCustomizeGlobalRole = Boolean(
            tenantId
            && !req.authUser?.isSuperAdmin
            && (req.authUser?.roleLevel ?? 7) <= 2
            && existing.isSystem
            && existing.tenantId === null,
        );

        // A tenant owner may customize a global system role, but only by
        // creating/updating a tenant-local copy. The shared platform role is
        // immutable and remains unchanged for every other tenant.
        if (canCustomizeGlobalRole) {
            const localRole = await db.query.roles.findFirst({
                where: and(
                    eq(roles.tenantId, tenantId!),
                    isNull(roles.branchId),
                    eq(roles.name, existing.name),
                ),
            });

            if (localRole) {
                existing = localRole;
            } else {
                const localMask = permissionsToMask(existing.permissions || []);
                const [createdLocalRole] = await db.insert(roles).values({
                    tenantId: tenantId!,
                    branchId: null,
                    name: existing.name,
                    displayName: existing.displayName,
                    description: existing.description,
                    permissions: existing.permissions || [],
                    isSystem: false,
                    level: existing.level,
                    maskLow: localMask.low,
                    maskHigh: localMask.high,
                }).returning();
                existing = createdLocalRole;
            }

            // Users in this tenant may still point at the shared global role.
            // Move only this tenant's users to the override so the owner and
            // existing staff immediately use the customized permissions
            // without affecting another tenant.
            const tenantUsers = await db.query.users.findMany({
                where: and(eq(users.roleId, id), eq(users.tenantId, tenantId!)),
                columns: { id: true },
            });
            if (tenantUsers.length > 0) {
                await db.update(users)
                    .set({ roleId: existing.id, updatedAt: new Date() })
                    .where(and(eq(users.roleId, id), eq(users.tenantId, tenantId!)));
                await Promise.all(tenantUsers.map(u => invalidateUserStoreCache(u.id).catch(() => {})));
            }
        }

        // Prevent editing system roles (global templates remain immutable).
        if (existing.isSystem) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot modify system roles' }
            });
        }

        // Explicit level wins; unset leaves the role's current DB level
        // unchanged (never re-derived from name — a role's level is a fact
        // set at creation/review time, not something a rename should silently
        // shift).
        let requestedLevel = existing.level;
        if (level !== undefined) {
            if (!Number.isInteger(level) || level < 1 || level > 7) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'level must be between 1 and 7' }
                });
            }
            requestedLevel = level;
        }

        // Privilege escalation guard: cannot update to a role level higher than caller
        if (!req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) > 2) {
            if (requestedLevel < (req.authUser?.roleLevel ?? 7) || existing.level < (req.authUser?.roleLevel ?? 7)) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Cannot modify a role with higher privileges than your own' }
                });
            }
        }

        // Check if new name conflicts with another role (within the same tenant)
        if (name && name !== existing.name) {
            const nameDupConds: any[] = [eq(roles.name, name)];
            if (tenantId) nameDupConds.push(eq(roles.tenantId, tenantId));
            const nameExists = await db.query.roles.findFirst({ where: and(...nameDupConds) });
            if (nameExists) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Role name already exists' }
                });
            }
        }

        // Validate permissions if provided
        if (permissions) {
            const activePermissionKeys = await loadActivePermissionKeys();
            const invalidPermissions = permissions.filter((p: string) => !activePermissionKeys.has(p));
            if (invalidPermissions.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_PERMISSIONS',
                        message: `Invalid permissions: ${invalidPermissions.join(', ')}`
                    }
                });
            }
            // Same "cannot grant what you don't hold" guard as create — see
            // that route for why the name-based ladder check alone isn't enough.
            if (!req.authUser?.isSuperAdmin && !(req.authUser?.permissions || []).includes('*')) {
                const callerPermissions = new Set(req.authUser?.permissions || []);
                const ungranted = permissions.filter((p: string) => !callerPermissions.has(p));
                if (ungranted.length > 0) {
                    return res.status(403).json({
                        success: false,
                        error: { code: 'FORBIDDEN', message: `Cannot grant permissions you do not hold: ${ungranted.join(', ')}` }
                    });
                }
            }
        }

        // Recompute bitmask whenever permissions change
        const maskUpdate = permissions ? permissionsToMask(permissions) : null;

        // Built-in role names are semantic keys used by authentication. A
        // tenant override may change its display name and permissions, but
        // must retain the original key.
        const effectiveName = canCustomizeGlobalRole ? existing.name : name;

        const [role] = await db.update(roles)
            .set({
                ...(effectiveName && effectiveName !== existing.name && { name: effectiveName }),
                ...(displayName && { displayName }),
                ...(description !== undefined && { description }),
                ...(permissions && { permissions }),
                ...(level !== undefined && { level: requestedLevel }),
                ...(maskUpdate && {
                    maskLow:  maskUpdate.low,
                    maskHigh: maskUpdate.high,
                }),
                updatedAt: new Date(),
            })
            .where(eq(roles.id, existing.id))
            .returning();

        // Invalidate cached permissions/menu for every user holding this role.
        // invalidateAllTenantPermissions only busts the kpos:rbac:* bitmask
        // cache — it never touches kpos:auth:{userId}, which is the cache
        // loadCachedAuthUser() actually reads on every authenticated request
        // (menu, permission checks, everything). Without this, a permission
        // added to a role (e.g. sales:create for POS access) silently never
        // takes effect for already-logged-in holders of that role until
        // their session naturally expires — found live: a staff account
        // granted POS access still had no Sales/POS menu item after the
        // role was updated, purely from this stale cache.
        if (role.tenantId) {
            invalidateAllTenantPermissions(role.tenantId).catch(() => {});
        }
        const affectedUsers = await db.query.users.findMany({
            where: eq(users.roleId, role.id),
            columns: { id: true },
        });
        await Promise.all(affectedUsers.map(u => invalidateUserStoreCache(u.id).catch(() => {})));

        queueActivityLog(
            req.authUser!.userId,
            'role_updated',
            'access',
            `Updated role ${role.displayName}`,
            { roleId: role.id, roleLevel: role.level, tenantId: role.tenantId, branchId: role.branchId },
            req,
        ).catch(() => {});

        res.json({ success: true, data: role });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to update role' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE ROLE
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.delete('/:id', authenticate, withTenantTx(), authorize('roles:delete'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        // BE-60: Tenant-scoped role delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(roles.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            delConds.push(eq(roles.tenantId, tenantId));
        }
        // Branch-level callers can only delete roles owned by their own
        // branch — see the matching comment on POST / for why the cutoff is
        // 4, not 5.
        if (!req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) >= 4) {
            delConds.push(eq(roles.branchId, req.authUser?.activeBranchId ?? '__none__'));
        }

        const existing = await db.query.roles.findFirst({ where: and(...delConds) });

        if (!existing) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Role not found or no access' }
            });
        }

        // Prevent deleting system roles
        if (existing.isSystem) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot delete system roles' }
            });
        }

        // Prevent deleting roles with assigned users
        const [{ value: userCount }] = await db.select({ value: count() }).from(users).where(eq(users.roleId, id));
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'HAS_USERS',
                    message: `Cannot delete role with ${userCount} assigned users`
                }
            });
        }

        await db.delete(roles).where(and(...delConds));

        queueActivityLog(
            req.authUser!.userId,
            'role_deleted',
            'access',
            `Deleted role ${existing.displayName}`,
            { roleId: id, roleLevel: existing.level, tenantId: existing.tenantId, branchId: existing.branchId },
            req,
        ).catch(() => {});

        res.json({ success: true, message: 'Role deleted successfully' });
    } catch (error) {
        console.error('Delete role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to delete role' }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ASSIGN ROLE TO USER
// ═══════════════════════════════════════════════════════════════════════════
roleRoutes.post('/:id/assign', authenticate, withTenantTx(), authorize('roles:update'), async (req, res) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'userId is required' }
            });
        }

        // BE-64: Tenant-scoped role assignment
        const tenantId = req.authUser?.tenantId;
        const callerLevel = req.authUser?.roleLevel ?? 7;
        const assignConds: any[] = [eq(roles.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            assignConds.push(or(eq(roles.tenantId, tenantId), isNull(roles.tenantId)));
        }
        // Branch-level callers may assign tenant-wide templates (branchId IS NULL)
        // or roles owned by their own branch — never another branch's role.
        if (!req.authUser?.isSuperAdmin && callerLevel >= 4) {
            assignConds.push(or(isNull(roles.branchId), eq(roles.branchId, req.authUser?.activeBranchId ?? '__none__')));
        }

        const role = await db.query.roles.findFirst({ where: and(...assignConds) });
        if (!role) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Role not found or no access' }
            });
        }

        // BE-64: Block assigning platform-scope roles via tenant API
        if (!req.authUser?.isSuperAdmin && role.tenantId === null) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot assign platform-scope roles' }
            });
        }

        // Privilege ladder: cannot grant a role more privileged than your own.
        // ROLE_LEVELS[role.name] defaults to 7 for any custom (non-builtin)
        // role name, which makes this check a no-op for the exact roles that
        // most need it — so the real guard is the permission-subset check
        // below, which works off the role's actual content regardless of
        // what it's named.
        if (!req.authUser?.isSuperAdmin) {
            const targetLevel = role.level;
            if (targetLevel < callerLevel) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Cannot assign a role with higher privileges than your own' }
                });
            }
            if (!(req.authUser?.permissions || []).includes('*')) {
                const callerPermissions = new Set(req.authUser?.permissions || []);
                const rolePermissions: string[] = (role.permissions as string[] | null) || [];
                const ungranted = rolePermissions.filter((p: string) => !callerPermissions.has(p));
                if (ungranted.length > 0) {
                    return res.status(403).json({
                        success: false,
                        error: { code: 'FORBIDDEN', message: `Cannot assign a role that grants permissions you do not hold: ${ungranted.join(', ')}` }
                    });
                }
            }
        }

        // Check if user exists (tenant-scoped)
        const userConds: any[] = [eq(users.id, userId)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            userConds.push(eq(users.tenantId, tenantId));
        }
        const user = await db.query.users.findFirst({ where: and(...userConds) });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // Branch isolation: branch-level callers can only re-role users in their own branch.
        if (!req.authUser?.isSuperAdmin && callerLevel >= 4 && user.branchId !== req.authUser?.activeBranchId) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Cannot assign roles to users outside your branch' }
            });
        }

        // Update user's role. Explicit column list on .returning() — an
        // unrestricted .returning() sends every column, including the
        // password hash and 2FA secret, straight back in the API response.
        const [updatedUser] = await db.update(users)
            .set({ roleId: id, role: role.name, updatedAt: new Date() })
            .where(eq(users.id, userId))
            .returning({
                id: users.id, tenantId: users.tenantId, email: users.email, name: users.name,
                phone: users.phone, avatar: users.avatar, role: users.role, roleId: users.roleId,
                storeId: users.storeId, branchId: users.branchId, permissions: users.permissions,
                isActive: users.isActive, isSuperAdmin: users.isSuperAdmin, emailVerified: users.emailVerified,
                twoFAEnabled: users.twoFAEnabled, lastLoginAt: users.lastLoginAt,
                createdAt: users.createdAt, updatedAt: users.updatedAt,
            });

        // Invalidate the target user's cached identity + permission mask so the
        // new role takes effect immediately instead of after the 5-min TTL.
        if (tenantId) invalidateUserPermissions(userId, tenantId).catch(() => {});
        invalidateUserStoreCache(userId).catch(() => {});

        queueActivityLog(
            req.authUser!.userId,
            'role_assigned',
            'access',
            `Assigned role ${role.displayName} to user ${user.name}`,
            { roleId: role.id, targetUserId: user.id, roleLevel: role.level, tenantId: user.tenantId, branchId: user.branchId },
            req,
        ).catch(() => {});

        res.json({ success: true, data: updatedUser });
    } catch (error) {
        console.error('Assign role error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to assign role' }
        });
    }
});
