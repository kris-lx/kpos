// ═══════════════════════════════════════════════════════════════════════════
// Categories Module - Routes (Drizzle ORM + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, buildScopeCondition, ensureScopeAccess, invalidateQueryCache, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { categories } from '@/db/schema/tables';
import { eq, and, asc } from 'drizzle-orm';

export const categoryRoutes = Router();

// Get all categories (store-scoped)
categoryRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = (req as any).branchFilter as ScopeFilter | undefined;
        const scopeWhere = buildScopeCondition(filter, { storeId: categories.storeId, branchId: categories.storeId }, 'storeId');

        const rows = await db.query.categories.findMany({
            where: scopeWhere ? and(eq(categories.isActive, true), scopeWhere) : eq(categories.isActive, true),
            with: { parent: true },
            orderBy: asc(categories.sortOrder),
        });

        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
});

// Get category by ID (scope-checked)
categoryRoutes.get('/:id', authenticate, async (req, res, next) => {
    try {
        const category = await db.query.categories.findFirst({
            where: eq(categories.id, req.params.id),
            with: { parent: true, children: true, products: { limit: 10 } },
        });

        if (!category) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Category not found' } });
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
categoryRoutes.post('/', authenticate, authorize('categories:create'), async (req, res, next) => {
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

        // Auto-set storeId from user context
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
        const existing = await db.query.categories.findFirst({ where: eq(categories.id, req.params.id) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Category not found' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        const { storeId: _s, id: _id, ...safeData } = req.body;
        const [category] = await db.update(categories)
            .set({ ...safeData, updatedAt: new Date() })
            .where(eq(categories.id, req.params.id))
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
        const existing = await db.query.categories.findFirst({ where: eq(categories.id, req.params.id) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Category not found' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        await db.update(categories)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(categories.id, req.params.id));
        await invalidateQueryCache('categories*');
        await invalidateQueryCache('products*');
        res.json({ success: true, data: { message: 'Category deleted' } });
    } catch (error) {
        next(error);
    }
});
