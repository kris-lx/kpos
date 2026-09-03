import amqplib, { type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { config } from './app.config';
import { claimMessage, markMessageProcessed, releaseMessage } from '@/infrastructure/messaging/message-receipt.service';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let connected = false;
let errorLogged = false;

export const QUEUES = {
    STOCK_MOVEMENT: 'kpos.stock-movement',
    ACTIVITY_LOG: 'kpos.activity-log',
    CACHE_INVALIDATION: 'kpos.cache-invalidation',
    NOTIFICATION: 'kpos.notification',
    ASSET_CLEANUP: 'kpos.asset-cleanup',
    EMAIL: 'kpos.email',
    PRINT_JOB: 'kpos.print-job',
} as const;

export interface MessageEnvelope<T = unknown> {
    eventId: string;
    eventType: string;
    tenantId?: string | null;
    aggregateId?: string | null;
    occurredAt: string;
    attempt: number;
    payload: T;
}

const EXCHANGE_CACHE = 'kpos.cache.fanout';
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];

export function isRabbitMQConnected(): boolean {
    return connected && channel !== null;
}

export async function connectRabbitMQ(): Promise<void> {
    const url = config.RABBITMQ_URL;
    if (!url) {
        console.warn('RABBITMQ_URL not set - using sync processing fallback');
        return;
    }

    try {
        connection = await amqplib.connect(url);
        channel = await connection.createChannel();
        await channel.prefetch(10);

        for (const queue of Object.values(QUEUES)) {
            await channel.assertQueue(queue, { durable: true });
            await channel.assertQueue(`${queue}.retry`, {
                durable: true,
                arguments: {
                    'x-dead-letter-exchange': '',
                    'x-dead-letter-routing-key': queue,
                },
            });
            await channel.assertQueue(`${queue}.dlq`, { durable: true });
        }
        await channel.assertExchange(EXCHANGE_CACHE, 'fanout', { durable: false });

        connected = true;
        errorLogged = false;
        console.log('RabbitMQ connected successfully');

        connection.on('close', () => {
            connected = false;
            channel = null;
            console.warn('RabbitMQ connection closed');
            setTimeout(() => connectRabbitMQ().catch(() => {}), 5_000);
        });
        connection.on('error', (err) => {
            connected = false;
            if (!errorLogged) {
                console.warn('RabbitMQ error:', err.message);
                errorLogged = true;
            }
        });
    } catch (err: any) {
        connected = false;
        if (!errorLogged) {
            console.warn('RabbitMQ not available:', err.message, '- using sync fallback');
            errorLogged = true;
        }
    }
}

export async function disconnectRabbitMQ(): Promise<void> {
    try {
        if (channel) await channel.close();
        if (connection) await connection.close();
    } catch {
        // Ignore close errors during shutdown.
    }
    channel = null;
    connection = null;
    connected = false;
}

export function publishEnvelope<T>(queue: string, envelope: MessageEnvelope<T>): boolean {
    if (!channel || !connected) return false;
    try {
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(envelope)), {
            persistent: true,
            contentType: 'application/json',
            timestamp: Date.now(),
        });
        return true;
    } catch {
        return false;
    }
}

/** Compatibility publisher for legacy callers. New work should use the outbox. */
export function publish(queue: string, data: Record<string, unknown>): boolean {
    return publishEnvelope(queue, {
        eventId: randomUUID(),
        eventType: 'legacy.message',
        occurredAt: new Date().toISOString(),
        attempt: 0,
        payload: data,
    });
}

function parseEnvelope(msg: ConsumeMessage): MessageEnvelope {
    const parsed = JSON.parse(msg.content.toString());
    if (parsed?.eventId && Object.prototype.hasOwnProperty.call(parsed, 'payload')) {
        return parsed as MessageEnvelope;
    }
    return {
        eventId: randomUUID(),
        eventType: 'legacy.message',
        occurredAt: new Date().toISOString(),
        attempt: Number(msg.properties.headers?.['x-kpos-attempt'] || 0),
        payload: parsed,
    };
}

async function retryOrDeadLetter(queue: string, msg: ConsumeMessage, envelope: MessageEnvelope): Promise<void> {
    if (!channel) return;
    const attempt = Math.max(
        envelope.attempt || 0,
        Number(msg.properties.headers?.['x-kpos-attempt'] || 0),
    );
    const retryDelay = RETRY_DELAYS_MS[attempt];
    const target = retryDelay === undefined ? `${queue}.dlq` : `${queue}.retry`;
    channel.sendToQueue(target, msg.content, {
        persistent: true,
        contentType: 'application/json',
        ...(retryDelay === undefined ? {} : { expiration: String(retryDelay) }),
        headers: { ...msg.properties.headers, 'x-kpos-attempt': attempt + 1 },
    });
    channel.ack(msg);
}

export function consume(
    queue: string,
    handler: (data: any, meta?: MessageEnvelope) => Promise<void>,
): void {
    if (!channel || !connected) {
        console.warn(`Cannot consume ${queue} - RabbitMQ not connected`);
        return;
    }

    channel.consume(queue, async (msg) => {
        if (!msg) return;
        let envelope: MessageEnvelope | undefined;
        try {
            envelope = parseEnvelope(msg);
            if (!await claimMessage(envelope.eventId, queue)) {
                channel?.ack(msg);
                return;
            }
            await handler(envelope.payload, envelope);
            await markMessageProcessed(envelope.eventId);
            channel?.ack(msg);
        } catch (err: any) {
            console.error(`Error processing ${queue}:`, err?.message || err);
            if (envelope) await releaseMessage(envelope.eventId).catch(() => {});
            try {
                if (envelope) await retryOrDeadLetter(queue, msg, envelope);
                else channel?.nack(msg, false, true);
            } catch {
                channel?.nack(msg, false, true);
            }
        }
    }).catch((err) => console.error(`Failed to consume ${queue}:`, err));
}

export function publishCacheInvalidation(pattern: string): boolean {
    if (!channel || !connected) return false;
    try {
        channel.publish(EXCHANGE_CACHE, '', Buffer.from(JSON.stringify({ pattern, ts: Date.now() })));
        return true;
    } catch {
        return false;
    }
}

export function subscribeCacheInvalidation(handler: (pattern: string) => void): void {
    if (!channel || !connected) return;
    channel.assertQueue('', { exclusive: true, autoDelete: true }).then((q) => {
        channel!.bindQueue(q.queue, EXCHANGE_CACHE, '');
        return channel!.consume(q.queue, (msg) => {
            if (!msg) return;
            try {
                const { pattern } = JSON.parse(msg.content.toString());
                handler(pattern);
            } catch {
                // Ignore malformed fanout messages.
            }
            channel?.ack(msg);
        });
    }).catch(() => {});
}
