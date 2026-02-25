// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Redis Configuration
// Graceful fallback: works without Redis in development mode
// ═══════════════════════════════════════════════════════════════════════════

import Redis from 'ioredis';
import { redisConfig, appConfig } from './app.config';

export let redis: Redis | null = null;
let redisConnected = false;
let redisErrorLogged = false;

// In-memory fallback when Redis is unavailable
const memoryStore = new Map<string, { value: string; expiry?: number }>();

function isRedisAvailable(): boolean {
    return redis !== null && redisConnected;
}

export function getRedisClient(): Redis | null {
    if (!redis) {
        try {
            redis = new Redis(redisConfig.url, {
                maxRetriesPerRequest: 3,
                retryStrategy(times) {
                    if (times > 5) {
                        if (!redisErrorLogged) {
                            console.warn('⚠️  Redis unavailable - using in-memory fallback');
                            redisErrorLogged = true;
                        }
                        // Stop retrying after 5 attempts
                        return null;
                    }
                    return Math.min(times * 200, 2000);
                },
                reconnectOnError(err) {
                    const targetError = 'READONLY';
                    if (err.message.includes(targetError)) {
                        return true;
                    }
                    return false;
                },
                lazyConnect: true,
            });

            redis.on('connect', () => {
                redisConnected = true;
                redisErrorLogged = false;
                console.log('✅ Redis connected successfully');
            });

            redis.on('close', () => {
                redisConnected = false;
            });

            redis.on('error', (err) => {
                redisConnected = false;
                if (!redisErrorLogged) {
                    console.warn('⚠️  Redis connection error:', err.message);
                    redisErrorLogged = true;
                }
            });
        } catch {
            redis = null;
            redisConnected = false;
        }
    }

    return redis;
}

export async function connectRedis(): Promise<void> {
    const client = getRedisClient();
    if (client) {
        try {
            await client.connect();
        } catch {
            console.warn('⚠️  Redis not available - server will use in-memory fallback');
            redisConnected = false;
        }
    }
}

export async function disconnectRedis(): Promise<void> {
    if (redis) {
        try {
            await redis.quit();
        } catch {
            // Ignore quit errors
        }
        redis = null;
        redisConnected = false;
        console.log('📤 Redis disconnected');
    }
}

// Cache utilities with in-memory fallback
export const cache = {
    async get<T>(key: string): Promise<T | null> {
        if (isRedisAvailable()) {
            try {
                const data = await redis!.get(key);
                return data ? JSON.parse(data) : null;
            } catch {
                // Fall through to memory store
            }
        }
        // In-memory fallback
        const entry = memoryStore.get(key);
        if (!entry) return null;
        if (entry.expiry && Date.now() > entry.expiry) {
            memoryStore.delete(key);
            return null;
        }
        return JSON.parse(entry.value);
    },

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        const serialized = JSON.stringify(value);
        if (isRedisAvailable()) {
            try {
                if (ttlSeconds) {
                    await redis!.setex(key, ttlSeconds, serialized);
                } else {
                    await redis!.set(key, serialized);
                }
                return;
            } catch {
                // Fall through to memory store
            }
        }
        // In-memory fallback
        memoryStore.set(key, {
            value: serialized,
            expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
        });
    },

    async del(key: string): Promise<void> {
        if (isRedisAvailable()) {
            try {
                await redis!.del(key);
                return;
            } catch {
                // Fall through
            }
        }
        memoryStore.delete(key);
    },

    async delPattern(pattern: string): Promise<void> {
        if (isRedisAvailable()) {
            try {
                const keys = await redis!.keys(pattern);
                if (keys.length > 0) {
                    await redis!.del(...keys);
                }
                return;
            } catch {
                // Fall through
            }
        }
        // In-memory fallback: simple pattern matching
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        for (const key of memoryStore.keys()) {
            if (regex.test(key)) {
                memoryStore.delete(key);
            }
        }
    },
};
