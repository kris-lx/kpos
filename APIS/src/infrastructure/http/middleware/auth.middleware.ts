// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Authentication Middleware
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '@/config/app.config';
import { isSessionExpired } from '@/shared/session-cap';
import { ApiError } from './error.middleware';
import { db } from '@/config/database.config';
import { cache } from '@/config/redis.config';
import { eq, inArray, and, or, like, isNull, sql, type SQL } from 'drizzle-orm';
import { users, userStores, tenants, roles, branches, stores } from '@/db/schema/tables';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { hasPerm, permissionsToMask, maskToStrings, stringsToMask, legacyPermTobit, type PermBit } from '@/infrastructure/permissions';
import { getUserMask, invalidateUserPermissions } from '@/infrastructure/services/permission.service';
import { runWithTenantContext } from '@/shared/tenant-context';

/** Legacy JWT payload shape — kept for backward compat on req.user */
export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
    branchId: string;
    tenantId: string | null;
}

/**
 * 6-level role hierarchy used for branch/store visibility scoping and
 * role-assignment enforcement. Lower number = broader access. A caller can
 * only assign roles with a HIGHER level number.
 * Hierarchy is Tenant → Store → Branch (a store has many branches):
 *   1 = platform layer   → all tenants / all stores / all branches
 *   2 = merchant_owner   → all stores + branches within tenant (full control)
 *   3 = merchant_manager / accountant → a store subtree (that store + any
 *       child stores via storePath) — sees every branch under those stores
 *   4 = supervisor       → a branch subtree WITHIN one store (own branch +
 *       any child branches via branchPath) — mechanism unchanged from
 *       before the store/branch reversal, now implicitly scoped to one store
 *   5 = senior_cashier / cashier → POS only, exact branch/store grants
 *   6 = inventory_staff / kitchen_staff / waiter → specialist roles
 */
export const ROLE_LEVELS: Record<string, number> = {
    // Level 1 — Platform
    platform_super_admin: 1,
    platform_support:     1,
    platform_auditor:     1,
    super_admin:          1,
    admin:                1,
    // Level 2 — Merchant Owner (legacy aliases)
    merchant_owner:  2,
    hq_admin:        2,
    store_owner:     2,
    tenant_admin:    2,
    // Level 3 — Tenant Management
    merchant_manager: 3,
    accountant:       3,
    hq_manager:       3,
    // Level 4 — Branch Supervisor (legacy aliases)
    supervisor:      4,
    branch_admin:    4,
    branch_manager:  4,
    store_manager:   4,
    store_admin:     4,
    manager:         4,
    // Level 5 — Cashier
    senior_cashier: 5,
    cashier:        5,
    staff:          5,
    // Level 6 — Specialist
    inventory_staff: 6,
    kitchen_staff:   6,
    waiter:          6,
};

export function getRoleLevel(role: string, isSuperAdmin: boolean): number {
    if (isSuperAdmin) return 1;
    return ROLE_LEVELS[role] ?? 7;
}

/**
 * Returns true if the user can access branches beyond their own. Not called
 * elsewhere in the backend today (the real enforcement is
 * buildBranchIdScope/ensureScopeAccess, which use exact resolved branchIds
 * rather than path strings) — kept as a best-effort path-based helper.
 * Level 3 (store-tree HQ) isn't meaningfully expressible via a single
 * branch_path prefix (their scope spans however many independent
 * branch-trees exist across every store in their subtree), so it falls back
 * to the same prefix check as level 4; callers needing precise level-3
 * access should check membership in `accessibleBranchIds` instead.
 */
export function canAccessBranch(user: AuthenticatedUser, targetBranchPath: string): boolean {
    if (user.isSuperAdmin || user.roleLevel <= 2) return true;
    const paths = user.accessibleBranchPaths || [];
    if (user.roleLevel <= 4) {
        // Store-tree HQ / branch supervisor: own branch + all descendants via materialized path.
        return paths.some(p => targetBranchPath === p || targetBranchPath.startsWith(p + '.'));
    }
    // Branch-level user: own branch only. branch_path is code-based, so match the
    // exact path (the old `accessibleBranchIds.includes(uuid-in-path)` never matched).
    return paths.some(p => targetBranchPath === p);
}

