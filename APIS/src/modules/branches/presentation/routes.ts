// ═══════════════════════════════════════════════════════════════════════════
// Branches Module - Routes (Drizzle ORM + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, ensureScopeAccess, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { branches, stores, users } from '@/db/schema/tables';
import { eq, and, inArray, ne, asc, count } from 'drizzle-orm';

export const branchRoutes = Router();

// Get all branches — scoped for non-admin users
branchRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = req.branchFilter;
        const conditions = [eq(branches.isActive, true)];

        if (filter?.branchIds?.length) {
            conditions.push(inArray(branches.id, filter.branchIds));
        } else if (filter?.tenantId) {
            // System Admins: scope to their tenant
            conditions.push(eq(branches.tenantId, filter.tenantId));
        }

        const rows = await db.query.branches.findMany({
            where: and(...conditions),
            orderBy: asc(branches.name),
        });

        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
});

// Get branch by ID
branchRoutes.get('/:id', authenticate, async (req, res, next) => {
    try {
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

// Create branch (admin only)
branchRoutes.post('/', authenticate, authorize('branches:create'), async (req, res, next) => {
    try {
        const { name, code, address, phone, email, taxId, logo, isMain, isActive, settings } = req.body;

        if (!name || !code) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION', message: 'Name and code are required' }
            });
        }

        // BE-72: Tenant-scoped duplicate check
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
            await db.update(branches).set({ isMain: false }).where(eq(branches.isMain, true));
        }

        const tenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [branch] = await db.insert(branches).values({
            tenantId,
            name, code, address, phone, email, taxId, logo,
            isMain: isMain || false, isActive: isActive !== false, settings: settings || {},
        }).returning();
        res.status(201).json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

// Update branch
branchRoutes.put('/:id', authenticate, authorize('branches:update'), async (req, res, next) => {
    try {
        // BE-72: Tenant-scoped update
        const tenantId = req.authUser?.tenantId;
        const updConds: any[] = [eq(branches.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) updConds.push(eq(branches.tenantId, tenantId));
        const existing = await db.query.branches.findFirst({ where: and(...updConds) });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Branch not found or no access' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });

        const { name, code, address, phone, email, taxId, logo, isMain, isActive, settings } = req.body;
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
branchRoutes.delete('/:id', authenticate, authorize('branches:delete'), async (req, res, next) => {
    try {
        const { id } = req.params;

        // BE-72: Tenant-scoped delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(branches.id, id)];
        if (tenantId && !req.authUser?.isSuperAdmin) delConds.push(eq(branches.tenantId, tenantId));
        const existing = await db.query.branches.findFirst({ where: and(...delConds) });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Branch not found or no access' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });

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
