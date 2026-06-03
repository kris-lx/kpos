// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Rate Limiter Middleware
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { cache } from '@/config/redis.config';

// Explicit check: isDev is only true when NODE_ENV === 'development'.
// Using !=='production' would disable rate limits if NODE_ENV is unset or typo'd.
const isDev = process.env.NODE_ENV === 'development';

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
});

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 login attempts per windowMs
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT',
            message: 'Too many login attempts, please try again later',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
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
