import { describe, expect, it } from 'vitest';
import { calculatePayrollWork, validateWorkPolicy, scheduleRowsToDailyHours } from './payroll-work-calculator';

const policy = {
    timezone: 'UTC',
    standardHoursPerDay: 8, monthlyWorkDays: 26,
    overtimeMultiplier: 1.5, weekendMultiplier: 2, holidayMultiplier: 3,
    overtimeEveningMultiplier: 1.5, overtimeNightMultiplier: 1.5,
    weekendEveningMultiplier: 2, weekendNightMultiplier: 2,
    holidayEveningMultiplier: 3, holidayNightMultiplier: 3,
    nightShiftPremiumRate: 0,
    roundingMinutes: 1, maxShiftHours: 24, weekendDays: [0], holidayDates: ['2026-08-20'],
    lateGraceMinutes: 5, earlyLeaveGraceMinutes: 5,
    lateDeductionMultiplier: 1, earlyLeaveDeductionMultiplier: 1,
};

describe('payroll work calculator', () => {
    it('validates bounded policy inputs', () => {
        expect(validateWorkPolicy(policy)).not.toBeNull();
        expect(validateWorkPolicy({ ...policy, standardHoursPerDay: 0 })).toBeNull();
        expect(validateWorkPolicy({ ...policy, weekendDays: [7] })?.weekendDays).toEqual([]);
    });

    it('separates regular, overtime, weekend and holiday hours', () => {
        const result = calculatePayrollWork('HOURLY', 10, [
            { openedAt: '2026-08-18T08:00:00', closedAt: '2026-08-18T18:00:00' },
            { openedAt: '2026-08-20T08:00:00', closedAt: '2026-08-20T12:00:00' },
            { openedAt: '2026-08-23T08:00:00', closedAt: '2026-08-23T11:00:00' },
        ], policy, new Date('2026-08-01'), new Date('2026-09-01'));
        expect(result.regularHours).toBe(8);
        expect(result.overtimeHours).toBe(2);
        expect(result.holidayHours).toBe(4);
        expect(result.weekendHours).toBe(3);
        expect(result.basePay).toBe(80);
        expect(result.overtimePay).toBe(210);
    });

    it('keeps monthly base pay and derives its OT hourly rate', () => {
        const result = calculatePayrollWork('MONTHLY', 2_080, [
            { openedAt: '2026-08-18T08:00:00', closedAt: '2026-08-18T18:00:00' },
        ], policy, new Date('2026-08-01'), new Date('2026-09-01'));
        expect(result.basePay).toBe(2_080);
        expect(result.hourlyRate).toBe(10);
        expect(result.overtimePay).toBe(30);
    });

    it('prorates daily pay by regular hours instead of paying a full day for a partial shift', () => {
        const result = calculatePayrollWork('DAILY', 80, [
            { openedAt: '2026-08-18T08:00:00Z', closedAt: '2026-08-18T12:00:00Z' },
        ], policy, new Date('2026-08-01'), new Date('2026-09-01'));
        expect(result.hourlyRate).toBe(10);
        expect(result.regularHours).toBe(4);
        expect(result.basePay).toBe(40);
    });

    it('does not treat a commission rate configuration as monthly base pay', () => {
        const result = calculatePayrollWork('COMMISSION', 0, [], policy, new Date('2026-08-01'), new Date('2026-09-01'));
        expect(result.basePay).toBe(0);
    });

    it('does not pay OT when compensation disables eligibility', () => {
        const result = calculatePayrollWork('HOURLY', 10, [
            { openedAt: '2026-08-18T08:00:00', closedAt: '2026-08-18T18:00:00' },
        ], policy, new Date('2026-08-01'), new Date('2026-09-01'), false);
        expect(result.overtimePay).toBe(0);
    });

    it('applies evening and night OT bands plus the night-work premium', () => {
        const legalBands = {
            ...policy,
            overtimeEveningMultiplier: 2,
            overtimeNightMultiplier: 3,
            nightShiftPremiumRate: 0.15,
        };
        const result = calculatePayrollWork('HOURLY', 10, [
            { openedAt: '2026-08-18T14:00:00Z', closedAt: '2026-08-18T23:00:00Z' },
        ], legalBands, new Date('2026-08-01'), new Date('2026-09-01'));
        expect(result.regularHours).toBe(8);
        expect(result.overtimeHours).toBe(1);
        expect(result.nightOvertimeHours).toBe(1);
        expect(result.nightPremiumHours).toBe(1);
        expect(result.overtimePay).toBe(31.5);
    });

    it('splits an overnight shift across local dates and pay bands', () => {
        const result = calculatePayrollWork('HOURLY', 10, [
            { openedAt: '2026-08-22T21:00:00Z', closedAt: '2026-08-23T07:00:00Z' },
        ], { ...policy, nightShiftPremiumRate: 0.15 }, new Date('2026-08-01'), new Date('2026-09-01'));
        expect(result.hoursWorked).toBe(10);
        expect(result.weekendHours).toBe(7);
        expect(result.nightPremiumHours).toBe(8);
    });

    it('uses the employee own roster hours for that day instead of the flat policy threshold when one is scheduled', () => {
        const tuesday = new Date('2026-08-18T00:00:00').getDay();
        // Scheduled 10:00-20:00 = 10 scheduled hours on this employee's roster,
        // beyond the flat 8h policy default — working exactly 10h should be
        // ALL regular hours (0 OT) because that's their normal full shift,
        // not 8 regular + 2 OT as the flat-policy test above computed for a
        // different employee with no roster on file.
        const scheduledHoursByDay = scheduleRowsToDailyHours([{ dayOfWeek: tuesday, startTime: '10:00', endTime: '20:00' }]);
        const result = calculatePayrollWork('HOURLY', 10, [
            { openedAt: '2026-08-18T10:00:00', closedAt: '2026-08-18T20:00:00' },
        ], policy, new Date('2026-08-01'), new Date('2026-09-01'), true, scheduledHoursByDay);
        expect(result.regularHours).toBe(10);
        expect(result.overtimeHours).toBe(0);
    });

    it('scheduleRowsToDailyHours wraps overnight shifts past midnight', () => {
        const map = scheduleRowsToDailyHours([{ dayOfWeek: 1, startTime: '22:00', endTime: '06:00' }]);
        expect(map.get(1)).toBe(8);
    });

    it('deducts only late and early-leave minutes beyond configured grace', () => {
        const result = calculatePayrollWork('HOURLY', 60, [
            { openedAt: '2026-08-18T09:15:00Z', closedAt: '2026-08-18T16:40:00Z' },
        ], policy, new Date('2026-08-01'), new Date('2026-09-01'), true, undefined, [{
            dayOfWeek: 2, startTime: '09:00', endTime: '17:00', timezone: 'UTC', effectiveFrom: '2026-01-01',
        }]);
        expect(result.lateMinutes).toBe(10);
        expect(result.earlyLeaveMinutes).toBe(15);
        expect(result.attendanceDeduction).toBe(25);
    });

    it('uses the schedule version effective when the shift opened', () => {
        const result = calculatePayrollWork('HOURLY', 60, [
            { openedAt: '2026-08-18T09:00:00Z', closedAt: '2026-08-18T17:00:00Z' },
        ], policy, new Date('2026-08-01'), new Date('2026-09-01'), true, undefined, [
            { dayOfWeek: 2, startTime: '08:00', endTime: '16:00', timezone: 'UTC', effectiveFrom: '2026-01-01', effectiveTo: '2026-08-10' },
            { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', timezone: 'UTC', effectiveFrom: '2026-08-11' },
        ]);
        expect(result.lateMinutes).toBe(0);
        expect(result.earlyLeaveMinutes).toBe(0);
    });

    it('honors the employee schedule early-clock-out grace configured in the UI', () => {
        const result = calculatePayrollWork('HOURLY', 60, [
            { openedAt: '2026-08-18T09:00:00Z', closedAt: '2026-08-18T16:40:00Z' },
        ], policy, new Date('2026-08-01'), new Date('2026-09-01'), true, undefined, [{
            dayOfWeek: 2, startTime: '09:00', endTime: '17:00', timezone: 'UTC',
            effectiveFrom: '2026-01-01', earlyClockOutGraceMinutes: 15,
        }]);
        expect(result.earlyLeaveMinutes).toBe(5);
        expect(result.attendanceDeduction).toBe(5);
    });

    it('does not invent late or early deductions when no employee schedule exists', () => {
        const result = calculatePayrollWork('HOURLY', 60, [
            { openedAt: '2026-08-18T11:00:00Z', closedAt: '2026-08-18T14:00:00Z' },
        ], policy, new Date('2026-08-01'), new Date('2026-09-01'));
        expect(result.lateMinutes).toBe(0);
        expect(result.earlyLeaveMinutes).toBe(0);
        expect(result.attendanceDeduction).toBe(0);
    });

    it('flags scheduled days without attendance for review without auto-deducting salary', () => {
        const result = calculatePayrollWork('MONTHLY', 2_080, [], policy, new Date('2026-08-17T00:00:00Z'), new Date('2026-08-24T00:00:00Z'), true, undefined, [{
            dayOfWeek: 2, startTime: '09:00', endTime: '17:00', timezone: 'UTC', effectiveFrom: '2026-01-01',
        }]);
        expect(result.basePay).toBe(2_080);
        expect(result.scheduledDays).toBe(1);
        expect(result.absenceDays).toBe(1);
        expect(result.complianceWarnings).toContain('ABSENCE_REVIEW_REQUIRED:2026-08-18');
    });

    it('uses first clock-in and last clock-out across split shifts on the same day', () => {
        const result = calculatePayrollWork('HOURLY', 60, [
            { openedAt: '2026-08-18T09:08:00Z', closedAt: '2026-08-18T12:00:00Z' },
            { openedAt: '2026-08-18T13:00:00Z', closedAt: '2026-08-18T16:52:00Z' },
        ], policy, new Date('2026-08-01'), new Date('2026-09-01'), true, undefined, [{
            dayOfWeek: 2, startTime: '09:00', endTime: '17:00', timezone: 'UTC', effectiveFrom: '2026-01-01',
        }]);
        expect(result.lateMinutes).toBe(3);
        expect(result.earlyLeaveMinutes).toBe(3);
        expect(result.attendanceDeduction).toBe(6);
    });

    it('ignores invalid and out-of-period shifts and caps an excessive shift', () => {
        const result = calculatePayrollWork('HOURLY', 10, [
            { openedAt: '2026-07-10T09:00:00Z', closedAt: '2026-07-10T17:00:00Z' },
            { openedAt: '2026-08-18T17:00:00Z', closedAt: '2026-08-18T09:00:00Z' },
            { openedAt: '2026-08-19T00:00:00Z', closedAt: '2026-08-21T00:00:00Z' },
        ], { ...policy, maxShiftHours: 12 }, new Date('2026-08-01'), new Date('2026-09-01'));
        expect(result.shiftCount).toBe(1);
        expect(result.hoursWorked).toBe(12);
    });

    it('reports OT compliance warnings without deleting earned pay', () => {
        const shifts = Array.from({ length: 5 }, (_, index) => ({
            openedAt: `2026-08-${17 + index}T08:00:00Z`,
            closedAt: `2026-08-${17 + index}T20:00:00Z`,
        }));
        const result = calculatePayrollWork('HOURLY', 10, shifts, policy, new Date('2026-08-01'), new Date('2026-09-01'));
        expect(result.overtimePay).toBeGreaterThan(0);
        expect(result.complianceWarnings.some(warning => warning.startsWith('OT_DAILY_LIMIT:'))).toBe(true);
        expect(result.complianceWarnings).toContain('OT_CONSECUTIVE_DAYS_LIMIT:5');
    });
});
