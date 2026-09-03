import { sql, eq, and, isNull, lte } from 'drizzle-orm';
import { db } from '@/config/database.config';
import { outboxMessages } from '@/db/schema/tables';

export interface OutboxMessageInput {
    queue: string;
    eventType: string;
    payload: Record<string, unknown>;
    tenantId?: string | null;
    aggregateId?: string | null;
    availableAt?: Date;
}

export interface ClaimedOutboxMessage {
    event_id: string;
    queue: string;
    event_type: string;
    tenant_id: string | null;
    aggregate_id: string | null;
    payload: Record<string, unknown>;
    attempts: number;
    created_at: Date;
}

/**
 * Persist the message before publishing it. The relay can safely retry this
 * row if RabbitMQ is down or the process exits after the database commit.
 */
export async function enqueueOutboxMessage(input: OutboxMessageInput, client: any = db): Promise<boolean> {
    try {
        await client.insert(outboxMessages).values({
            queue: input.queue,
            eventType: input.eventType,
            tenantId: input.tenantId ?? null,
            aggregateId: input.aggregateId ?? null,
            payload: input.payload,
            availableAt: input.availableAt ?? new Date(),
        });
        return true;
    } catch (error) {
        console.error('[Outbox] Failed to enqueue message:', error instanceof Error ? error.message : error);
        return false;
    }
}

export async function claimOutboxBatch(limit = 50): Promise<ClaimedOutboxMessage[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const result = await db.execute(sql`
        WITH candidates AS (
            SELECT event_id
            FROM outbox_messages
            WHERE published_at IS NULL
              AND available_at <= NOW()
              AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
            ORDER BY created_at
            LIMIT ${safeLimit}
            FOR UPDATE SKIP LOCKED
        )
        UPDATE outbox_messages AS messages
        SET locked_at = NOW()
        FROM candidates
        WHERE messages.event_id = candidates.event_id
        RETURNING messages.event_id, messages.queue, messages.event_type,
                  messages.tenant_id, messages.aggregate_id, messages.payload,
                  messages.attempts, messages.created_at
    `);
    return Array.from(result as unknown as ClaimedOutboxMessage[]);
}

export async function markOutboxPublished(eventId: string): Promise<void> {
    await db.update(outboxMessages)
        .set({ publishedAt: new Date(), lockedAt: null, lastError: null })
        .where(eq(outboxMessages.eventId, eventId));
}

export async function markOutboxFailed(eventId: string, error: unknown, attempts: number): Promise<void> {
    const backoffMs = Math.min(15 * 60_000, 5_000 * (2 ** Math.min(attempts, 8)));
    await db.update(outboxMessages)
        .set({
            attempts: attempts + 1,
            availableAt: new Date(Date.now() + backoffMs),
            lockedAt: null,
            lastError: error instanceof Error ? error.message : String(error),
        })
        .where(eq(outboxMessages.eventId, eventId));
}

export async function purgePublishedOutbox(): Promise<void> {
    await db.delete(outboxMessages)
        .where(and(
            isNull(outboxMessages.lockedAt),
            lte(outboxMessages.publishedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        ));
}
