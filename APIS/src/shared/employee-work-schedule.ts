export type EmployeeWorkSchedule = {
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    timezone: string;
    earlyClockOutGraceMinutes: number;
};

export type ClockOutStatus = {
    scheduleId: string;
    canClose: boolean;
    scheduledStartTime: string;
    scheduledEndTime: string;
    timezone: string;
    minutesRemaining: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

function parseTime(value: string): number {
    const [hour, minute] = value.split(':').map(Number);
    return (hour * 60) + minute;
}

export function localClock(date: Date, timezone: string): { dayOfWeek: number; minuteOfDay: number; dateKey: string; daySerial: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const weekday = parts.find((part) => part.type === 'weekday')?.value || 'Sun';
    const year = Number(parts.find((part) => part.type === 'year')?.value || 1970);
    const month = Number(parts.find((part) => part.type === 'month')?.value || 1);
    const day = Number(parts.find((part) => part.type === 'day')?.value || 1);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    return {
        dayOfWeek: WEEKDAY_INDEX[weekday] ?? 0,
        minuteOfDay: (hour * 60) + minute,
        dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        daySerial: Math.floor(Date.UTC(year, month - 1, day) / 86_400_000),
    };
}

export function scheduleMatchesOpenedAt(schedule: EmployeeWorkSchedule, openedAt: Date): boolean {
    return localClock(openedAt, schedule.timezone).dayOfWeek === schedule.dayOfWeek;
}

export function evaluateClockOut(schedule: EmployeeWorkSchedule, now = new Date()): ClockOutStatus {
    const current = localClock(now, schedule.timezone);
    const startMinute = parseTime(schedule.startTime);
    const endMinute = parseTime(schedule.endTime);
    let minutesRemaining = 0;

    if (endMinute > startMinute) {
        if (current.dayOfWeek === schedule.dayOfWeek && current.minuteOfDay < endMinute) {
            minutesRemaining = endMinute - current.minuteOfDay;
        }
    } else {
        const followingDay = (schedule.dayOfWeek + 1) % 7;
        if (current.dayOfWeek === schedule.dayOfWeek) {
            minutesRemaining = (24 * 60 - current.minuteOfDay) + endMinute;
        } else if (current.dayOfWeek === followingDay && current.minuteOfDay < endMinute) {
            minutesRemaining = endMinute - current.minuteOfDay;
        }
    }

    const grace = Math.max(0, schedule.earlyClockOutGraceMinutes || 0);
    return {
        scheduleId: schedule.id,
        canClose: minutesRemaining <= grace,
        scheduledStartTime: schedule.startTime,
        scheduledEndTime: schedule.endTime,
        timezone: schedule.timezone,
        minutesRemaining: Math.max(0, minutesRemaining),
    };
}
