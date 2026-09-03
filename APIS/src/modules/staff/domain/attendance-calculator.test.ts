import { describe, expect, it } from 'vitest';
import { calculateAttendanceMetrics, zonedDateTimeToUtc } from './attendance-calculator';

const schedule = {
    id: 'schedule-1', dayOfWeek: 1, startTime: '08:00', endTime: '17:00',
    timezone: 'Asia/Vientiane', earlyClockOutGraceMinutes: 0,
};

describe('attendance calculator', () => {
    it('converts Vientiane wall time to UTC', () => {
        expect(zonedDateTimeToUtc('2026-08-31', '08:00', 'Asia/Vientiane').toISOString()).toBe('2026-08-31T01:00:00.000Z');
    });

    it('calculates late, early and worked minutes', () => {
        const result = calculateAttendanceMetrics(
            new Date('2026-08-31T01:15:00.000Z'),
            new Date('2026-08-31T09:45:00.000Z'),
            schedule,
        );
        expect(result.workDate).toBe('2026-08-31');
        expect(result.lateMinutes).toBe(15);
        expect(result.earlyLeaveMinutes).toBe(15);
        expect(result.workedMinutes).toBe(510);
    });

    it('supports overnight schedules', () => {
        const result = calculateAttendanceMetrics(
            new Date('2026-08-31T15:00:00.000Z'),
            new Date('2026-09-01T00:00:00.000Z'),
            { ...schedule, startTime: '22:00', endTime: '07:00' },
        );
        expect(result.scheduledEndAt?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
        expect(result.workedMinutes).toBe(540);
        expect(result.earlyLeaveMinutes).toBe(0);
    });

    it('does not invent late or early minutes when no schedule exists', () => {
        const result = calculateAttendanceMetrics(new Date('2026-08-31T01:00:00.000Z'), new Date('2026-08-31T09:00:00.000Z'));
        expect(result.lateMinutes).toBe(0);
        expect(result.earlyLeaveMinutes).toBe(0);
        expect(result.workedMinutes).toBe(480);
    });
});
