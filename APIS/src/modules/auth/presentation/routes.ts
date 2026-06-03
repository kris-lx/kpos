// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Routes (Presentation Layer)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import crypto from 'crypto';
import argon2 from 'argon2';
import { authController } from './controllers/auth.controller';
import { authenticate, invalidateUserStoreCache } from '@/infrastructure/http/middleware/auth.middleware';
import { validateBody } from '@/infrastructure/http/middleware/validation.middleware';
import { authRateLimiter } from '@/infrastructure/http/middleware/rateLimit.middleware';
import { LoginDto, RegisterDto, RefreshTokenDto } from '../application/dtos/auth.dto';
import { db } from '@/config/database.config';
import { cache } from '@/config/redis.config';
import { users } from '@/db/schema/tables';
import { eq } from 'drizzle-orm';
import { sendPasswordResetEmail } from '@/infrastructure/services/email.service';

export const authRoutes = Router();

// Public routes
authRoutes.post('/login',
    authRateLimiter,
    validateBody(LoginDto),
    (req, res, next) => authController.login(req, res, next)
);

authRoutes.post('/register',
    authRateLimiter,                 // Prevent account-creation floods
    validateBody(RegisterDto),
    (req, res, next) => authController.register(req, res, next)
);

authRoutes.post('/refresh',
    authRateLimiter,                 // Prevent refresh token brute-force
    validateBody(RefreshTokenDto),
    (req, res, next) => authController.refresh(req, res, next)
);

// Protected routes
authRoutes.post('/logout',
    authenticate,
    (req, res, next) => authController.logout(req, res, next)
);

authRoutes.get('/me',
    authenticate,
    (req, res, next) => authController.me(req, res, next)
);

// Forgot password — rate-limited, always returns success to prevent user enumeration
authRoutes.post('/forgot-password', authRateLimiter, async (req, res, next) => {
    try {
        const { email } = req.body as { email?: string };
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Email is required' } });
        }

        const user = await db.query.users.findFirst({
            where: eq(users.email, email.toLowerCase().trim()),
            columns: { id: true, name: true, email: true, isActive: true },
        });

        // Always respond with success to prevent user enumeration
        const genericSuccess = { success: true, data: { message: 'If this email exists, a reset link has been sent.' } };

        if (!user || !user.isActive) {
            return res.json(genericSuccess);
        }

        const token = crypto.randomBytes(32).toString('hex');
        // Store token → userId in Redis with 1-hour TTL
        await cache.set(`reset_token:${token}`, user.id, 60 * 60);

        try {
            await sendPasswordResetEmail(user.email, user.name, token);
        } catch {
            // Log but still return success — token is stored, user can retry
            console.error('[Auth] Email send failed for forgot-password');
        }

        return res.json(genericSuccess);
    } catch (error) {
        next(error);
    }
});

// Reset password — validate token from Redis, update password, delete token
authRoutes.post('/reset-password', authRateLimiter, async (req, res, next) => {
    try {
        const { token, password } = req.body as { token?: string; password?: string };

        if (!token || typeof token !== 'string') {
            return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Token is required' } });
        }
        if (!password || typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Password must be at least 8 characters' } });
        }

        const userId = await cache.get<string>(`reset_token:${token}`);
        if (!userId) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Reset link is invalid or has expired' } });
        }

        const hashed = await argon2.hash(password);
        await db.update(users).set({ password: hashed }).where(eq(users.id, userId));
        await cache.del(`reset_token:${token}`);

        return res.json({ success: true, data: { message: 'Password has been reset successfully' } });
    } catch (error) {
        next(error);
    }
});

// Refresh store access (call after UserStore changes without re-login)
authRoutes.post('/refresh-stores', authenticate, async (req, res, next) => {
    try {
        if (!req.authUser) {
            return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
        }

        // Invalidate cached store access so next request loads fresh data
        invalidateUserStoreCache(req.authUser.userId);

        // Return current authUser context (will be fresh on next authenticate call)
        // For immediate use, return the store data from authUser (loaded this request)
        res.json({
            success: true,
            data: {
                accessibleStores: req.authUser.accessibleStores,
                accessibleBranchIds: req.authUser.accessibleBranchIds,
                accessibleStoreIds: req.authUser.accessibleStoreIds,
                activeStoreId: req.authUser.activeStoreId,
                activeBranchId: req.authUser.activeBranchId,
            }
        });
    } catch (error) {
        next(error);
    }
});
