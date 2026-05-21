// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Authentication Middleware
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '@/config/app.config';
import { ApiError } from './error.middleware';
import { db } from '@/config/database.config';
import { cache } from '@/config/redis.config';
import { eq, inArray, and, isNull, sql, type SQL } from 'drizzle-orm';
import { users, userStores, roleRules as roleRulesTable, tenants, roles, branches } from '@/db/schema/tables';
import { SYSTEM_ROLE_PERMISSIONS } from '@/shared/systemRolePermissions';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { hasPerm, type PermBit } from '@/infrastructure/permissions';
import { getUserMask } from '@/infrastructure/services/permission.service';

/** Legacy JWT payload shape — kept for backward compat on req.user */
export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
    branchId: string;
    tenantId: string;
}

/**
 * 7-level role hierarchy used for branch visibility scoping.
 * Lower number = broader access.
 *   1 = system_admin   → all tenants / all branches
 *   2 = tenant_admin   → all branches within tenant
 *   3 = hq_admin       → HQ branch + all child branches (full access)
 *   4 = hq_manager     → HQ branch + all child branches (reports read-only)
 *   5 = branch_admin   → own branch only (full CRUD)
 *   6 = branch_manager → own branch only (limited CRUD)
 *   7 = staff/cashier  → own store/POS only
 */
export const ROLE_LEVELS: Record<string, number> = {
    system_admin: 1,
    admin: 2,
    tenant_admin: 2,
    hq_admin: 3,
    hq_manager: 4,
    branch_admin: 5,
    store_owner: 5,
    branch_manager: 6,
    manager: 6,
    store_manager: 6,
    cashier: 7,
    staff: 7,
    kitchen_staff: 7,
    waiter: 7,
    inventory_staff: 7,
};

export function getRoleLevel(role: string, isSuperAdmin: boolean): number {
    if (isSuperAdmin) return 1;
    return ROLE_LEVELS[role] ?? 7;
}

/** Returns true if the user can access branches beyond their own (HQ or above). */
export function canAccessBranch(user: AuthenticatedUser, targetBranchPath: string): boolean {
    if (user.isSuperAdmin || user.roleLevel <= 2) return true;
    if (user.roleLevel <= 4) {
        return user.accessibleBranchPaths.some(
            p => targetBranchPath === p || targetBranchPath.startsWith(p + '.')
        );
    }
    return user.accessibleBranchIds.some(id => targetBranchPath.includes(id));
}

/** Identity-only JWT payload (BE-02) */
interface IdentityJwtPayload {
    sub: string;
    tid: string;
    bid: string;
    scope: string;
    jti: string;
    iat: number;
    exp: number;
    // Legacy fields (backward compat during migration)
    userId?: string;
    email?: string;
    role?: string;
    branchId?: string;
    tenantId?: string;
}

// Extended user context with store access
export interface UserStoreAccess {
    storeId: string;
    branchId: string;
    storeName: string;
    branchName: string;
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    canManage: boolean;
    isDefault: boolean;
}

export interface AuthenticatedUser extends JwtPayload {
    permissions: string[];
    accessibleStores: UserStoreAccess[];
    accessibleBranchIds: string[];
    accessibleBranchPaths: string[];
    accessibleStoreIds: string[];
    activeStoreId?: string;
    activeBranchId: string;
    activeBranchPath?: string;
    isSuperAdmin: boolean;
    tenantId: string;
    /** Numeric role level (1=system_admin … 7=staff). Lower = broader access. */
    roleLevel: number;
}

declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
            authUser?: AuthenticatedUser;
            branchFilter?: ScopeFilter;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Redis-backed cache for auth data (shared across instances)
// Keys: kpos:stores:{userId}, kpos:auth:{userId}, kpos:rules:{roleId}
// ═══════════════════════════════════════════════════════════════════════════
const CACHE_TTL = 300; // 5 minutes in seconds
const CACHE_PREFIX = 'kpos';

/** Invalidate a single user's cached store access (call after UserStore changes) */
export async function invalidateUserStoreCache(userId: string): Promise<void> {
    await cache.del(`${CACHE_PREFIX}:stores:${userId}`);
    await cache.del(`${CACHE_PREFIX}:auth:${userId}`);
}

/** Invalidate ALL users' cached store access (call after bulk changes) */
export async function invalidateAllUserStoreCache(): Promise<void> {
    await cache.delPattern(`${CACHE_PREFIX}:stores:*`);
    await cache.delPattern(`${CACHE_PREFIX}:auth:*`);
}

