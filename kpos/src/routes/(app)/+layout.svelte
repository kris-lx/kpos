<script lang="ts">
    import { auth } from "$stores";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import { cn } from "$utils";
    import { t, setLanguage, currentLanguage } from "$lib/i18n/index.svelte";
    import { themeStore } from "$lib/stores/theme.svelte";
    import Sidebar from "$lib/components/layout/Sidebar.svelte";
    import StoreSelector from "$lib/components/layout/StoreSelector.svelte";
    import { api } from "$lib/api";
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
        Search,
        Maximize,
        Minimize,
        Monitor,
        X,
        Clock,
    } from "lucide-svelte";

    let { children } = $props();

    let isSidebarOpen = $state(true);
    let isMobileSidebarOpen = $state(false);
    let isUserMenuOpen = $state(false);
    let isLangMenuOpen = $state(false);
    let isNotificationOpen = $state(false);
    let isFullscreen = $state(false);
    let searchQuery = $state("");

    // Notifications (loaded from API)
    let notifications = $state<Array<{id: string; title: string; message: string; time: string; read: boolean; type: string}>>([]);
    let unreadCount = $state(0);
    let pendingRequestsCount = $state(0);

    // Shift enforcement
    const SHIFT_REQUIRED_ROLES = ['cashier', 'store_manager', 'branch_admin', 'inventory_staff', 'waiter', 'kitchen_staff'];
    let showShiftWarning = $state(false);
    let currentShift = $state<any>(null);
    let shiftCheckDone = $state(false);

    async function checkActiveShift() {
        const user = auth.user;
        if (!user || !SHIFT_REQUIRED_ROLES.includes(user.role)) {
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
        } catch (e) {
            // Silently fail - notifications are non-critical
        }
    }

    async function loadPendingRequests() {
        const user = auth.user;
        if (!user) return;
        const isAdminUser = user.isSuperAdmin || user.role === 'admin' || user.role === 'super_admin';
        if (!isAdminUser) return;
        try {
            const res = await api.get('admin/requests/count').json<any>();
            if (res.success) pendingRequestsCount = res.data?.pending || 0;
        } catch (e) {
            // Silently fail
        }
    }

    const languages = [
        { code: "th", name: "ภาษาไทย", flag: "🇹🇭" },
        { code: "en", name: "English", flag: "🇺🇸" },
        { code: "lo", name: "ພາສາລາວ", flag: "🇱🇦" },
    ];

    onMount(() => {
        if (!auth.isAuthenticated) {
            goto("/login");
            return;
        }

        // If user has no store access and is not admin/super admin, send to store-request
        const user = auth.user;
        const isAdmin = user?.isSuperAdmin || user?.role === 'admin' || user?.role === 'super_admin';
        const currentPath = $page.url.pathname;
        const storeExemptPaths = ['/store-request', '/help'];
        if (!isAdmin && auth.accessibleStores.length === 0 && !storeExemptPaths.includes(currentPath)) {
            goto('/store-request');
            return;
        }

        // Load notifications from API
        loadNotifications();
        loadPendingRequests();
        // Auto-refresh notifications every 60 seconds
        const notifInterval = setInterval(() => { loadNotifications(); loadPendingRequests(); }, 60 * 1000);

        // Check if user needs to clock in
        checkActiveShift();

        // Handle fullscreen change
        document.addEventListener("fullscreenchange", () => {
            isFullscreen = !!document.fullscreenElement;
        });

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

        return () => clearInterval(notifInterval);
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

<div class="min-h-screen bg-gray-100 dark:bg-gray-950 flex">
    <!-- Desktop Sidebar -->
    <div class="hidden lg:block fixed inset-y-0 left-0 z-50">
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
            class="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-sm"
            onclick={() => (isMobileSidebarOpen = false)}
        ></div>
    {/if}

    <!-- Mobile Sidebar -->
    <div
        class={cn(
            "fixed inset-y-0 left-0 z-50 lg:hidden",
            "transition-transform duration-300 ease-out",
            isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
    >
        <div class="relative h-full">
            <Sidebar isOpen={true} />
            <button
                onclick={() => (isMobileSidebarOpen = false)}
                class="absolute top-4 right-4 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500"
            >
                <X class="w-5 h-5" />
            </button>
        </div>
    </div>

    <!-- Main Content -->
    <div
        class={cn(
            "flex-1 flex flex-col min-h-screen transition-all duration-300",
            isSidebarOpen ? "lg:ml-64" : "lg:ml-20",
        )}
    >
        <!-- Top Header -->
        <header
            class="sticky top-0 z-30 h-16 bg-white/95 dark:bg-gray-900/95 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 backdrop-blur-lg"
        >
            <!-- Left -->
            <div class="flex items-center gap-4">
                <button
                    onclick={() => (isMobileSidebarOpen = true)}
                    class="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    <Menu class="w-5 h-5" />
                </button>
                <button
                    onclick={() => (isSidebarOpen = !isSidebarOpen)}
                    class="hidden lg:flex p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    <Menu class="w-5 h-5" />
                </button>

                <!-- Search -->
                <div class="relative hidden sm:block">
                    <Search
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                    />
                    <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder={t("common.search")}
                        class="w-64 pl-10 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
                    />
                </div>

                <!-- Store Selector -->
                {#if auth.accessibleStores.length > 0}
                    <StoreSelector />
                {/if}
            </div>

            <!-- Right -->
            <div class="flex items-center gap-2">
                <!-- Fullscreen Toggle -->
                <button
                    onclick={toggleFullscreen}
                    class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
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
                    class="hidden md:flex p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Customer Display"
                >
                    <Monitor class="w-5 h-5" />
                </a>

                <!-- Theme Toggle -->
                <button
                    onclick={toggleTheme}
                    class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Toggle Theme"
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
                        onclick={() =>
                            (isNotificationOpen = !isNotificationOpen)}
                        class="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <Bell class="w-5 h-5" />
                        {#if unreadCount > 0}
                            <span
                                class="absolute top-1 right-1 w-4 h-4 bg-error-500 text-white text-xs rounded-full flex items-center justify-center font-medium"
                            >
                                {unreadCount}
                            </span>
                        {/if}
                    </button>
                    {#if pendingRequestsCount > 0}
                        <a href="/admin/requests"
                            class="absolute -top-1 -left-1 min-w-4.5 h-4.5 px-1 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm pointer-events-auto"
                            title="{pendingRequestsCount} ຄຳຂໍລໍຖ້າອະນຸມັດ"
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
                                    ແຈ້ງເຕືອນ
                                </h3>
                                {#if unreadCount > 0}
                                    <button
                                        onclick={markAllRead}
                                        class="text-xs text-primary-600 hover:underline"
                                    >
                                        ອ່ານທັງໝົດ
                                    </button>
                                {/if}
                            </div>
                            <div class="max-h-80 overflow-y-auto">
                                {#if pendingRequestsCount > 0}
                                    <a href="/admin/requests" onclick={() => isNotificationOpen = false}
                                        class="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors border-b border-amber-100 dark:border-amber-800/50">
                                        <span class="text-lg shrink-0">📋</span>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm font-semibold text-amber-900 dark:text-amber-200">ຄຳຂໍລໍຖ້າອະນຸມັດ</p>
                                            <p class="text-xs text-amber-700 dark:text-amber-400">{pendingRequestsCount} ຄຳຂໍໃໝ່ ລໍຖ້າການຕອບຮັບ</p>
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
                                    ເບິ່ງທັງໝົດ
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
                            class="w-8 h-8 rounded-full bg-linear-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-medium shadow-sm"
                        >
                            {auth.user?.name?.charAt(0) || "U"}
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
                                class="px-4 py-3 border-b border-gray-200 dark:border-gray-700"
                            >
                                <p
                                    class="text-sm font-medium text-gray-900 dark:text-white"
                                >
                                    {auth.user?.name || "User"}
                                </p>
                                <p
                                    class="text-xs text-gray-500 dark:text-gray-400"
                                >
                                    {auth.user?.email || ""}
                                </p>
                            </div>
                            <a
                                href="/settings/profile"
                                class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <User class="w-4 h-4" />
                                <span>ໂປຣໄຟລ໌</span>
                            </a>
                            <a
                                href="/settings"
                                class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <Settings class="w-4 h-4" />
                                <span>ຕັ້ງຄ່າ</span>
                            </a>
                            <hr
                                class="my-1 border-gray-200 dark:border-gray-700"
                            />
                            <button
                                onclick={handleLogout}
                                class="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-error-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <LogOut class="w-4 h-4" />
                                <span>ອອກຈາກລະບົບ</span>
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
                        <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">ທ່ານຍັງບໍ່ໄດ້ເປີດກະວຽກ</p>
                        <p class="text-xs text-amber-600 dark:text-amber-400">ກະລຸນາເປີດກະວຽກກ່ອນເລີ່ມວຽກ</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button
                        onclick={clockIn}
                        class="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        ເປີດກະວຽກດຽວນີ້
                    </button>
                    <a
                        href="/staff/shifts"
                        class="px-4 py-1.5 bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 text-sm font-medium rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/50 transition-colors"
                    >
                        ໄປໜ້າກະວຽກ
                    </a>
                </div>
            </div>
        {/if}

        <!-- Page Content -->
        <main class="flex-1 overflow-auto">
            {@render children()}
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
