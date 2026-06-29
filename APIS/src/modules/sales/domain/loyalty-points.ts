// Pure loyalty calculation helpers — imported by sales/routes.ts and tests.

export function calcPointsEarned(
    totalAmount: number,
    amountPerPoint: number,
    tierPointMultiplier: number,
    loyaltyEnabled: boolean,
): number {
    if (!loyaltyEnabled || amountPerPoint <= 0) return 0;
    return Math.floor((totalAmount / amountPerPoint) * tierPointMultiplier);
}

export interface PointsRedeemResult {
    value: number;
    error?: 'INSUFFICIENT_POINTS' | 'BELOW_MIN_REDEEM' | 'ABOVE_MAX_REDEEM';
}

export function calcPointsRedeemValue(
    pointsToRedeem: number,
    pointValue: number,
    minPointsRedeem: number,
    maxPointsRedeem: number,
    availablePoints: number,
): PointsRedeemResult {
    if (pointsToRedeem <= 0) return { value: 0 };
    if (pointsToRedeem > availablePoints) return { value: 0, error: 'INSUFFICIENT_POINTS' };
    if (minPointsRedeem > 0 && pointsToRedeem < minPointsRedeem) return { value: 0, error: 'BELOW_MIN_REDEEM' };
    if (maxPointsRedeem > 0 && pointsToRedeem > maxPointsRedeem) return { value: 0, error: 'ABOVE_MAX_REDEEM' };
    return { value: pointsToRedeem * pointValue };
}
