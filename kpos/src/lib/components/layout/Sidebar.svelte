<script lang="ts">
    import { page } from "$app/stores";
    import { cn } from "$utils";
    import { t } from "$lib/i18n/index.svelte";
    import { auth } from "$stores";
    import { api } from "$lib/api";
    import { fade } from "svelte/transition";
    import { onMount } from "svelte";
    import {
        Store,
        ShoppingCart,
        Package,
        Users,
        BarChart3,
        Settings,
        LogOut,
        ChevronDown,
        Boxes,
        Tags,
        Building2,
        LayoutDashboard,
        Barcode,
        FileText,
        Gift,
        UtensilsCrossed,
        CreditCard,
        UserCog,
        Truck,
        ClipboardList,
        DollarSign,
        Percent,
        TicketPercent,
        Receipt,
        Printer,
        QrCode,
        Scale,
        Box,
        ArrowRightLeft,
        PackageSearch,
        CalendarClock,
        TrendingUp,
        TrendingDown,
        PieChart,
        FileSpreadsheet,
        Wallet,
        BellRing,
        Plug,
        Monitor,
        HelpCircle,
        Crown,
        Layers,
        ShoppingBag,
        ChefHat,
        ClipboardCheck,
        Timer,
        Star,
        Heart,
        PackageX,
        Shield,
        ShieldCheck,
        FileCheck,
        Key,
        History,
        Briefcase,
        type Icon,
    } from "lucide-svelte";

    interface MenuItem {
        id: string;
        name: string;
        nameKey?: string;
        href?: string;
        icon: typeof Icon;
        permission?: string;
        badge?: string | number;
        badgeColor?: string;
        children?: MenuItem[];
    }

    let { isOpen = true, onToggle }: {
        isOpen?: boolean;
        onToggle?: () => void;
    } = $props();

    let expandedMenus = $state<Set<string>>(new Set(["sales"]));
    let hoveredMenu = $state<string | null>(null);
    let heldOrdersCount = $state(0);
    let pendingCreditCount = $state(0);
    let menuLoaded = $state(false);
    let badgePollFailures = $state(0);
    const MAX_BADGE_FAILURES = 3;

    // Helper: check if a menu item should be visible based on rules + permissions
    function isMenuVisible(item: MenuItem): boolean {
        // No permission required = always visible
        if (!item.permission && !item.href) return true;
        // Super admin sees everything
        if (auth.user?.isSuperAdmin) return true;
        // If rules are loaded, use route-based check
        if (auth.userRules.length > 0 && item.href) {
            return auth.hasRouteAccess(item.href);
        }
        // Fall back to permission check
        if (item.permission) return auth.hasPermission(item.permission);
        return true;
    }

    function isParentVisible(item: MenuItem): boolean {
        if (!item.children) return isMenuVisible(item);
        // Parent is visible if at least one child is visible
        return item.children.some(child => isMenuVisible(child));
    }

    // Icon resolver: maps backend icon string names to Svelte components
    const iconMap: Record<string, typeof Icon> = {
        LayoutDashboard, ShoppingCart, Package, Users, BarChart3, Settings,
        Boxes, Tags, Building2, Barcode, FileText, Gift, UtensilsCrossed,
        CreditCard, UserCog, Truck, ClipboardList, DollarSign, Percent,
        TicketPercent, Receipt, Printer, QrCode, Scale, Box, ArrowRightLeft,
        PackageSearch, CalendarClock, TrendingUp, TrendingDown, PieChart,
        FileSpreadsheet, Wallet, BellRing, Plug, Monitor, HelpCircle,
        Crown, Layers, ShoppingBag, ChefHat, ClipboardCheck, Timer,
        Star, Heart, PackageX, Shield, ShieldCheck, FileCheck, Key, History, Briefcase,
        Store, LogOut, ChevronDown,
    };

    function resolveIcon(name?: string | null): typeof Icon {
        if (!name) return Package;
        return iconMap[name] || Package;
    }

    // Auto-expand only the active parent menu; collapse all others (accordion)
    $effect(() => {
        const pathname = $page.url.pathname;
        let activeId: string | null = null;
        for (const item of menuItems) {
            if (item.children) {
                const hasActiveChild = item.children.some(
                    (child) => child.href && (pathname === child.href || pathname.startsWith(child.href + "/"))
                );
                if (hasActiveChild) { activeId = item.id; break; }
            }
        }
        if (activeId) {
            expandedMenus = new Set([activeId]);
        }
    });

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

    // Load held orders count
    async function loadHeldOrdersCount() {
        if (badgePollFailures >= MAX_BADGE_FAILURES) return;
        if (!(await ensureAuthReady())) return;
        try {
            const response = await api.get("sales/held?limit=1").json<any>();
            if (response.success && response.data) {
                heldOrdersCount = response.pagination?.total ?? response.meta?.total ?? response.data.length;
            }
            badgePollFailures = 0;
        } catch (err) {
            if (isAuthError(err)) return;
            if (isNetworkError(err)) {
                badgePollFailures++;
            }
        }
    }

    // Load pending credit sales count
    async function loadPendingCreditCount() {
        if (badgePollFailures >= MAX_BADGE_FAILURES) return;
        if (!(await ensureAuthReady())) return;
        try {
            const response = await api.get("sales/credit").json<any>();
            if (response.success && response.data) {
                pendingCreditCount = response.data.filter((s: any) =>
                    s.status === 'pending' || s.status === 'partial' || s.status === 'overdue'
                ).length;
            }
            badgePollFailures = 0;
        } catch (err) {
            if (isAuthError(err)) return;
            if (isNetworkError(err)) {
                badgePollFailures++;
            }
        }
    }

    let menuItems = $state<MenuItem[]>([]);

    function mapApiMenuItem(raw: any): MenuItem {
        const item: MenuItem = {
            id: raw.key,
            name: raw.labelLao || raw.label,
            nameKey: raw.key ? `nav.${raw.key.replace(/\./g, '_')}` : undefined,
            icon: resolveIcon(raw.icon),
            permission: raw.requiredPermission || undefined,
            href: raw.path || undefined,
        };
        if (raw.children?.length > 0) {
            item.children = raw.children.map(mapApiMenuItem);
        }
        return item;
    }

    let menuLoading = $state(true);

    async function loadMenuFromApi() {
        menuLoading = true;
        try {
            if (!(await ensureAuthReady())) return;
            const res = await api.get('users/me/menu').json<any>();
            if (res.success && Array.isArray(res.data)) {
                menuItems = res.data.map(mapApiMenuItem);
                if (menuItems.length === 0 && auth.user?.isSuperAdmin) {
                    console.error('[Sidebar] Super admin has no menu items — run seed to populate menu_permissions table');
                }
            }
        } catch (err) {
            if (isAuthError(err)) return;
            console.error('[Sidebar] Failed to load menu from API:', err);
        } finally {
            menuLoading = false;
            menuLoaded = true;
        }
    }

    onMount(() => {
        loadMenuFromApi();
        loadHeldOrdersCount();
        loadPendingCreditCount();
        // Refresh badge counts every 30 seconds
        const interval = setInterval(() => {
            loadHeldOrdersCount();
            loadPendingCreditCount();
        }, 30000);
        // On tab focus: reset failure counter so we retry the server after coming back
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                badgePollFailures = 0;
                loadHeldOrdersCount();
                loadPendingCreditCount();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    });

    function toggleMenu(menuId: string) {
        // Accordion: opening a menu collapses all others
        if (expandedMenus.has(menuId)) {
            expandedMenus = new Set();
        } else {
            expandedMenus = new Set([menuId]);
        }
    }

    function isActive(href?: string): boolean {
        if (!href) return false;
        const pathname = $page.url.pathname;
        if (pathname === href) return true;
        
        // Find the most specific match among all menu items
        let bestMatch = "";
        for (const item of menuItems) {
            if (item.href && pathname.startsWith(item.href) && item.href.length > bestMatch.length) {
                bestMatch = item.href;
            }
            if (item.children) {
                for (const child of item.children) {
                    if (child.href && pathname.startsWith(child.href) && child.href.length > bestMatch.length) {
                        bestMatch = child.href;
                    }
                }
            }
        }
        
        // It's only active if this href is the best match
        if (href === bestMatch) return true;
        
        // Fallback for paths that aren't in the menu exactly but share a prefix (like /documents/invoices/123)
        // We only use this if we didn't find a better match
        if (href !== "/" && pathname.startsWith(href + "/") && bestMatch === href) return true;
        
        return false;
    }

    function isParentActive(item: MenuItem): boolean {
        if (item.children) {
            return item.children.some((child) => isActive(child.href));
        }
        return isActive(item.href);
    }

    function getBadgeClass(color?: string): string {
        switch (color) {
            case "error":
                return "bg-danger-500 text-white";
            case "warning":
                return "bg-warning-500 text-white";
            case "success":
                return "bg-success-500 text-white";
            default:
                return "bg-primary-500 text-white";
        }
    }

    function getDynamicBadge(itemId: string): number | null {
        if (itemId === "held-orders") {
            return heldOrdersCount > 0 ? heldOrdersCount : null;
        }
        if (itemId === "credit-sales") {
            return pendingCreditCount > 0 ? pendingCreditCount : null;
        }
        return null;
    }
