// Pure validation helpers — imported by sales/routes.ts and tests.

export type SplitPaymentResult = { ok: true } | { ok: false; code: string; message: string };

export function validateSplitPayments(
    payments: Array<{ method: string; amount: number }>,
    totalAmount: number,
): SplitPaymentResult {
    if (!Array.isArray(payments) || payments.length <= 1) return { ok: true };
    const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (totalPaid < totalAmount) {
        return { ok: false, code: 'SPLIT_PAYMENT_INSUFFICIENT', message: 'Total of split payments is less than order total' };
    }
    return { ok: true };
}

export type CouponErrorCode =
    | 'INVALID_COUPON'
    | 'COUPON_NOT_STARTED'
    | 'COUPON_EXPIRED'
    | 'COUPON_LIMIT_REACHED'
    | 'COUPON_MIN_PURCHASE';

export type CouponValidationResult = { ok: true } | { ok: false; code: CouponErrorCode };

export interface CouponShape {
    isActive: boolean;
    startDate: Date;
    endDate: Date | null;
    usageLimit: number | null;
    usageCount: number;
    minPurchase: number;
}

export function validateCoupon(
    coupon: CouponShape | null,
    now: Date,
    subtotal: number,
): CouponValidationResult {
    if (!coupon || !coupon.isActive) return { ok: false, code: 'INVALID_COUPON' };
    if (coupon.startDate > now) return { ok: false, code: 'COUPON_NOT_STARTED' };
    if (coupon.endDate && coupon.endDate < now) return { ok: false, code: 'COUPON_EXPIRED' };
    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
        return { ok: false, code: 'COUPON_LIMIT_REACHED' };
    }
    if (subtotal < coupon.minPurchase) return { ok: false, code: 'COUPON_MIN_PURCHASE' };
    return { ok: true };
}
