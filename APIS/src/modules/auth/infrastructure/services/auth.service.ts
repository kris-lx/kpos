// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Auth Service (Infrastructure Layer)
// ═══════════════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { db } from '@/config/database.config';
import { jwtConfig, appConfig } from '@/config/app.config';
import { cache } from '@/config/redis.config';
import { isSessionExpired } from '@/shared/session-cap';
import { DatabaseConnectionError } from '@/shared/domain/errors';
import { users, storeRequests, roles, branches, sessions } from '@/db/schema/tables';
import { eq, and } from 'drizzle-orm';
import type { RegisterInput } from '../../application/dtos/auth.dto';
import type { Response } from 'express';

export { DatabaseConnectionError } from '@/shared/domain/errors';

// ─── Interfaces ──────────────────────────────────────────────────────────

/** Identity-only JWT payload — no role/permissions (BE-02) */
export interface IdentityJwtPayload {
    sub: string;   // userId
    tid: string;   // tenantId
    bid: string;   // branchId
    scope: string; // 'tenant' | 'platform'
    jti: string;   // unique token id for revocation
    sst: number;   // session start (epoch seconds of original login) — fixed across refresh rotations
    iat: number;
    exp: number;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    jti: string;
}

/** Login response — NO permissions[], NO refreshToken in body (BE-03, BE-04) */
export interface LoginResponse {
    accessToken: string;
    user: {
        id: string;
        email: string;
        name: string;
        role: string;
        branchId: string;
        tenantId: string;
        isSuperAdmin: boolean;
        avatar: string | null;
    };
}

export interface RegisterResponse {
    id: string;
    email: string;
    name: string;
    role: string;
}

// ─── Cookie helpers ──────────────────────────────────────────────────────

const REFRESH_COOKIE_NAME = 'kpos_refresh_token';
// Cookie must not outlive the absolute session cap — otherwise a stale cookie
// would sit in the browser past the point the server will ever honor it.
const REFRESH_COOKIE_MAX_AGE = jwtConfig.sessionAbsoluteMs;

/** Set refresh token as HttpOnly cookie (BE-04) */
function setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
        httpOnly: true,
        secure: appConfig.isProduction,
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: REFRESH_COOKIE_MAX_AGE,
    });
}

/** Clear refresh cookie on logout */
function clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: appConfig.isProduction,
        sameSite: 'strict',
        path: '/api/v1/auth',
    });
}

// ─── Helper: parse remaining TTL from a JWT exp ─────────────────────────

