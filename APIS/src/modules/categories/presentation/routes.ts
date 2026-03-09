// ═══════════════════════════════════════════════════════════════════════════
// Categories Module - Routes (Drizzle ORM + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, buildScopeCondition, ensureScopeAccess, invalidateQueryCache, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { db, dbRead } from '@/config/database.config';
import { categories, products } from '@/db/schema/tables';
import { eq, and, or, asc, isNull, inArray } from 'drizzle-orm';

export const categoryRoutes = Router();

// Get all categories (store-scoped)
categoryRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = req.branchFilter;

        // Build scope: show store-specific categories + global (storeId=NULL) categories
        const conditions: any[] = [eq(categories.isActive, true)];
        
        if (filter?.scopeByStore && filter.storeIds.length > 0) {
            // Store owner sees their store's categories + shared/global categories within their tenant
            const scopeConds = [inArray(categories.storeId, filter.storeIds), isNull(categories.storeId)];
            
            // Only allow global categories that belong to their tenant
            if (filter.tenantId) {
                conditions.push(eq(categories.tenantId, filter.tenantId));
            }
            conditions.push(or(...scopeConds));
        } else if (filter?.tenantId) {
            // Non-store-scoped user (e.g. branch admin) sees tenant's categories + global (no tenant) categories
            conditions.push(or(eq(categories.tenantId, filter.tenantId), isNull(categories.tenantId)));
        } else if (filter && !filter.tenantId) {
            // If user has no tenantId (e.g., new store admin), still show global categories
            conditions.push(isNull(categories.storeId));
        }
        const catWhere = conditions.length > 0 ? and(...conditions) : undefined;

        const rows = await db.query.categories.findMany({
            where: catWhere,
            with: { 
                parent: true,
                products: {
                    where: eq(products.isActive, true),
                    columns: { id: true }
                }
            },
            orderBy: asc(categories.sortOrder),
        });

        // Map product count for frontend and omit full products array
        const categoriesWithCount = rows.map((c: any) => {
            const productCount = c.products?.length || 0;
            const { products, ...rest } = c;
            return { ...rest, productCount };
        });

        res.json({ success: true, data: categoriesWithCount });
    } catch (error) {
        next(error);
    }
});

// Get category by ID (scope-checked)
categoryRoutes.get('/:id', authenticate, async (req, res, next) => {
    try {
        // BE-36: Tenant-scoped category lookup
        const tenantId = req.authUser?.tenantId;
        const getConds: any[] = [eq(categories.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            getConds.push(eq(categories.tenantId, tenantId));
        }

        const category = await db.query.categories.findFirst({
            where: and(...getConds),
            with: { parent: true, children: true, products: { limit: 10 } },
        });

        if (!category) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Category not found or no access' } });
            return;
        }

        if (!ensureScopeAccess(category, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this category' } });
        }

        res.json({ success: true, data: category });
    } catch (error) {
        next(error);
    }
});

// Create category (auto-set storeId)
categoryRoutes.post('/', authenticate, branchFilter(), authorize('categories:create'), async (req, res, next) => {
    try {
        const { name, description, image, parentId, sortOrder } = req.body;
        
        if (!name) {
            res.status(400).json({ success: false, error: { code: 'VAL_001', message: 'Name is required' } });
            return;
        }
        
        // Auto-generate slug from name
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9ກ-ຮ]+/g, '-')
            .replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

        const data: any = { name, slug };
        if (description) data.description = description;
        if (image) data.image = image;
        if (parentId) data.parentId = parentId;
        if (sortOrder !== undefined) data.sortOrder = sortOrder;

        // Auto-set tenantId and storeId from user context
        const catTenantId = req.authUser?.tenantId || req.user?.tenantId;
        if (catTenantId) data.tenantId = catTenantId;
        if (req.authUser?.activeStoreId) {
            data.storeId = req.authUser.activeStoreId;
        }

        const [category] = await db.insert(categories).values(data).returning();
        await invalidateQueryCache('categories*');
        await invalidateQueryCache('products*');
        res.status(201).json({ success: true, data: category });
    } catch (error) {
        next(error);
    }
});

// Update category (scope-checked)
categoryRoutes.put('/:id', authenticate, authorize('categories:update'), async (req, res, next) => {
    try {
        // BE-36: Tenant-scoped update
        const tenantId = req.authUser?.tenantId;
        const updConds: any[] = [eq(categories.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            updConds.push(eq(categories.tenantId, tenantId));
        }

        const existing = await db.query.categories.findFirst({ where: and(...updConds) });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Category not found or no access' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        const { storeId: _s, id: _id, tenantId: _t, ...safeData } = req.body;
        const [category] = await db.update(categories)
            .set({ ...safeData, updatedAt: new Date() })
            .where(and(...updConds))
            .returning();
        await invalidateQueryCache('categories*');
        res.json({ success: true, data: category });
    } catch (error) {
        next(error);
    }
});

// Delete category (scope-checked)
categoryRoutes.delete('/:id', authenticate, authorize('categories:delete'), async (req, res, next) => {
    try {
        // BE-36: Tenant-scoped delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(categories.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            delConds.push(eq(categories.tenantId, tenantId));
        }

        const existing = await db.query.categories.findFirst({ where: and(...delConds) });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Category not found or no access' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        await db.update(categories)
            .set({ isActive: false, updatedAt: new Date() })
            .where(and(...delConds));
        await invalidateQueryCache('categories*');
        await invalidateQueryCache('products*');
        res.json({ success: true, data: { message: 'Category deleted' } });
    } catch (error) {
        next(error);
    }
});
