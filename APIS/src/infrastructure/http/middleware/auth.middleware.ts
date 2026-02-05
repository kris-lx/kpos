// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Authentication Middleware
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '@/config/app.config';
import { ApiError } from './error.middleware';
import { prisma } from '@/config/database.config';

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

// Load user's store access from database
async function loadUserStoreAccess(userId: string): Promise<UserStoreAccess[]> {
    const userStores = await prisma.userStore.findMany({
        where: { userId },
        include: {
            store: { select: { id: true, name: true, isActive: true } },
            branch: { select: { id: true, name: true, isActive: true } }
        }
    });

    return userStores
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

            // Verify user exists and is active with role permissions
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { 
                    id: true, 
                    isActive: true,
                    branchId: true,
                    isSuperAdmin: true,
                    roleRelation: {
                        select: { permissions: true }
                    }
                },
            });

            if (!user || !user.isActive) {
                throw ApiError.unauthorized('User not found or inactive');
            }

            // Load user's store access
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
                permissions: user.roleRelation?.permissions || [],
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

            const userPermissions = req.authUser.permissions;

            // Check if user has any of the required permissions
            const hasPermission = permissions.some((p) =>
                userPermissions.includes(p) || userPermissions.includes('*')
            );

            if (!hasPermission) {
                throw ApiError.forbidden('Insufficient permissions');
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

// New middleware: Filter by accessible branches
export function branchFilter() {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (req.authUser) {
            // Super Admin has access to all branches
            if (req.authUser.isSuperAdmin) {
                // No filter for super admin
                next();
                return;
            }
            
            // Add accessible branch IDs to query if not admin
            const isAdmin = req.authUser.role === 'admin' || req.authUser.permissions.includes('*');
            if (!isAdmin) {
                // Store accessible branch/store IDs for route handlers to use
                (req as any).branchFilter = {
                    branchIds: req.authUser.accessibleBranchIds,
                    storeIds: req.authUser.accessibleStoreIds,
                    activeBranchId: req.authUser.activeBranchId,
                    activeStoreId: req.authUser.activeStoreId
                };
            }
        }
        next();
    };
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
