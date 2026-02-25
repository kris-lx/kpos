// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Routes (Presentation Layer)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authController } from './controllers/auth.controller';
import { authenticate, invalidateUserStoreCache } from '@/infrastructure/http/middleware/auth.middleware';
import { validateBody } from '@/infrastructure/http/middleware/validation.middleware';
import { authRateLimiter } from '@/infrastructure/http/middleware/rateLimit.middleware';
import { LoginDto, RegisterDto, RefreshTokenDto } from '../application/dtos/auth.dto';

export const authRoutes = Router();

// Public routes
authRoutes.post('/login',
    authRateLimiter,
    validateBody(LoginDto),
    (req, res, next) => authController.login(req, res, next)
);

authRoutes.post('/register',
    validateBody(RegisterDto),
    (req, res, next) => authController.register(req, res, next)
);

authRoutes.post('/refresh',
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
