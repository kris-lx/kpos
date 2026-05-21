<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$lib/stores/auth.svelte";
    import { toast } from "svelte-sonner";
    import {
        Plus,
        Edit3,
        Trash2,
        Loader2,
        X,
        Users,
        UtensilsCrossed,
        CheckCircle,
        Calendar,
        RefreshCw,
        Search,
        Filter,
        LayoutGrid,
        List,
        MapPin,
        Square,
        Circle,
        RectangleHorizontal,
        Settings,
    } from "lucide-svelte";

    // CRUD guards
    const canCreateTable = $derived(auth.canCreate('restaurant'));
    const canUpdateTable = $derived(auth.canUpdate('restaurant'));
    const canDeleteTable = $derived(auth.canDelete('restaurant'));

    // State
    let tables = $state<any[]>([]);
    let zones = $state<any[]>([]);
    let isLoading = $state(false);
    let showModal = $state(false);
    let editingId = $state<string | null>(null);
    let selectedZone = $state("all");
    let searchQuery = $state("");
    let viewMode = $state<"grid" | "list">("grid");

    let formData = $state({
        name: "",
        capacity: 4,
        zoneId: "",
        shape: "square" as "square" | "round" | "rectangle",
        floor: 1,
        positionX: 0,
        positionY: 0,
        isActive: true,
        status: "available",
    });

    // Predefined zones for fallback
    const defaultZones = [
        { id: "main", name: "ຫ້ອງໃຫຍ່", color: "blue" },
        { id: "vip", name: "ຫ້ອງ VIP", color: "purple" },
        { id: "outdoor", name: "ນອກອາຄານ", color: "green" },
        { id: "private", name: "ຫ້ອງສ່ວນຕົວ", color: "amber" },
    ];

    async function loadData() {
        isLoading = true;
        try {
            const [tableRes, zoneRes] = await Promise.all([
                api.get("restaurant/tables").json<any>(),
                api.get("restaurant/zones").json<any>(),
            ]);
            tables = tableRes.data || [];
            zones = zoneRes.data?.length ? zoneRes.data : defaultZones;
        } catch (e) {
            console.error("Failed to load data:", e);
            zones = defaultZones;
        } finally {
            isLoading = false;
        }
    }

    async function handleSubmit() {
        try {
            const payload: Record<string, any> = {
                name: formData.name,
                capacity: Number(formData.capacity),
                shape: formData.shape.toUpperCase(),
                floor: String(formData.floor),
                zone: formData.zoneId || 'main',
                posX: Number(formData.positionX),
                posY: Number(formData.positionY),
                isActive: formData.isActive,
                status: formData.status.toUpperCase(),
            };
            if (editingId) {
                await api.put(`restaurant/tables/${editingId}`, { json: payload }).json();
                toast.success(t("common.success"));
            } else {
                payload.branchId = auth.user?.branchId || '';
                await api.post("restaurant/tables", { json: payload }).json();
                toast.success(t("common.success"));
            }
            showModal = false;
            resetForm();
            loadData();
        } catch (e) {
            console.error("Failed to save table:", e);
            toast.error(t("common.error"));
        }
    }

    async function handleDelete(id: string) {
        if (confirm(t("restaurant.confirmDelete"))) {
            try {
                await api.delete(`restaurant/tables/${id}`).json();
                toast.success(t("common.success"));
                showModal = false;
                loadData();
            } catch (e) {
                console.error("Failed to delete table:", e);
                toast.error(t("common.error"));
            }
        }
    }

    async function updateTableStatus(tableId: string, newStatus: string) {
        try {
            await api.patch(`restaurant/tables/${tableId}`, {
                json: { status: newStatus }
            });
            await loadData();
            toast.success(t("common.success"));
        } catch (error) {
            console.error("Failed to update table status:", error);
            toast.error(t("common.error"));
        }
    }

    function editTable(table: any) {
        editingId = table.id;
        formData = { ...table };
        showModal = true;
    }

    function resetForm() {
        editingId = null;
        formData = {
            name: "",
            capacity: 4,
            zoneId: "",
            shape: "square",
            floor: 1,
            positionX: 0,
            positionY: 0,
            isActive: true,
            status: "available",
        };
    }

    function getStatusConfig(status: string) {
        switch (status) {
            case "available":
                return {
                    bg: "bg-gradient-to-br from-emerald-50 to-success-100 dark:from-emerald-900/20 dark:to-success-900/30",
                    border: "border-emerald-300 dark:border-emerald-700",
                    dot: "bg-emerald-500",
                    text: "text-emerald-700 dark:text-emerald-400",
                    label: t("restaurant.available"),
                };
            case "occupied":
                return {
                    bg: "bg-gradient-to-br from-rose-50 to-danger-100 dark:from-rose-900/20 dark:to-danger-900/30",
                    border: "border-rose-300 dark:border-rose-700",
                    dot: "bg-rose-500 animate-pulse",
                    text: "text-rose-700 dark:text-rose-400",
                    label: t("restaurant.occupied"),
                };
            case "reserved":
                return {
                    bg: "bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-900/20 dark:to-yellow-900/30",
                    border: "border-amber-300 dark:border-amber-700",
                    dot: "bg-amber-500",
                    text: "text-amber-700 dark:text-amber-400",
                    label: t("restaurant.reserved"),
                };
            case "cleaning":
                return {
                    bg: "bg-gradient-to-br from-sky-50 to-blue-100 dark:from-sky-900/20 dark:to-blue-900/30",
                    border: "border-sky-300 dark:border-sky-700",
                    dot: "bg-sky-500",
                    text: "text-sky-700 dark:text-sky-400",
                    label: t("restaurant.cleaning"),
                };
            default:
                return {
                    bg: "bg-gray-100 dark:bg-gray-800",
                    border: "border-gray-300 dark:border-gray-700",
                    dot: "bg-gray-500",
                    text: "text-gray-700 dark:text-gray-400",
                    label: status,
                };
        }
    }

    function getZoneColor(zoneId: string) {
        const zone = zones.find(z => z.id === zoneId);
        const color = zone?.color || "gray";
        const colors: Record<string, string> = {
            blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
            purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
            green: "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400",
            amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
            red: "bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400",
            gray: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400",
        };
        return colors[color] || colors.gray;
    }

    function getShapeIcon(shape: string) {
        switch (shape) {
            case "round": return Circle;
            case "rectangle": return RectangleHorizontal;
            default: return Square;
        }
    }

    // Stats
    let stats = $derived({
        total: tables.length,
        available: tables.filter((t) => t.status === "available").length,
        occupied: tables.filter((t) => t.status === "occupied").length,
        reserved: tables.filter((t) => t.status === "reserved").length,
        cleaning: tables.filter((t) => t.status === "cleaning").length,
    });

    // Filtered tables
    let filteredTables = $derived(
        tables.filter((table) => {
            const matchesZone = selectedZone === "all" || table.zoneId === selectedZone;
            const matchesSearch = !searchQuery || 
                table.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesZone && matchesSearch;
        })
    );

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });
</script>

