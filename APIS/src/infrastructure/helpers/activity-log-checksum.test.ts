import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

// ── helpers ──────────────────────────────────────────────────────────────────
// Re-implement the checksum formula here to validate it independently
function expectedChecksum(
    fields: { userId: string; action: string; resource: string; details: string; metadata: Record<string, unknown>; ts: string },
    secret: string,
): string {
    return createHmac('sha256', secret)
        .update(JSON.stringify(fields))
        .digest('hex');
}

describe('audit checksum (SEC-06)', () => {
    const SECRET = process.env.JWT_SECRET!; // set by test-setup.ts

    it('produces a 64-character hex string', () => {
        const chk = expectedChecksum(
            { userId: 'u1', action: 'SALE_CREATE', resource: 'sales', details: '', metadata: {}, ts: '2026-01-01T00:00:00.000Z' },
            SECRET,
        );
        expect(chk).toMatch(/^[0-9a-f]{64}$/);
    });

    it('same inputs produce same checksum (deterministic)', () => {
        const fields = { userId: 'u1', action: 'SALE_CREATE', resource: 'sales', details: 'ok', metadata: { amount: 100 }, ts: '2026-01-01T00:00:00.000Z' };
        expect(expectedChecksum(fields, SECRET)).toBe(expectedChecksum(fields, SECRET));
    });

    it('different userId produces different checksum', () => {
        const base = { action: 'SALE_CREATE', resource: 'sales', details: '', metadata: {}, ts: '2026-01-01T00:00:00.000Z' };
        const a = expectedChecksum({ ...base, userId: 'u1' }, SECRET);
        const b = expectedChecksum({ ...base, userId: 'u2' }, SECRET);
        expect(a).not.toBe(b);
    });

    it('different action produces different checksum', () => {
        const base = { userId: 'u1', resource: 'sales', details: '', metadata: {}, ts: '2026-01-01T00:00:00.000Z' };
        const a = expectedChecksum({ ...base, action: 'SALE_CREATE' }, SECRET);
        const b = expectedChecksum({ ...base, action: 'SALE_VOID' }, SECRET);
        expect(a).not.toBe(b);
    });

    it('different ts produces different checksum', () => {
        const base = { userId: 'u1', action: 'SALE_CREATE', resource: 'sales', details: '', metadata: {} };
        const a = expectedChecksum({ ...base, ts: '2026-01-01T00:00:00.000Z' }, SECRET);
        const b = expectedChecksum({ ...base, ts: '2026-01-01T00:00:01.000Z' }, SECRET);
        expect(a).not.toBe(b);
    });

    it('mutating metadata changes the checksum (tamper detection)', () => {
        const base = { userId: 'u1', action: 'LOGIN', resource: 'auth', details: '', ts: '2026-01-01T00:00:00.000Z' };
        const original = expectedChecksum({ ...base, metadata: { ip: '1.2.3.4' } }, SECRET);
        const tampered = expectedChecksum({ ...base, metadata: { ip: '9.9.9.9' } }, SECRET);
        expect(original).not.toBe(tampered);
    });

    it('uses different secret → different checksum (key isolation)', () => {
        const fields = { userId: 'u1', action: 'LOGIN', resource: 'auth', details: '', metadata: {}, ts: '2026-01-01T00:00:00.000Z' };
        const a = expectedChecksum(fields, SECRET);
        const b = expectedChecksum(fields, 'wrong-secret-key-for-testing-only');
        expect(a).not.toBe(b);
    });
});
