// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════

import './env';
import { appServer } from './infrastructure/http/server';
import { connectDatabase, disconnectDatabase } from './config/database.config';
import { connectRedis, disconnectRedis } from './config/redis.config';
import { connectRabbitMQ, disconnectRabbitMQ } from './config/rabbitmq.config';
import { startWorkers, startScheduledJobs } from './infrastructure/workers';
import { ensureSystemEnums } from './db/ensure-enums';
import { ensureDefaultTenant } from './db/ensure-tenant';

async function main(): Promise<void> {
    try {
        console.log('🔌 Connecting to database...');
        await connectDatabase();

        await ensureDefaultTenant();
        await ensureSystemEnums();

        console.log('🔌 Connecting to Redis...');
        await connectRedis();

        console.log('🔌 Connecting to RabbitMQ...');
        await connectRabbitMQ();

        // Start queue workers (stock-movement, activity-log, cache-invalidation)
        startWorkers();
        // Start scheduled maintenance jobs (session cleanup, etc.)
        startScheduledJobs();

        console.log('🚀 Starting server...');
        await appServer.start();

        // Graceful shutdown
        const shutdown = async (signal: string): Promise<void> => {
            console.log(`\n📤 ${signal} received. Shutting down gracefully...`);

            await appServer.stop();
            await disconnectRabbitMQ();
            await disconnectDatabase();
            await disconnectRedis();

            console.log('👋 Server stopped. Goodbye!');
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

main();

// ── Process-level safety net ────────────────────────────────────────────────
process.on('unhandledRejection', (reason: unknown) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
    // Don't crash in production — log and continue
    if (process.env.NODE_ENV === 'production') return;
    process.exit(1);
});

process.on('uncaughtException', (err: Error) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});
