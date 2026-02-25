// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Controller (Presentation Layer)
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import { LoginUseCase, RegisterUseCase, RefreshTokenUseCase } from '../../application';
import { authService, DatabaseConnectionError } from '../../infrastructure/services/auth.service';
import { BaseController } from '@/shared/application';

const loginUseCase = new LoginUseCase(authService);
const registerUseCase = new RegisterUseCase(authService);
const refreshTokenUseCase = new RefreshTokenUseCase(authService);

class AuthController extends BaseController {
    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await loginUseCase.execute(req.body);

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
            const result = await refreshTokenUseCase.execute(req.body);

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
            if (!req.user) {
                this.unauthorized(res);
                return;
            }

            await authService.logout(req.user.userId);
            this.ok(res, { message: 'Logged out successfully' });
        } catch (error) {
            next(error);
        }
    }

    async me(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user) {
                this.unauthorized(res);
                return;
            }

            this.ok(res, req.user);
        } catch (error) {
            next(error);
        }
    }
}

export const authController = new AuthController();
