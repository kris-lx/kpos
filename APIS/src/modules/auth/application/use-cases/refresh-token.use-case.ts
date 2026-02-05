// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Refresh Token Use Case
// ═══════════════════════════════════════════════════════════════════════════

import type { IUseCase } from '@/shared/application';
import { Result } from '@/shared/domain';
import type { RefreshTokenInput } from '../dtos/auth.dto';
import { AuthService } from '../../infrastructure/services/auth.service';

export interface RefreshTokenResult {
    accessToken: string;
    refreshToken: string;
}

export class RefreshTokenUseCase implements IUseCase<RefreshTokenInput, RefreshTokenResult> {
    constructor(private readonly authService: AuthService) { }

    async execute(input: RefreshTokenInput): Promise<Result<RefreshTokenResult>> {
        try {
            const result = await this.authService.refreshToken(input.refreshToken);
            return Result.ok(result);
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Token refresh failed');
            return Result.fail(err);
        }
    }
}
