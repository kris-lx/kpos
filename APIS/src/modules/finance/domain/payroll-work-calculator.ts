import { roundMoney } from './payroll-calculator';
import { localClock } from '@/shared/employee-work-schedule';

export interface PayrollWorkPolicyInput {
    timezone: string;
    standardHoursPerDay: number;
    monthlyWorkDays: number;
    overtimeMultiplier: number;
    overtimeEveningMultiplier: number;
    overtimeNightMultiplier: number;
    weekendMultiplier: number;
    weekendEveningMultiplier: number;
    weekendNightMultiplier: number;
    holidayMultiplier: number;
    holidayEveningMultiplier: number;
    holidayNightMultiplier: number;
    nightShiftPremiumRate: number;
    roundingMinutes: number;
    maxShiftHours: number;
    weekendDays: number[];
    holidayDates: string[];
    lateGraceMinutes: number;
    earlyLeaveGraceMinutes: number;
    lateDeductionMultiplier: number;
    earlyLeaveDeductionMultiplier: number;
}

export interface PayrollShiftInput {
    openedAt: Date | string;
    closedAt: Date | string;
}

export interface PayrollScheduleInput {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    timezone?: string;
    effectiveFrom?: Date | string;
    effectiveTo?: Date | string | null;
    earlyClockOutGraceMinutes?: number;
}

export interface PayrollWorkResult {
    hoursWorked: number;
    regularHours: number;
    overtimeHours: number;
    weekendHours: number;
    holidayHours: number;
    attendanceDays: number;
    scheduledDays: number;
    absenceDays: number;
    absenceDates: string[];
    hourlyRate: number;
    basePay: number;
    overtimePay: number;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    attendanceDeduction: number;
    shiftCount: number;
    nightPremiumHours: number;
    eveningOvertimeHours: number;
    nightOvertimeHours: number;
    complianceWarnings: string[];
}

