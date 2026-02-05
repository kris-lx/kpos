// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Register Use Case
// ═══════════════════════════════════════════════════════════════════════════

import type { IUseCase } from '@/shared/application';
import { Result } from '@/shared/domain';
import type { RegisterInput } from '../dtos/auth.dto';
import { AuthService } from '../../infrastructure/services/auth.service';

export interface RegisterResult {
    id: string;
    email: string;
    name: string;
    role: string;
}

export class RegisterUseCase implements IUseCase<RegisterInput, RegisterResult> {
    constructor(private readonly authService: AuthService) { }

    async execute(input: RegisterInput): Promise<Result<RegisterResult>> {
        try {
            const result = await this.authService.register(input);
            return Result.ok(result);
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Registration failed');
            return Result.fail(err);
        }
    }
}
