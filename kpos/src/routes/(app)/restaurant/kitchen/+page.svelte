<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { formatDateTime } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import {
        RefreshCw,
        CheckCircle,
        Check,
        ChefHat,
        Bell,
        Timer,
        Flame,
        AlertCircle,
        Loader2,
        Clock,
        UtensilsCrossed,
        Volume2,
        Settings,
        Maximize2,
    } from "lucide-svelte";

    // State
    let orders = $state<any[]>([]);
    let isLoading = $state(false);
    let refreshInterval: ReturnType<typeof setInterval>;
    let refreshSeconds = $state(30);
    let lastRefresh = $state(new Date());
    let isFullscreen = $state(false);
    let soundEnabled = $state(true);

    async function loadData() {
        isLoading = true;
        try {
            const res = await api.get("restaurant/kitchen").json<any>();
            orders = res.data || [];
            lastRefresh = new Date();
        } catch (e) {
            console.error("Failed to load orders:", e);
        } finally {
            isLoading = false;
        }
    }

    async function updateItemStatus(orderId: string, itemId: string, status: string) {
        try {
            await api.put(`restaurant/kitchen/${orderId}/items/${itemId}`, {
                json: { status },
            }).json();
            toast.success(t("common.success"));
            loadData();
        } catch (e) {
            console.error("Failed to update item:", e);
            toast.error(t("common.error"));
        }
    }

    async function completeOrder(orderId: string) {
        try {
            await api.put(`restaurant/orders/${orderId}/status`, {
                json: { status: "ready" },
            }).json();
            toast.success(t("common.success"));
            if (soundEnabled) {
                // Play sound notification
                try {
                    const audio = new Audio('/sounds/order-ready.mp3');
                    audio.play().catch(() => {});
                } catch {}
            }
            loadData();
        } catch (e) {
            console.error("Failed to complete order:", e);
            toast.error(t("common.error"));
        }
    }

    function getElapsedMinutes(createdAt: string): number {
        return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    }

    function getElapsedDisplay(createdAt: string): string {
        const mins = getElapsedMinutes(createdAt);
        if (mins < 1) return "ຫາກໍ່ສັ່ງ";
        if (mins < 60) return `${mins} ${t("restaurant.minutes")}`;
        const hours = Math.floor(mins / 60);
        return `${hours} ຊົ່ວໂມງ`;
    }

    function getTimeColor(createdAt: string) {
        const mins = getElapsedMinutes(createdAt);
        if (mins > 30) return {
            bg: "bg-red-100 dark:bg-red-900/50",
            text: "text-red-700 dark:text-red-400",
            border: "border-red-300 dark:border-red-700",
            glow: "ring-red-500/50",
        };
        if (mins > 15) return {
            bg: "bg-amber-100 dark:bg-amber-900/50",
            text: "text-amber-700 dark:text-amber-400",
            border: "border-amber-300 dark:border-amber-700",
            glow: "ring-amber-500/50",
        };
        return {
            bg: "bg-green-100 dark:bg-green-900/50",
            text: "text-green-700 dark:text-green-400",
            border: "border-green-300 dark:border-green-700",
            glow: "ring-green-500/50",
        };
    }

    function getPriorityColor(priority: string) {
        switch (priority) {
            case "high":
                return "bg-red-500 text-white animate-pulse";
            case "low":
                return "bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-300";
            default:
                return "bg-blue-500 text-white";
        }
    }

    // Stats
    let stats = $derived({
        total: orders.length,
        pending: orders.flatMap(o => o.items || []).filter(i => i.status !== "done").length,
        done: orders.flatMap(o => o.items || []).filter(i => i.status === "done").length,
        urgent: orders.filter(o => getElapsedMinutes(o.createdAt) > 30).length,
    });

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            isFullscreen = true;
        } else {
            document.exitFullscreen();
            isFullscreen = false;
        }
    }

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });

    onMount(() => {
        refreshInterval = setInterval(() => loadData(), refreshSeconds * 1000);
    });

    onDestroy(() => {
        if (refreshInterval) clearInterval(refreshInterval);
    });
</script>