/** Returns true if the user can access stores beyond their own (level 3 store-tree HQ or above). */
export function canAccessStore(user: AuthenticatedUser, targetStorePath: string): boolean {
    if (user.isSuperAdmin || user.roleLevel <= 2) return true;
    const paths = user.accessibleStorePaths || [];
    if (user.roleLevel === 3) {
        // Store-tree HQ: their store(s) + all descendant stores via materialized path.
        return paths.some(p => targetStorePath === p || targetStorePath.startsWith(p + '.'));
    }
    // Level 4 and below: confined to whichever single store their branch belongs to.
    return paths.some(p => targetStorePath === p);
}

/** Identity-only JWT payload (BE-02) */
interface IdentityJwtPayload {
    sub: string;
    tid: string;
    bid: string;
    scope: string;
    jti: string;
    sst?: number; // session start (epoch seconds of original login) — absolute session cap
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
    /** Null = whole-store grant (every branch under this store); set = narrowed to one specific branch. */
    branchId: string | null;
    storeName: string;
    branchName: string | null;
    storeLogo: string | null;
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
    /** Store-tree materialized paths (stores.storePath) for level-3 store HQ scope. */
    accessibleStorePaths: string[];
    accessibleStoreIds: string[];
    activeStoreId?: string;
    activeBranchId: string;
    activeBranchPath?: string;
    /** Materialized path of the active store (mirrors activeBranchPath). */
    activeStorePath?: string;
    /** User's home/anchor store (mirrors branchId from JwtPayload). */
    storeId: string;
    isSuperAdmin: boolean;
    tenantId: string | null;
    /** Numeric role level (1=system_admin … 7=staff). Lower = broader access. */
    roleLevel: number;
    /** Bitmask low 64 bits (decimal string) for O(1) permission checks via requirePerm() */
    maskLow: string;
    /** Bitmask high 64 bits (decimal string) for O(1) permission checks via requirePerm() */
    maskHigh: string;
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
const CACHE_TTL = 900; // 15 minutes in seconds (invalidated explicitly on role/store changes)
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
 * Load branch_path for a single branch (Redis-cached, DB fallback).
 * Returns undefined if branch not found.
 */
async function loadBranchPath(branchId: string): Promise<string | undefined> {
    const cacheKey = `${CACHE_PREFIX}:branchpath:${branchId}`;
    const cached = await cache.get<string>(cacheKey);
    if (cached) return cached;

    const row = await db.query.branches.findFirst({
        where: eq(branches.id, branchId),
        columns: { branchPath: true },
    });
    const path = row?.branchPath || undefined;
    if (path) await cache.set(cacheKey, path, CACHE_TTL);
    return path;
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

/** Load store_path for a single store (Redis-cached, DB fallback). Mirrors loadBranchPath. */
async function loadStorePath(storeId: string): Promise<string | undefined> {
    const cacheKey = `${CACHE_PREFIX}:storepath:${storeId}`;
    const cached = await cache.get<string>(cacheKey);
    if (cached) return cached;

    const row = await db.query.stores.findFirst({
        where: eq(stores.id, storeId),
        columns: { storePath: true },
    });
    const path = row?.storePath || undefined;
    if (path) await cache.set(cacheKey, path, CACHE_TTL);
    return path;
}

/**
 * Load distinct store_paths for all stores the user has a broad (whole-store)
 * grant on. Mirrors loadAccessibleBranchPaths, one tier up.
 */
async function loadAccessibleStorePaths(
    userId: string,
    storeIds: string[],
): Promise<string[]> {
    if (!storeIds.length) return [];
    const cacheKey = `${CACHE_PREFIX}:storepaths:${userId}`;
    const cached = await cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const rows = await db.query.stores.findMany({
        where: inArray(stores.id, storeIds),
        columns: { storePath: true },
    });
    const paths = [...new Set(rows.map(r => r.storePath).filter(Boolean) as string[])];
    await cache.set(cacheKey, paths, CACHE_TTL);
    return paths;
}

/**
 * Expand a set of "whole store" grants (userStores rows with branchId=NULL)
 * into every branch id currently under those stores. Redis-cached per store
 * set — store membership changes rarely enough that the normal CACHE_TTL
 * (and explicit invalidation on branch create/move) is sufficient.
 */
async function loadBranchIdsForStores(storeIds: string[]): Promise<string[]> {
    if (!storeIds.length) return [];
    const cacheKey = `${CACHE_PREFIX}:storebranches:${[...storeIds].sort().join(',')}`;
    const cached = await cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const rows = await db.query.branches.findMany({
        where: and(inArray(branches.storeId, storeIds), eq(branches.isActive, true)),
        columns: { id: true },
    });
    const ids = rows.map(r => r.id);
    await cache.set(cacheKey, ids, CACHE_TTL);
    return ids;
}

// Load user's store access from database (with Redis cache)
async function loadUserStoreAccess(userId: string, tenantId: string | null): Promise<UserStoreAccess[]> {
    const cacheKey = `${CACHE_PREFIX}:stores:${userId}`;
    const cached = await cache.get<UserStoreAccess[]>(cacheKey);
    if (cached) return cached;

    // user_stores/stores/branches are all RLS-protected tenant tables — the
    // plain `db` handle has no GUC context set here (this runs in JWT
    // middleware, before any req.tx reservation), so under FORCE ROW LEVEL
    // SECURITY this previously always returned zero rows for every real
    // (non-null-tenant) user_stores row, regardless of what was actually
    // assigned. Every non-admin user with genuine store access still got
    // redirected to /store-request as if they had none. Same bug class
    // fixed elsewhere this session (restaurant orders, e-menu, backup).
    const userStoreRows = tenantId
        ? await runWithTenantContext(tenantId, (tx) => tx.query.userStores.findMany({
            where: eq(userStores.userId, userId),
            with: { store: true, branch: true },
        }))
        : await db.query.userStores.findMany({
            where: eq(userStores.userId, userId),
            with: { store: true, branch: true },
        });

    // branchId is nullable now (NULL = whole-store grant); only require the
    // branch to exist/be active when the grant was actually narrowed to one.
    const result = userStoreRows
        .filter(us => us.store != null && us.store.isActive && (us.branchId === null || (us.branch != null && us.branch.isActive)))
        .map(us => ({
            storeId: us.storeId,
            branchId: us.branchId,
            storeName: us.store.name,
            branchName: us.branch?.name ?? null,
            storeLogo: us.store.logo ?? null,
            canRead: us.canRead,
            canWrite: us.canWrite,
            canDelete: us.canDelete,
            canManage: us.canManage,
            isDefault: us.isDefault,
        }));

    await cache.set(cacheKey, result, CACHE_TTL);
    return result;
}

// Cached auth user data (user + permissions + bitmask) — skips User DB lookup per request
interface CachedAuthUser {
    isActive: boolean;
    email: string;
    branchId: string;
    storeId: string;
    tenantId: string | null;
    isSuperAdmin: boolean;
    permissions: string[];
    role: string;
    roleId: string | null;
    roleLevel: number;
    // Bitmask representation of permissions (BigInt stored as decimal strings for JSON compat)
    maskLow: string;
    maskHigh: string;
}

async function loadCachedAuthUser(userId: string): Promise<CachedAuthUser | null> {
    const cacheKey = `${CACHE_PREFIX}:auth:${userId}`;
    const cached = await cache.get<CachedAuthUser>(cacheKey);
    if (cached) return cached;

    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    });

