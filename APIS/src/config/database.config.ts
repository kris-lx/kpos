// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Database Configuration (Prisma)
// ═══════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { appConfig } from './app.config';

declare global {
    var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
    return new PrismaClient({
        log: appConfig.isDevelopment
            ? ['query', 'info', 'warn', 'error']
            : ['error'],
    });
};

export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (appConfig.isDevelopment) {
    globalThis.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
    try {
        await prisma.$connect();
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
}

export async function disconnectDatabase(): Promise<void> {
    await prisma.$disconnect();
    console.log('📤 Database disconnected');
}
