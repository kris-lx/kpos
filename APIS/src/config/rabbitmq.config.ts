// ═══════════════════════════════════════════════════════════════════════════
// KPOS - RabbitMQ Configuration
// Graceful fallback: works without RabbitMQ (sync processing)
// ═══════════════════════════════════════════════════════════════════════════

import amqplib, { type Connection, type Channel } from 'amqplib';
import { config } from './app.config';

let connection: Connection | null = null;
let channel: Channel | null = null;
let connected = false;
let errorLogged = false;

// Queue names
export const QUEUES = {
    STOCK_MOVEMENT: 'kpos.stock-movement',
    ACTIVITY_LOG: 'kpos.activity-log',
    CACHE_INVALIDATION: 'kpos.cache-invalidation',
    NOTIFICATION: 'kpos.notification',
} as const;

// Exchange for fanout (cache invalidation across instances)
const EXCHANGE_CACHE = 'kpos.cache.fanout';

export function isRabbitMQConnected(): boolean {
    return connected && channel !== null;
}

export async function connectRabbitMQ(): Promise<void> {
    const url = config.RABBITMQ_URL;
    if (!url) {
        console.warn('⚠️  RABBITMQ_URL not set - using sync processing fallback');
        return;
    }

    try {
        connection = await amqplib.connect(url);
        channel = await connection.createChannel();

        // Prefetch 10 messages at a time for consumers
        await channel.prefetch(10);

        // Assert queues (durable = survive broker restart)
        for (const queue of Object.values(QUEUES)) {
            await channel.assertQueue(queue, { durable: true });
        }

        // Assert fanout exchange for cache invalidation
        await channel.assertExchange(EXCHANGE_CACHE, 'fanout', { durable: false });

        connected = true;
        errorLogged = false;
        console.log('✅ RabbitMQ connected successfully');

        connection.on('close', () => {
            connected = false;
            channel = null;
            console.warn('⚠️  RabbitMQ connection closed');
            // Auto-reconnect after 5s
            setTimeout(() => connectRabbitMQ().catch(() => {}), 5000);
        });

        connection.on('error', (err) => {
            connected = false;
            if (!errorLogged) {
                console.warn('⚠️  RabbitMQ error:', err.message);
                errorLogged = true;
            }
        });
    } catch (err: any) {
        connected = false;
        if (!errorLogged) {
            console.warn('⚠️  RabbitMQ not available:', err.message, '- using sync fallback');
            errorLogged = true;
        }
    }
}

export async function disconnectRabbitMQ(): Promise<void> {
    try {
        if (channel) await channel.close();
        if (connection) await connection.close();
    } catch {
        // Ignore close errors
    }
    channel = null;
    connection = null;
    connected = false;
    console.log('📤 RabbitMQ disconnected');
}

// ═══════════════════════════════════════════════════════════════════════════
// Publisher: Send message to queue (fire-and-forget)
// Returns true if published, false if RabbitMQ unavailable (caller should fallback to sync)
// ═══════════════════════════════════════════════════════════════════════════
export function publish(queue: string, data: Record<string, unknown>): boolean {
    if (!channel || !connected) return false;

    try {
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), {
            persistent: true,
            contentType: 'application/json',
            timestamp: Date.now(),
        });
        return true;
    } catch {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Consumer: Register a handler for a queue
// ═══════════════════════════════════════════════════════════════════════════
export function consume(
    queue: string,
    handler: (data: any) => Promise<void>
): void {
    if (!channel || !connected) {
        console.warn(`⚠️  Cannot consume ${queue} - RabbitMQ not connected`);
        return;
    }

    channel.consume(queue, async (msg) => {
        if (!msg) return;

        try {
            const data = JSON.parse(msg.content.toString());
            await handler(data);
            channel?.ack(msg);
        } catch (err: any) {
            console.error(`❌ Error processing ${queue}:`, err.message);
            // Negative ack + requeue on failure (up to RabbitMQ retry logic)
            channel?.nack(msg, false, true);
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Fanout: Publish cache invalidation to all instances
// ═══════════════════════════════════════════════════════════════════════════
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

    // Create exclusive auto-delete queue for this instance
    channel.assertQueue('', { exclusive: true, autoDelete: true }).then((q) => {
        channel!.bindQueue(q.queue, EXCHANGE_CACHE, '');
        channel!.consume(q.queue, (msg) => {
            if (!msg) return;
            try {
                const { pattern } = JSON.parse(msg.content.toString());
                handler(pattern);
            } catch {
                // Ignore parse errors
            }
            channel?.ack(msg);
        });
    });
}