/** Invalidate cached role rules (call after role/rule changes) */
export async function invalidateRoleRulesCache(roleId?: string): Promise<void> {
    if (roleId) {
        await cache.del(`${CACHE_PREFIX}:rules:${roleId}`);
    } else {
        await cache.delPattern(`${CACHE_PREFIX}:rules:*`);
    }
}

/** Invalidate query cache by pattern (call after data mutations) */
export async function invalidateQueryCache(pattern: string): Promise<void> {
    await cache.delPattern(`${CACHE_PREFIX}:q:${pattern}`);
}

/**
 * Load branch_path for a single branch (DB hit, no cache).
 * Returns undefined if branch not found.
 */
async function loadBranchPath(branchId: string): Promise<string | undefined> {
    const row = await db.query.branches.findFirst({
        where: eq(branches.id, branchId),
        columns: { branchPath: true },
    });
    return row?.branchPath || undefined;
}

/**
 * Load distinct branch_paths for all branches the user can access.
 * Cached per user. Empty array means no scope restriction (used by admins).
 */
async function loadAccessibleBranchPaths(
    userId: string,
    branchIds: string[],
): Promise<string[]> {
    if (!branchIds.length) return [];
    const cacheKey = `${CACHE_PREFIX}:paths:${userId}`;
    const cached = await cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const rows = await db.query.branches.findMany({
        where: inArray(branches.id, branchIds),
        columns: { branchPath: true },
    });
    const paths = [...new Set(rows.map(r => r.branchPath).filter(Boolean) as string[])];
    await cache.set(cacheKey, paths, CACHE_TTL);
    return paths;
}

// Load user's store access from database (with Redis cache)
async function loadUserStoreAccess(userId: string): Promise<UserStoreAccess[]> {
    const cacheKey = `${CACHE_PREFIX}:stores:${userId}`;
    const cached = await cache.get<UserStoreAccess[]>(cacheKey);
    if (cached) return cached;

    const userStoreRows = await db.query.userStores.findMany({
        where: eq(userStores.userId, userId),
        with: {
            store: true,
            branch: true,
        },
    });

    const result = userStoreRows
        .filter(us => us.store != null && us.branch != null && us.store.isActive && us.branch.isActive)
        .map(us => ({
            storeId: us.storeId,
            branchId: us.branchId,
            storeName: us.store.name,
            branchName: us.branch.name,
            canRead: us.canRead,
            canWrite: us.canWrite,
            canDelete: us.canDelete,
            canManage: us.canManage,
            isDefault: us.isDefault,
        }));

    await cache.set(cacheKey, result, CACHE_TTL);
    return result;
}

// Cached auth user data (user + permissions) — skips User DB lookup per request
interface CachedAuthUser {
    isActive: boolean;
    email: string;
    branchId: string;
    tenantId: string | null;
    isSuperAdmin: boolean;
    permissions: string[];
    role: string;
    roleId: string | null;
    roleLevel: number;
}

async function loadCachedAuthUser(userId: string): Promise<CachedAuthUser | null> {
    const cacheKey = `${CACHE_PREFIX}:auth:${userId}`;
    const cached = await cache.get<CachedAuthUser>(cacheKey);
    if (cached) return cached;

    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        with: {
            roleRelation: true,
        },
    });

    if (!user || !user.isActive) return null;

    let rolePerms = user.roleRelation?.permissions || [];
    const userPerms = user.permissions || [];

    // Fallback: if no roleId/permissions loaded, find role by name within the tenant
    if (rolePerms.length === 0 && user.role && !user.isSuperAdmin) {
        // Primary: tenant-specific role
        let fallbackRole = await db.query.roles.findFirst({
            where: user.tenantId
                ? and(eq(roles.name, user.role), eq(roles.tenantId, user.tenantId))
                : and(eq(roles.name, user.role), isNull(roles.tenantId)),
            columns: { permissions: true },
        });
        // Secondary: global system role (tenantId = null)
        if (!fallbackRole?.permissions?.length && user.tenantId) {
            fallbackRole = await db.query.roles.findFirst({
                where: and(eq(roles.name, user.role), isNull(roles.tenantId)),
                columns: { permissions: true },
            });
        }
        if (fallbackRole?.permissions?.length) {
            rolePerms = fallbackRole.permissions as string[];
        }

        // Final fallback: use hardcoded system role permissions if DB role has empty permissions.
        // This self-heals tenants whose roles were seeded before DEFAULT_ROLES was fully populated.
        if (rolePerms.length === 0 && SYSTEM_ROLE_PERMISSIONS[user.role]) {
            rolePerms = SYSTEM_ROLE_PERMISSIONS[user.role];
            // Asynchronously update the DB role + clear auth cache so next request is correct
            if (user.roleId) {
                db.update(roles)
                    .set({ permissions: rolePerms })
                    .where(eq(roles.id, user.roleId))
                    .then(() => cache.del(`${CACHE_PREFIX}:auth:${userId}`))
                    .catch(() => {});
            }
        }
    }

    const result: CachedAuthUser = {
        isActive: user.isActive,
        email: user.email,
        branchId: user.branchId || '',
        tenantId: user.tenantId || null,
        isSuperAdmin: user.isSuperAdmin,
        permissions: [...new Set([...rolePerms, ...userPerms])],
        role: user.role,
        roleId: user.roleId,
        roleLevel: getRoleLevel(user.role, user.isSuperAdmin),
    };

    await cache.set(cacheKey, result, CACHE_TTL);
    return result;
}

