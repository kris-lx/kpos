// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Queue Workers (RabbitMQ consumers)
// Process async jobs: stock movements, activity logs, cache invalidation
// ═══════════════════════════════════════════════════════════════════════════

import { consume, subscribeCacheInvalidation, publishEnvelope, QUEUES, isRabbitMQConnected, type MessageEnvelope } from '@/config/rabbitmq.config';
import { claimOutboxBatch, markOutboxFailed, markOutboxPublished, enqueueOutboxMessage, purgePublishedOutbox } from '@/infrastructure/messaging/outbox.service';
import { computeAuditChecksum } from '@/shared/audit-checksum';
import { acquireLock, releaseLock } from '@/shared/distributed-lock';
import { cache } from '@/config/redis.config';
import { db } from '@/config/database.config';
import { inventory, stockMovements, activityLogs, notifications, sessions } from '@/db/schema/tables';
import { eq, and, lt, isNotNull, sql } from 'drizzle-orm';
import { SocketEventEmitter } from '@/infrastructure/http/socket';
import { webPushService } from '@/infrastructure/services/webpush.service';
import { sendEmail, logEmailResult, type SendEmailParams } from '@/infrastructure/services/email/email.service';
import { processPrintJob } from '@/modules/settings/application/print-job.service';

// ═══════════════════════════════════════════════════════════════════════════
// Stock Movement Worker
// Processes inventory deductions/additions asynchronously after sales
// ═══════════════════════════════════════════════════════════════════════════
async function processStockMovement(data: {
    productId: string;
    branchId: string;
    storeId?: string;
    type: string;
    quantity: number;
    reason?: string;
    reference?: string;
    referenceType?: string;
    userId: string;
}): Promise<void> {
    const { productId, branchId, storeId, type, quantity, reason, reference, referenceType, userId } = data;

    // Find current inventory
    const inv = await db.query.inventory.findFirst({
        where: and(eq(inventory.productId, productId), eq(inventory.branchId, branchId)),
    });

    const previousQty = inv?.quantity || 0;
    const delta = type === 'OUT' || type === 'TRANSFER_OUT' ? -quantity : quantity;
    const newQty = Math.max(0, previousQty + delta);

    // Create stock movement record
    await db.insert(stockMovements).values({
        productId,
        branchId,
        storeId,
        type,
        quantity,
        previousQty,
        newQty,
        reason,
        reference,
        referenceType,
        userId,
    });

    // Update inventory
    if (inv) {
        await db.update(inventory)
            .set({
                quantity: newQty,
                available: Math.max(0, newQty - inv.reserved),
                updatedAt: new Date(),
            })
            .where(eq(inventory.id, inv.id));
    } else if (delta > 0) {
        await db.insert(inventory).values({
            productId,
            branchId,
            storeId,
            quantity: newQty,
            available: newQty,
            reserved: 0,
        });
    }

    // Invalidate inventory-related caches
    await cache.delPattern('kpos:q:inventory*');
    await cache.delPattern('kpos:q:dashboard*');
}

// ═══════════════════════════════════════════════════════════════════════════
// Activity Log Worker
// Writes activity logs asynchronously (non-blocking for API responses)
// ═══════════════════════════════════════════════════════════════════════════
const AUDIT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const auditUuid = (value: unknown): string | null => typeof value === 'string' && AUDIT_UUID_PATTERN.test(value) ? value : null;

