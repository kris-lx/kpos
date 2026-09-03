import { describe, expect, it } from 'vitest';
import { evaluateClockOut, type EmployeeWorkSchedule } from './employee-work-schedule';

const base: EmployeeWorkSchedule = {
    id: 'schedule-1',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '17:00',
    timezone: 'UTC',
    earlyClockOutGraceMinutes: 0,
};

describe('evaluateClockOut', () => {
    it('blocks clock-out before a same-day scheduled end', () => {
        expect(evaluateClockOut(base, new Date('2026-08-24T16:30:00Z'))).toMatchObject({
            canClose: false,
            minutesRemaining: 30,
        });
    });

    it('allows clock-out at the scheduled end', () => {
        expect(evaluateClockOut(base, new Date('2026-08-24T17:00:00Z')).canClose).toBe(true);
    });

    it('supports overnight schedules', () => {
        const overnight = { ...base, startTime: '22:00', endTime: '06:00' };
        expect(evaluateClockOut(overnight, new Date('2026-08-25T05:30:00Z'))).toMatchObject({
            canClose: false,
            minutesRemaining: 30,
        });
        expect(evaluateClockOut(overnight, new Date('2026-08-25T06:00:00Z')).canClose).toBe(true);
    });

    it('honours an explicitly configured grace period', () => {
        const withGrace = { ...base, earlyClockOutGraceMinutes: 15 };
        expect(evaluateClockOut(withGrace, new Date('2026-08-24T16:50:00Z')).canClose).toBe(true);
    });
});
