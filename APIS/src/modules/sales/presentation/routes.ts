// ═══════════════════════════════════════════════════════════════════════════
// Sales Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const salesRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// CREATE SALE (Transaction)
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.post('/', authenticate, async (req, res, next) => {
    try {
        const {
            items,
            customerId,
            memberId,
            paymentMethod,
            paymentMethodId,
            discountType,
            discountValue = 0,
            taxRate = 7,
            notes,
            orderType = 'WALKIN',
        } = req.body;

        const branchId = req.user!.branchId;
        const userId = req.user!.userId;

        // Calculate totals
        let subtotal = 0;
        const transactionItems = [];

        for (const item of items) {
            const product = await prisma.product.findUnique({
                where: { id: item.productId },
                select: { id: true, name: true, sku: true, barcode: true, price: true, cost: true }
            });

            if (!product) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'PRODUCT_NOT_FOUND', message: `Product ${item.productId} not found` }
                });
            }

            const unitPrice = item.price || product.price;
            const quantity = item.quantity;
            const itemDiscount = item.discount || 0;
            const itemTotal = (unitPrice * quantity) - itemDiscount;
            subtotal += itemTotal;

            transactionItems.push({
                productId: item.productId,
                productName: product.name,
                sku: product.sku,
                barcode: product.barcode,
                quantity,
                unitPrice,
                cost: product.cost,
                discountType: item.discountType,
                discountValue: item.discountValue || 0,
                discountAmount: itemDiscount,
                taxRate: 0,
                taxAmount: 0,
                total: itemTotal,
                note: item.note,
            });
        }

        // Calculate discount
        let discountAmount = 0;
        if (discountType === 'PERCENTAGE') {
            discountAmount = (subtotal * discountValue) / 100;
        } else if (discountType === 'FIXED') {
            discountAmount = discountValue;
        }

        // Calculate tax
        const taxableAmount = subtotal - discountAmount;
        const taxAmount = (taxableAmount * taxRate) / 100;
        const totalAmount = taxableAmount + taxAmount;

        // Generate transaction number with timestamp for uniqueness
        const now = new Date();
        const today = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.getTime().toString().slice(-6); // Last 6 digits of timestamp
        const count = await prisma.transaction.count({
            where: { createdAt: { gte: new Date(now.setHours(0, 0, 0, 0)) } },
        });
        const transactionNo = `TXN-${branchId.slice(-4)}-${today}-${String(count + 1).padStart(4, '0')}-${timeStr}`;

        // Get payment method details
        let methodName = paymentMethod || 'CASH';
        let methodId = paymentMethodId;

        if (!methodId) {
            const method = await prisma.paymentMethod.findFirst({
                where: { type: methodName }
            });
            if (method) {
                methodId = method.id;
                methodName = method.name;
            }
        }

        // Create transaction with items and payment
        const transaction = await prisma.transaction.create({
            data: {
                transactionNo,
                type: 'SALE',
                status: 'COMPLETED',
                branchId,
                userId,
                customerId,
                memberId,
                orderType,
                subtotal,
                discountType,
                discountValue,
                discountAmount,
                taxAmount,
                total: totalAmount,
                received: totalAmount,
                change: 0,
                note: notes,
                items: { create: transactionItems },
                payments: methodId ? {
                    create: {
                        methodId,
                        methodName,
                        amount: totalAmount
                    }
                } : undefined
            },
            include: {
                items: { include: { product: true } },
                customer: true,
                payments: true
            },
        });

        // Update inventory (stock deduction)
        for (const item of items) {
            // Find inventory record
            const inventory = await prisma.inventory.findFirst({
                where: { productId: item.productId, branchId }
            });

            if (inventory) {
                const previousQty = inventory.quantity;
                const newQty = previousQty - item.quantity;

                await prisma.inventory.update({
                    where: { id: inventory.id },
                    data: {
                        quantity: newQty,
                        available: newQty - inventory.reserved
                    },
                });

                // Create stock movement record
                await prisma.stockMovement.create({
                    data: {
                        productId: item.productId,
                        branchId,
                        type: 'OUT',
                        quantity: item.quantity,
                        previousQty,
                        newQty,
                        reason: 'Sale',
                        reference: transaction.id,
                        referenceType: 'SALE',
                        userId,
                    },
                });
            }
        }

        res.status(201).json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL SALES (Transactions)
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.get('/', authenticate, async (req, res, next) => {
    try {
        const { page = 1, limit = 50, startDate, endDate, status, type, branchId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const userPermissions = req.authUser?.permissions || [];

        const where: Record<string, unknown> = {
            type: 'SALE' // Only get sale transactions
        };

        // Check if user can only view their own sales
        const canViewAllSales = userPermissions.includes('sales:view') || userPermissions.includes('*');
        const canViewOwnSales = userPermissions.includes('sales:view-own');
        
        if (!canViewAllSales && canViewOwnSales) {
            // User can only view their own sales
            where.userId = req.user!.userId;
        }

        if (branchId) where.branchId = String(branchId);
        else where.branchId = req.user!.branchId;

        if (status) where.status = String(status);
        if (type) where.type = String(type);

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(String(startDate));
            if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(String(endDate));
        }

        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                skip,
                take: Number(limit),
                include: {
                    items: true,
                    customer: true,
                    payments: true,
                    user: { select: { id: true, name: true } }
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.transaction.count({ where }),
        ]);

        res.json({
            success: true,
            data: transactions,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET SALE BY ID (must be after all specific routes like /held, /credit)
// Note: Using regex to match only valid MongoDB ObjectIds (24 hex characters)
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.get('/:id([a-fA-F0-9]{24})', authenticate, async (req, res, next) => {
    try {
        const transaction = await prisma.transaction.findUnique({
            where: { id: req.params.id },
            include: {
                items: { include: { product: true } },
                customer: true,
                member: true,
                payments: true,
                user: { select: { id: true, name: true } }
            },
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Transaction not found' }
            });
        }

        res.json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// VOID SALE
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.post('/:id([a-fA-F0-9]{24})/void', authenticate, authorize('sales:delete'), async (req, res, next) => {
    try {
        const { reason } = req.body;

        const transaction = await prisma.transaction.findUnique({
            where: { id: req.params.id },
            include: { items: true },
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Transaction not found' }
            });
        }

        if (transaction.status === 'VOIDED') {
            return res.status(400).json({
                success: false,
                error: { code: 'ALREADY_VOIDED', message: 'Transaction already voided' }
            });
        }

        // Void the transaction
        await prisma.transaction.update({
            where: { id: req.params.id },
            data: {
                status: 'VOIDED',
                voidReason: reason
            },
        });

        // Restore inventory
        for (const item of transaction.items) {
            const inventory = await prisma.inventory.findFirst({
                where: { productId: item.productId, branchId: transaction.branchId }
            });

            if (inventory) {
                const previousQty = inventory.quantity;
                const newQty = previousQty + item.quantity;

                await prisma.inventory.update({
                    where: { id: inventory.id },
                    data: {
                        quantity: newQty,
                        available: newQty - inventory.reserved
                    },
                });

                await prisma.stockMovement.create({
                    data: {
                        productId: item.productId,
                        branchId: transaction.branchId,
                        type: 'IN',
                        quantity: item.quantity,
                        previousQty,
                        newQty,
                        reason: `Void: ${reason || 'No reason provided'}`,
                        reference: transaction.id,
                        referenceType: 'VOID',
                        userId: req.user!.userId,
                    },
                });
            }
        }

        res.json({ success: true, message: 'Transaction voided successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// REFUND SALE
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.post('/:id([a-fA-F0-9]{24})/refund', authenticate, authorize('sales:delete'), async (req, res, next) => {
    try {
        const { reason, items: refundItems } = req.body;

        const transaction = await prisma.transaction.findUnique({
            where: { id: req.params.id },
            include: { items: true },
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Transaction not found' }
            });
        }

        if (transaction.status !== 'COMPLETED') {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_STATUS', message: 'Can only refund completed transactions' }
            });
        }

        // Calculate refund amount
        let refundAmount = 0;
        const itemsToRefund = refundItems || transaction.items;

        for (const item of itemsToRefund) {
            refundAmount += item.total || (item.unitPrice * item.quantity);
        }

        // Generate refund transaction number
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.transaction.count({
            where: { type: 'REFUND', createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        });
        const transactionNo = `REF-${transaction.branchId.slice(-4)}-${today}-${String(count + 1).padStart(4, '0')}`;

        // Create refund transaction
        const refund = await prisma.transaction.create({
            data: {
                transactionNo,
                type: 'REFUND',
                status: 'COMPLETED',
                branchId: transaction.branchId,
                userId: req.user!.userId,
                customerId: transaction.customerId,
                memberId: transaction.memberId,
                orderType: transaction.orderType,
                subtotal: -refundAmount,
                discountAmount: 0,
                taxAmount: 0,
                total: -refundAmount,
                received: 0,
                change: refundAmount,
                refundReason: reason,
                parentId: transaction.id,
                items: {
                    create: itemsToRefund.map((item: any) => ({
                        productId: item.productId,
                        productName: item.productName,
                        quantity: -item.quantity,
                        unitPrice: item.unitPrice,
                        cost: item.cost || 0,
                        total: -(item.total || (item.unitPrice * item.quantity)),
                    }))
                }
            },
            include: { items: true }
        });

        // Restore inventory for refunded items
        for (const item of itemsToRefund) {
            const inventory = await prisma.inventory.findFirst({
                where: { productId: item.productId, branchId: transaction.branchId }
            });

            if (inventory) {
                const previousQty = inventory.quantity;
                const newQty = previousQty + item.quantity;

                await prisma.inventory.update({
                    where: { id: inventory.id },
                    data: {
                        quantity: newQty,
                        available: newQty - inventory.reserved
                    },
                });

                await prisma.stockMovement.create({
                    data: {
                        productId: item.productId,
                        branchId: transaction.branchId,
                        type: 'IN',
                        quantity: item.quantity,
                        previousQty,
                        newQty,
                        reason: `Refund: ${reason || 'No reason provided'}`,
                        reference: refund.id,
                        referenceType: 'REFUND',
                        userId: req.user!.userId,
                    },
                });
            }
        }

        // Update original transaction status
        await prisma.transaction.update({
            where: { id: req.params.id },
            data: { status: 'REFUNDED' }
        });

        res.json({ success: true, data: refund });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DAILY SALES SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.get('/summary/daily', authenticate, async (req, res, next) => {
    try {
        const { date } = req.query;
        const targetDate = date ? new Date(String(date)) : new Date();
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const branchId = req.user!.branchId;

        const [salesStats, voidedCount, refundStats] = await Promise.all([
            prisma.transaction.aggregate({
                where: {
                    branchId,
                    createdAt: { gte: startOfDay, lte: endOfDay },
                    type: 'SALE',
                    status: 'COMPLETED'
                },
                _count: { id: true },
                _sum: { total: true },
            }),
            prisma.transaction.count({
                where: {
                    branchId,
                    createdAt: { gte: startOfDay, lte: endOfDay },
                    status: 'VOIDED'
                },
            }),
            prisma.transaction.aggregate({
                where: {
                    branchId,
                    createdAt: { gte: startOfDay, lte: endOfDay },
                    type: 'REFUND'
                },
                _count: { id: true },
                _sum: { total: true },
            }),
        ]);

        res.json({
            success: true,
            data: {
                date: startOfDay.toISOString().slice(0, 10),
                salesCount: salesStats._count.id,
                totalRevenue: salesStats._sum.total || 0,
                voidedCount,
                refundCount: refundStats._count.id,
                refundAmount: Math.abs(refundStats._sum.total || 0),
                netRevenue: (salesStats._sum.total || 0) + (refundStats._sum.total || 0),
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SHIFTS
// ═══════════════════════════════════════════════════════════════════════════

// Get all shifts
salesRoutes.get('/shifts', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { branchId, userId, status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;

        const where: Record<string, unknown> = {};
        
        // Apply branch filter for non-admin users
        if (filter?.branchIds?.length) {
            where.branchId = { in: filter.branchIds };
        }
        if (branchId) where.branchId = String(branchId);
        if (userId) where.userId = String(userId);
        if (status) where.status = String(status);

        const [shifts, total] = await Promise.all([
            prisma.shift.findMany({
                where,
                skip,
                take: Number(limit),
                include: { user: { select: { name: true, email: true } }, register: true },
                orderBy: { openedAt: 'desc' },
            }),
            prisma.shift.count({ where }),
        ]);

        res.json({
            success: true,
            data: shifts,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get current user's active shift
salesRoutes.get('/shifts/current', authenticate, async (req, res, next) => {
    try {
        const shift = await prisma.shift.findFirst({
            where: {
                userId: req.user!.userId,
                status: 'OPEN',
            },
            include: { user: { select: { name: true } }, register: true },
        });

        res.json({ success: true, data: shift });
    } catch (error) {
        next(error);
    }
});

// Get shift by ID
salesRoutes.get('/shifts/:id', authenticate, async (req, res, next) => {
    try {
        const shift = await prisma.shift.findUnique({
            where: { id: req.params.id },
            include: {
                user: { select: { name: true, email: true } },
                register: true,
                transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
                cashMovements: { orderBy: { createdAt: 'desc' } },
            },
        });

        if (!shift) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Shift not found' } });
            return;
        }

        res.json({ success: true, data: shift });
    } catch (error) {
        next(error);
    }
});

// Open shift
salesRoutes.post('/shifts/open', authenticate, async (req, res, next) => {
    try {
        const { openingBalance, registerId, notes } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId;

        // Check if user already has an open shift
        const existingShift = await prisma.shift.findFirst({
            where: { userId, status: 'OPEN' },
        });

        if (existingShift) {
            res.status(400).json({ success: false, error: { code: 'SHIFT_001', message: 'You already have an open shift' } });
            return;
        }

        // Generate shift number
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.shift.count({
            where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        });
        const shiftNo = `SFT-${today}-${String(count + 1).padStart(3, '0')}`;

        const shift = await prisma.shift.create({
            data: {
                shiftNo,
                branchId,
                userId,
                registerId,
                openingBalance: openingBalance || 0,
                notes,
            },
            include: { user: { select: { name: true } }, register: true },
        });

        res.status(201).json({ success: true, data: shift });
    } catch (error) {
        next(error);
    }
});

// Close shift
salesRoutes.post('/shifts/:id/close', authenticate, async (req, res, next) => {
    try {
        const { closingBalance, notes } = req.body;

        const shift = await prisma.shift.findUnique({
            where: { id: req.params.id },
            include: { transactions: { where: { status: 'COMPLETED' } }, cashMovements: true },
        });

        if (!shift) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Shift not found' } });
            return;
        }

        if (shift.status !== 'OPEN') {
            res.status(400).json({ success: false, error: { code: 'SHIFT_002', message: 'Shift is already closed' } });
            return;
        }

        // Calculate expected balance
        const cashSales = shift.transactions.reduce((sum, t) => sum + t.total, 0);
        const cashMovementsTotal = shift.cashMovements.reduce((sum, m) => {
            if (m.type === 'FLOAT') return sum + m.amount;
            if (m.type === 'PICKUP' || m.type === 'PAYOUT') return sum - m.amount;
            return sum;
        }, 0);
        const expectedBalance = shift.openingBalance + cashSales + cashMovementsTotal;
        const difference = (closingBalance || 0) - expectedBalance;

        const updatedShift = await prisma.shift.update({
            where: { id: req.params.id },
            data: {
                status: 'CLOSED',
                closingBalance: closingBalance || 0,
                expectedBalance,
                difference,
                closedAt: new Date(),
                notes: notes || shift.notes,
            },
            include: { user: { select: { name: true } }, register: true },
        });

        res.json({ success: true, data: updatedShift });
    } catch (error) {
        next(error);
    }
});

// Add cash movement to shift
salesRoutes.post('/shifts/:id/cash-movement', authenticate, async (req, res, next) => {
    try {
        const { type, amount, reason } = req.body;
        const userId = req.user!.userId;

        const movement = await prisma.cashMovement.create({
            data: {
                shiftId: req.params.id,
                type,
                amount,
                reason,
                userId,
            },
        });

        res.status(201).json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CASH REGISTERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all cash registers
salesRoutes.get('/registers', authenticate, async (req, res, next) => {
    try {
        const { branchId, isActive } = req.query;

        const where: Record<string, unknown> = {};
        if (branchId) where.branchId = String(branchId);
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const registers = await prisma.cashRegister.findMany({
            where,
            include: { branch: { select: { name: true } } },
            orderBy: { name: 'asc' },
        });

        res.json({ success: true, data: registers });
    } catch (error) {
        next(error);
    }
});

// Get register by ID
salesRoutes.get('/registers/:id', authenticate, async (req, res, next) => {
    try {
        const register = await prisma.cashRegister.findUnique({
            where: { id: req.params.id },
            include: {
                branch: true,
                shifts: { orderBy: { openedAt: 'desc' }, take: 10 },
            },
        });

        if (!register) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Register not found' } });
            return;
        }

        res.json({ success: true, data: register });
    } catch (error) {
        next(error);
    }
});

// Create cash register
salesRoutes.post('/registers', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const register = await prisma.cashRegister.create({
            data: req.body,
        });

        res.status(201).json({ success: true, data: register });
    } catch (error) {
        next(error);
    }
});

// Update cash register
salesRoutes.put('/registers/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const register = await prisma.cashRegister.update({
            where: { id: req.params.id },
            data: req.body,
        });

        res.json({ success: true, data: register });
    } catch (error) {
        next(error);
    }
});

// Delete cash register (soft delete)
salesRoutes.delete('/registers/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        await prisma.cashRegister.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });

        res.json({ success: true, data: { message: 'Register deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELD SALES
// ═══════════════════════════════════════════════════════════════════════════

// Get all held sales
salesRoutes.get('/held', authenticate, async (req, res, next) => {
    try {
        const branchId = req.user!.branchId;

        const heldSales = await prisma.heldSale.findMany({
            where: { branchId },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ success: true, data: heldSales });
    } catch (error) {
        next(error);
    }
});

// Get held sale by ID
salesRoutes.get('/held/:id', authenticate, async (req, res, next) => {
    try {
        const heldSale = await prisma.heldSale.findUnique({
            where: { id: req.params.id },
        });

        if (!heldSale) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Held sale not found' } });
            return;
        }

        res.json({ success: true, data: heldSale });
    } catch (error) {
        next(error);
    }
});

// Create held sale
salesRoutes.post('/held', authenticate, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const branchId = req.user!.branchId;

        const heldSale = await prisma.heldSale.create({
            data: {
                ...req.body,
                userId,
                branchId,
            },
        });

        res.status(201).json({ success: true, data: heldSale });
    } catch (error) {
        next(error);
    }
});

// Delete held sale (when recalled or completed)
salesRoutes.delete('/held/:id', authenticate, async (req, res, next) => {
    try {
        await prisma.heldSale.delete({
            where: { id: req.params.id },
        });

        res.json({ success: true, data: { message: 'Held sale deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREDIT SALES
// ═══════════════════════════════════════════════════════════════════════════

// Get all credit sales
salesRoutes.get('/credit', authenticate, async (req, res, next) => {
    try {
        const branchId = req.user!.branchId;
        const { status, customerId, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {
            branchId,
            isCredit: true,
            type: 'SALE',
            status: 'COMPLETED'
        };

        if (status && status !== 'all') {
            where.creditStatus = String(status).toUpperCase();
        }
        if (customerId) {
            where.customerId = String(customerId);
        }

        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                skip,
                take: Number(limit),
                include: {
                    customer: true,
                    items: true,
                    payments: true,
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.transaction.count({ where }),
        ]);

        // Map to credit sale format
        const creditSales = transactions.map(t => ({
            id: t.id,
            receiptNo: t.transactionNo,
            customer: t.customer,
            total: t.total,
            paid: t.paidAmount,
            remaining: t.total - t.paidAmount,
            status: t.creditStatus?.toLowerCase() || 'pending',
            dueDate: t.dueDate,
            createdAt: t.createdAt,
            items: t.items,
        }));

        res.json({
            success: true,
            data: creditSales,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create credit sale
salesRoutes.post('/credit', authenticate, async (req, res, next) => {
    try {
        const {
            items,
            customerId,
            memberId,
            discountType,
            discountValue = 0,
            taxRate = 0,
            notes,
            dueDate,
            initialPayment = 0,
        } = req.body;

        const branchId = req.user!.branchId;
        const userId = req.user!.userId;

        if (!customerId) {
            return res.status(400).json({
                success: false,
                error: { code: 'CUSTOMER_REQUIRED', message: 'Customer is required for credit sales' }
            });
        }

        // Calculate totals
        let subtotal = 0;
        const transactionItems = [];

        for (const item of items) {
            const product = await prisma.product.findUnique({
                where: { id: item.productId },
                select: { id: true, name: true, sku: true, barcode: true, price: true, cost: true }
            });

            if (!product) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'PRODUCT_NOT_FOUND', message: `Product ${item.productId} not found` }
                });
            }

            const unitPrice = item.price || product.price;
            const quantity = item.quantity;
            const itemDiscount = item.discount || 0;
            const itemTotal = (unitPrice * quantity) - itemDiscount;
            subtotal += itemTotal;

            transactionItems.push({
                productId: item.productId,
                productName: product.name,
                sku: product.sku,
                barcode: product.barcode,
                quantity,
                unitPrice,
                cost: product.cost,
                discountType: item.discountType,
                discountValue: item.discountValue || 0,
                discountAmount: itemDiscount,
                taxRate: 0,
                taxAmount: 0,
                total: itemTotal,
                note: item.note,
            });
        }

        // Calculate discount
        let discountAmount = 0;
        if (discountType === 'PERCENTAGE') {
            discountAmount = (subtotal * discountValue) / 100;
        } else if (discountType === 'FIXED') {
            discountAmount = discountValue;
        }

        // Calculate tax
        const taxableAmount = subtotal - discountAmount;
        const taxAmount = (taxableAmount * taxRate) / 100;
        const totalAmount = taxableAmount + taxAmount;

        // Generate transaction number
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.transaction.count({
            where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        });
        const transactionNo = `CRD-${branchId.slice(-4)}-${today}-${String(count + 1).padStart(4, '0')}`;

        // Determine credit status
        let creditStatus = 'PENDING';
        if (initialPayment >= totalAmount) {
            creditStatus = 'PAID';
        } else if (initialPayment > 0) {
            creditStatus = 'PARTIAL';
        }

        // Create transaction
        const transaction = await prisma.transaction.create({
            data: {
                transactionNo,
                type: 'SALE',
                status: 'COMPLETED',
                branchId,
                userId,
                customerId,
                memberId,
                orderType: 'CREDIT',
                subtotal,
                discountType,
                discountValue,
                discountAmount,
                taxAmount,
                total: totalAmount,
                received: initialPayment,
                change: 0,
                note: notes,
                isCredit: true,
                creditStatus,
                dueDate: dueDate ? new Date(dueDate) : null,
                paidAmount: initialPayment,
                items: { create: transactionItems },
            },
            include: {
                items: { include: { product: true } },
                customer: true,
            },
        });

        // Update inventory (stock deduction)
        for (const item of items) {
            const inventory = await prisma.inventory.findFirst({
                where: { productId: item.productId, branchId }
            });

            if (inventory) {
                const previousQty = inventory.quantity;
                const newQty = previousQty - item.quantity;

                await prisma.inventory.update({
                    where: { id: inventory.id },
                    data: {
                        quantity: newQty,
                        available: newQty - inventory.reserved
                    },
                });

                await prisma.stockMovement.create({
                    data: {
                        productId: item.productId,
                        branchId,
                        type: 'OUT',
                        quantity: item.quantity,
                        previousQty,
                        newQty,
                        reason: 'Credit Sale',
                        reference: transaction.id,
                        referenceType: 'CREDIT_SALE',
                        userId,
                    },
                });
            }
        }

        res.status(201).json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
});

// Record payment for credit sale
salesRoutes.post('/credit/:id/payment', authenticate, async (req, res, next) => {
    try {
        const { amount, paymentMethodId, reference, notes } = req.body;
        const transactionId = req.params.id;

        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Transaction not found' }
            });
        }

        if (!transaction.isCredit) {
            return res.status(400).json({
                success: false,
                error: { code: 'NOT_CREDIT', message: 'Transaction is not a credit sale' }
            });
        }

        const remaining = transaction.total - transaction.paidAmount;
        if (amount > remaining) {
            return res.status(400).json({
                success: false,
                error: { code: 'AMOUNT_EXCEEDS', message: 'Payment amount exceeds remaining balance' }
            });
        }

        const newPaidAmount = transaction.paidAmount + amount;
        let newStatus = 'PARTIAL';
        if (newPaidAmount >= transaction.total) {
            newStatus = 'PAID';
        }

        // Update transaction
        const updated = await prisma.transaction.update({
            where: { id: transactionId },
            data: {
                paidAmount: newPaidAmount,
                creditStatus: newStatus,
            },
            include: { customer: true },
        });

        // Get payment method - default to CASH
        let methodId = paymentMethodId;
        let methodName = 'CASH';
        
        if (paymentMethodId) {
            const method = await prisma.paymentMethod.findUnique({
                where: { id: paymentMethodId }
            });
            if (method) methodName = method.name;
        } else {
            // Find default cash payment method
            const cashMethod = await prisma.paymentMethod.findFirst({ 
                where: { type: 'cash' } 
            });
            if (cashMethod) {
                methodId = cashMethod.id;
                methodName = cashMethod.name;
            } else {
                // If no cash method, try to find any active payment method
                const anyMethod = await prisma.paymentMethod.findFirst({ 
                    where: { isActive: true } 
                });
                if (anyMethod) {
                    methodId = anyMethod.id;
                    methodName = anyMethod.name;
                } else {
                    return res.status(400).json({
                        success: false,
                        error: { code: 'NO_PAYMENT_METHOD', message: 'No payment method available' }
                    });
                }
            }
        }

        // Create payment record
        await prisma.transactionPayment.create({
            data: {
                transactionId,
                methodId,
                methodName,
                amount,
                reference: reference || `Credit Payment - ${new Date().toISOString()}`,
            },
        });

        res.json({
            success: true,
            data: {
                id: updated.id,
                total: updated.total,
                paid: updated.paidAmount,
                remaining: updated.total - updated.paidAmount,
                status: updated.creditStatus?.toLowerCase(),
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get credit sale details
salesRoutes.get('/credit/:id', authenticate, async (req, res, next) => {
    try {
        const transaction = await prisma.transaction.findUnique({
            where: { id: req.params.id },
            include: {
                customer: true,
                items: { include: { product: true } },
                payments: true,
            },
        });

        if (!transaction || !transaction.isCredit) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Credit sale not found' }
            });
        }

        res.json({
            success: true,
            data: {
                id: transaction.id,
                receiptNo: transaction.transactionNo,
                customer: transaction.customer,
                total: transaction.total,
                paid: transaction.paidAmount,
                remaining: transaction.total - transaction.paidAmount,
                status: transaction.creditStatus?.toLowerCase() || 'pending',
                dueDate: transaction.dueDate,
                createdAt: transaction.createdAt,
                items: transaction.items,
                payments: transaction.payments,
            }
        });
    } catch (error) {
        next(error);
    }
});
