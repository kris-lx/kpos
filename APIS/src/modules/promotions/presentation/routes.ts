// ═══════════════════════════════════════════════════════════════════════════
// Promotions Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, ensureScopeAccess, invalidateQueryCache, buildScopeCondition, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { coupons, discounts, promotions } from '@/db/schema/tables';
import { eq, and, or, ilike, isNull, lte, gte, gt, lt, desc, asc, count } from 'drizzle-orm';

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

        const conditions: any[] = [];
        const scopeCond = buildScopeCondition(filter, { storeId: coupons.storeId }, 'storeId');
        if (scopeCond) conditions.push(scopeCond);

        if (search) {
            const s = String(search);
            conditions.push(or(ilike(coupons.code, `%${s}%`), ilike(coupons.name, `%${s}%`)));
        }

        if (status === 'active') {
            conditions.push(eq(coupons.isActive, true), lte(coupons.startDate, now));
            conditions.push(or(isNull(coupons.endDate), gte(coupons.endDate, now)));
        } else if (status === 'expired') {
            conditions.push(lt(coupons.endDate, now));
        } else if (status === 'paused') {
            conditions.push(eq(coupons.isActive, false));
        }

        const couponWhere = conditions.length > 0 ? and(...conditions) : undefined;

        const [couponRows, [{ value: total }]] = await Promise.all([
            db.query.coupons.findMany({
                where: couponWhere,
                offset: skip,
                limit: Number(limit),
                orderBy: desc(coupons.createdAt),
            }),
            db.select({ value: count() }).from(coupons).where(couponWhere),
        ]);

        res.json({
            success: true,
            data: couponRows,
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

        const coupon = await db.query.coupons.findFirst({
            where: eq(coupons.code, code),
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
        const existing = await db.query.coupons.findFirst({ where: eq(coupons.code, req.body.code) });
        if (existing) {
            res.status(400).json({ success: false, error: { code: 'VAL_002', message: 'Coupon code already exists' } });
            return;
        }

        const data = { ...req.body };
        if (data.startDate) data.startDate = new Date(data.startDate);
        if (data.endDate) data.endDate = data.endDate ? new Date(data.endDate) : null;
        if (req.authUser?.activeStoreId) data.storeId = req.authUser.activeStoreId;

        const [coupon] = await db.insert(coupons).values(data).returning();

        await invalidateQueryCache('promotions*');
        res.status(201).json({ success: true, data: coupon });
    } catch (error) {
        next(error);
    }
});

// Update coupon (scope-checked)
promotionRoutes.put('/coupons/:id', authenticate, authorize('promotions:update'), async (req, res, next) => {
    try {
        const existing = await db.query.coupons.findFirst({ where: eq(coupons.id, req.params.id) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Coupon not found' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        const data = { ...req.body, updatedAt: new Date() };
        if (data.startDate) data.startDate = new Date(data.startDate);
        if (data.endDate !== undefined) data.endDate = data.endDate ? new Date(data.endDate) : null;

        const [coupon] = await db.update(coupons).set(data).where(eq(coupons.id, req.params.id)).returning();

        await invalidateQueryCache('promotions*');
        res.json({ success: true, data: coupon });
    } catch (error) {
        next(error);
    }
});

// Delete coupon (scope-checked)
promotionRoutes.delete('/coupons/:id', authenticate, authorize('promotions:delete'), async (req, res, next) => {
    try {
        const existing = await db.query.coupons.findFirst({ where: eq(coupons.id, req.params.id) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Coupon not found' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        await db.delete(coupons).where(eq(coupons.id, req.params.id));

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
        
        const dConditions: any[] = [];
        const dScopeCond = buildScopeCondition(filter, { storeId: discounts.storeId }, 'storeId');
        if (dScopeCond) dConditions.push(dScopeCond);
        
        if (search) {
            const s = String(search);
            dConditions.push(or(ilike(discounts.name, `%${s}%`), ilike(discounts.description, `%${s}%`)));
        }
        if (isActive !== undefined) dConditions.push(eq(discounts.isActive, isActive === 'true'));
        if (applyTo) dConditions.push(eq(discounts.applyTo, String(applyTo)));

        const dWhere = dConditions.length > 0 ? and(...dConditions) : undefined;

        const [discountRows, [{ value: total }]] = await Promise.all([
            db.query.discounts.findMany({
                where: dWhere,
                offset: skip,
                limit: Number(limit),
                orderBy: desc(discounts.createdAt),
            }),
            db.select({ value: count() }).from(discounts).where(dWhere),
        ]);

        const mappedDiscounts = discountRows.map(d => ({
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

        const [discount] = await db.insert(discounts).values(discountData as any).returning();

        await invalidateQueryCache('promotions*');
        res.status(201).json({ success: true, data: discount });
    } catch (error) {
        console.error('Create discount error:', error);
        next(error);
    }
});

// Update discount (scope-checked)
promotionRoutes.put('/discounts/:id', authenticate, authorize('promotions:update'), async (req, res, next) => {
    try {
        const existing = await db.query.discounts.findFirst({ where: eq(discounts.id, req.params.id) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Discount not found' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        const { 
            type, value, startDate, endDate, 
            code, usageLimit, minPurchase, maxDiscount,
            name, description, applyTo, isActive, minQuantity, productIds, categoryIds
        } = req.body;
        
        const discountData: Record<string, unknown> = { updatedAt: new Date() };
        
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
        
        const [discount] = await db.update(discounts).set(discountData as any).where(eq(discounts.id, req.params.id)).returning();

        await invalidateQueryCache('promotions*');
        res.json({ success: true, data: discount });
    } catch (error) {
        console.error('Update discount error:', error);
        next(error);
    }
});

// Delete discount (scope-checked)
promotionRoutes.delete('/discounts/:id', authenticate, authorize('promotions:delete'), async (req, res, next) => {
    try {
        const existing = await db.query.discounts.findFirst({ where: eq(discounts.id, req.params.id) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Discount not found' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        await db.delete(discounts).where(eq(discounts.id, req.params.id));

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

        const pConditions: any[] = [];
        const pScopeCond = buildScopeCondition(filter, { storeId: promotions.storeId }, 'storeId');
        if (pScopeCond) pConditions.push(pScopeCond);
        if (search) {
            const s = String(search);
            pConditions.push(or(ilike(promotions.name, `%${s}%`), ilike(promotions.description, `%${s}%`)));
        }

        if (status === 'active') {
            pConditions.push(eq(promotions.isActive, true), lte(promotions.startDate, now));
            pConditions.push(or(isNull(promotions.endDate), gte(promotions.endDate, now)));
        } else if (status === 'scheduled') {
            pConditions.push(eq(promotions.isActive, true), gt(promotions.startDate, now));
        } else if (status === 'expired') {
            pConditions.push(lt(promotions.endDate, now));
        } else if (status === 'paused') {
            pConditions.push(eq(promotions.isActive, false));
        }

        const pWhere = pConditions.length > 0 ? and(...pConditions) : undefined;

        const [promoRows, [{ value: total }]] = await Promise.all([
            db.query.promotions.findMany({
                where: pWhere,
                offset: skip,
                limit: Number(limit),
                orderBy: desc(promotions.createdAt),
            }),
            db.select({ value: count() }).from(promotions).where(pWhere),
        ]);

        res.json({
            success: true,
            data: promoRows,
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

// Get promotion by ID (scope-checked)
promotionRoutes.get('/:id', authenticate, async (req, res, next) => {
    try {
        const promotion = await db.query.promotions.findFirst({
            where: eq(promotions.id, req.params.id),
        });

        if (!promotion) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Promotion not found' } });
            return;
        }

        if (!ensureScopeAccess(promotion, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
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

        const [promotion] = await db.insert(promotions).values(data as any).returning();

        await invalidateQueryCache('promotions*');
        res.status(201).json({ success: true, data: promotion });
    } catch (error) {
        next(error);
    }
});

// Update promotion (scope-checked)
promotionRoutes.put('/:id', authenticate, authorize('promotions:update'), async (req, res, next) => {
    try {
        const existing = await db.query.promotions.findFirst({ where: eq(promotions.id, req.params.id) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Promotion not found' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        const { id, _id, createdAt, updatedAt, ...body } = req.body;
        const data: Record<string, unknown> = { updatedAt: new Date() };
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

        const [promotion] = await db.update(promotions).set(data as any).where(eq(promotions.id, req.params.id)).returning();

        await invalidateQueryCache('promotions*');
        res.json({ success: true, data: promotion });
    } catch (error) {
        next(error);
    }
});

// Delete promotion (scope-checked)
promotionRoutes.delete('/:id', authenticate, authorize('promotions:delete'), async (req, res, next) => {
    try {
        const existing = await db.query.promotions.findFirst({ where: eq(promotions.id, req.params.id) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Promotion not found' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        await db.delete(promotions).where(eq(promotions.id, req.params.id));

        await invalidateQueryCache('promotions*');
        res.json({ success: true, message: 'Promotion deleted successfully' });
    } catch (error) {
        next(error);
    }
});