<svelte:head>
    <title>{t("restaurant.tables")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                    <UtensilsCrossed class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        {t("restaurant.tablesTitle")}
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {t("restaurant.tablesSubtitle")}
                    </p>
                </div>
            </div>
        </div>
        
        <div class="flex items-center gap-3">
            <!-- Refresh -->
            <button
                onclick={() => loadData()}
                disabled={isLoading}
                class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
            >
                <RefreshCw class={cn("w-4 h-4", isLoading && "animate-spin")} />
                {t("common.refresh")}
            </button>
            
            <!-- Add Table -->
            {#if canCreateTable}
            <button
                onclick={() => { resetForm(); showModal = true; }}
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl text-sm font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-md"
            >
                <Plus class="w-4 h-4" />
                {t("restaurant.addTable")}
            </button>
            {/if}
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <UtensilsCrossed class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <span class="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.totalTables")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-emerald-100 dark:border-emerald-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <CheckCircle class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.available}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.available")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-rose-100 dark:border-rose-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
                    <Users class="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
                <span class="text-2xl font-bold text-rose-600 dark:text-rose-400">{stats.occupied}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.occupied")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-amber-100 dark:border-amber-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                    <Calendar class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.reserved}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.reserved")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-sky-100 dark:border-sky-900/30">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                    <RefreshCw class="w-5 h-5 text-sky-600 dark:text-sky-400" />
                </div>
                <span class="text-2xl font-bold text-sky-600 dark:text-sky-400">{stats.cleaning}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.cleaning")}</p>
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
                    placeholder="{t("common.search")}..."
                    bind:value={searchQuery}
                    class="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
            </div>
            
            <!-- Zone Filter -->
            <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm text-gray-500 dark:text-gray-400 mr-2">
                    <Filter class="w-4 h-4 inline mr-1" />
                    {t("restaurant.zone")}:
                </span>
                <button
                    onclick={() => (selectedZone = "all")}
                    class={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                        selectedZone === "all"
                            ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    )}
                >
                    {t("restaurant.allZones")}
                </button>
                {#each zones as zone (zone.id)}
                    <button
                        onclick={() => (selectedZone = zone.id)}
                        class={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                            selectedZone === zone.id
                                ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        )}
                    >
                        {zone.name}
                    </button>
                {/each}
            </div>
            
            <!-- View Toggle -->
            <div class="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                    onclick={() => (viewMode = "grid")}
                    class={cn(
                        "p-2 rounded-md transition-all",
                        viewMode === "grid"
                            ? "bg-white dark:bg-gray-600 shadow-sm"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    )}
                >
                    <LayoutGrid class="w-4 h-4" />
                </button>
                <button
                    onclick={() => (viewMode = "list")}
                    class={cn(
                        "p-2 rounded-md transition-all",
                        viewMode === "list"
                            ? "bg-white dark:bg-gray-600 shadow-sm"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    )}
                >
                    <List class="w-4 h-4" />
                </button>
            </div>
        </div>
    </div>

    <!-- Tables -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-primary-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else if filteredTables.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-12">
            <div class="text-center">
                <UtensilsCrossed class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
                <p class="text-gray-500 dark:text-gray-400 mt-4">{t("restaurant.noTables")}</p>
                <button
                    onclick={() => { resetForm(); showModal = true; }}
                    class="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
                >
                    <Plus class="w-4 h-4 inline mr-1" />
                    {t("restaurant.addTable")}
                </button>
            </div>
        </div>
    {:else if viewMode === "grid"}
        <!-- Grid View -->
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {#each filteredTables as table (table.id)}
                {@const config = getStatusConfig(table.status || "available")}
                {@const ShapeIcon = getShapeIcon(table.shape)}
                <button
                    onclick={() => editTable(table)}
                    class={cn(
                        "relative p-4 rounded-xl border-2 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg group text-left",
                        config.bg,
                        config.border,
                        !table.isActive && "opacity-50"
                    )}
                >
                    <!-- Status Dot -->
                    <span class={cn("absolute top-3 right-3 w-2.5 h-2.5 rounded-full", config.dot)}></span>
                    
                    <!-- Edit Icon (on hover) -->
                    <div class="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div class="p-1.5 bg-white/80 dark:bg-gray-800/80 rounded-lg shadow-sm">
                            <Edit3 class="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
                        </div>
                    </div>
                    
                    <div class="text-center space-y-2 pt-2">
                        <!-- Shape Icon -->
                        <div class={cn("w-12 h-12 mx-auto rounded-xl flex items-center justify-center", config.bg)}>
                            <ShapeIcon class={cn("w-6 h-6", config.text)} />
                        </div>
                        
                        <!-- Table Name -->
                        <div class="text-lg font-bold text-gray-900 dark:text-white">
                            {table.name}
                        </div>
                        
                        <!-- Capacity -->
                        <div class="flex items-center justify-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                            <Users class="w-4 h-4" />
                            <span>{table.capacity} {t("restaurant.seats")}</span>
                        </div>
                        
                        <!-- Status -->
                        <div class={cn("text-xs font-medium", config.text)}>
                            {config.label}
                        </div>
                        
                        <!-- Zone Badge -->
                        {#if table.zoneId}
                            {@const zone = zones.find(z => z.id === table.zoneId)}
                            {#if zone}
                                <div class="pt-2">
                                    <span class={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", getZoneColor(table.zoneId))}>
                                        <MapPin class="w-3 h-3" />
                                        {zone.name}
                                    </span>
                                </div>
                            {/if}
                        {/if}
                    </div>
                    
                    <!-- Inactive Overlay -->
                    {#if !table.isActive}
                        <div class="absolute inset-0 bg-gray-500/30 dark:bg-gray-900/50 rounded-xl flex items-center justify-center">
                            <span class="px-2 py-1 bg-gray-900/80 text-white text-xs font-medium rounded">{t("common.inactive")}</span>
                        </div>
                    {/if}
                </button>
            {/each}
        </div>
    {:else}
        <!-- List View -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t("restaurant.tableName")}</th>
                            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t("restaurant.zone")}</th>
                            <th class="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t("restaurant.capacity")}</th>
                            <th class="text-center px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t("restaurant.status")}</th>
                            <th class="text-right px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t("common.actions")}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                        {#each filteredTables as table (table.id)}
                            {@const config = getStatusConfig(table.status || "available")}
                            {@const ShapeIcon = getShapeIcon(table.shape)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-3">
                                        <div class={cn("p-2 rounded-lg", config.bg)}>
                                            <ShapeIcon class={cn("w-5 h-5", config.text)} />
                                        </div>
                                        <div>
                                            <div class="font-semibold text-gray-900 dark:text-white">{table.name}</div>
                                            <div class="text-xs text-gray-500 dark:text-gray-400">{t("restaurant.floor")} {table.floor || 1}</div>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-4 py-3">
                                    {#if table.zoneId}
                                        {@const zone = zones.find(z => z.id === table.zoneId)}
                                        {#if zone}
                                            <span class={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium", getZoneColor(table.zoneId))}>
                                                <MapPin class="w-3 h-3" />
                                                {zone.name}
                                            </span>
                                        {/if}
                                    {:else}
                                        <span class="text-gray-400">-</span>
                                    {/if}
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <div class="flex items-center justify-center gap-1 text-gray-700 dark:text-gray-300">
                                        <Users class="w-4 h-4" />
                                        <span class="font-medium">{table.capacity}</span>
                                    </div>
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <span class={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", config.bg, config.text)}>
                                        <span class={cn("w-1.5 h-1.5 rounded-full", config.dot)}></span>
                                        {config.label}
                                    </span>
                                </td>
                                <td class="px-4 py-3">
                                    <div class="flex items-center justify-end gap-2">
                                        {#if canUpdateTable}
                                        <button
                                            onclick={() => editTable(table)}
                                            class="p-2 text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                                        >
                                            <Edit3 class="w-4 h-4" />
                                        </button>
                                        {/if}
                                        {#if canDeleteTable}
                                        <button
                                            onclick={() => handleDelete(table.id)}
                                            class="p-2 text-gray-400 hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-lg transition-colors"
                                        >
                                            <Trash2 class="w-4 h-4" />
                                        </button>
                                        {/if}
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}

    <!-- Legend -->
    <div class="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm">
        <span class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
            <span class="text-gray-600 dark:text-gray-400">{t("restaurant.available")}</span>
        </span>
        <span class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span>
            <span class="text-gray-600 dark:text-gray-400">{t("restaurant.occupied")}</span>
        </span>
        <span class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-amber-500"></span>
            <span class="text-gray-600 dark:text-gray-400">{t("restaurant.reserved")}</span>
        </span>
        <span class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-sky-500"></span>
            <span class="text-gray-600 dark:text-gray-400">{t("restaurant.cleaning")}</span>
        </span>
    </div>
</div>

<!-- Modal -->
{#if showModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onclick={() => (showModal = false)}
        onkeydown={(e) => e.key === "Escape" && (showModal = false)}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div
            class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden"
            onclick={(e) => e.stopPropagation()}
            role="document"
        >
            <!-- Header -->
            <div class="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-750">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                        <UtensilsCrossed class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <h2 class="text-lg font-bold text-gray-900 dark:text-white">
                        {editingId ? t("restaurant.editTable") : t("restaurant.addTable")}
                    </h2>
                </div>
                <button
                    onclick={() => (showModal = false)}
                    class="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>
            
            <!-- Form -->
            <form
                onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}
                class="p-5 space-y-5"
            >
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="tableName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("restaurant.tableName")} *
                        </label>
                        <input
                            id="tableName"
                            type="text"
                            bind:value={formData.name}
                            required
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                            placeholder="T01"
                        />
                    </div>
                    <div>
                        <label for="capacity" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("restaurant.capacity")}
                        </label>
                        <input
                            id="capacity"
                            type="number"
                            bind:value={formData.capacity}
                            min="1"
                            max="20"
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                        />
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="zone" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("restaurant.zone")}
                        </label>
                        <select
                            id="zone"
                            bind:value={formData.zoneId}
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                        >
                            <option value="">{t("restaurant.selectZone")}</option>
                            {#each zones as zone (zone.id)}
                                <option value={zone.id}>{zone.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div>
                        <label for="floor" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("restaurant.floor")}
                        </label>
                        <select
                            id="floor"
                            bind:value={formData.floor}
                            class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                        >
                            <option value={1}>{t("restaurant.floor1")}</option>
                            <option value={2}>{t("restaurant.floor2Vip")}</option>
                            <option value={3}>{t("restaurant.outdoor")}</option>
                        </select>
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ຮູບຮ່າງໂຕະ
                    </label>
                    <div class="flex gap-3">
                        {#each [
                            { value: "square", label: "ສີ່ຫຼ່ຽມ", icon: Square },
                            { value: "round", label: "ມົນ", icon: Circle },
                            { value: "rectangle", label: "ແຄບຍາວ", icon: RectangleHorizontal },
                        ] as shape}
                            <label
                                class={cn(
                                    "flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all",
                                    formData.shape === shape.value
                                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                        : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                                )}
                            >
                                <input
                                    type="radio"
                                    bind:group={formData.shape}
                                    value={shape.value}
                                    class="sr-only"
                                />
                                <svelte:component
                                    this={shape.icon}
                                    class={cn(
                                        "w-6 h-6",
                                        formData.shape === shape.value
                                            ? "text-primary-600 dark:text-primary-400"
                                            : "text-gray-400"
                                    )}
                                />
                                <span class={cn(
                                    "text-xs font-medium",
                                    formData.shape === shape.value
                                        ? "text-primary-700 dark:text-primary-400"
                                        : "text-gray-600 dark:text-gray-400"
                                )}>
                                    {shape.label}
                                </span>
                            </label>
                        {/each}
                    </div>
                </div>

                {#if editingId}
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {t("restaurant.status")}
                        </label>
                        <div class="grid grid-cols-4 gap-2">
                            {#each ["available", "occupied", "reserved", "cleaning"] as status (status)}
                                {@const config = getStatusConfig(status)}
                                <label
                                    class={cn(
                                        "flex items-center justify-center gap-1.5 p-2 rounded-lg border-2 cursor-pointer transition-all text-xs font-medium",
                                        formData.status === status
                                            ? cn(config.bg, config.border)
                                            : "border-gray-200 dark:border-gray-600 hover:border-gray-300"
                                    )}
                                >
                                    <input
                                        type="radio"
                                        bind:group={formData.status}
                                        value={status}
                                        class="sr-only"
                                    />
                                    <span class={cn("w-2 h-2 rounded-full", config.dot)}></span>
                                    <span class={formData.status === status ? config.text : "text-gray-600 dark:text-gray-400"}>
                                        {config.label}
                                    </span>
                                </label>
                            {/each}
                        </div>
                    </div>
                {/if}
                
                <div class="flex items-center gap-3">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            bind:checked={formData.isActive}
                            class="sr-only peer"
                        />
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                    </label>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("common.active")}
                    </span>
                </div>
                
                <!-- Actions -->
                <div class="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                    {#if editingId}
                        <button
                            type="button"
                            onclick={() => handleDelete(editingId!)}
                            class="flex items-center gap-2 px-4 py-2.5 bg-danger-50 dark:bg-danger-900/20 text-danger-600 dark:text-danger-400 rounded-xl text-sm font-medium hover:bg-danger-100 dark:hover:bg-danger-900/30 transition-colors"
                        >
                            <Trash2 class="w-4 h-4" />
                            {t("common.delete")}
                        </button>
                    {:else}
                        <div></div>
                    {/if}
                    
                    <div class="flex gap-3">
                        <button
                            type="button"
                            onclick={() => (showModal = false)}
                            class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            type="submit"
                            class="px-6 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl text-sm font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-md"
                        >
                            {t("common.save")}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    </div>
{/if}
