<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import {
        UtensilsCrossed,
        Users,
        Clock,
        Check,
        X,
        Plus,
        DollarSign,
        ChefHat,
        Bell,
        ArrowRight,
        LayoutGrid,
        Timer,
        AlertCircle,
        RefreshCw,
        Loader2,
        Coffee,
        Utensils,
        Flame,
        CheckCircle,
        XCircle,
        Calendar,
        MapPin,
        TrendingUp,
        Activity,
    } from "lucide-svelte";

    // State
    let activeView = $state<"floor" | "kitchen">("floor");
    let selectedTable = $state<string | null>(null);
    let selectedFloor = $state(1);
    let isLoading = $state(true);
    let refreshInterval: ReturnType<typeof setInterval>;

    // Tables data from API
    let tables = $state<any[]>([]);
    // Kitchen orders from API
    let kitchenOrders = $state<any[]>([]);

    // Floors configuration
    const floors = [
        { id: 1, name: 'floor1', labelKey: 'restaurant.floor1' },
        { id: 2, name: 'floor2Vip', labelKey: 'restaurant.floor2Vip' },
        { id: 3, name: 'outdoor', labelKey: 'restaurant.outdoor' },
    ];

    // Load data from API
    async function loadTables() {
        try {
            const response = await api.get("restaurant/tables").json<any>();
            if (response.success && response.data) {
                tables = response.data.map((t: any) => ({
                    id: t.id,
                    name: t.name,
                    seats: t.capacity || t.seats || 4,
                    status: (t.status || "available").toLowerCase(),
                    floor: t.floor || 1,
                    guests: t.guests,
                    orderTotal: t.orderTotal,
                    duration: t.duration,
                    reservedFor: t.reservedFor,
                    reservedTime: t.reservedTime,
                    zone: t.zone || 'main',
                }));
            }
        } catch (error) {
            console.error("Failed to load tables:", error);
        }
    }

    async function loadKitchenOrders() {
        try {
            const response = await api
                .get("restaurant/orders?status=PENDING,PREPARING")
                .json<any>();
            if (response.success && response.data) {
                kitchenOrders = response.data.map((o: any) => ({
                    id: o.id,
                    table: o.table?.name || "-",
                    items: (o.items || []).map((i: any) => ({
                        name: i.product?.name || i.name,
                        quantity: i.quantity,
                        status: (i.status || "pending").toLowerCase(),
                        notes: i.notes || "",
                    })),
                    orderTime: new Date(o.createdAt).toLocaleTimeString(
                        "lo-LA",
                        { hour: "2-digit", minute: "2-digit" },
                    ),
                    elapsedMinutes: Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000),
                    priority: o.priority || "normal",
                }));
            }
        } catch (error) {
            console.error("Failed to load kitchen orders:", error);
        }
    }

    async function loadData() {
        isLoading = true;
        await Promise.all([loadTables(), loadKitchenOrders()]);
        isLoading = false;
    }

    $effect(() => {
        auth.activeStoreId; // reload on store switch
        loadData();
    });

    onMount(() => {
        // Auto refresh every 30 seconds
        refreshInterval = setInterval(() => {
            loadData();
        }, 30000);
    });

    onDestroy(() => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });

    // Stats
    let stats = $derived({
        totalTables: tables.length,
        available: tables.filter((t) => t.status === "available").length,
        occupied: tables.filter((t) => t.status === "occupied").length,
        reserved: tables.filter((t) => t.status === "reserved").length,
        cleaning: tables.filter((t) => t.status === "cleaning").length,
        pendingOrders: kitchenOrders.flatMap((o) => o.items).filter((i) => i.status === "pending").length,
        cookingOrders: kitchenOrders.flatMap((o) => o.items).filter((i) => i.status === "cooking").length,
        readyOrders: kitchenOrders.flatMap((o) => o.items).filter((i) => i.status === "ready").length,
        occupancyRate: tables.length > 0 ? Math.round((tables.filter((t) => t.status === "occupied").length / tables.length) * 100) : 0,
    });

    // Filtered tables by floor
    let filteredTables = $derived(tables.filter((t) => t.floor === selectedFloor));

    function getTableStatusConfig(status: string) {
        switch (status) {
            case "available":
                return {
                    bg: "bg-gradient-to-br from-emerald-50 to-success-100 dark:from-emerald-900/20 dark:to-success-900/30",
                    border: "border-emerald-300 dark:border-emerald-700",
                    dot: "bg-emerald-500",
                    text: "text-emerald-700 dark:text-emerald-400",
                    icon: CheckCircle,
                };
            case "occupied":
                return {
                    bg: "bg-gradient-to-br from-rose-50 to-danger-100 dark:from-rose-900/20 dark:to-danger-900/30",
                    border: "border-rose-300 dark:border-rose-700",
                    dot: "bg-rose-500 animate-pulse",
                    text: "text-rose-700 dark:text-rose-400",
                    icon: Utensils,
                };
            case "reserved":
                return {
                    bg: "bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-900/20 dark:to-yellow-900/30",
                    border: "border-amber-300 dark:border-amber-700",
                    dot: "bg-amber-500",
                    text: "text-amber-700 dark:text-amber-400",
                    icon: Calendar,
                };
            case "cleaning":
                return {
                    bg: "bg-gradient-to-br from-sky-50 to-blue-100 dark:from-sky-900/20 dark:to-blue-900/30",
                    border: "border-sky-300 dark:border-sky-700",
                    dot: "bg-sky-500",
                    text: "text-sky-700 dark:text-sky-400",
                    icon: RefreshCw,
                };
            default:
                return {
                    bg: "bg-gray-100 dark:bg-gray-800",
                    border: "border-gray-300 dark:border-gray-700",
                    dot: "bg-gray-500",
                    text: "text-gray-700 dark:text-gray-400",
                    icon: UtensilsCrossed,
                };
        }
    }

    function getTableStatusLabel(status: string): string {
        switch (status) {
            case "available": return t("restaurant.available");
            case "occupied": return t("restaurant.occupied");
            case "reserved": return t("restaurant.reserved");
            case "cleaning": return t("restaurant.cleaning");
            default: return status;
        }
    }

    function getElapsedColor(minutes: number): string {
        if (minutes < 10) return "text-success-600 dark:text-success-400";
        if (minutes < 20) return "text-amber-600 dark:text-amber-400";
        return "text-danger-600 dark:text-danger-400";
    }

    function getElapsedBg(minutes: number): string {
        if (minutes < 10) return "bg-success-100 dark:bg-success-900/30";
        if (minutes < 20) return "bg-amber-100 dark:bg-amber-900/30";
        return "bg-danger-100 dark:bg-danger-900/30";
    }

    async function updateItemStatus(orderId: string, itemIndex: number) {
        const order = kitchenOrders.find((o) => o.id === orderId);
        if (order) {
            const item = order.items[itemIndex];
            const newStatus = item.status === "pending" ? "cooking" : "ready";
            
            try {
                await api.patch(`restaurant/orders/${orderId}/items/${itemIndex}`, {
                    json: { status: newStatus }
                });
                item.status = newStatus;
                toast.success(t("common.success"));
            } catch (error) {
                console.error("Failed to update item status:", error);
                toast.error(t("common.error"));
            }
        }
    }

    async function updateTableStatus(tableId: string, newStatus: string) {
        try {
            await api.patch(`restaurant/tables/${tableId}`, {
                json: { status: newStatus }
            });
            await loadTables();
            toast.success(t("common.success"));
            selectedTable = null;
        } catch (error) {
            console.error("Failed to update table status:", error);
            toast.error(t("common.error"));
        }
    }

    function selectTable(tableId: string) {
        selectedTable = selectedTable === tableId ? null : tableId;
    }
