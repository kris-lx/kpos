import { describe, expect, it } from 'vitest';
import { calculatePayroll, calculateProgressiveTax, validateTaxBrackets } from './payroll-calculator';

const brackets = [
    { upTo: 1_000, rate: 0 },
    { upTo: 2_000, rate: 0.1 },
    { upTo: null, rate: 0.2 },
];

describe('payroll calculator', () => {
    it('validates ordered progressive brackets with an open final bracket', () => {
        expect(validateTaxBrackets(brackets)).toEqual(brackets);
        expect(validateTaxBrackets([{ upTo: 1000, rate: 0.1 }])).toBeNull();
        expect(validateTaxBrackets([{ upTo: null, rate: 0.1 }, { upTo: null, rate: 0.2 }])).toBeNull();
    });

    it('calculates progressive tax at bracket boundaries', () => {
        expect(calculateProgressiveTax(1_000, brackets).tax).toBe(0);
        expect(calculateProgressiveTax(2_000, brackets).tax).toBe(100);
        expect(calculateProgressiveTax(2_500, brackets).tax).toBe(200);
    });

    it('separates employee deductions from employer cost', () => {
        const result = calculatePayroll({ basePay: 2_500, otherDeductions: 50 }, {
            id: 'profile', taxBrackets: brackets, taxableDeduction: 0,
            employeeSocialRate: 0.05, employerSocialRate: 0.06, socialContributionCap: 2_000,
        });
        expect(result.employeeSocialSecurity).toBe(100);
        expect(result.employerSocialSecurity).toBe(120);
        expect(result.incomeTax).toBe(180);
        expect(result.netPay).toBe(2_170);
        expect(result.employerCost).toBe(2_620);
    });

    it('honours tax exemption and social-security opt out', () => {
        const result = calculatePayroll({ basePay: 2_500, taxExemptAmount: 500, socialSecurityEnabled: false }, {
            id: 'profile', taxBrackets: brackets, taxableDeduction: 0,
            employeeSocialRate: 0.05, employerSocialRate: 0.06, socialContributionCap: 2_000,
        });
        expect(result.employeeSocialSecurity).toBe(0);
        expect(result.employerSocialSecurity).toBe(0);
        expect(result.taxableIncome).toBe(2_000);
        expect(result.incomeTax).toBe(100);
    });

    it('pays an expense reimbursement without taxing it or adding it to the social base', () => {
        const result = calculatePayroll({ basePay: 2_000, reimbursement: 500 }, {
            id: 'profile', taxBrackets: brackets, taxableDeduction: 0,
            employeeSocialRate: 0.05, employerSocialRate: 0.06, socialContributionCap: 10_000,
        });
        expect(result.grossPay).toBe(2_500);
        expect(result.reimbursement).toBe(500);
        expect(result.employeeSocialSecurity).toBe(100);
        expect(result.employerSocialSecurity).toBe(120);
        expect(result.taxableIncome).toBe(1_900);
        expect(result.incomeTax).toBe(90);
        expect(result.netPay).toBe(2_310);
        expect(result.employerCost).toBe(2_620);
    });
});
