// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Activity Log Helper
// Publishes to RabbitMQ queue if available, falls back to direct DB write
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { activityLogs } from '@/db/schema/tables';
import { publish, QUEUES, isRabbitMQConnected } from '@/config/rabbitmq.config';
import { computeAuditChecksum } from '@/shared/audit-checksum';

export async function queueActivityLog(
    userId: string,
    action: string,
    resource: string,
    details: string,
    metadata?: Record<string, unknown>,
    req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }
): Promise<void> {
    try {
        const ip = req?.ip || (req?.headers?.['x-forwarded-for'] as string) || null;
        const userAgent = (req?.headers?.['user-agent'] as string) || null;
        const ts = new Date().toISOString();
        const meta = metadata || {};
        const checksum = computeAuditChecksum({ userId, action, resource, details, metadata: meta, ts });

        const payload: Record<string, unknown> = {
            userId,
            action,
            resource,
            details,
            metadata: meta,
            ip,
            userAgent,
            checksum,
            ts,
        };

        // Publish to queue (async, non-blocking) — fall back to direct DB write
        const queued = isRabbitMQConnected() && publish(QUEUES.ACTIVITY_LOG, payload);
        if (!queued) {
            await db.insert(activityLogs).values({
                userId,
                action,
                description: details,
                metadata: meta,
                ip,
                userAgent,
                checksum,
            });
        }
    } catch {
        // Never block the API response due to logging failures
    }
}
