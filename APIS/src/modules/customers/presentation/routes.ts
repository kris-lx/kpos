// ═══════════════════════════════════════════════════════════════════════════
// Customers Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const customerRoutes = Router();

// Get all customers
customerRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { page = 1, limit = 50, search, branchId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;

        const where: Record<string, unknown> = { isActive: true };
        
        // Apply branch filter for non-admin users
        if (filter?.branchIds?.length) {
            where.branchId = { in: filter.branchIds };
        }
        if (branchId) {
            if (filter && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                });
            }
            where.branchId = String(branchId);
        }
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { phone: { contains: String(search) } },
                { email: { contains: String(search), mode: 'insensitive' } },
                { memberCode: { contains: String(search) } },
            ];
        }

        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.customer.count({ where }),
        ]);

        res.json({
            success: true,
            data: customers,
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

        const [tiers, total, settings] = await Promise.all([
            prisma.membershipTier.findMany({
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
                skip,
                take: limitNum,
            }),
            prisma.membershipTier.count({ where: { isActive: true } }),
            prisma.settings.findFirst({ where: { category: 'loyalty', key: 'program_settings' } }),
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
                settings: settings?.value || defaultSettings,
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
        const maxOrder = await prisma.membershipTier.findFirst({
            orderBy: { sortOrder: 'desc' },
            select: { sortOrder: true },
        });

        const tier = await prisma.membershipTier.create({
            data: {
                name,
                minPoints: minPoints || 0,
                discountPercent: discountPercent || 0,
                pointMultiplier: pointsMultiplier || 1,
                benefits: benefits || [],
                color: color || '#6B7280',
                sortOrder: (maxOrder?.sortOrder || 0) + 1,
            },
        });

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

        const tier = await prisma.membershipTier.update({
            where: { id: req.params.id },
            data: {
                name,
                minPoints: minPoints ?? undefined,
                discountPercent: discountPercent ?? undefined,
                pointMultiplier: pointsMultiplier ?? undefined,
                benefits: benefits ?? undefined,
                color: color ?? undefined,
                sortOrder: sortOrder ?? undefined,
            },
        });

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
        await prisma.membershipTier.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });

        res.json({ success: true, data: { message: 'Tier deleted' } });
    } catch (error) {
        next(error);
    }
});

// Save loyalty settings
customerRoutes.put('/loyalty/settings', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const settings = await prisma.settings.upsert({
            where: { 
                category_key_branchId: {
                    category: 'loyalty',
                    key: 'program_settings',
                    branchId: null as any,
                }
            },
            create: {
                category: 'loyalty',
                key: 'program_settings',
                value: req.body,
            },
            update: {
                value: req.body,
            },
        });

        res.json({ success: true, data: settings.value });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER DETAIL ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Get customer by ID
customerRoutes.get('/:id', authenticate, async (req, res, next) => {
    try {
        const customer = await prisma.customer.findUnique({
            where: { id: req.params.id },
            include: {
                transactions: { take: 10, orderBy: { createdAt: 'desc' } },
            },
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

// Create customer
customerRoutes.post('/', authenticate, authorize('customers:create'), async (req, res, next) => {
    try {
        const branchId = req.user!.branchId;

        // Generate member code
        const count = await prisma.customer.count({ where: { branchId } });
        const memberCode = `MEM${branchId.slice(-4)}${String(count + 1).padStart(6, '0')}`;

        const customer = await prisma.customer.create({
            data: {
                ...req.body,
                branchId,
                memberCode,
            },
        });

        res.status(201).json({ success: true, data: customer });
    } catch (error) {
        next(error);
    }
});

// Update customer
customerRoutes.put('/:id', authenticate, authorize('customers:update'), async (req, res, next) => {
    try {
        const customer = await prisma.customer.update({
            where: { id: req.params.id },
            data: req.body,
        });

        res.json({ success: true, data: customer });
    } catch (error) {
        next(error);
    }
});

// Delete customer (soft delete)
customerRoutes.delete('/:id', authenticate, authorize('customers:delete'), async (req, res, next) => {
    try {
        await prisma.customer.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });

        res.json({ success: true, data: { message: 'Customer deleted' } });
    } catch (error) {
        next(error);
    }
});

// Lookup customer by phone/member code
customerRoutes.get('/lookup/:code', authenticate, async (req, res, next) => {
    try {
        const customer = await prisma.customer.findFirst({
            where: {
                OR: [{ phone: req.params.code }, { memberCode: req.params.code }],
                isActive: true,
            },
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

// Add points to customer
customerRoutes.post('/:id/points', authenticate, authorize('customers:update'), async (req, res, next) => {
    try {
        const { points } = req.body;

        const customer = await prisma.customer.update({
            where: { id: req.params.id },
            data: {
                points: { increment: points },
            },
        });

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

        const [history, total] = await Promise.all([
            prisma.pointsHistory.findMany({
                where: { customerId: req.params.id },
                orderBy: { createdAt: 'desc' },
                skip,
                take: Number(limit),
            }),
            prisma.pointsHistory.count({ where: { customerId: req.params.id } }),
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
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
        });

        if (!customer) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Customer not found' } });
            return;
        }

        // Update customer points and create history record
        const [updatedCustomer, historyRecord] = await prisma.$transaction([
            prisma.customer.update({
                where: { id: customerId },
                data: {
                    points: { increment: points },
                },
            }),
            prisma.pointsHistory.create({
                data: {
                    customerId,
                    points,
                    type: points > 0 ? 'ADJUST' : 'ADJUST',
                    reason: reason || (points > 0 ? 'Manual points addition' : 'Manual points deduction'),
                    createdBy: userId,
                },
            }),
        ]);

        res.json({ success: true, data: { customer: updatedCustomer, history: historyRecord } });
    } catch (error) {
        next(error);
    }
});