    if (!user || !user.isActive) return null;

    // roles is an RLS-protected tenant table (FORCE ROW LEVEL SECURITY) — the
    // plain `db` handle used above has no GUC context (this runs in JWT
    // middleware, before any req.tx reservation). Without scoping this lookup
    // to the user's own tenant, every tenant-scoped custom role (the normal
    // case — only super-admin-created roles have tenantId=null) silently
    // resolves to zero permissions here. Same bug class as
    // loadUserStoreAccess above; that one already had this fix.
    //
    // Deliberately NOT falling back to a name-based role lookup or the
    // hardcoded SYSTEM_ROLE_PERMISSIONS map here: permissions come ONLY from
    // an actual `roles` row via `user.roleId`. Resolving/validating a role by
    // NAME happens once, at assignment time (staff create/update — see
    // resolveAssignableRole below), where it can be checked against what the
    // assigning caller is actually allowed to grant. Doing it again here,
    // silently, on every request, meant a user could get a full hardcoded
    // permission set just by having a `role` string that happened to match
    // one of ~20 built-in names — with no real `roles` row ever created or
    // reviewed by any admin for that tenant.
    const userPerms = user.permissions || [];
    let rolePerms: string[] = [];

    const loadRolePerms = async (tx: typeof db): Promise<string[]> => {
        if (!user.roleId) return [];
        const roleRow = await tx.query.roles.findFirst({
            where: eq(roles.id, user.roleId),
            columns: { permissions: true },
        });
        return (roleRow?.permissions as string[]) || [];
    };

