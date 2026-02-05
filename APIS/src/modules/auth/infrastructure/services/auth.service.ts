// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Auth Service (Infrastructure Layer)
// ═══════════════════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { prisma } from '@/config/database.config';
import { jwtConfig } from '@/config/app.config';
import { redis } from '@/config/redis.config';
import type { RegisterInput } from '../../application/dtos/auth.dto';

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
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            include: { roleRelation: true },
        });

        if (!user) {
            throw new Error('Invalid email or password');
        }

        if (!user.isActive) {
            throw new Error('Account is disabled');
        }

        const isValidPassword = await argon2.verify(user.password, password);
        if (!isValidPassword) {
            throw new Error('Invalid email or password');
        }

        // Update last login
        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

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

        const user = await prisma.user.create({
            data: {
                email: input.email.toLowerCase(),
                password: hashedPassword,
                name: input.name,
                role: input.role,
                branchId: input.branchId,
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

            // Verify token exists in Redis
            const storedToken = await redis.get(`refresh_token:${decoded.userId}`);
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
        await redis.del(`refresh_token:${userId}`);
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
        await redis.setex(`refresh_token:${userId}`, 7 * 24 * 60 * 60, token);
    }
}

export const authService = new AuthService();