</script>

<aside
    class={cn(
        "flex flex-col h-full bg-white dark:bg-gray-900",
        "border-r border-gray-200 dark:border-gray-800",
        "transition-all duration-300 ease-out",
        isOpen ? "w-64" : "w-20",
    )}
>
    <!-- Logo -->
    <div
        class="flex items-center gap-3 h-16 px-4 border-b border-gray-200 dark:border-gray-800 shrink-0"
    >
        {#if auth.activeStore?.storeName && false}
            <!-- reserved for branch logo img -->
        {/if}
        <div
            class="flex items-center justify-center w-10 h-10 rounded-xl bg-linear-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 shrink-0"
        >
            <Store class="w-5 h-5" />
        </div>
        {#if isOpen}
            <div class="flex flex-col min-w-0" transition:fade={{ duration: 150 }}>
                <span class="text-base font-bold text-gray-900 dark:text-white truncate leading-tight">
                    {auth.activeStore?.branchName || auth.activeStore?.storeName || 'KPOS'}
                </span>
                <span class="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {auth.activeStore?.storeName && auth.activeStore.storeName !== auth.activeStore.branchName
                        ? auth.activeStore.storeName
                        : 'Enterprise POS'}
                </span>
            </div>
        {/if}
    </div>

    <!-- Navigation -->
    <nav class={cn("flex-1 py-4 px-3", isOpen ? "overflow-y-auto scrollbar-thin" : "overflow-visible")}>
        {#if menuLoading}
            <ul class="space-y-1">
                {#each { length: isOpen ? 8 : 6 } as _, i}
                    <li class={cn("px-3 py-2.5 rounded-xl flex items-center gap-3", !isOpen && "justify-center")}>
                        <div class="w-5 h-5 rounded bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0"></div>
                        {#if isOpen}
                            <div class="h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse flex-1" style="width: {60 + (i * 13) % 30}%"></div>
                        {/if}
                    </li>
                {/each}
            </ul>
        {:else}
        <ul class="space-y-1">
            {#if menuItems.length === 0}
                <!-- Fallback navigation when API fails to load menu -->
                <li>
                    <a href="/dashboard" class={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors", !isOpen && "justify-center")}>
                        <LayoutDashboard class="w-5 h-5 shrink-0" />
                        {#if isOpen}<span>Dashboard</span>{/if}
                    </a>
                </li>
                <li>
                    <a href="/pos" class={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors", !isOpen && "justify-center")}>
                        <ShoppingCart class="w-5 h-5 shrink-0" />
                        {#if isOpen}<span>POS</span>{/if}
                    </a>
                </li>
                {#if isOpen}
                    <li class="mt-2 px-3 py-2">
                        <p class="text-xs text-warning-500 dark:text-warning-400 flex items-center gap-1.5">
                            <HelpCircle class="w-3.5 h-3.5 shrink-0" />
                            ໂຫຼດເມນູບໍ່ໄດ້ — ກວດສອບການເຊື່ອມຕໍ່
                        </p>
                    </li>
                {/if}
            {:else}
            {#each menuItems as item}
                {#if isParentVisible(item)}
                    <li class="relative">
                        {#if item.children}
                            <!-- Parent Menu with Children -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                onmouseenter={() => { if (!isOpen) hoveredMenu = item.id; }}
                                onmouseleave={() => { if (!isOpen) hoveredMenu = null; }}
                            >
                                <button
                                    onclick={() => { if (isOpen) toggleMenu(item.id); }}
                                    class={cn(
                                        "flex items-center w-full gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                                        isParentActive(item)
                                            ? "bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400"
                                            : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
                                        !isOpen && "justify-center",
                                    )}
                                    title={!isOpen ? (item.nameKey && t(item.nameKey) !== item.nameKey ? t(item.nameKey) : item.name) : undefined}
                                >
                                    <item.icon class="w-5 h-5 shrink-0" />
                                    {#if isOpen}
                                        <span class="flex-1 text-left"
                                            >{item.nameKey && t(item.nameKey) !== item.nameKey
                                                ? t(item.nameKey)
                                                : item.name}</span
                                        >
                                        <ChevronDown
                                            class={cn(
                                                "w-4 h-4 transition-transform duration-200",
                                                expandedMenus.has(item.id)
                                                    ? "rotate-180"
                                                    : "",
                                            )}
                                        />
                                    {/if}
                                </button>

                                <!-- Collapsed Popup Submenu -->
                                {#if !isOpen && hoveredMenu === item.id}
                                    <div
                                        class="absolute left-full top-0 ml-2 z-[60] min-w-56 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-2"
                                        transition:fade={{ duration: 100 }}
                                    >
                                        <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-800 mb-1">
                                            <span class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                                {item.nameKey ? t(item.nameKey) : item.name}
                                            </span>
                                        </div>
                                        {#each item.children as child}
                                            {#if isMenuVisible(child)}
                                                <a
                                                    href={child.href}
                                                    class={cn(
                                                        "flex items-center gap-3 mx-1 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                                                        isActive(child.href)
                                                            ? "bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400 font-medium"
                                                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200",
                                                    )}
                                                >
                                                    <child.icon class="w-4 h-4 shrink-0" />
                                                    <span class="flex-1"
                                                        >{child.nameKey && t(child.nameKey) !== child.nameKey
                                                            ? t(child.nameKey)
                                                            : child.name}</span
                                                    >
                                                    {#if child.badge || getDynamicBadge(child.id)}
                                                        <span
                                                            class={cn(
                                                                "px-1.5 py-0.5 text-xs font-medium rounded-full",
                                                                getBadgeClass(child.badgeColor),
                                                            )}
                                                        >
                                                            {getDynamicBadge(child.id) ?? child.badge}
                                                        </span>
                                                    {/if}
                                                </a>
                                            {/if}
                                        {/each}
                                    </div>
                                {/if}
                            </div>

                            <!-- Expanded Submenu (sidebar open) -->
                            {#if isOpen}
                                {#if expandedMenus.has(item.id)}
                                    <ul
                                        class="mt-1 ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-1"
                                    >
                                    {#each item.children as child}
                                        {#if isMenuVisible(child)}
                                            <li>
                                                {#if child.children?.length}
                                                    <!-- Level 2 parent (grandparent submenu) -->
                                                    <button
                                                        onclick={() => toggleMenu(child.id)}
                                                        class={cn(
                                                            "flex items-center w-full gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
                                                            child.children.some(gc => isActive(gc.href))
                                                                ? "text-primary-600 dark:text-primary-400 font-medium"
                                                                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300",
                                                        )}
                                                    >
                                                        <child.icon class="w-4 h-4 shrink-0" />
                                                        <span class="flex-1 text-left">{child.nameKey && t(child.nameKey) !== child.nameKey ? t(child.nameKey) : child.name}</span>
                                                        <ChevronDown class={cn("w-3 h-3 transition-transform duration-200", expandedMenus.has(child.id) ? "rotate-180" : "")} />
                                                    </button>
                                                    {#if expandedMenus.has(child.id)}
                                                        <ul class="mt-1 ml-3 pl-3 border-l border-gray-200 dark:border-gray-700 space-y-0.5">
                                                            {#each child.children as grandchild}
                                                                {#if isMenuVisible(grandchild)}
                                                                    <li>
                                                                        <a
                                                                            href={grandchild.href}
                                                                            class={cn(
                                                                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-all duration-200",
                                                                                isActive(grandchild.href)
                                                                                    ? "bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400 font-medium"
                                                                                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800",
                                                                            )}
                                                                        >
                                                                            <grandchild.icon class="w-3.5 h-3.5 shrink-0" />
                                                                            <span>{grandchild.nameKey && t(grandchild.nameKey) !== grandchild.nameKey ? t(grandchild.nameKey) : grandchild.name}</span>
                                                                        </a>
                                                                    </li>
                                                                {/if}
                                                            {/each}
                                                        </ul>
                                                    {/if}
                                                {:else}
                                                    <a
                                                        href={child.href}
                                                        class={cn(
                                                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
                                                            isActive(child.href)
                                                                ? "bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400 font-medium"
                                                                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300",
                                                        )}
                                                    >
                                                        <child.icon
                                                            class="w-4 h-4 shrink-0"
                                                        />
                                                        <span class="flex-1"
                                                            >{child.nameKey && t(child.nameKey) !== child.nameKey
                                                                ? t(child.nameKey)
                                                                : child.name}</span
                                                        >
                                                        {#if child.badge || getDynamicBadge(child.id)}
                                                            <span
                                                                class={cn(
                                                                    "px-1.5 py-0.5 text-xs font-medium rounded-full",
                                                                    getBadgeClass(
                                                                        child.badgeColor,
                                                                    ),
                                                                )}
                                                            >
                                                                {getDynamicBadge(child.id) ?? child.badge}
                                                            </span>
                                                        {/if}
                                                    </a>
                                                {/if}
                                            </li>
                                        {/if}
                                    {/each}
                                </ul>
                                {/if}
                            {/if}
                        {:else}
                            <!-- Single Menu Item -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                onmouseenter={() => { if (!isOpen) hoveredMenu = item.id; }}
                                onmouseleave={() => { if (!isOpen) hoveredMenu = null; }}
                            >
                                <a
                                    href={item.href}
                                    class={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                                        isActive(item.href)
                                            ? "bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400"
                                            : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
                                        !isOpen && "justify-center",
                                    )}
                                    title={!isOpen ? (item.nameKey && t(item.nameKey) !== item.nameKey ? t(item.nameKey) : item.name) : undefined}
                                >
                                    <item.icon class="w-5 h-5 shrink-0" />
                                    {#if isOpen}
                                        <span
                                            >{item.nameKey && t(item.nameKey) !== item.nameKey
                                                ? t(item.nameKey)
                                                : item.name}</span
                                        >
                                    {/if}
                                </a>
                                <!-- Collapsed Tooltip for single items -->
                                {#if !isOpen && hoveredMenu === item.id}
                                    <div
                                        class="absolute left-full top-0 ml-2 z-[60] bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 px-3 py-2 whitespace-nowrap"
                                        transition:fade={{ duration: 100 }}
                                    >
                                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            {item.nameKey ? t(item.nameKey) : item.name}
                                        </span>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </li>
                {/if}
            {/each}
            {/if}
        </ul>
        {/if}
    </nav>

    <!-- User Section -->
    <div
        class="border-t border-gray-200 dark:border-gray-800 p-3 shrink-0"
    >
        <div
            class={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl",
                "bg-gray-50 dark:bg-gray-800/50",
            )}
        >
            <div
                class="w-9 h-9 rounded-full bg-linear-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-medium"
            >
                {auth.user?.name?.charAt(0)}
            </div>
            {#if isOpen}
                <div class="flex-1 min-w-0">
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
            {/if}
        </div>
    </div>
</aside>