</script>

<svelte:head>
    <title>{t("restaurant.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-orange-500 to-danger-600 rounded-xl shadow-lg">
                    <UtensilsCrossed class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        {t("restaurant.title")}
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {t("restaurant.subtitle")}
                    </p>
                </div>
            </div>
        </div>
        
        <div class="flex items-center gap-3">
            <!-- Refresh Button -->
            <button
                onclick={() => loadData()}
                disabled={isLoading}
                class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
            >
                <RefreshCw class={cn("w-4 h-4", isLoading && "animate-spin")} />
                {t("common.refresh")}
            </button>
            
            <!-- View Toggle -->
            <div class="flex bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm border border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => (activeView = "floor")}
                    class={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        activeView === "floor"
                            ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md"
                            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
                    )}
                >
                    <LayoutGrid class="w-4 h-4" />
                    {t("restaurant.floorPlan")}
                </button>
                <button
                    onclick={() => (activeView = "kitchen")}
                    class={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        activeView === "kitchen"
                            ? "bg-gradient-to-r from-orange-500 to-danger-600 text-white shadow-md"
                            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
                    )}
                >
                    <ChefHat class="w-4 h-4" />
                    {t("restaurant.kitchen")}
                </button>
            </div>
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
        <!-- Total Tables -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <UtensilsCrossed class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <span class="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalTables}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.totalTables")}</p>
        </div>
        
        <!-- Available -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-emerald-100 dark:border-emerald-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <CheckCircle class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.available}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.available")}</p>
        </div>
        
        <!-- Occupied -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-rose-100 dark:border-rose-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
                    <Users class="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
                <span class="text-2xl font-bold text-rose-600 dark:text-rose-400">{stats.occupied}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.occupied")}</p>
        </div>
        
        <!-- Reserved -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-amber-100 dark:border-amber-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                    <Calendar class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.reserved}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.reserved")}</p>
        </div>
        
        <!-- Occupancy Rate -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-indigo-100 dark:border-indigo-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                    <TrendingUp class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <span class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.occupancyRate}%</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.occupancy")}</p>
        </div>
        
        <!-- Pending -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <Timer class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <span class="text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.pendingOrders}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.pending")}</p>
        </div>
        
        <!-- Cooking -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-orange-100 dark:border-orange-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Flame class="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <span class="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.cookingOrders}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.cooking")}</p>
        </div>
        
        <!-- Ready -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-success-100 dark:border-success-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-success-100 dark:bg-success-900/30 rounded-lg">
                    <Bell class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <span class="text-2xl font-bold text-success-600 dark:text-success-400">{stats.readyOrders}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.ready")}</p>
        </div>
    </div>

    <!-- Loading State -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-primary-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else}
        <!-- Content -->
        {#if activeView === "floor"}
            <!-- Floor Plan View -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <!-- Floor Tabs & Legend -->
                <div class="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <!-- Floor Tabs -->
                    <div class="flex gap-2">
                        {#each floors as floor (floor.id)}
                            <button
                                onclick={() => (selectedFloor = floor.id)}
                                class={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    selectedFloor === floor.id
                                        ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md"
                                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                                )}
                            >
                                <div class="flex items-center gap-2">
                                    <MapPin class="w-4 h-4" />
                                    {t(floor.labelKey)}
                                </div>
                            </button>
                        {/each}
                    </div>
                    
                    <!-- Legend -->
                    <div class="flex flex-wrap items-center gap-4 text-xs">
                        <span class="flex items-center gap-1.5">
                            <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
                            {t("restaurant.available")}
                        </span>
                        <span class="flex items-center gap-1.5">
                            <span class="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span>
                            {t("restaurant.occupied")}
                        </span>
                        <span class="flex items-center gap-1.5">
                            <span class="w-3 h-3 rounded-full bg-amber-500"></span>
                            {t("restaurant.reserved")}
                        </span>
                        <span class="flex items-center gap-1.5">
                            <span class="w-3 h-3 rounded-full bg-sky-500"></span>
                            {t("restaurant.cleaning")}
                        </span>
                    </div>
                </div>

                <!-- Tables Grid -->
                <div class="p-6">
                    {#if filteredTables.length === 0}
                        <div class="text-center py-16">
                            <UtensilsCrossed class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
                            <p class="text-gray-500 dark:text-gray-400 mt-4">{t("restaurant.noTables")}</p>
                            <button class="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
                                <Plus class="w-4 h-4 inline mr-1" />
                                {t("restaurant.addTable")}
                            </button>
                        </div>
                    {:else}
                        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {#each filteredTables as table (table.id)}
                                {@const config = getTableStatusConfig(table.status)}
                                {@const TableIcon = config.icon}
                                <button
                                    onclick={() => selectTable(table.id)}
                                    class={cn(
                                        "relative p-4 rounded-xl border-2 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg group",
                                        config.bg,
                                        config.border,
                                        selectedTable === table.id && "ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900 scale-[1.02] shadow-lg"
                                    )}
                                >
                                    <!-- Status Dot -->
                                    <span class={cn("absolute top-3 right-3 w-2.5 h-2.5 rounded-full", config.dot)}></span>
                                    
                                    <!-- Table Content -->
                                    <div class="text-center space-y-2">
                                        <!-- Table Icon -->
                                        <div class={cn("w-12 h-12 mx-auto rounded-xl flex items-center justify-center", config.bg)}>
                                            <TableIcon class={cn("w-6 h-6", config.text)} />
                                        </div>
                                        
                                        <!-- Table Name -->
                                        <div class="text-lg font-bold text-gray-900 dark:text-white">
                                            {table.name}
                                        </div>
                                        
                                        <!-- Seats -->
                                        <div class="flex items-center justify-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                                            <Users class="w-4 h-4" />
                                            <span>{table.seats} {t("restaurant.seats")}</span>
                                        </div>
                                        
                                        <!-- Occupied Info -->
                                        {#if table.status === "occupied"}
                                            <div class="pt-2 border-t border-gray-200/50 dark:border-gray-600/50 space-y-1">
                                                {#if table.duration}
                                                    <div class="flex items-center justify-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                                        <Clock class="w-3 h-3" />
                                                        {table.duration}
                                                    </div>
                                                {/if}
                                                {#if table.orderTotal}
                                                    <div class="text-sm font-semibold text-primary-600 dark:text-primary-400">
                                                        ₭{table.orderTotal.toLocaleString()}
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                        
                                        <!-- Reserved Info -->
                                        {#if table.status === "reserved"}
                                            <div class="pt-2 border-t border-gray-200/50 dark:border-gray-600/50 space-y-1">
                                                {#if table.reservedFor}
                                                    <div class="text-xs font-medium text-amber-700 dark:text-amber-400 truncate">
                                                        {table.reservedFor}
                                                    </div>
                                                {/if}
                                                {#if table.reservedTime}
                                                    <div class="text-xs text-gray-500 dark:text-gray-400">
                                                        {table.reservedTime}
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                    </div>
                                    
                                    <!-- Hover Overlay -->
                                    <div class="absolute inset-0 bg-primary-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Selected Table Actions -->
            {#if selectedTable}
                {@const table = tables.find((t) => t.id === selectedTable)}
                {#if table}
                    {@const config = getTableStatusConfig(table.status)}
                    {@const SelectedTableIcon = config.icon}
                    <div class="mt-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div class="flex items-center gap-4">
                                <div class={cn("p-3 rounded-xl", config.bg)}>
                                    <SelectedTableIcon class={cn("w-6 h-6", config.text)} />
                                </div>
                                <div>
                                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                                        {table.name}
                                    </h3>
                                    <p class={cn("text-sm font-medium", config.text)}>
                                        {getTableStatusLabel(table.status)}
                                    </p>
                                </div>
                            </div>
                            
                            <div class="flex flex-wrap gap-2">
                                {#if table.status === "available"}
                                    <button
                                        onclick={() => updateTableStatus(table.id, 'occupied')}
                                        class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-success-600 text-white rounded-xl text-sm font-medium hover:from-emerald-600 hover:to-success-700 transition-all shadow-md"
                                    >
                                        <Users class="w-4 h-4" />
                                        {t("restaurant.openTable")}
                                    </button>
                                    <button
                                        onclick={() => updateTableStatus(table.id, 'reserved')}
                                        class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 text-white rounded-xl text-sm font-medium hover:from-amber-600 hover:to-yellow-700 transition-all shadow-md"
                                    >
                                        <Calendar class="w-4 h-4" />
                                        {t("restaurant.reserve")}
                                    </button>
                                {/if}
                                {#if table.status === "occupied"}
                                    <button class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl text-sm font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-md">
                                        <Utensils class="w-4 h-4" />
                                        {t("restaurant.viewOrder")}
                                    </button>
                                    <button class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md">
                                        <Plus class="w-4 h-4" />
                                        {t("restaurant.addItems")}
                                    </button>
                                    <button class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-success-500 to-emerald-600 text-white rounded-xl text-sm font-medium hover:from-success-600 hover:to-emerald-700 transition-all shadow-md">
                                        <DollarSign class="w-4 h-4" />
                                        {t("restaurant.checkout")}
                                    </button>
                                {/if}
                                {#if table.status === "reserved"}
                                    <button
                                        onclick={() => updateTableStatus(table.id, 'occupied')}
                                        class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-success-600 text-white rounded-xl text-sm font-medium hover:from-emerald-600 hover:to-success-700 transition-all shadow-md"
                                    >
                                        <Check class="w-4 h-4" />
                                        {t("restaurant.checkIn")}
                                    </button>
                                    <button
                                        onclick={() => updateTableStatus(table.id, 'available')}
                                        class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-rose-500 to-danger-600 text-white rounded-xl text-sm font-medium hover:from-rose-600 hover:to-danger-700 transition-all shadow-md"
                                    >
                                        <X class="w-4 h-4" />
                                        {t("restaurant.cancelReservation")}
                                    </button>
                                {/if}
                                {#if table.status === "cleaning"}
                                    <button
                                        onclick={() => updateTableStatus(table.id, 'available')}
                                        class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-success-600 text-white rounded-xl text-sm font-medium hover:from-emerald-600 hover:to-success-700 transition-all shadow-md"
                                    >
                                        <CheckCircle class="w-4 h-4" />
                                        {t("restaurant.markReady")}
                                    </button>
                                {/if}
                            </div>
                        </div>
                    </div>
                {/if}
            {/if}
        {:else}
            <!-- Kitchen View (KDS) -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <!-- Pending Orders Column -->
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div class="p-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-750">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <div class="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg">
                                    <Timer class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                                </div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">
                                    {t("restaurant.pendingOrders")}
                                </h3>
                            </div>
                            <span class="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-full text-sm font-bold text-gray-700 dark:text-gray-300">
                                {stats.pendingOrders}
                            </span>
                        </div>
                    </div>
                    <div class="p-4 space-y-3 max-h-[calc(100vh-350px)] overflow-y-auto">
                        {#each kitchenOrders as order (order.id)}
                            {#if order.items.some((i: any) => i.status === "pending")}
                                <div class={cn(
                                    "rounded-xl border-2 overflow-hidden transition-all",
                                    order.priority === "high"
                                        ? "border-rose-300 dark:border-rose-800 bg-gradient-to-br from-rose-50 to-danger-50 dark:from-rose-900/20 dark:to-danger-900/20"
                                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                                )}>
                                    <div class="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span class="font-bold text-gray-900 dark:text-white">{order.table}</span>
                                            {#if order.priority === "high"}
                                                <span class="px-2 py-0.5 bg-rose-500 text-white rounded text-xs font-medium animate-pulse">
                                                    {t("restaurant.urgent")}
                                                </span>
                                            {/if}
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <span class={cn("px-2 py-1 rounded-lg text-xs font-medium", getElapsedBg(order.elapsedMinutes), getElapsedColor(order.elapsedMinutes))}>
                                                {order.elapsedMinutes} {t("restaurant.minutes")}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="p-3 space-y-2">
                                        {#each order.items.filter((i: any) => i.status === "pending") as item (item.id)}
                                            <div class="flex items-start justify-between gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                                                <div class="flex-1 min-w-0">
                                                    <div class="flex items-center gap-2">
                                                        <span class="w-6 h-6 flex items-center justify-center bg-gray-200 dark:bg-gray-600 rounded text-xs font-bold text-gray-700 dark:text-gray-300">
                                                            {item.quantity}
                                                        </span>
                                                        <span class="font-medium text-gray-900 dark:text-white truncate">{item.name}</span>
                                                    </div>
                                                    {#if item.notes}
                                                        <p class="text-xs text-orange-600 dark:text-orange-400 mt-1 flex items-center gap-1">
                                                            <AlertCircle class="w-3 h-3" />
                                                            {item.notes}
                                                        </p>
                                                    {/if}
                                                </div>
                                                <button
                                                    onclick={() => updateItemStatus(order.id, order.items.indexOf(item))}
                                                    class="shrink-0 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg text-xs font-medium hover:from-orange-600 hover:to-amber-700 transition-all shadow-sm"
                                                >
                                                    <Flame class="w-3.5 h-3.5 inline mr-1" />
                                                    {t("restaurant.startCooking")}
                                                </button>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        {/each}
                        
                        {#if !kitchenOrders.some(o => o.items.some((i: any) => i.status === "pending"))}
                            <div class="text-center py-12">
                                <Timer class="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
                                <p class="text-gray-500 dark:text-gray-400 mt-3">{t("restaurant.noPendingOrders")}</p>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Cooking Orders Column -->
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-orange-100 dark:border-orange-900/30 overflow-hidden">
                    <div class="p-4 border-b border-orange-100 dark:border-orange-900/30 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <div class="p-2 bg-orange-200 dark:bg-orange-900/50 rounded-lg">
                                    <Flame class="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                </div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">
                                    {t("restaurant.cooking")}
                                </h3>
                            </div>
                            <span class="px-3 py-1 bg-orange-200 dark:bg-orange-900/50 rounded-full text-sm font-bold text-orange-700 dark:text-orange-400">
                                {stats.cookingOrders}
                            </span>
                        </div>
                    </div>
                    <div class="p-4 space-y-3 max-h-[calc(100vh-350px)] overflow-y-auto">
                        {#each kitchenOrders as order (order.id)}
                            {#if order.items.some((i: any) => i.status === "cooking")}
                                <div class="rounded-xl border-2 border-orange-200 dark:border-orange-800/30 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/10 dark:to-amber-900/10 overflow-hidden">
                                    <div class="p-3 border-b border-orange-100 dark:border-orange-800/30 flex items-center justify-between">
                                        <span class="font-bold text-gray-900 dark:text-white">{order.table}</span>
                                        <span class={cn("px-2 py-1 rounded-lg text-xs font-medium", getElapsedBg(order.elapsedMinutes), getElapsedColor(order.elapsedMinutes))}>
                                            {order.elapsedMinutes} {t("restaurant.minutes")}
                                        </span>
                                    </div>
                                    <div class="p-3 space-y-2">
                                        {#each order.items.filter((i: any) => i.status === "cooking") as item (item.id)}
                                            <div class="flex items-start justify-between gap-2 p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
                                                <div class="flex-1 min-w-0">
                                                    <div class="flex items-center gap-2">
                                                        <span class="w-6 h-6 flex items-center justify-center bg-orange-200 dark:bg-orange-900/50 rounded text-xs font-bold text-orange-700 dark:text-orange-400">
                                                            {item.quantity}
                                                        </span>
                                                        <span class="font-medium text-gray-900 dark:text-white truncate">{item.name}</span>
                                                    </div>
                                                    {#if item.notes}
                                                        <p class="text-xs text-orange-600 dark:text-orange-400 mt-1">
                                                            {item.notes}
                                                        </p>
                                                    {/if}
                                                </div>
                                                <button
                                                    onclick={() => updateItemStatus(order.id, order.items.indexOf(item))}
                                                    class="shrink-0 px-3 py-1.5 bg-gradient-to-r from-success-500 to-emerald-600 text-white rounded-lg text-xs font-medium hover:from-success-600 hover:to-emerald-700 transition-all shadow-sm"
                                                >
                                                    <Check class="w-3.5 h-3.5 inline mr-1" />
                                                    {t("restaurant.markReady")}
                                                </button>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        {/each}
                        
                        {#if !kitchenOrders.some(o => o.items.some((i: any) => i.status === "cooking"))}
                            <div class="text-center py-12">
                                <Flame class="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
                                <p class="text-gray-500 dark:text-gray-400 mt-3">{t("restaurant.noCookingOrders")}</p>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Ready Orders Column -->
                <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-success-100 dark:border-success-900/30 overflow-hidden">
                    <div class="p-4 border-b border-success-100 dark:border-success-900/30 bg-gradient-to-r from-success-50 to-emerald-50 dark:from-success-900/20 dark:to-emerald-900/20">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <div class="p-2 bg-success-200 dark:bg-success-900/50 rounded-lg">
                                    <Bell class="w-5 h-5 text-success-600 dark:text-success-400" />
                                </div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">
                                    {t("restaurant.readyToServe")}
                                </h3>
                            </div>
                            <span class="px-3 py-1 bg-success-200 dark:bg-success-900/50 rounded-full text-sm font-bold text-success-700 dark:text-success-400">
                                {stats.readyOrders}
                            </span>
                        </div>
                    </div>
                    <div class="p-4 space-y-3 max-h-[calc(100vh-350px)] overflow-y-auto">
                        {#each kitchenOrders as order (order.id)}
                            {#if order.items.some((i: any) => i.status === "ready")}
                                <div class="rounded-xl border-2 border-success-200 dark:border-success-800/30 bg-gradient-to-br from-success-50 to-emerald-50 dark:from-success-900/10 dark:to-emerald-900/10 overflow-hidden">
                                    <div class="p-3 border-b border-success-100 dark:border-success-800/30 flex items-center justify-between">
                                        <span class="font-bold text-gray-900 dark:text-white">{order.table}</span>
                                        <button class="px-3 py-1.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg text-xs font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-sm flex items-center gap-1">
                                            <Bell class="w-3.5 h-3.5" />
                                            {t("restaurant.callWaiter")}
                                        </button>
                                    </div>
                                    <div class="p-3 space-y-2">
                                        {#each order.items.filter((i: any) => i.status === "ready") as item (item.id)}
                                            <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
                                                <div class="flex items-center gap-2">
                                                    <span class="w-6 h-6 flex items-center justify-center bg-success-200 dark:bg-success-900/50 rounded text-xs font-bold text-success-700 dark:text-success-400">
                                                        {item.quantity}
                                                    </span>
                                                    <span class="font-medium text-gray-900 dark:text-white">{item.name}</span>
                                                </div>
                                                <span class="flex items-center gap-1 text-success-600 dark:text-success-400 text-xs font-medium">
                                                    <CheckCircle class="w-4 h-4" />
                                                    {t("restaurant.ready")}
                                                </span>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        {/each}
                        
                        {#if !kitchenOrders.some(o => o.items.some((i: any) => i.status === "ready"))}
                            <div class="text-center py-12">
                                <Bell class="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
                                <p class="text-gray-500 dark:text-gray-400 mt-3">{t("restaurant.noReadyOrders")}</p>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    {/if}
</div>