function validNumber(value: unknown, min: number, max: number): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function validateWorkPolicy(input: unknown): PayrollWorkPolicyInput | null {
    if (!input || typeof input !== 'object') return null;
    const raw = input as Record<string, unknown>;
    const standardHoursPerDay = validNumber(raw.standardHoursPerDay, 0.25, 24);
    const monthlyWorkDays = validNumber(raw.monthlyWorkDays, 1, 31);
    const overtimeMultiplier = validNumber(raw.overtimeMultiplier, 0, 10);
    const overtimeEveningMultiplier = validNumber(raw.overtimeEveningMultiplier ?? Math.max(Number(raw.overtimeMultiplier) || 0, 2), 0, 10);
    const overtimeNightMultiplier = validNumber(raw.overtimeNightMultiplier ?? Math.max(Number(raw.overtimeMultiplier) || 0, 3), 0, 10);
    const weekendMultiplier = validNumber(raw.weekendMultiplier, 0, 10);
    const weekendEveningMultiplier = validNumber(raw.weekendEveningMultiplier ?? Math.max(Number(raw.weekendMultiplier) || 0, 3), 0, 10);
    const weekendNightMultiplier = validNumber(raw.weekendNightMultiplier ?? Math.max(Number(raw.weekendMultiplier) || 0, 3.5), 0, 10);
    const holidayMultiplier = validNumber(raw.holidayMultiplier, 0, 10);
    const holidayEveningMultiplier = validNumber(raw.holidayEveningMultiplier ?? Math.max(Number(raw.holidayMultiplier) || 0, 3), 0, 10);
    const holidayNightMultiplier = validNumber(raw.holidayNightMultiplier ?? Math.max(Number(raw.holidayMultiplier) || 0, 3.5), 0, 10);
    const nightShiftPremiumRate = validNumber(raw.nightShiftPremiumRate ?? 0.15, 0, 1);
    const roundingMinutes = validNumber(raw.roundingMinutes, 1, 60);
    const maxShiftHours = validNumber(raw.maxShiftHours, 0.25, 48);
    const lateGraceMinutes = validNumber(raw.lateGraceMinutes ?? 0, 0, 180);
    const earlyLeaveGraceMinutes = validNumber(raw.earlyLeaveGraceMinutes ?? 0, 0, 180);
    const lateDeductionMultiplier = validNumber(raw.lateDeductionMultiplier ?? 1, 0, 10);
    const earlyLeaveDeductionMultiplier = validNumber(raw.earlyLeaveDeductionMultiplier ?? 1, 0, 10);
    const timezone = String(raw.timezone || 'Asia/Vientiane');
    const weekendDays = Array.isArray(raw.weekendDays)
        ? [...new Set(raw.weekendDays.map(Number))].filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
        : [];
    const holidayDates = Array.isArray(raw.holidayDates)
        ? [...new Set(raw.holidayDates.map(String).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))]
        : [];
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { return null; }
    if ([standardHoursPerDay, monthlyWorkDays, overtimeMultiplier, overtimeEveningMultiplier, overtimeNightMultiplier, weekendMultiplier, weekendEveningMultiplier, weekendNightMultiplier, holidayMultiplier, holidayEveningMultiplier, holidayNightMultiplier, nightShiftPremiumRate, roundingMinutes, maxShiftHours, lateGraceMinutes, earlyLeaveGraceMinutes, lateDeductionMultiplier, earlyLeaveDeductionMultiplier].some(value => value === null)) return null;
    return {
        timezone,
        standardHoursPerDay: standardHoursPerDay!, monthlyWorkDays: monthlyWorkDays!,
        overtimeMultiplier: overtimeMultiplier!, overtimeEveningMultiplier: overtimeEveningMultiplier!, overtimeNightMultiplier: overtimeNightMultiplier!,
        weekendMultiplier: weekendMultiplier!, weekendEveningMultiplier: weekendEveningMultiplier!, weekendNightMultiplier: weekendNightMultiplier!,
        holidayMultiplier: holidayMultiplier!, holidayEveningMultiplier: holidayEveningMultiplier!, holidayNightMultiplier: holidayNightMultiplier!,
        nightShiftPremiumRate: nightShiftPremiumRate!, roundingMinutes: roundingMinutes!,
        maxShiftHours: maxShiftHours!, weekendDays, holidayDates,
        lateGraceMinutes: lateGraceMinutes!, earlyLeaveGraceMinutes: earlyLeaveGraceMinutes!,
        lateDeductionMultiplier: lateDeductionMultiplier!, earlyLeaveDeductionMultiplier: earlyLeaveDeductionMultiplier!,
    };
}

/** Turns this employee's weekly roster rows (HH:mm start/end per
 * day-of-week, from employee_work_schedules) into hours-scheduled-per-day,
 * for calculatePayrollWork's scheduledHoursByDay argument. Overnight shifts
 * (end time earlier than start time) wrap past midnight. Multiple rows for
 * the same day (shouldn't normally happen — the schedule editor enforces one
 * row per day — but a caller passing raw DB rows across an effective-date
 * change could have some overlap) sum their hours. */
export function scheduleRowsToDailyHours(rows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>): Map<number, number> {
    const result = new Map<number, number>();
    for (const row of rows) {
        const [startH, startM] = row.startTime.split(':').map(Number);
        const [endH, endM] = row.endTime.split(':').map(Number);
        if (![startH, startM, endH, endM].every(Number.isFinite)) continue;
        let hours = (endH + endM / 60) - (startH + startM / 60);
        if (hours <= 0) hours += 24;
        result.set(row.dayOfWeek, (result.get(row.dayOfWeek) || 0) + hours);
    }
    return result;
}

function parseMinutes(value: string): number {
    const [hour, minute] = value.split(':').map(Number);
    return (hour * 60) + minute;
}

function scheduleForShift(schedules: PayrollScheduleInput[], openedAt: Date): PayrollScheduleInput | undefined {
    return schedules
        .filter((schedule) => {
            const timezone = schedule.timezone || 'Asia/Vientiane';
            if (localClock(openedAt, timezone).dayOfWeek !== schedule.dayOfWeek) return false;
            const from = schedule.effectiveFrom ? new Date(schedule.effectiveFrom) : null;
            const to = schedule.effectiveTo ? new Date(schedule.effectiveTo) : null;
            return (!from || from <= openedAt) && (!to || to >= openedAt);
        })
        .sort((a, b) => new Date(b.effectiveFrom || 0).getTime() - new Date(a.effectiveFrom || 0).getTime())[0];
}

