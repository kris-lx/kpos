// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Login Use Case
// ═══════════════════════════════════════════════════════════════════════════

import type { IUseCase } from '@/shared/application';
import { Result } from '@/shared/domain';
import type { LoginInput } from '../dtos/auth.dto';
import { AuthService } from '../../infrastructure/services/auth.service';

export interface LoginResult {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        email: string;
        name: string;
        role: string;
        branchId: string;
        tenantId: string;
        isSuperAdmin: boolean;
        permissions: string[];
    };
}

export class LoginUseCase implements IUseCase<LoginInput, LoginResult> {
    constructor(private readonly authService: AuthService) { }

    async execute(input: LoginInput): Promise<Result<LoginResult>> {
        try {
            const result = await this.authService.login(input.email, input.password);
            return Result.ok(result);
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Login failed');
            return Result.fail(err);
        }
    }
}
