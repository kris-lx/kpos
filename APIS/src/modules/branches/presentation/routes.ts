// ═══════════════════════════════════════════════════════════════════════════
// Branches Module - Routes (Drizzle ORM + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, ensureScopeAccess, isAdmin, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { branches, stores, users } from '@/db/schema/tables';
import { eq, and, inArray, ne, asc, count, sql, or } from 'drizzle-orm';

export const branchRoutes = Router();

// Get all branches — scoped by role level
branchRoutes.get('/', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const filter = req.branchFilter;
        const conditions: any[] = [eq(branches.isActive, true)];

        if (authUser.isSuperAdmin) {
            // Level 1: no tenant filter — see all tenants' branches
        } else if (authUser.roleLevel <= 2) {
            // Level 2 (tenant_admin): all branches within tenant
            if (filter?.tenantId) conditions.push(eq(branches.tenantId, filter.tenantId));
        } else if (authUser.roleLevel <= 4) {
            // Level 3-4 (hq_admin, hq_manager): HQ branch + all child branches via path prefix
            if (filter?.tenantId) conditions.push(eq(branches.tenantId, filter.tenantId));
            const paths = authUser.accessibleBranchPaths;
            if (paths.length > 0) {
                const pathConds = paths.map(p =>
                    sql`(${branches.branchPath} = ${p} OR ${branches.branchPath} LIKE ${p + '.%'})`
                );
                conditions.push(pathConds.length === 1 ? pathConds[0] : or(...pathConds));
            }
        } else {
            // Level 5-7 (branch_admin, manager, staff): own branch only
            if (filter?.branchIds?.length) {
                conditions.push(inArray(branches.id, filter.branchIds));
            } else if (authUser.branchId) {
                conditions.push(eq(branches.id, authUser.branchId));
            }
        }

        const rows = await db.query.branches.findMany({
            where: and(...conditions),
            orderBy: asc(branches.name),
        });

        // Attach employee count per branch
        const branchIds = rows.map(b => b.id);
        let countMap = new Map<string, number>();
        if (branchIds.length > 0) {
            const userCounts = await db.select({ branchId: users.branchId, cnt: count() })
                .from(users)
                .where(and(inArray(users.branchId, branchIds), eq(users.isActive, true)))
                .groupBy(users.branchId);
            userCounts.forEach(r => { if (r.branchId) countMap.set(r.branchId, Number(r.cnt)); });
        }
        const data = rows.map(b => ({ ...b, employeeCount: countMap.get(b.id) ?? 0 }));

        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

// Get accessible branches for the current user (used by frontend selectors)
branchRoutes.get('/accessible', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const filter = req.branchFilter;
        const conditions: any[] = [eq(branches.isActive, true)];

        if (!authUser.isSuperAdmin) {
            if (filter?.tenantId) conditions.push(eq(branches.tenantId, filter.tenantId));

            if (authUser.roleLevel <= 2) {
                // tenant_admin: all tenant branches (no extra filter needed beyond tenantId)
            } else if (authUser.roleLevel <= 4) {
                // hq_admin / hq_manager: path-prefix scope
                const paths = authUser.accessibleBranchPaths;
                if (paths.length > 0) {
                    const pathConds = paths.map(p =>
                        sql`(${branches.branchPath} = ${p} OR ${branches.branchPath} LIKE ${p + '.%'})`
                    );
                    conditions.push(pathConds.length === 1 ? pathConds[0] : or(...pathConds));
                }
            } else {
                // branch_admin and below: own branch only
                if (filter?.branchIds?.length) {
                    conditions.push(inArray(branches.id, filter.branchIds));
                } else if (authUser.branchId) {
                    conditions.push(eq(branches.id, authUser.branchId));
                }
            }
        }

        const rows = await db.query.branches.findMany({
            where: and(...conditions),
            columns: { id: true, name: true, code: true, parentBranchId: true, branchPath: true, isMain: true, logo: true },
            orderBy: asc(branches.name),
        });

        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
});