export function calculatePayrollWork(
    payType: string,
    baseRate: number,
    shifts: PayrollShiftInput[],
    policy: PayrollWorkPolicyInput,
    periodStart: Date,
    periodEndExclusive: Date,
    overtimeEligible = true,
    // This employee's own scheduled hours per day-of-week (0=Sun..6=Sat),
    // from employee_work_schedules — when a day is present, OT is whatever
    // they actually worked beyond THEIR roster for that specific day, not
    // the tenant's flat standardHoursPerDay policy number. A day absent from
    // the map (no schedule row, or none configured at all for this
    // employee/branch) falls back to the flat policy threshold, same as
    // before this existed — this is additive, not a behavior change for
    // tenants that haven't set up rosters yet.
    scheduledHoursByDay?: Map<number, number>,
    schedules: PayrollScheduleInput[] = [],
): PayrollWorkResult {
    type WorkBand = 'DAY' | 'EVENING' | 'NIGHT';
    type WorkSegment = { hours: number; band: WorkBand };
    const daily = new Map<string, { hours: number; day: number; daySerial: number; firstStart: Date; lastEnd: Date; segments: WorkSegment[]; schedule?: PayrollScheduleInput }>();
    const roundingHours = policy.roundingMinutes / 60;
    let shiftCount = 0;

    const bandAt = (date: Date): WorkBand => {
        const minute = localClock(date, policy.timezone).minuteOfDay;
        if (minute >= 22 * 60 || minute < 6 * 60) return 'NIGHT';
        if (minute >= 17 * 60) return 'EVENING';
        return 'DAY';
    };

    for (const shift of shifts) {
        const rawStart = new Date(shift.openedAt);
        const rawEnd = new Date(shift.closedAt);
        if (Number.isNaN(rawStart.getTime()) || Number.isNaN(rawEnd.getTime()) || rawEnd <= rawStart) continue;
        const start = new Date(Math.max(rawStart.getTime(), periodStart.getTime()));
        const end = new Date(Math.min(rawEnd.getTime(), periodEndExclusive.getTime(), start.getTime() + policy.maxShiftHours * 3_600_000));
        if (end <= start) continue;
        const rawHours = (end.getTime() - start.getTime()) / 3_600_000;
        const hours = Math.max(0, Math.round(rawHours / roundingHours) * roundingHours);
        if (hours <= 0) continue;
        const scale = hours / rawHours;
        const shiftStartDate = localClock(start, policy.timezone).dateKey;
        const shiftSchedule = scheduleForShift(schedules, start);
        let cursor = start.getTime();
        while (cursor < end.getTime()) {
            const nextMinute = (Math.floor(cursor / 60_000) + 1) * 60_000;
            const segmentEnd = Math.min(end.getTime(), nextMinute);
            const midpoint = new Date(cursor + ((segmentEnd - cursor) / 2));
            const local = localClock(midpoint, policy.timezone);
            const key = local.dateKey;
            const previous = daily.get(key);
            const segment: WorkSegment = { hours: ((segmentEnd - cursor) / 3_600_000) * scale, band: bandAt(midpoint) };
            daily.set(key, {
                hours: (previous?.hours || 0) + segment.hours,
                day: local.dayOfWeek,
                daySerial: local.daySerial,
                firstStart: previous && previous.firstStart < start ? previous.firstStart : start,
                lastEnd: previous && previous.lastEnd > end ? previous.lastEnd : end,
                segments: [...(previous?.segments || []), segment],
                schedule: previous?.schedule || (key === shiftStartDate ? shiftSchedule : undefined),
            });
            cursor = segmentEnd;
        }
        shiftCount++;
    }

    let regularHours = 0;
    let overtimeHours = 0;
    let weekendHours = 0;
    let holidayHours = 0;
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
    let eveningOvertimeHours = 0;
    let nightOvertimeHours = 0;
    let daytimeOvertimeHours = 0;
    let weekendEveningHours = 0;
    let weekendNightHours = 0;
    let weekendDayHours = 0;
    let holidayEveningHours = 0;
    let holidayNightHours = 0;
    let holidayDayHours = 0;
    let nightPremiumHours = 0;
    const overtimeByDate: Array<{ date: string; daySerial: number; hours: number }> = [];
    const holidaySet = new Set(policy.holidayDates);
    const weekendSet = new Set(policy.weekendDays);

    for (const [date, entry] of daily) {
        for (const segment of entry.segments) if (segment.band === 'NIGHT') nightPremiumHours += segment.hours;
        let dayOvertime = 0;
        if (holidaySet.has(date)) {
            holidayHours += entry.hours;
            for (const segment of entry.segments) {
                if (segment.band === 'NIGHT') holidayNightHours += segment.hours;
                else if (segment.band === 'EVENING') holidayEveningHours += segment.hours;
                else holidayDayHours += segment.hours;
            }
            dayOvertime = entry.hours;
        } else if (weekendSet.has(entry.day)) {
            weekendHours += entry.hours;
            for (const segment of entry.segments) {
                if (segment.band === 'NIGHT') weekendNightHours += segment.hours;
                else if (segment.band === 'EVENING') weekendEveningHours += segment.hours;
                else weekendDayHours += segment.hours;
            }
            dayOvertime = entry.hours;
        } else {
            const scheduledDuration = entry.schedule
                ? (() => {
                    const startMinute = parseMinutes(entry.schedule!.startTime);
                    const endMinute = parseMinutes(entry.schedule!.endTime);
                    return ((endMinute - startMinute) + 1_440) % 1_440 || 24 * 60;
                })() / 60
                : undefined;
            const dailyThreshold = scheduledDuration ?? scheduledHoursByDay?.get(entry.day) ?? policy.standardHoursPerDay;
            let regularRemaining = dailyThreshold;
            for (const segment of entry.segments) {
                const regularPart = Math.min(segment.hours, Math.max(0, regularRemaining));
                const overtimePart = segment.hours - regularPart;
                regularHours += regularPart;
                overtimeHours += overtimePart;
                regularRemaining -= regularPart;
                if (segment.band === 'NIGHT') nightOvertimeHours += overtimePart;
                else if (segment.band === 'EVENING') eveningOvertimeHours += overtimePart;
                else daytimeOvertimeHours += overtimePart;
            }
            dayOvertime = Math.max(0, entry.hours - dailyThreshold);
        }
        if (dayOvertime > 0) overtimeByDate.push({ date, daySerial: entry.daySerial, hours: dayOvertime });

        if (entry.schedule) {
            const timezone = entry.schedule.timezone || policy.timezone;
            const opened = localClock(entry.firstStart, timezone);
            const closed = localClock(entry.lastEnd, timezone);
            const scheduledStart = parseMinutes(entry.schedule.startTime);
            const rawScheduledEnd = parseMinutes(entry.schedule.endTime);
            const scheduledEnd = rawScheduledEnd > scheduledStart ? rawScheduledEnd : rawScheduledEnd + 1_440;
            const actualEnd = ((closed.daySerial - opened.daySerial) * 1_440) + closed.minuteOfDay;
            lateMinutes += Math.max(0, opened.minuteOfDay - scheduledStart - policy.lateGraceMinutes);
            const employeeEarlyLeaveGrace = Number.isFinite(Number(entry.schedule.earlyClockOutGraceMinutes))
                ? Math.max(0, Number(entry.schedule.earlyClockOutGraceMinutes))
                : policy.earlyLeaveGraceMinutes;
            earlyLeaveMinutes += Math.max(0, scheduledEnd - actualEnd - employeeEarlyLeaveGrace);
        }
    }

    const rate = Math.max(0, Number(baseRate) || 0);
    const hourlyRate = payType === 'HOURLY'
        ? rate
        : payType === 'DAILY'
            ? rate / policy.standardHoursPerDay
            : rate / (policy.monthlyWorkDays * policy.standardHoursPerDay);
    const basePay = payType === 'HOURLY'
        ? regularHours * rate
        : payType === 'DAILY'
            ? regularHours * hourlyRate
            : payType === 'COMMISSION' ? 0 : rate;
    const overtimePay = overtimeEligible
        ? hourlyRate * (
            daytimeOvertimeHours * policy.overtimeMultiplier
            + eveningOvertimeHours * policy.overtimeEveningMultiplier
            + nightOvertimeHours * policy.overtimeNightMultiplier
            + weekendDayHours * policy.weekendMultiplier
            + weekendEveningHours * policy.weekendEveningMultiplier
            + weekendNightHours * policy.weekendNightMultiplier
            + holidayDayHours * policy.holidayMultiplier
            + holidayEveningHours * policy.holidayEveningMultiplier
            + holidayNightHours * policy.holidayNightMultiplier
            + nightPremiumHours * policy.nightShiftPremiumRate
        )
        : 0;
    const attendanceDeduction = hourlyRate * (
        (lateMinutes / 60) * policy.lateDeductionMultiplier
        + (earlyLeaveMinutes / 60) * policy.earlyLeaveDeductionMultiplier
    );

    const complianceWarnings: string[] = [];
    const dailyLimitBreaches = overtimeByDate.filter(entry => entry.hours > 3);
    if (dailyLimitBreaches.length) complianceWarnings.push(`OT_DAILY_LIMIT:${dailyLimitBreaches.map(entry => entry.date).join(',')}`);
    const totalOvertimeForCompliance = overtimeByDate.reduce((sum, entry) => sum + entry.hours, 0);
    if (totalOvertimeForCompliance > 45) complianceWarnings.push(`OT_MONTHLY_LIMIT:${roundMoney(totalOvertimeForCompliance)}`);
    const orderedOvertimeDays = overtimeByDate.map(entry => entry.daySerial).sort((a, b) => a - b);
    let consecutive = 0;
    let maxConsecutive = 0;
    let previousDay: number | undefined;
    for (const day of orderedOvertimeDays) {
        consecutive = previousDay !== undefined && day === previousDay + 1 ? consecutive + 1 : 1;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
        previousDay = day;
    }
    if (maxConsecutive > 4) complianceWarnings.push(`OT_CONSECUTIVE_DAYS_LIMIT:${maxConsecutive}`);

    const scheduledDateKeys = new Set<string>();
    const visitedDateKeys = new Set<string>();
    for (let cursor = periodStart.getTime(); cursor < periodEndExclusive.getTime(); cursor += 6 * 3_600_000) {
        const instant = new Date(cursor);
        const local = localClock(instant, policy.timezone);
        if (visitedDateKeys.has(local.dateKey)) continue;
        visitedDateKeys.add(local.dateKey);
        if (schedules.some(schedule => {
            if (schedule.dayOfWeek !== local.dayOfWeek) return false;
            const from = schedule.effectiveFrom ? new Date(schedule.effectiveFrom) : null;
            const to = schedule.effectiveTo ? new Date(schedule.effectiveTo) : null;
            return (!from || from <= instant) && (!to || to >= instant);
        })) scheduledDateKeys.add(local.dateKey);
    }
    const absenceDates = [...scheduledDateKeys].filter(date => !daily.has(date)).sort();
    if (absenceDates.length) complianceWarnings.push(`ABSENCE_REVIEW_REQUIRED:${absenceDates.join(',')}`);

    return {
        hoursWorked: roundMoney(regularHours + overtimeHours + weekendHours + holidayHours),
        regularHours: roundMoney(regularHours),
        overtimeHours: roundMoney(overtimeHours),
        weekendHours: roundMoney(weekendHours),
        holidayHours: roundMoney(holidayHours),
        attendanceDays: daily.size,
        scheduledDays: scheduledDateKeys.size,
        absenceDays: absenceDates.length,
        absenceDates,
        hourlyRate: roundMoney(hourlyRate),
        basePay: roundMoney(basePay),
        overtimePay: roundMoney(overtimePay),
        lateMinutes: Math.round(lateMinutes),
        earlyLeaveMinutes: Math.round(earlyLeaveMinutes),
        attendanceDeduction: roundMoney(attendanceDeduction),
        shiftCount,
        nightPremiumHours: roundMoney(nightPremiumHours),
        eveningOvertimeHours: roundMoney(eveningOvertimeHours),
        nightOvertimeHours: roundMoney(nightOvertimeHours),
        complianceWarnings,
    };
}
