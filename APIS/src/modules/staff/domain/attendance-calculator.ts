import { localClock, type EmployeeWorkSchedule } from '@/shared/employee-work-schedule';

export interface AttendanceMetrics {
    workDate: string;
    timezone: string;
    scheduledStartAt: Date | null;
    scheduledEndAt: Date | null;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    workedMinutes: number;
}

function parseTime(value: string): { hour: number; minute: number } {
    const [hour, minute] = value.split(':').map(Number);
    return { hour, minute };
}

function zonedParts(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}

/** Convert a wall-clock date/time in an IANA timezone to an absolute Date. */
export function zonedDateTimeToUtc(dateKey: string, time: string, timezone: string): Date {
    const [year, month, day] = dateKey.split('-').map(Number);
    const { hour, minute } = parseTime(time);
    const targetWallTime = Date.UTC(year, month - 1, day, hour, minute, 0);
    let guess = new Date(targetWallTime);
    // Two passes cover timezone offsets and DST transitions without adding a
    // second date library. Payroll/attendance keeps the original IANA zone.
    for (let pass = 0; pass < 2; pass += 1) {
        const actual = zonedParts(guess, timezone);
        const actualWallTime = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
        guess = new Date(guess.getTime() + (targetWallTime - actualWallTime));
    }
    return guess;
}

function addLocalDay(dateKey: string): string {
    const [year, month, day] = dateKey.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return next.toISOString().slice(0, 10);
}

export function calculateAttendanceMetrics(
    clockInAt: Date,
    clockOutAt: Date | null,
    schedule?: EmployeeWorkSchedule | null,
): AttendanceMetrics {
    const timezone = schedule?.timezone || 'Asia/Vientiane';
    const workDate = localClock(clockInAt, timezone).dateKey;
    let scheduledStartAt: Date | null = null;
    let scheduledEndAt: Date | null = null;

    if (schedule) {
        scheduledStartAt = zonedDateTimeToUtc(workDate, schedule.startTime, timezone);
        const overnight = schedule.endTime <= schedule.startTime;
        scheduledEndAt = zonedDateTimeToUtc(overnight ? addLocalDay(workDate) : workDate, schedule.endTime, timezone);
    }

    return {
        workDate,
        timezone,
        scheduledStartAt,
        scheduledEndAt,
        lateMinutes: scheduledStartAt ? Math.max(0, Math.floor((clockInAt.getTime() - scheduledStartAt.getTime()) / 60_000)) : 0,
        earlyLeaveMinutes: clockOutAt && scheduledEndAt ? Math.max(0, Math.ceil((scheduledEndAt.getTime() - clockOutAt.getTime()) / 60_000)) : 0,
        workedMinutes: clockOutAt ? Math.max(0, Math.floor((clockOutAt.getTime() - clockInAt.getTime()) / 60_000)) : 0,
    };
}
