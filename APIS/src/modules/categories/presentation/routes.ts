// ═══════════════════════════════════════════════════════════════════════════
// Categories Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, invalidateQueryCache } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const categoryRoutes = Router();

// Get all categories
categoryRoutes.get('/', authenticate, async (req, res, next) => {
    try {
        const where: Record<string, unknown> = { isActive: true };

        const categories = await prisma.category.findMany({
            where,
            include: { parent: true },
            orderBy: { sortOrder: 'asc' },
        });

        res.json({ success: true, data: categories });
    } catch (error) {
        next(error);
    }
});

// Get category by ID
categoryRoutes.get('/:id', authenticate, async (req, res, next) => {
    try {
        const category = await prisma.category.findUnique({
            where: { id: req.params.id },
            include: { parent: true, children: true, products: { take: 10 } },
        });

        if (!category) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Category not found' } });
            return;
        }

        res.json({ success: true, data: category });
    } catch (error) {
        next(error);
    }
});

// Create category
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

        const category = await prisma.category.create({ data });
        await invalidateQueryCache('categories*');
        await invalidateQueryCache('products*');
        res.status(201).json({ success: true, data: category });
    } catch (error) {
        next(error);
    }
});

// Update category
categoryRoutes.put('/:id', authenticate, authorize('categories:update'), async (req, res, next) => {
    try {
        const category = await prisma.category.update({
            where: { id: req.params.id },
            data: req.body,
        });
        await invalidateQueryCache('categories*');
        res.json({ success: true, data: category });
    } catch (error) {
        next(error);
    }
});

// Delete category
categoryRoutes.delete('/:id', authenticate, authorize('categories:delete'), async (req, res, next) => {
    try {
        await prisma.category.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });
        await invalidateQueryCache('categories*');
        await invalidateQueryCache('products*');
        res.json({ success: true, data: { message: 'Category deleted' } });
    } catch (error) {
        next(error);
    }
});
