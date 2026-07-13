// ═══════════════════════════════════════════════════════════════════════════
// HMAC-SHA256 checksum for activityLogs rows (tamper detection). Uses a
// dedicated AUDIT_HMAC_SECRET, not JWT_SECRET — rotating the JWT signing key
// (e.g. after a suspected token compromise) must not also invalidate every
// historical audit-log checksum, and vice versa. Same key-separation
// rationale as CONFIG_ENCRYPTION_KEY in crypto.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { createHmac } from 'crypto';

export interface AuditChecksumFields {
    userId: string;
    action: string;
    resource: string;
    details: string;
    metadata: Record<string, unknown>;
    ts: string;
}

export function computeAuditChecksum(fields: AuditChecksumFields): string {
    const secret = process.env.AUDIT_HMAC_SECRET;
    if (!secret) {
        throw new Error('AUDIT_HMAC_SECRET is not set — required to compute audit-log checksums');
    }
    return createHmac('sha256', secret)
        .update(JSON.stringify(fields))
        .digest('hex');
}
