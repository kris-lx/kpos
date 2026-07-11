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

// Scaling audit (2026-07-11): this fallback is fine for query/permission
// caching (worst case is an extra cache miss), but JWT revocation
// (`revoked:*`), refresh-token tracking (`refresh_jti:*`), and tenant rate
// limiting (`ratelimit:*`) all go through this same `cache` object — falling
// back to per-process memory for THOSE keys means a token revoked or a rate
// limit hit on one horizontally-scaled instance is invisible to the others
// for as long as the fallback is active. Not changed here (that's a
// fail-open/fail-closed security tradeoff that needs a product decision, not
// a unilateral engineering one) — but it was previously completely silent in
// production. Now it logs loudly (throttled, so a sustained Redis outage
// doesn't spam the log for every request) whenever the fallback path is
// actually hit for one of those key prefixes, so an outage stops being
// invisible to whoever's watching production logs/alerts.
const SECURITY_CRITICAL_PREFIXES = ['revoked:', 'refresh_jti:', 'ratelimit:'];
let lastFallbackWarningAt = 0;
const FALLBACK_WARNING_THROTTLE_MS = 30_000;

function warnIfSecurityCriticalFallback(key: string): void {
    if (!SECURITY_CRITICAL_PREFIXES.some((p) => key.startsWith(p))) return;
    const now = Date.now();
    if (now - lastFallbackWarningAt < FALLBACK_WARNING_THROTTLE_MS) return;
    lastFallbackWarningAt = now;
    console.warn(
        `⚠️  SECURITY: Redis unavailable — "${key}" served from per-process memory fallback. ` +
        'JWT revocation / refresh-token / tenant-rate-limit state is NOT shared across instances ' +
        'while this is active. (This warning is throttled to once per 30s.)'
    );
}

export function isRedisAvailable(): boolean {
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
    if (!client) return;

    // The client uses lazyConnect, but anything that issues a command before
    // this runs (e.g. rateLimit.middleware.ts's RedisStore, constructed at
    // module load time, sends SCRIPT LOAD as soon as it's built) triggers an
    // implicit connect. ioredis throws "Redis is already connecting/connected"
    // if .connect() is called again on a client that's already
    // connecting/connected — that's not a real failure, just redundant.
    if (client.status === 'ready') {
        redisConnected = true;
        console.log('✅ Redis already connected (connected implicitly before startup reached this point)');
        return;
    }
    if (client.status === 'connecting' || client.status === 'connect') {
        // Already in flight — wait for it to settle instead of calling
        // .connect() again (which would throw) or assuming failure.
        try {
            await new Promise<void>((resolve, reject) => {
                client.once('ready', resolve);
                client.once('error', reject);
            });
            redisConnected = true;
            console.log('✅ Redis connected successfully (connection was already in flight)');
        } catch (err) {
            console.warn('⚠️  Redis not available - server will use in-memory fallback:', err instanceof Error ? err.message : err);
            redisConnected = false;
        }
        return;
    }

    try {
        await client.connect();
    } catch (err) {
        console.warn('⚠️  Redis not available - server will use in-memory fallback:', err instanceof Error ? err.message : err);
        redisConnected = false;
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
        warnIfSecurityCriticalFallback(key);
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
        warnIfSecurityCriticalFallback(key);
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
        warnIfSecurityCriticalFallback(key);
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