<svelte:head>
    <title>{t("restaurant.kitchenTitle")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl shadow-lg">
                    <ChefHat class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-white">
                        {t("restaurant.kitchenTitle")}
                    </h1>
                    <p class="text-sm text-gray-400">
                        {t("restaurant.kitchenSubtitle")}
                    </p>
                </div>
            </div>
        </div>
        
        <div class="flex items-center gap-3">
            <!-- Auto Refresh Indicator -->
            <div class="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-xl text-sm text-gray-400">
                <RefreshCw class={cn("w-4 h-4", isLoading && "animate-spin text-primary-400")} />
                <span>{t("restaurant.autoRefresh")}: {refreshSeconds}s</span>
            </div>
            
            <!-- Sound Toggle -->
            <button
                onclick={() => (soundEnabled = !soundEnabled)}
                class={cn(
                    "p-2.5 rounded-xl transition-all",
                    soundEnabled 
                        ? "bg-primary-600 text-white" 
                        : "bg-gray-700 text-gray-400"
                )}
            >
                <Volume2 class="w-5 h-5" />
            </button>
            
            <!-- Fullscreen -->
            <button
                onclick={toggleFullscreen}
                class="p-2.5 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600 transition-all"
            >
                <Maximize2 class="w-5 h-5" />
            </button>
            
            <!-- Refresh -->
            <button
                onclick={() => loadData()}
                disabled={isLoading}
                class="flex items-center gap-2 px-4 py-2.5 bg-gray-700 text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-600 transition-all"
            >
                <RefreshCw class={cn("w-4 h-4", isLoading && "animate-spin")} />
                {t("common.refresh")}
            </button>
        </div>
    </div>

    <!-- Stats Bar -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-gray-800/50 backdrop-blur rounded-xl p-4 border border-gray-700">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-900/50 rounded-lg">
                    <UtensilsCrossed class="w-5 h-5 text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-white">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-400 mt-2">{t("restaurant.activeOrders")}</p>
        </div>
        
        <div class="bg-gray-800/50 backdrop-blur rounded-xl p-4 border border-gray-700">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-orange-900/50 rounded-lg">
                    <Flame class="w-5 h-5 text-orange-400" />
                </div>
                <span class="text-2xl font-bold text-orange-400">{stats.pending}</span>
            </div>
            <p class="text-xs text-gray-400 mt-2">{t("restaurant.itemsCount")}</p>
        </div>
        
        <div class="bg-gray-800/50 backdrop-blur rounded-xl p-4 border border-gray-700">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-900/50 rounded-lg">
                    <CheckCircle class="w-5 h-5 text-green-400" />
                </div>
                <span class="text-2xl font-bold text-green-400">{stats.done}</span>
            </div>
            <p class="text-xs text-gray-400 mt-2">{t("restaurant.completed")}</p>
        </div>
        
        <div class="bg-gray-800/50 backdrop-blur rounded-xl p-4 border border-red-900/50">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-red-900/50 rounded-lg">
                    <AlertCircle class="w-5 h-5 text-red-400" />
                </div>
                <span class="text-2xl font-bold text-red-400">{stats.urgent}</span>
            </div>
            <p class="text-xs text-gray-400 mt-2">{t("restaurant.urgent")}</p>
        </div>
    </div>

    <!-- Kitchen Orders Grid -->
    {#if isLoading && orders.length === 0}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-primary-500 animate-spin" />
                <p class="text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else if orders.length === 0}
        <div class="bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700 p-16">
            <div class="text-center">
                <CheckCircle class="w-20 h-20 mx-auto text-green-500" />
                <h3 class="text-xl font-bold text-white mt-4">{t("restaurant.noPendingOrders")}</h3>
                <p class="text-gray-400 mt-2">ບໍ່ມີອໍເດີລໍຖ້າໃນຄົວ</p>
            </div>
        </div>
    {:else}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {#each orders as order (order.id)}
                {@const timeColor = getTimeColor(order.createdAt)}
                {@const completedItems = (order.items || []).filter((i: any) => i.status === "done").length}
                {@const totalItems = (order.items || []).length}
                {@const isAllDone = completedItems === totalItems && totalItems > 0}
                
                <div class={cn(
                    "rounded-2xl overflow-hidden transition-all duration-300",
                    isAllDone 
                        ? "bg-green-900/30 border-2 border-green-500 ring-2 ring-green-500/30" 
                        : "bg-gray-800 border border-gray-700"
                )}>
                    <!-- Header -->
                    <div class={cn(
                        "px-4 py-3 flex items-center justify-between",
                        isAllDone 
                            ? "bg-green-900/50" 
                            : "bg-gradient-to-r from-gray-900 to-gray-800"
                    )}>
                        <div class="flex items-center gap-3">
                            <div class={cn(
                                "p-2 rounded-lg",
                                isAllDone ? "bg-green-600" : "bg-primary-600"
                            )}>
                                {#if isAllDone}
                                    <Bell class="w-5 h-5 text-white" />
                                {:else}
                                    <ChefHat class="w-5 h-5 text-white" />
                                {/if}
                            </div>
                            <div>
                                <div class="font-bold text-white text-lg">
                                    #{order.orderNumber}
                                </div>
                                {#if order.table}
                                    <div class="text-xs text-gray-400 flex items-center gap-1">
                                        <UtensilsCrossed class="w-3 h-3" />
                                        {order.table.name}
                                    </div>
                                {/if}
                            </div>
                        </div>
                        
                        <div class="flex flex-col items-end gap-1">
                            <span class={cn(
                                "px-2 py-1 rounded-lg text-xs font-bold",
                                timeColor.bg, timeColor.text
                            )}>
                                <Clock class="w-3 h-3 inline mr-1" />
                                {getElapsedDisplay(order.createdAt)}
                            </span>
                            {#if order.priority === "high"}
                                <span class="px-2 py-0.5 bg-red-500 text-white rounded text-xs font-bold animate-pulse">
                                    {t("restaurant.urgent")}
                                </span>
                            {/if}
                        </div>
                    </div>

                    <!-- Progress Bar -->
                    <div class="h-1 bg-gray-700">
                        <div 
                            class="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
                            style="width: {totalItems > 0 ? (completedItems / totalItems) * 100 : 0}%"
                        ></div>
                    </div>

                    <!-- Items -->
                    <div class="divide-y divide-gray-700/50">
                        {#each order.items || [] as item (item.id)}
                            {@const isDone = item.status === "done"}
                            <div class={cn(
                                "flex items-center gap-3 p-3 transition-all",
                                isDone ? "bg-green-900/20" : "bg-transparent hover:bg-gray-700/30"
                            )}>
                                <button
                                    onclick={() => updateItemStatus(order.id, item.id, isDone ? "pending" : "done")}
                                    class={cn(
                                        "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all",
                                        isDone
                                            ? "bg-green-600 border-green-500 text-white"
                                            : "border-gray-600 hover:border-green-500 text-gray-500 hover:text-green-500"
                                    )}
                                >
                                    {#if isDone}
                                        <Check class="w-5 h-5" />
                                    {:else}
                                        <span class="text-lg font-bold">{item.quantity}</span>
                                    {/if}
                                </button>
                                
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2">
                                        {#if !isDone}
                                            <span class="shrink-0 w-7 h-7 flex items-center justify-center bg-orange-600 rounded-lg text-white text-sm font-bold">
                                                {item.quantity}
                                            </span>
                                        {/if}
                                        <span class={cn(
                                            "font-medium truncate",
                                            isDone 
                                                ? "text-gray-500 line-through" 
                                                : "text-white"
                                        )}>
                                            {item.product?.name || item.name}
                                        </span>
                                    </div>
                                    {#if item.notes}
                                        <div class="flex items-center gap-1 mt-1">
                                            <AlertCircle class="w-3 h-3 text-orange-400 shrink-0" />
                                            <p class="text-xs text-orange-400 truncate">
                                                {item.notes}
                                            </p>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!-- Footer -->
                    <div class="p-3 bg-gray-900/50">
                        <button
                            onclick={() => completeOrder(order.id)}
                            disabled={!isAllDone}
                            class={cn(
                                "w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all",
                                isAllDone
                                    ? "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-500/30"
                                    : "bg-gray-700 text-gray-400 cursor-not-allowed"
                            )}
                        >
                            <Bell class="w-5 h-5" />
                            {isAllDone ? t("restaurant.readyToServe") : `${completedItems}/${totalItems} ${t("restaurant.completed")}`}
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
