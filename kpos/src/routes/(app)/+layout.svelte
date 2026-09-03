<script lang="ts">
    import { auth, shiftStore } from "$stores";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import { cn } from "$utils";
    import { t, setLanguage, currentLanguage } from "$lib/i18n/index.svelte";
    import { themeStore } from "$lib/stores/theme.svelte";
    import Sidebar from "$lib/components/layout/Sidebar.svelte";
    import StoreSelector from "$lib/components/layout/StoreSelector.svelte";
    import OpenShiftDialog from "$lib/components/OpenShiftDialog.svelte";
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

    // Inactivity auto-logout — 20 minutes of no user interaction
    const INACTIVITY_MS = 20 * 60 * 1000;
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

    // 429 fell through both isNetworkError (not a connection-level failure)
    // and isAuthError (not 401/403) uncounted, so the failure counter below
    // never tripped on it — polling kept retrying every 30-60s indefinitely
    // against an already-rate-limited endpoint, forever, with no backoff,
    // spamming the console for as long as the tab stayed open.
    function isRateLimited(err: unknown): boolean {
        return getResponseStatus(err) === 429;
    }

    async function ensureAuthReady(): Promise<boolean> {
        if (auth.isAuthenticated) return true;
        if (!auth.user) return false;
        return auth.refresh();
    }

    // Shift enforcement — who needs the "please clock in" nag banner.
    let showShiftWarning = $state(false);
    let shiftCheckDone = $state(false);
    let currentAttendance = $state<any>(null);
    let attendanceCheckDone = $state(false);

    // Who is exempt from the "must open a shift" requirement: super_admin
    // and store_owner (roleLevel <= 2 — tenant-wide owner tier) only.
    // Everyone else (managers, supervisors, cashiers, specialists —
    // roleLevel 3-7) must open a shift with a starting cash amount before
    // using the system. This used to cut off at roleLevel >= 5 (only
    // cashier-tier and below), silently exempting branch managers/
    // supervisors (levels 3-4) who also ring up sales day-to-day.
    function isShiftExempt(user: { isSuperAdmin?: boolean; requiresShift?: boolean } | null): boolean {
        // Per-user setting is authoritative. Legacy owner/super-admin accounts
        // remain exempt when the field is not present.
        return !!user?.isSuperAdmin || user?.requiresShift === false || auth.roleLevel <= 2;
    }

    async function checkActiveShift() {
        // Always fetch actual shift status, for every role — POS's checkout
        // guard (openPaymentModal in pos/+page.svelte) reads shiftStore.current
        // to decide whether to let ANY role start a payment (the backend now
        // enforces an open shift for every sale, no role exemption). Only the
        // blocking dialog below is restricted by isShiftExempt — an owner who
        // already clocked in must not be told "you have no shift" just
        // because this function skipped fetching their real status.
        const user = auth.user;
        if (!user) {
            shiftCheckDone = true;
            return;
        }
        const needsShift = !isShiftExempt(user);
        try {
            const res = await api.get('sales/shifts/current').json<any>();
            shiftStore.set(res.success ? res.data : null);
            // Cash shifts are opened explicitly by POS operators. They must
            // never be presented as work attendance or block managers and
            // non-cash staff at application login.
            showShiftWarning = false;
        } catch {
            shiftStore.set(null);
            showShiftWarning = false;
        } finally {
            shiftCheckDone = true;
        }
    }

    async function checkAttendance() {
        if (!auth.hasPermission('attendance:clock')) {
            currentAttendance = null;
            attendanceCheckDone = true;
            return;
        }
        try {
            const response = await api.get('staff/attendance/current').json<any>();
            currentAttendance = response.success ? response.data : null;
        } catch {
            currentAttendance = null;
        } finally {
            attendanceCheckDone = true;
        }
    }

    async function handleOpenShift(openingBalance: number): Promise<boolean> {
        try {
            const res = await api.post('sales/shifts/open', { json: { openingBalance } }).json<any>();
            if (res.success) {
                shiftStore.set(res.data);
                showShiftWarning = false;
                return true;
            }
            return false;
        } catch {
            return false;
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
            if (isNetworkError(e) || isRateLimited(e)) layoutPollFailures++;
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
            if (isNetworkError(e) || isRateLimited(e)) layoutPollFailures++;
        }
    }

    async function loadPendingRequests() {
        const user = auth.user;
        if (!user) return;
        // GET /admin/requests/count requires the platform-only `admin:view`
        // permission (never granted to any tenant role, including
        // store_owner) — roleLevel <= 2 also matches a tenant's own owner,
        // who is NOT a platform admin, so that check alone 403'd this call
        // on every page load for every store owner. Must be isSuperAdmin only.
        if (!user.isSuperAdmin) return;
        if (layoutPollFailures >= MAX_LAYOUT_FAILURES) return;
        if (!(await ensureAuthReady())) return;
        try {
            const res = await api.get('admin/requests/count').json<any>();
            if (res.success) pendingRequestsCount = res.data?.pending || 0;
            layoutPollFailures = 0;
        } catch (e) {
            if (isAuthError(e)) return;
            if (isNetworkError(e) || isRateLimited(e)) layoutPollFailures++;
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
        const isAdmin = user?.isSuperAdmin || auth.roleLevel <= 2;
        const currentPath = $page.url.pathname;
        const storeExemptPaths = ['/store-request', '/help'];
        if (!isAdmin && auth.accessibleStores.length === 0 && !storeExemptPaths.includes(currentPath)) {
            goto('/store-request');
            return;
        }

        // Ensure rules + the menu-derived route fallback are loaded (safety
        // net for first login or cleared localStorage cache). See
        // accessibleMenuRoutes/rulesAndMenuLoaded in the auth store for why
        // both exist (custom roles never get userRules entries, only the
        // rules system does) and why the loaded-flag matters below.
        if (!auth.rulesAndMenuLoaded && (auth.userRules.length === 0 || auth.accessibleMenuRoutes.length === 0)) {
            auth.loadRulesAndMenu();
        }

        // Route-level permission guard: redirect to dashboard if user has no access to current path.
        // Only shell/profile/help routes are universally reachable. Operations
        // and settings pages must still be derived from backend access so the
        // UI cannot promise a capability the API will reject.
        const alwaysAllowed = ['/dashboard', '/help', '/settings/profile', '/store-request', '/staff/attendance'];
        // Fires once both arrays have settled at least once — either they hold
        // real entries, or the load genuinely came back empty (a role with no
        // granted routes), which must fail closed rather than fall through to
        // "allow everything" for the rest of the session.
        if (!user?.isSuperAdmin && auth.rulesAndMenuLoaded && !auth.authorizationUnavailable && currentPath !== '/dashboard') {
            const pathAllowed = alwaysAllowed.some(p => currentPath === p || currentPath.startsWith(p + '/'))
                || auth.hasRouteAccess(currentPath);
            if (!pathAllowed) {
                goto('/dashboard');
                return;
            }
        }

        checkActiveShift();
        checkAttendance();

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

    // Re-run route guard reactively when rules (or the menu-route fallback)
    // load after initial mount or when page changes
    $effect(() => {
        const user = auth.user;
        const rules = auth.userRules;
        const menuRoutes = auth.accessibleMenuRoutes;
        const currentPath = $page.url.pathname;
        if (!user || user.isSuperAdmin || (rules.length === 0 && menuRoutes.length === 0)) return;
        const alwaysAllowed = ['/dashboard', '/help', '/settings/profile', '/store-request', '/staff/attendance'];
        const pathAllowed = alwaysAllowed.some(p => currentPath === p || currentPath.startsWith(p + '/'))
            || auth.hasRouteAccess(currentPath);
        if (!auth.authorizationUnavailable && !pathAllowed && currentPath !== '/dashboard') {
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

                <!-- Work attendance is separate from the POS cash drawer. -->
                {#if attendanceCheckDone}
                    <a
                        href="/staff/attendance"
                        class={cn(
                            "hidden md:flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors",
                            currentAttendance
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
                        )}
                        title={currentAttendance ? "ກົດເພື່ອອອກວຽກ" : "ກົດເພື່ອເຂົ້າວຽກ"}
                    >
                        <Clock class="h-3.5 w-3.5" />
                        <span class="text-xs font-semibold">{currentAttendance ? "ກຳລັງເຮັດວຽກ" : (auth.hasPermission('attendance:clock') ? "ເຂົ້າວຽກ" : "Attendance")}</span>
                    </a>
                {/if}

                <!-- POS Cash Shift Status Indicator -->
                {#if shiftCheckDone && !isShiftExempt(auth.user)}
                    {#if shiftStore.current}
                        <a
                            href="/staff/shifts?action=close"
                            class="hidden md:flex items-center gap-2 px-3 py-1.5 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg hover:bg-danger-50 hover:border-danger-200 dark:hover:bg-danger-900/20 dark:hover:border-danger-800 transition-colors group"
                            title="ກະເງິນ POS ເປີດຢູ່"
                        >
                            <span class="relative flex h-2.5 w-2.5 group-hover:hidden">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
                                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-success-500"></span>
                            </span>
                            <span class="text-xs font-medium text-success-700 dark:text-success-400 group-hover:hidden">ກະເງິນ POS</span>
                            <span class="hidden group-hover:inline text-xs font-medium text-danger-600 dark:text-danger-400">ປິດກະ</span>
                        </a>
                    {:else}
                        <button
                            onclick={() => (showShiftWarning = true)}
                            class="hidden md:flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                        >
                            <Clock class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span class="text-xs font-medium text-amber-700 dark:text-amber-400">ເປີດກະ POS</span>
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
                    class="flex p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
                        aria-expanded={isUserMenuOpen}
                        aria-haspopup="menu"
                        aria-controls="user-menu"
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
                            id="user-menu"
                            role="menu"
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

        <!-- Cash drawer dialog opens only when the user explicitly requests
             it. Work attendance uses /staff/attendance and needs no cash. -->
        <OpenShiftDialog open={showShiftWarning && shiftCheckDone} onSubmit={handleOpenShift} />

        <!-- Page Content -->
        <main class="flex-1 min-h-0 overflow-auto overscroll-contain">
            {#if auth.authorizationUnavailable}
                <div class="mx-4 mt-4 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                    <div>
                        <p class="text-sm font-semibold">ບໍ່ສາມາດໂຫຼດສິດການໃຊ້ງານໄດ້</p>
                        <p class="text-xs opacity-80">Authorization service unavailable. ກົດ Retry ເພື່ອລອງໃໝ່.</p>
                    </div>
                    <button
                        type="button"
                        onclick={() => auth.loadRulesAndMenu()}
                        class="shrink-0 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
                    >Retry</button>
                </div>
            {/if}
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