async function processActivityLog(data: {
    userId: string;
    tenantId?: string | null;
    action: string;
    resource?: string;
    resourceId?: string;
    entity?: string;
    entityId?: string;
    details?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
    checksum?: string;
    ts?: string;
    storeId?: string | null;
    branchId?: string | null;
    oldData?: unknown;
    newData?: unknown;
}): Promise<void> {
    const actorId = auditUuid(data.userId);
    if (!actorId) {
        console.warn('Skipping activity log with missing or invalid actor UUID');
        return;
    }
    const entityId = auditUuid(data.entityId) || auditUuid(data.resourceId);
    // Re-compute checksum if not already provided by the publisher
    const checksum = data.checksum || computeAuditChecksum({
        userId: actorId,
        action: data.action,
        resource: data.resource || data.entity || '',
        details: data.details || data.description || '',
        metadata: data.metadata || {},
        ts: data.ts || new Date().toISOString(),
    });
    await db.insert(activityLogs).values({
        userId: actorId,
        tenantId: auditUuid(data.tenantId),
        storeId: auditUuid(data.storeId) || auditUuid(data.metadata?.storeId),
        branchId: auditUuid(data.branchId) || auditUuid(data.metadata?.branchId),
        action: data.action,
        entity: data.entity || data.resource,
        ...(entityId ? { entityId } : {}),
        description: data.details || data.description,
        metadata: data.metadata as any,
        oldData: data.oldData as any,
        newData: data.newData as any,
        ip: data.ip,
        userAgent: data.userAgent,
        checksum,
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Cache Invalidation Listener
// Listens for cache invalidation events from other instances (fanout)
// ═══════════════════════════════════════════════════════════════════════════
function handleCacheInvalidation(pattern: string): void {
    cache.delPattern(pattern).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// Notification Worker
// Persists notifications to DB and pushes via Socket.IO
// ═══════════════════════════════════════════════════════════════════════════
async function processNotification(data: {
    userId: string;
    tenantId?: string | null;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
}): Promise<void> {
    const [notification] = await db.insert(notifications).values({
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data || null,
    }).returning();

    SocketEventEmitter.emitToUser(data.userId, 'notification:new', {
        id: notification.id,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data,
        createdAt: notification.createdAt,
    });

    webPushService.sendToUser(data.userId, {
        title: data.title,
        body: data.message,
        tag: data.type,
        data: data.data,
    }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// Email Worker — sends via the tenant's configured provider, retries with
// backoff (1m, 5m, 30m) by republishing rather than relying on RabbitMQ's
// own immediate-requeue nack (which would hot-loop on a permanent failure
// like bad credentials).
// ═══════════════════════════════════════════════════════════════════════════
const EMAIL_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];

async function processEmail(data: SendEmailParams & { attempt: number }): Promise<void> {
    const { attempt, ...params } = data;
    try {
        await sendEmail(params);
        await logEmailResult({ tenantId: params.tenantId, toEmail: params.to.join(','), templateKey: params.templateKey, status: 'sent' });
    } catch (err: any) {
        if (attempt < EMAIL_RETRY_DELAYS_MS.length) {
            const queued = await enqueueOutboxMessage({
                queue: QUEUES.EMAIL,
                eventType: 'email.send.retry',
                tenantId: params.tenantId,
                payload: { ...params, attempt: attempt + 1 },
                availableAt: new Date(Date.now() + EMAIL_RETRY_DELAYS_MS[attempt]),
            });
            if (!queued) throw err;
        } else {
            await logEmailResult({ tenantId: params.tenantId, toEmail: params.to.join(','), templateKey: params.templateKey, status: 'failed', error: err?.message || String(err) });
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Asset Cleanup Worker
// Deletes orphaned Cloudinary assets when images are updated or entities deleted
// ═══════════════════════════════════════════════════════════════════════════
async function processAssetCleanup(data: {
    publicIds: string[];
    reason?: string;
}): Promise<void> {
    if (!data.publicIds?.length) return;

    try {
        const { uploadService } = await import('@/infrastructure/services/upload.service');
        for (const publicId of data.publicIds) {
            const deleted = await uploadService.deleteImage(publicId);
            if (!deleted) {
                console.warn(`[AssetCleanup] Failed to delete: ${publicId}`);
            }
        }
    } catch (err) {
        console.error('[AssetCleanup] Error:', err instanceof Error ? err.message : err);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper: queue asset cleanup from any route (fire-and-forget)
// Usage: import { queueAssetCleanup } from '@/infrastructure/workers';
//        queueAssetCleanup(['kpos/products/abc123']);
// ═══════════════════════════════════════════════════════════════════════════
export async function queueAssetCleanup(publicIds: string[], reason?: string): Promise<void> {
    if (!publicIds.length) return;

    const { isRabbitMQConnected: isConnected } = await import('@/config/rabbitmq.config');
    if (isConnected()) {
        const queued = await enqueueOutboxMessage({
            queue: QUEUES.ASSET_CLEANUP,
            eventType: 'asset.cleanup',
            payload: { publicIds, reason },
        });
        if (!queued) processAssetCleanup({ publicIds, reason }).catch(() => {});
    } else {
        // Sync fallback — delete immediately
        processAssetCleanup({ publicIds, reason }).catch(() => {});
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Session Cleanup — delete revoked sessions older than 7 days
// Runs every 6 hours to prevent unbounded session table growth
// ═══════════════════════════════════════════════════════════════════════════
const SESSION_CLEANUP_LOCK_KEY = 'kpos:session-cleanup-lock';
const SESSION_CLEANUP_LOCK_TTL_MS = 5 * 60 * 1000; // generous vs. typical cleanup duration

async function cleanupExpiredSessions(): Promise<void> {
    // Scaling audit (2026-07-11): this runs in every API instance on the same
    // interval. Deleting the same rows twice is harmless, but the lock still
    // avoids every replica hitting the DB with the same DELETE simultaneously
    // on every tick, and matches the pattern already used for the backup cron.
    const lockToken = await acquireLock(SESSION_CLEANUP_LOCK_KEY, SESSION_CLEANUP_LOCK_TTL_MS);
    if (!lockToken) return; // another instance is already running this tick's cleanup
    try {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await db.delete(sessions)
            .where(and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, cutoff)));
        console.log(`[SessionCleanup] Deleted old revoked sessions (cutoff: ${cutoff.toISOString()})`);
    } catch (err) {
        console.error('[SessionCleanup] Failed:', err);
    } finally {
        await releaseLock(SESSION_CLEANUP_LOCK_KEY, lockToken);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Partition Maintenance — keep transactions/transaction_items/stock_movements
// (monthly RANGE-partitioned since migration 0029) supplied with partitions
// ahead of need. Postgres does not create partitions automatically; without
// this, inserts for a month with no matching partition would fall into the
// DEFAULT partition instead (still correct, but loses partition pruning for
// that month's data going forward). Runs daily — 6 months of lead time is
// generous room for a once-a-day job to never fall behind.
// ═══════════════════════════════════════════════════════════════════════════
const PARTITION_MAINTENANCE_LOCK_KEY = 'kpos:partition-maintenance-lock';
const PARTITION_MAINTENANCE_LOCK_TTL_MS = 5 * 60 * 1000;

async function ensureFuturePartitions(): Promise<void> {
    const lockToken = await acquireLock(PARTITION_MAINTENANCE_LOCK_KEY, PARTITION_MAINTENANCE_LOCK_TTL_MS);
    if (!lockToken) return; // another instance is already running this tick
    try {
        await db.execute(sql`SELECT ensure_future_partitions(6)`);
        console.log('[PartitionMaintenance] Ensured partitions exist through 6 months ahead');
    } catch (err) {
        console.error('[PartitionMaintenance] Failed:', err);
    } finally {
        await releaseLock(PARTITION_MAINTENANCE_LOCK_KEY, lockToken);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Start all workers
// ═══════════════════════════════════════════════════════════════════════════
let outboxRelayTimer: ReturnType<typeof setInterval> | null = null;
let outboxRelayRunning = false;

async function relayOutbox(): Promise<void> {
    if (outboxRelayRunning || !isRabbitMQConnected()) return;
    outboxRelayRunning = true;
    try {
        const messages = await claimOutboxBatch(50);
        for (const message of messages) {
            const envelope: MessageEnvelope = {
                eventId: message.event_id,
                eventType: message.event_type,
                tenantId: message.tenant_id,
                aggregateId: message.aggregate_id,
                occurredAt: message.created_at instanceof Date
                    ? message.created_at.toISOString()
                    : new Date().toISOString(),
                attempt: message.attempts,
                payload: message.payload,
            };
            if (publishEnvelope(message.queue, envelope)) {
                await markOutboxPublished(message.event_id);
            } else {
                await markOutboxFailed(message.event_id, 'RabbitMQ publish returned false', message.attempts);
            }
        }
    } catch (err) {
        console.error('[Outbox] Relay failed:', err instanceof Error ? err.message : err);
    } finally {
        outboxRelayRunning = false;
    }
}

async function processQueuedPrintJob(data: { jobId: string; tenantId: string }): Promise<void> {
    if (!data?.jobId || !data?.tenantId) throw new Error('Invalid print job message');
    await processPrintJob(data.jobId, data.tenantId);
}

export function startOutboxRelay(): void {
    if (outboxRelayTimer) return;
    void relayOutbox();
    outboxRelayTimer = setInterval(() => void relayOutbox(), 1_000);
    setInterval(() => purgePublishedOutbox().catch(() => {}), 60 * 60 * 1_000);
}

export function startWorkers(): void {
    startOutboxRelay();
    if (!isRabbitMQConnected()) {
        console.warn('⚠️  Workers not started - RabbitMQ not connected (sync fallback active)');
        return;
    }

    consume(QUEUES.STOCK_MOVEMENT, processStockMovement);
    consume(QUEUES.ACTIVITY_LOG, processActivityLog);
    consume(QUEUES.NOTIFICATION, processNotification);
    consume(QUEUES.ASSET_CLEANUP, processAssetCleanup);
    consume(QUEUES.EMAIL, processEmail);
    consume(QUEUES.PRINT_JOB, processQueuedPrintJob);
    subscribeCacheInvalidation(handleCacheInvalidation);

    console.log('✅ Queue workers started: stock-movement, activity-log, notification, asset-cleanup, email, print-job, cache-invalidation');
}

export async function startScheduledJobs(): Promise<void> {
    // Session cleanup: run immediately then every 6 hours
    cleanupExpiredSessions();
    setInterval(cleanupExpiredSessions, 6 * 60 * 60 * 1000);

    // Partition maintenance: run immediately then once a day
    ensureFuturePartitions();
    setInterval(ensureFuturePartitions, 24 * 60 * 60 * 1000);

    // Backup scheduler: reads schedule from DB and starts cron
    const { startBackupScheduler } = await import('./backup.worker');
    await startBackupScheduler();

    console.log('✅ Scheduled jobs started: session-cleanup (every 6h), partition-maintenance (daily), backup-scheduler');
}
