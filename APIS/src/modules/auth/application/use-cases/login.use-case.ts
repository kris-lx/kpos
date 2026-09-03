// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Login Use Case
// ═══════════════════════════════════════════════════════════════════════════

import type { IUseCase } from '@/shared/application';
import { Result } from '@/shared/domain';
import type { LoginInput } from '../dtos/auth.dto';
import { AuthService, type LoginResponse } from '../../infrastructure/services/auth.service';
import type { Response } from 'express';

export type LoginResult = LoginResponse;

export class LoginUseCase implements IUseCase<LoginInput, LoginResult> {
    constructor(private readonly authService: AuthService) { }

    async execute(input: LoginInput & { res?: Response; secureCookie?: boolean }): Promise<Result<LoginResult>> {
        try {
            const result = await this.authService.login(input.email, input.password, input.res, input.secureCookie);
            return Result.ok(result);
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Login failed');
            return Result.fail(err);
        }
    }
}
