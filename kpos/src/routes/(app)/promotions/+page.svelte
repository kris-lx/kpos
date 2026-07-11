<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { formatCurrency, formatDate } from "$lib/utils";
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
        ChevronDown,
        Sparkles,
        Target,
        Zap,
        Star,
        Settings,
        Save,
        Package,
        Printer,
        QrCode,
        RefreshCw,
    } from "lucide-svelte";

    // Rule-based CRUD — also requires write access to active store
    const hasWriteAccess = $derived(auth.hasStoreAccess('write') || !auth.activeStoreId);
    const canCreatePromo = $derived(auth.canCreate('promotions') && hasWriteAccess);
    const canUpdatePromo = $derived(auth.canUpdate('promotions') && hasWriteAccess);
    const canDeletePromo = $derived(auth.canDelete('promotions') && hasWriteAccess);

    // State
    let activeTab = $state<"promotions" | "coupons" | "discounts" | "loyalty">("promotions");
    let searchQuery = $state("");
    let statusFilter = $state("all");
    let isLoading = $state(true);
    let showModal = $state(false);
    let editingItem = $state<any>(null);

    // Data
    let promotions = $state<any[]>([]);
    let coupons = $state<any[]>([]);
    let discounts = $state<any[]>([]);

    // Loyalty points settings
    let loyaltySettings = $state({
        enabled: true,
        pointsPerAmount: 1,
        amountPerPoint: 10000,
        pointValue: 100,
        minPointsRedeem: 100,
        maxPointsRedeem: 0,
        pointExpiryDays: 365,
        noExpiry: false,
    });
    let loyaltyLoading = $state(false);
    let loyaltySaving = $state(false);

    // Products list for selection
    let products = $state<any[]>([]);
    let productSearchQuery = $state("");
    let showTimePeriod = $state(true);

    const DAY_KEYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

    let filteredProductList = $derived(
        productSearchQuery.trim()
            ? products.filter(p =>
                p.name?.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
                p.code?.toLowerCase().includes(productSearchQuery.toLowerCase()))
            : products.slice(0, 60)
    );

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
        usageLimitType: "unlimited" as "unlimited" | "limited",
        code: "",
        barcode: "",
        productIds: [] as string[],
        daysOfWeek: [true,true,true,true,true,true,true],
        startTime: "00:00",
        endTime: "23:59",
    });

    // API-fetched enum types
    let promotionTypes = $state<{value: string; label: string; labelLao?: string}[]>([]);
    let couponTypes = $state<{value: string; label: string; labelLao?: string}[]>([]);
    let discountTypes = $state<{value: string; label: string; labelLao?: string}[]>([]);

    async function loadEnums() {
        try {
            const res = await api.get("settings/enums?type=promotion_type,coupon_type,discount_type").json<any>();
            if (res.data?.promotion_type) promotionTypes = res.data.promotion_type;
            if (res.data?.coupon_type) couponTypes = res.data.coupon_type;
            if (res.data?.discount_type) discountTypes = res.data.discount_type;
        } catch (err) {
            console.error("Failed to load promotion enum data:", err);
            promotionTypes = [];
            couponTypes = [];
            discountTypes = [];
        }
    }

    let activeTypes = $derived(
        activeTab === 'promotions' ? promotionTypes :
        activeTab === 'coupons' ? couponTypes : discountTypes
    );

    function getTypeLabel(type: string) {
        const options = [...promotionTypes, ...couponTypes, ...discountTypes];
        const option = options.find((entry) => entry.value === type);
        return option?.labelLao || option?.label || type;
    }

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
                    bg: "bg-success-100 dark:bg-success-900/50",
                    text: "text-success-700 dark:text-success-400",
                    dot: "bg-success-500",
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
                return { icon: Percent, label: getTypeLabel(type), color: "text-purple-500" };
            case "FIXED":
                return { icon: Tag, label: getTypeLabel(type), color: "text-success-500" };
            case "BUY_X_GET_Y":
                return { icon: Gift, label: getTypeLabel(type), color: "text-orange-500" };
            case "BUNDLE":
                return { icon: Target, label: getTypeLabel(type), color: "text-blue-500" };
            default:
                return { icon: Tag, label: type, color: "text-gray-500" };
        }
    }

    async function loadProducts() {
        try {
            const res = await api.get("products?limit=500").json<any>();
            products = res.data || [];
        } catch(e) {
            console.error("Failed to load products:", e);
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
            toast.error(t("common.loadError"));
        } finally {
            isLoading = false;
        }
    }

    async function loadLoyaltySettings() {
        loyaltyLoading = true;
        try {
            const res = await api.get("customers/loyalty/settings").json<any>();
            if (res.success && res.data) {
                loyaltySettings = { ...loyaltySettings, ...res.data };
            }
        } catch (e) {
            console.error("Failed to load loyalty settings:", e);
        } finally {
            loyaltyLoading = false;
        }
    }

    async function saveLoyaltySettings() {
        loyaltySaving = true;
        try {
            await api.put("customers/loyalty/settings", { json: loyaltySettings }).json();
            toast.success(t("promotions.saveSuccess"));
        } catch (e) {
            console.error("Failed to save loyalty settings:", e);
            toast.error(t("promotions.saveFailed"));
        } finally {
            loyaltySaving = false;
        }
    }

    async function handleSubmit() {
        try {
            const endpoint = activeTab === "coupons" ? "promotions/coupons" :
                             activeTab === "discounts" ? "promotions/discounts" : "promotions";

            let payload: Record<string, any> = {
                name: formData.name,
                description: formData.description || null,
                type: formData.type,
                value: Number(formData.value),
                startDate: formData.startDate || undefined,
                endDate: formData.endDate || null,
                isActive: formData.isActive,
                conditions: {
                    daysOfWeek: formData.daysOfWeek,
                    startTime: formData.startTime,
                    endTime: formData.endTime,
                },
            };

            if (activeTab === "coupons") {
                payload.code = formData.code;
                payload.minPurchase = Number(formData.minPurchase) || 0;
                payload.maxDiscount = Number(formData.maxDiscount) || 0;
                payload.usageLimit = formData.usageLimitType === "unlimited" ? null : (Number(formData.usageLimit) || null);
                if (formData.barcode) payload.barcode = formData.barcode;
            } else if (activeTab === "discounts") {
                payload.minPurchase = Number(formData.minPurchase) || 0;
                payload.maxDiscount = Number(formData.maxDiscount) || 0;
                if (formData.productIds.length > 0) payload.productIds = formData.productIds;
            } else {
                payload.usageLimit = Number(formData.usageLimit) || null;
                if (formData.productIds.length > 0) payload.productIds = formData.productIds;
            }

            if (editingItem) {
                await api.put(`${endpoint}/${editingItem.id}`, { json: payload }).json();
                toast.success(t("common.success"));
            } else {
                await api.post(endpoint, { json: payload }).json();
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
        const cond = item.conditions || {};
        formData = {
            name: item.name || "",
            description: item.description || "",
            type: item.type || item.discountType?.toUpperCase() || "PERCENTAGE",
            value: item.value ?? item.discountValue ?? 0,
            minPurchase: item.minPurchase || 0,
            maxDiscount: item.maxDiscount || 0,
            startDate: item.startDate ? new Date(item.startDate).toISOString().split("T")[0] : "",
            endDate: item.endDate ? new Date(item.endDate).toISOString().split("T")[0] : "",
            isActive: item.isActive !== undefined ? item.isActive : true,
            usageLimit: item.usageLimit || 0,
            usageLimitType: item.usageLimit ? "limited" : "unlimited",
            code: item.code || "",
            barcode: item.barcode || "",
            productIds: item.productIds || [],
            daysOfWeek: cond.daysOfWeek || [true,true,true,true,true,true,true],
            startTime: cond.startTime || "00:00",
            endTime: cond.endTime || "23:59",
        };
        productSearchQuery = "";
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
            usageLimitType: "unlimited",
            code: "",
            barcode: "",
            productIds: [],
            daysOfWeek: [true,true,true,true,true,true,true],
            startTime: "00:00",
            endTime: "23:59",
        };
        productSearchQuery = "";
    }

    function copyCode(code: string) {
        navigator.clipboard.writeText(code);
        toast.success(t("common.copied"));
    }


    // Filtered data
    let filteredItems = $derived.by(() => {
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

    $effect(() => {
        auth.activeStoreId; // reload on store switch
        loadData();
    });

    onMount(() => {
        loadEnums();
        loadLoyaltySettings();
        loadProducts();
    });
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
                        {t("promotions.subtitle")}
                    </p>
                </div>
            </div>
        </div>
        
        {#if canCreatePromo}
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
        {/if}
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-success-100 dark:bg-success-900/50 rounded-lg">
                    <Zap class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <span class="text-2xl font-bold text-success-600 dark:text-success-400">{stats.activePromotions}</span>
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
                    { id: "loyalty", icon: Star, label: t("promotions.loyalty") },
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
                {#each ["all", "active", "scheduled", "expired", "paused"] as status (status)}
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

    <!-- Loyalty Points Panel -->
    {#if activeTab === "loyalty"}
        {#if loyaltyLoading}
            <div class="flex items-center justify-center py-20">
                <Loader2 class="w-10 h-10 text-pink-500 animate-spin" />
            </div>
        {:else}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Settings Card -->
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                    <div class="flex items-center gap-3 mb-5">
                        <div class="p-2 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg">
                            <Star class="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900 dark:text-white">{t("promotions.loyaltyTitle")}</h3>
                            <p class="text-xs text-gray-500 dark:text-gray-400">{t("promotions.loyaltySubtitle")}</p>
                        </div>
                        <div class="ml-auto">
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" bind:checked={loyaltySettings.enabled} class="sr-only peer" />
                                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-yellow-500"></div>
                            </label>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label for="pts-per-amt" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t("promotions.pointsPerAmount")}
                                </label>
                                <div class="flex items-center gap-2">
                                    <input id="pts-per-amt" type="number" bind:value={loyaltySettings.pointsPerAmount} min="1" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                                    <span class="text-xs text-gray-500 whitespace-nowrap">{t("common.points")}</span>
                                </div>
                            </div>
                            <div>
                                <label for="amt-per-pt" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t("promotions.amountPerPoint")}
                                </label>
                                <div class="flex items-center gap-2">
                                    <input id="amt-per-pt" type="number" bind:value={loyaltySettings.amountPerPoint} min="1" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                                    <span class="text-xs text-gray-500">₭</span>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label for="pt-value" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t("promotions.pointValue")} ({t("promotions.kipPerPoint")})
                                </label>
                                <input id="pt-value" type="number" bind:value={loyaltySettings.pointValue} min="1" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                            </div>
                            <div>
                                <label for="min-redeem" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t("promotions.minPointsRedeem")}
                                </label>
                                <input id="min-redeem" type="number" bind:value={loyaltySettings.minPointsRedeem} min="0" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                            </div>
                        </div>

                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <label for="pt-expiry" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {t("promotions.pointExpiry")}
                                </label>
                                <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                                    <input type="checkbox" bind:checked={loyaltySettings.noExpiry} class="rounded border-gray-300 dark:border-gray-600" />
                                    {t("promotions.noExpiry")}
                                </label>
                            </div>
                            <input id="pt-expiry" type="number" bind:value={loyaltySettings.pointExpiryDays} min="1" disabled={loyaltySettings.noExpiry} class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50" />
                        </div>

                        <button
                            onclick={saveLoyaltySettings}
                            disabled={loyaltySaving}
                            class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-xl font-semibold hover:from-yellow-600 hover:to-amber-600 transition-all disabled:opacity-50"
                        >
                            {#if loyaltySaving}
                                <Loader2 class="w-4 h-4 animate-spin" />
                            {:else}
                                <Save class="w-4 h-4" />
                            {/if}
                            {t("common.save")}
                        </button>
                    </div>
                </div>

                <!-- Calculation Preview -->
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                    <div class="flex items-center gap-3 mb-5">
                        <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                            <TrendingUp class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 class="font-semibold text-gray-900 dark:text-white">{t("promotions.calculationPreview")}</h3>
                    </div>
                    <div class="space-y-3">
                        {#each [10000, 50000, 100000, 500000] as amount}
                            {@const pts = Math.floor(amount / loyaltySettings.amountPerPoint) * loyaltySettings.pointsPerAmount}
                            {@const value = pts * loyaltySettings.pointValue}
                            <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <div>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{t("promotions.buyAmount", { amount: amount.toLocaleString() })}</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">{t("promotions.earnPoints", { points: pts })}</p>
                                </div>
                                <div class="text-right">
                                    <p class="text-sm font-bold text-yellow-600 dark:text-yellow-400">{pts} pts</p>
                                    <p class="text-xs text-gray-500">≈ {value.toLocaleString()} ₭</p>
                                </div>
                            </div>
                        {/each}
                    </div>
                    <div class="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
                        <p class="text-xs text-yellow-700 dark:text-yellow-400">
                            <strong>{t("promotions.formula")}:</strong> {t("promotions.formulaDescription", {
                                amount: loyaltySettings.amountPerPoint.toLocaleString(),
                                points: loyaltySettings.pointsPerAmount,
                                pointValue: loyaltySettings.pointValue.toLocaleString()
                            })}
                        </p>
                    </div>
                </div>
            </div>
        {/if}
    {:else}

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-pink-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else if filteredItems.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
            <Sparkles class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">{t("promotions.noPromotions")}</h3>
            <p class="text-gray-500 dark:text-gray-400 mt-2">{t("common.noData")}</p>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each filteredItems as item (item.id)}
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
                                    <Tag class="w-4 h-4 text-success-500" />
                                    <span class="font-bold text-success-600 dark:text-success-400">{formatCurrency(item.value || item.discountValue)}</span>
                                {/if}
                            </div>
                            
                            {#if item.minPurchase > 0}
                                <div class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                    {t("promotions.minimum")}: {formatCurrency(item.minPurchase)}
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
                                    <span class="text-gray-500 dark:text-gray-400">{t("promotions.used")}</span>
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
                                    : "text-success-600 hover:bg-success-100 dark:text-success-400 dark:hover:bg-success-900/30"
                            )}
                        >
                            {#if item.isActive}
                                <Pause class="w-4 h-4" />
                                {t("promotions.pause")}
                            {:else}
                                <Play class="w-4 h-4" />
                                {t("common.activate")}
                            {/if}
                        </button>
                        <div class="flex gap-1">
                            {#if activeTab === "coupons" && item.code}
                                <a
                                    href="/barcode?couponCode={encodeURIComponent(item.code)}&name={encodeURIComponent(item.name)}"
                                    target="_blank"
                                    class="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                                    title={t("promotions.printBarcode")}
                                >
                                    <Printer class="w-4 h-4" />
                                </a>
                            {/if}
                            {#if canUpdatePromo}
                            <button
                                onclick={() => openEdit(item)}
                                class="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-all"
                            >
                                <Edit class="w-4 h-4" />
                            </button>
                            {/if}
                            {#if canDeletePromo}
                            <button
                                onclick={() => handleDelete(item)}
                                class="p-2 text-danger-500 hover:bg-danger-100 dark:hover:bg-danger-900/30 rounded-lg transition-all"
                            >
                                <Trash2 class="w-4 h-4" />
                            </button>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <!-- Header -->
            <div class="px-6 py-4 bg-gradient-to-r from-pink-500 to-rose-600 flex items-center justify-between shrink-0">
                <h2 class="text-xl font-bold text-white">
                    {editingItem ? t("common.edit") : t("common.add")}
                    {activeTab === "coupons" ? t("promotions.coupon") : activeTab === "discounts" ? t("promotions.discount") : t("promotions.promotion")}
                </h2>
                <button onclick={() => (showModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg transition-all">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="flex flex-col flex-1 min-h-0">
                <!-- Scrollable body -->
                <div class="flex-1 overflow-y-auto p-6 space-y-5">

                    <!-- Row 1: Code + Name -->
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("common.code")}</label>
                            <input type="text" value={editingItem?.code ?? editingItem?.id?.slice(0,8) ?? ''} disabled
                                placeholder={t("common.auto")}
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-500" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                {t("common.name")} <span class="text-danger-500">*{t("promotions.required")}</span>
                            </label>
                            <input type="text" bind:value={formData.name} required
                                placeholder={t("common.name")}
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent" />
                        </div>
                    </div>

                    {#if activeTab === "coupons"}
                        <!-- Coupon Code -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("promotions.couponCode")} *</label>
                            <input type="text" bind:value={formData.code} required placeholder="SAVE20"
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white uppercase focus:ring-2 focus:ring-pink-500 focus:border-transparent" />
                        </div>

                        <!-- Usage Limit -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("promotions.usageLimit")}</label>
                            <div class="space-y-2.5">
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input type="radio" bind:group={formData.usageLimitType} value="unlimited"
                                        class="w-4 h-4 text-pink-600 border-gray-300 focus:ring-pink-500" />
                                    <span class="text-sm text-gray-700 dark:text-gray-300">{t("promotions.unlimitedUsage")}</span>
                                </label>
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input type="radio" bind:group={formData.usageLimitType} value="limited"
                                        class="w-4 h-4 text-pink-600 border-gray-300 focus:ring-pink-500" />
                                    <span class="text-sm text-gray-700 dark:text-gray-300">{t("promotions.limitedUsage")}</span>
                                    {#if formData.usageLimitType === "limited"}
                                        <input type="number" bind:value={formData.usageLimit} min="1"
                                            class="w-24 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500" />
                                        <span class="text-sm text-gray-500">{t("promotions.couponUnit")}</span>
                                    {/if}
                                </label>
                            </div>
                        </div>

                        <!-- Discount Type + Value -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("promotions.type")}</label>
                                <select bind:value={formData.type}
                                    class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500">
                                    {#each (couponTypes.length ? couponTypes : [{value:'FIXED',label:'Fixed Amount'}]) as pt (pt.value)}
                                        <option value={pt.value}>{pt.labelLao || pt.label}</option>
                                    {/each}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    {t("common.value")} ({formData.type === "PERCENTAGE" ? "%" : t("common.currency")}) *
                                </label>
                                <input type="number" bind:value={formData.value} required min="0"
                                    class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500" />
                            </div>
                        </div>

                        <!-- Min purchase + Max discount -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("promotions.minimumPurchase")}</label>
                                <input type="number" bind:value={formData.minPurchase} min="0"
                                    class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("promotions.maxDiscount")}</label>
                                <input type="number" bind:value={formData.maxDiscount} min="0"
                                    class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500" />
                            </div>
                        </div>

                        <!-- Barcode field -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("promotions.couponBarcode")}</label>
                            <div class="flex gap-2">
                                <input type="text" bind:value={formData.barcode} placeholder={t("promotions.barcodePlaceholder")}
                                    class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500" />
                                {#if formData.barcode || formData.code}
                                    <a href="/barcode?couponCode={encodeURIComponent(formData.barcode || formData.code)}&name={encodeURIComponent(formData.name)}"
                                        target="_blank"
                                        class="flex items-center gap-1.5 px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors shrink-0">
                                        <Printer class="w-4 h-4" />
                                        {t("promotions.printBarcode")}
                                    </a>
                                {/if}
                            </div>
                        </div>

                    {:else}
                        <!-- Products Section (Promotions & Discounts) -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("promotions.applicableProducts")}</label>
                            <div class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                                <!-- Search -->
                                <div class="relative border-b border-gray-200 dark:border-gray-700">
                                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="text" bind:value={productSearchQuery}
                                        placeholder={t("promotions.searchProduct")}
                                        class="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white text-sm outline-none" />
                                </div>
                                <!-- All products option -->
                                <label class="flex items-center gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                                    <input type="checkbox"
                                        checked={formData.productIds.length === 0}
                                        onchange={() => { formData.productIds = []; }}
                                        class="w-4 h-4 rounded text-pink-500 border-gray-300" />
                                    <Package class="w-4 h-4 text-gray-400" />
                                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("promotions.allProducts")}</span>
                                </label>
                                <!-- Product list -->
                                <div class="max-h-40 overflow-y-auto">
                                    {#if products.length === 0}
                                        <div class="flex items-center gap-2 px-3 py-3 text-sm text-gray-400">
                                            <RefreshCw class="w-4 h-4 animate-spin" />
                                            {t("common.loading")}...
                                        </div>
                                    {:else}
                                        {#each filteredProductList as product (product.id)}
                                            <label class="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                                                <input type="checkbox"
                                                    checked={formData.productIds.includes(product.id)}
                                                    onchange={(e) => {
                                                        if ((e.target as HTMLInputElement).checked) {
                                                            formData.productIds = [...formData.productIds, product.id];
                                                        } else {
                                                            formData.productIds = formData.productIds.filter(id => id !== product.id);
                                                        }
                                                    }}
                                                    class="w-4 h-4 rounded text-pink-500 border-gray-300" />
                                                <span class="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{product.name}</span>
                                                {#if product.price}
                                                    <span class="text-xs text-gray-400 shrink-0">{product.price?.toLocaleString()}</span>
                                                {/if}
                                            </label>
                                        {/each}
                                    {/if}
                                </div>
                                {#if formData.productIds.length > 0}
                                    <div class="px-3 py-2 bg-pink-50 dark:bg-pink-900/20 border-t border-pink-100 dark:border-pink-800 text-xs text-pink-600 dark:text-pink-400">
                                        {formData.productIds.length} {t("promotions.productsSelected")}
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <!-- Type + Value -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("promotions.type")}</label>
                                <select bind:value={formData.type}
                                    class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500">
                                    {#each activeTypes as pt (pt.value)}
                                        <option value={pt.value}>{pt.labelLao || pt.label}</option>
                                    {/each}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    {t("common.value")} ({formData.type === "PERCENTAGE" ? "%" : t("common.currency")}) *
                                </label>
                                <input type="number" bind:value={formData.value} required min="0"
                                    class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500" />
                            </div>
                        </div>

                        {#if activeTab === "discounts"}
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("promotions.minimumPurchase")}</label>
                                    <input type="number" bind:value={formData.minPurchase} min="0"
                                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500" />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("promotions.maxDiscount")}</label>
                                    <input type="number" bind:value={formData.maxDiscount} min="0"
                                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500" />
                                </div>
                            </div>
                        {:else}
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("promotions.usageLimit")}</label>
                                <input type="number" bind:value={formData.usageLimit} min="0"
                                    placeholder={t("promotions.unlimitedPlaceholder")}
                                    class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500" />
                            </div>
                        {/if}
                    {/if}

                    <!-- Time Period (collapsible) -->
                    <div class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                        <button type="button"
                            onclick={() => showTimePeriod = !showTimePeriod}
                            class="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                            <div class="flex items-center gap-2">
                                <Clock class="w-4 h-4 text-pink-500" />
                                <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("promotions.timePeriod")}</span>
                            </div>
                            <ChevronDown class={cn("w-4 h-4 text-gray-400 transition-transform duration-200", showTimePeriod && "rotate-180")} />
                        </button>
                        {#if showTimePeriod}
                            <div class="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                                <!-- Date range -->
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("promotions.dateRange")}</label>
                                    <div class="grid grid-cols-2 gap-3">
                                        <input type="date" bind:value={formData.startDate} required
                                            class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500" />
                                        <input type="date" bind:value={formData.endDate}
                                            class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500" />
                                    </div>
                                </div>

                                <!-- Days of week -->
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("promotions.daysOfWeek")}</label>
                                    <div class="flex flex-wrap gap-2">
                                        {#each DAY_KEYS as day, i}
                                            <label class="flex items-center gap-1.5 cursor-pointer select-none">
                                                <input type="checkbox" bind:checked={formData.daysOfWeek[i]}
                                                    class="w-4 h-4 rounded text-pink-500 border-gray-300 focus:ring-pink-500" />
                                                <span class="text-sm text-gray-700 dark:text-gray-300">{t(`promotions.${day}`)}</span>
                                            </label>
                                        {/each}
                                    </div>
                                </div>

                                <!-- Time range -->
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("promotions.timeRange")}</label>
                                    <div class="flex items-center gap-3">
                                        <span class="text-sm text-gray-600 dark:text-gray-400 shrink-0">{t("promotions.startTime")} :</span>
                                        <input type="time" bind:value={formData.startTime}
                                            class="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500" />
                                        <span class="text-sm text-gray-600 dark:text-gray-400 shrink-0">{t("promotions.endTime")} :</span>
                                        <input type="time" bind:value={formData.endTime}
                                            class="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500" />
                                    </div>
                                    {#if formData.startTime !== "00:00" || formData.endTime !== "23:59"}
                                        <p class="mt-2 text-xs text-danger-500 dark:text-danger-400">
                                            *{t("promotions.timeRangeWarning")}
                                        </p>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Notes -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("common.description")}</label>
                        <textarea bind:value={formData.description} rows="2"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none text-sm"></textarea>
                    </div>

                    <!-- Active toggle -->
                    <div class="flex items-center gap-3">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" bind:checked={formData.isActive} class="sr-only peer" />
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 dark:peer-focus:ring-pink-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                        </label>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("common.active")}</span>
                    </div>
                </div>

                <!-- Footer -->
                <div class="shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                    <button type="button" onclick={() => (showModal = false)}
                        class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                        {t("common.cancel")}
                    </button>
                    <button type="submit"
                        class="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-medium hover:from-pink-600 hover:to-rose-700 transition-all shadow-lg flex items-center gap-2">
                        <Save class="w-4 h-4" />
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
