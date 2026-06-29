// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Refresh Token Use Case
// ═══════════════════════════════════════════════════════════════════════════

import type { IUseCase } from '@/shared/application';
import { Result } from '@/shared/domain';
import { AuthService } from '../../infrastructure/services/auth.service';
import type { Response } from 'express';

export interface RefreshTokenResult {
    accessToken: string;
}

export interface RefreshTokenUseCaseInput {
    refreshToken: string;
    res?: Response;
}

export class RefreshTokenUseCase implements IUseCase<RefreshTokenUseCaseInput, RefreshTokenResult> {
    constructor(private readonly authService: AuthService) { }

    async execute(input: RefreshTokenUseCaseInput): Promise<Result<RefreshTokenResult>> {
        try {
            const result = await this.authService.refreshToken(input.refreshToken, input.res);
            return Result.ok(result);
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Token refresh failed');
            return Result.fail(err);
        }
    }
}