    rolePerms = user.tenantId && !user.isSuperAdmin
        ? await runWithTenantContext(user.tenantId, (tx) => loadRolePerms(tx as unknown as typeof db))
        : await loadRolePerms(db);

    const mergedPermissions = [...new Set([...rolePerms, ...userPerms])];
    // Compute bitmask from merged permission strings — O(n) once, then O(1) per check
    const mask = permissionsToMask(mergedPermissions);
    const { low: maskLow, high: maskHigh } = maskToStrings(mask);

    const result: CachedAuthUser = {
        isActive: user.isActive,
        email: user.email,
        branchId: user.branchId || '',
        storeId: user.storeId || '',
        tenantId: user.tenantId || null,
        isSuperAdmin: user.isSuperAdmin,
        permissions: mergedPermissions,
        role: user.role,
        roleId: user.roleId,
        roleLevel: getRoleLevel(user.role, user.isSuperAdmin),
        maskLow,
        maskHigh,
    };

    await cache.set(cacheKey, result, CACHE_TTL);
    return result;
}

export interface ResolvedRole {
    id: string;
    name: string;
    roleLevel: number;
}

/**
 * Resolves a role name/id to an actual, visible-to-the-caller `roles` row at
 * assignment time (staff create/update) — this is the ONLY place a role name
 * string gets turned into permissions. Returns null if nothing matches,
 * which callers must treat as a rejection (400), never a silent grant.
 *
 * Visibility, in precedence order:
 *   - Superadmin callers: any role, anywhere.
 *   - Tenant-level callers (roleLevel <= 2): any role in their own tenant
 *     (tenant-wide or any branch-private role), or a global (tenantId=null)
 *     system-template role.
 *   - Branch-level callers (roleLevel > 2): only their own tenant's
 *     tenant-wide roles, their OWN branch's branch-private roles, or a
 *     global role — never another branch's private role.
 */
export async function resolveAssignableRole(
    // Callers pass `req.tx ?? globalDb` — a union of the reserved-connection
    // handle and the pooled singleton, which don't structurally share the
    // `$client` field `typeof db` would require. Matches the `db: any`
    // convention already used by assignUserToStores for the same reason.
    dbHandle: any,
    params: {
        roleId?: string;
        roleName?: string;
        callerTenantId: string | null;
        callerBranchId?: string | null;
        callerRoleLevel: number;
        callerIsSuperAdmin: boolean;
    }
): Promise<ResolvedRole | null> {
    const { roleId, roleName, callerTenantId, callerBranchId, callerRoleLevel, callerIsSuperAdmin } = params;
    if (!roleId && !roleName) return null;

    // Takes the CALLER'S OWN db handle (req.tx or globalDb) rather than
    // opening a new transaction/connection here. req.tx already has RLS
    // tenant context set on a reserved connection for the whole request
    // (see withTenantTx middleware) — opening a second transaction via
    // runWithTenantContext competed for the same capped connection pool
    // that the reserved req.tx connection was already holding open, and
    // under concurrent staff-creation load deadlocked the pool entirely
    // (every connection reserved, none left for the nested transaction).
    const isVisible = (role: { tenantId: string | null; branchId: string | null }): boolean => {
        if (callerIsSuperAdmin) return true;
        if (role.tenantId === null) return true; // global system template
        if (role.tenantId !== callerTenantId) return false;
        if (callerRoleLevel <= 2) return true; // tenant-level: sees all of their tenant's roles
        return role.branchId === null || role.branchId === callerBranchId;
    };

    let row: { id: string; name: string; tenantId: string | null; branchId: string | null } | undefined;
    if (roleId) {
        row = await dbHandle.query.roles.findFirst({
            where: eq(roles.id, roleId),
            columns: { id: true, name: true, tenantId: true, branchId: true },
        });
        if (row && !isVisible(row)) row = undefined;
    } else {
        if (callerTenantId) {
            const tenantRow = await dbHandle.query.roles.findFirst({
                where: and(eq(roles.name, roleName!), eq(roles.tenantId, callerTenantId)),
                columns: { id: true, name: true, tenantId: true, branchId: true },
            });
            if (tenantRow && isVisible(tenantRow)) row = tenantRow;
        }
        if (!row) {
            const globalRow = await dbHandle.query.roles.findFirst({
                where: and(eq(roles.name, roleName!), isNull(roles.tenantId)),
                columns: { id: true, name: true, tenantId: true, branchId: true },
            });
            if (globalRow && isVisible(globalRow)) row = globalRow;
        }
    }

    if (!row) return null;
    return { id: row.id, name: row.name, roleLevel: getRoleLevel(row.name, false) };
}

