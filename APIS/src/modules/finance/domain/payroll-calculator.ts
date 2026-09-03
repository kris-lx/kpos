export interface TaxBracket {
    /** Cumulative upper bound in payroll currency. Null means no upper bound. */
    upTo: number | null;
    /** Decimal fraction, e.g. 0.05 for 5%. */
    rate: number;
}

export interface PayrollTaxProfileInput {
    id: string;
    taxBrackets: TaxBracket[];
    taxableDeduction: number;
    employeeSocialRate: number;
    employerSocialRate: number;
    socialContributionCap: number;
}

export interface PayrollCalculationInput {
    basePay: number;
    overtimePay?: number;
    commission?: number;
    allowance?: number;
    /** Repaid business expenses. Included in payout, excluded from tax/social bases. */
    reimbursement?: number;
    otherDeductions?: number;
    taxExemptAmount?: number;
    socialSecurityEnabled?: boolean;
}

export interface PayrollCalculationResult {
    grossPay: number;
    reimbursement: number;
    taxableIncome: number;
    incomeTax: number;
    employeeSocialSecurity: number;
    employerSocialSecurity: number;
    otherDeductions: number;
    deductions: number;
    netPay: number;
    employerCost: number;
    bracketBreakdown: Array<{ from: number; to: number; rate: number; tax: number }>;
}

export function roundMoney(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function validateTaxBrackets(input: unknown): TaxBracket[] | null {
    if (!Array.isArray(input) || input.length === 0) return null;
    let previous = 0;
    let foundOpenEnded = false;
    const brackets: TaxBracket[] = [];

    for (let index = 0; index < input.length; index++) {
        const raw = input[index] as { upTo?: unknown; rate?: unknown };
        const rate = Number(raw?.rate);
        const upTo = raw?.upTo === null || raw?.upTo === '' || raw?.upTo === undefined
            ? null
            : Number(raw.upTo);
        if (!Number.isFinite(rate) || rate < 0 || rate > 1 || foundOpenEnded) return null;
        if (upTo !== null && (!Number.isFinite(upTo) || upTo <= previous)) return null;
        if (upTo === null) {
            if (index !== input.length - 1) return null;
            foundOpenEnded = true;
        } else {
            previous = upTo;
        }
        brackets.push({ upTo, rate });
    }

    return foundOpenEnded ? brackets : null;
}

export function calculateProgressiveTax(
    taxableIncome: number,
    brackets: TaxBracket[],
): { tax: number; breakdown: PayrollCalculationResult['bracketBreakdown'] } {
    const income = Math.max(0, roundMoney(taxableIncome));
    let lower = 0;
    let total = 0;
    const breakdown: PayrollCalculationResult['bracketBreakdown'] = [];

    for (const bracket of brackets) {
        if (income <= lower) break;
        const upper = bracket.upTo === null ? income : Math.min(income, bracket.upTo);
        const slice = Math.max(0, upper - lower);
        const tax = roundMoney(slice * bracket.rate);
        if (slice > 0) breakdown.push({ from: lower, to: upper, rate: bracket.rate, tax });
        total += tax;
        if (bracket.upTo === null || income <= bracket.upTo) break;
        lower = bracket.upTo;
    }

    return { tax: roundMoney(total), breakdown };
}

export function calculatePayroll(
    input: PayrollCalculationInput,
    profile: PayrollTaxProfileInput,
): PayrollCalculationResult {
    const taxableGrossPay = roundMoney(
        Math.max(0, input.basePay) + Math.max(0, input.overtimePay || 0)
        + Math.max(0, input.commission || 0) + Math.max(0, input.allowance || 0),
    );
    const reimbursement = roundMoney(Math.max(0, input.reimbursement || 0));
    const grossPay = roundMoney(taxableGrossPay + reimbursement);
    const contributionBase = profile.socialContributionCap > 0
        ? Math.min(taxableGrossPay, profile.socialContributionCap)
        : taxableGrossPay;
    const employeeSocialSecurity = input.socialSecurityEnabled === false
        ? 0
        : roundMoney(contributionBase * Math.max(0, profile.employeeSocialRate));
    const employerSocialSecurity = input.socialSecurityEnabled === false
        ? 0
        : roundMoney(contributionBase * Math.max(0, profile.employerSocialRate));
    const taxableIncome = roundMoney(Math.max(
        0,
        taxableGrossPay - employeeSocialSecurity - Math.max(0, profile.taxableDeduction)
        - Math.max(0, input.taxExemptAmount || 0),
    ));
    const progressive = calculateProgressiveTax(taxableIncome, profile.taxBrackets);
    const otherDeductions = roundMoney(Math.max(0, input.otherDeductions || 0));
    const deductions = roundMoney(otherDeductions + employeeSocialSecurity + progressive.tax);
    const netPay = roundMoney(Math.max(0, grossPay - deductions));
    const employerCost = roundMoney(grossPay + employerSocialSecurity);

    return {
        grossPay,
        reimbursement,
        taxableIncome,
        incomeTax: progressive.tax,
        employeeSocialSecurity,
        employerSocialSecurity,
        otherDeductions,
        deductions,
        netPay,
        employerCost,
        bracketBreakdown: progressive.breakdown,
    };
}
