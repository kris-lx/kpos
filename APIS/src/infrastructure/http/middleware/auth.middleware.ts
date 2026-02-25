// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Authentication Middleware
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '@/config/app.config';
import { ApiError } from './error.middleware';
import { prisma } from '@/config/database.config';
import { cache } from '@/config/redis.config';

export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
    branchId: string;
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
    accessibleStoreIds: string[];
    activeStoreId?: string;
    activeBranchId: string;
    isSuperAdmin: boolean;  // Super Admin flag
}

declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
            authUser?: AuthenticatedUser;
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

// Load user's store access from database (with Redis cache)
async function loadUserStoreAccess(userId: string): Promise<UserStoreAccess[]> {
    const cacheKey = `${CACHE_PREFIX}:stores:${userId}`;
    const cached = await cache.get<UserStoreAccess[]>(cacheKey);
    if (cached) return cached;

    const userStores = await prisma.userStore.findMany({
        where: { userId },
        include: {
            store: { select: { id: true, name: true, isActive: true } },
            branch: { select: { id: true, name: true, isActive: true } }
        }
    });

    const result = userStores
        .filter(us => us.store.isActive && us.branch.isActive)
        .map(us => ({
            storeId: us.storeId,
            branchId: us.branchId,
            storeName: us.store.name,
            branchName: us.branch.name,
            canRead: us.canRead,
            canWrite: us.canWrite,
            canDelete: us.canDelete,
            canManage: us.canManage,
            isDefault: us.isDefault
        }));

    await cache.set(cacheKey, result, CACHE_TTL);
    return result;
}

// Cached auth user data (user + permissions) — skips User DB lookup per request
interface CachedAuthUser {
    isActive: boolean;
    branchId: string;
    isSuperAdmin: boolean;
    permissions: string[];
    role: string;
    roleId: string | null;
}

async function loadCachedAuthUser(userId: string): Promise<CachedAuthUser | null> {
    const cacheKey = `${CACHE_PREFIX}:auth:${userId}`;
    const cached = await cache.get<CachedAuthUser>(cacheKey);
    if (cached) return cached;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            isActive: true,
            branchId: true,
            isSuperAdmin: true,
            permissions: true,
            role: true,
            roleId: true,
            roleRelation: {
                select: { permissions: true }
            }
        },
    });

    if (!user || !user.isActive) return null;

    const rolePerms = user.roleRelation?.permissions || [];
    const userPerms = user.permissions || [];

    const result: CachedAuthUser = {
        isActive: user.isActive,
        branchId: user.branchId,
        isSuperAdmin: user.isSuperAdmin,
        permissions: [...new Set([...rolePerms, ...userPerms])],
        role: user.role,
        roleId: user.roleId,
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
            const decoded = jwt.verify(token, jwtConfig.secret) as JwtPayload;

            // Load user from Redis cache (falls back to DB on miss)
            const user = await loadCachedAuthUser(decoded.userId);

            if (!user) {
                throw ApiError.unauthorized('User not found or inactive');
            }

            const mergedPermissions = user.permissions;

            // Load user's store access (Redis-cached)
            const accessibleStores = await loadUserStoreAccess(decoded.userId);
            
            // Get unique branch and store IDs
            const accessibleBranchIds = [...new Set(accessibleStores.map(s => s.branchId))];
            const accessibleStoreIds = accessibleStores.map(s => s.storeId);
            
            // If user has no store assignments, give access to their default branch
            if (accessibleBranchIds.length === 0 && user.branchId) {
                accessibleBranchIds.push(user.branchId);
            }

            // Get active store from header or use default
            const activeStoreHeader = req.headers['x-active-store'] as string | undefined;
            const defaultStore = accessibleStores.find(s => s.isDefault);
            const activeStoreId = activeStoreHeader && accessibleStoreIds.includes(activeStoreHeader) 
                ? activeStoreHeader 
                : defaultStore?.storeId;

            // Set active branch from active store or user's default branch
            const activeStore = accessibleStores.find(s => s.storeId === activeStoreId);
            const activeBranchId = activeStore?.branchId || user.branchId;

            req.user = decoded;
            req.authUser = {
                ...decoded,
                permissions: mergedPermissions,
                role: user.role,
                accessibleStores,
                accessibleBranchIds,
                accessibleStoreIds,
                activeStoreId,
                activeBranchId,
                isSuperAdmin: user.isSuperAdmin || false
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
                        const dbRules = await prisma.roleRule.findMany({
                            where: { roleId },
                            include: { rule: { select: { name: true, module: true, isActive: true } } },
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
    branchIds: string[];
    storeIds: string[];
    activeBranchId: string;
    activeStoreId?: string;
    /** true when user is scoped by store (store_owner with UserStore entries) */
    scopeByStore: boolean;
}

// New middleware: Filter by accessible branches/stores
export function branchFilter() {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (req.authUser) {
            // Super Admin and admin role have access to all branches (no branch restriction)
            const isSuperOrAdmin = req.authUser.isSuperAdmin || req.authUser.role === 'admin' || req.authUser.permissions.includes('*');
            if (!isSuperOrAdmin) {
                const hasStoreScope = req.authUser.accessibleStoreIds.length > 0;
                // Store accessible branch/store IDs for route handlers to use
                (req as any).branchFilter = {
                    branchIds: req.authUser.accessibleBranchIds,
                    storeIds: req.authUser.accessibleStoreIds,
                    activeBranchId: req.authUser.activeBranchId,
                    activeStoreId: req.authUser.activeStoreId,
                    scopeByStore: hasStoreScope,
                } satisfies ScopeFilter;
            }
        }
        next();
    };
}

/**
 * Helper: apply scope filter to a Prisma where clause.
 * - 'store' model: filters by store.id ∈ storeIds (or branchId fallback)
 * - 'storeId' model (Customer, etc.): filters by storeId ∈ storeIds
 * - 'branchId' model (Product, Inventory, Transaction, etc.): filters by branchId ∈ branchIds
 */
export function applyScopeFilter(
    where: Record<string, unknown>,
    filter: ScopeFilter | undefined,
    modelType: 'store' | 'storeId' | 'branchId' = 'branchId'
): void {
    if (!filter) return;

    if (modelType === 'store') {
        // For Store model — filter by store's own id
        if (filter.scopeByStore && filter.storeIds.length > 0) {
            where.id = { in: filter.storeIds };
        } else if (filter.branchIds.length > 0) {
            where.branchId = { in: filter.branchIds };
        }
    } else if (modelType === 'storeId') {
        // For models with storeId field (Customer, etc.)
        if (filter.scopeByStore && filter.storeIds.length > 0) {
            where.storeId = { in: filter.storeIds };
        } else if (filter.branchIds.length > 0) {
            where.branchId = { in: filter.branchIds };
        }
    } else {
        // For models with only branchId (Product, Inventory, Transaction, etc.)
        if (filter.branchIds.length > 0) {
            where.branchId = { in: filter.branchIds };
        }
    }
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
