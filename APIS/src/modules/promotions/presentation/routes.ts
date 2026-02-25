// ═══════════════════════════════════════════════════════════════════════════
// Promotions Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, invalidateQueryCache, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const promotionRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// COUPONS (Must be before /:id to avoid conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// Get all coupons
promotionRoutes.get('/coupons/list', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search, status } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const now = new Date();
        const filter = (req as any).branchFilter;

        const where: Record<string, unknown> = {};
        
        // Apply store scope filter
        applyScopeFilter(where, filter, 'storeId');

        if (search) {
            where.OR = [
                { code: { contains: String(search), mode: 'insensitive' } },
                { name: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        if (status === 'active') {
            where.isActive = true;
            where.startDate = { lte: now };
            where.OR = [
                { endDate: null },
                { endDate: { gte: now } },
            ];
        } else if (status === 'expired') {
            where.endDate = { lt: now };
        } else if (status === 'paused') {
            where.isActive = false;
        }

        const [coupons, total] = await Promise.all([
            prisma.coupon.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.coupon.count({ where }),
        ]);

        res.json({
            success: true,
            data: coupons,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Validate coupon
promotionRoutes.post('/coupons/validate', authenticate, async (req, res, next) => {
    try {
        const { code, subtotal, memberId } = req.body;
        const now = new Date();

        const coupon = await prisma.coupon.findUnique({
            where: { code },
        });

        if (!coupon) {
            res.status(400).json({ success: false, error: { code: 'CPN_001', message: 'Invalid coupon code' } });
            return;
        }

        if (!coupon.isActive) {
            res.status(400).json({ success: false, error: { code: 'CPN_002', message: 'Coupon is inactive' } });
            return;
        }

        if (coupon.startDate > now) {
            res.status(400).json({ success: false, error: { code: 'CPN_003', message: 'Coupon is not yet valid' } });
            return;
        }

        if (coupon.endDate && coupon.endDate < now) {
            res.status(400).json({ success: false, error: { code: 'CPN_004', message: 'Coupon has expired' } });
            return;
        }

        if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
            res.status(400).json({ success: false, error: { code: 'CPN_005', message: 'Coupon usage limit reached' } });
            return;
        }

        if (subtotal < coupon.minPurchase) {
            res.status(400).json({ success: false, error: { code: 'CPN_006', message: `Minimum purchase of ${coupon.minPurchase} required` } });
            return;
        }

        // Calculate discount
        let discount = 0;
        if (coupon.type === 'PERCENTAGE') {
            discount = (subtotal * coupon.value) / 100;
            if (coupon.maxDiscount && discount > coupon.maxDiscount) {
                discount = coupon.maxDiscount;
            }
        } else {
            discount = coupon.value;
        }

        res.json({
            success: true,
            data: {
                coupon,
                discount,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Create coupon
promotionRoutes.post('/coupons', authenticate, authorize('promotions:create'), async (req, res, next) => {
    try {
        // Check if code exists
        const existing = await prisma.coupon.findUnique({ where: { code: req.body.code } });
        if (existing) {
            res.status(400).json({ success: false, error: { code: 'VAL_002', message: 'Coupon code already exists' } });
            return;
        }

        // Convert date strings to Date objects
        const data = { ...req.body };
        if (data.startDate) data.startDate = new Date(data.startDate);
        if (data.endDate) data.endDate = data.endDate ? new Date(data.endDate) : null;

        // Attach storeId from active store
        if (req.authUser?.activeStoreId) {
            data.storeId = req.authUser.activeStoreId;
        }

        const coupon = await prisma.coupon.create({
            data,
        });

        await invalidateQueryCache('promotions*');
        res.status(201).json({ success: true, data: coupon });
    } catch (error) {
        next(error);
    }
});

// Update coupon
promotionRoutes.put('/coupons/:id', authenticate, authorize('promotions:update'), async (req, res, next) => {
    try {
        // Convert date strings to Date objects
        const data = { ...req.body };
        if (data.startDate) data.startDate = new Date(data.startDate);
        if (data.endDate !== undefined) data.endDate = data.endDate ? new Date(data.endDate) : null;

        const coupon = await prisma.coupon.update({
            where: { id: req.params.id },
            data,
        });

        await invalidateQueryCache('promotions*');
        res.json({ success: true, data: coupon });
    } catch (error) {
        next(error);
    }
});

// Delete coupon
promotionRoutes.delete('/coupons/:id', authenticate, authorize('promotions:delete'), async (req, res, next) => {
    try {
        await prisma.coupon.delete({
            where: { id: req.params.id },
        });

        await invalidateQueryCache('promotions*');
        res.json({ success: true, message: 'Coupon deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DISCOUNTS (Must be before /:id to avoid conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// Get all discounts with pagination
promotionRoutes.get('/discounts', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search, isActive, applyTo } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;
        
        const where: Record<string, unknown> = {};
        applyScopeFilter(where, filter, 'storeId');
        
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { description: { contains: String(search), mode: 'insensitive' } },
            ];
        }
        if (isActive !== undefined) where.isActive = isActive === 'true';
        if (applyTo) where.applyTo = String(applyTo);

        const [discounts, total] = await Promise.all([
            prisma.discount.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.discount.count({ where }),
        ]);

        // Map Prisma fields to frontend expected fields
        const mappedDiscounts = discounts.map(d => ({
            ...d,
            type: d.discountType,
            value: d.discountValue,
        }));

        res.json({ 
            success: true, 
            data: mappedDiscounts,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Create discount
promotionRoutes.post('/discounts', authenticate, authorize('promotions:create'), async (req, res, next) => {
    try {
        // Map frontend fields to Prisma model fields
        const { 
            type, value, startDate, endDate, 
            code, usageLimit, minPurchase, maxDiscount, // Extract fields that may not be in form
            ...rest 
        } = req.body;
        
        const discountData: Record<string, unknown> = {
            name: rest.name,
            description: rest.description || null,
            discountType: (type || rest.discountType || 'percentage').toLowerCase(),
            discountValue: value ?? rest.discountValue ?? 0,
            applyTo: rest.applyTo || 'all',
            isActive: rest.isActive !== undefined ? rest.isActive : true,
            minQuantity: rest.minQuantity || 1,
            productIds: rest.productIds || [],
            categoryIds: rest.categoryIds || [],
        };

        // Only add optional fields if they exist in schema
        if (minPurchase !== undefined) discountData.minPurchase = minPurchase;
        if (maxDiscount !== undefined) discountData.maxDiscount = maxDiscount;
        if (startDate) discountData.startDate = new Date(startDate);
        if (endDate) discountData.endDate = new Date(endDate);
        if (usageLimit !== undefined) discountData.usageLimit = usageLimit || null;
        
        // Attach storeId from active store
        if (req.authUser?.activeStoreId) {
            discountData.storeId = req.authUser.activeStoreId;
        }

        const discount = await prisma.discount.create({
            data: discountData as any,
        });

        await invalidateQueryCache('promotions*');
        res.status(201).json({ success: true, data: discount });
    } catch (error) {
        console.error('Create discount error:', error);
        next(error);
    }
});

// Update discount
promotionRoutes.put('/discounts/:id', authenticate, authorize('promotions:update'), async (req, res, next) => {
    try {
        // Map frontend fields to Prisma model fields - only include known fields
        const { 
            type, value, startDate, endDate, 
            code, usageLimit, minPurchase, maxDiscount,
            name, description, applyTo, isActive, minQuantity, productIds, categoryIds
        } = req.body;
        
        const discountData: Record<string, unknown> = {};
        
        if (name !== undefined) discountData.name = name;
        if (description !== undefined) discountData.description = description;
        if (type !== undefined) discountData.discountType = type.toLowerCase();
        if (value !== undefined) discountData.discountValue = value;
        if (applyTo !== undefined) discountData.applyTo = applyTo;
        if (isActive !== undefined) discountData.isActive = isActive;
        if (minQuantity !== undefined) discountData.minQuantity = minQuantity;
        if (productIds !== undefined) discountData.productIds = productIds;
        if (categoryIds !== undefined) discountData.categoryIds = categoryIds;
        if (minPurchase !== undefined) discountData.minPurchase = minPurchase;
        if (maxDiscount !== undefined) discountData.maxDiscount = maxDiscount;
        if (startDate !== undefined) discountData.startDate = startDate ? new Date(startDate) : null;
        if (endDate !== undefined) discountData.endDate = endDate ? new Date(endDate) : null;
        if (usageLimit !== undefined) discountData.usageLimit = usageLimit || null;
        
        const discount = await prisma.discount.update({
            where: { id: req.params.id },
            data: discountData as any,
        });

        await invalidateQueryCache('promotions*');
        res.json({ success: true, data: discount });
    } catch (error) {
        console.error('Update discount error:', error);
        next(error);
    }
});

// Delete discount
promotionRoutes.delete('/discounts/:id', authenticate, authorize('promotions:delete'), async (req, res, next) => {
    try {
        await prisma.discount.delete({
            where: { id: req.params.id },
        });

        await invalidateQueryCache('promotions*');
        res.json({ success: true, message: 'Discount deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROMOTIONS
// ═══════════════════════════════════════════════════════════════════════════

// Get all promotions
promotionRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search, status } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const now = new Date();
        const filter = (req as any).branchFilter;

        const where: Record<string, unknown> = {};
        applyScopeFilter(where, filter, 'storeId');
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { description: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        // Filter by status
        if (status === 'active') {
            where.isActive = true;
            where.startDate = { lte: now };
            where.OR = [
                { endDate: null },
                { endDate: { gte: now } },
            ];
        } else if (status === 'scheduled') {
            where.isActive = true;
            where.startDate = { gt: now };
        } else if (status === 'expired') {
            where.endDate = { lt: now };
        } else if (status === 'paused') {
            where.isActive = false;
        }

        const [promotions, total] = await Promise.all([
            prisma.promotion.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.promotion.count({ where }),
        ]);

        res.json({
            success: true,
            data: promotions,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get promotion by ID
promotionRoutes.get('/:id', authenticate, async (req, res, next) => {
    try {
        const promotion = await prisma.promotion.findUnique({
            where: { id: req.params.id },
        });

        if (!promotion) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Promotion not found' } });
            return;
        }

        res.json({ success: true, data: promotion });
    } catch (error) {
        next(error);
    }
});

// Create promotion
promotionRoutes.post('/', authenticate, authorize('promotions:create'), async (req, res, next) => {
    try {
        // Convert date strings to Date objects and sanitize
        const { id, _id, createdAt, updatedAt, ...body } = req.body;
        const data: Record<string, unknown> = {
            name: body.name,
            type: body.type || 'PERCENTAGE',
            value: Number(body.value) || 0,
            description: body.description || null,
            conditions: body.conditions || null,
            applicableTo: body.applicableTo || null,
            startDate: body.startDate ? new Date(body.startDate) : new Date(),
            endDate: body.endDate ? new Date(body.endDate) : null,
            isActive: body.isActive !== undefined ? body.isActive : true,
            priority: body.priority ? Number(body.priority) : 0,
            usageLimit: body.usageLimit ? Number(body.usageLimit) : null,
            memberOnly: body.memberOnly || false,
        };

        // Attach storeId from active store
        if (req.authUser?.activeStoreId) {
            data.storeId = req.authUser.activeStoreId;
        }

        const promotion = await prisma.promotion.create({
            data,
        });

        await invalidateQueryCache('promotions*');
        res.status(201).json({ success: true, data: promotion });
    } catch (error) {
        next(error);
    }
});

// Update promotion
promotionRoutes.put('/:id', authenticate, authorize('promotions:update'), async (req, res, next) => {
    try {
        // Convert date strings to Date objects and sanitize
        const { id, _id, createdAt, updatedAt, ...body } = req.body;
        const data: Record<string, unknown> = {};
        if (body.name !== undefined) data.name = body.name;
        if (body.type !== undefined) data.type = body.type;
        if (body.value !== undefined) data.value = Number(body.value);
        if (body.description !== undefined) data.description = body.description || null;
        if (body.conditions !== undefined) data.conditions = body.conditions;
        if (body.applicableTo !== undefined) data.applicableTo = body.applicableTo;
        if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : undefined;
        if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
        if (body.isActive !== undefined) data.isActive = body.isActive;
        if (body.priority !== undefined) data.priority = Number(body.priority);
        if (body.usageLimit !== undefined) data.usageLimit = body.usageLimit ? Number(body.usageLimit) : null;
        if (body.memberOnly !== undefined) data.memberOnly = body.memberOnly;

        const promotion = await prisma.promotion.update({
            where: { id: req.params.id },
            data,
        });

        await invalidateQueryCache('promotions*');
        res.json({ success: true, data: promotion });
    } catch (error) {
        next(error);
    }
});

// Delete promotion
promotionRoutes.delete('/:id', authenticate, authorize('promotions:delete'), async (req, res, next) => {
    try {
        await prisma.promotion.delete({
            where: { id: req.params.id },
        });

        await invalidateQueryCache('promotions*');
        res.json({ success: true, message: 'Promotion deleted successfully' });
    } catch (error) {
        next(error);
    }
});
