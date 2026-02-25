// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Auth Service (Infrastructure Layer)
// ═══════════════════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { prisma } from '@/config/database.config';
import { jwtConfig } from '@/config/app.config';
import { cache } from '@/config/redis.config';
import { DatabaseConnectionError, isPrismaConnectionError } from '@/shared/domain/errors';
import type { RegisterInput } from '../../application/dtos/auth.dto';

export { DatabaseConnectionError } from '@/shared/domain/errors';

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

export interface LoginResponse extends TokenPair {
    user: {
        id: string;
        email: string;
        name: string;
        role: string;
        branchId: string;
        isSuperAdmin: boolean;
        permissions: string[];
    };
}

export interface RegisterResponse {
    id: string;
    email: string;
    name: string;
    role: string;
}

export class AuthService {
    async login(email: string, password: string): Promise<LoginResponse> {
        console.log(`[Auth] Login attempt for: ${email.toLowerCase()}`);

        let user;
        try {
            user = await prisma.user.findUnique({
                where: { email: email.toLowerCase() },
                include: { roleRelation: true },
            });
        } catch (error) {
            if (isPrismaConnectionError(error)) {
                console.error('[Auth] Database connection error during login');
                throw new DatabaseConnectionError('Database is not available. Please ensure MongoDB is running.');
            }
            throw error;
        }

        if (!user) {
            console.log(`[Auth] User not found: ${email.toLowerCase()}`);
            throw new Error('Invalid email or password');
        }

        console.log(`[Auth] User found: ${user.email}, isActive: ${user.isActive}`);

        if (!user.isActive) {
            console.log(`[Auth] Account disabled: ${user.email}`);
            throw new Error('Account is disabled');
        }

        const isValidPassword = await argon2.verify(user.password, password);
        if (!isValidPassword) {
            console.log(`[Auth] Invalid password for: ${user.email}`);
            throw new Error('Invalid email or password');
        }

        console.log(`[Auth] Login successful for: ${user.email}`);

        // Update last login (non-critical, don't fail login if this fails)
        try {
            await prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });
        } catch (error) {
            console.warn('[Auth] Failed to update lastLoginAt:', error instanceof Error ? error.message : error);
        }

        const tokens = this.generateTokens(user.id, user.email, user.role, user.branchId);

        // Store refresh token in Redis
        await this.storeRefreshToken(user.id, tokens.refreshToken);

        // Combine role permissions with user-specific permissions
        const rolePermissions = user.roleRelation?.permissions || [];
        const userPermissions = user.permissions || [];
        const combinedPermissions = [...new Set([...rolePermissions, ...userPermissions])];

        return {
            ...tokens,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                branchId: user.branchId,
                isSuperAdmin: user.isSuperAdmin || false,
                permissions: combinedPermissions,
            },
        };
    }

    async register(input: RegisterInput): Promise<RegisterResponse> {
        const existingUser = await prisma.user.findUnique({
            where: { email: input.email.toLowerCase() },
        });

        if (existingUser) {
            throw new Error('Email already registered');
        }

        const hashedPassword = await argon2.hash(input.password);

        // Look up the Role record to link roleId
        const roleName = input.role || 'store_owner';
        const roleRecord = await prisma.role.findUnique({ where: { name: roleName } });

        // Resolve branchId: use provided or fallback to default main branch
        let branchId = input.branchId;
        if (!branchId) {
            const mainBranch = await prisma.branch.findFirst({ where: { isMain: true } });
            if (!mainBranch) {
                throw new Error('No default branch found. Please contact admin.');
            }
            branchId = mainBranch.id;
        }

        const user = await prisma.user.create({
            data: {
                email: input.email.toLowerCase(),
                password: hashedPassword,
                name: input.name,
                phone: input.phone || null,
                role: roleName,
                roleId: roleRecord?.id || null,
                branchId,
                isActive: true,
            },
        });

        return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        };
    }

    async refreshToken(token: string): Promise<TokenPair> {
        try {
            const decoded = jwt.verify(token, jwtConfig.refreshSecret) as {
                userId: string;
                email: string;
                role: string;
                branchId: string;
            };

            // Verify token exists in cache (Redis or in-memory fallback)
            const storedToken = await cache.get<string>(`refresh_token:${decoded.userId}`);
            if (!storedToken || storedToken !== token) {
                throw new Error('Invalid refresh token');
            }

            const tokens = this.generateTokens(
                decoded.userId,
                decoded.email,
                decoded.role,
                decoded.branchId
            );

            // Update refresh token in Redis
            await this.storeRefreshToken(decoded.userId, tokens.refreshToken);

            return tokens;
        } catch (error) {
            throw new Error('Invalid refresh token');
        }
    }

    async logout(userId: string): Promise<void> {
        await cache.del(`refresh_token:${userId}`);
    }

    private generateTokens(
        userId: string,
        email: string,
        role: string,
        branchId: string
    ): TokenPair {
        const payload = { userId, email, role, branchId };

        const accessToken = jwt.sign(payload, jwtConfig.secret, {
            expiresIn: jwtConfig.expiresIn as jwt.SignOptions['expiresIn'],
        });

        const refreshToken = jwt.sign(payload, jwtConfig.refreshSecret, {
            expiresIn: jwtConfig.refreshExpiresIn as jwt.SignOptions['expiresIn'],
        });

        return { accessToken, refreshToken };
    }

    private async storeRefreshToken(userId: string, token: string): Promise<void> {
        // Store for 7 days (matching refresh token expiry)
        await cache.set(`refresh_token:${userId}`, token, 7 * 24 * 60 * 60);
    }
}

export const authService = new AuthService();
