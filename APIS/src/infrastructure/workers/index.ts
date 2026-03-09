// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Queue Workers (RabbitMQ consumers)
// Process async jobs: stock movements, activity logs, cache invalidation
// ═══════════════════════════════════════════════════════════════════════════

import { consume, subscribeCacheInvalidation, QUEUES, isRabbitMQConnected } from '@/config/rabbitmq.config';
import { cache } from '@/config/redis.config';
import { db } from '@/config/database.config';
import { inventory, stockMovements, activityLogs, notifications } from '@/db/schema/tables';
import { eq, and } from 'drizzle-orm';
import { SocketEventEmitter } from '@/infrastructure/http/socket';

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
async function processActivityLog(data: {
    userId: string;
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
}): Promise<void> {
    const entityId = data.entityId || data.resourceId;
    await db.insert(activityLogs).values({
        userId: data.userId,
        action: data.action,
        entity: data.entity || data.resource,
        ...(entityId ? { entityId } : {}),
        description: data.details || data.description,
        metadata: data.metadata as any,
        ip: data.ip,
        userAgent: data.userAgent,
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

    const { publish, isRabbitMQConnected: isConnected } = await import('@/config/rabbitmq.config');
    if (isConnected()) {
        publish(QUEUES.ASSET_CLEANUP, { publicIds, reason });
    } else {
        // Sync fallback — delete immediately
        processAssetCleanup({ publicIds, reason }).catch(() => {});
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Start all workers
// ═══════════════════════════════════════════════════════════════════════════
export function startWorkers(): void {
    if (!isRabbitMQConnected()) {
        console.warn('⚠️  Workers not started - RabbitMQ not connected (sync fallback active)');
        return;
    }

    consume(QUEUES.STOCK_MOVEMENT, processStockMovement);
    consume(QUEUES.ACTIVITY_LOG, processActivityLog);
    consume(QUEUES.NOTIFICATION, processNotification);
    consume(QUEUES.ASSET_CLEANUP, processAssetCleanup);
    subscribeCacheInvalidation(handleCacheInvalidation);

    console.log('✅ Queue workers started: stock-movement, activity-log, notification, asset-cleanup, cache-invalidation');
}
