import { describe, it, expect } from 'vitest';
import { computeDerivedFields, sortByTotalSales, summarise, type BranchRow } from './branch-compare.js';

const BRANCHES: BranchRow[] = [
    { branchId: 'b1', branchName: 'Main Branch',  branchCode: 'MB', totalSales: 500000, orderCount: 50, discountTotal: 10000, taxTotal: 25000, voidCount: 2 },
    { branchId: 'b2', branchName: 'North Branch', branchCode: 'NB', totalSales: 300000, orderCount: 30, discountTotal: 5000,  taxTotal: 15000, voidCount: 1 },
    { branchId: 'b3', branchName: 'South Branch', branchCode: 'SB', totalSales: 700000, orderCount: 70, discountTotal: 20000, taxTotal: 35000, voidCount: 3 },
];

describe('branch compare derived fields (T-07)', () => {
    it('calculates avgOrder correctly', () => {
        const r = computeDerivedFields(BRANCHES[0]);
        expect(r.avgOrder).toBe(10000); // Math.round(500000 / 50) = 10000
    });

    it('sets avgOrder to 0 when orderCount is 0 (no divide-by-zero)', () => {
        const r = computeDerivedFields({ ...BRANCHES[0], orderCount: 0 });
        expect(r.avgOrder).toBe(0);
    });

    it('rounds avgOrder to nearest integer', () => {
        const r = computeDerivedFields({ ...BRANCHES[0], totalSales: 100001, orderCount: 3 });
        expect(r.avgOrder).toBe(Math.round(100001 / 3));
    });

    it('calculates netRevenue as sales minus discount (tax excluded)', () => {
        const r = computeDerivedFields(BRANCHES[0]);
        // 500000 - 10000 = 490000 (tax is collected separately, not subtracted)
        expect(r.netRevenue).toBe(490000);
    });
});

describe('branch compare sort (T-07)', () => {
    it('sorts branches by totalSales descending', () => {
        const sorted = sortByTotalSales(BRANCHES);
        expect(sorted[0].branchId).toBe('b3'); // 700000
        expect(sorted[1].branchId).toBe('b1'); // 500000
        expect(sorted[2].branchId).toBe('b2'); // 300000
    });

    it('does not mutate the original array', () => {
        const original = [...BRANCHES];
        sortByTotalSales(BRANCHES);
        expect(BRANCHES[0].branchId).toBe(original[0].branchId);
    });

    it('handles single branch', () => {
        expect(sortByTotalSales([BRANCHES[0]]).length).toBe(1);
    });

    it('handles empty array', () => {
        expect(sortByTotalSales([])).toEqual([]);
    });
});

describe('branch compare summarise (T-07)', () => {
    it('sums all numeric fields across branches', () => {
        const totals = summarise(BRANCHES);
        expect(totals.totalSales).toBe(1500000);  // 500k + 300k + 700k
        expect(totals.orderCount).toBe(150);       // 50 + 30 + 70
        expect(totals.discountTotal).toBe(35000);  // 10k + 5k + 20k
        expect(totals.taxTotal).toBe(75000);       // 25k + 15k + 35k
        expect(totals.voidCount).toBe(6);          // 2 + 1 + 3
    });

    it('returns zero totals for empty branch list', () => {
        const totals = summarise([]);
        expect(totals.totalSales).toBe(0);
        expect(totals.orderCount).toBe(0);
    });

    it('returns same values for single branch', () => {
        const totals = summarise([BRANCHES[0]]);
        expect(totals.totalSales).toBe(500000);
        expect(totals.voidCount).toBe(2);
    });
});
