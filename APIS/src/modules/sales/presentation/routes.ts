// ═══════════════════════════════════════════════════════════════════════════
// Sales Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, ensureScopeAccess, buildScopeCondition, tenantScope, invalidateQueryCache, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { setRequestContext, setSuperAdminBypassContext } from '@/db/set-tenant-context';
import { db as globalDb } from '@/config/database.config';
import { transactions, transactionItems, transactionPayments, products, inventory, stockMovements, paymentMethods, shifts, cashRegisters, cashMovements, heldSales, customers, members, membershipTiers, pointsHistory, pointHistory, settings, coupons, promotions, discounts } from '@/db/schema/tables';
import { eq, and, or, isNull, ne, ilike, inArray, gte, lte, desc, asc, count, sum, sql } from 'drizzle-orm';
import { queueActivityLog } from '@/infrastructure/helpers/activity-log.helper';
import { calcPointsEarned, calcPointsRedeemValue } from '../domain/loyalty-points.js';
import { validateSplitPayments, validateCoupon } from '../domain/split-payment.js';

export const salesRoutes = Router();

// req.tx (a reserved connection) doesn't support .transaction() — see
// tenant-tx.middleware.ts. Handlers that need real atomicity go through the
// pooled globalDb instead, setting the RLS context with SET LOCAL (auto-reset
// on commit/rollback) directly on that transaction.
async function scopedTransaction<T>(
    req: { authUser?: { tenantId?: string | null; isSuperAdmin?: boolean; activeBranchPath?: string } },
    callback: (tx: Parameters<Parameters<typeof globalDb.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
    return globalDb.transaction(async (tx) => {
        const { tenantId, isSuperAdmin, activeBranchPath } = req.authUser ?? {};
        if (isSuperAdmin) {
            await setSuperAdminBypassContext(tx, { local: true });
        } else if (tenantId) {
            await setRequestContext(tx, { tenantId, branchPath: activeBranchPath }, { local: true });
        }
        return callback(tx);
    });
}

// Row-locked inventory read. `db.query.inventory.findFirst({ ..., for:
// 'update' })` (the relational query API) silently does NOT apply a row
// lock — `for` isn't a field that API recognizes, so spreading
// `{ for: 'update' } as any` into its options was a no-op the `any` cast
// was hiding. Only the query-builder API's `.for('update')` actually emits
// `FOR UPDATE` SQL — see inventory/presentation/routes.ts for the live
// concurrency test that caught this.
async function lockInventoryRow(tx: any, productId: string, branchId: string) {
    const rows = await tx.select().from(inventory)
        .where(and(eq(inventory.productId, productId), eq(inventory.branchId, branchId)))
        .for('update');
    return rows[0];
}

// Generates a collision-resistant display number without a DB count query.
// Uses millisecond timestamp (base-36) + 4-char random hex — no TOCTOU race.
function genTxnNo(prefix: string, branchId: string): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const ts = Date.now().toString(36).toUpperCase().slice(-5);
    const rnd = Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
    return `${prefix}-${branchId.slice(-4).toUpperCase()}-${date}-${ts}${rnd}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE SALE (Transaction)
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.post('/', authenticate, withTenantTx(), authorize('sales:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const {
            items,
            customerId,
            memberId,
            paymentMethod,
            paymentMethodId,
            payments = [],
            discountType,
            discountValue = 0,
            taxRate = 0,
            notes,
            orderType = 'WALKIN',
            pointsToRedeem = 0,
            couponCode = '',
        } = req.body;

        const branchId = req.authUser?.activeBranchId || req.user?.branchId;
        const userId = req.authUser?.userId || req.user?.userId;
        const storeId = req.authUser?.activeStoreId || undefined;

        if (!branchId || !userId) {
            return res.status(400).json({ success: false, error: { code: 'AUTH_001', message: 'User or branch not resolved' } });
        }

        // BE-51: CRITICAL — tenant-scoped product lookup prevents cross-tenant purchases
        const saleTenantId = req.authUser?.tenantId || req.user?.tenantId;

        // Calculate totals
        let subtotal = 0;
        const txItems: any[] = [];

        for (const item of items) {
            const productConds: any[] = [eq(products.id, item.productId)];
            if (saleTenantId && !req.authUser?.isSuperAdmin) {
                productConds.push(eq(products.tenantId, saleTenantId));
            }
            const product = await db.query.products.findFirst({
                where: and(...productConds),
                columns: { id: true, name: true, sku: true, barcode: true, price: true, cost: true, categoryId: true },
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

            txItems.push({
                productId: item.productId,
                productName: product.name,
                sku: product.sku,
                barcode: product.barcode,
                categoryId: product.categoryId,
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

        // Load loyalty settings for this tenant
        const loyaltySettingConds: any[] = [eq(settings.category, 'loyalty'), eq(settings.key, 'program_settings')];
        if (saleTenantId && !req.authUser?.isSuperAdmin) loyaltySettingConds.push(eq(settings.tenantId, saleTenantId));
        const loyaltySetting = await db.query.settings.findFirst({ where: and(...loyaltySettingConds) });
        const lv = (loyaltySetting?.value as any) || {};
        const loyaltyEnabled = lv.enabled === true;
        const amountPerPoint = Number(lv.amountPerPoint) || 100;
        const pointValue = Number(lv.pointValue) || 1;
        const minPointsRedeem = Number(lv.minPointsRedeem) || 0;
        const maxPointsRedeem = Number(lv.maxPointsRedeem) || 0;

        // Load member tier for auto-discount and point multiplier
        let tierDiscountPercent = 0;
        let tierPointMultiplier = 1;
        let memberRecord: any = null;
        if (memberId) {
            memberRecord = await db.query.members.findFirst({
                where: eq(members.id, memberId),
                with: { tier: true },
            });
            if (memberRecord?.tier) {
                tierDiscountPercent = Number(memberRecord.tier.discountPercent) || 0;
                tierPointMultiplier = Number(memberRecord.tier.pointMultiplier) || 1;
            }
        }

        // Load customer for points balance validation
        let customerRecord: any = null;
        if (customerId && pointsToRedeem > 0) {
            customerRecord = await db.query.customers.findFirst({
                where: eq(customers.id, customerId),
                columns: { id: true, points: true },
            });
        }

        // ── Promotions, coupons, and item-level discount rules ──────────────
        const promoNow = new Date();

        // Load all active promotions for this tenant
        const promoConds: any[] = [
            eq(promotions.isActive, true),
            lte(promotions.startDate, promoNow),
            or(isNull(promotions.endDate), gte(promotions.endDate, promoNow)),
        ];
        if (saleTenantId && !req.authUser?.isSuperAdmin) promoConds.push(eq(promotions.tenantId, saleTenantId));
        const activePromos = await db.query.promotions.findMany({ where: and(...promoConds), orderBy: desc(promotions.priority) });

        // Load active per-item discount rules
        const discountRuleConds: any[] = [
            eq(discounts.isActive, true),
            or(isNull(discounts.startDate), lte(discounts.startDate, promoNow)),
            or(isNull(discounts.endDate), gte(discounts.endDate, promoNow)),
        ];
        if (saleTenantId && !req.authUser?.isSuperAdmin) discountRuleConds.push(eq(discounts.tenantId, saleTenantId));
        const activeDiscountRules = await db.query.discounts.findMany({ where: and(...discountRuleConds) });

        // Validate and compute coupon discount
        let couponRecord: any = null;
        let couponDiscountAmount = 0;
        if (couponCode) {
            const couponConds: any[] = [eq(coupons.code, couponCode.toUpperCase().trim()), eq(coupons.isActive, true)];
            if (saleTenantId && !req.authUser?.isSuperAdmin) couponConds.push(eq(coupons.tenantId, saleTenantId));
            couponRecord = await db.query.coupons.findFirst({ where: and(...couponConds) });
            if (!couponRecord) return res.status(400).json({ success: false, error: { code: 'INVALID_COUPON', message: 'Coupon not found or inactive' } });
            const couponResult = validateCoupon(couponRecord, promoNow, subtotal);
            if (!couponResult.ok) {
                const msgs: Record<string, string> = {
                    COUPON_NOT_STARTED: 'Coupon is not yet valid',
                    COUPON_EXPIRED: 'Coupon has expired',
                    COUPON_LIMIT_REACHED: 'Coupon usage limit reached',
                    COUPON_MIN_PURCHASE: `Minimum purchase of ${couponRecord.minPurchase} required`,
                };
                return res.status(400).json({ success: false, error: { code: couponResult.code, message: msgs[couponResult.code] ?? couponResult.code } });
            }
            couponDiscountAmount = couponRecord.type === 'PERCENTAGE'
                ? (subtotal * couponRecord.value) / 100
                : couponRecord.value;
            if (couponRecord.maxDiscount != null) couponDiscountAmount = Math.min(couponDiscountAmount, couponRecord.maxDiscount);
        }

        // Evaluate active promotions (highest priority first, all stack)
        let promoDiscountAmount = 0;
        const appliedPromoIds: string[] = [];
        for (const promo of activePromos) {
            if (promo.memberOnly && !memberId) continue;
            const conds = (promo.conditions as any) || {};
            if (conds.minPurchase && subtotal < conds.minPurchase) continue;
            if (conds.dayOfWeek?.length && !conds.dayOfWeek.includes(promoNow.getDay())) continue;
            if (promo.usageLimit != null && promo.usageCount >= promo.usageLimit) continue;
            const applyTo = (promo.applicableTo as any) || {};
            let amount = 0;
            if (promo.type === 'PERCENTAGE') {
                const base = applyTo.productIds?.length || applyTo.categoryIds?.length
                    ? txItems.filter((i: any) => applyTo.productIds?.includes(i.productId) || applyTo.categoryIds?.includes(i.categoryId)).reduce((s: number, i: any) => s + i.total, 0)
                    : subtotal;
                amount = (base * promo.value) / 100;
            } else if (promo.type === 'FIXED') {
                amount = promo.value;
            } else if (promo.type === 'BOGO') {
                const items = applyTo.productIds?.length ? txItems.filter((i: any) => applyTo.productIds.includes(i.productId)) : txItems;
                amount = (items as any[]).reduce((s, i) => s + Math.floor(i.quantity / 2) * i.unitPrice, 0);
            } else if (promo.type === 'ITEM_DISCOUNT') {
                const items = applyTo.productIds?.length ? txItems.filter((i: any) => applyTo.productIds.includes(i.productId)) : txItems;
                amount = (items as any[]).reduce((s, i) => s + (i.total * promo.value) / 100, 0);
            }
            if (amount > 0) { promoDiscountAmount += amount; appliedPromoIds.push(promo.id); }
        }

        // Apply per-item discount rules (stacking per matching rule)
        let itemDiscountTotal = 0;
        for (const txItem of txItems as any[]) {
            for (const rule of activeDiscountRules) {
                const matchProd = rule.applyTo === 'all' || (rule.applyTo === 'products' && rule.productIds?.includes(txItem.productId));
                const matchCat = rule.applyTo === 'categories' && rule.categoryIds?.includes(txItem.categoryId);
                if (!matchProd && !matchCat) continue;
                if (rule.minQuantity > 1 && txItem.quantity < rule.minQuantity) continue;
                if (rule.usageLimit != null && rule.usageCount >= rule.usageLimit) continue;
                const disc = rule.discountType === 'percentage'
                    ? (txItem.total * rule.discountValue) / 100
                    : Math.min(rule.discountValue, txItem.total);
                itemDiscountTotal += rule.maxDiscount != null ? Math.min(disc, rule.maxDiscount) : disc;
            }
        }

        // Calculate discount (manual + tier auto-discount)
        let discountAmount = 0;
        if (discountType === 'PERCENTAGE') {
            discountAmount = (subtotal * discountValue) / 100;
        } else if (discountType === 'FIXED') {
            discountAmount = discountValue;
        }
        if (tierDiscountPercent > 0) {
            discountAmount += (subtotal * tierDiscountPercent) / 100;
        }
        // Add auto-discounts: coupon + active promotions + per-item rules
        discountAmount += couponDiscountAmount + promoDiscountAmount + itemDiscountTotal;

        // Validate and compute points redemption deduction
        let pointsRedeemValue = 0;
        const pointsRedeemInt = Math.floor(Number(pointsToRedeem));
        if (loyaltyEnabled && pointsRedeemInt > 0) {
            if (minPointsRedeem > 0 && pointsRedeemInt < minPointsRedeem) {
                return res.status(400).json({ success: false, error: { code: 'POINTS_MIN', message: `Minimum ${minPointsRedeem} points required for redemption` } });
            }
            if (maxPointsRedeem > 0 && pointsRedeemInt > maxPointsRedeem) {
                return res.status(400).json({ success: false, error: { code: 'POINTS_MAX', message: `Cannot redeem more than ${maxPointsRedeem} points at once` } });
            }
            if (customerRecord && customerRecord.points < pointsRedeemInt) {
                return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_POINTS', message: 'Customer does not have enough points' } });
            }
            pointsRedeemValue = pointsRedeemInt * pointValue;
        }

        // Calculate tax and final total
        const taxableAmount = subtotal - discountAmount;
        const taxAmount = (taxableAmount * taxRate) / 100;
        const totalAmount = Math.max(0, taxableAmount + taxAmount - pointsRedeemValue);

        const pointsEarned = calcPointsEarned(totalAmount, amountPerPoint, tierPointMultiplier, loyaltyEnabled);

        const transactionNo = genTxnNo('TXN', branchId);

        // Get payment method details
        let methodName = paymentMethod || 'CASH';
        let methodId = paymentMethodId;

        if (!methodId) {
            const method = await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.type, methodName) });
            if (method) { methodId = method.id; methodName = method.name; }
        }

        // ── Split payment resolution ────────────────────────────────────────────
        let splitPaymentData: Array<{ methodId: string | null; methodName: string; amount: number }> = [];
        if (Array.isArray(payments) && payments.length > 1) {
            const splitResult = validateSplitPayments(payments, totalAmount);
            if (!splitResult.ok) {
                return res.status(400).json({ success: false, error: { code: splitResult.code, message: splitResult.message } });
            }
            for (const p of payments) {
                const m = await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.type, (p.method || 'CASH').toUpperCase()) });
                splitPaymentData.push({ methodId: m?.id || methodId || null, methodName: m?.name || p.method || 'CASH', amount: Number(p.amount) || 0 });
            }
        }

        // ── Atomic write: transaction + items + payment + inventory deduction ──
        const transaction = await scopedTransaction(req, async (tx) => {
            // 1. Pre-check stock for all tracked items (read with row lock)
            for (const item of items) {
                const product = txItems.find(t => t.productId === item.productId);
                if (!product) continue;
                const inv = await lockInventoryRow(tx, item.productId, branchId);
                if (inv && inv.quantity < item.quantity) {
                    throw Object.assign(new Error(`Insufficient stock for product ${item.productId}`), { statusCode: 400, code: 'INSUFFICIENT_STOCK' });
                }
            }

            // 2. Insert transaction
            const [newTransaction] = await tx.insert(transactions).values({
                tenantId: saleTenantId,
                transactionNo, type: 'SALE', status: 'COMPLETED', branchId, storeId, userId, customerId, memberId, orderType,
                subtotal: Math.round(subtotal * 100) / 100,
                discountType, discountValue,
                discountAmount: Math.round(discountAmount * 100) / 100,
                taxAmount: Math.round(taxAmount * 100) / 100,
                total: Math.round(totalAmount * 100) / 100,
                received: Math.round(totalAmount * 100) / 100,
                change: 0, note: notes,
                pointsEarned, pointsRedeemed: pointsRedeemInt,
            }).returning();

            // 3. Insert items
            if (txItems.length > 0) {
                await tx.insert(transactionItems).values(txItems.map(ti => ({ ...ti, transactionId: newTransaction.id, tenantId: saleTenantId })));
            }

            // 4. Insert payment(s)
            if (splitPaymentData.length > 0) {
                for (const sp of splitPaymentData) {
                    if (sp.methodId) {
                        await tx.insert(transactionPayments).values({ transactionId: newTransaction.id, tenantId: saleTenantId, methodId: sp.methodId, methodName: sp.methodName, amount: Math.round(sp.amount * 100) / 100 });
                    }
                }
            } else if (methodId) {
                await tx.insert(transactionPayments).values({ transactionId: newTransaction.id, tenantId: saleTenantId, methodId, methodName, amount: Math.round(totalAmount * 100) / 100 });
            }

            // 5. Deduct inventory synchronously (RabbitMQ deduction happens outside tx below)
            for (const item of items) {
                const inv = await tx.query.inventory.findFirst({ where: and(eq(inventory.productId, item.productId), eq(inventory.branchId, branchId)) });
                if (inv) {
                    const previousQty = inv.quantity;
                    const newQty = Math.max(0, previousQty - item.quantity);
                    await tx.update(inventory).set({ quantity: newQty, available: Math.max(0, newQty - (inv.reserved ?? 0)) }).where(eq(inventory.id, inv.id));
                    await tx.insert(stockMovements).values({
                        tenantId: saleTenantId,
                        productId: item.productId, branchId, storeId, type: 'OUT',
                        quantity: item.quantity, previousQty, newQty,
                        reason: 'Sale', reference: newTransaction.id, referenceType: 'SALE', userId,
                    });
                }
            }

            // 6. Loyalty: earn + redeem points atomically with the sale
            if (loyaltyEnabled) {
                if (customerId && pointsEarned > 0) {
                    await tx.update(customers)
                        .set({
                            points: sql`${customers.points} + ${pointsEarned}`,
                            totalSpent: sql`COALESCE(${customers.totalSpent}, 0) + ${Math.round(totalAmount * 100) / 100}`,
                            visitCount: sql`COALESCE(${customers.visitCount}, 0) + 1`,
                            lastVisitAt: new Date(),
                            updatedAt: new Date(),
                        })
                        .where(eq(customers.id, customerId));
                    await tx.insert(pointsHistory).values({
                        tenantId: saleTenantId, customerId,
                        points: pointsEarned, type: 'EARN',
                        reason: `Sale ${transactionNo}`, referenceId: newTransaction.id, createdBy: userId,
                    });
                }
                if (customerId && pointsRedeemInt > 0) {
                    await tx.update(customers)
                        .set({ points: sql`${customers.points} - ${pointsRedeemInt}`, updatedAt: new Date() })
                        .where(eq(customers.id, customerId));
                    await tx.insert(pointsHistory).values({
                        tenantId: saleTenantId, customerId,
                        points: -pointsRedeemInt, type: 'REDEEM',
                        reason: `Redeemed on sale ${transactionNo}`, referenceId: newTransaction.id, createdBy: userId,
                    });
                }
                if (memberId && memberRecord && pointsEarned > 0) {
                    const [updMember] = await tx.update(members)
                        .set({
                            points: sql`${members.points} + ${pointsEarned}`,
                            totalSpent: sql`COALESCE(${members.totalSpent}, 0) + ${Math.round(totalAmount * 100) / 100}`,
                            visitCount: sql`COALESCE(${members.visitCount}, 0) + 1`,
                            updatedAt: new Date(),
                        })
                        .where(eq(members.id, memberId))
                        .returning({ points: members.points });
                    await tx.insert(pointHistory).values({
                        tenantId: saleTenantId, memberId,
                        type: 'EARN', points: pointsEarned, balance: updMember.points,
                        reference: newTransaction.id, referenceType: 'SALE',
                    });
                }
            }

            // 7. Increment coupon and promotion usage counts atomically
            for (const promoId of appliedPromoIds) {
                await tx.update(promotions)
                    .set({ usageCount: sql`${promotions.usageCount} + 1` })
                    .where(eq(promotions.id, promoId));
            }
            if (couponRecord) {
                await tx.update(coupons)
                    .set({ usageCount: sql`${coupons.usageCount} + 1` })
                    .where(eq(coupons.id, couponRecord.id));
            }

            return newTransaction;
        });

        // Inventory was already deducted synchronously and atomically inside
        // the transaction above (step 5) — do NOT also publish to
        // QUEUES.STOCK_MOVEMENT here. This route used to do both: the
        // worker's processStockMovement() re-reads inventory and applies the
        // exact same OUT deduction a second time (with no idempotency check
        // against reference/referenceType), so every sale silently deducted
        // stock twice whenever RabbitMQ was connected — the default/
        // production configuration. This is the only publisher of
        // QUEUES.STOCK_MOVEMENT in the codebase, so removing it is safe;
        // cache invalidation (the queue consumer's other job) is done
        // directly below instead.

        // Fetch full transaction with relations
        const fullTransaction = await db.query.transactions.findFirst({
            where: eq(transactions.id, transaction.id),
            with: { items: { with: { product: true } }, customer: true, payments: true },
        });

        // Invalidate dashboard & inventory caches after sale
        invalidateQueryCache('dashboard*').catch(() => {});
        invalidateQueryCache('inventory*').catch(() => {});

        // Log activity async
        queueActivityLog(userId, 'sale_created', 'sales', `ສ້າງການຂາຍ ${transaction.transactionNo} ມູນຄ່າ ${transaction.total}`, { transactionId: transaction.id }, req).catch(() => {});

        res.status(201).json({ success: true, data: fullTransaction });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL SALES (Transactions)
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.get('/', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { page = 1, limit = 50, startDate, endDate, status, type, branchId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const userPermissions = req.authUser?.permissions || [];
        const filter = req.branchFilter;

        const txConds: any[] = [eq(transactions.type, 'SALE')];

        // BE-79: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) {
            txConds.push(eq(transactions.tenantId, tenantId));
        }

        const canViewAllSales = userPermissions.includes('sales:view') || userPermissions.includes('*');
        const canViewOwnSales = userPermissions.includes('sales:view-own');
        if (!canViewAllSales && canViewOwnSales) txConds.push(eq(transactions.userId, req.authUser?.userId || req.user?.userId || ''));

        const scopeCond = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (scopeCond) txConds.push(scopeCond);

        if (branchId) txConds.push(eq(transactions.branchId, String(branchId)));
        else if (!filter) {
            const activeBranchId = req.authUser?.activeBranchId || req.user?.branchId;
            // Superadmins commonly have no branch of their own — pushing an
            // empty-string branchId condition here would fail as invalid UUID
            // input rather than just matching nothing. Skip the filter instead.
            if (activeBranchId) txConds.push(eq(transactions.branchId, activeBranchId));
        }

        if (status) txConds.push(eq(transactions.status, String(status)));
        if (type) txConds.push(eq(transactions.type, String(type)));
        if (startDate) txConds.push(gte(transactions.createdAt, new Date(String(startDate))));
        if (endDate) txConds.push(lte(transactions.createdAt, new Date(String(endDate))));

        const txWhere = and(...txConds);

        const [txRows, [{ value: total }]] = await Promise.all([
            db.query.transactions.findMany({
                where: txWhere,
                offset: skip,
                limit: Number(limit),
                with: { items: true, customer: true, payments: true, user: { columns: { id: true, name: true } } },
                orderBy: desc(transactions.createdAt),
            }),
            db.select({ value: count() }).from(transactions).where(txWhere),
        ]);

        res.json({
            success: true,
            data: txRows,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DAILY SALES SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.get('/summary/daily', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { date } = req.query;
        const targetDate = date ? new Date(String(date)) : new Date();
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.authUser?.activeBranchId || req.user?.branchId;
        if (!branchId && !filter) {
            return res.status(400).json({ success: false, error: { code: 'AUTH_001', message: 'Branch not resolved' } });
        }

        const baseConds: any[] = [gte(transactions.createdAt, startOfDay), lte(transactions.createdAt, endOfDay)];
        // BE-79: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) baseConds.push(eq(transactions.tenantId, tenantId));
        const dayScopeCond = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (dayScopeCond) baseConds.push(dayScopeCond);
        if (!filter && branchId) baseConds.push(eq(transactions.branchId, branchId));

        const [[salesStats], [{ value: voidedCount }], [refundStats]] = await Promise.all([
            db.select({ cnt: count(), total: sum(transactions.total) }).from(transactions).where(and(...baseConds, eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED'))),
            db.select({ value: count() }).from(transactions).where(and(...baseConds, eq(transactions.status, 'VOIDED'))),
            db.select({ cnt: count(), total: sum(transactions.total) }).from(transactions).where(and(...baseConds, eq(transactions.type, 'REFUND'))),
        ]);

        res.json({
            success: true,
            data: {
                date: startOfDay.toISOString().slice(0, 10),
                salesCount: salesStats.cnt,
                totalRevenue: Number(salesStats.total) || 0,
                voidedCount,
                refundCount: refundStats.cnt,
                refundAmount: Math.abs(Number(refundStats.total) || 0),
                netRevenue: (Number(salesStats.total) || 0) + (Number(refundStats.total) || 0),
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
salesRoutes.get('/shifts', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { branchId, userId, status, date, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;
        const authUser = req.authUser;
        const isSuperAdmin = authUser?.isSuperAdmin;

        const shiftConds: any[] = [];
        // G6: Tenant isolation for shifts
        const tc = tenantScope(req, shifts.tenantId);
        if (tc) shiftConds.push(tc);
        if (!isSuperAdmin) {
            const activeStoreId = authUser?.activeStoreId;
            if (activeStoreId) shiftConds.push(eq(shifts.storeId, activeStoreId));
            else if (filter?.branchIds?.length) shiftConds.push(inArray(shifts.branchId, filter.branchIds));
        }
        if (branchId) shiftConds.push(eq(shifts.branchId, String(branchId)));
        if (userId) shiftConds.push(eq(shifts.userId, String(userId)));
        if (status) shiftConds.push(eq(shifts.status, String(status)));
        // date = single day filter (e.g. "2026-05-19")
        if (date) {
            const dayStart = new Date(String(date) + 'T00:00:00.000Z');
            const dayEnd = new Date(String(date) + 'T23:59:59.999Z');
            shiftConds.push(gte(shifts.openedAt, dayStart), lte(shifts.openedAt, dayEnd));
        } else {
            if (dateFrom) shiftConds.push(gte(shifts.openedAt, new Date(String(dateFrom))));
            if (dateTo) shiftConds.push(lte(shifts.openedAt, new Date(String(dateTo))));
        }
        const shiftWhere = shiftConds.length > 0 ? and(...shiftConds) : undefined;

        const [shiftRows, [{ value: total }]] = await Promise.all([
            db.query.shifts.findMany({
                where: shiftWhere,
                offset: skip,
                limit: Number(limit),
                with: { user: { columns: { name: true, email: true } }, register: true },
                orderBy: desc(shifts.openedAt),
            }),
            db.select({ value: count() }).from(shifts).where(shiftWhere),
        ]);

        res.json({
            success: true,
            data: shiftRows,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get current user's active shift
salesRoutes.get('/shifts/current', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const shift = await db.query.shifts.findFirst({
            where: and(eq(shifts.userId, req.authUser?.userId || req.user?.userId || ''), eq(shifts.status, 'OPEN')),
            with: { user: { columns: { name: true } }, register: true },
        });

        res.json({ success: true, data: shift });
    } catch (error) {
        next(error);
    }
});

// Get shift by ID
salesRoutes.get('/shifts/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const shiftIdConds: any[] = [eq(shifts.id, req.params.id)];
        const shiftIdTc = tenantScope(req, shifts.tenantId);
        if (shiftIdTc) shiftIdConds.push(shiftIdTc);
        const shift = await db.query.shifts.findFirst({
            where: and(...shiftIdConds),
            with: {
                user: { columns: { name: true, email: true } },
                register: true,
                transactions: { orderBy: desc(transactions.createdAt), limit: 50 },
                cashMovements: { orderBy: desc(cashMovements.createdAt) },
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
salesRoutes.post('/shifts/open', authenticate, withTenantTx(), authorize('sales:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { openingBalance, registerId, notes } = req.body;
        const userId = req.authUser?.userId || req.user?.userId;
        const branchId = req.authUser?.activeBranchId || req.user?.branchId;

        if (!userId || !branchId) {
            return res.status(400).json({ success: false, error: { code: 'AUTH_001', message: 'User or branch not found' } });
        }

        // Check if user already has an open shift
        const existingShift = await db.query.shifts.findFirst({ where: and(eq(shifts.userId, userId), eq(shifts.status, 'OPEN')) });

        if (existingShift) {
            res.status(400).json({ success: false, error: { code: 'SHIFT_001', message: 'You already have an open shift' } });
            return;
        }

        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const [{ value: shiftCount }] = await db.select({ value: count() }).from(shifts).where(gte(shifts.createdAt, new Date(new Date().setHours(0, 0, 0, 0))));
        const shiftNo = `SFT-${today}-${String(shiftCount + 1).padStart(3, '0')}`;

        const shiftTenantId = req.authUser?.tenantId || req.user?.tenantId;
        let newShift;
        try {
            [newShift] = await db.insert(shifts).values({
                tenantId: shiftTenantId,
                shiftNo, branchId, userId, registerId, openingBalance: openingBalance || 0, notes,
                storeId: req.authUser?.activeStoreId || undefined,
            }).returning();
        } catch (err: any) {
            // shifts_one_open_per_user_idx (drizzle/0022) backstops the
            // check above against the race where two concurrent opens both
            // pass the plain SELECT before either INSERT commits.
            if (err?.code === '23505' && String(err?.constraint_name || err?.constraint || '').includes('one_open_per_user')) {
                res.status(400).json({ success: false, error: { code: 'SHIFT_001', message: 'You already have an open shift' } });
                return;
            }
            throw err;
        }

        const shift = await db.query.shifts.findFirst({
            where: eq(shifts.id, newShift.id),
            with: { user: { columns: { name: true } }, register: true },
        });

        res.status(201).json({ success: true, data: shift });
    } catch (error) {
        next(error);
    }
});

// Close shift
salesRoutes.post('/shifts/:id/close', authenticate, withTenantTx(), authorize('sales:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { closingBalance, notes } = req.body;

        const closeConds: any[] = [eq(shifts.id, req.params.id)];
        const closeTc = tenantScope(req, shifts.tenantId);
        if (closeTc) closeConds.push(closeTc);
        const shift = await db.query.shifts.findFirst({
            where: and(...closeConds),
            with: { transactions: true, cashMovements: true },
        });

        if (!shift) { res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Shift not found' } }); return; }
        if (shift.status !== 'OPEN') { res.status(400).json({ success: false, error: { code: 'SHIFT_002', message: 'Shift is already closed' } }); return; }

        const completedTxns = (shift.transactions || []).filter(t => t.status === 'COMPLETED');
        const cashSales = completedTxns.reduce((s, t) => s + t.total, 0);
        const cashMovementsTotal = (shift.cashMovements || []).reduce((s, m) => {
            if (m.type === 'FLOAT') return s + m.amount;
            if (m.type === 'PICKUP' || m.type === 'PAYOUT') return s - m.amount;
            return s;
        }, 0);
        const expectedBalance = shift.openingBalance + cashSales + cashMovementsTotal;
        const difference = (closingBalance || 0) - expectedBalance;

        await db.update(shifts).set({
            status: 'CLOSED', closingBalance: closingBalance || 0, expectedBalance, difference, closedAt: new Date(), notes: notes || shift.notes,
        }).where(eq(shifts.id, req.params.id));

        const updatedShift = await db.query.shifts.findFirst({
            where: eq(shifts.id, req.params.id),
            with: { user: { columns: { name: true } }, register: true },
        });

        res.json({ success: true, data: updatedShift });
    } catch (error) {
        next(error);
    }
});

// Add cash movement to shift
salesRoutes.post('/shifts/:id/cash-movement', authenticate, withTenantTx(), authorize('sales:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { type, amount, reason } = req.body;
        const userId = req.authUser?.userId || req.user?.userId || '';

        const cmConds: any[] = [eq(shifts.id, req.params.id)];
        const cmTc = tenantScope(req, shifts.tenantId);
        if (cmTc) cmConds.push(cmTc);
        const targetShift = await db.query.shifts.findFirst({ where: and(...cmConds), columns: { id: true } });
        if (!targetShift) { res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Shift not found' } }); return; }

        const [movement] = await db.insert(cashMovements).values({ shiftId: req.params.id, type, amount, reason, userId }).returning();

        res.status(201).json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CASH REGISTERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all cash registers
salesRoutes.get('/registers', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { branchId, isActive } = req.query;
        const filter = req.branchFilter;

        const regConds: any[] = [];
        // G6: Tenant isolation for registers
        const regTc = tenantScope(req, cashRegisters.tenantId);
        if (regTc) regConds.push(regTc);
        if (filter?.branchIds?.length) {
            if (branchId && filter.branchIds.includes(String(branchId))) regConds.push(eq(cashRegisters.branchId, String(branchId)));
            else regConds.push(inArray(cashRegisters.branchId, filter.branchIds));
        } else if (branchId) {
            regConds.push(eq(cashRegisters.branchId, String(branchId)));
        }
        if (isActive !== undefined) regConds.push(eq(cashRegisters.isActive, isActive === 'true'));

        const registers = await db.query.cashRegisters.findMany({
            where: regConds.length > 0 ? and(...regConds) : undefined,
            with: { branch: { columns: { name: true } } },
            orderBy: asc(cashRegisters.name),
        });

        res.json({ success: true, data: registers });
    } catch (error) {
        next(error);
    }
});

// Get register by ID
salesRoutes.get('/registers/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const regIdConds: any[] = [eq(cashRegisters.id, req.params.id)];
        const regIdTc = tenantScope(req, cashRegisters.tenantId);
        if (regIdTc) regIdConds.push(regIdTc);
        const register = await db.query.cashRegisters.findFirst({
            where: and(...regIdConds),
            with: { branch: true, shifts: { orderBy: desc(shifts.openedAt), limit: 10 } },
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
salesRoutes.post('/registers', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, branchId, isActive } = req.body;
        if (!name || !branchId) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name and branchId are required' } });
        }
        const regTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const regStoreId = req.authUser?.activeStoreId || undefined;
        const [register] = await db.insert(cashRegisters).values({ tenantId: regTenantId, name, branchId, storeId: regStoreId, isActive: isActive !== undefined ? isActive : true }).returning();

        res.status(201).json({ success: true, data: register });
    } catch (error) {
        next(error);
    }
});

// Update cash register
salesRoutes.put('/registers/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id, _id, createdAt, updatedAt, branch, shifts, ...updateData } = req.body;
        if (updateData.branchId === '' || updateData.branchId === null) delete updateData.branchId;
        // G6: Tenant-scoped update
        const updConds: any[] = [eq(cashRegisters.id, req.params.id)];
        const updTc = tenantScope(req, cashRegisters.tenantId);
        if (updTc) updConds.push(updTc);
        const [register] = await db.update(cashRegisters).set(updateData).where(and(...updConds)).returning();

        res.json({ success: true, data: register });
    } catch (error) {
        next(error);
    }
});

// Delete cash register (soft delete)
salesRoutes.delete('/registers/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // G6: Tenant-scoped delete
        const delConds: any[] = [eq(cashRegisters.id, req.params.id)];
        const delTc = tenantScope(req, cashRegisters.tenantId);
        if (delTc) delConds.push(delTc);
        await db.update(cashRegisters).set({ isActive: false }).where(and(...delConds));

        res.json({ success: true, data: { message: 'Register deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELD SALES
// ═══════════════════════════════════════════════════════════════════════════

// Get all held sales
salesRoutes.get('/held', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const filter = req.branchFilter;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const heldConds: any[] = [];
        // BE-79: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) heldConds.push(eq(heldSales.tenantId, tenantId));
        const heldScope = buildScopeCondition(filter, { storeId: heldSales.storeId }, 'storeId');
        if (heldScope) heldConds.push(heldScope);
        const branchId = req.authUser?.activeBranchId || req.user?.branchId;
        if (!filter && branchId) heldConds.push(eq(heldSales.branchId, branchId));

        const heldWhere = heldConds.length > 0 ? and(...heldConds) : undefined;

        const [heldRows, [{ value: total }]] = await Promise.all([
            db.query.heldSales.findMany({
                where: heldWhere,
                offset: skip,
                limit,
                orderBy: desc(heldSales.createdAt),
            }),
            db.select({ value: count() }).from(heldSales).where(heldWhere),
        ]);

        res.json({
            success: true,
            data: heldRows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        next(error);
    }
});

// Get held sale by ID
salesRoutes.get('/held/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const heldSale = await db.query.heldSales.findFirst({ where: eq(heldSales.id, req.params.id) });

        if (!heldSale) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Held sale not found' } });
            return;
        }

        if (!ensureScopeAccess(heldSale, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this held sale' } });
        }

        res.json({ success: true, data: heldSale });
    } catch (error) {
        next(error);
    }
});

// Create held sale
salesRoutes.post('/held', authenticate, withTenantTx(), authorize('sales:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const userId = req.authUser?.userId || req.user?.userId;
        const branchId = req.authUser?.activeBranchId || req.user?.branchId;

        const heldTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [heldSale] = await db.insert(heldSales).values({
            ...req.body,
            tenantId: heldTenantId,
            userId,
            branchId,
            storeId: req.authUser?.activeStoreId || undefined,
        }).returning();

        res.status(201).json({ success: true, data: heldSale });
    } catch (error) {
        next(error);
    }
});

// Delete held sale (when recalled or completed)
salesRoutes.delete('/held/:id', authenticate, withTenantTx(), authorize('sales:update', 'sales:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const existing = await db.query.heldSales.findFirst({ where: eq(heldSales.id, req.params.id) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Held sale not found' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        await db.delete(heldSales).where(eq(heldSales.id, req.params.id));

        res.json({ success: true, data: { message: 'Held sale deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CREDIT SALES
// ═══════════════════════════════════════════════════════════════════════════

// Get all credit sales
salesRoutes.get('/credit', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const filter = req.branchFilter;
        const branchId = filter?.branchIds?.[0] || req.authUser?.activeBranchId || req.user?.branchId;
        const { status, customerId } = req.query;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const creditConds: any[] = [eq(transactions.isCredit, true), eq(transactions.type, 'SALE'), eq(transactions.status, 'COMPLETED')];
        // BE-79: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) creditConds.push(eq(transactions.tenantId, tenantId));
        const creditScope = buildScopeCondition(filter, { storeId: transactions.storeId }, 'storeId');
        if (creditScope) creditConds.push(creditScope);
        if (!filter && branchId) creditConds.push(eq(transactions.branchId, branchId));

        if (status && status !== 'all') creditConds.push(eq(transactions.creditStatus, String(status).toUpperCase()));
        if (customerId) creditConds.push(eq(transactions.customerId, String(customerId)));

        const creditWhere = and(...creditConds);
        const [txRows, [{ value: total }]] = await Promise.all([
            db.query.transactions.findMany({
                where: creditWhere,
                offset: skip,
                limit,
                with: { customer: true, items: true, payments: true },
                orderBy: desc(transactions.createdAt),
            }),
            db.select({ value: count() }).from(transactions).where(creditWhere),
        ]);

        // Map to credit sale format
        const creditSales = txRows.map(t => ({
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
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        next(error);
    }
});

// Create credit sale
salesRoutes.post('/credit', authenticate, withTenantTx(), authorize('pos:credit', 'sales:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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

        const branchId = req.authUser?.activeBranchId || req.user?.branchId;
        const userId = req.authUser?.userId || req.user?.userId;
        const creditStoreId = req.authUser?.activeStoreId || undefined;
        const creditTenantId = req.authUser?.tenantId || req.user?.tenantId;

        if (!branchId || !userId) {
            return res.status(400).json({ success: false, error: { code: 'AUTH_001', message: 'User or branch not resolved' } });
        }

        if (!customerId) {
            return res.status(400).json({
                success: false,
                error: { code: 'CUSTOMER_REQUIRED', message: 'Customer is required for credit sales' }
            });
        }

        // Calculate totals
        let subtotal = 0;
        const txItems2: any[] = [];

        for (const item of items) {
            const creditProductConds: any[] = [eq(products.id, item.productId)];
            if (creditTenantId && !req.authUser?.isSuperAdmin) {
                creditProductConds.push(eq(products.tenantId, creditTenantId));
            }
            const product = await db.query.products.findFirst({
                where: and(...creditProductConds),
                columns: { id: true, name: true, sku: true, barcode: true, price: true, cost: true },
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

            txItems2.push({
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

        const transactionNo = genTxnNo('CRD', branchId);

        let creditStatus = 'PENDING';
        if (initialPayment >= totalAmount) creditStatus = 'PAID';
        else if (initialPayment > 0) creditStatus = 'PARTIAL';

        // Atomic write: transaction + items + inventory deduction, with row-level
        // stock locking — previously each insert/update ran on its own connection
        // outside any transaction, so a crash mid-loop left a transaction with no
        // items/no stock deduction, and concurrent credit sales of the same
        // product could both pass the (nonexistent) stock check and oversell.
        const txnId = await scopedTransaction(req, async (tx) => {
            for (const item of items) {
                const inv = await lockInventoryRow(tx, item.productId, branchId);
                if (inv && inv.quantity < item.quantity) {
                    throw Object.assign(new Error(`Insufficient stock for product ${item.productId}`), { statusCode: 400, code: 'INSUFFICIENT_STOCK' });
                }
            }

            const [txn] = await tx.insert(transactions).values({
                tenantId: creditTenantId,
                transactionNo, type: 'SALE', status: 'COMPLETED', branchId, storeId: creditStoreId, userId, customerId, memberId,
                orderType: 'CREDIT', subtotal, discountType, discountValue, discountAmount, taxAmount,
                total: totalAmount, received: initialPayment, change: 0, note: notes,
                isCredit: true, creditStatus, dueDate: dueDate ? new Date(dueDate) : null, paidAmount: initialPayment,
            }).returning();

            if (txItems2.length > 0) {
                await tx.insert(transactionItems).values(txItems2.map(ti => ({ ...ti, transactionId: txn.id, tenantId: creditTenantId })));
            }

            for (const item of items) {
                const inv = await tx.query.inventory.findFirst({ where: and(eq(inventory.productId, item.productId), eq(inventory.branchId, branchId)) });
                if (inv) {
                    const previousQty = inv.quantity;
                    const newQty = previousQty - item.quantity;
                    await tx.update(inventory).set({ quantity: newQty, available: newQty - inv.reserved }).where(eq(inventory.id, inv.id));
                    await tx.insert(stockMovements).values({
                        tenantId: creditTenantId || null,
                        productId: item.productId, branchId, type: 'OUT', quantity: item.quantity, previousQty, newQty,
                        reason: 'Credit Sale', reference: txn.id, referenceType: 'CREDIT_SALE', userId,
                    });
                }
            }

            return txn.id;
        });

        const transaction = await db.query.transactions.findFirst({
            where: eq(transactions.id, txnId),
            with: { items: { with: { product: true } }, customer: true },
        });

        res.status(201).json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
});

// Record payment for credit sale
salesRoutes.post('/credit/:id/payment', authenticate, withTenantTx(), authorize('pos:credit', 'sales:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { amount, paymentMethodId, reference, notes } = req.body;
        const transactionId = req.params.id;

        const transaction = await db.query.transactions.findFirst({ where: eq(transactions.id, transactionId) });

        if (!transaction) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
        if (!ensureScopeAccess(transaction, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this transaction' } });
        if (!transaction.isCredit) return res.status(400).json({ success: false, error: { code: 'NOT_CREDIT', message: 'Transaction is not a credit sale' } });

        // Validate payment amount
        if (!amount || amount <= 0) return res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Payment amount must be greater than 0' } });

        // Idempotency: reject duplicate reference within the same transaction
        if (reference) {
            const dup = await db.query.transactionPayments.findFirst({
                where: and(eq(transactionPayments.transactionId, transactionId), eq(transactionPayments.reference, reference)),
            });
            if (dup) return res.json({ success: true, data: dup, idempotent: true });
        }

        let methodId = paymentMethodId;
        let methodName = 'CASH';
        if (paymentMethodId) {
            const method = await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, paymentMethodId) });
            if (method) methodName = method.name;
        } else {
            const cashMethod = await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.type, 'cash') });
            if (cashMethod) { methodId = cashMethod.id; methodName = cashMethod.name; }
            else {
                const anyMethod = await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.isActive, true) });
                if (anyMethod) { methodId = anyMethod.id; methodName = anyMethod.name; }
                else return res.status(400).json({ success: false, error: { code: 'NO_PAYMENT_METHOD', message: 'No payment method available' } });
            }
        }

        // Read paidAmount with a row lock and recompute inside the transaction —
        // previously this read paidAmount outside any lock, computed newPaidAmount
        // in JS, then wrote it back with a plain UPDATE, so two concurrent payment
        // requests could both read the same stale paidAmount and the second
        // write would silently clobber the first payment's balance update
        // (the transactionPayments row itself was still inserted for both,
        // so the ledger and the running balance would disagree).
        const updated = await scopedTransaction(req, async (tx) => {
            const [locked] = await tx.select({ paidAmount: transactions.paidAmount, total: transactions.total })
                .from(transactions)
                .where(eq(transactions.id, transactionId))
                .for('update');

            const remaining = Math.round((locked.total - locked.paidAmount) * 100) / 100;
            if (amount > remaining) {
                throw Object.assign(new Error('Payment amount exceeds remaining balance'), { statusCode: 400, code: 'AMOUNT_EXCEEDS' });
            }

            const newPaidAmount = Math.round((locked.paidAmount + amount) * 100) / 100;
            const newStatus = newPaidAmount >= locked.total ? 'PAID' : 'PARTIAL';

            const [row] = await tx.update(transactions).set({ paidAmount: newPaidAmount, creditStatus: newStatus }).where(eq(transactions.id, transactionId)).returning();

            await tx.insert(transactionPayments).values({
                transactionId, methodId, methodName, amount,
                reference: reference || `Credit Payment - ${new Date().toISOString()}`,
            });

            return row;
        });

        res.json({
            success: true,
            data: {
                id: updated.id, total: updated.total, paid: updated.paidAmount,
                remaining: updated.total - updated.paidAmount, status: updated.creditStatus?.toLowerCase(),
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get credit sale details
salesRoutes.get('/credit/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const transaction = await db.query.transactions.findFirst({
            where: eq(transactions.id, req.params.id),
            with: { customer: true, items: { with: { product: true } }, payments: true },
        });

        if (!transaction || !transaction.isCredit) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Credit sale not found' }
            });
        }

        if (!ensureScopeAccess(transaction, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
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

// ═══════════════════════════════════════════════════════════════════════════
// GET SALE BY ID — must stay after all specific literal routes (/held, /credit, /shifts, /registers, /summary) or it would swallow them as ":id"
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.get('/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-54: Tenant-scoped transaction lookup
        const tenantId = req.authUser?.tenantId;
        const txConds: any[] = [eq(transactions.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            txConds.push(eq(transactions.tenantId, tenantId));
        }

        const transaction = await db.query.transactions.findFirst({
            where: and(...txConds),
            with: { items: { with: { product: true } }, customer: true, member: true, payments: true, user: { columns: { id: true, name: true } } },
        });

        if (!transaction) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Transaction not found or no access' }
            });
        }

        if (!ensureScopeAccess(transaction, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        res.json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// VOID SALE
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.post('/:id/void', authenticate, withTenantTx(), authorize('sales:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { reason } = req.body;

        // BE-55: Tenant-scoped void
        const tenantId = req.authUser?.tenantId;
        const voidConds: any[] = [eq(transactions.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            voidConds.push(eq(transactions.tenantId, tenantId));
        }

        const transaction = await db.query.transactions.findFirst({
            where: and(...voidConds),
            with: { items: true },
        });

        if (!transaction) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Transaction not found or no access' } });
        }

        if (!ensureScopeAccess(transaction, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this transaction' } });
        }

        if (transaction.status === 'VOIDED') {
            return res.status(400).json({ success: false, error: { code: 'ALREADY_VOIDED', message: 'Transaction already voided' } });
        }

        // Atomic void: status update + inventory restore in one transaction
        await scopedTransaction(req, async (tx) => {
            // Optimistic check: only update if still COMPLETED (prevents double-void race)
            const [updated] = await tx.update(transactions)
                .set({ status: 'VOIDED', voidReason: reason })
                .where(and(eq(transactions.id, req.params.id), eq(transactions.status, 'COMPLETED')))
                .returning({ id: transactions.id });
            if (!updated) throw Object.assign(new Error('Already voided or not in COMPLETED state'), { statusCode: 409, code: 'CONFLICT' });

            for (const item of transaction.items) {
                const inv = await tx.query.inventory.findFirst({ where: and(eq(inventory.productId, item.productId), eq(inventory.branchId, transaction.branchId)) });
                if (inv) {
                    const previousQty = inv.quantity;
                    const newQty = previousQty + item.quantity;
                    await tx.update(inventory).set({ quantity: newQty, available: newQty - (inv.reserved ?? 0) }).where(eq(inventory.id, inv.id));
                    await tx.insert(stockMovements).values({
                        productId: item.productId, branchId: transaction.branchId, type: 'IN',
                        quantity: item.quantity, previousQty, newQty,
                        reason: `Void: ${reason || 'No reason provided'}`, reference: transaction.id, referenceType: 'VOID', userId: req.authUser?.userId || req.user?.userId || '',
                    });
                }
            }

            // Reverse loyalty points earned on the original sale
            const voidUserId = req.authUser?.userId || req.user?.userId || '';
            const earnedOnSale = transaction.pointsEarned || 0;
            const redeemedOnSale = transaction.pointsRedeemed || 0;
            if (earnedOnSale > 0 && transaction.customerId) {
                await tx.update(customers)
                    .set({ points: sql`${customers.points} - ${earnedOnSale}`, updatedAt: new Date() })
                    .where(eq(customers.id, transaction.customerId));
                await tx.insert(pointsHistory).values({
                    tenantId: transaction.tenantId, customerId: transaction.customerId,
                    points: -earnedOnSale, type: 'VOID',
                    reason: `Void: ${reason || 'No reason provided'}`, referenceId: transaction.id, createdBy: voidUserId,
                });
            }
            if (redeemedOnSale > 0 && transaction.customerId) {
                await tx.update(customers)
                    .set({ points: sql`${customers.points} + ${redeemedOnSale}`, updatedAt: new Date() })
                    .where(eq(customers.id, transaction.customerId));
                await tx.insert(pointsHistory).values({
                    tenantId: transaction.tenantId, customerId: transaction.customerId,
                    points: redeemedOnSale, type: 'VOID',
                    reason: `Points restored on void: ${reason || 'No reason provided'}`, referenceId: transaction.id, createdBy: voidUserId,
                });
            }
            if (earnedOnSale > 0 && transaction.memberId) {
                const [updM] = await tx.update(members)
                    .set({ points: sql`${members.points} - ${earnedOnSale}`, updatedAt: new Date() })
                    .where(eq(members.id, transaction.memberId))
                    .returning({ points: members.points });
                await tx.insert(pointHistory).values({
                    tenantId: transaction.tenantId, memberId: transaction.memberId,
                    type: 'VOID', points: -earnedOnSale, balance: updM.points,
                    reference: transaction.id, referenceType: 'VOID',
                });
            }
        });

        // Invalidate caches after void
        invalidateQueryCache('dashboard*').catch(() => {});
        invalidateQueryCache('inventory*').catch(() => {});

        // Log activity async
        queueActivityLog(req.authUser?.userId || req.user?.userId || '', 'sale_voided', 'sales', `ຍົກເລີກການຂາຍ ${req.params.id}`, { transactionId: req.params.id }, req).catch(() => {});

        res.json({ success: true, message: 'Transaction voided successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// REFUND SALE
// ═══════════════════════════════════════════════════════════════════════════
salesRoutes.post('/:id/refund', authenticate, withTenantTx(), authorize('sales:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { reason, items: refundItems } = req.body;

        // BE-55: Tenant-scoped refund
        const tenantId = req.authUser?.tenantId;
        const refConds: any[] = [eq(transactions.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            refConds.push(eq(transactions.tenantId, tenantId));
        }

        const transaction = await db.query.transactions.findFirst({
            where: and(...refConds),
            with: { items: true },
        });

        if (!transaction) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Transaction not found or no access' } });
        }

        if (!ensureScopeAccess(transaction, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this transaction' } });
        }

        if (transaction.status !== 'COMPLETED') {
            return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Can only refund completed transactions' } });
        }

        // Never trust client-supplied productId/quantity/unitPrice/total for the
        // refund amount — previously `refundItems` (when the caller passed
        // partial-refund items) was used verbatim, so any staff user with
        // sales:delete could refund an inflated amount and credit inventory
        // that was never actually returned by requesting a refund for
        // products/quantities/prices that don't match the original sale.
        // Only the productId + requested quantity come from the client; the
        // price and product identity are always resolved from the original
        // transaction's own items, and quantity is capped at what was
        // originally sold.
        let refundAmount = 0;
        let itemsToRefund: typeof transaction.items;
        if (Array.isArray(refundItems) && refundItems.length > 0) {
            const resolved: typeof transaction.items = [];
            for (const ri of refundItems) {
                const original = transaction.items.find((oi) => oi.productId === ri.productId);
                if (!original) {
                    return res.status(400).json({ success: false, error: { code: 'INVALID_ITEM', message: `Product ${ri.productId} was not part of this sale` } });
                }
                const qty = Number(ri.quantity);
                if (!qty || qty <= 0 || qty > original.quantity) {
                    return res.status(400).json({ success: false, error: { code: 'INVALID_QUANTITY', message: `Invalid refund quantity for ${original.productName}` } });
                }
                const total = Math.round(original.unitPrice * qty * 100) / 100;
                resolved.push({ ...original, quantity: qty, total });
                refundAmount += total;
            }
            itemsToRefund = resolved;
        } else {
            itemsToRefund = transaction.items;
            for (const item of itemsToRefund) { refundAmount += item.total || (item.unitPrice * item.quantity); }
        }

        const transactionNo = genTxnNo('REF', transaction.branchId);

        const refundTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const userId = req.authUser?.userId || req.user?.userId || '';

        // Atomic refund: parent status + refund record + items + inventory restore
        const refund = await scopedTransaction(req, async (tx) => {
            // Lock parent first (prevent double-refund race)
            const [parentLocked] = await tx.update(transactions)
                .set({ status: 'REFUNDED' })
                .where(and(eq(transactions.id, req.params.id), eq(transactions.status, 'COMPLETED')))
                .returning({ id: transactions.id });
            if (!parentLocked) throw Object.assign(new Error('Transaction not in COMPLETED state — already refunded?'), { statusCode: 409, code: 'CONFLICT' });

            const [refundRecord] = await tx.insert(transactions).values({
                tenantId: refundTenantId,
                transactionNo, type: 'REFUND', status: 'COMPLETED', branchId: transaction.branchId,
                userId, customerId: transaction.customerId, memberId: transaction.memberId,
                orderType: transaction.orderType,
                subtotal:       Math.round(-refundAmount * 100) / 100,
                discountAmount: 0, taxAmount: 0,
                total:          Math.round(-refundAmount * 100) / 100,
                received: 0, change: Math.round(refundAmount * 100) / 100,
                refundReason: reason, parentId: transaction.id,
            }).returning();

            await tx.insert(transactionItems).values(itemsToRefund.map((item: any) => ({
                transactionId: refundRecord.id, productId: item.productId, productName: item.productName,
                quantity: -item.quantity, unitPrice: item.unitPrice, cost: item.cost || 0,
                total: Math.round(-(item.total || (item.unitPrice * item.quantity)) * 100) / 100,
            })));

            for (const item of itemsToRefund) {
                const inv = await tx.query.inventory.findFirst({ where: and(eq(inventory.productId, item.productId), eq(inventory.branchId, transaction.branchId)) });
                if (inv) {
                    const previousQty = inv.quantity;
                    const newQty = previousQty + item.quantity;
                    await tx.update(inventory).set({ quantity: newQty, available: newQty - (inv.reserved ?? 0) }).where(eq(inventory.id, inv.id));
                    await tx.insert(stockMovements).values({
                        productId: item.productId, branchId: transaction.branchId, type: 'IN',
                        quantity: item.quantity, previousQty, newQty,
                        reason: `Refund: ${reason || 'No reason provided'}`, reference: refundRecord.id, referenceType: 'REFUND', userId,
                    });
                }
            }

            // Reverse loyalty points proportionally based on refunded amount
            const refEarned = transaction.pointsEarned || 0;
            const refRedeemed = transaction.pointsRedeemed || 0;
            const refRatio = transaction.total !== 0 ? Math.abs(refundAmount / transaction.total) : 1;
            const pointsToReverse = Math.floor(refEarned * Math.min(refRatio, 1));
            const redeemedToRestore = Math.floor(refRedeemed * Math.min(refRatio, 1));
            if (pointsToReverse > 0 && transaction.customerId) {
                await tx.update(customers)
                    .set({ points: sql`${customers.points} - ${pointsToReverse}`, updatedAt: new Date() })
                    .where(eq(customers.id, transaction.customerId));
                await tx.insert(pointsHistory).values({
                    tenantId: refundTenantId, customerId: transaction.customerId,
                    points: -pointsToReverse, type: 'REFUND',
                    reason: `Refund: ${reason || 'No reason provided'}`, referenceId: refundRecord.id, createdBy: userId,
                });
            }
            if (redeemedToRestore > 0 && transaction.customerId) {
                await tx.update(customers)
                    .set({ points: sql`${customers.points} + ${redeemedToRestore}`, updatedAt: new Date() })
                    .where(eq(customers.id, transaction.customerId));
                await tx.insert(pointsHistory).values({
                    tenantId: refundTenantId, customerId: transaction.customerId,
                    points: redeemedToRestore, type: 'REFUND',
                    reason: `Points restored on refund: ${reason || 'No reason provided'}`, referenceId: refundRecord.id, createdBy: userId,
                });
            }
            if (pointsToReverse > 0 && transaction.memberId) {
                const [updRefM] = await tx.update(members)
                    .set({ points: sql`${members.points} - ${pointsToReverse}`, updatedAt: new Date() })
                    .where(eq(members.id, transaction.memberId))
                    .returning({ points: members.points });
                await tx.insert(pointHistory).values({
                    tenantId: refundTenantId, memberId: transaction.memberId,
                    type: 'REFUND', points: -pointsToReverse, balance: updRefM.points,
                    reference: refundRecord.id, referenceType: 'REFUND',
                });
            }

            return refundRecord;
        });

        const fullRefund = await db.query.transactions.findFirst({ where: eq(transactions.id, refund.id), with: { items: true } });
        res.json({ success: true, data: fullRefund });
    } catch (error) {
        next(error);
    }
});