function remainingTTL(token: string): number {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        return Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
    } catch {
        return 900; // fallback 15min
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Auth Service
// ═══════════════════════════════════════════════════════════════════════════

export class AuthService {

    /**
     * Login: authenticate, issue identity-only JWT, set refresh cookie (BE-02..04)
     * @param res - Express Response for setting HttpOnly cookie
     */
    async login(email: string, password: string, res?: Response): Promise<LoginResponse> {
        console.log(`[Auth] Login attempt for: ${email.toLowerCase()}`);

        let user;
        try {
            user = await db.query.users.findFirst({
                where: eq(users.email, email.toLowerCase()),
                with: { roleRelation: true },
            });
        } catch (error) {
            console.error('[Auth] Database connection error during login');
            throw new DatabaseConnectionError('Database is not available. Please ensure PostgreSQL is running.');
        }

        if (!user) {
            console.log(`[Auth] User not found: ${email.toLowerCase()}`);
            throw new Error('Invalid email or password');
        }

        console.log(`[Auth] User found: ${user.email}, isActive: ${user.isActive}`);

        if (!user.isActive) {
            console.log(`[Auth] Account inactive: ${user.email}, role: ${user.role}`);
            // Store owners pending approval get a specific message
            if (user.role === 'store_owner') {
                const pendingRequest = await db.query.storeRequests.findFirst({
                    where: and(eq(storeRequests.requesterId, user.id), eq(storeRequests.status, 'pending')),
                });
                if (pendingRequest) {
                    throw Object.assign(new Error('Your store application is pending approval. You will be notified when approved.'), { code: 'PENDING_APPROVAL' });
                }
                // Rejected
                const rejectedRequest = await db.query.storeRequests.findFirst({
                    where: and(eq(storeRequests.requesterId, user.id), eq(storeRequests.status, 'rejected')),
                });
                if (rejectedRequest) {
                    throw Object.assign(new Error('Your store application was rejected. Please contact support.'), { code: 'APPLICATION_REJECTED' });
                }
            }
            throw Object.assign(new Error('Account is disabled. Please contact support.'), { code: 'ACCOUNT_DISABLED' });
        }

        const isValidPassword = await argon2.verify(user.password, password);
        if (!isValidPassword) {
            console.log(`[Auth] Invalid password for: ${user.email}`);
            throw new Error('Invalid email or password');
        }

        console.log(`[Auth] Login successful for: ${user.email}`);

        // Update last login (non-critical, don't fail login if this fails)
        try {
            await db.update(users)
                .set({ lastLoginAt: new Date() })
                .where(eq(users.id, user.id));
        } catch (error) {
            console.warn('[Auth] Failed to update lastLoginAt:', error instanceof Error ? error.message : error);
        }

        return this.issueSession(user, res);
    }

    /**
     * Issues an identity-only JWT + refresh cookie + session row for an
     * already-authenticated local user — shared by password login and SSO
     * login (both resolve to a local `users` row first, then converge here).
     */
    private async issueSession(
        user: { id: string; email: string; name: string; role: string; branchId: string | null; tenantId: string | null; isSuperAdmin: boolean | null; avatar: string | null },
        res?: Response,
    ): Promise<LoginResponse> {
        const scope = user.isSuperAdmin ? 'platform' : 'tenant';
        const tokens = this.generateTokens(user.id, user.branchId || '', user.tenantId || '', scope);

        // Store refresh jti → userId mapping in Redis (BE-05)
        await this.storeRefreshJti(tokens.jti, user.id);

        // Persist session in DB with jti
        try {
            await db.insert(sessions).values({
                userId: user.id,
                jti: tokens.jti,
                token: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: new Date(Date.now() + REFRESH_COOKIE_MAX_AGE),
            });
        } catch (error) {
            console.warn('[Auth] Failed to persist session:', error instanceof Error ? error.message : error);
        }

        // Set refresh token as HttpOnly cookie (BE-04)
        if (res) {
            setRefreshCookie(res, tokens.refreshToken);
        }

        // BE-03: No permissions in response, no refreshToken in body
        return {
            accessToken: tokens.accessToken,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                branchId: user.branchId || '',
                tenantId: user.tenantId || '',
                isSuperAdmin: user.isSuperAdmin || false,
                avatar: user.avatar || null,
            },
        };
    }

    /**
     * SSO login: resolve a local user by (tenantId, email) and issue a
     * session exactly as password login would. No JIT provisioning — the
     * user must already exist and be active (admin-created ahead of time).
     * Throws NO_ACCOUNT if no matching local user is found.
     */
    async loginWithSso(tenantId: string, email: string, res?: Response): Promise<LoginResponse> {
        const user = await db.query.users.findFirst({
            where: and(eq(users.tenantId, tenantId), eq(users.email, email.toLowerCase())),
        });

        if (!user || !user.isActive) {
            throw Object.assign(new Error('No matching account found for this email in this organization.'), { code: 'NO_ACCOUNT' });
        }

        try {
            await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        } catch (error) {
            console.warn('[Auth] Failed to update lastLoginAt (SSO):', error instanceof Error ? error.message : error);
        }

        return this.issueSession(user, res);
    }

    /** Register with tenant-scoped email uniqueness (BE-09) */
    async register(input: RegisterInput): Promise<RegisterResponse> {
        // Resolve branchId: use provided or fallback to default main branch
        let branchId = input.branchId;
        if (!branchId) {
            const mainBranch = await db.query.branches.findFirst({ where: eq(branches.isMain, true) });
            if (!mainBranch) {
                throw new Error('No default branch found. Please contact admin.');
            }
            branchId = mainBranch.id;
        }

        // Resolve tenantId from branch
        const branchRecord = await db.query.branches.findFirst({ where: eq(branches.id, branchId), columns: { tenantId: true } });
        const tenantId = branchRecord?.tenantId || null;

        // BE-09: Check UNIQUE(tenantId, email) not global email unique
        if (tenantId) {
            const existingUser = await db.query.users.findFirst({
                where: and(eq(users.tenantId, tenantId), eq(users.email, input.email.toLowerCase())),
            });
            if (existingUser) {
                throw new Error('Email already registered');
            }
        } else {
            const existingUser = await db.query.users.findFirst({
                where: eq(users.email, input.email.toLowerCase()),
            });
            if (existingUser) {
                throw new Error('Email already registered');
            }
        }

        const hashedPassword = await argon2.hash(input.password);

        // Look up the Role record to link roleId
        const roleName = input.role || 'store_owner';
        const roleRecord = await db.query.roles.findFirst({ where: eq(roles.name, roleName) });

        const [user] = await db.insert(users).values({
            tenantId,
            email: input.email.toLowerCase(),
            password: hashedPassword,
            name: input.name,
            phone: input.phone || null,
            role: roleName,
            roleId: roleRecord?.id || null,
            branchId,
            isActive: true,
        }).returning();

        return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        };
    }

    /**
     * Refresh token: accept from cookie, verify jti in Redis, issue new pair (BE-06)
     * @param token - refresh token from HttpOnly cookie
     * @param res - Express Response for setting new HttpOnly cookie
     */
    async refreshToken(token: string, res?: Response): Promise<{ accessToken: string }> {
        try {
            const decoded = jwt.verify(token, jwtConfig.refreshSecret) as IdentityJwtPayload;

            // Verify jti exists in Redis (BE-06)
            const storedUserId = await cache.get<string>(`refresh_jti:${decoded.jti}`);
            if (!storedUserId || storedUserId !== decoded.sub) {
                throw new Error('Invalid refresh token');
            }

            // Absolute session cap: refresh-token rotation can keep a token pair
            // alive indefinitely, so the hard 20h-from-login limit has to be
            // enforced here, not just via token TTL. Once hit, force re-login.
            const sessionStart = decoded.sst ?? decoded.iat;
            if (isSessionExpired(sessionStart, jwtConfig.sessionAbsoluteMs)) {
                await cache.del(`refresh_jti:${decoded.jti}`);
                throw new Error('Session expired, please log in again');
            }

            // Revoke old jti
            await cache.del(`refresh_jti:${decoded.jti}`);

            // Issue new pair with new jti, preserving the original session start
            const tokens = this.generateTokens(decoded.sub, decoded.bid, decoded.tid, decoded.scope, sessionStart);

            // Store new refresh jti
            await this.storeRefreshJti(tokens.jti, decoded.sub);

            // Update session in DB
            try {
                await db.update(sessions)
                    .set({ token: tokens.accessToken, refreshToken: tokens.refreshToken, jti: tokens.jti })
                    .where(eq(sessions.jti, decoded.jti));
            } catch (error) {
                console.warn('[Auth] Failed to update session:', error instanceof Error ? error.message : error);
            }

            // Set new refresh cookie
            if (res) {
                setRefreshCookie(res, tokens.refreshToken);
            }

            return { accessToken: tokens.accessToken };
        } catch (error) {
            throw new Error('Invalid refresh token');
        }
    }

    /**
     * Logout: revoke access token jti in Redis, clear refresh cookie (BE-07)
     * @param accessToken - the current access token to extract jti from
     * @param userId - user ID for backward compat
     * @param res - Express Response for clearing cookie
     */
    async logout(accessToken: string | undefined, userId: string, res?: Response): Promise<void> {
        // Revoke access token jti (BE-07)
        if (accessToken) {
            try {
                const decoded = jwt.decode(accessToken) as IdentityJwtPayload | null;
                if (decoded?.jti) {
                    const ttl = remainingTTL(accessToken);
                    if (ttl > 0) {
                        await cache.set(`revoked:${decoded.jti}`, '1', ttl);
                    }
                    // Also revoke refresh jti
                    await cache.del(`refresh_jti:${decoded.jti}`);
                    // Mark session as revoked in DB
                    try {
                        await db.update(sessions)
                            .set({ revokedAt: new Date() })
                            .where(eq(sessions.jti, decoded.jti));
                    } catch { /* non-critical */ }
                }
            } catch { /* decode failure is non-critical */ }
        }

        // Legacy cleanup
        await cache.del(`refresh_token:${userId}`);

        // Clear refresh cookie
        if (res) {
            clearRefreshCookie(res);
        }
    }

    /**
     * Generate identity-only JWT tokens (BE-02)
     * Payload: { sub, tid, bid, scope, jti }  — NO email, role, permissions
     */
    private generateTokens(
        userId: string,
        branchId: string,
        tenantId: string,
        scope: string,
        sessionStart?: number,
    ): TokenPair {
        const jti = crypto.randomUUID();
        const sst = sessionStart ?? Math.floor(Date.now() / 1000);

        const payload = { sub: userId, tid: tenantId, bid: branchId, scope, jti, sst };

        const accessToken = jwt.sign(payload, jwtConfig.secret, {
            expiresIn: jwtConfig.expiresIn as jwt.SignOptions['expiresIn'],
        });

        const refreshToken = jwt.sign(payload, jwtConfig.refreshSecret, {
            expiresIn: jwtConfig.refreshExpiresIn as jwt.SignOptions['expiresIn'],
        });

        return { accessToken, refreshToken, jti };
    }

    /** Store refresh jti → userId mapping in Redis (BE-05) */
    private async storeRefreshJti(jti: string, userId: string): Promise<void> {
        // TTL matches the absolute session cap — no point outliving it
        await cache.set(`refresh_jti:${jti}`, userId, jwtConfig.sessionAbsoluteMs / 1000);
    }
}

export const authService = new AuthService();

// Re-export cookie name for use in auth routes
export { REFRESH_COOKIE_NAME };
