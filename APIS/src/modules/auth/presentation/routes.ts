// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Routes (Presentation Layer)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authController } from './controllers/auth.controller';
import { authenticate } from '@/infrastructure/http/middleware/auth.middleware';
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
