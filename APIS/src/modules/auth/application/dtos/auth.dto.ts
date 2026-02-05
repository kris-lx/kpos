// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - DTOs
// ═══════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

export const LoginDto = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
});

export const RegisterDto = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required'),
    role: z.string().default('cashier'),
    branchId: z.string().min(1, 'Branch ID is required'),
});

export const RefreshTokenDto = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const ChangePasswordDto = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export type LoginInput = z.infer<typeof LoginDto>;
export type RegisterInput = z.infer<typeof RegisterDto>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenDto>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordDto>;
