// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════

import 'dotenv/config';
import { appServer } from './infrastructure/http/server';
import { connectDatabase, disconnectDatabase } from './config/database.config';
import { connectRedis, disconnectRedis } from './config/redis.config';

async function main(): Promise<void> {
    try {
        console.log('🔌 Connecting to database...');
        await connectDatabase();

        console.log('🔌 Connecting to Redis...');
        await connectRedis();

        console.log('🚀 Starting server...');
        await appServer.start();

        // Graceful shutdown
        const shutdown = async (signal: string): Promise<void> => {
            console.log(`\n📤 ${signal} received. Shutting down gracefully...`);

            await appServer.stop();
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
