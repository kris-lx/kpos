// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Activity Log Helper
// Publishes to RabbitMQ queue if available, falls back to direct DB write
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { activityLogs } from '@/db/schema/tables';
import { QUEUES, isRabbitMQConnected } from '@/config/rabbitmq.config';
import { enqueueOutboxMessage } from '@/infrastructure/messaging/outbox.service';
import { computeAuditChecksum } from '@/shared/audit-checksum';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validUuid(value: unknown): string | null {
    return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

export async function queueActivityLog(
    userId: string,
    action: string,
    resource: string,
    details: string,
    metadata?: Record<string, unknown>,
    req?: { ip?: string; headers?: Record<string, string | string[] | undefined> },
    audit?: {
        entity?: string;
        entityId?: string;
        oldData?: unknown;
        newData?: unknown;
    },
): Promise<void> {
    try {
        const ip = req?.ip || (req?.headers?.['x-forwarded-for'] as string) || null;
        const userAgent = (req?.headers?.['user-agent'] as string) || null;
        const ts = new Date().toISOString();
        const meta = metadata || {};
        const authUser = (req as any)?.authUser;
        const actorId = validUuid(userId) || validUuid(authUser?.userId);
        if (!actorId) return;
        const branchId = validUuid(meta.branchId) || validUuid(authUser?.activeBranchId) || validUuid(authUser?.branchId);
        const storeId = validUuid(meta.storeId) || validUuid(authUser?.activeStoreId) || validUuid(authUser?.storeId);
        const tenantId = validUuid(authUser?.tenantId);
        const entityId = validUuid(audit?.entityId);
        const checksum = computeAuditChecksum({ userId: actorId, action, resource, details, metadata: meta, ts });

        const payload: Record<string, unknown> = {
            userId: actorId,
            action,
            resource,
            details,
            metadata: meta,
            ip,
            userAgent,
            checksum,
            ts,
            branchId,
            storeId,
            entity: audit?.entity || resource,
            entityId,
            oldData: audit?.oldData,
            newData: audit?.newData,
        };

        // Publish to queue (async, non-blocking) — fall back to direct DB write
        payload.tenantId = tenantId;
        const queued = isRabbitMQConnected() && await enqueueOutboxMessage({
            queue: QUEUES.ACTIVITY_LOG,
            eventType: 'activity.log',
            tenantId,
            payload,
        });
        if (!queued) {
            await db.insert(activityLogs).values({
                userId: actorId,
                tenantId,
                storeId,
                branchId,
                action,
                description: details,
                entity: audit?.entity || resource,
                ...(entityId ? { entityId } : {}),
                metadata: meta,
                oldData: audit?.oldData as any,
                newData: audit?.newData as any,
                ip,
                userAgent,
                checksum,
            });
        }
    } catch {
        // Never block the API response due to logging failures
    }
}
