import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { computeAuditChecksum } from '@/shared/audit-checksum';

// ── helpers ──────────────────────────────────────────────────────────────────
// Independent re-implementation used only by the key-isolation test below,
// which needs to compute a checksum with a *different* secret than the one
// computeAuditChecksum reads from process.env (AUDIT_HMAC_SECRET).
function checksumWithSecret(
    fields: { userId: string; action: string; resource: string; details: string; metadata: Record<string, unknown>; ts: string },
    secret: string,
): string {
    return createHmac('sha256', secret)
        .update(JSON.stringify(fields))
        .digest('hex');
}

describe('audit checksum (SEC-06)', () => {
    it('produces a 64-character hex string', () => {
        const chk = computeAuditChecksum(
            { userId: 'u1', action: 'SALE_CREATE', resource: 'sales', details: '', metadata: {}, ts: '2026-01-01T00:00:00.000Z' },
        );
        expect(chk).toMatch(/^[0-9a-f]{64}$/);
    });

    it('same inputs produce same checksum (deterministic)', () => {
        const fields = { userId: 'u1', action: 'SALE_CREATE', resource: 'sales', details: 'ok', metadata: { amount: 100 }, ts: '2026-01-01T00:00:00.000Z' };
        expect(computeAuditChecksum(fields)).toBe(computeAuditChecksum(fields));
    });

    it('different userId produces different checksum', () => {
        const base = { action: 'SALE_CREATE', resource: 'sales', details: '', metadata: {}, ts: '2026-01-01T00:00:00.000Z' };
        const a = computeAuditChecksum({ ...base, userId: 'u1' });
        const b = computeAuditChecksum({ ...base, userId: 'u2' });
        expect(a).not.toBe(b);
    });

    it('different action produces different checksum', () => {
        const base = { userId: 'u1', resource: 'sales', details: '', metadata: {}, ts: '2026-01-01T00:00:00.000Z' };
        const a = computeAuditChecksum({ ...base, action: 'SALE_CREATE' });
        const b = computeAuditChecksum({ ...base, action: 'SALE_VOID' });
        expect(a).not.toBe(b);
    });

    it('different ts produces different checksum', () => {
        const base = { userId: 'u1', action: 'SALE_CREATE', resource: 'sales', details: '', metadata: {} };
        const a = computeAuditChecksum({ ...base, ts: '2026-01-01T00:00:00.000Z' });
        const b = computeAuditChecksum({ ...base, ts: '2026-01-01T00:00:01.000Z' });
        expect(a).not.toBe(b);
    });

    it('mutating metadata changes the checksum (tamper detection)', () => {
        const base = { userId: 'u1', action: 'LOGIN', resource: 'auth', details: '', ts: '2026-01-01T00:00:00.000Z' };
        const original = computeAuditChecksum({ ...base, metadata: { ip: '1.2.3.4' } });
        const tampered = computeAuditChecksum({ ...base, metadata: { ip: '9.9.9.9' } });
        expect(original).not.toBe(tampered);
    });

    it('uses different secret → different checksum (key isolation)', () => {
        const fields = { userId: 'u1', action: 'LOGIN', resource: 'auth', details: '', metadata: {}, ts: '2026-01-01T00:00:00.000Z' };
        const a = computeAuditChecksum(fields);
        const b = checksumWithSecret(fields, 'wrong-secret-key-for-testing-only');
        expect(a).not.toBe(b);
    });

    it('throws if AUDIT_HMAC_SECRET is unset (no insecure hardcoded fallback)', () => {
        const original = process.env.AUDIT_HMAC_SECRET;
        delete process.env.AUDIT_HMAC_SECRET;
        try {
            expect(() => computeAuditChecksum({
                userId: 'u1', action: 'LOGIN', resource: 'auth', details: '', metadata: {}, ts: '2026-01-01T00:00:00.000Z',
            })).toThrow();
        } finally {
            process.env.AUDIT_HMAC_SECRET = original;
        }
    });
});
