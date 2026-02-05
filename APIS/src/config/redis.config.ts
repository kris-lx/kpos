// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Redis Configuration
// ═══════════════════════════════════════════════════════════════════════════

import Redis from 'ioredis';
import { redisConfig } from './app.config';

export let redis: Redis | null = null;

export function getRedisClient(): Redis {
    if (!redis) {
        redis = new Redis(redisConfig.url, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            reconnectOnError(err) {
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) {
                    return true;
                }
                return false;
            },
        });

        redis.on('connect', () => {
            console.log('✅ Redis connected successfully');
        });

        redis.on('error', (err) => {
            console.error('❌ Redis connection error:', err);
        });
    }

    return redis;
}

export async function connectRedis(): Promise<Redis> {
    return getRedisClient();
}

export async function disconnectRedis(): Promise<void> {
    if (redis) {
        await redis.quit();
        redis = null;
        console.log('📤 Redis disconnected');
    }
}

// Cache utilities
export const cache = {
    async get<T>(key: string): Promise<T | null> {
        const client = getRedisClient();
        const data = await client.get(key);
        return data ? JSON.parse(data) : null;
    },

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        const client = getRedisClient();
        const serialized = JSON.stringify(value);
        if (ttlSeconds) {
            await client.setex(key, ttlSeconds, serialized);
        } else {
            await client.set(key, serialized);
        }
    },

    async del(key: string): Promise<void> {
        const client = getRedisClient();
        await client.del(key);
    },

    async delPattern(pattern: string): Promise<void> {
        const client = getRedisClient();
        const keys = await client.keys(pattern);
        if (keys.length > 0) {
            await client.del(...keys);
        }
    },
};
