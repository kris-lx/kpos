<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { formatCurrency, formatDateTime } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import {
        Plus,
        Eye,
        Loader2,
        ChevronLeft,
        ChevronRight,
        ChefHat,
        CheckCircle,
        UtensilsCrossed,
        Clock,
        RefreshCw,
        Search,
        Filter,
        Timer,
        AlertCircle,
        XCircle,
        Bell,
        Flame,
        ShoppingBag,
        Calendar,
        Users,
    } from "lucide-svelte";

    // State
    let orders = $state<any[]>([]);
    let isLoading = $state(false);
    let filterStatus = $state("active");
    let searchQuery = $state("");
    let refreshInterval: ReturnType<typeof setInterval>;

    // Pagination
    let currentPage = $state(1);
    let itemsPerPage = $state(12);

    // Filter options
    const statusFilters = [
        { id: "active", labelKey: "restaurant.activeOrders", icon: Flame, color: "orange" },
        { id: "pending", labelKey: "restaurant.pending", icon: Timer, color: "gray" },
        { id: "preparing", labelKey: "restaurant.preparing", icon: ChefHat, color: "blue" },
        { id: "ready", labelKey: "restaurant.readyToServe", icon: Bell, color: "green" },
        { id: "served", labelKey: "restaurant.served", icon: CheckCircle, color: "emerald" },
        { id: "all", labelKey: "common.all", icon: ShoppingBag, color: "purple" },
    ];

    async function loadData() {
        isLoading = true;
        try {
            const res = await api.get(`restaurant/orders?status=${filterStatus}`).json<any>();
            orders = res.data?.data || res.data || [];
            currentPage = 1;
        } catch (e) {
            console.error("Failed to load orders:", e);
            toast.error(t("common.error"));
        } finally {
            isLoading = false;
        }
    }

    async function updateOrderStatus(orderId: string, status: string) {
        try {
            await api.put(`restaurant/orders/${orderId}/status`, { json: { status } }).json();
            toast.success(t("common.success"));
            loadData();
        } catch (e) {
            console.error("Failed to update order:", e);
            toast.error(t("common.error"));
        }
    }

    function getStatusConfig(status: string) {
        switch (status) {
            case "pending":
                return {
                    bg: "bg-gray-100 dark:bg-gray-700",
                    text: "text-gray-700 dark:text-gray-300",
                    border: "border-gray-200 dark:border-gray-600",
                    dot: "bg-gray-500",
                    icon: Timer,
                    label: t("restaurant.pending"),
                };
            case "preparing":
                return {
                    bg: "bg-blue-100 dark:bg-blue-900/30",
                    text: "text-blue-700 dark:text-blue-400",
                    border: "border-blue-200 dark:border-blue-800",
                    dot: "bg-blue-500",
                    icon: ChefHat,
                    label: t("restaurant.preparing"),
                };
            case "ready":
                return {
                    bg: "bg-success-100 dark:bg-success-900/30",
                    text: "text-success-700 dark:text-success-400",
                    border: "border-success-200 dark:border-success-800",
                    dot: "bg-success-500 animate-pulse",
                    icon: Bell,
                    label: t("restaurant.ready"),
                };
            case "served":
                return {
                    bg: "bg-emerald-100 dark:bg-emerald-900/30",
                    text: "text-emerald-700 dark:text-emerald-400",
                    border: "border-emerald-200 dark:border-emerald-800",
                    dot: "bg-emerald-500",
                    icon: CheckCircle,
                    label: t("restaurant.served"),
                };
            case "cancelled":
                return {
                    bg: "bg-danger-100 dark:bg-danger-900/30",
                    text: "text-danger-700 dark:text-danger-400",
                    border: "border-danger-200 dark:border-danger-800",
                    dot: "bg-danger-500",
                    icon: XCircle,
                    label: t("restaurant.cancelled"),
                };
            default:
                return {
                    bg: "bg-gray-100 dark:bg-gray-700",
                    text: "text-gray-700 dark:text-gray-300",
                    border: "border-gray-200 dark:border-gray-600",
                    dot: "bg-gray-500",
                    icon: Clock,
                    label: status,
                };
        }
    }

    function getElapsedMinutes(createdAt: string): number {
        return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    }

    function getElapsedColor(minutes: number): string {
        if (minutes < 10) return "text-success-600 dark:text-success-400 bg-success-100 dark:bg-success-900/30";
        if (minutes < 20) return "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30";
        return "text-danger-600 dark:text-danger-400 bg-danger-100 dark:bg-danger-900/30";
    }

    // Stats
    let stats = $derived({
        total: orders.length,
        pending: orders.filter((o) => o.status === "pending").length,
        preparing: orders.filter((o) => o.status === "preparing").length,
        ready: orders.filter((o) => o.status === "ready").length,
        served: orders.filter((o) => o.status === "served").length,
    });

    // Filtered orders
    let filteredOrders = $derived(
        orders.filter((order) => {
            if (!searchQuery) return true;
            const query = searchQuery.toLowerCase();
            return (
                order.orderNumber?.toString().includes(query) ||
                order.table?.name?.toLowerCase().includes(query)
            );
        })
    );

    // Pagination
    let totalPages = $derived(Math.ceil(filteredOrders.length / itemsPerPage));
    let paginatedOrders = $derived(
        filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    );

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
        }
    }

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });

    onMount(() => {
        refreshInterval = setInterval(() => loadData(), 30000);
    });

    onDestroy(() => {
        if (refreshInterval) clearInterval(refreshInterval);
    });
