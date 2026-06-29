// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Platform Audit Log Helper (SEC-08)
// Records cross-tenant actions performed by platform super-admins:
// tenant create/suspend/delete, role mass-assign, config changes.
// Uses a separate table (platform_audit_logs) with no tenant scope —
// only platform admins can query it.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { platformAuditLogs } from '@/db/schema/tables';

export interface PlatformAuditPayload {
    actorId: string;
    action: string;
    tenantId?: string | null;
    metadata?: Record<string, unknown>;
}

/**
 * Writes one record to `platform_audit_logs`.
 * Never throws — audit failure must never block the calling request.
 */
export async function writePlatformAuditLog(payload: PlatformAuditPayload): Promise<void> {
    try {
        await db.insert(platformAuditLogs).values({
            actorId: payload.actorId,
            action: payload.action,
            tenantId: payload.tenantId ?? null,
            metadata: payload.metadata ?? {},
        });
    } catch {
        // Intentionally silent — audit log writes must never crash the caller
    }
}
