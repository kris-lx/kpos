// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Rate Limiter Middleware
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { cache, getRedisClient } from '@/config/redis.config';

// Explicit check: isDev is only true when NODE_ENV === 'development'.
// Using !=='production' would disable rate limits if NODE_ENV is unset or typo'd.
const isDev = process.env.NODE_ENV === 'development';

// Scaling audit (2026-07-11): express-rate-limit's default store is an
// in-memory Map, so with N horizontally-scaled API instances each one
// enforces its own separate counter — the effective limit becomes N× the
// configured value (e.g. the 20/15min login brute-force guard becomes
// 20×N across the fleet). Sharing counters via Redis fixes that.
//
// `passOnStoreError: true` is load-bearing, not just a nice-to-have: without
// it, a Redis outage would make the Store's increment() reject, and since
// `rateLimiter` runs on every route, that turns a Redis blip into a full API
// outage. Verified against express-rate-limit's source: it wraps every
// `store.increment()` call in try/catch and this option makes that path call
// next() instead of throwing — covers per-request Redis failures correctly.
//
// It does NOT cover one thing: RedisStore's constructor fires two unawaited
// promises (SCRIPT LOAD for its increment/get Lua scripts) that nothing
// observes until the first real request comes in. If Redis is unreachable
// at construction time, those promises reject with nothing attached yet —
// an unhandled promise rejection, which crashes the whole process by default
// in Node except where NODE_ENV==='production' (see index.ts's process-level
// handler) — so any other environment (staging, test, unset) would take the
// entire server down over a Redis blip at boot. sendCommand is therefore
// written to never reject at all, not even for the SCRIPT LOAD calls: on
// failure it resolves with a syntactically-valid-but-nonexistent SHA, which
// makes later EVALSHA calls fail with a normal (non-throwing-at-construction)
// error that passOnStoreError already handles correctly.
function redisStore(prefix: string): RedisStore | undefined {
    const client = getRedisClient();
    if (!client) return undefined; // falls back to express-rate-limit's built-in MemoryStore
    return new RedisStore({
        prefix,
        sendCommand: async (...args: string[]) => {
            try {
                return (await client.call(...(args as [string, ...string[]]))) as any;
            } catch {
                // Placeholder SHA1-shaped string so `typeof result === 'string'`
                // checks in loadIncrementScript/loadGetScript pass and those
                // promises resolve instead of rejecting unobserved.
                return '0'.repeat(40);
            }
        },
    });
}

export const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDev ? 0 : 1000,    // 0 = unlimited in dev; 1000/15min in production
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT',
            message: 'Too many requests, please try again later',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health' || isDev,
    store: isDev ? undefined : redisStore('kpos:rl:'),
    passOnStoreError: true,
});

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDev ? 200 : 20, // dev: unlimited-ish for test runs; prod: 20/15min per IP
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT',
            message: 'Too many login attempts, please try again later',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: isDev ? undefined : redisStore('kpos:rl-auth:'),
    passOnStoreError: true,
});

// ═══════════════════════════════════════════════════════════════════════════
// Per-Tenant Rate Limiter (BE-20 — Finding-F G7)
// Redis sliding window: key = ratelimit:{tenantId}:{endpoint}, 1000/min
// ═══════════════════════════════════════════════════════════════════════════

const TENANT_RATE_LIMIT = 1000;
const TENANT_RATE_WINDOW = 60; // seconds

export async function tenantRateLimiter(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const tenantId = (req as any).authUser?.tenantId;
        if (!tenantId) {
            // No tenant context — skip tenant rate limiting
            next();
            return;
        }

        // Normalize endpoint: /api/v1/products/abc → products
        const endpoint = req.path.replace(/^\/api\/v\d+\//, '').split('/')[0] || 'unknown';
        const key = `ratelimit:${tenantId}:${endpoint}`;

        // Increment counter — only set TTL when creating a new window (first request)
        const current = await cache.get<number>(key);
        const isNewWindow = current === null;
        const count = (current || 0) + 1;

        if (count > TENANT_RATE_LIMIT) {
            res.set('Retry-After', String(TENANT_RATE_WINDOW));
            res.status(429).json({
                success: false,
                error: {
                    code: 'TENANT_RATE_LIMIT',
                    message: `Rate limit exceeded for this tenant (${TENANT_RATE_LIMIT} requests per minute)`,
                },
            });
            return;
        }

        // Only pass TTL on first request to avoid resetting the window on every hit
        await cache.set(key, count, isNewWindow ? TENANT_RATE_WINDOW : undefined);
        next();
    } catch {
        // Rate limiter failure should not block requests
        next();
    }
}