</script>

<svelte:head>
    <title>{t("restaurant.orders")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg">
                    <ShoppingBag class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        {t("restaurant.ordersTitle")}
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {t("restaurant.ordersSubtitle")}
                    </p>
                </div>
            </div>
        </div>
        
        <div class="flex items-center gap-3">
            <button
                onclick={() => loadData()}
                disabled={isLoading}
                class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
            >
                <RefreshCw class={cn("w-4 h-4", isLoading && "animate-spin")} />
                {t("common.refresh")}
            </button>
            
            <a
                href="/pos"
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-success-500 to-emerald-600 text-white rounded-xl text-sm font-medium hover:from-success-600 hover:to-emerald-700 transition-all shadow-md"
            >
                <Plus class="w-4 h-4" />
                {t("restaurant.newOrders")}
            </a>
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <ShoppingBag class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span class="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.allOrders")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <Timer class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <span class="text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.pending}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.pending")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-blue-100 dark:border-blue-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <ChefHat class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.preparing}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.preparing")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-success-100 dark:border-success-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-success-100 dark:bg-success-900/30 rounded-lg">
                    <Bell class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <span class="text-2xl font-bold text-success-600 dark:text-success-400">{stats.ready}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.ready")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-emerald-100 dark:border-emerald-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <CheckCircle class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.served}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.served")}</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <!-- Search -->
            <div class="relative flex-1 max-w-md">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    placeholder={t("restaurant.ordersSearchPlaceholder")}
                    bind:value={searchQuery}
                    class="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
            </div>
            
            <!-- Status Filter Tabs -->
            <div class="flex flex-wrap gap-2">
                {#each statusFilters as filter (filter.id)}
                    {@const FilterIcon = filter.icon}
                    <button
                        onclick={() => { filterStatus = filter.id; loadData(); }}
                        class={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                            filterStatus === filter.id
                                ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        )}
                    >
                        <FilterIcon class="w-4 h-4" />
                        {t(filter.labelKey)}
                    </button>
                {/each}
            </div>
        </div>
    </div>

    <!-- Orders Grid -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-primary-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else if filteredOrders.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-12">
            <div class="text-center">
                <ShoppingBag class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
                <p class="text-gray-500 dark:text-gray-400 mt-4">{t("restaurant.noOrders")}</p>
                <a
                    href="/pos"
                    class="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
                >
                    <Plus class="w-4 h-4" />
                    {t("restaurant.newOrders")}
                </a>
            </div>
        </div>
    {:else}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {#each paginatedOrders as order (order.id)}
                {@const config = getStatusConfig(order.status)}
                {@const elapsedMinutes = getElapsedMinutes(order.createdAt)}
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all group">
                    <!-- Header -->
                    <div class="p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-750 border-b border-gray-100 dark:border-gray-700">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="p-2 bg-white dark:bg-gray-700 rounded-lg shadow-sm">
                                    <ShoppingBag class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                </div>
                                <div>
                                    <div class="font-bold text-gray-900 dark:text-white">
                                        #{order.orderNumber}
                                    </div>
                                    {#if order.table}
                                        <div class="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                            <UtensilsCrossed class="w-3 h-3" />
                                            {order.table.name}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                            
                            <div class="flex flex-col items-end gap-1">
                                <span class={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", config.bg, config.text)}>
                                    <span class={cn("w-1.5 h-1.5 rounded-full", config.dot)}></span>
                                    {config.label}
                                </span>
                                <span class={cn("px-2 py-0.5 rounded text-xs font-medium", getElapsedColor(elapsedMinutes))}>
                                    {elapsedMinutes} {t("restaurant.minutes")}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Items -->
                    <div class="p-4 max-h-36 overflow-y-auto">
                        <div class="space-y-2">
                            {#each order.items || [] as item (item.id)}
                                <div class="flex items-start justify-between gap-2">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <span class="shrink-0 w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded text-xs font-bold text-gray-700 dark:text-gray-300">
                                            {item.quantity}
                                        </span>
                                        <span class="text-sm text-gray-700 dark:text-gray-300 truncate">
                                            {item.product?.name || item.name}
                                        </span>
                                    </div>
                                    <span class="shrink-0 text-sm font-medium text-gray-900 dark:text-white">
                                        {formatCurrency(item.total || item.price * item.quantity)}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                <Calendar class="w-3.5 h-3.5" />
                                {formatDateTime(order.createdAt)}
                            </div>
                            <div class="text-lg font-bold text-primary-600 dark:text-primary-400">
                                {formatCurrency(order.total || 0)}
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex gap-2">
                            {#if order.status === "pending"}
                                <button
                                    onclick={() => updateOrderStatus(order.id, "preparing")}
                                    class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl text-xs font-medium hover:from-blue-600 hover:to-indigo-700 transition-all shadow-sm"
                                >
                                    <ChefHat class="w-3.5 h-3.5" />
                                    {t("restaurant.startCooking")}
                                </button>
                            {:else if order.status === "preparing"}
                                <button
                                    onclick={() => updateOrderStatus(order.id, "ready")}
                                    class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-success-500 to-emerald-600 text-white rounded-xl text-xs font-medium hover:from-success-600 hover:to-emerald-700 transition-all shadow-sm"
                                >
                                    <Bell class="w-3.5 h-3.5" />
                                    {t("restaurant.markReady")}
                                </button>
                            {:else if order.status === "ready"}
                                <button
                                    onclick={() => updateOrderStatus(order.id, "served")}
                                    class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-xs font-medium hover:from-emerald-600 hover:to-teal-700 transition-all shadow-sm"
                                >
                                    <CheckCircle class="w-3.5 h-3.5" />
                                    {t("restaurant.markServed")}
                                </button>
                            {/if}
                            <button class="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors">
                                <Eye class="w-3.5 h-3.5" />
                                {t("restaurant.viewDetails")}
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Pagination -->
        {#if totalPages > 1}
            <div class="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
                <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <span>
                        {t("common.showing")} {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredOrders.length)} {t("common.of")} {filteredOrders.length}
                    </span>
                    <select
                        bind:value={itemsPerPage}
                        onchange={() => (currentPage = 1)}
                        class="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500"
                    >
                        <option value={12}>12</option>
                        <option value={24}>24</option>
                        <option value={48}>48</option>
                    </select>
                </div>
                
                <div class="flex items-center gap-1">
                    <button
                        onclick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft class="w-5 h-5" />
                    </button>
                    
                    {#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                        return start + i;
                    }).filter((p) => p <= totalPages) as page}
                        <button
                            onclick={() => goToPage(page)}
                            class={cn(
                                "min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                page === currentPage
                                    ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md"
                                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                            )}
                        >
                            {page}
                        </button>
                    {/each}
                    
                    <button
                        onclick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight class="w-5 h-5" />
                    </button>
                </div>
            </div>
        {/if}
    {/if}
</div>