// Get branch by ID
branchRoutes.get('/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-72: Tenant-scoped branch lookup
        const tenantId = req.authUser?.tenantId;
        const getConds: any[] = [eq(branches.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            getConds.push(eq(branches.tenantId, tenantId));
        }

        const branch = await db.query.branches.findFirst({
            where: and(...getConds),
        });

        if (!branch) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Branch not found or no access' } });
            return;
        }

        if (!ensureScopeAccess(branch, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
        }

        res.json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

// Create branch (hq_admin or tenant_admin+)
branchRoutes.post('/', authenticate, withTenantTx(), authorize('branches:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = (req.authUser?.tenantId || req.user?.tenantId) || null;
        const { name, code, address, phone, email, taxId, logo, isMain, isActive, settings, parentBranchId } = req.body;

        if (!name || !code) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION', message: 'Name and code are required' }
            });
        }
        // `code` becomes part of `branches.branchPath` (materialized path,
        // '.'-joined — see below) which is read back and used to build
        // branch-scope SQL conditions elsewhere (auth.middleware.ts). Reject
        // '.' (the path separator — would let a branch masquerade as a
        // descendant of an unrelated branch) and anything outside the
        // character set `set-tenant-context.ts`'s BRANCH_PATH_RE already
        // requires for this same column, so a bad branchPath can never reach
        // the DB in the first place.
        if (!/^[\w -]+$/.test(code)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION', message: "Branch code may only contain letters, numbers, spaces, underscores and hyphens (no '.')" }
            });
        }

        const dupConds: any[] = [eq(branches.code, code)];
        if (tenantId) dupConds.push(eq(branches.tenantId, tenantId));
        const existing = await db.query.branches.findFirst({ where: and(...dupConds) });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Branch code already exists' }
            });
        }

        if (isMain) {
            await db.update(branches).set({ isMain: false })
                .where(and(eq(branches.isMain, true), ...(tenantId ? [eq(branches.tenantId, tenantId)] : [])));
        }

        // Compute branchPath: parent.path + '.' + code, or just code for root
        let branchPath = code;
        if (parentBranchId) {
            const parent = await db.query.branches.findFirst({
                where: eq(branches.id, parentBranchId),
                columns: { branchPath: true },
            });
            if (parent?.branchPath) branchPath = parent.branchPath + '.' + code;
        }

        const [branch] = await db.insert(branches).values({
            tenantId,
            parentBranchId: parentBranchId || null,
            branchPath,
            name, code, address, phone, email, taxId, logo,
            isMain: isMain || false, isActive: isActive !== false, settings: settings || {},
        }).returning();
        res.status(201).json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

// Update branch
branchRoutes.put('/:id', authenticate, withTenantTx(), authorize('branches:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-72: Tenant-scoped update
        const tenantId = req.authUser?.tenantId;
        const updConds: any[] = [eq(branches.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) updConds.push(eq(branches.tenantId, tenantId));
        const existing = await db.query.branches.findFirst({ where: and(...updConds) });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Branch not found or no access' } });
        // For branch records (no storeId/branchId field), scope check is: branch_admin can only edit their own branch
        if (!isAdmin(req) && !req.authUser!.permissions.includes('*')) {
            if (req.authUser!.roleLevel > 4 && !req.authUser!.accessibleBranchIds?.includes(existing.id)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
            }
        }

        const { name, code, address, phone, email, taxId, logo, isMain, isActive, settings } = req.body;
        // Same constraint as create — code feeds branchPath (see POST / above).
        if (code !== undefined && !/^[\w -]+$/.test(code)) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION', message: "Branch code may only contain letters, numbers, spaces, underscores and hyphens (no '.')" }
            });
        }
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (name !== undefined) data.name = name;
        if (code !== undefined) data.code = code;
        if (address !== undefined) data.address = address;
        if (phone !== undefined) data.phone = phone;
        if (email !== undefined) data.email = email;
        if (taxId !== undefined) data.taxId = taxId;
        if (logo !== undefined) data.logo = logo;
        if (isMain !== undefined) data.isMain = isMain;
        if (isActive !== undefined) data.isActive = isActive;
        if (settings !== undefined) data.settings = settings;

        if (isMain) {
            await db.update(branches).set({ isMain: false }).where(and(eq(branches.isMain, true), ne(branches.id, req.params.id)));
        }

        delete data.tenantId;
        const [branch] = await db.update(branches)
            .set(data as any)
            .where(and(...updConds))
            .returning();
        res.json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

