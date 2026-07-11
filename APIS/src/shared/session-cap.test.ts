import { describe, it, expect } from 'vitest';
import { isSessionExpired } from './session-cap';

const HOUR_MS = 60 * 60 * 1000;
const TWENTY_HOURS_MS = 20 * HOUR_MS;

describe('isSessionExpired()', () => {
    it('is not expired immediately after login', () => {
        const now = 1_700_000_000_000;
        const sessionStart = Math.floor(now / 1000); // just logged in
        expect(isSessionExpired(sessionStart, TWENTY_HOURS_MS, now)).toBe(false);
    });

    it('is not expired at 19h59m', () => {
        const now = 1_700_000_000_000;
        const sessionStart = Math.floor((now - (TWENTY_HOURS_MS - 60_000)) / 1000);
        expect(isSessionExpired(sessionStart, TWENTY_HOURS_MS, now)).toBe(false);
    });

    it('is expired at exactly 20h01m (past the boundary)', () => {
        const now = 1_700_000_000_000;
        const sessionStart = Math.floor((now - (TWENTY_HOURS_MS + 60_000)) / 1000);
        expect(isSessionExpired(sessionStart, TWENTY_HOURS_MS, now)).toBe(true);
    });

    it('is expired for a session started a week ago (rotation cannot extend past the cap)', () => {
        const now = 1_700_000_000_000;
        const sessionStart = Math.floor((now - 7 * 24 * HOUR_MS) / 1000);
        expect(isSessionExpired(sessionStart, TWENTY_HOURS_MS, now)).toBe(true);
    });

    it('respects a different configured cap length', () => {
        const now = 1_700_000_000_000;
        const oneHourAgo = Math.floor((now - HOUR_MS) / 1000);
        // 30-minute cap: a session started 1h ago is expired
        expect(isSessionExpired(oneHourAgo, 30 * 60_000, now)).toBe(true);
        // 2-hour cap: the same session is still within bounds
        expect(isSessionExpired(oneHourAgo, 2 * HOUR_MS, now)).toBe(false);
    });
});
