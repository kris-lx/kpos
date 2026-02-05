// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Auth Store (Svelte 5 Runes)
// ═══════════════════════════════════════════════════════════════════════════

import { authClientApi } from '$api/auth-client';
import { browser } from '$app/environment';

// Storage keys
const ACCESS_TOKEN_KEY = 'kpos_access_token';
const REFRESH_TOKEN_KEY = 'kpos_refresh_token';
const USER_KEY = 'kpos_user';
const ACTIVE_STORE_KEY = 'kpos_active_store';
const ACCESSIBLE_STORES_KEY = 'kpos_accessible_stores';

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    branchId: string;
    isSuperAdmin?: boolean;
    permissions?: string[];
}

// Store access interface
export interface StoreAccess {
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

export interface StoreContext {
    stores: StoreAccess[];
    activeStoreId: string | null;
    activeBranchId: string | null;
    accessibleBranchIds: string[];
}

// Create reactive auth state
function createAuthStore() {
    let accessToken = $state<string | null>(null);
    let refreshToken = $state<string | null>(null);
    let user = $state<User | null>(null);
    let isLoading = $state(true);
    let accessibleStores = $state<StoreAccess[]>([]);
    let activeStoreId = $state<string | null>(null);
    let activeBranchId = $state<string | null>(null);

    // Initialize from localStorage
    if (browser) {
        accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
        refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        const storedUser = localStorage.getItem(USER_KEY);
        if (storedUser) {
            try {
                user = JSON.parse(storedUser);
            } catch {
                user = null;
            }
        }
        
        // Load store context
        const storedStores = localStorage.getItem(ACCESSIBLE_STORES_KEY);
        if (storedStores) {
            try {
                accessibleStores = JSON.parse(storedStores);
            } catch {
                accessibleStores = [];
            }
        }
        activeStoreId = localStorage.getItem(ACTIVE_STORE_KEY);
        
        // Set active branch from active store or user's default
        const activeStore = accessibleStores.find(s => s.storeId === activeStoreId);
        activeBranchId = activeStore?.branchId || user?.branchId || null;
        
        isLoading = false;
    }

    const isAuthenticated = $derived(!!accessToken && !!user);
    
    // Derived: Get accessible branch IDs
    const accessibleBranchIds = $derived([...new Set(accessibleStores.map(s => s.branchId))]);
    
    // Derived: Current active store object
    const activeStore = $derived(accessibleStores.find(s => s.storeId === activeStoreId) || null);
    
    // Derived: Get stores grouped by branch
    const storesByBranch = $derived(() => {
        const grouped: Record<string, StoreAccess[]> = {};
        for (const store of accessibleStores) {
            if (!grouped[store.branchId]) {
                grouped[store.branchId] = [];
            }
            grouped[store.branchId].push(store);
        }
        return grouped;
    });

    async function login(email: string, password: string): Promise<boolean> {
        try {
            isLoading = true;
            const response = await authClientApi.login(email, password);

            if (response.success && response.data) {
                accessToken = response.data.accessToken;
                refreshToken = response.data.refreshToken;
                user = response.data.user;

                if (browser) {
                    localStorage.setItem(ACCESS_TOKEN_KEY, response.data.accessToken);
                    localStorage.setItem(REFRESH_TOKEN_KEY, response.data.refreshToken);
                    localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
                }
                
                // Load accessible stores after login
                await loadStoreContext();

                return true;
            }
            return false;
        } catch (error) {
            console.error('Login failed:', error);
            return false;
        } finally {
            isLoading = false;
        }
    }
    
    // Load store context from API
    async function loadStoreContext(): Promise<void> {
        if (!accessToken) return;
        
        try {
            const response = await fetch('/api/v1/stores/my-stores', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data) {
                    accessibleStores = data.data.stores || [];
                    
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
                    activeBranchId = activeStoreObj?.branchId || user?.branchId || null;
                    
                    // Persist to localStorage
                    if (browser) {
                        localStorage.setItem(ACCESSIBLE_STORES_KEY, JSON.stringify(accessibleStores));
                        if (activeStoreId) {
                            localStorage.setItem(ACTIVE_STORE_KEY, activeStoreId);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load store context:', error);
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
        if (user.role === 'admin' || user.role === 'superadmin') return true;
        return accessibleBranchIds.includes(branchId) || user.branchId === branchId;
    }

    async function refresh(): Promise<boolean> {
        if (!refreshToken) return false;

        try {
            const response = await authClientApi.refresh(refreshToken);

            if (response.success && response.data) {
                accessToken = response.data.accessToken;
                refreshToken = response.data.refreshToken;

                if (browser) {
                    localStorage.setItem(ACCESS_TOKEN_KEY, response.data.accessToken);
                    localStorage.setItem(REFRESH_TOKEN_KEY, response.data.refreshToken);
                }

                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    function logout(): void {
        const currentToken = accessToken;
        accessToken = null;
        refreshToken = null;
        user = null;
        accessibleStores = [];
        activeStoreId = null;
        activeBranchId = null;

        if (browser) {
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            localStorage.removeItem(ACCESSIBLE_STORES_KEY);
            localStorage.removeItem(ACTIVE_STORE_KEY);
        }

        // Try to logout on server (ignore errors)
        if (currentToken) {
            authClientApi.logout(currentToken).catch(() => { });
        }
    }

    function hasPermission(permission: string): boolean {
        if (!user) return false;
        // Super Admin has all permissions
        if (user.isSuperAdmin) return true;
        // Check if user has wildcard permission
        if (user.permissions?.includes('*')) return true;
        // Check specific permission
        if (user.permissions?.includes(permission)) return true;
        // Check module-level permission (e.g., 'products:view' matches 'products:*')
        const [module] = permission.split(':');
        if (user.permissions?.includes(`${module}:*`)) return true;
        
        // Check menu-based permissions (new system)
        // Convert old permission format to menu key (e.g., 'products:view' -> 'products')
        const menuKey = permission.split(':')[0];
        if (user.permissions?.includes(menuKey)) return true;
        
        // Check if parent menu is granted (e.g., 'sales' grants 'sales.pos')
        const parentKey = menuKey.split('.')[0];
        if (parentKey !== menuKey && user.permissions?.includes(parentKey)) return true;
        
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
            case 'shop_admin': return 'Shop Admin';
            case 'branch_admin': return 'Branch Admin';
            case 'manager': return 'Manager';
            case 'cashier': return 'Cashier';
            case 'staff': return 'Staff';
            default: return user.role;
        }
    }

    // Check if user can access admin features
    function canAccessAdmin(): boolean {
        if (!user) return false;
        return user.isSuperAdmin || ['admin', 'shop_admin', 'branch_admin'].includes(user.role);
    }

    // Check if user is cashier (limited access)
    function isCashierOnly(): boolean {
        if (!user) return false;
        return ['cashier', 'user', 'staff'].includes(user.role) && !user.isSuperAdmin;
    }

    return {
        get accessToken() { return accessToken; },
        get refreshToken() { return refreshToken; },
        get user() { return user; },
        get isAuthenticated() { return isAuthenticated; },
        get isLoading() { return isLoading; },
        
        // Store context
        get accessibleStores() { return accessibleStores; },
        get activeStoreId() { return activeStoreId; },
        get activeBranchId() { return activeBranchId; },
        get activeStore() { return activeStore; },
        get accessibleBranchIds() { return accessibleBranchIds; },
        get storesByBranch() { return storesByBranch; },
        
        // Auth methods
        login,
        refresh,
        logout,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        getRoleDisplay,
        canAccessAdmin,
        isCashierOnly,
        
        // Store methods
        loadStoreContext,
        setActiveStore,
        hasStoreAccess,
        hasBranchAccess,
    };
}

export const auth = createAuthStore();
