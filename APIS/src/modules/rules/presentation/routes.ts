// ═══════════════════════════════════════════════════════════════════════════
// Rules Module - Routes (Phase 5)
// Rules = named RBAC access groups linked to roles via role_rules.
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, ROLE_LEVELS, invalidateRoleRulesCache } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { rules, roleRules, roles } from '@/db/schema/tables';
import { eq, and, or, isNull, ilike, desc, asc, inArray } from 'drizzle-orm';

export const rulesRoutes = Router();

// GET /rules — list rules for the tenant (system + tenant-owned)
rulesRoutes.get('/', authenticate, withTenantTx(), authorize('roles:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const tenantId = authUser.tenantId;
        const { search } = req.query;

        const conds: any[] = [eq(rules.isActive, true)];

        if (!authUser.isSuperAdmin && tenantId) {
            conds.push(or(eq(rules.tenantId, tenantId), isNull(rules.tenantId)));
        }
        if (search) {
            const s = String(search);
            conds.push(or(ilike(rules.name, `%${s}%`), ilike(rules.displayName, `%${s}%`), ilike(rules.module, `%${s}%`)));
        }

        const rows = await db.query.rules.findMany({
            where: and(...conds),
            orderBy: [asc(rules.module), asc(rules.order)],
        });

        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
});

// GET /rules/:id
rulesRoutes.get('/:id', authenticate, withTenantTx(), authorize('roles:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const tenantId = authUser.tenantId;
        const conds: any[] = [eq(rules.id, req.params.id)];
        if (!authUser.isSuperAdmin && tenantId) {
            conds.push(or(eq(rules.tenantId, tenantId), isNull(rules.tenantId)));
        }
        const row = await db.query.rules.findFirst({ where: and(...conds) });
        if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } });
        res.json({ success: true, data: row });
    } catch (error) {
        next(error);
    }
});

// POST /rules — create a new rule (hq_admin level or above required)
rulesRoutes.post('/', authenticate, withTenantTx(), authorize('roles:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const userLevel = authUser.isSuperAdmin ? 1 : (ROLE_LEVELS[authUser.role] ?? 7);
        if (userLevel > 3) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'HQ Admin or above required to create rules' } });
        }

        const { name, displayName, description, module, icon, routes: ruleRoutes, permissions: rulePerms, order } = req.body;
        if (!name || !displayName || !module) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'name, displayName, and module are required' } });
        }

        const tenantId = authUser.tenantId;
        const [row] = await db.insert(rules).values({
            tenantId,
            name, displayName, description, module, icon,
            routes: ruleRoutes ?? [],
            permissions: rulePerms ?? [],
            order: order ?? 0,
            isSystem: false,
        }).returning();

        res.status(201).json({ success: true, data: row });
    } catch (error) {
        next(error);
    }
});

// PUT /rules/:id — update a rule (cannot update isSystem=true rules)
rulesRoutes.put('/:id', authenticate, withTenantTx(), authorize('roles:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const tenantId = authUser.tenantId;
        const conds: any[] = [eq(rules.id, req.params.id)];
        if (!authUser.isSuperAdmin && tenantId) conds.push(eq(rules.tenantId, tenantId));

        const existing = await db.query.rules.findFirst({ where: and(...conds) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } });
        if (existing.isSystem && !authUser.isSuperAdmin) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify system rules' } });
        }

        const { displayName, description, module, icon, routes: ruleRoutes, permissions: rulePerms, order, isActive } = req.body;
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (displayName !== undefined) data.displayName = displayName;
        if (description !== undefined) data.description = description;
        if (module !== undefined) data.module = module;
        if (icon !== undefined) data.icon = icon;
        if (ruleRoutes !== undefined) data.routes = ruleRoutes;
        if (rulePerms !== undefined) data.permissions = rulePerms;
        if (order !== undefined) data.order = order;
        if (isActive !== undefined) data.isActive = isActive;

        const [updated] = await db.update(rules).set(data as any).where(and(...conds)).returning();
        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});

