import { describe, it, expect } from 'vitest';
import { validateSplitPayments, validateCoupon } from './split-payment.js';

describe('split payment validation (T-04)', () => {
    it('accepts exact-match split payments', () => {
        const result = validateSplitPayments(
            [{ method: 'cash', amount: 50000 }, { method: 'card', amount: 50000 }],
            100000,
        );
        expect(result.ok).toBe(true);
    });

    it('accepts overpaid split (change due at POS)', () => {
        const result = validateSplitPayments(
            [{ method: 'cash', amount: 80000 }, { method: 'card', amount: 40000 }],
            100000,
        );
        expect(result.ok).toBe(true);
    });

    it('rejects split payments that do not cover total', () => {
        const result = validateSplitPayments(
            [{ method: 'cash', amount: 30000 }, { method: 'card', amount: 30000 }],
            100000,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe('SPLIT_PAYMENT_INSUFFICIENT');
    });

    it('rejects split where amounts are zero/missing', () => {
        const result = validateSplitPayments(
            [{ method: 'cash', amount: 0 }, { method: 'card', amount: 0 }],
            100000,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe('SPLIT_PAYMENT_INSUFFICIENT');
    });

    it('treats single-element array as single payment (no validation)', () => {
        const result = validateSplitPayments([{ method: 'cash', amount: 10 }], 100000);
        expect(result.ok).toBe(true);
    });

    it('treats empty array as single payment (no validation)', () => {
        expect(validateSplitPayments([], 100000).ok).toBe(true);
    });

    it('handles 3-way split correctly', () => {
        const result = validateSplitPayments(
            [
                { method: 'cash', amount: 33333 },
                { method: 'card', amount: 33333 },
                { method: 'qr', amount: 33334 },
            ],
            100000,
        );
        expect(result.ok).toBe(true);
    });
});

const NOW = new Date('2026-01-15T12:00:00Z');
const PAST = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2026-02-01T00:00:00Z');
const BASE_COUPON = { isActive: true, startDate: PAST, endDate: FUTURE, usageLimit: null, usageCount: 0, minPurchase: 0 };

describe('coupon validation error codes (T-04)', () => {
    it('returns INVALID_COUPON when coupon is null', () => {
        const r = validateCoupon(null, NOW, 100000);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('INVALID_COUPON');
    });

    it('returns INVALID_COUPON when coupon is inactive', () => {
        const r = validateCoupon({ ...BASE_COUPON, isActive: false }, NOW, 100000);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('INVALID_COUPON');
    });

    it('returns COUPON_NOT_STARTED when startDate is in the future', () => {
        const r = validateCoupon({ ...BASE_COUPON, startDate: FUTURE }, NOW, 100000);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('COUPON_NOT_STARTED');
    });

    it('returns COUPON_EXPIRED when endDate has passed', () => {
        const r = validateCoupon({ ...BASE_COUPON, endDate: PAST }, NOW, 100000);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('COUPON_EXPIRED');
    });

    it('returns COUPON_LIMIT_REACHED when usageCount >= usageLimit', () => {
        const r = validateCoupon({ ...BASE_COUPON, usageLimit: 5, usageCount: 5 }, NOW, 100000);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('COUPON_LIMIT_REACHED');
    });

    it('returns COUPON_MIN_PURCHASE when subtotal is below minPurchase', () => {
        const r = validateCoupon({ ...BASE_COUPON, minPurchase: 200000 }, NOW, 100000);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('COUPON_MIN_PURCHASE');
    });

    it('returns ok when all conditions are met', () => {
        const r = validateCoupon({ ...BASE_COUPON, usageLimit: 10, usageCount: 4, minPurchase: 50000 }, NOW, 100000);
        expect(r.ok).toBe(true);
    });

    it('allows unlimited usage when usageLimit is null', () => {
        const r = validateCoupon({ ...BASE_COUPON, usageLimit: null, usageCount: 9999 }, NOW, 100000);
        expect(r.ok).toBe(true);
    });

    it('allows usage when endDate is null (no expiry)', () => {
        const r = validateCoupon({ ...BASE_COUPON, endDate: null }, NOW, 100000);
        expect(r.ok).toBe(true);
    });
});