export async function authenticate(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith('Bearer ')) {
            throw ApiError.unauthorized('No token provided');
        }

        const token = authHeader.substring(7);

        try {
            const raw = jwt.verify(token, jwtConfig.secret) as IdentityJwtPayload;

            // Normalize: support both new (sub/tid/bid) and legacy (userId/tenantId/branchId) payloads
            const userId = raw.sub || raw.userId || '';
            const tenantId = raw.tid || raw.tenantId || '';
            const branchId = raw.bid || raw.branchId || '';
            const jti = raw.jti;

            // BE-10 Step 2: Check jti revocation in Redis
            if (jti) {
                const revoked = await cache.get<string>(`revoked:${jti}`);
                if (revoked) {
                    throw ApiError.unauthorized('Token has been revoked');
                }
            }

            // BE-10 Step 3: Load user from Redis cache (falls back to DB on miss)
            const user = await loadCachedAuthUser(userId);

            if (!user) {
                throw ApiError.unauthorized('User not found or inactive');
            }

            const mergedPermissions = user.permissions;

            // Load user's store access (Redis-cached)
            const accessibleStores = await loadUserStoreAccess(userId);
            
            // Get unique branch and store IDs
            const accessibleBranchIds = [...new Set(accessibleStores.map(s => s.branchId))];
            const accessibleStoreIds = accessibleStores.map(s => s.storeId);
            
            // If user has no store assignments, give access to their default branch
            if (accessibleBranchIds.length === 0 && user.branchId) {
                accessibleBranchIds.push(user.branchId);
            }

            // Load branch_path for each accessible branch (descendants of each
            // root included so users automatically see sub-branches under their
            // scope). Cached per user.
            const accessibleBranchPaths = await loadAccessibleBranchPaths(userId, accessibleBranchIds);

            // Get active store from header or use default
            const activeStoreHeader = req.headers['x-active-store'] as string | undefined;
            const defaultStore = accessibleStores.find(s => s.isDefault);
            const activeStoreId = activeStoreHeader && accessibleStoreIds.includes(activeStoreHeader) 
                ? activeStoreHeader 
                : defaultStore?.storeId;

            // Set active branch from active store or user's default branch
            const activeStore = accessibleStores.find(s => s.storeId === activeStoreId);
            const activeBranchId = activeStore?.branchId || user.branchId || branchId;
            const activeBranchPath = activeBranchId
                ? await loadBranchPath(activeBranchId)
                : undefined;

            // Build legacy JwtPayload for backward compat on req.user
            const legacyPayload: JwtPayload = {
                userId,
                email: user.email,
                role: user.role,
                branchId: activeBranchId,
                tenantId: user.tenantId || tenantId,
            };

            req.user = legacyPayload;
            req.authUser = {
                ...legacyPayload,
                permissions: mergedPermissions,
                role: user.role,
                tenantId: user.tenantId || tenantId,
                accessibleStores,
                accessibleBranchIds,
                accessibleBranchPaths,
                accessibleStoreIds,
                activeStoreId,
                activeBranchId,
                activeBranchPath,
                isSuperAdmin: user.isSuperAdmin || false,
                roleLevel: user.roleLevel,
            };

            next();
        } catch (err) {
            if (err instanceof jwt.TokenExpiredError) {
                throw ApiError.unauthorized('Token expired');
            }
            if (err instanceof jwt.JsonWebTokenError) {
                throw ApiError.unauthorized('Invalid token');
            }
            throw err;
        }
    } catch (error) {
        next(error);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MERCHANT STATUS MIDDLEWARE (BE-11 — Finding-I G10)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * After JWT verify, check tenant status. If not 'active' → 403 MERCHANT_SUSPENDED.
 * Cache miss → query tenants.status → write to Redis TTL 5min.
 */
export async function merchantStatusMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.authUser) {
            next();
            return;
        }

        // Super Admin bypasses merchant status check
        if (req.authUser.isSuperAdmin) {
            next();
            return;
        }

        const tenantId = req.authUser.tenantId;
        if (!tenantId) {
            next();
            return;
        }

        const statusKey = `${CACHE_PREFIX}:merchant:status:${tenantId}`;
        let status = await cache.get<string>(statusKey);

        if (!status) {
            // Cache miss — query DB
            const tenant = await db.query.tenants.findFirst({
                where: eq(tenants.id, tenantId),
                columns: { status: true },
            });
            status = tenant?.status || 'active';
            await cache.set(statusKey, status, CACHE_TTL);
        }

        if (status !== 'active') {
            throw ApiError.forbidden(
                status === 'suspended'
                    ? 'Your merchant account has been suspended. Please contact support.'
                    : 'Your merchant account is no longer active.'
            );
        }

        next();
    } catch (error) {
        next(error);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM SCOPE GUARD (BE-12 — Finding-E G5)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * G5 FIX: Platform scope guard — blocks platform-scoped users from tenant routes.
 * A user is "platform-scoped" if they have no tenantId (platform admin who manages
 * tenants but shouldn't access /products, /sales, /inventory, etc.).
 * Super Admins bypass this check (they can access everything).
 *
 * Usage: mount on the main router AFTER authenticate:
 *   app.use('/api/v1', authenticate, platformScopeGuard());
 */
export function platformScopeGuard() {
    // Tenant-specific route prefixes that platform-scoped users cannot access
    const TENANT_ONLY_PREFIXES = [
        '/products', '/categories', '/inventory', '/sales', '/customers',
        '/promotions', '/restaurant', '/payments', '/documents', '/reports',
        '/staff', '/branches', '/settings', '/shifts', '/registers',
    ];

    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            if (!req.authUser) {
                next();
                return;
            }

            // Super Admin can access everything
            if (req.authUser.isSuperAdmin) {
                next();
                return;
            }

            // If user has a tenantId, they are tenant-scoped → allow
            if (req.authUser.tenantId) {
                next();
                return;
            }

            // User has NO tenantId → platform-scoped. Block tenant-only routes.
            const path = req.path.replace(/^\/api\/v\d+/, ''); // normalize
            const isTenantRoute = TENANT_ONLY_PREFIXES.some(p => path.startsWith(p));
            if (isTenantRoute) {
                res.status(403).json({
                    success: false,
                    error: { code: 'PLATFORM_SCOPE', message: 'Platform users cannot access tenant resources' },
                });
                return;
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY PERMISSION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

export function authorize(...permissions: string[]) {
    return async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            if (!req.user || !req.authUser) {
                throw ApiError.unauthorized();
            }

            // Super Admin bypasses all permission checks
            if (req.authUser.isSuperAdmin) {
                next();
                return;
            }

            const userPermissions = req.authUser.permissions;

            // Check if user has any of the required permissions
            // Treat :view and :read as equivalent
            const hasPermission = permissions.some((p) => {
                if (userPermissions.includes(p) || userPermissions.includes('*')) return true;
                // Check :view/:read equivalence
                if (p.endsWith(':read') && userPermissions.includes(p.replace(':read', ':view'))) return true;
                if (p.endsWith(':view') && userPermissions.includes(p.replace(':view', ':read'))) return true;
                return false;
            });

            if (!hasPermission) {
                throw ApiError.forbidden('Insufficient permissions');
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

// New middleware: Rule-based CRUD authorization
// Usage: authorizeRule('products', 'create') - checks if user's role has the 'products' rule with canCreate=true
export function authorizeRule(module: string, action: 'read' | 'create' | 'update' | 'delete') {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!req.authUser) {
                throw ApiError.unauthorized();
            }

            // Super Admin bypasses all
            if (req.authUser.isSuperAdmin) {
                next();
                return;
            }

            // Also fall back to existing permission check for backward compatibility
            const userPermissions = req.authUser.permissions;
            if (userPermissions.includes('*')) {
                next();
                return;
            }

            // Load user's role rules (Redis-cached by roleId, fallback to request cache)
            if (!(req as any)._roleRulesLoaded) {
                // roleId is already available from cached auth user
                const cachedUser = await loadCachedAuthUser(req.authUser.userId);
                const roleId = cachedUser?.roleId;
                if (roleId) {
                    const rulesCacheKey = `${CACHE_PREFIX}:rules:${roleId}`;
                    let roleRules = await cache.get<any[]>(rulesCacheKey);
                    if (!roleRules) {
                        const dbRules = await db.query.roleRules.findMany({
                            where: eq(roleRulesTable.roleId, roleId),
                            with: { rule: true },
                        });
                        roleRules = dbRules.filter(rr => rr.rule.isActive);
                        await cache.set(rulesCacheKey, roleRules, CACHE_TTL);
                    }
                    (req as any)._roleRules = roleRules;
                } else {
                    (req as any)._roleRules = [];
                }
                (req as any)._roleRulesLoaded = true;
            }

            const roleRules = (req as any)._roleRules || [];
            const matchingRule = roleRules.find((rr: any) => rr.rule.module === module || rr.rule.name === module);

            if (!matchingRule) {
                // Fall back to existing permission string check
                const actionMap: Record<string, string> = { read: 'view', create: 'create', update: 'update', delete: 'delete' };
                const permKey = `${module}:${actionMap[action] || action}`;
                const hasLegacy = userPermissions.includes(permKey) ||
                    (action === 'read' && userPermissions.includes(`${module}:read`));
                if (hasLegacy) {
                    next();
                    return;
                }
                throw ApiError.forbidden(`No access to ${module}:${action}`);
            }

            // Check CRUD flag
            const crudMap: Record<string, string> = { read: 'canRead', create: 'canCreate', update: 'canUpdate', delete: 'canDelete' };
            const flag = crudMap[action];
            if (!matchingRule[flag]) {
                throw ApiError.forbidden(`${action} access denied for ${module}`);
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

// New middleware: Require store access
export function requireStoreAccess(accessType: 'read' | 'write' | 'delete' | 'manage' = 'read') {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            if (!req.authUser) {
                throw ApiError.unauthorized();
            }

            const { activeStoreId, accessibleStores } = req.authUser;

            if (!activeStoreId) {
                throw ApiError.forbidden('No active store selected');
            }

            const storeAccess = accessibleStores.find(s => s.storeId === activeStoreId);
            if (!storeAccess) {
                throw ApiError.forbidden('No access to this store');
            }

            // Check access type
            const accessMap = {
                read: storeAccess.canRead,
                write: storeAccess.canWrite,
                delete: storeAccess.canDelete,
                manage: storeAccess.canManage
            };

            if (!accessMap[accessType]) {
                throw ApiError.forbidden(`Insufficient store access: ${accessType} required`);
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

// Scope filter type for route handlers
export interface ScopeFilter {
    tenantId: string;
    branchIds: string[];
    storeIds: string[];
    activeBranchId: string;
    activeStoreId?: string;
    /** true when user is scoped by store (store_owner with UserStore entries) */
    scopeByStore: boolean;
    /**
     * Branch paths for HQ-level users (roleLevel 3-4).
     * When set, route handlers should use path-prefix matching instead of exact branchId matching.
     * e.g. "root.hq" matches all branches where branchPath starts with "root.hq"
     */
    branchPaths?: string[];
    /** Numeric role level, copied from authUser.roleLevel */
    roleLevel: number;
}

// New middleware: Filter by accessible branches/stores
export function branchFilter() {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (req.authUser) {
            const { isSuperAdmin, roleLevel } = req.authUser;

            if (!isSuperAdmin) {
                let branchIds = req.authUser.accessibleBranchIds;
                let storeIds = req.authUser.accessibleStoreIds;
                const hasStoreScope = storeIds.length > 0;

                // Level 1-2 (system_admin, tenant_admin): tenant-only scope, no branch restriction
                if (roleLevel <= 2) {
                    req.branchFilter = {
                        tenantId: req.authUser.tenantId,
                        branchIds: [],
                        storeIds: [],
                        activeBranchId: req.authUser.activeBranchId,
                        activeStoreId: req.authUser.activeStoreId,
                        scopeByStore: false,
                        roleLevel,
                    };
                } else if (roleLevel <= 4) {
                    // Level 3-4 (hq_admin, hq_manager): path-prefix scope for child branches
                    if (branchIds.length === 0 && req.authUser.branchId) {
                        branchIds = [req.authUser.branchId];
                    }
                    req.branchFilter = {
                        tenantId: req.authUser.tenantId,
                        branchIds,
                        storeIds,
                        activeBranchId: req.authUser.activeBranchId,
                        activeStoreId: req.authUser.activeStoreId,
                        scopeByStore: hasStoreScope,
                        branchPaths: req.authUser.accessibleBranchPaths,
                        roleLevel,
                    };
                } else {
                    // Level 5-7 (branch_admin, manager, staff): exact branch/store scope
                    if (branchIds.length === 0 && req.authUser.branchId) {
                        branchIds = [req.authUser.branchId];
                    }
                    if (!hasStoreScope && req.authUser.activeStoreId) {
                        storeIds = [req.authUser.activeStoreId];
                    }

                    req.branchFilter = {
                        tenantId: req.authUser.tenantId,
                        branchIds,
                        storeIds,
                        activeBranchId: req.authUser.activeBranchId,
                        activeStoreId: req.authUser.activeStoreId,
                        scopeByStore: hasStoreScope,
                        roleLevel,
                    };
                }
            }
        }
        next();
    };
}

/**
 * Helper: build Drizzle scope condition from ScopeFilter.
 * - 'store' model: filters by store.id ∈ storeIds (or branchId fallback)
 * - 'storeId' model (Customer, etc.): filters by storeId ∈ storeIds
 * - 'branchId' model (Product, Inventory, Transaction, etc.): filters by branchId ∈ branchIds
 *
 * Pass column refs from the target table, e.g. buildScopeCondition(filter, { id: stores.id, branchId: stores.branchId }, 'store')
 */
export function buildScopeCondition(
    filter: ScopeFilter | undefined,
    columns: { id?: PgColumn; branchId?: PgColumn; storeId?: PgColumn; tenantId?: PgColumn },
    modelType: 'store' | 'storeId' | 'branchId' = 'branchId'
): SQL | undefined {
    if (!filter) return undefined;

    const conditions: SQL[] = [];

    // Tenant isolation — always applied when tenantId column is available
    if (filter.tenantId && columns.tenantId) {
        conditions.push(eq(columns.tenantId, filter.tenantId));
    }

    // Branch/Store scoping
    if (modelType === 'store') {
        if (filter.scopeByStore && filter.storeIds.length > 0 && columns.id) {
            conditions.push(inArray(columns.id, filter.storeIds));
        } else if (filter.branchIds.length > 0 && columns.branchId) {
            conditions.push(inArray(columns.branchId, filter.branchIds));
        }
    } else if (modelType === 'storeId') {
        if (filter.scopeByStore && filter.storeIds.length > 0 && columns.storeId) {
            conditions.push(inArray(columns.storeId, filter.storeIds));
        } else if (filter.branchIds.length > 0 && columns.branchId) {
            conditions.push(inArray(columns.branchId, filter.branchIds));
        }
    } else {
        if (filter.branchIds.length > 0 && columns.branchId) {
            conditions.push(inArray(columns.branchId, filter.branchIds));
        }
    }

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
}

/**
 * Build tenant-only condition (no branch/store scoping).
 * Use for tables that only need tenant isolation (e.g. roles, rules, settings).
 */
export function buildTenantCondition(
    filter: ScopeFilter | undefined,
    tenantIdColumn: PgColumn
): SQL | undefined {
    if (!filter?.tenantId) return undefined;
    return eq(tenantIdColumn, filter.tenantId);
}

/**
 * Build a branch-scope condition that handles HQ-level path-prefix matching.
 * For HQ users (level 3-4): uses `branchId IN (SELECT id FROM branches WHERE path LIKE p.%)`
 * For branch-level users (5-7): uses `branchId IN (exact list)`
 * For tenant/system admins: returns undefined (no restriction beyond tenantId)
 *
 * Use this in product/inventory/customer/sales list routes instead of buildScopeCondition
 * when the table has a branchId column but NOT a branchPath column.
 */
export function buildBranchIdScope(
    filter: ScopeFilter | undefined,
    branchIdColumn: PgColumn
): SQL | undefined {
    if (!filter) return undefined;

    const { roleLevel = 7, branchPaths, branchIds } = filter;

    // Tenant/system admins: no branch restriction
    if (roleLevel <= 2) return undefined;

    // HQ level (3-4): path-prefix sub-select against branches table
    if (roleLevel <= 4 && branchPaths && branchPaths.length > 0) {
        const pathClauses = branchPaths
            .map(p => `(branch_path = '${p.replace(/'/g, "''")}' OR branch_path LIKE '${p.replace(/'/g, "''")}' || '.%')`)
            .join(' OR ');
        return sql`${branchIdColumn} IN (SELECT id FROM branches WHERE ${sql.raw(pathClauses)})`;
    }

    // Branch-level (5-7): exact IN list
    if (branchIds.length > 0) {
        return inArray(branchIdColumn, branchIds);
    }

    return undefined;
}

/**
 * G6 FIX: Mandatory tenant isolation condition.
 * Returns `eq(tenantIdColumn, tenantId)` for non-SuperAdmin users.
 * Returns `undefined` for SuperAdmins (they see all tenants).
 * Use: `const tc = tenantScope(req, table.tenantId); if (tc) conds.push(tc);`
 *
 * This is the simplest, most defensive helper — use it when you just need
 * tenant isolation without branch/store scoping.
 */
export function tenantScope(
    req: Request,
    tenantIdColumn: PgColumn
): SQL | undefined {
    if (!req.authUser) return undefined;
    if (req.authUser.isSuperAdmin) return undefined;
    const tid = req.authUser.tenantId;
    if (!tid) return undefined;
    return eq(tenantIdColumn, tid);
}

/**
 * Branch-path scope condition based on materialized path semantics.
 * Returns `branch_path = ANY(paths) OR branch_path LIKE 'p.%' for each p`.
 *
 * - SuperAdmin / tenant admin (no accessibleBranchPaths) → undefined (no restriction).
 * - User with paths → restrict to those paths and their descendants.
 *
 * Pair this with `tenantScope()` for full Layer-1 isolation on any tenant
 * table that has a `branch_path` column (typically `branches` itself; other
 * tables should use `buildScopeCondition()` against `branch_id`).
 */
export function buildBranchPathScope(
    req: Request,
    branchPathColumn: PgColumn
): SQL | undefined {
    if (!req.authUser) return undefined;
    if (req.authUser.isSuperAdmin) return undefined;
    const paths = req.authUser.accessibleBranchPaths || [];
    if (paths.length === 0) return undefined;

    // Match exact path or any descendant: `path = 'x' OR path LIKE 'x.%'`
    const conds: SQL[] = paths.map(
        (p) => sql`(${branchPathColumn} = ${p} OR ${branchPathColumn} LIKE ${p + '.%'})`
    );
    return conds.length === 1 ? conds[0] : sql.join(conds, sql` OR `);
}

/** @deprecated Use buildScopeCondition for Drizzle queries. Kept for migration reference. */
export function applyScopeFilter(
    where: Record<string, unknown>,
    filter: ScopeFilter | undefined,
    modelType: 'store' | 'storeId' | 'branchId' = 'branchId'
): void {
    if (!filter) return;
    if (modelType === 'store') {
        if (filter.scopeByStore && filter.storeIds.length > 0) where.id = { in: filter.storeIds };
        else if (filter.branchIds.length > 0) where.branchId = { in: filter.branchIds };
    } else if (modelType === 'storeId') {
        if (filter.scopeByStore && filter.storeIds.length > 0) where.storeId = { in: filter.storeIds };
        else if (filter.branchIds.length > 0) where.branchId = { in: filter.branchIds };
    } else {
        if (filter.branchIds.length > 0) where.branchId = { in: filter.branchIds };
    }
}

/**
 * Check if the current user has access to a specific record based on its branchId/storeId.
 * Returns true if user is admin/superadmin or the record belongs to their accessible scope.
 * Use this on GET /:id, PUT /:id, DELETE /:id routes to prevent cross-store data leaks.
 */
export function ensureScopeAccess(
    record: { branchId?: string | null; storeId?: string | null; tenantId?: string | null },
    req: Request
): boolean {
    if (!req.authUser) return false;
    
    // Super Admins bypass all restrictions
    if (req.authUser.isSuperAdmin) return true;
    
    // System Admins (Tenant Admins) are restricted to their tenant
    const isTenantAdmin = req.authUser.role === 'admin' || req.authUser.permissions.includes('*');
    if (isTenantAdmin) {
        // If the record has a tenantId, it MUST match the admin's tenantId
        if (record.tenantId && record.tenantId !== req.authUser.tenantId) {
            return false;
        }
        return true;
    }

    // Regular users (Store Admins, Staff) must have explicit scope access
    const { accessibleBranchIds, accessibleStoreIds } = req.authUser;

    // Check store-level scope first
    if (record.storeId && accessibleStoreIds.length > 0) {
        return accessibleStoreIds.includes(record.storeId);
    }
    // Fall back to branch-level scope
    if (record.branchId && accessibleBranchIds.length > 0) {
        return accessibleBranchIds.includes(record.branchId);
    }
    // If record has no scope fields at all, allow (backward compat for old data)
    if (!record.storeId && !record.branchId && !record.tenantId) return true;

    return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPER ADMIN MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Middleware to require Super Admin access
 * Super Admin can manage entire system: approve/reject requests, manage all branches
 */
export function requireSuperAdmin() {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            if (!req.authUser) {
                throw ApiError.unauthorized('Not authenticated');
            }

            if (!req.authUser.isSuperAdmin) {
                throw ApiError.forbidden('Super Admin access required');
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Check if user is Super Admin (for conditional logic, not middleware)
 */
export function isSuperAdmin(req: Request): boolean {
    return req.authUser?.isSuperAdmin || false;
}

/**
 * Check if user is Admin (Super Admin or admin role)
 */
export function isAdmin(req: Request): boolean {
    if (!req.authUser) return false;
    return req.authUser.isSuperAdmin || req.authUser.role === 'admin';
}

/**
 * Middleware to require Admin access (Super Admin or admin role)
 * Use this for admin routes that both Super Admin and Admin can access
 */
export function requireAdmin() {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            if (!req.authUser) {
                throw ApiError.unauthorized('Not authenticated');
            }

            if (!req.authUser.isSuperAdmin && req.authUser.role !== 'admin') {
                throw ApiError.forbidden('Admin access required');
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Middleware to require Tenant Admin access (Super Admin, admin, hq_admin, hq_manager, branch_admin, store_owner)
 * roleLevel <= 5. Use this for routes that tenant-level admins need to manage their own staff/roles/branches.
 * Data scoping is enforced by buildTenantCondition / branchFilter — this only controls the role gate.
 */
export function requireTenantAdmin() {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            if (!req.authUser) {
                throw ApiError.unauthorized('Not authenticated');
            }

            if (!req.authUser.isSuperAdmin && req.authUser.roleLevel > 5) {
                throw ApiError.forbidden('Tenant admin access required');
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Middleware to require specific roles
 */
export function requireRoles(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            if (!req.authUser) {
                throw ApiError.unauthorized('Not authenticated');
            }

            // Super Admin always has access
            if (req.authUser.isSuperAdmin) {
                next();
                return;
            }

            if (!roles.includes(req.authUser.role)) {
                throw ApiError.forbidden(`Required roles: ${roles.join(', ')}`);
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// BITMASK PERMISSION MIDDLEWARE (BE-15 — Finding-G)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Middleware factory: require a specific bitmask permission.
 * Usage: requirePerm(P.PRODUCT_CREATE)
 * Super Admin bypasses. Falls back to legacy authorize() check during migration.
 */
export function requirePerm(perm: PermBit) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!req.authUser) {
                throw ApiError.unauthorized();
            }

            // Super Admin bypasses all
            if (req.authUser.isSuperAdmin) {
                next();
                return;
            }

            // Resolve bitmask from cache/DB
            const tenantId = req.authUser.tenantId;
            if (tenantId) {
                const mask = await getUserMask(req.authUser.userId, tenantId);
                if (hasPerm(mask.mask_low, mask.mask_high, perm)) {
                    next();
                    return;
                }
            }

            // Fall back to legacy string permissions during migration
            const userPermissions = req.authUser.permissions;
            if (userPermissions.includes('*')) {
                next();
                return;
            }

            throw ApiError.forbidden('Insufficient permissions');
        } catch (error) {
            next(error);
        }
    };
}
