import { describe, it, expect } from 'vitest';
import { calcPointsEarned, calcPointsRedeemValue } from './loyalty-points.js';

describe('loyalty points earned (T-05)', () => {
    it('calculates 1 point per 100 LAK', () => {
        expect(calcPointsEarned(10000, 100, 1, true)).toBe(100);
    });

    it('floors fractional points', () => {
        expect(calcPointsEarned(150, 100, 1, true)).toBe(1);
        expect(calcPointsEarned(99, 100, 1, true)).toBe(0);
    });

    it('applies tier multiplier', () => {
        expect(calcPointsEarned(10000, 100, 1.5, true)).toBe(150);
    });

    it('returns 0 when loyalty is disabled', () => {
        expect(calcPointsEarned(10000, 100, 1, false)).toBe(0);
    });

    it('returns 0 when amountPerPoint is 0 (guard against divide-by-zero)', () => {
        expect(calcPointsEarned(10000, 0, 1, true)).toBe(0);
    });

    it('returns 0 for zero total (free order)', () => {
        expect(calcPointsEarned(0, 100, 1, true)).toBe(0);
    });

    it('handles large multiplier', () => {
        expect(calcPointsEarned(5000, 100, 2, true)).toBe(100);
    });
});

describe('loyalty points redeem validation (T-05)', () => {
    it('returns zero value when pointsToRedeem is 0', () => {
        const r = calcPointsRedeemValue(0, 1, 0, 0, 500);
        expect(r.value).toBe(0);
        expect(r.error).toBeUndefined();
    });

    it('converts points to LAK value correctly', () => {
        expect(calcPointsRedeemValue(100, 1, 0, 0, 500).value).toBe(100);
    });

    it('returns error when redeeming more than available', () => {
        const r = calcPointsRedeemValue(600, 1, 0, 0, 500);
        expect(r.error).toBe('INSUFFICIENT_POINTS');
        expect(r.value).toBe(0);
    });

    it('returns error when below minimum redeem threshold', () => {
        const r = calcPointsRedeemValue(50, 1, 100, 0, 500);
        expect(r.error).toBe('BELOW_MIN_REDEEM');
    });

    it('returns error when above maximum redeem cap', () => {
        const r = calcPointsRedeemValue(300, 1, 0, 200, 500);
        expect(r.error).toBe('ABOVE_MAX_REDEEM');
    });

    it('succeeds at exactly the minimum redeem threshold', () => {
        const r = calcPointsRedeemValue(100, 1, 100, 0, 500);
        expect(r.error).toBeUndefined();
        expect(r.value).toBe(100);
    });

    it('succeeds at exactly the maximum redeem cap', () => {
        const r = calcPointsRedeemValue(200, 1, 0, 200, 500);
        expect(r.error).toBeUndefined();
        expect(r.value).toBe(200);
    });
});
