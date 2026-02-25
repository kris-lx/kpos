// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Database Configuration (Prisma)
// ═══════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { appConfig } from './app.config';

declare global {
    var prisma: PrismaClient | undefined;
}

let dbConnected = false;

const prismaClientSingleton = () => {
    return new PrismaClient({
        log: appConfig.isDevelopment
            ? ['warn', 'error']
            : ['error'],
    });
};

export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (appConfig.isDevelopment) {
    globalThis.prisma = prisma;
}

export function isDatabaseConnected(): boolean {
    return dbConnected;
}

export async function connectDatabase(retries = 5, delayMs = 3000): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await prisma.$connect();
            dbConnected = true;
            console.log('✅ Database connected successfully');
            return;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Database connection attempt ${attempt}/${retries} failed: ${msg}`);
            
            if (attempt < retries) {
                console.log(`⏳ Retrying in ${delayMs / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    dbConnected = false;
    if (appConfig.isProduction) {
        console.error('❌ All database connection attempts failed. Exiting.');
        process.exit(1);
    } else {
        console.error('⚠️  Database not available. Server will start but DB queries will fail.');
        console.error('⚠️  Make sure MongoDB is running: docker compose up -d mongo');
    }
}

export async function disconnectDatabase(): Promise<void> {
    await prisma.$disconnect();
    dbConnected = false;
    console.log('📤 Database disconnected');
}
