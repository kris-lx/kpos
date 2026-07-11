// ═══════════════════════════════════════════════════════════════════════════
// Customers Module - Routes (Drizzle ORM + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, buildScopeCondition, ensureScopeAccess, invalidateQueryCache, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { setRequestContext } from '@/db/set-tenant-context';
import { db as globalDb } from '@/config/database.config';
import { customers, membershipTiers, settings, pointsHistory, transactions } from '@/db/schema/tables';
import { eq, and, or, ilike, desc, asc, count, sql } from 'drizzle-orm';

export const customerRoutes = Router();

// req.tx (a reserved connection) doesn't support .transaction() — see
// tenant-tx.middleware.ts. Handlers that need real atomicity go through the
// pooled globalDb instead, setting the RLS context with SET LOCAL inside.
async function scopedTransaction(req, callback) {
    return globalDb.transaction(async (tx) => {
        const { tenantId, isSuperAdmin, activeBranchPath } = req.authUser ?? {};
        if (tenantId && !isSuperAdmin) {
            await setRequestContext(tx, { tenantId, branchPath: activeBranchPath }, { local: true });
        }
        return callback(tx);
    });
}

// Get all customers
customerRoutes.get('/', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { page = 1, limit = 50, search, branchId, storeId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;

        const conditions: any[] = [eq(customers.isActive, true)];

        // BE-70: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) {
            conditions.push(eq(customers.tenantId, tenantId));
        }

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
                with: { priceLevel: { columns: { id: true, name: true } } },
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
customerRoutes.get('/loyalty', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const loyaltyTenantId = req.authUser?.tenantId;
        const tierConds: any[] = [eq(membershipTiers.isActive, true)];
        if (loyaltyTenantId && !req.authUser?.isSuperAdmin) {
            tierConds.push(eq(membershipTiers.tenantId, loyaltyTenantId));
        }
        const tierWhere = and(...tierConds);

        const [tiers, [{ value: total }], settingsRow] = await Promise.all([
            db.query.membershipTiers.findMany({
                where: tierWhere,
                orderBy: asc(membershipTiers.sortOrder),
                offset: skip,
                limit: limitNum,
            }),
            db.select({ value: count() }).from(membershipTiers).where(tierWhere),
            db.query.settings.findFirst({ where: loyaltyTenantId
                ? and(eq(settings.category, 'loyalty'), eq(settings.key, 'program_settings'), eq(settings.tenantId, loyaltyTenantId))
                : and(eq(settings.category, 'loyalty'), eq(settings.key, 'program_settings'))
            }),
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
customerRoutes.post('/loyalty/tiers', authenticate, withTenantTx(), authorize('customers:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { name, minPoints, discountPercent, pointsMultiplier, benefits, color } = req.body;

        // Get max sort order scoped to this tenant
        const tierTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const maxOrderConds: any[] = [];
        if (tierTenantId && !req.authUser?.isSuperAdmin) maxOrderConds.push(eq(membershipTiers.tenantId, tierTenantId));
        const maxOrder = await db.query.membershipTiers.findFirst({
            where: maxOrderConds.length > 0 ? and(...maxOrderConds) : undefined,
            orderBy: desc(membershipTiers.sortOrder),
        });

        const [tier] = await db.insert(membershipTiers).values({
            tenantId: tierTenantId,
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
customerRoutes.put('/loyalty/tiers/:id', authenticate, withTenantTx(), authorize('customers:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { name, minPoints, discountPercent, pointsMultiplier, benefits, color, sortOrder } = req.body;

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (name !== undefined) updateData.name = name;
        if (minPoints !== undefined) updateData.minPoints = minPoints;
        if (discountPercent !== undefined) updateData.discountPercent = discountPercent;
        if (pointsMultiplier !== undefined) updateData.pointMultiplier = pointsMultiplier;
        if (benefits !== undefined) updateData.benefits = benefits;
        if (color !== undefined) updateData.color = color;
        if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

        const tierUpdateTenantId = req.authUser?.tenantId;
        const tierUpdateConds: any[] = [eq(membershipTiers.id, req.params.id)];
        if (tierUpdateTenantId && !req.authUser?.isSuperAdmin) tierUpdateConds.push(eq(membershipTiers.tenantId, tierUpdateTenantId));

        const [tier] = await db.update(membershipTiers)
            .set(updateData as any)
            .where(and(...tierUpdateConds))
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
customerRoutes.delete('/loyalty/tiers/:id', authenticate, withTenantTx(), authorize('customers:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const tierDelTenantId = req.authUser?.tenantId;
        const tierDelConds: any[] = [eq(membershipTiers.id, req.params.id)];
        if (tierDelTenantId && !req.authUser?.isSuperAdmin) tierDelConds.push(eq(membershipTiers.tenantId, tierDelTenantId));
        await db.update(membershipTiers)
            .set({ isActive: false, updatedAt: new Date() })
            .where(and(...tierDelConds));

        res.json({ success: true, data: { message: 'Tier deleted' } });
    } catch (error) {
        next(error);
    }
});

// Get loyalty settings
customerRoutes.get('/loyalty/settings', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const loyaltyTenantId = req.authUser?.tenantId;
        const loyaltyGetConds: any[] = [eq(settings.category, 'loyalty'), eq(settings.key, 'program_settings')];
        if (loyaltyTenantId && !req.authUser?.isSuperAdmin) {
            loyaltyGetConds.push(eq(settings.tenantId, loyaltyTenantId));
        }
        const setting = await db.query.settings.findFirst({
            where: and(...loyaltyGetConds),
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
customerRoutes.put('/loyalty/settings', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const loyaltyPutTenantId = req.authUser?.tenantId;
        const loyaltyPutConds: any[] = [eq(settings.category, 'loyalty'), eq(settings.key, 'program_settings')];
        if (loyaltyPutTenantId && !req.authUser?.isSuperAdmin) {
            loyaltyPutConds.push(eq(settings.tenantId, loyaltyPutTenantId));
        }
        const existing = await db.query.settings.findFirst({
            where: and(...loyaltyPutConds),
        });

        let result;
        if (existing) {
            [result] = await db.update(settings)
                .set({ value: req.body, updatedAt: new Date() })
                .where(eq(settings.id, existing.id))
                .returning();
        } else {
            [result] = await db.insert(settings).values({
                tenantId: loyaltyPutTenantId,
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
customerRoutes.get('/lookup/:code', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        // BE-70: Tenant-scoped lookup
        const tenantId = req.authUser?.tenantId;
        const lookupConds: any[] = [
            eq(customers.isActive, true),
            or(
                eq(customers.id, req.params.code),
                eq(customers.phone, req.params.code),
                eq(customers.email, req.params.code),
                eq(customers.memberCode, req.params.code),
            ),
        ];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            lookupConds.push(eq(customers.tenantId, tenantId));
        }

        const customer = await db.query.customers.findFirst({
            where: and(...lookupConds),
        });

        if (!customer) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Customer not found' } });
            return;
        }

        if (!ensureScopeAccess(customer, req)) {
            return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Customer not found' } });
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
customerRoutes.get('/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        // BE-70: Tenant-scoped customer lookup
        const tenantId = req.authUser?.tenantId;
        const getConds: any[] = [eq(customers.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            getConds.push(eq(customers.tenantId, tenantId));
        }

        const customer = await db.query.customers.findFirst({
            where: and(...getConds),
            with: {
                transactions: { limit: 10, orderBy: (t: any, { desc: d }: any) => [d(t.createdAt)] },
                priceLevel: { columns: { id: true, name: true } },
            },
        });

        if (!customer) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Customer not found or no access' } });
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
customerRoutes.post('/', authenticate, withTenantTx(), authorize('customers:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const branchId = req.user!.branchId;
        const authUser = req.authUser!;
        const { name, email, phone, address, taxId, birthDate, gender, notes, points, storeId, priceLevelId } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: { code: 'VAL_001', message: 'ກະລຸນາປ້ອນຊື່ລູກຄ້າ' }
            });
        }

        // Prevent scope spoofing: enforce user's active store unless they are a super admin
        let finalStoreId = storeId || null;
        if (!authUser.isSuperAdmin && authUser.activeStoreId) {
            finalStoreId = authUser.activeStoreId;
        }

        // Generate member code
        const [{ value: custCount }] = await db.select({ value: count() }).from(customers).where(eq(customers.branchId, branchId));
        const memberCode = `MEM${branchId.slice(-4)}${String(custCount + 1).padStart(6, '0')}`;

        const custTenantId = authUser.tenantId;
        const [customer] = await db.insert(customers).values({
            tenantId: custTenantId,
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
            storeId: finalStoreId,
            priceLevelId: priceLevelId || null,
            memberCode,
        }).returning();

        await invalidateQueryCache('customers*');
        res.status(201).json({ success: true, data: customer });
    } catch (error) {
        next(error);
    }
});

// Update customer
customerRoutes.put('/:id', authenticate, withTenantTx(), authorize('customers:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const authUser = req.authUser!;
        const { name, email, phone, address, taxId, birthDate, gender, notes, points, totalSpent, isActive, storeId, priceLevelId } = req.body;

        // BE-70: Tenant-scoped update
        const tenantId = authUser.tenantId;
        if (!authUser.isSuperAdmin && tenantId) {
            const existing = await db.query.customers.findFirst({ where: and(eq(customers.id, req.params.id), eq(customers.tenantId, tenantId)) });
            if (!existing) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Customer not found or no access' } });
            }
            if (authUser.activeStoreId && existing?.storeId && existing.storeId !== authUser.activeStoreId) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify customer from another store' } });
            }
        }

        const updateData: Record<string, unknown> = { updatedAt: new Date() };

        // Prevent scope spoofing: only allow storeId update if super admin
        if (storeId !== undefined) {
             if (authUser.isSuperAdmin) {
                 updateData.storeId = storeId || null;
             } else if (authUser.activeStoreId) {
                 updateData.storeId = authUser.activeStoreId;
             }
        }

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
        if (priceLevelId !== undefined) updateData.priceLevelId = priceLevelId || null;

        // Never allow changing tenantId
        delete updateData.tenantId;

        const updConds: any[] = [eq(customers.id, req.params.id)];
        if (tenantId && !authUser.isSuperAdmin) updConds.push(eq(customers.tenantId, tenantId));
        const [customer] = await db.update(customers)
            .set(updateData as any)
            .where(and(...updConds))
            .returning();
        await invalidateQueryCache('customers*');

        res.json({ success: true, data: customer });
    } catch (error) {
        next(error);
    }
});

// Delete customer (soft delete)
customerRoutes.delete('/:id', authenticate, withTenantTx(), authorize('customers:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const authUser = req.authUser!;

        // BE-70: Tenant-scoped delete
        const tenantId = authUser.tenantId;
        const delConds: any[] = [eq(customers.id, req.params.id)];
        if (tenantId && !authUser.isSuperAdmin) {
            delConds.push(eq(customers.tenantId, tenantId));
        }
        if (!authUser.isSuperAdmin && authUser.activeStoreId) {
            const existing = await db.query.customers.findFirst({ where: and(...delConds) });
            if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Customer not found or no access' } });
            if (existing?.storeId && existing.storeId !== authUser.activeStoreId) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete customer from another store' } });
            }
        }

        await db.update(customers)
            .set({ isActive: false, updatedAt: new Date() })
            .where(and(...delConds));
        await invalidateQueryCache('customers*');

        res.json({ success: true, data: { message: 'Customer deleted' } });
    } catch (error) {
        next(error);
    }
});

// Add points to customer
customerRoutes.post('/:id/points', authenticate, withTenantTx(), authorize('customers:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { points, reason } = req.body;

        const existing = await db.query.customers.findFirst({ where: eq(customers.id, req.params.id) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Customer not found' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this customer' } });

        const adjustTenantId = req.authUser?.tenantId;
        const adjustUserId = req.authUser?.userId;

        const customer = await scopedTransaction(req, async (tx) => {
            const [updated] = await tx.update(customers)
                .set({ points: sql`${customers.points} + ${points}`, updatedAt: new Date() })
                .where(eq(customers.id, req.params.id))
                .returning();
            await tx.insert(pointsHistory).values({
                tenantId: adjustTenantId,
                customerId: req.params.id,
                points,
                type: 'ADJUST',
                reason: reason || 'Manual adjustment',
                createdBy: adjustUserId,
            });
            return updated;
        });

        res.json({ success: true, data: customer });
    } catch (error) {
        next(error);
    }
});

// Get points history for a customer
customerRoutes.get('/:id/points/history', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const customer = await db.query.customers.findFirst({ where: eq(customers.id, req.params.id) });
        if (!customer) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Customer not found' } });
        if (!ensureScopeAccess(customer, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

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

// Get purchase/sales history for a customer
customerRoutes.get('/:id/sales', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const customer = await db.query.customers.findFirst({ where: eq(customers.id, req.params.id) });
        if (!customer) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Customer not found' } });
        if (!ensureScopeAccess(customer, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        const { page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const whereClause = eq(transactions.customerId, req.params.id);

        const [txns, [{ value: total }]] = await Promise.all([
            db.query.transactions.findMany({
                where: whereClause,
                orderBy: desc(transactions.createdAt),
                offset: skip,
                limit: Number(limit),
                with: { items: { columns: { id: true, productName: true, quantity: true, unitPrice: true } } },
            }),
            db.select({ value: count() }).from(transactions).where(whereClause),
        ]);

        res.json({
            success: true,
            data: txns,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Adjust points for a customer (add/deduct)
customerRoutes.post('/:id/points/adjust', authenticate, withTenantTx(), authorize('customers:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbRead = db;
        const { points, reason } = req.body;
        const customerId = req.params.id;
        const userId = req.authUser!.userId;

        // Get current customer
        const customer = await db.query.customers.findFirst({
            where: eq(customers.id, customerId),
        });

        if (!customer) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Customer not found' } });
            return;
        }

        if (!ensureScopeAccess(customer, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this customer' } });
        }

        // Update customer points and create history record in a transaction
        const adjustTenantId = req.authUser?.tenantId;
        const { updatedCustomer, historyRecord } = await scopedTransaction(req, async (tx) => {
            const [updatedCustomer] = await tx.update(customers)
                .set({ points: sql`${customers.points} + ${points}`, updatedAt: new Date() })
                .where(eq(customers.id, customerId))
                .returning();

            const [historyRecord] = await tx.insert(pointsHistory).values({
                tenantId: adjustTenantId,
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
