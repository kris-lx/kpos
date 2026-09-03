// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Controller (Presentation Layer)
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import { LoginUseCase, RegisterUseCase, RefreshTokenUseCase } from '../../application';
import { authService, DatabaseConnectionError, REFRESH_COOKIE_NAME, clearRefreshCookie } from '../../infrastructure/services/auth.service';
import { BaseController } from '@/shared/application';
import { db } from '@/config/database.config';
import { users } from '@/db/schema/tables';
import { eq } from 'drizzle-orm';
import { queueActivityLog } from '@/infrastructure/helpers/activity-log.helper';

const loginUseCase = new LoginUseCase(authService);
const registerUseCase = new RegisterUseCase(authService);
const refreshTokenUseCase = new RefreshTokenUseCase(authService);

class AuthController extends BaseController {
    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // Pass res so login can set HttpOnly refresh cookie (BE-04)
            const result = await loginUseCase.execute({ ...req.body, res, secureCookie: req.secure });

            if (result.isFailure) {
                const error = result.error;
                if (error instanceof DatabaseConnectionError) {
                    this.fail(res, 'DB_001', error.message, 503);
                    return;
                }
                this.fail(res, 'AUTH_001', String(error), 401);
                return;
            }

            queueActivityLog(
                result.value.user.id,
                'login',
                'auth',
                `Login successful: ${result.value.user.email}`,
                { branchId: result.value.user.branchId, storeId: null },
                req,
            ).catch(() => {});
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
                // Refresh is a silent session-restoration probe. A browser
                // with no active session should receive a normal JSON result,
                // not a network-level 401 error in DevTools. Protected API
                // endpoints still use 401 as usual.
                res.status(200).json({
                    success: false,
                    error: { code: 'AUTH_002', message: 'No active session' },
                });
                return;
            }

            const result = await refreshTokenUseCase.execute({ refreshToken, res, secureCookie: req.secure });

            if (result.isFailure) {
                // A rotated/expired refresh token is no longer useful. Clear
                // it immediately so every subsequent page load does not send
                // the same stale cookie. Keep this a normal JSON failure for
                // the silent refresh probe; the client will redirect to login.
                clearRefreshCookie(res, req.secure);
                res.status(200).json({
                    success: false,
                    error: { code: 'AUTH_002', message: String(result.error) },
                });
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
            await authService.logout(accessToken, req.authUser.userId, res, req.secure);
            queueActivityLog(
                req.authUser.userId,
                'logout',
                'auth',
                `Logout: ${req.authUser.email}`,
                { branchId: req.authUser.activeBranchId, storeId: req.authUser.activeStoreId },
                req,
            ).catch(() => {});
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
                requiresShift: req.authUser.requiresShift,
                checkerEnabled: req.authUser.checkerEnabled,
                roleLevel: req.authUser.roleLevel,
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