// Delete branch (soft delete) - check if no stores are assigned
branchRoutes.delete('/:id', authenticate, withTenantTx(), authorize('branches:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        // BE-72: Tenant-scoped delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(branches.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) delConds.push(eq(branches.tenantId, tenantId));
        const existing = await db.query.branches.findFirst({ where: and(...delConds) });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Branch not found or no access' } });
        if (!isAdmin(req) && !req.authUser!.permissions.includes('*')) {
            if (req.authUser!.roleLevel > 4 && !req.authUser!.accessibleBranchIds?.includes(existing.id)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
            }
        }

        // Check if branch has any stores
        const [{ value: storeCount }] = await db.select({ value: count() }).from(stores)
            .where(and(eq(stores.branchId, id), eq(stores.isActive, true)));

        if (storeCount > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'BRANCH_HAS_STORES',
                    message: `ບໍ່ສາມາດລົບສາຂານີ້ໄດ້ ເພາະມີ ${storeCount} ຮ້ານຢູ່ໃນສາຂານີ້`
                }
            });
        }

        // Check if branch has any users
        const [{ value: userCount }] = await db.select({ value: count() }).from(users)
            .where(and(eq(users.branchId, id), eq(users.isActive, true)));

        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'BRANCH_HAS_USERS',
                    message: `ບໍ່ສາມາດລົບສາຂານີ້ໄດ້ ເພາະມີ ${userCount} ພະນັກງານຢູ່ໃນສາຂານີ້`
                }
            });
        }

        await db.update(branches)
            .set({ isActive: false, updatedAt: new Date() })
            .where(and(...delConds));
        res.json({ success: true, data: { message: 'Branch deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BRANCH OWNER IDENTITY (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════

// GET /branches/:id/identity — return owner/branding identity fields
branchRoutes.get('/:id/identity', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const conds: any[] = [eq(branches.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) conds.push(eq(branches.tenantId, tenantId));

        const branch = await db.query.branches.findFirst({
            where: and(...conds),
            columns: {
                id: true, name: true, code: true, logo: true,
                address: true, phone: true, email: true, taxId: true,
                ownerName: true, ownerPhone: true, ownerEmail: true,
                registrationNo: true, website: true,
            },
        });

        if (!branch) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found' } });
        }

        if (!ensureScopeAccess(branch as any, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
        }

        res.json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

// PUT /branches/:id/identity — update owner/branding identity fields
branchRoutes.put('/:id/identity', authenticate, withTenantTx(), authorize('branches:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const authUser = req.authUser!;

        const conds: any[] = [eq(branches.id, req.params.id)];
        if (tenantId && !authUser.isSuperAdmin) conds.push(eq(branches.tenantId, tenantId));

        const existing = await db.query.branches.findFirst({ where: and(...conds) });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Branch not found' } });
        }
        if (!ensureScopeAccess(existing, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
        }

        // branch_manager (level 6+) cannot update identity — only branch_admin (5) and above
        if (authUser.roleLevel > 5) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Branch admin access required' } });
        }

        const { name, logo, address, phone, email, taxId, ownerName, ownerPhone, ownerEmail, registrationNo, website } = req.body;
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (name !== undefined) data.name = name;
        if (logo !== undefined) data.logo = logo;
        if (address !== undefined) data.address = address;
        if (phone !== undefined) data.phone = phone;
        if (email !== undefined) data.email = email;
        if (taxId !== undefined) data.taxId = taxId;
        if (ownerName !== undefined) data.ownerName = ownerName;
        if (ownerPhone !== undefined) data.ownerPhone = ownerPhone;
        if (ownerEmail !== undefined) data.ownerEmail = ownerEmail;
        if (registrationNo !== undefined) data.registrationNo = registrationNo;
        if (website !== undefined) data.website = website;

        const [updated] = await db.update(branches).set(data as any).where(and(...conds)).returning();
        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});
