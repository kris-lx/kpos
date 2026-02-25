// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Queue Workers (RabbitMQ consumers)
// Process async jobs: stock movements, activity logs, cache invalidation
// ═══════════════════════════════════════════════════════════════════════════

import { consume, subscribeCacheInvalidation, QUEUES, isRabbitMQConnected } from '@/config/rabbitmq.config';
import { cache } from '@/config/redis.config';
import { prisma } from '@/config/database.config';

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
    const inventory = await prisma.inventory.findFirst({
        where: { productId, branchId },
    });

    const previousQty = inventory?.quantity || 0;
    const delta = type === 'OUT' || type === 'TRANSFER_OUT' ? -quantity : quantity;
    const newQty = Math.max(0, previousQty + delta);

    // Create stock movement record
    await prisma.stockMovement.create({
        data: {
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
        },
    });

    // Update inventory
    if (inventory) {
        await prisma.inventory.update({
            where: { id: inventory.id },
            data: {
                quantity: newQty,
                available: Math.max(0, newQty - inventory.reserved),
            },
        });
    } else if (delta > 0) {
        await prisma.inventory.create({
            data: {
                productId,
                branchId,
                storeId,
                quantity: newQty,
                available: newQty,
                reserved: 0,
            },
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
    await prisma.activityLog.create({
        data: {
            userId: data.userId,
            action: data.action,
            entity: data.entity || data.resource,
            ...(entityId ? { entityId } : {}),
            description: data.details || data.description,
            metadata: data.metadata as any,
            ip: data.ip,
            userAgent: data.userAgent,
        },
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
// Start all workers
// ═══════════════════════════════════════════════════════════════════════════
export function startWorkers(): void {
    if (!isRabbitMQConnected()) {
        console.warn('⚠️  Workers not started - RabbitMQ not connected (sync fallback active)');
        return;
    }

    consume(QUEUES.STOCK_MOVEMENT, processStockMovement);
    consume(QUEUES.ACTIVITY_LOG, processActivityLog);
    subscribeCacheInvalidation(handleCacheInvalidation);

    console.log('✅ Queue workers started: stock-movement, activity-log, cache-invalidation');
}
