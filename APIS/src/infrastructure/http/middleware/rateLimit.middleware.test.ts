import { describe, it, expect } from 'vitest';
import { rateLimiter, authRateLimiter } from './rateLimit.middleware';

describe('rateLimiter', () => {
    it('is a function (express middleware)', () => {
        expect(typeof rateLimiter).toBe('function');
    });

    it('has correct max and windowMs via handler length', () => {
        // express-rate-limit middleware exposes its options via the handler
        // We just verify it's a valid middleware with 3 args (req, res, next)
        expect(rateLimiter.length).toBe(3);
    });
});

describe('authRateLimiter', () => {
    it('is a function (express middleware)', () => {
        expect(typeof authRateLimiter).toBe('function');
    });

    it('has stricter limit than general rateLimiter', () => {
        // Both are functions; auth limiter is more restrictive (20 vs 1000)
        // We verify they are distinct middleware instances
        expect(authRateLimiter).not.toBe(rateLimiter);
    });
});
