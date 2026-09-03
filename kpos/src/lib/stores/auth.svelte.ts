// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Auth Store (Svelte 5 Runes)
// ═══════════════════════════════════════════════════════════════════════════

import { authClientApi } from '$api/auth-client';
import { api } from '$api';
import { setToken, refreshAccessToken } from '$api/token';
import { browser } from '$app/environment';
import { CLIENT_CACHE, LOCAL_STORAGE_KEYS } from '$lib/config';
import { tenantSettings } from '$lib/stores/settings.svelte';
import { cart } from '$lib/stores/cart.svelte';

const ACCESS_TOKEN_KEY = LOCAL_STORAGE_KEYS.ACCESS_TOKEN;
const REFRESH_TOKEN_KEY = LOCAL_STORAGE_KEYS.REFRESH_TOKEN;
const USER_KEY = LOCAL_STORAGE_KEYS.USER;
const ACTIVE_STORE_KEY = LOCAL_STORAGE_KEYS.ACTIVE_STORE;
const ACCESSIBLE_STORES_KEY = LOCAL_STORAGE_KEYS.ACCESSIBLE_STORES;
const RULES_KEY = LOCAL_STORAGE_KEYS.RULES;

/**
 * 6-level role hierarchy — mirrors backend ROLE_LEVELS in auth.middleware.ts exactly.
 * Lower number = broader access. Legacy aliases kept for backward compat.
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

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    branchId: string;
    tenantId: string;
    phone?: string;
    avatar?: string | null;
    isSuperAdmin?: boolean;
    requiresShift?: boolean;
    checkerEnabled?: boolean;
    permissions?: string[];
    /** Numeric role level 1-7. Sourced from auth/me (DB-backed, from the
     *  user's actual `roles` row) — see the `roleLevel` derived value below
     *  for the client-side ROLE_LEVELS fallback used before it's loaded. */
    roleLevel?: number;
}

type ClientCacheEnvelope<T> = {
    version: number;
    savedAt: number;
    data: T;
};

function readClientCache<T>(key: string): T | null {
    if (!browser) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
        const cached = JSON.parse(raw) as ClientCacheEnvelope<T>;
        if (cached.version !== CLIENT_CACHE.VERSION || Date.now() - cached.savedAt > CLIENT_CACHE.TTL_MS) {
            localStorage.removeItem(key);
            return null;
        }
        return cached.data;
    } catch {
        localStorage.removeItem(key);
        return null;
    }
}

function writeClientCache<T>(key: string, data: T): void {
    if (!browser) return;
    const cached: ClientCacheEnvelope<T> = { version: CLIENT_CACHE.VERSION, savedAt: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(cached));
}

// Store access interface. Stores are the top-level tier now (Tenant → Store →
// Branch) — branchId/branchName are null for a whole-store grant, or set when
// this particular grant is narrowed to one specific branch WITHIN that store.
// They are NOT "the branch this store belongs to" (that relationship no
// longer exists — a branch belongs to a store, not the reverse).
export interface StoreAccess {
    storeId: string;
    branchId: string | null;
    storeName: string;
    branchName: string | null;
    storeLogo?: string | null;
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    canManage: boolean;
    isDefault: boolean;
}

export interface StoreContext {
    stores: StoreAccess[];
    activeStoreId: string | null;
    activeBranchId: string | null;
    accessibleBranchIds: string[];
}

export interface UserRule {
    name: string;
    displayName: string;
    module: string;
    icon: string | null;
    routes: string[];
    permissions: string[];
    crud: { read: boolean; create: boolean; update: boolean; delete: boolean };
}

