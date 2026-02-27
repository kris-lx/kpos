// ═══════════════════════════════════════════════════════════════════════════
// Customers Module - Routes (Drizzle ORM + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, buildScopeCondition, ensureScopeAccess, invalidateQueryCache, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { customers, membershipTiers, settings, pointsHistory } from '@/db/schema/tables';
import { eq, and, or, ilike, desc, asc, count, sql } from 'drizzle-orm';

export const customerRoutes = Router();

// Get all customers
customerRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { page = 1, limit = 50, search, branchId, storeId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter as ScopeFilter | undefined;

        const conditions = [eq(customers.isActive, true)];

        // Apply store-level or branch-level scope
        const scopeWhere = buildScopeCondition(filter, { storeId: customers.storeId, branchId: customers.branchId }, 'storeId');
        if (scopeWhere) conditions.push(scopeWhere);

        // Override with explicit query params
        if (storeId) {
            conditions.push(eq(customers.storeId, String(storeId)));
        }
        if (branchId) {
            if (filter && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                });
            }
            conditions.push(eq(customers.branchId, String(branchId)));
        }
        if (search) {
            const s = String(search);
            conditions.push(or(
                ilike(customers.name, `%${s}%`),
                ilike(customers.phone, `%${s}%`),
                ilike(customers.email, `%${s}%`),
                ilike(customers.memberCode, `%${s}%`),
            )!);
        }

        const whereClause = and(...conditions);

        const [rows, [{ value: total }]] = await Promise.all([
            db.query.customers.findMany({
                where: whereClause,
                offset: skip,
                limit: Number(limit),
                orderBy: desc(customers.createdAt),
            }),
            db.select({ value: count() }).from(customers).where(whereClause),
        ]);

        res.json({
            success: true,
            data: rows,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// LOYALTY PROGRAM ROUTES (Must be before /:id to avoid conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// Get loyalty program (tiers + settings)
customerRoutes.get('/loyalty', authenticate, async (req, res, next) => {
    try {
        const { page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const [tiers, [{ value: total }], settingsRow] = await Promise.all([
            db.query.membershipTiers.findMany({
                where: eq(membershipTiers.isActive, true),
                orderBy: asc(membershipTiers.sortOrder),
                offset: skip,
                limit: limitNum,
            }),
            db.select({ value: count() }).from(membershipTiers).where(eq(membershipTiers.isActive, true)),
            db.query.settings.findFirst({ where: and(eq(settings.category, 'loyalty'), eq(settings.key, 'program_settings')) }),
        ]);

        // Transform tiers to match frontend expected format
        const transformedTiers = tiers.map(tier => ({
            id: tier.id,
            name: tier.name,
            minPoints: tier.minPoints,
            discountPercent: tier.discountPercent,
            pointsMultiplier: tier.pointMultiplier,
            benefits: tier.benefits || [],
            color: tier.color || '#6B7280',
            icon: '⭐',
            sortOrder: tier.sortOrder,
        }));

        // Default settings if not found
        const defaultSettings = {
            programName: 'KPOS Loyalty',
            earnRate: 1,
            redeemRate: 100,
            pointsExpiry: 365,
            welcomeBonus: 50,
            birthdayBonus: 100,
            referralBonus: 200,
            isActive: true,
        };

        res.json({
            success: true,
            data: {
                tiers: transformedTiers,
                settings: settingsRow?.value || defaultSettings,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

// Create loyalty tier
customerRoutes.post('/loyalty/tiers', authenticate, authorize('customers:create'), async (req, res, next) => {
    try {
        const { name, minPoints, discountPercent, pointsMultiplier, benefits, color } = req.body;

        // Get max sort order
        const maxOrder = await db.query.membershipTiers.findFirst({
            orderBy: desc(membershipTiers.sortOrder),
        });

        const [tier] = await db.insert(membershipTiers).values({
            name,
            minPoints: minPoints || 0,
            discountPercent: discountPercent || 0,
            pointMultiplier: pointsMultiplier || 1,
            benefits: benefits || [],
            color: color || '#6B7280',
            sortOrder: (maxOrder?.sortOrder || 0) + 1,
        }).returning();

        res.status(201).json({
            success: true,
            data: {
                id: tier.id,
                name: tier.name,
                minPoints: tier.minPoints,
                discountPercent: tier.discountPercent,
                pointsMultiplier: tier.pointMultiplier,
                benefits: tier.benefits,
                color: tier.color,
                sortOrder: tier.sortOrder,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Update loyalty tier
customerRoutes.put('/loyalty/tiers/:id', authenticate, authorize('customers:update'), async (req, res, next) => {
    try {
        const { name, minPoints, discountPercent, pointsMultiplier, benefits, color, sortOrder } = req.body;

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (name !== undefined) updateData.name = name;
        if (minPoints !== undefined) updateData.minPoints = minPoints;
        if (discountPercent !== undefined) updateData.discountPercent = discountPercent;
        if (pointsMultiplier !== undefined) updateData.pointMultiplier = pointsMultiplier;
        if (benefits !== undefined) updateData.benefits = benefits;
        if (color !== undefined) updateData.color = color;
        if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

        const [tier] = await db.update(membershipTiers)
            .set(updateData as any)
            .where(eq(membershipTiers.id, req.params.id))
            .returning();

        res.json({
            success: true,
            data: {
                id: tier.id,
                name: tier.name,
                minPoints: tier.minPoints,
                discountPercent: tier.discountPercent,
                pointsMultiplier: tier.pointMultiplier,
                benefits: tier.benefits,
                color: tier.color,
                sortOrder: tier.sortOrder,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Delete loyalty tier (soft delete)
customerRoutes.delete('/loyalty/tiers/:id', authenticate, authorize('customers:delete'), async (req, res, next) => {
    try {
        await db.update(membershipTiers)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(membershipTiers.id, req.params.id));

        res.json({ success: true, data: { message: 'Tier deleted' } });
    } catch (error) {
        next(error);
    }
});

// Get loyalty settings
customerRoutes.get('/loyalty/settings', authenticate, async (req, res, next) => {
    try {
        const setting = await db.query.settings.findFirst({
            where: and(eq(settings.category, 'loyalty'), eq(settings.key, 'program_settings')),
        });

        const defaults = {
            enabled: true,
            pointsPerAmount: 1,
            amountPerPoint: 10000,
            pointValue: 100,
            minPointsRedeem: 100,
            maxPointsRedeem: 0,
            pointExpiryDays: 365,
            noExpiry: false,
        };

        const data = setting ? (typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value) : defaults;
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

// Save loyalty settings
customerRoutes.put('/loyalty/settings', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const existing = await db.query.settings.findFirst({
            where: and(eq(settings.category, 'loyalty'), eq(settings.key, 'program_settings')),
        });

        let result;
        if (existing) {
            [result] = await db.update(settings)
                .set({ value: req.body, updatedAt: new Date() })
                .where(eq(settings.id, existing.id))
                .returning();
        } else {
            [result] = await db.insert(settings).values({
                category: 'loyalty',
                key: 'program_settings',
                value: req.body,
            }).returning();
        }

        res.json({ success: true, data: result.value });
    } catch (error) {
        next(error);
    }
});

// Lookup customer by phone/member code
// MUST be before /:id to prevent Express matching 'lookup' as :id
customerRoutes.get('/lookup/:code', authenticate, async (req, res, next) => {
    try {
        const customer = await db.query.customers.findFirst({
            where: and(
                eq(customers.isActive, true),
                or(eq(customers.phone, req.params.code), eq(customers.memberCode, req.params.code)),
            ),
        });

        if (!customer) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Customer not found' } });
            return;
        }

        res.json({ success: true, data: customer });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER DETAIL ROUTES (/:id must be after all named routes like /lookup, /loyalty)
// ═══════════════════════════════════════════════════════════════════════════

// Get customer by ID (scope-checked)
customerRoutes.get('/:id', authenticate, async (req, res, next) => {
    try {
        const customer = await db.query.customers.findFirst({
            where: eq(customers.id, req.params.id),
            with: {
                transactions: { limit: 10, orderBy: (t: any, { desc: d }: any) => [d(t.createdAt)] },
            },
        });

        if (!customer) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Customer not found' } });
            return;
        }

        if (!ensureScopeAccess(customer, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this customer' } });
        }

        res.json({ success: true, data: customer });
    } catch (error) {
        next(error);
    }
});

// Create customer
customerRoutes.post('/', authenticate, authorize('customers:create'), async (req, res, next) => {
    try {
        const branchId = req.user!.branchId;
        const authUser = (req as any).user;
        const { name, email, phone, address, taxId, birthDate, gender, notes, points, storeId } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: { code: 'VAL_001', message: 'ກະລຸນາປ້ອນຊື່ລູກຄ້າ' }
            });
        }

        // Generate member code
        const [{ value: custCount }] = await db.select({ value: count() }).from(customers).where(eq(customers.branchId, branchId));
        const memberCode = `MEM${branchId.slice(-4)}${String(custCount + 1).padStart(6, '0')}`;

        const [customer] = await db.insert(customers).values({
            name: name.trim(),
            email: email?.trim() || null,
            phone: phone?.trim() || null,
            address: address?.trim() || null,
            taxId: taxId?.trim() || null,
            birthDate: birthDate ? new Date(birthDate) : null,
            gender: gender || null,
            notes: notes?.trim() || null,
            points: points || 0,
            branchId,
            storeId: storeId || authUser?.activeStoreId || null,
            memberCode,
        }).returning();

        await invalidateQueryCache('customers*');
        res.status(201).json({ success: true, data: customer });
    } catch (error) {
        next(error);
    }
});

// Update customer
customerRoutes.put('/:id', authenticate, authorize('customers:update'), async (req, res, next) => {
    try {
        const authUser = (req as any).user;
        const { name, email, phone, address, taxId, birthDate, gender, notes, points, totalSpent, isActive, storeId } = req.body;

        // Verify ownership: customer must belong to user's store (unless super admin)
        if (!authUser?.isSuperAdmin && authUser?.activeStoreId) {
            const existing = await db.query.customers.findFirst({ where: eq(customers.id, req.params.id) });
            if (existing?.storeId && existing.storeId !== authUser.activeStoreId) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify customer from another store' } });
            }
        }

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (storeId !== undefined) updateData.storeId = storeId || null;
        if (name !== undefined) updateData.name = name.trim();
        if (email !== undefined) updateData.email = email?.trim() || null;
        if (phone !== undefined) updateData.phone = phone?.trim() || null;
        if (address !== undefined) updateData.address = address?.trim() || null;
        if (taxId !== undefined) updateData.taxId = taxId?.trim() || null;
        if (birthDate !== undefined) updateData.birthDate = birthDate ? new Date(birthDate) : null;
        if (gender !== undefined) updateData.gender = gender || null;
        if (notes !== undefined) updateData.notes = notes?.trim() || null;
        if (points !== undefined) updateData.points = Number(points) || 0;
        if (totalSpent !== undefined) updateData.totalSpent = Number(totalSpent) || 0;
        if (isActive !== undefined) updateData.isActive = Boolean(isActive);

        const [customer] = await db.update(customers)
            .set(updateData as any)
            .where(eq(customers.id, req.params.id))
            .returning();
        await invalidateQueryCache('customers*');

        res.json({ success: true, data: customer });
    } catch (error) {
        next(error);
    }
});

// Delete customer (soft delete)
customerRoutes.delete('/:id', authenticate, authorize('customers:delete'), async (req, res, next) => {
    try {
        const authUser = (req as any).user;

        // Verify ownership
        if (!authUser?.isSuperAdmin && authUser?.activeStoreId) {
            const existing = await db.query.customers.findFirst({ where: eq(customers.id, req.params.id) });
            if (existing?.storeId && existing.storeId !== authUser.activeStoreId) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete customer from another store' } });
            }
        }

        await db.update(customers)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(customers.id, req.params.id));
        await invalidateQueryCache('customers*');

        res.json({ success: true, data: { message: 'Customer deleted' } });
    } catch (error) {
        next(error);
    }
});

// Add points to customer
customerRoutes.post('/:id/points', authenticate, authorize('customers:update'), async (req, res, next) => {
    try {
        const { points } = req.body;

        const [customer] = await db.update(customers)
            .set({ points: sql`${customers.points} + ${points}`, updatedAt: new Date() })
            .where(eq(customers.id, req.params.id))
            .returning();

        res.json({ success: true, data: customer });
    } catch (error) {
        next(error);
    }
});

// Get points history for a customer
customerRoutes.get('/:id/points/history', authenticate, async (req, res, next) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const phWhere = eq(pointsHistory.customerId, req.params.id);
        const [history, [{ value: total }]] = await Promise.all([
            db.query.pointsHistory.findMany({
                where: phWhere,
                orderBy: desc(pointsHistory.createdAt),
                offset: skip,
                limit: Number(limit),
            }),
            db.select({ value: count() }).from(pointsHistory).where(phWhere),
        ]);

        res.json({
            success: true,
            data: history,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Adjust points for a customer (add/deduct)
customerRoutes.post('/:id/points/adjust', authenticate, authorize('customers:update'), async (req, res, next) => {
    try {
        const { points, reason } = req.body;
        const customerId = req.params.id;
        const userId = req.user!.id;

        // Get current customer
        const customer = await db.query.customers.findFirst({
            where: eq(customers.id, customerId),
        });

        if (!customer) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Customer not found' } });
            return;
        }

        // Update customer points and create history record in a transaction
        const { updatedCustomer, historyRecord } = await db.transaction(async (tx) => {
            const [updatedCustomer] = await tx.update(customers)
                .set({ points: sql`${customers.points} + ${points}`, updatedAt: new Date() })
                .where(eq(customers.id, customerId))
                .returning();

            const [historyRecord] = await tx.insert(pointsHistory).values({
                customerId,
                points,
                type: 'ADJUST',
                reason: reason || (points > 0 ? 'Manual points addition' : 'Manual points deduction'),
                createdBy: userId,
            }).returning();

            return { updatedCustomer, historyRecord };
        });

        res.json({ success: true, data: { customer: updatedCustomer, history: historyRecord } });
    } catch (error) {
        next(error);
    }
});
