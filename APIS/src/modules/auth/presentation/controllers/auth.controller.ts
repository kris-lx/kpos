// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Controller (Presentation Layer)
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import { LoginUseCase, RegisterUseCase, RefreshTokenUseCase } from '../../application';
import { authService, DatabaseConnectionError, REFRESH_COOKIE_NAME } from '../../infrastructure/services/auth.service';
import { BaseController } from '@/shared/application';
import { db } from '@/config/database.config';
import { users } from '@/db/schema/tables';
import { eq } from 'drizzle-orm';

const loginUseCase = new LoginUseCase(authService);
const registerUseCase = new RegisterUseCase(authService);
const refreshTokenUseCase = new RefreshTokenUseCase(authService);

class AuthController extends BaseController {
    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // Pass res so login can set HttpOnly refresh cookie (BE-04)
            const result = await loginUseCase.execute({ ...req.body, res });

            if (result.isFailure) {
                const error = result.error;
                if (error instanceof DatabaseConnectionError) {
                    this.fail(res, 'DB_001', error.message, 503);
                    return;
                }
                this.fail(res, 'AUTH_001', String(error), 401);
                return;
            }

            this.ok(res, result.value);
        } catch (error) {
            next(error);
        }
    }

    async register(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await registerUseCase.execute(req.body);

            if (result.isFailure) {
                this.fail(res, 'REG_001', String(result.error), 400);
                return;
            }

            this.created(res, result.value);
        } catch (error) {
            next(error);
        }
    }

    async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // BE-06: Read refresh token from HttpOnly cookie, fallback to body for backward compat
            const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
            if (!refreshToken) {
                this.fail(res, 'AUTH_002', 'No refresh token', 401);
                return;
            }

            const result = await refreshTokenUseCase.execute({ refreshToken, res });

            if (result.isFailure) {
                this.fail(res, 'AUTH_002', String(result.error), 401);
                return;
            }

            this.ok(res, result.value);
        } catch (error) {
            next(error);
        }
    }

    async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.authUser) {
                this.unauthorized(res);
                return;
            }

            // BE-07: Pass access token for jti revocation + res for clearing cookie
            const accessToken = req.headers.authorization?.substring(7);
            await authService.logout(accessToken, req.authUser.userId, res);
            this.ok(res, { message: 'Logged out successfully' });
        } catch (error) {
            next(error);
        }
    }

    /** BE-08: Return full user profile + permissions from server state (not JWT) */
    async me(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.authUser) {
                this.unauthorized(res);
                return;
            }

            // name/avatar aren't part of the JWT-derived authUser (kept lean for the
            // hot request path) — fetched here since /auth/me is only called once
            // at login/profile-refresh time, not on every request.
            const profile = await db.query.users.findFirst({
                where: eq(users.id, req.authUser.userId),
                columns: { name: true, avatar: true },
            });

            this.ok(res, {
                id: req.authUser.userId,
                email: req.authUser.email,
                name: profile?.name,
                avatar: profile?.avatar || null,
                role: req.authUser.role,
                branchId: req.authUser.activeBranchId,
                tenantId: req.authUser.tenantId,
                isSuperAdmin: req.authUser.isSuperAdmin,
                permissions: req.authUser.permissions,
                accessibleStores: req.authUser.accessibleStores,
                accessibleBranchIds: req.authUser.accessibleBranchIds,
                activeStoreId: req.authUser.activeStoreId,
            });
        } catch (error) {
            next(error);
        }
    }
}

export const authController = new AuthController();