// Create reactive auth state
function createAuthStore() {
    let accessToken = $state<string | null>(null);
    let user = $state<User | null>(null);
    let isLoading = $state(true);
    let accessibleStores = $state<StoreAccess[]>([]);
    // Backend-expanded branch scope for whole-store grants (branchId=null).
    let serverAccessibleBranchIds = $state<string[]>([]);
    let activeStoreId = $state<string | null>(null);
    let activeBranchId = $state<string | null>(null);
    let userRules = $state<UserRule[]>([]);
    // Flat list of hrefs from GET /users/me/menu — that endpoint already
    // filters correctly for ANY role (including custom roles created via the
    // Roles UI, which get a `permissions` array but never get corresponding
    // `userRules`/`roleRules` entries — the rules system is only populated
    // for legacy/system roles). Used as a fallback route guard so a
    // restricted custom-role user can't navigate straight to a page like
    // /staff by typing the URL, even though the backend already rejects the
    // underlying data either way — this closes the frontend UX gap, not a
    // security hole.
    let accessibleMenuRoutes = $state<string[]>([]);
    // True once both loadRules() and loadAccessibleMenuRoutes() have settled
    // at least once. Lets the route guard in +layout.svelte tell "still
    // loading, both arrays are empty" (fail open — don't bounce the user
    // mid-load) apart from "loaded, both genuinely empty" (fail closed —
    // a role with zero granted routes shouldn't fall through to "allow all").
    let rulesAndMenuLoaded = $state(false);
    // A failed authorization request is different from a valid empty access
    // result. Keep this visible to the shell so users get Retry instead of a
    // misleading blank sidebar or a silent redirect to the dashboard.
    let authorizationUnavailable = $state(false);

    // Initialize from localStorage
    if (browser) {
        const parsedUser = readClientCache<User>(USER_KEY);
        user = parsedUser;

        // Load store context
        const parsedStores = readClientCache<StoreAccess[]>(ACCESSIBLE_STORES_KEY) || [];
        accessibleStores = parsedStores;
        activeStoreId = localStorage.getItem(ACTIVE_STORE_KEY);

        // Load cached rules
        userRules = readClientCache<UserRule[]>(RULES_KEY) || [];

        // Set active branch from active store or user's default
        const initStore = parsedStores.find(s => s.storeId === activeStoreId);
        activeBranchId = initStore?.branchId || parsedUser?.branchId || null;

        isLoading = false;

        // On page reload: silently exchange the HttpOnly refresh cookie for a new access token.
        // The browser sends the cookie automatically — no token in localStorage needed.
        // Also re-fetches store context — without this, accessibleStores/
        // activeStoreId stay whatever was cached in localStorage from the
        // last login, forever, across reloads. A tab left open across any
        // change to the user's store access (reassignment, a store getting
        // deleted, a backend data reset) would keep submitting stale/
        // nonexistent storeIds until the user manually logged out and back in.
        // Public auth pages must not try to refresh a stale/expired cookie.
        // Besides being unnecessary, that produces a noisy 401 in the browser
        // console before the user has submitted the login form.
        const isPublicAuthRoute = ['/login', '/forgot-password', '/reset-password']
            .some((route) => window.location.pathname.startsWith(route));
        if (parsedUser && !isPublicAuthRoute) {
            setTimeout(async () => {
                const ok = await refresh();
                if (ok) await Promise.all([refreshProfile(), loadRulesAndMenu(),loadStoreContext(), tenantSettings.load()]);
            }, 0);
        }
    }

    const isAuthenticated = $derived(!!accessToken && !!user);
    
    // Derived: Get accessible branch IDs (only rows narrowed to a specific
    // branch — a whole-store grant has branchId=null and contributes none).
    const accessibleBranchIds = $derived([
        ...new Set([
            ...serverAccessibleBranchIds,
            ...accessibleStores.map(s => s.branchId).filter((id): id is string => !!id),
        ]),
    ]);

    // Derived: Current active store object
    const activeStore = $derived(accessibleStores.find(s => s.storeId === activeStoreId) || null);

    // Derived: numeric role level for the current user. Prefers the
    // server-computed value (auth/me's roleLevel, DB-backed via the user's
    // actual `roles` row — see auth.middleware.ts) since that's authoritative
    // for custom roles too. ROLE_LEVELS is only a same-tab fallback for the
    // brief window before refreshProfile() resolves after login/page load —
    // it still can't see a custom role's real level, so it's deliberately
    // the least-privileged (7) default is used elsewhere below, not this map.
    const roleLevel = $derived(
        user?.isSuperAdmin ? 1 : (user?.roleLevel ?? (user ? (ROLE_LEVELS[user.role] ?? 7) : 7))
    );

    // Derived: true if user can see all branches (system_admin or tenant_admin)
    const canSeeAllBranches = $derived(user?.isSuperAdmin === true || roleLevel <= 2);

    // Derived: true if user is at HQ level (can see child branches)
    const isHQLevel = $derived(roleLevel <= 4);

    let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh(token: string): void {
        if (_refreshTimer) clearTimeout(_refreshTimer);
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const exp = (payload.exp || 0) * 1000;
            const ttlMs = exp - Date.now();
            if (ttlMs > 0) {
                _refreshTimer = setTimeout(() => refresh(), ttlMs * 0.8);
            }
        } catch {
            // ignore malformed token
        }
    }

    async function login(email: string, password: string): Promise<boolean | string> {
        try {
            isLoading = true;
            const response = await authClientApi.login(email, password);

            if (response.success && response.data) {
                accessToken = response.data.accessToken;
                user = response.data.user;

                setToken(response.data.accessToken);
                scheduleRefresh(response.data.accessToken);

                if (browser) {
                    // refreshToken is in HttpOnly cookie (set by server, never in localStorage — NEW-01)
                    writeClientCache(USER_KEY, response.data.user);
                }

                // Load accessible stores, rules, permissions, and tenant config after login
                await Promise.all([loadStoreContext(), loadRulesAndMenu(),refreshProfile(), tenantSettings.load()]);

                return true;
            }
            return false;
        } catch (error: unknown) {
            console.error('Login failed:', error);
            // Surface the server's actual reason (pending approval, account
            // suspended, rate-limited, etc.) instead of a blanket "wrong
            // password" — the generic message was misleading users into
            // retrying a correct password, which risked tripping the login
            // rate limiter for no reason.
            if (error && typeof error === 'object' && 'response' in error) {
                const httpError = error as { response: Response };
                if (httpError.response?.status === 503) {
                    return 'SERVICE_UNAVAILABLE';
                }
                try {
                    const body = await httpError.response.json();
                    const message = body?.error?.message;
                    if (typeof message === 'string' && message.trim()) {
                        return message;
                    }
                } catch { /* body wasn't JSON — fall through to generic failure */ }
            }
            return false;
        } finally {
            isLoading = false;
        }
    }
    
    // Load store context from API
    async function loadStoreContext(): Promise<void> {
        if (!accessToken) return;
        
        try {
            const data = await api.get('stores/my-stores').json<{
                success: boolean;
            data?: { stores: StoreAccess[]; accessibleBranchIds?: string[]; activeBranchId?: string | null };
            }>();
            
            if (data.success && data.data) {
                accessibleStores = data.data.stores || [];
                serverAccessibleBranchIds = data.data.accessibleBranchIds || [];
                
                // Set active store (prefer stored, then default, then first)
                const storedActiveStore = browser ? localStorage.getItem(ACTIVE_STORE_KEY) : null;
                const defaultStore = accessibleStores.find(s => s.isDefault);
                const firstStore = accessibleStores[0];
                
                if (storedActiveStore && accessibleStores.some(s => s.storeId === storedActiveStore)) {
                    activeStoreId = storedActiveStore;
                } else if (defaultStore) {
                    activeStoreId = defaultStore.storeId;
                } else if (firstStore) {
                    activeStoreId = firstStore.storeId;
                }
                
                // Set active branch
                const activeStoreObj = accessibleStores.find(s => s.storeId === activeStoreId);
                activeBranchId = activeStoreObj?.branchId || data.data.activeBranchId || serverAccessibleBranchIds[0] || user?.branchId || null;
                
                // Persist to localStorage
                if (browser) {
                    writeClientCache(ACCESSIBLE_STORES_KEY, accessibleStores);
                    if (activeStoreId) {
                        localStorage.setItem(ACTIVE_STORE_KEY, activeStoreId);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load store context:', error);
        }
    }
    
    // Refresh store access from backend (call after UserStore changes)
    async function refreshStores(): Promise<void> {
        if (!accessToken) return;
        try {
            // Invalidate server cache + get fresh data
            await api.post('auth/refresh-stores').json();
            // Reload store context from my-stores endpoint
            await loadStoreContext();
        } catch (error) {
            console.error('Failed to refresh stores:', error);
        }
    }

    // Switch active store
    function setActiveStore(storeId: string): boolean {
        const store = accessibleStores.find(s => s.storeId === storeId);
        if (!store) return false;
        
        activeStoreId = storeId;
        activeBranchId = store.branchId;
        
        if (browser) {
            localStorage.setItem(ACTIVE_STORE_KEY, storeId);
        }
        
        return true;
    }
    
    // Check store access
    function hasStoreAccess(accessType: 'read' | 'write' | 'delete' | 'manage' = 'read'): boolean {
        if (!activeStoreId) return false;
        const store = accessibleStores.find(s => s.storeId === activeStoreId);
        if (!store) return false;
        
        switch (accessType) {
            case 'read': return store.canRead;
            case 'write': return store.canWrite;
            case 'delete': return store.canDelete;
            case 'manage': return store.canManage;
            default: return false;
        }
    }
    
    // Check branch access
    function hasBranchAccess(branchId: string): boolean {
        if (!user) return false;
        if (user.isSuperAdmin || roleLevel <= 2) return true;
        return accessibleBranchIds.includes(branchId) || user.branchId === branchId;
    }

    // Delegates to the app-wide deduplicated refresh in $api/token — shared
    // with the API client's reactive 401 retry, so only one /auth/refresh
    // call is ever in flight regardless of which caller triggers it. This
    // matters because the backend rotates refresh tokens (single-use), so
    // two independent concurrent calls would race and one would fail.
    async function refresh(): Promise<boolean> {
        const token = await refreshAccessToken();
        if (token) {
            accessToken = token;
            scheduleRefresh(token);
            return true;
        }
        return false;
    }

    // Refresh user profile + permissions from server (use when permissions may be stale)
    async function refreshProfile(): Promise<void> {
        if (!accessToken) return;
        try {
            const res = await api.get('auth/me').json<{ success: boolean; data?: any }>();
            if (res.success && res.data && user) {
                const updated = {
                    ...user,
                    permissions: res.data.permissions || [],
                    roleLevel: res.data.roleLevel,
                    requiresShift: res.data.requiresShift !== false,
                    name: res.data.name ?? user.name,
                    avatar: res.data.avatar ?? null,
                };
                user = updated;
                if (browser) {
                    writeClientCache(USER_KEY, updated);
                }
            }
        } catch (error) {
            console.error('Failed to refresh profile:', error);
        }
    }

    // Load user rules from API
    async function loadRules(): Promise<boolean> {
        if (!accessToken) return true;
        try {
            const res = await api.get('users/me/rules').json<{ success: boolean; data?: UserRule[] }>();
            if (res.success && res.data) {
                userRules = res.data;
                if (browser) {
                    writeClientCache(RULES_KEY, userRules);
                }
            }
            return res.success;
        } catch (error) {
            console.error('Failed to load user rules:', error);
            return false;
        }
    }

    // Flattens GET /users/me/menu (already correctly permission-filtered
    // server-side, including for custom roles) into a list of accessible
    // hrefs — see accessibleMenuRoutes above for why this exists.
    function flattenMenuHrefs(items: any[]): string[] {
        const hrefs: string[] = [];
        for (const item of items || []) {
            if (item.path) hrefs.push(item.path);
            if (item.children?.length) hrefs.push(...flattenMenuHrefs(item.children));
        }
        return hrefs;
    }

    // Loads rules + menu routes together and marks them loaded regardless of
    // outcome, so the route guard can tell "still loading" from "loaded and
    // empty" — see rulesAndMenuLoaded above.
    async function loadRulesAndMenu(): Promise<void> {
        try {
            const [rulesOk, menuOk] = await Promise.all([loadRules(), loadAccessibleMenuRoutes()]);
            authorizationUnavailable = !rulesOk || !menuOk;
        } finally {
            rulesAndMenuLoaded = true;
        }
    }

    async function loadAccessibleMenuRoutes(): Promise<boolean> {
        if (!accessToken) return true;
        try {
            const res = await api.get('users/me/menu').json<{ success: boolean; data?: any[] }>();
            if (res.success && Array.isArray(res.data)) {
                accessibleMenuRoutes = flattenMenuHrefs(res.data);
            }
            return res.success;
        } catch (error) {
            console.error('Failed to load accessible menu routes:', error);
            return false;
        }
    }

    // Rule-based CRUD checks — falls back to legacy permissions if no matching rule
    function canRead(module: string): boolean {
        if (!user) return false;
        if (user.isSuperAdmin) return true;
        const rule = userRules.find(r => r.module === module || r.name === module);
        if (rule) return rule.crud.read;
        const perm = module.split('.').pop() || module;
        return hasPermission(`${perm}:read`) || hasPermission(`${perm}:view`);
    }

    function canCreate(module: string): boolean {
        if (!user) return false;
        if (user.isSuperAdmin) return true;
        const rule = userRules.find(r => r.module === module || r.name === module);
        if (rule) return rule.crud.create;
        const perm = module.split('.').pop() || module;
        return hasPermission(`${perm}:create`);
    }

    function canUpdate(module: string): boolean {
        if (!user) return false;
        if (user.isSuperAdmin) return true;
        const rule = userRules.find(r => r.module === module || r.name === module);
        if (rule) return rule.crud.update;
        const perm = module.split('.').pop() || module;
        return hasPermission(`${perm}:update`);
    }

    function canDelete(module: string): boolean {
        if (!user) return false;
        if (user.isSuperAdmin) return true;
        const rule = userRules.find(r => r.module === module || r.name === module);
        if (rule) return rule.crud.delete;
        const perm = module.split('.').pop() || module;
        return hasPermission(`${perm}:delete`);
    }

    // Non-CRUD action checks (import/export/void/refund/adjust/...). Unlike
    // canCreate/canUpdate/canDelete, these have no equivalent in the
    // module-level {r,c,u,d} userRules — that shape only has 4 flags — so
    // they go straight to the fine-grained `user.permissions` string array
    // (e.g. 'products:import', 'reports:export'), which SYSTEM_ROLE_PERMISSIONS
    // already populates per role even though the frontend rarely checked it.
    // Buttons for these actions used to render unconditionally for every
    // role since there was no ergonomic helper to gate them with.
    function can(module: string, action: string): boolean {
        if (!user) return false;
        if (user.isSuperAdmin) return true;
        const perm = module.split('.').pop() || module;
        return hasPermission(`${perm}:${action}`);
    }

    function canImport(module: string): boolean { return can(module, 'import'); }
    function canExport(module: string): boolean { return can(module, 'export'); }

    // Check if user has access to a specific frontend route
    function hasRouteAccess(path: string): boolean {
        if (!user) return false;
        if (user.isSuperAdmin) return true;
        // Help page is always accessible
        if (path === '/help') return true;
        // Rule routes (defaultAccessControl.ts) are bare paths like '/finance'
        // with no query string, but real menu hrefs can carry one (e.g.
        // '/finance?tab=payroll' for the Payroll/Expenses/Audit sub-tabs) —
        // comparing the full path with its query string against a bare rule
        // route always failed this check, silently hiding those sub-items
        // whenever the separate accessibleMenuRoutes fallback below hadn't
        // loaded yet (a race on every fresh page load).
        const pathNoQuery = path.split('?')[0];
        if (userRules.some(r => r.routes.some(route => pathNoQuery === route || pathNoQuery.startsWith(route + '/')))) {
            return true;
        }
        // The menu endpoint is permission-filtered by the backend and can
        // contain granular routes (for example audit/report children) that
        // are not present in an older roleRules row. Check it as a second
        // source instead of letting a non-empty stale rule list hide valid
        // permission-granted routes.
        if (accessibleMenuRoutes.length > 0) {
            return accessibleMenuRoutes.some(route => path === route || path.startsWith(route + '/'));
        }
        // Both empty: if that's just the load-in-flight state, don't block —
        // the caller re-checks once rulesAndMenuLoaded flips. If both loads
        // have genuinely settled empty, this role has zero granted routes —
        // fail closed rather than falling through to "allow everything."
        return !rulesAndMenuLoaded;
    }

    // Get all accessible routes
    const accessibleRoutes = $derived(userRules.flatMap(r => r.routes));

    // Bootstraps session state after an SSO redirect lands on the callback
    // page. The backend has already set the HttpOnly refresh cookie (same
    // one password login sets) — this exchanges it for an access token, then
    // loads the full profile from scratch since (unlike refreshProfile())
    // there's no pre-existing `user` object to merge into on a first-ever
    // SSO login on this device.
    async function completeSsoLogin(): Promise<boolean> {
        try {
            isLoading = true;
            const ok = await refresh();
            if (!ok) return false;

            const res = await api.get('auth/me').json<{ success: boolean; data?: any }>();
            if (!res.success || !res.data) return false;

            user = {
                id: res.data.id,
                email: res.data.email,
                name: res.data.name,
                role: res.data.role,
                branchId: res.data.branchId,
                tenantId: res.data.tenantId,
                avatar: res.data.avatar,
                isSuperAdmin: res.data.isSuperAdmin,
                requiresShift: res.data.requiresShift !== false,
                permissions: res.data.permissions || [],
                roleLevel: res.data.roleLevel,
            };

            if (browser) {
                writeClientCache(USER_KEY, user);
            }

            await Promise.all([loadStoreContext(), loadRulesAndMenu(),tenantSettings.load()]);
            return true;
        } catch (error) {
            console.error('SSO login completion failed:', error);
            return false;
        } finally {
            isLoading = false;
        }
    }

    function logout(): void {
        const currentToken = accessToken;
        accessToken = null;
        user = null;
        accessibleStores = [];
        activeStoreId = null;
        activeBranchId = null;
        userRules = [];

        // On a shared POS terminal, the outgoing staff member's in-progress
        // cart (unpaid items, applied discounts/customer) must not carry
        // over to whoever logs in next — same isolation issue as held sales.
        cart.clear();

        setToken(null);
        if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }

        if (browser) {
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            localStorage.removeItem(ACCESSIBLE_STORES_KEY);
            localStorage.removeItem(ACTIVE_STORE_KEY);
            localStorage.removeItem(RULES_KEY);
        }

        // Try to logout on server (ignore errors)
        if (currentToken) {
            authClientApi.logout(currentToken).catch(() => { });
        }
    }

    // Derived Set for O(1) permission lookups — recomputed only when user.permissions changes
    const permissionSet = $derived(new Set(user?.permissions ?? []));

    function hasPermission(permission: string): boolean {
        if (!user) return false;
        if (user.isSuperAdmin) return true;
        const perms = permissionSet;
        if (perms.has('*')) return true;
        if (perms.has(permission)) return true;
        // :view/:read equivalence
        if (permission.endsWith(':view') && perms.has(permission.replace(':view', ':read'))) return true;
        if (permission.endsWith(':read') && perms.has(permission.replace(':read', ':view'))) return true;
        // Module wildcard: 'products:view' matches 'products:*'
        const [module] = permission.split(':');
        if (perms.has(`${module}:*`)) return true;
        // Plain module key
        if (perms.has(module)) return true;
        // Parent module key (e.g. 'sales' grants 'sales.pos')
        const parentKey = module.split('.')[0];
        if (parentKey !== module && perms.has(parentKey)) return true;
        return false;
    }

    // Check if user has any of the permissions
    function hasAnyPermission(permissions: string[]): boolean {
        return permissions.some(p => hasPermission(p));
    }

    // Check if user has all of the permissions
    function hasAllPermissions(permissions: string[]): boolean {
        return permissions.every(p => hasPermission(p));
    }

    // Get user role for display
    function getRoleDisplay(): string {
        if (!user) return '';
        if (user.isSuperAdmin) return 'Super Admin';
        switch (user.role) {
            case 'admin': return 'Admin';
            case 'store_owner': return 'Store Owner';
            case 'branch_admin': return 'Branch Admin';
            case 'manager': return 'Manager';
            case 'cashier': return 'Cashier';
            case 'staff': return 'Staff';
            default: return user.role || 'User';
        }
    }

    // Check if user can access admin features (level 5 / branch_admin or higher)
    function canAccessAdmin(): boolean {
        if (!user) return false;
        return user.isSuperAdmin || roleLevel <= 5;
    }

    // Check if user is cashier (limited access)
    function isCashierOnly(): boolean {
        if (!user) return false;
        return ['cashier', 'user', 'staff'].includes(user.role) && !user.isSuperAdmin;
    }

    return {
        get accessToken() { return accessToken; },
        get user() { return user; },
        get isAuthenticated() { return isAuthenticated; },
        get isLoading() { return isLoading; },

        // Store context
        get accessibleStores() { return accessibleStores; },
        get activeStoreId() { return activeStoreId; },
        get activeBranchId() { return activeBranchId; },
        get activeStore() { return activeStore; },
        get accessibleBranchIds() { return accessibleBranchIds; },

        // Role hierarchy
        get isSuperAdmin() { return user?.isSuperAdmin === true; },
        get roleLevel() { return roleLevel; },
        get canSeeAllBranches() { return canSeeAllBranches; },
        get isHQLevel() { return isHQLevel; },

        // Rules (RBAC)
        get userRules() { return userRules; },
        get accessibleRoutes() { return accessibleRoutes; },
        get accessibleMenuRoutes() { return accessibleMenuRoutes; },
        get rulesAndMenuLoaded() { return rulesAndMenuLoaded; },
        get authorizationUnavailable() { return authorizationUnavailable; },
        loadAccessibleMenuRoutes,
        loadRulesAndMenu,
        
        // Auth methods
        login,
        refresh,
        completeSsoLogin,
        logout,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        getRoleDisplay,
        canAccessAdmin,
        isCashierOnly,

        // Rule-based CRUD
        loadRules,
        canRead,
        canCreate,
        canUpdate,
        canDelete,
        can,
        canImport,
        canExport,
        hasRouteAccess,
        
        // Store methods
        loadStoreContext,
        refreshStores,
        refreshProfile,
        setActiveStore,
        hasStoreAccess,
        hasBranchAccess,
    };
}

export const auth = createAuthStore();
