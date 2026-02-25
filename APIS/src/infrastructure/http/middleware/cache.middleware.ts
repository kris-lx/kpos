// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Query Cache Middleware
// Caches GET endpoint responses in Redis for configurable TTL
// Automatically generates cache keys from URL + query params + user scope
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import { cache } from '@/config/redis.config';

const CACHE_PREFIX = 'kpos:q';

/**
 * Express middleware that caches GET responses in Redis.
 * Cache key includes: route path + sorted query params + user's branchId/storeId scope.
 * 
 * Usage: router.get('/stats', authenticate, branchFilter(), queryCache(60), handler)
 * 
 * @param ttlSeconds Cache TTL in seconds (default 30)
 * @param keyPrefix Optional prefix to group cache entries (for targeted invalidation)
 */
export function queryCache(ttlSeconds = 30, keyPrefix?: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            next();
            return;
        }

        try {
            const cacheKey = buildCacheKey(req, keyPrefix);

            // Try to get from cache
            const cached = await cache.get<{ status: number; body: unknown }>(cacheKey);
            if (cached) {
                res.status(cached.status).json(cached.body);
                return;
            }

            // Override res.json to intercept the response and cache it
            const originalJson = res.json.bind(res);
            res.json = ((body: unknown) => {
                // Only cache successful responses
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    cache.set(cacheKey, { status: res.statusCode, body }, ttlSeconds).catch(() => {});
                }
                return originalJson(body);
            }) as typeof res.json;

            next();
        } catch {
            // On cache error, just proceed without caching
            next();
        }
    };
}

/**
 * Build a deterministic cache key from request context.
 * Includes: path + sorted query params + user scope (branchIds/storeIds)
 */
function buildCacheKey(req: Request, keyPrefix?: string): string {
    const prefix = keyPrefix || req.baseUrl + req.path;
    
    // Sort query params for deterministic keys
    const sortedParams = Object.keys(req.query)
        .sort()
        .map(k => `${k}=${req.query[k]}`)
        .join('&');

    // Include user scope in key (so different users get different cached results)
    const scope = req.authUser
        ? `u:${req.authUser.userId}:b:${req.authUser.activeBranchId || ''}:s:${req.authUser.activeStoreId || ''}`
        : 'anon';

    return `${CACHE_PREFIX}:${prefix}:${sortedParams}:${scope}`;
}
