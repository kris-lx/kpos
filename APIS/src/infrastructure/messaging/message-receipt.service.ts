import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/config/database.config';
import { messageReceipts } from '@/db/schema/tables';

const STALE_PROCESSING_AFTER_MS = 10 * 60_000;

/** Claim once-per-event processing. A duplicate delivery is acknowledged by
 * the Rabbit consumer without running the handler again. */
export async function claimMessage(eventId: string, queue: string): Promise<boolean> {
    const [inserted] = await db.insert(messageReceipts)
        .values({ eventId, queue, status: 'processing' })
        .onConflictDoNothing()
        .returning({ eventId: messageReceipts.eventId });

    if (inserted) return true;

    const [existing] = await db.select({
        status: messageReceipts.status,
        updatedAt: messageReceipts.updatedAt,
    })
        .from(messageReceipts)
        .where(eq(messageReceipts.eventId, eventId))
        .limit(1);

    if (!existing || existing.status === 'processed') return false;

    const staleBefore = new Date(Date.now() - STALE_PROCESSING_AFTER_MS);
    const [reclaimed] = await db.update(messageReceipts)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(and(
            eq(messageReceipts.eventId, eventId),
            eq(messageReceipts.status, 'processing'),
            lt(messageReceipts.updatedAt, staleBefore),
        ))
        .returning({ eventId: messageReceipts.eventId });

    return Boolean(reclaimed);
}

export async function markMessageProcessed(eventId: string): Promise<void> {
    const now = new Date();
    await db.update(messageReceipts)
        .set({ status: 'processed', updatedAt: now, processedAt: now })
        .where(eq(messageReceipts.eventId, eventId));
}

export async function releaseMessage(eventId: string): Promise<void> {
    // The broker retry is authoritative after a handler failure. Removing the
    // claim lets the delayed redelivery claim the event again.
    await db.delete(messageReceipts).where(eq(messageReceipts.eventId, eventId));
}