// DELETE /rules/:id — soft-delete (set isActive=false), only non-system rules
rulesRoutes.delete('/:id', authenticate, withTenantTx(), authorize('roles:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const tenantId = authUser.tenantId;
        const conds: any[] = [eq(rules.id, req.params.id)];
        if (!authUser.isSuperAdmin && tenantId) conds.push(eq(rules.tenantId, tenantId));

        const existing = await db.query.rules.findFirst({ where: and(...conds) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } });
        if (existing.isSystem) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete system rules' } });
        }

        await db.update(rules).set({ isActive: false, updatedAt: new Date() }).where(and(...conds));
        res.json({ success: true, data: { message: 'Rule deactivated' } });
    } catch (error) {
        next(error);
    }
});

// GET /rules/:id/role-rules — get all role assignments for a rule
rulesRoutes.get('/:id/role-rules', authenticate, withTenantTx(), authorize('roles:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const tenantId = authUser.tenantId;

        // R2: only expose role-rule assignments within the caller's tenant — a
        // system rule (tenantId NULL) otherwise leaks other tenants' role names.
        const conds: any[] = [eq(roleRules.ruleId, req.params.id)];
        if (!authUser.isSuperAdmin && tenantId) {
            conds.push(eq(roleRules.tenantId, tenantId));
        }

        const rows = await db.query.roleRules.findMany({
            where: and(...conds),
            with: { role: { columns: { id: true, name: true, displayName: true } } },
        });
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
});

// PUT /rules/role-rules/assign — bulk assign rules to a role with CRUD flags
rulesRoutes.put('/role-rules/assign', authenticate, withTenantTx(), authorize('roles:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { roleId, assignments } = req.body;
        // assignments: Array<{ ruleId: string; canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean }>
        if (!roleId || !Array.isArray(assignments)) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'roleId and assignments array required' } });
        }

        const authUser = req.authUser!;
        const tenantId = authUser.tenantId;

        // R1: the target role must belong to the caller's tenant (super admin: any).
        // role_rules drive authorizeRule() CRUD, so this prevents granting effective
        // permissions to another tenant's role.
        const roleConds: any[] = [eq(roles.id, roleId)];
        if (!authUser.isSuperAdmin && tenantId) roleConds.push(eq(roles.tenantId, tenantId));
        const role = await db.query.roles.findFirst({ where: and(...roleConds) });
        if (!role) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Role not found or no access' } });
        }

        // R1: every ruleId must resolve to a tenant-owned or system (tenantId NULL) rule.
        const ruleIds = [...new Set(assignments.map((a: any) => a.ruleId).filter(Boolean))];
        if (ruleIds.length > 0) {
            const ruleConds: any[] = [inArray(rules.id, ruleIds as string[])];
            if (!authUser.isSuperAdmin && tenantId) ruleConds.push(or(eq(rules.tenantId, tenantId), isNull(rules.tenantId)));
            const validRules = await db.query.rules.findMany({ where: and(...ruleConds), columns: { id: true } });
            if (validRules.length !== ruleIds.length) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'One or more rules are not accessible' } });
            }
        }

        // Own the assignment by the role's tenant (not the raw caller tenant).
        const rrTenantId = role.tenantId ?? tenantId;

        for (const a of assignments) {
            const existing = await db.query.roleRules.findFirst({
                where: and(eq(roleRules.roleId, roleId), eq(roleRules.ruleId, a.ruleId)),
            });

            if (existing) {
                await db.update(roleRules)
                    .set({ canRead: a.canRead, canCreate: a.canCreate, canUpdate: a.canUpdate, canDelete: a.canDelete })
                    .where(eq(roleRules.id, existing.id));
            } else {
                await db.insert(roleRules).values({
                    tenantId: rrTenantId,
                    roleId,
                    ruleId: a.ruleId,
                    canRead: a.canRead ?? true,
                    canCreate: a.canCreate ?? false,
                    canUpdate: a.canUpdate ?? false,
                    canDelete: a.canDelete ?? false,
                });
            }
        }

        // Role permissions changed → invalidate cached role-rules for this role.
        invalidateRoleRulesCache(roleId).catch(() => {});

        res.json({ success: true, data: { message: 'Rules assigned' } });
    } catch (error) {
        next(error);
    }
});
