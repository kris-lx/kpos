<script lang="ts">
    import { auth } from "$stores";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import { cn } from "$utils";
    import { t, setLanguage, currentLanguage } from "$lib/i18n/index.svelte";
    import { themeStore } from "$lib/stores/theme.svelte";
    import Sidebar from "$lib/components/layout/Sidebar.svelte";
    import StoreSelector from "$lib/components/layout/StoreSelector.svelte";
    import { api } from "$lib/api";
    import { getRealtimeSocket, disconnectRealtimeSocket } from "$lib/realtime/socket";
    import {
        Menu,
        Bell,
        ChevronDown,
        Sun,
        Moon,
        Languages,
        LogOut,
        User,
        Settings,
        Maximize,
        Minimize,
        Monitor,
        X,
        Clock,
        Pause,
    } from "lucide-svelte";

    let { children } = $props();

    // Child pages must not mount (and fire their own authenticated API calls
    // in onMount) until the access token has actually been restored below —
    // otherwise every hard page load races the token refresh and 401s.
    let authReady = $state(false);

    let isSidebarOpen = $state(true);
    let isMobileSidebarOpen = $state(false);

    // Collapse sidebar by default on tablet (md) so content has room
    function initSidebarState() {
        if (typeof window !== 'undefined') {
            isSidebarOpen = window.innerWidth >= 1024;
        }
    }
    let isUserMenuOpen = $state(false);
    let isLangMenuOpen = $state(false);
    let isNotificationOpen = $state(false);
    let isFullscreen = $state(false);
    // Driven by the actual settings:view permission (which super admin controls
    // via Roles & Permissions) instead of a hardcoded role-name list — otherwise
    // granting/revoking settings access through that UI has no effect here.
    const canAccessSettingsMenu = $derived(auth.hasPermission('settings:view'));

    // Inactivity auto-logout — 15 minutes of no user interaction
    const INACTIVITY_MS = 15 * 60 * 1000;
    const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let notifInterval: ReturnType<typeof setInterval> | null = null;
    let heldInterval: ReturnType<typeof setInterval> | null = null;
    let socketInitialized = false;

    function resetInactivityTimer() {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            auth.logout();
            goto("/login");
        }, INACTIVITY_MS);
    }

    // Notifications (loaded from API)
    let notifications = $state<Array<{id: string; title: string; message: string; time: string; read: boolean; type: string}>>([]);
    let unreadCount = $state(0);
    let pendingRequestsCount = $state(0);
    let heldSalesCount = $state(0);
    let layoutPollFailures = 0;
    const MAX_LAYOUT_FAILURES = 3;

    function isNetworkError(err: unknown): boolean {
        const msg = (err instanceof Error) ? err.message : String(err);
        return msg.includes('Failed to fetch') || msg.includes('ERR_CONNECTION_REFUSED') || msg.includes('NetworkError');
    }

    function getResponseStatus(err: unknown): number | undefined {
        return (err as { response?: { status?: number } })?.response?.status;
    }

    function isAuthError(err: unknown): boolean {
        return getResponseStatus(err) === 401 || getResponseStatus(err) === 403;
    }

    async function ensureAuthReady(): Promise<boolean> {
        if (auth.isAuthenticated) return true;
        if (!auth.user) return false;
        return auth.refresh();
    }

    // Shift enforcement — roles that require an open shift are loaded from /roles/levels
    let shiftRequiredRoles = $state<string[]>([]);
    let showShiftWarning = $state(false);
    let currentShift = $state<any>(null);
    let shiftCheckDone = $state(false);

    async function loadShiftRequiredRoles() {
        // Level 6+ (branch_manager, staff, cashier) require an open shift
        try {
            const res = await api.get('roles/levels').json<{ success: boolean; data: { level: number; name: string }[] }>();
            if (res.success) {
                shiftRequiredRoles = res.data.filter(l => l.level >= 6).map(l => l.name);
            }
        } catch {
            // fallback to safe default
            shiftRequiredRoles = ['cashier', 'store_manager', 'branch_manager', 'inventory_staff', 'waiter', 'kitchen_staff'];
        }
    }

    async function checkActiveShift() {
        const user = auth.user;
        if (!user || !shiftRequiredRoles.includes(user.role)) {
            shiftCheckDone = true;
            return;
        }
        try {
            const res = await api.get('sales/shifts/current').json<any>();
            currentShift = res.success ? res.data : null;
            showShiftWarning = !currentShift;
        } catch {
            currentShift = null;
            showShiftWarning = true;
        } finally {
            shiftCheckDone = true;
        }
    }

    async function clockIn() {
        try {
            const res = await api.post('sales/shifts/open', { json: { openingBalance: 0 } }).json<any>();
            if (res.success) {
                currentShift = res.data;
                showShiftWarning = false;
            }
        } catch {
            // handled silently
        }
    }

    async function loadNotifications() {
        if (layoutPollFailures >= MAX_LAYOUT_FAILURES) return;
        if (!(await ensureAuthReady())) return;
        try {
            const res = await api.get("settings/user-notifications?limit=10").json<any>();
            if (res.success) {
                notifications = (res.data || []).map((n: any) => ({
                    id: n.id,
                    title: n.title,
                    message: n.message,
                    time: n.createdAt,
                    read: n.isRead,
                    type: n.type,
                }));
                unreadCount = res.unreadCount || 0;
            }
            layoutPollFailures = 0;
        } catch (e) {
            if (isAuthError(e)) return;
            if (isNetworkError(e)) layoutPollFailures++;
        }
    }

    async function loadHeldSalesCount() {
        if (layoutPollFailures >= MAX_LAYOUT_FAILURES) return;
        if (!(await ensureAuthReady())) return;
        try {
            const res = await api.get('sales/held?limit=1').json<any>();
            heldSalesCount = res.pagination?.total || res.data?.length || 0;
            layoutPollFailures = 0;
        } catch (e) {
            if (isAuthError(e)) return;
            if (isNetworkError(e)) layoutPollFailures++;
        }
    }

    async function loadPendingRequests() {
        const user = auth.user;
        if (!user) return;
        const isAdminUser = user.isSuperAdmin || user.role === 'admin' || user.role === 'super_admin';
        if (!isAdminUser) return;
        if (layoutPollFailures >= MAX_LAYOUT_FAILURES) return;
        if (!(await ensureAuthReady())) return;
        try {
            const res = await api.get('admin/requests/count').json<any>();
            if (res.success) pendingRequestsCount = res.data?.pending || 0;
            layoutPollFailures = 0;
        } catch (e) {
            if (isAuthError(e)) return;
            if (isNetworkError(e)) layoutPollFailures++;
        }
    }

    function upsertRealtimeNotification(payload: any) {
        const notification = {
            id: payload.id || `realtime-${Date.now()}`,
            title: payload.title || t("notifications.title"),
            message: payload.message || payload.body || "",
            time: payload.createdAt || new Date().toISOString(),
            read: false,
            type: payload.type || "info",
        };
        notifications = [
            notification,
            ...notifications.filter((n) => n.id !== notification.id),
        ].slice(0, 10);
        unreadCount += 1;
    }

    function connectRealtimeNotifications() {
        if (socketInitialized) return;
        const socket = getRealtimeSocket();
        if (!socket) return;
        socketInitialized = true;

        socket.on('notification:new', upsertRealtimeNotification);
        socket.on('notification:broadcast', upsertRealtimeNotification);
        socket.on('connect', () => {
            layoutPollFailures = 0;
            loadNotifications();
            loadPendingRequests();
            loadHeldSalesCount();
        });
        socket.on('connect_error', () => {
            socketInitialized = false;
        });
    }

    const languages = [
        { code: "th", name: "ภาษาไทย", flag: "🇹🇭" },
        { code: "en", name: "English", flag: "🇺🇸" },
        { code: "lo", name: t("language.lao"), flag: "🇱🇦" },
        { code: "zh", name: "中文", flag: "🇨🇳" },
        { code: "ja", name: "日本語", flag: "🇯🇵" },
    ];

    onMount(async () => {
        initSidebarState();

        if (!auth.isAuthenticated) {
            const restored = auth.user ? await auth.refresh() : false;
            if (!restored) {
                goto("/login");
                return;
            }
        }
        authReady = true;

        // If user has no store access and is not admin/super admin, send to store-request
        const user = auth.user;
        const isAdmin = user?.isSuperAdmin || user?.role === 'admin' || user?.role === 'super_admin';
        const currentPath = $page.url.pathname;
        const storeExemptPaths = ['/store-request', '/help'];
        if (!isAdmin && auth.accessibleStores.length === 0 && !storeExemptPaths.includes(currentPath)) {
            goto('/store-request');
            return;
        }

        // Ensure rules are loaded (safety net for first login or cleared localStorage cache)
        if (auth.userRules.length === 0) {
            auth.loadRules();
        }

        // Route-level permission guard: redirect to dashboard if user has no access to current path.
        // Always-accessible paths: dashboard, help, profile, settings, pos (pos has its own shift guard).
        const alwaysAllowed = ['/dashboard', '/help', '/settings', '/pos', '/store-request'];
        if (!user?.isSuperAdmin && auth.userRules.length > 0 && currentPath !== '/dashboard') {
            const pathAllowed = alwaysAllowed.some(p => currentPath === p || currentPath.startsWith(p + '/'))
                || auth.hasRouteAccess(currentPath);
            if (!pathAllowed) {
                goto('/dashboard');
                return;
            }
        }

        // Load shift-required roles from API (removes hardcoded role list)
        loadShiftRequiredRoles().then(() => checkActiveShift());

        // Load notifications from API
        loadNotifications();
        loadPendingRequests();
        loadHeldSalesCount();
        connectRealtimeNotifications();
        // Auto-refresh notifications every 60 seconds, held sales every 30s
        notifInterval = setInterval(() => { loadNotifications(); loadPendingRequests(); }, 60 * 1000);
        heldInterval = setInterval(loadHeldSalesCount, 30 * 1000);
        // On tab focus: reset failure counter so we retry when user returns
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) { layoutPollFailures = 0; loadHeldSalesCount(); }
        });

        // Check if user needs to clock in
        checkActiveShift();

        // Handle fullscreen change
        document.addEventListener("fullscreenchange", () => {
            isFullscreen = !!document.fullscreenElement;
        });

        // Inactivity auto-logout: reset timer on any user interaction
        ACTIVITY_EVENTS.forEach(ev => document.addEventListener(ev, resetInactivityTimer, { passive: true }));
        resetInactivityTimer(); // start the initial countdown

        // Close menus when clicking outside
        document.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (!target.closest("[data-user-menu]")) {
                isUserMenuOpen = false;
            }
            if (!target.closest("[data-lang-menu]")) {
                isLangMenuOpen = false;
            }
            if (!target.closest("[data-notification-menu]")) {
                isNotificationOpen = false;
            }
        });

        return;
    });

    onDestroy(() => {
        if (notifInterval) clearInterval(notifInterval);
        if (heldInterval) clearInterval(heldInterval);
        if (inactivityTimer) clearTimeout(inactivityTimer);
        ACTIVITY_EVENTS.forEach(ev => document.removeEventListener(ev, resetInactivityTimer));
        disconnectRealtimeSocket();
    });

    // Re-run route guard reactively when rules load after initial mount or when page changes
    $effect(() => {
        const user = auth.user;
        const rules = auth.userRules;
        const currentPath = $page.url.pathname;
        if (!user || user.isSuperAdmin || rules.length === 0) return;
        const alwaysAllowed = ['/dashboard', '/help', '/settings', '/pos', '/store-request'];
        const pathAllowed = alwaysAllowed.some(p => currentPath === p || currentPath.startsWith(p + '/'))
            || auth.hasRouteAccess(currentPath);
        if (!pathAllowed && currentPath !== '/dashboard') {
            goto('/dashboard');
        }
    });

    function handleLogout() {
        auth.logout();
        goto("/login");
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    function toggleTheme() {
        themeStore.toggle();
    }

    function changeLanguage(code: string) {
        setLanguage(code as "th" | "en" | "zh" | "ja" | "lo");
        isLangMenuOpen = false;
        // Force page reload to apply new language
        window.location.reload();
    }

    async function markNotificationRead(id: string) {
        const notif = notifications.find((n) => n.id === id);
        if (notif) {
            notif.read = true;
            notifications = [...notifications];
            unreadCount = Math.max(0, unreadCount - 1);
            try {
                await api.put(`settings/user-notifications/${id}/read`).json();
            } catch (e) { /* ignore */ }
        }
    }

    async function markAllRead() {
        notifications = notifications.map((n) => ({ ...n, read: true }));
        unreadCount = 0;
        try {
            await api.put("settings/user-notifications/mark-all-read").json();
        } catch (e) { /* ignore */ }
    }

    function getNotificationIcon(type: string): string {
        switch (type) {
            case "warning":
                return "⚠️";
            case "success":
                return "✅";
            case "error":
                return "❌";
            default:
                return "ℹ️";
        }
    }
</script>

<svelte:head>
    <title>KPOS - Enterprise POS System</title>
</svelte:head>

<div class="app-shell h-screen h-dvh overflow-hidden bg-gray-100 dark:bg-gray-950 flex">
    <!-- Desktop Sidebar: visible at tablet (768px) and above -->
    <div class="app-sidebar-fixed hidden md:block fixed z-50">
        <Sidebar
            isOpen={isSidebarOpen}
            onToggle={() => (isSidebarOpen = !isSidebarOpen)}
        />
    </div>

    <!-- Mobile Sidebar Overlay -->
    {#if isMobileSidebarOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="fixed inset-0 z-40 bg-black/50 md:hidden backdrop-blur-sm"
            onclick={() => (isMobileSidebarOpen = false)}
        ></div>
    {/if}

    <!-- Mobile Sidebar -->
    <div
        class={cn(
            "app-sidebar-fixed fixed z-50 md:hidden",
            "transition-transform duration-300 ease-out",
            isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
    >
        <div class="relative h-full">
            <Sidebar isOpen={true} />
            <button
                onclick={() => (isMobileSidebarOpen = false)}
                aria-label={t("common.close")}
                class="absolute top-4 right-4 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500"
            >
                <X class="w-5 h-5" />
            </button>
        </div>
    </div>

    <!-- Main Content -->
    <div
        class={cn(
            "flex-1 flex flex-col min-h-0 h-full transition-all duration-300",
            isSidebarOpen ? "main-offset-open" : "main-offset-closed",
        )}
    >
        <!-- Top Header -->
        <header
            class="app-header sticky top-0 z-30 bg-white/95 dark:bg-gray-900/95 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 header-padding backdrop-blur-lg"
        >
            <!-- Left -->
            <div class="flex items-center gap-4">
                <button
                    onclick={() => (isMobileSidebarOpen = true)}
                    aria-label={t("nav.openMenu")}
                    class="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    <Menu class="w-5 h-5" />
                </button>
                <button
                    onclick={() => (isSidebarOpen = !isSidebarOpen)}
                    aria-label={isSidebarOpen ? t("nav.collapseSidebar") : t("nav.expandSidebar")}
                    class="hidden md:flex p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    <Menu class="w-5 h-5" />
                </button>

                <!-- Store Selector -->
                {#if auth.accessibleStores.length > 0}
                    <StoreSelector />
                {/if}

                <!-- Held Sales Badge -->
                {#if heldSalesCount > 0}
                    <a
                        href="/pos/held"
                        class="hidden md:flex items-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
                        title={t("pos.heldBillsCount", { count: heldSalesCount })}
                    >
                        <Pause class="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                        <span class="text-xs font-medium text-orange-700 dark:text-orange-400">{t("pos.heldBills")}</span>
                        <span class="min-w-5 h-5 px-1 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                            {heldSalesCount}
                        </span>
                    </a>
                {/if}

                <!-- Shift Status Indicator -->
                {#if shiftCheckDone && shiftRequiredRoles.includes(auth.user?.role || '')}
                    {#if currentShift}
                        <a
                            href="/staff/shifts"
                            class="hidden md:flex items-center gap-2 px-3 py-1.5 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg hover:bg-danger-50 hover:border-danger-200 dark:hover:bg-danger-900/20 dark:hover:border-danger-800 transition-colors group"
                            title={t("shifts.clickToClockOut")}
                        >
                            <span class="relative flex h-2.5 w-2.5 group-hover:hidden">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
                                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-success-500"></span>
                            </span>
                            <span class="text-xs font-medium text-success-700 dark:text-success-400 group-hover:hidden">{t("shifts.working")}</span>
                            <span class="hidden group-hover:inline text-xs font-medium text-danger-600 dark:text-danger-400">{t("shifts.clockOut")}</span>
                        </a>
                    {:else}
                        <button
                            onclick={clockIn}
                            class="hidden md:flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                        >
                            <Clock class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span class="text-xs font-medium text-amber-700 dark:text-amber-400">{t("shifts.clockIn")}</span>
                        </button>
                    {/if}
                {/if}
            </div>

            <!-- Right -->
            <div class="flex items-center gap-2">
                <!-- Fullscreen Toggle -->
                <button
                    onclick={toggleFullscreen}
                    aria-label={isFullscreen ? t("common.exitFullscreen") : t("common.fullscreen")}
                    class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    {#if isFullscreen}
                        <Minimize class="w-5 h-5" />
                    {:else}
                        <Maximize class="w-5 h-5" />
                    {/if}
                </button>

                <!-- Customer Display -->
                <a
                    href="/display/customer"
                    target="_blank"
                    aria-label={t("nav.customerDisplay")}
                    class="hidden md:flex p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    <Monitor class="w-5 h-5" />
                </a>

                <!-- Theme Toggle -->
                <button
                    onclick={toggleTheme}
                    aria-label={themeStore.isDark ? t("common.lightMode") : t("common.darkMode")}
                    class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    {#if themeStore.isDark}
                        <Sun class="w-5 h-5" />
                    {:else}
                        <Moon class="w-5 h-5" />
                    {/if}
                </button>

                <!-- Language Selector -->
                <div class="relative" data-lang-menu>
                    <button
                        onclick={() => (isLangMenuOpen = !isLangMenuOpen)}
                        aria-label={t("common.language")}
                        class="flex items-center gap-1 p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <Languages class="w-5 h-5" />
                        <span class="hidden sm:block text-sm"
                            >{currentLanguage().toUpperCase()}</span
                        >
                    </button>

                    {#if isLangMenuOpen}
                        <div
                            class="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50"
                        >
                            {#each languages as lang (lang.code)}
                                <button
                                    onclick={() => changeLanguage(lang.code)}
                                    class={cn(
                                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                                        currentLanguage() === lang.code
                                            ? "bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400"
                                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
                                    )}
                                >
                                    <span class="text-lg">{lang.flag}</span>
                                    <span>{lang.name}</span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <!-- Notifications -->
                <div class="relative" data-notification-menu>
                    <button
                        onclick={() => (isNotificationOpen = !isNotificationOpen)}
                        aria-label={t("notifications.title")}
                        class="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <Bell class="w-5 h-5" />
                        {#if unreadCount > 0}
                            <span
                                class="absolute top-1 right-1 w-4 h-4 bg-danger-500 text-white text-xs rounded-full flex items-center justify-center font-medium"
                            >
                                {unreadCount}
                            </span>
                        {/if}
                    </button>
                    {#if pendingRequestsCount > 0}
                        <a href="/admin/requests"
                            class="absolute -top-1 -left-1 min-w-4.5 h-4.5 px-1 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm pointer-events-auto"
                            title={t("admin.pendingRequestsCount", { count: pendingRequestsCount })}
                        >{pendingRequestsCount}</a>
                    {/if}

                    {#if isNotificationOpen}
                        <div
                            class="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50"
                        >
                            <div
                                class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700"
                            >
                                <h3
                                    class="font-semibold text-gray-900 dark:text-white"
                                >
                                    {t("notifications.title")}
                                </h3>
                                {#if unreadCount > 0}
                                    <button
                                        onclick={markAllRead}
                                        class="text-xs text-primary-600 hover:underline"
                                    >
                                        {t("notifications.markAllRead")}
                                    </button>
                                {/if}
                            </div>
                            <div class="max-h-80 overflow-y-auto">
                                {#if pendingRequestsCount > 0}
                                    <a href="/admin/requests" onclick={() => isNotificationOpen = false}
                                        class="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors border-b border-amber-100 dark:border-amber-800/50">
                                        <span class="text-lg shrink-0">📋</span>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm font-semibold text-amber-900 dark:text-amber-200">{t("admin.pendingRequests")}</p>
                                            <p class="text-xs text-amber-700 dark:text-amber-400">{t("admin.newRequestsAwaiting", { count: pendingRequestsCount })}</p>
                                        </div>
                                        <span class="px-2 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full">{pendingRequestsCount}</span>
                                    </a>
                                {/if}
                                {#each notifications as notif (notif.id)}
                                    <button
                                        onclick={() =>
                                            markNotificationRead(notif.id)}
                                        class={cn(
                                            "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
                                            !notif.read
                                                ? "bg-primary-50/50 dark:bg-primary-900/10"
                                                : "hover:bg-gray-50 dark:hover:bg-gray-800",
                                        )}
                                    >
                                        <span class="text-lg shrink-0"
                                            >{getNotificationIcon(
                                                notif.type,
                                            )}</span
                                        >
                                        <div class="flex-1 min-w-0">
                                            <p
                                                class={cn(
                                                    "text-sm",
                                                    !notif.read
                                                        ? "font-semibold text-gray-900 dark:text-white"
                                                        : "text-gray-700 dark:text-gray-300",
                                                )}
                                            >
                                                {notif.title}
                                            </p>
                                            <p
                                                class="text-xs text-gray-500 dark:text-gray-400 truncate"
                                            >
                                                {notif.message}
                                            </p>
                                            <p
                                                class="text-xs text-gray-400 dark:text-gray-500 mt-1"
                                            >
                                                {notif.time}
                                            </p>
                                        </div>
                                        {#if !notif.read}
                                            <span
                                                class="w-2 h-2 rounded-full bg-primary-500 shrink-0 mt-2"
                                            ></span>
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                            <div
                                class="border-t border-gray-200 dark:border-gray-700 p-2"
                            >
                                <a
                                    href="/notifications"
                                    class="block w-full text-center py-2 text-sm text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                                >
                                    {t("common.viewAll")}
                                </a>
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- Divider -->
                <div class="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1"></div>

                <!-- User Menu -->
                <div class="relative" data-user-menu>
                    <button
                        onclick={() => (isUserMenuOpen = !isUserMenuOpen)}
                        class="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <div
                            class="w-8 h-8 rounded-full bg-linear-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-medium shadow-sm overflow-hidden shrink-0"
                        >
                            {#if auth.user?.avatar}
                                <img src={auth.user.avatar} alt="" class="w-full h-full object-cover" />
                            {:else}
                                {auth.user?.name?.charAt(0)}
                            {/if}
                        </div>
                        <div class="hidden sm:block text-left">
                            <p
                                class="text-sm font-medium text-gray-700 dark:text-gray-200"
                            >
                                {auth.user?.name || "User"}
                            </p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">
                                {auth.user?.role || "Admin"}
                            </p>
                        </div>
                        <ChevronDown
                            class="w-4 h-4 text-gray-400 hidden sm:block"
                        />
                    </button>

                    {#if isUserMenuOpen}
                        <div
                            class="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50"
                        >
                            <div
                                class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3"
                            >
                                <div class="w-10 h-10 rounded-full bg-linear-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-medium shadow-sm overflow-hidden shrink-0">
                                    {#if auth.user?.avatar}
                                        <img src={auth.user.avatar} alt="" class="w-full h-full object-cover" />
                                    {:else}
                                        {auth.user?.name?.charAt(0)}
                                    {/if}
                                </div>
                                <div class="min-w-0">
                                    <p
                                        class="text-sm font-medium text-gray-900 dark:text-white truncate"
                                    >
                                        {auth.user?.name || "User"}
                                    </p>
                                    <p
                                        class="text-xs text-gray-500 dark:text-gray-400 truncate"
                                    >
                                        {auth.user?.email || ""}
                                    </p>
                                </div>
                            </div>
                            <a
                                href="/settings/profile"
                                class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <User class="w-4 h-4" />
                                <span>{t("settings.profile")}</span>
                            </a>
                            {#if canAccessSettingsMenu}
                                <a
                                    href="/settings"
                                    class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                >
                                    <Settings class="w-4 h-4" />
                                    <span>{t("settings.title")}</span>
                                </a>
                            {/if}
                            <hr
                                class="my-1 border-gray-200 dark:border-gray-700"
                            />
                            <button
                                onclick={handleLogout}
                                class="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-danger-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <LogOut class="w-4 h-4" />
                                <span>{t("auth.logout")}</span>
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        </header>

        <!-- Shift Clock-in Warning Banner -->
        {#if showShiftWarning && shiftCheckDone}
            <div class="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700 px-4 py-3 flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <Clock class="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div>
                        <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">{t("shifts.notClockedIn")}</p>
                        <p class="text-xs text-amber-600 dark:text-amber-400">{t("shifts.clockInBeforeWork")}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button
                        onclick={clockIn}
                        class="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        {t("shifts.clockInNow")}
                    </button>
                    <a
                        href="/staff/shifts"
                        class="px-4 py-1.5 bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 text-sm font-medium rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/50 transition-colors"
                    >
                        {t("shifts.goToShifts")}
                    </a>
                </div>
            </div>
        {/if}

        <!-- Page Content -->
        <main class="flex-1 min-h-0 overflow-auto overscroll-contain">
            {#if authReady}
                {@render children()}
            {:else}
                <div class="flex items-center justify-center h-full">
                    <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            {/if}
        </main>
    </div>
</div>

<style>
    .scrollbar-thin::-webkit-scrollbar {
        width: 6px;
    }

    .scrollbar-thin::-webkit-scrollbar-track {
        background: transparent;
    }

    .scrollbar-thin::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 3px;
    }

    .scrollbar-thin::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.2);
    }

    :global(.dark) .scrollbar-thin::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
    }

    :global(.dark) .scrollbar-thin::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
    }
</style>
