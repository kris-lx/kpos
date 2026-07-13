// ═══════════════════════════════════════════════════════════════════════════
// Redis SET-NX-with-expiry distributed lock, shared by scheduled jobs that
// run identically in every horizontally-scaled API instance (backup cron,
// session cleanup, ...). TTL is a safety net so a crashed instance can't
// permanently block future runs; the token check on release prevents
// releasing a lock a *different* instance has since acquired (e.g. after
// this instance's own lock already expired).
// ═══════════════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import { getRedisClient } from '@/config/redis.config';

export const NO_REDIS_TOKEN = '__no-redis__';
export const REDIS_ERROR_TOKEN = '__redis-error__';

// Sentinel tokens never released via DEL — callers can safely no-op release()
// on them without a wasted round trip.
const SENTINEL_TOKENS = new Set([NO_REDIS_TOKEN, REDIS_ERROR_TOKEN]);

export async function acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const client = getRedisClient();
    if (!client) return NO_REDIS_TOKEN; // no Redis configured — assume single instance, run unconditionally
    const token = randomUUID();
    try {
        const result = await client.set(key, token, 'PX', ttlMs, 'NX');
        return result === 'OK' ? token : null;
    } catch {
        // Redis error acquiring the lock — fail open (run the job) rather
        // than risk silently never running again; a duplicate run is
        // wasteful, not dangerous, for the idempotent jobs this guards.
        return REDIS_ERROR_TOKEN;
    }
}

export async function releaseLock(key: string, token: string): Promise<void> {
    if (SENTINEL_TOKENS.has(token)) return;
    const client = getRedisClient();
    if (!client) return;
    try {
        const current = await client.get(key);
        if (current === token) await client.del(key);
    } catch {
        // Ignore — the TTL will clean it up regardless.
    }
}
