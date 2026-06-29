// Pure aggregation helpers — imported by reports/routes.ts and tests.

export interface BranchRow {
    branchId: string;
    branchName: string;
    branchCode: string;
    totalSales: number;
    orderCount: number;
    discountTotal: number;
    taxTotal: number;
    voidCount: number;
}

export interface BranchRowDerived extends BranchRow {
    avgOrder: number;
    netRevenue: number;
}

export function computeDerivedFields(row: BranchRow): BranchRowDerived {
    return {
        ...row,
        avgOrder: row.orderCount > 0 ? Math.round(row.totalSales / row.orderCount) : 0,
        netRevenue: row.totalSales - row.discountTotal,
    };
}

export function sortByTotalSales(rows: BranchRow[]): BranchRow[] {
    return [...rows].sort((a, b) => b.totalSales - a.totalSales);
}

export interface BranchSummary {
    totalSales: number;
    orderCount: number;
    discountTotal: number;
    taxTotal: number;
    voidCount: number;
}

export function summarise(rows: BranchRow[]): BranchSummary {
    return rows.reduce(
        (acc, r) => ({
            totalSales:    acc.totalSales    + r.totalSales,
            orderCount:    acc.orderCount    + r.orderCount,
            discountTotal: acc.discountTotal + r.discountTotal,
            taxTotal:      acc.taxTotal      + r.taxTotal,
            voidCount:     acc.voidCount     + r.voidCount,
        }),
        { totalSales: 0, orderCount: 0, discountTotal: 0, taxTotal: 0, voidCount: 0 },
    );
}