// Untyped `Request`/`Response` here would pin this middleware's type params to the
// library defaults (P = ParamsDictionary) — since Express 5's ParamsDictionary widened
// to `string | string[]`, mixing that into a route's handler array (authenticate, authorize(...),
// handler) forces every handler's req.params in that route to the widened type too.
// `Request<any, ...>` keeps this middleware inert for inference, letting each route's own
// literal path type req.params correctly.
export async function authenticate(
    req: Request<any, any, any, any>,
    res: Response<any>,
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
            const tenantId = (raw.tid || raw.tenantId) || null; // null not '' — empty string breaks UUID columns
            const branchId = raw.bid || raw.branchId || '';
            const jti = raw.jti;

            // Absolute session cap (defense-in-depth): even a still-unexpired
            // access token is rejected once 20h have passed since original login.
            // Forces the client's refresh-then-logout path even if the access
            // token's own TTL hasn't run out yet.
            const sessionStart = raw.sst ?? raw.iat;
            if (sessionStart && isSessionExpired(sessionStart, jwtConfig.sessionAbsoluteMs)) {
                throw ApiError.unauthorized('Session expired');
            }

            // BE-10 Step 2: Check jti revocation in Redis
            if (jti) {
                const revoked = await cache.get<string>(`revoked:${jti}`);
                if (revoked) {
                    throw ApiError.unauthorized('Token has been revoked');
                }
            }

            // BE-10 Step 3: Load user + store access in parallel (both Redis-cached)
            const [user, accessibleStores] = await Promise.all([
                loadCachedAuthUser(userId),
                loadUserStoreAccess(userId, tenantId),
            ]);

            if (!user) {
                throw ApiError.unauthorized('User not found or inactive');
            }

            const mergedPermissions = user.permissions;

            // Each userStores row is either a "whole store" grant (branchId
            // NULL — every branch under that store) or narrowed to one
            // specific branch. Expand whole-store grants to their current
            // branch id set so exact-list scoping (roleLevel 5-7) still
            // works the same way it always has.
            const narrowedBranchIds = accessibleStores.filter(s => s.branchId).map(s => s.branchId as string);
            const wholeStoreIds = [...new Set(accessibleStores.filter(s => !s.branchId).map(s => s.storeId))];
            const expandedBranchIds = await loadBranchIdsForStores(wholeStoreIds);

            const accessibleBranchIds = [...new Set([...narrowedBranchIds, ...expandedBranchIds])];
            const accessibleStoreIds = [...new Set(accessibleStores.map(s => s.storeId))];

            // If user has no store assignments, fall back to their single-value anchors
            if (accessibleBranchIds.length === 0 && user.branchId) {
                accessibleBranchIds.push(user.branchId);
            }
            if (accessibleStoreIds.length === 0 && user.storeId) {
                accessibleStoreIds.push(user.storeId);
            }

            // Get active store from header or use default
            const activeStoreHeader = req.headers['x-active-store'] as string | undefined;
            const defaultStore = accessibleStores.find(s => s.isDefault);
            const activeStoreId = activeStoreHeader && accessibleStoreIds.includes(activeStoreHeader)
                ? activeStoreHeader
                : (defaultStore?.storeId || user.storeId || undefined);

            // Active branch: a narrowed grant matching the active store, else the
            // user's own branchId anchor, else the JWT's branchId claim.
            const activeStoreGrant = accessibleStores.find(s => s.storeId === activeStoreId && s.branchId);
            const activeBranchId = activeStoreGrant?.branchId || user.branchId || branchId;

            // Load branch/store paths in parallel (all Redis-cached after first hit)
            const [accessibleBranchPaths, accessibleStorePaths, activeBranchPath, activeStorePath] = await Promise.all([
                loadAccessibleBranchPaths(userId, accessibleBranchIds),
                loadAccessibleStorePaths(userId, accessibleStoreIds),
                activeBranchId ? loadBranchPath(activeBranchId) : Promise.resolve(undefined),
                activeStoreId ? loadStorePath(activeStoreId) : Promise.resolve(undefined),
            ]);

            // Resolve final tenantId — prefer DB value, fall back to JWT claim, null for superadmin
            const resolvedTenantId = user.tenantId || tenantId || null;

            // Build legacy JwtPayload for backward compat on req.user
            const legacyPayload: JwtPayload = {
                userId,
                email: user.email,
                role: user.role,
                branchId: activeBranchId,
                tenantId: resolvedTenantId,
            };

            req.user = legacyPayload;
            req.authUser = {
                ...legacyPayload,
                permissions: mergedPermissions,
                role: user.role,
                tenantId: resolvedTenantId,
                accessibleStores,
                accessibleBranchIds,
                accessibleBranchPaths,
                accessibleStorePaths,
                accessibleStoreIds,
                activeStoreId,
                activeBranchId,
                activeBranchPath,
                activeStorePath,
                storeId: user.storeId || '',
                isSuperAdmin: user.isSuperAdmin || false,
                roleLevel: user.roleLevel,
                maskLow: user.maskLow ?? '0',
                maskHigh: user.maskHigh ?? '0',
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
// PERMISSION MIDDLEWARE  (bitmask-primary, string-array fallback)
// ═══════════════════════════════════════════════════════════════════════════

export function authorize(...permStrings: string[]) {
    return (
        req: Request<any, any, any, any>,
        res: Response<any>,
        next: NextFunction
    ): void => {
        try {
            if (!req.user || !req.authUser) {
                throw ApiError.unauthorized();
            }

            // Super Admin bypasses all permission checks
            if (req.authUser.isSuperAdmin) {
                next();
                return;
            }

            // ── Primary: bitmask check (O(1) bitwise AND, no array scan) ──────
            const maskLow  = BigInt(req.authUser.maskLow  || '0');
            const maskHigh = BigInt(req.authUser.maskHigh || '0');
            const hasMask  = maskLow !== 0n || maskHigh !== 0n;

            if (hasMask) {
                const passedBitmask = permStrings.some(p => {
                    const bit = legacyPermTobit(p);
                    return bit ? hasPerm(maskLow, maskHigh, bit) : false;
                });
                if (passedBitmask) { next(); return; }
            }

            // ── Fallback: string array (covers '*' wildcard + unmapped strings) ─
            const userPermissions = req.authUser.permissions;
            const passedString = permStrings.some((p) => {
                if (userPermissions.includes('*')) return true;
                if (userPermissions.includes(p)) return true;
                if (p.endsWith(':read')  && userPermissions.includes(p.replace(':read',  ':view'))) return true;
                if (p.endsWith(':view')  && userPermissions.includes(p.replace(':view',  ':read'))) return true;
                return false;
            });

            if (passedString) { next(); return; }

            throw ApiError.forbidden('Insufficient permissions');
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
    tenantId: string | null;
    branchIds: string[];
    storeIds: string[];
    activeBranchId: string;
    activeStoreId?: string;
    /** true when user is scoped by explicit userStores grants (not just their single-value anchor) */
    scopeByStore: boolean;
    /**
     * Branch paths for level-4 users (branch-tree supervisor, within one store).
     * When set, route handlers should use path-prefix matching instead of exact branchId matching.
     * e.g. "root.hq" matches all branches where branchPath starts with "root.hq"
     */
    branchPaths?: string[];
    /**
     * Store paths for level-3 users (store-tree HQ — a subtree of stores,
     * granting every branch under each store in that subtree).
     * e.g. "root.flagship" matches all stores where storePath starts with "root.flagship"
     */
    storePaths?: string[];
    /** Numeric role level, copied from authUser.roleLevel */
    roleLevel: number;
}

// New middleware: Filter by accessible stores/branches
export function branchFilter() {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (req.authUser) {
            const { isSuperAdmin, roleLevel } = req.authUser;

            if (!isSuperAdmin) {
                let branchIds = req.authUser.accessibleBranchIds;
                let storeIds = req.authUser.accessibleStoreIds;
                const hasStoreScope = storeIds.length > 0;

                // Level 1-2 (platform/tenant owner): tenant-only scope, no restriction
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
                } else if (roleLevel === 3) {
                    // Level 3 (store-tree HQ): path-prefix scope over a subtree of
                    // stores — grants every branch under each store in that subtree.
                    if (storeIds.length === 0 && req.authUser.storeId) {
                        storeIds = [req.authUser.storeId];
                    }
                    req.branchFilter = {
                        tenantId: req.authUser.tenantId,
                        branchIds,
                        storeIds,
                        activeBranchId: req.authUser.activeBranchId,
                        activeStoreId: req.authUser.activeStoreId,
                        scopeByStore: hasStoreScope,
                        storePaths: req.authUser.accessibleStorePaths,
                        roleLevel,
                    };
                } else if (roleLevel === 4) {
                    // Level 4 (branch-tree supervisor): path-prefix scope for child
                    // branches, implicitly confined within their own store.
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
                    // Level 5-7 (cashier, specialist staff): exact branch/store scope
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
 * - 'store' model: the `stores` table itself — filters by store.id ∈ storeIds
 * - 'storeId' model (Customer, etc.): filters by branchId ∈ branchIds first
 *   (narrower/authoritative), falling back to storeId ∈ storeIds
 * - 'branchId' model (Product, Inventory, Transaction, etc.): filters by branchId ∈ branchIds
 *
 * Pass column refs from the target table, e.g. buildScopeCondition(filter, { id: stores.id }, 'store')
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

    // Branch/Store scoping. Since the store/branch hierarchy reversal (store
    // is now the broad tier, branch the narrow/operational one), branchId is
    // the authoritative, narrower filter wherever both columns exist —
    // storeId is only a fallback for callers with a broad store-level grant
    // and no narrowed branch list at all (e.g. a level-3 store-tree HQ user
    // whose exact branchIds weren't pre-expanded).
    if (modelType === 'store') {
        // The `stores` table itself — no longer has a branchId column at all;
        // scope by storeIds (see buildStoreIdScope for path-prefix scoping).
        if (filter.scopeByStore && filter.storeIds.length > 0 && columns.id) {
            conditions.push(inArray(columns.id, filter.storeIds));
        }
    } else if (modelType === 'storeId') {
        if (filter.branchIds.length > 0 && columns.branchId) {
            conditions.push(inArray(columns.branchId, filter.branchIds));
        } else if (filter.scopeByStore && filter.storeIds.length > 0 && columns.storeId) {
            conditions.push(inArray(columns.storeId, filter.storeIds));
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

    const { roleLevel = 7, branchPaths, storePaths, branchIds } = filter;

    // Tenant/system admins: no branch restriction
    if (roleLevel <= 2) return undefined;

    // Level 3 (store-tree HQ): every branch under any store in their store
    // subtree. Parameterized sub-select, same safe pattern as the level-4
    // branch below.
    if (roleLevel === 3 && storePaths && storePaths.length > 0) {
        const pathConds: SQL[] = storePaths.map(
            (p) => sql`(${stores.storePath} = ${p} OR ${stores.storePath} LIKE ${p + '.%'})`
        );
        const whereClause = pathConds.length === 1 ? pathConds[0] : sql.join(pathConds, sql` OR `);
        return sql`${branchIdColumn} IN (SELECT id FROM branches WHERE store_id IN (SELECT id FROM stores WHERE ${whereClause}))`;
    }

    // Level 4 (branch-tree supervisor): path-prefix sub-select against
    // branches table, within their own store.
    // Parameterized (matches buildBranchPathScope's safe pattern) — this used
    // to build the WHERE clause via manual quote-escaping + sql.raw(), which
    // is correct today only because branches.branchPath happens to be
    // escaped consistently, but is fragile: branchPath is derived from
    // branches.code, a plain user-supplied field with no format validation
    // (see branches/presentation/routes.ts) — any future edit to this
    // escaping logic, or a code path that bypasses it, would be a real SQL
    // injection. Parameterized bind values remove the risk entirely.
    if (roleLevel === 4 && branchPaths && branchPaths.length > 0) {
        const pathConds: SQL[] = branchPaths.map(
            (p) => sql`(${branches.branchPath} = ${p} OR ${branches.branchPath} LIKE ${p + '.%'})`
        );
        const whereClause = pathConds.length === 1 ? pathConds[0] : sql.join(pathConds, sql` OR `);
        return sql`${branchIdColumn} IN (SELECT id FROM branches WHERE ${whereClause})`;
    }

    // Branch-level (5-7), or level 3-4 with no path scope resolved: exact IN list
    if (branchIds.length > 0) {
        return inArray(branchIdColumn, branchIds);
    }

    return undefined;
}

/**
 * Store-tree equivalent of buildBranchIdScope — scopes a `storeId` (or the
 * `stores` table's own `id`) column by a level-3 user's store subtree, or an
 * exact storeIds list otherwise. Use this for the `stores` table itself, or
 * any other table that should be scoped at the store tier rather than the
 * branch tier.
 */
export function buildStoreIdScope(
    filter: ScopeFilter | undefined,
    storeIdColumn: PgColumn
): SQL | undefined {
    if (!filter) return undefined;

    const { roleLevel = 7, storePaths, storeIds } = filter;

    // Tenant/system admins: no store restriction
    if (roleLevel <= 2) return undefined;

    if (roleLevel === 3 && storePaths && storePaths.length > 0) {
        const pathConds: SQL[] = storePaths.map(
            (p) => sql`(${stores.storePath} = ${p} OR ${stores.storePath} LIKE ${p + '.%'})`
        );
        const whereClause = pathConds.length === 1 ? pathConds[0] : sql.join(pathConds, sql` OR `);
        return sql`${storeIdColumn} IN (SELECT id FROM stores WHERE ${whereClause})`;
    }

    if (storeIds.length > 0) {
        return inArray(storeIdColumn, storeIds);
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

/**
 * Store-path scope condition, mirroring buildBranchPathScope one tier up —
 * use on the `stores` table's own `store_path` column for level-3 users.
 */
export function buildStorePathScope(
    req: Request,
    storePathColumn: PgColumn
): SQL | undefined {
    if (!req.authUser) return undefined;
    if (req.authUser.isSuperAdmin) return undefined;
    const paths = req.authUser.accessibleStorePaths || [];
    if (paths.length === 0) return undefined;

    const conds: SQL[] = paths.map(
        (p) => sql`(${storePathColumn} = ${p} OR ${storePathColumn} LIKE ${p + '.%'})`
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
    
    // Tenant Admins (role level ≤ 2) are restricted to their own tenant
    const isTenantAdmin = getRoleLevel(req.authUser.role, req.authUser.isSuperAdmin) <= 2 || req.authUser.permissions.includes('*');
    if (isTenantAdmin) {
        // If the record has a tenantId, it MUST match the admin's tenantId
        if (record.tenantId && record.tenantId !== req.authUser.tenantId) {
            return false;
        }
        return true;
    }

    // Regular users (Store Admins, Staff) must have explicit scope access.
    // Branch is now the narrower/authoritative field (a branch belongs to
    // exactly one store) — check it first, falling back to the broader
    // store-level scope only when the record has no branchId at all.
    const { accessibleBranchIds, accessibleStoreIds } = req.authUser;

    if (record.branchId && accessibleBranchIds.length > 0) {
        return accessibleBranchIds.includes(record.branchId);
    }
    if (record.storeId && accessibleStoreIds.length > 0) {
        return accessibleStoreIds.includes(record.storeId);
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
 * Check if user is Admin (Super Admin or role level ≤ 2: admin, tenant_admin)
 */
export function isAdmin(req: Request): boolean {
    if (!req.authUser) return false;
    return req.authUser.isSuperAdmin || getRoleLevel(req.authUser.role, false) <= 2;
}

/**
 * Middleware to require Admin access (Super Admin or role level ≤ 2)
 */
export function requireAdmin() {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            if (!req.authUser) {
                throw ApiError.unauthorized('Not authenticated');
            }

            if (!req.authUser.isSuperAdmin && getRoleLevel(req.authUser.role, false) > 2) {
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
 * Reads the bitmask cached on req.authUser — zero extra DB/Redis calls.
 */
export function requirePerm(perm: PermBit) {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            if (!req.authUser) {
                throw ApiError.unauthorized();
            }

            // Super Admin bypasses all
            if (req.authUser.isSuperAdmin) {
                next();
                return;
            }

            // Wildcard string permission
            if (req.authUser.permissions.includes('*')) {
                next();
                return;
            }

            // Bitmask check — O(1), mask already in req.authUser from loadCachedAuthUser
            const maskLow  = BigInt(req.authUser.maskLow  || '0');
            const maskHigh = BigInt(req.authUser.maskHigh || '0');

            if (hasPerm(maskLow, maskHigh, perm)) {
                next();
                return;
            }

            throw ApiError.forbidden('Insufficient permissions');
        } catch (error) {
            next(error);
        }
    };
}
