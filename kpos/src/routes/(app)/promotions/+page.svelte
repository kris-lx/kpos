<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { formatCurrency } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import {
        Gift,
        Plus,
        Search,
        Edit,
        Trash2,
        Calendar,
        Percent,
        Tag,
        Clock,
        X,
        Pause,
        Play,
        Copy,
        Loader2,
        Ticket,
        BadgePercent,
        TrendingUp,
        Users,
        ChevronRight,
        Sparkles,
        Target,
        Zap,
    } from "lucide-svelte";

    // State
    let activeTab = $state<"promotions" | "coupons" | "discounts">("promotions");
    let searchQuery = $state("");
    let statusFilter = $state("all");
    let isLoading = $state(true);
    let showModal = $state(false);
    let editingItem = $state<any>(null);

    // Data
    let promotions = $state<any[]>([]);
    let coupons = $state<any[]>([]);
    let discounts = $state<any[]>([]);

    // Form
    let formData = $state({
        name: "",
        description: "",
        type: "PERCENTAGE",
        value: 0,
        minPurchase: 0,
        maxDiscount: 0,
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        isActive: true,
        usageLimit: 0,
        code: "",
    });

    // Stats
    let stats = $derived({
        activePromotions: promotions.filter((p) => getStatus(p) === "active").length,
        activeCoupons: coupons.filter((c) => getStatus(c) === "active").length,
        totalUsage: promotions.reduce((sum, p) => sum + (p.usageCount || 0), 0),
        totalSaved: promotions.reduce((sum, p) => sum + (p.totalSaved || 0), 0),
    });

    function getStatus(item: any): string {
        const now = new Date();
        const start = new Date(item.startDate);
        const end = item.endDate ? new Date(item.endDate) : null;
        if (!item.isActive) return "paused";
        if (end && end < now) return "expired";
        if (start > now) return "scheduled";
        return "active";
    }

    function getStatusConfig(status: string) {
        switch (status) {
            case "active":
                return {
                    bg: "bg-green-100 dark:bg-green-900/50",
                    text: "text-green-700 dark:text-green-400",
                    dot: "bg-green-500",
                    label: t("common.active"),
                };
            case "scheduled":
                return {
                    bg: "bg-blue-100 dark:bg-blue-900/50",
                    text: "text-blue-700 dark:text-blue-400",
                    dot: "bg-blue-500",
                    label: t("promotions.scheduled"),
                };
            case "expired":
                return {
                    bg: "bg-gray-100 dark:bg-gray-700",
                    text: "text-gray-600 dark:text-gray-400",
                    dot: "bg-gray-500",
                    label: t("promotions.expired"),
                };
            case "paused":
                return {
                    bg: "bg-amber-100 dark:bg-amber-900/50",
                    text: "text-amber-700 dark:text-amber-400",
                    dot: "bg-amber-500",
                    label: t("promotions.paused"),
                };
            default:
                return {
                    bg: "bg-gray-100 dark:bg-gray-700",
                    text: "text-gray-600 dark:text-gray-400",
                    dot: "bg-gray-500",
                    label: status,
                };
        }
    }

    function getTypeConfig(type: string) {
        switch (type) {
            case "PERCENTAGE":
                return { icon: Percent, label: "ສ່ວນຫຼຸດ %", color: "text-purple-500" };
            case "FIXED":
                return { icon: Tag, label: "ສ່ວນຫຼຸດເງິນ", color: "text-green-500" };
            case "BUY_X_GET_Y":
                return { icon: Gift, label: "ຊື້ X ແຖມ Y", color: "text-orange-500" };
            case "BUNDLE":
                return { icon: Target, label: "ຊຸດໂປຣ", color: "text-blue-500" };
            default:
                return { icon: Tag, label: type, color: "text-gray-500" };
        }
    }

    async function loadData() {
        isLoading = true;
        try {
            const [promoRes, couponRes, discountRes] = await Promise.all([
                api.get("promotions").json<any>(),
                api.get("promotions/coupons/list").json<any>(),
                api.get("promotions/discounts").json<any>(),
            ]);
            promotions = promoRes.data || [];
            coupons = couponRes.data || [];
            discounts = discountRes.data || [];
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            isLoading = false;
        }
    }

    async function handleSubmit() {
        try {
            const endpoint = activeTab === "coupons" ? "promotions/coupons" : 
                             activeTab === "discounts" ? "promotions/discounts" : "promotions";
            
            if (editingItem) {
                await api.put(`${endpoint}/${editingItem.id}`, { json: formData }).json();
                toast.success(t("common.success"));
            } else {
                await api.post(endpoint, { json: formData }).json();
                toast.success(t("common.success"));
            }
            showModal = false;
            resetForm();
            loadData();
        } catch (e) {
            console.error("Failed to save:", e);
            toast.error(t("common.error"));
        }
    }

    async function toggleStatus(item: any) {
        try {
            const endpoint = activeTab === "coupons" ? "promotions/coupons" : 
                             activeTab === "discounts" ? "promotions/discounts" : "promotions";
            await api.put(`${endpoint}/${item.id}`, { 
                json: { isActive: !item.isActive } 
            }).json();
            toast.success(t("common.success"));
            loadData();
        } catch (e) {
            console.error("Failed to update:", e);
            toast.error(t("common.error"));
        }
    }

    async function handleDelete(item: any) {
        if (!confirm(t("common.confirmDelete"))) return;
        try {
            const endpoint = activeTab === "coupons" ? "promotions/coupons" : 
                             activeTab === "discounts" ? "promotions/discounts" : "promotions";
            await api.delete(`${endpoint}/${item.id}`).json();
            toast.success(t("common.success"));
            loadData();
        } catch (e) {
            console.error("Failed to delete:", e);
            toast.error(t("common.error"));
        }
    }

    function openEdit(item: any) {
        editingItem = item;
        formData = { ...item };
        showModal = true;
    }

    function resetForm() {
        editingItem = null;
        formData = {
            name: "",
            description: "",
            type: "PERCENTAGE",
            value: 0,
            minPurchase: 0,
            maxDiscount: 0,
            startDate: new Date().toISOString().split("T")[0],
            endDate: "",
            isActive: true,
            usageLimit: 0,
            code: "",
        };
    }

    function copyCode(code: string) {
        navigator.clipboard.writeText(code);
        toast.success("ຄັດລອກລະຫັດແລ້ວ");
    }

    function formatDate(date: string): string {
        if (!date) return "-";
        return new Intl.DateTimeFormat("lo-LA", {
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(new Date(date));
    }

    // Filtered data
    let filteredItems = $derived(() => {
        const items = activeTab === "promotions" ? promotions : 
                      activeTab === "coupons" ? coupons : discounts;
        
        return items.filter((item) => {
            const matchSearch = 
                item.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.description?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchStatus = statusFilter === "all" || getStatus(item) === statusFilter;
            return matchSearch && matchStatus;
        });
    });

    onMount(() => loadData());
</script>

<svelte:head>
    <title>{t("nav.promotions")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl shadow-lg">
                    <Gift class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        {t("nav.promotions")}
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        ຈັດການໂປຣໂມຊັ່ນ, ຄູປອງ ແລະ ສ່ວນຫຼຸດ
                    </p>
                </div>
            </div>
        </div>
        
        <button
            onclick={() => {
                resetForm();
                showModal = true;
            }}
            class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:from-pink-600 hover:to-rose-700 transition-all"
        >
            <Plus class="w-5 h-5" />
            {t("common.add")}
        </button>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <Zap class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.activePromotions}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("promotions.activePromotions")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Ticket class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span class="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.activeCoupons}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("promotions.activeCoupons")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Users class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalUsage}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("promotions.totalUsage")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-pink-100 dark:bg-pink-900/50 rounded-lg">
                    <TrendingUp class="w-5 h-5 text-pink-600 dark:text-pink-400" />
                </div>
                <span class="text-2xl font-bold text-pink-600 dark:text-pink-400">{formatCurrency(stats.totalSaved)}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("promotions.totalSaved")}</p>
        </div>
    </div>

    <!-- Tabs & Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <!-- Tabs -->
            <div class="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                {#each [
                    { id: "promotions", icon: Gift, label: t("promotions.promotions") },
                    { id: "coupons", icon: Ticket, label: t("promotions.coupons") },
                    { id: "discounts", icon: BadgePercent, label: t("promotions.discounts") },
                ] as tab}
                    <button
                        onclick={() => (activeTab = tab.id as any)}
                        class={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            activeTab === tab.id
                                ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        )}
                    >
                        <tab.icon class="w-4 h-4" />
                        {tab.label}
                    </button>
                {/each}
            </div>
            
            <div class="flex-1"></div>
            
            <!-- Search -->
            <div class="relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder={t("common.search")}
                    class="pl-10 pr-4 py-2.5 w-full lg:w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
            </div>
            
            <!-- Status Filter -->
            <div class="flex gap-2">
                {#each ["all", "active", "scheduled", "expired", "paused"] as status}
                    <button
                        onclick={() => (statusFilter = status)}
                        class={cn(
                            "px-3 py-2 rounded-lg text-sm font-medium transition-all",
                            statusFilter === status
                                ? "bg-pink-100 dark:bg-pink-900/50 text-pink-700 dark:text-pink-400"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        )}
                    >
                        {status === "all" ? t("common.all") : getStatusConfig(status).label}
                    </button>
                {/each}
            </div>
        </div>
    </div>

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-pink-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else if filteredItems().length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
            <Sparkles class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">{t("promotions.noPromotions")}</h3>
            <p class="text-gray-500 dark:text-gray-400 mt-2">ບໍ່ມີຂໍ້ມູນ</p>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each filteredItems() as item}
                {@const status = getStatus(item)}
                {@const statusConfig = getStatusConfig(status)}
                {@const typeConfig = getTypeConfig(item.type || item.discountType)}
                
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <!-- Header -->
                    <div class="px-4 py-3 bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/30 dark:to-rose-900/30 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class={cn("p-2 rounded-lg", statusConfig.bg)}>
                                <typeConfig.icon class={cn("w-5 h-5", typeConfig.color)} />
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 dark:text-white">
                                    {item.name}
                                </h3>
                                {#if item.code}
                                    <button
                                        onclick={() => copyCode(item.code)}
                                        class="flex items-center gap-1 text-xs text-pink-600 dark:text-pink-400 hover:underline"
                                    >
                                        <Copy class="w-3 h-3" />
                                        {item.code}
                                    </button>
                                {/if}
                            </div>
                        </div>
                        <span class={cn(
                            "px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
                            statusConfig.bg, statusConfig.text
                        )}>
                            <span class={cn("w-1.5 h-1.5 rounded-full", statusConfig.dot)}></span>
                            {statusConfig.label}
                        </span>
                    </div>

                    <!-- Content -->
                    <div class="p-4">
                        {#if item.description}
                            <p class="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                                {item.description}
                            </p>
                        {/if}

                        <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                            <div class="flex items-center gap-1.5">
                                {#if item.type === "PERCENTAGE" || item.discountType === "PERCENTAGE"}
                                    <Percent class="w-4 h-4 text-purple-500" />
                                    <span class="font-bold text-purple-600 dark:text-purple-400">{item.value || item.discountValue}%</span>
                                {:else}
                                    <Tag class="w-4 h-4 text-green-500" />
                                    <span class="font-bold text-green-600 dark:text-green-400">{formatCurrency(item.value || item.discountValue)}</span>
                                {/if}
                            </div>
                            
                            {#if item.minPurchase > 0}
                                <div class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                    ຂັ້ນຕ່ຳ: {formatCurrency(item.minPurchase)}
                                </div>
                            {/if}
                        </div>

                        <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                            <div class="flex items-center gap-1">
                                <Calendar class="w-3.5 h-3.5" />
                                <span>{formatDate(item.startDate)}</span>
                            </div>
                            {#if item.endDate}
                                <ChevronRight class="w-3 h-3" />
                                <span>{formatDate(item.endDate)}</span>
                            {/if}
                        </div>

                        {#if item.usageCount !== undefined || item.usageLimit}
                            <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                <div class="flex items-center justify-between text-xs">
                                    <span class="text-gray-500 dark:text-gray-400">ໃຊ້ແລ້ວ</span>
                                    <span class="font-medium text-gray-900 dark:text-white">
                                        {item.usageCount || 0} {item.usageLimit ? `/ ${item.usageLimit}` : ""}
                                    </span>
                                </div>
                                {#if item.usageLimit}
                                    <div class="mt-2 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div 
                                            class="h-full bg-gradient-to-r from-pink-500 to-rose-500 rounded-full transition-all"
                                            style="width: {Math.min(100, ((item.usageCount || 0) / item.usageLimit) * 100)}%"
                                        ></div>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>

                    <!-- Actions -->
                    <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
                        <button
                            onclick={() => toggleStatus(item)}
                            class={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                                item.isActive
                                    ? "text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
                                    : "text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
                            )}
                        >
                            {#if item.isActive}
                                <Pause class="w-4 h-4" />
                                ຢຸດຊົ່ວຄາວ
                            {:else}
                                <Play class="w-4 h-4" />
                                ເປີດໃຊ້
                            {/if}
                        </button>
                        <div class="flex gap-1">
                            <button
                                onclick={() => openEdit(item)}
                                class="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-all"
                            >
                                <Edit class="w-4 h-4" />
                            </button>
                            <button
                                onclick={() => handleDelete(item)}
                                class="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all"
                            >
                                <Trash2 class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Modal Header -->
            <div class="px-6 py-4 bg-gradient-to-r from-pink-500 to-rose-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">
                    {editingItem ? t("common.edit") : t("common.add")} {activeTab === "coupons" ? t("promotions.coupon") : activeTab === "discounts" ? t("promotions.discount") : t("promotions.promotion")}
                </h2>
                <button
                    onclick={() => (showModal = false)}
                    class="p-1.5 hover:bg-white/20 rounded-lg transition-all"
                >
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <!-- Modal Content -->
            <form
                onsubmit={(e) => {
                    e.preventDefault();
                    handleSubmit();
                }}
                class="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
            >
                {#if activeTab === "coupons"}
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ລະຫັດຄູປອງ *
                        </label>
                        <input
                            type="text"
                            bind:value={formData.code}
                            required
                            placeholder="SAVE20"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white uppercase focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        />
                    </div>
                {/if}

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("common.name")} *
                    </label>
                    <input
                        type="text"
                        bind:value={formData.name}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("common.description")}
                    </label>
                    <textarea
                        bind:value={formData.description}
                        rows="2"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                    ></textarea>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ປະເພດສ່ວນຫຼຸດ
                        </label>
                        <select
                            bind:value={formData.type}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        >
                            <option value="PERCENTAGE">ເປີເຊັນ (%)</option>
                            <option value="FIXED">ຈຳນວນເງິນ</option>
                            {#if activeTab === "promotions"}
                                <option value="BUY_X_GET_Y">ຊື້ X ແຖມ Y</option>
                                <option value="BUNDLE">ຊຸດໂປຣໂມຊັ່ນ</option>
                            {/if}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ມູນຄ່າ *
                        </label>
                        <input
                            type="number"
                            bind:value={formData.value}
                            required
                            min="0"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ຊື້ຂັ້ນຕ່ຳ
                        </label>
                        <input
                            type="number"
                            bind:value={formData.minPurchase}
                            min="0"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ສ່ວນຫຼຸດສູງສຸດ
                        </label>
                        <input
                            type="number"
                            bind:value={formData.maxDiscount}
                            min="0"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ວັນເລີ່ມຕົ້ນ *
                        </label>
                        <input
                            type="date"
                            bind:value={formData.startDate}
                            required
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ວັນສິ້ນສຸດ
                        </label>
                        <input
                            type="date"
                            bind:value={formData.endDate}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        />
                    </div>
                </div>

                {#if activeTab === "coupons"}
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ຈຳນວນໃຊ້ໄດ້
                        </label>
                        <input
                            type="number"
                            bind:value={formData.usageLimit}
                            min="0"
                            placeholder="0 = ບໍ່ຈຳກັດ"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        />
                    </div>
                {/if}

                <div class="flex items-center gap-3">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" bind:checked={formData.isActive} class="sr-only peer" />
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 dark:peer-focus:ring-pink-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-pink-600"></div>
                    </label>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">ເປີດໃຊ້ງານ</span>
                </div>

                <div class="flex justify-end gap-3 pt-4">
                    <button
                        type="button"
                        onclick={() => (showModal = false)}
                        class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="submit"
                        class="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-medium hover:from-pink-600 hover:to-rose-700 transition-all shadow-lg"
                    >
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
