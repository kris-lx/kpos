<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { formatCurrency, formatDate } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import {
        Ticket,
        Plus,
        Search,
        Edit,
        Trash2,
        Copy,
        Calendar,
        Percent,
        Tag,
        X,
        Loader2,
        Check,
        Clock,
        Users,
        TrendingUp,
        Pause,
        Play,
        ChevronLeft,
        ChevronRight,
        ArrowLeft,
        Sparkles,
        Gift,
        AlertCircle,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let statusFilter = $state("all");
    let isLoading = $state(true);
    let showModal = $state(false);
    let editingCoupon = $state<any>(null);
    let currentPage = $state(1);
    let itemsPerPage = $state(12);
    let totalItems = $state(0);
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Data
    let coupons = $state<any[]>([]);

    // Form
    let formData = $state({
        code: "",
        name: "",
        description: "",
        type: "PERCENTAGE",
        value: 10,
        minPurchase: 0,
        maxDiscount: 0,
        usageLimit: 0,
        usageCount: 0,
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        isActive: true,
    });

    // Stats
    let stats = $derived({
        total: coupons.length,
        active: coupons.filter((c) => getStatus(c) === "active").length,
        totalUsage: coupons.reduce((sum, c) => sum + (c.usageCount || 0), 0),
        totalSaved: coupons.reduce((sum, c) => sum + (c.totalSaved || 0), 0),
    });

    function getStatus(item: any): string {
        const now = new Date();
        const start = new Date(item.startDate);
        const end = item.endDate ? new Date(item.endDate) : null;
        if (!item.isActive) return "paused";
        if (end && end < now) return "expired";
        if (start > now) return "scheduled";
        if (item.usageLimit > 0 && item.usageCount >= item.usageLimit) return "exhausted";
        return "active";
    }

    function getStatusConfig(status: string) {
        switch (status) {
            case "active":
                return {
                    bg: "bg-success-100 dark:bg-success-900/50",
                    text: "text-success-700 dark:text-success-400",
                    dot: "bg-success-500",
                    label: "ໃຊ້ງານໄດ້",
                };
            case "scheduled":
                return {
                    bg: "bg-blue-100 dark:bg-blue-900/50",
                    text: "text-blue-700 dark:text-blue-400",
                    dot: "bg-blue-500",
                    label: "ກຳນົດເວລາ",
                };
            case "expired":
                return {
                    bg: "bg-gray-100 dark:bg-gray-700",
                    text: "text-gray-600 dark:text-gray-400",
                    dot: "bg-gray-500",
                    label: "ໝົດອາຍຸ",
                };
            case "paused":
                return {
                    bg: "bg-amber-100 dark:bg-amber-900/50",
                    text: "text-amber-700 dark:text-amber-400",
                    dot: "bg-amber-500",
                    label: "ຢຸດຊົ່ວຄາວ",
                };
            case "exhausted":
                return {
                    bg: "bg-danger-100 dark:bg-danger-900/50",
                    text: "text-danger-700 dark:text-danger-400",
                    dot: "bg-danger-500",
                    label: "ໃຊ້ໝົດແລ້ວ",
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

    async function loadData() {
        isLoading = true;
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
            });
            if (searchQuery) params.set('search', searchQuery);
            if (statusFilter !== 'all') params.set('status', statusFilter);
            
            const response = await api.get(`promotions/coupons/list?${params}`).json<any>();
            coupons = response.data || [];
            totalItems = response.meta?.total || coupons.length;
        } catch (e) {
            console.error("Failed to load:", e);
            coupons = [];
            totalItems = 0;
        } finally {
            isLoading = false;
        }
    }

    // Watch for search changes with debounce
    $effect(() => {
        const query = searchQuery;
        const status = statusFilter;
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadData();
        }, 300);
    });

    // Watch for page changes
    $effect(() => {
        const page = currentPage;
        loadData();
    });

    async function handleSubmit() {
        try {
            if (editingCoupon) {
                await api.put(`promotions/coupons/${editingCoupon.id}`, { json: formData }).json();
                toast.success(t("common.success"));
            } else {
                await api.post("promotions/coupons", { json: formData }).json();
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

    async function toggleStatus(coupon: any) {
        try {
            await api.put(`promotions/coupons/${coupon.id}`, {
                json: { isActive: !coupon.isActive }
            }).json();
            toast.success(t("common.success"));
            loadData();
        } catch (e) {
            console.error("Failed to update:", e);
            toast.error(t("common.error"));
        }
    }

    async function handleDelete(coupon: any) {
        if (!confirm(t("common.confirmDelete"))) return;
        try {
            await api.delete(`promotions/coupons/${coupon.id}`).json();
            toast.success(t("common.success"));
            loadData();
        } catch (e) {
            console.error("Failed to delete:", e);
            toast.error(t("common.error"));
        }
    }

    function openEdit(coupon: any) {
        editingCoupon = coupon;
        formData = {
            code: coupon.code || "",
            name: coupon.name || "",
            description: coupon.description || "",
            type: coupon.type || "PERCENTAGE",
            value: coupon.value || 0,
            minPurchase: coupon.minPurchase || 0,
            maxDiscount: coupon.maxDiscount || 0,
            usageLimit: coupon.usageLimit || 0,
            usageCount: coupon.usageCount || 0,
            startDate: coupon.startDate?.split("T")[0] || new Date().toISOString().split("T")[0],
            endDate: coupon.endDate?.split("T")[0] || "",
            isActive: coupon.isActive ?? true,
        };
        showModal = true;
    }

    function resetForm() {
        editingCoupon = null;
        formData = {
            code: "",
            name: "",
            description: "",
            type: "PERCENTAGE",
            value: 10,
            minPurchase: 0,
            maxDiscount: 0,
            usageLimit: 0,
            usageCount: 0,
            startDate: new Date().toISOString().split("T")[0],
            endDate: "",
            isActive: true,
        };
    }

    function generateCode() {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let code = "";
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        formData.code = code;
    }

    function copyCode(code: string) {
        navigator.clipboard.writeText(code);
        toast.success("ຄັດລອກລະຫັດແລ້ວ");
    }


    // Filtered and paginated - now using server-side data directly
    let filteredCoupons = $derived.by(() => {
        // Server already filters, so just return coupons
        return coupons;
    });

    let paginatedCoupons = $derived.by(() => {
        // Server already paginates, so just return coupons
        return coupons;
    });

    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));

</script>

<svelte:head>
    <title>{t("promotions.coupons")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <a
                    href="/promotions"
                    class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
                >
                    <ArrowLeft class="w-5 h-5 text-gray-500" />
                </a>
                <div class="p-2.5 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg">
                    <Ticket class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        {t("promotions.coupons")}
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        ຈັດການຄູປອງສ່ວນຫຼຸດ
                    </p>
                </div>
            </div>
        </div>

        <button
            onclick={() => {
                resetForm();
                showModal = true;
            }}
            class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:from-purple-600 hover:to-violet-700 transition-all"
        >
            <Plus class="w-5 h-5" />
            ສ້າງຄູປອງໃໝ່
        </button>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Ticket class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span class="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຄູປອງທັງໝົດ</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-success-100 dark:bg-success-900/50 rounded-lg">
                    <Check class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <span class="text-2xl font-bold text-success-600 dark:text-success-400">{stats.active}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ເປີດໃຊ້ງານ</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Users class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalUsage}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ການໃຊ້ທັງໝົດ</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-pink-100 dark:bg-pink-900/50 rounded-lg">
                    <TrendingUp class="w-5 h-5 text-pink-600 dark:text-pink-400" />
                </div>
                <span class="text-2xl font-bold text-pink-600 dark:text-pink-400">{formatCurrency(stats.totalSaved)}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ປະຢັດໄດ້</p>
        </div>
    </div>

    <!-- Search & Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <!-- Search -->
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="ຄົ້ນຫາລະຫັດ ຫຼື ຊື່ຄູປອງ..."
                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
            </div>

            <!-- Status Filter -->
            <div class="flex gap-2 flex-wrap">
                {#each ["all", "active", "scheduled", "paused", "expired", "exhausted"] as status (status)}
                    {@const config = getStatusConfig(status)}
                    <button
                        onclick={() => { statusFilter = status; }}
                        class={cn(
                            "px-3 py-2 rounded-lg text-sm font-medium transition-all",
                            statusFilter === status
                                ? "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        )}
                    >
                        {status === "all" ? t("common.all") : config.label}
                    </button>
                {/each}
            </div>
        </div>
    </div>

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-purple-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else if paginatedCoupons.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
            <Ticket class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີຄູປອງ</h3>
            <p class="text-gray-500 dark:text-gray-400 mt-2">ສ້າງຄູປອງໃໝ່ເພື່ອເລີ່ມຕົ້ນ</p>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {#each paginatedCoupons as coupon (coupon.id)}
                {@const status = getStatus(coupon)}
                {@const statusConfig = getStatusConfig(status)}

                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <!-- Header -->
                    <div class="px-4 py-3 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 border-b border-purple-100 dark:border-purple-800">
                        <div class="flex items-center justify-between">
                            <button
                                onclick={() => copyCode(coupon.code)}
                                class="flex items-center gap-2 font-mono text-lg font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                            >
                                {coupon.code}
                                <Copy class="w-4 h-4" />
                            </button>
                            <span class={cn(
                                "px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1",
                                statusConfig.bg, statusConfig.text
                            )}>
                                <span class={cn("w-1.5 h-1.5 rounded-full", statusConfig.dot)}></span>
                                {statusConfig.label}
                            </span>
                        </div>
                    </div>

                    <!-- Content -->
                    <div class="p-4">
                        <h3 class="font-semibold text-gray-900 dark:text-white mb-1">{coupon.name}</h3>
                        {#if coupon.description}
                            <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{coupon.description}</p>
                        {/if}

                        <!-- Discount Value -->
                        <div class="flex items-center gap-2 mb-3">
                            {#if coupon.type === "PERCENTAGE" || coupon.type === "percentage"}
                                <div class="flex items-center gap-1 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                                    <Percent class="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    <span class="font-bold text-purple-600 dark:text-purple-400">{coupon.value}%</span>
                                </div>
                            {:else}
                                <div class="flex items-center gap-1 px-3 py-1.5 bg-success-100 dark:bg-success-900/50 rounded-lg">
                                    <Tag class="w-4 h-4 text-success-600 dark:text-success-400" />
                                    <span class="font-bold text-success-600 dark:text-success-400">{formatCurrency(coupon.value)}</span>
                                </div>
                            {/if}

                            {#if coupon.minPurchase > 0}
                                <span class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                    ຂັ້ນຕ່ຳ {formatCurrency(coupon.minPurchase)}
                                </span>
                            {/if}
                        </div>

                        <!-- Dates -->
                        <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
                            <Calendar class="w-3.5 h-3.5" />
                            <span>{formatDate(coupon.startDate)}</span>
                            {#if coupon.endDate}
                                <span>→</span>
                                <span>{formatDate(coupon.endDate)}</span>
                            {/if}
                        </div>

                        <!-- Usage Progress -->
                        {#if coupon.usageLimit > 0}
                            <div class="mb-3">
                                <div class="flex items-center justify-between text-xs mb-1">
                                    <span class="text-gray-500 dark:text-gray-400">ໃຊ້ແລ້ວ</span>
                                    <span class="font-medium text-gray-900 dark:text-white">
                                        {coupon.usageCount || 0} / {coupon.usageLimit}
                                    </span>
                                </div>
                                <div class="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        class="h-full bg-gradient-to-r from-purple-500 to-violet-500 rounded-full transition-all"
                                        style="width: {Math.min(100, ((coupon.usageCount || 0) / coupon.usageLimit) * 100)}%"
                                    ></div>
                                </div>
                            </div>
                        {:else}
                            <div class="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                ໃຊ້ແລ້ວ: {coupon.usageCount || 0} ຄັ້ງ (ບໍ່ຈຳກັດ)
                            </div>
                        {/if}
                    </div>

                    <!-- Actions -->
                    <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
                        <button
                            onclick={() => toggleStatus(coupon)}
                            class={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                                coupon.isActive
                                    ? "text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
                                    : "text-success-600 hover:bg-success-100 dark:text-success-400 dark:hover:bg-success-900/30"
                            )}
                        >
                            {#if coupon.isActive}
                                <Pause class="w-4 h-4" />
                                ຢຸດ
                            {:else}
                                <Play class="w-4 h-4" />
                                ເປີດ
                            {/if}
                        </button>
                        <div class="flex gap-1">
                            <button
                                onclick={() => openEdit(coupon)}
                                class="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-all"
                            >
                                <Edit class="w-4 h-4" />
                            </button>
                            <button
                                onclick={() => handleDelete(coupon)}
                                class="p-2 text-danger-500 hover:bg-danger-100 dark:hover:bg-danger-900/30 rounded-lg transition-all"
                            >
                                <Trash2 class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Pagination -->
        {#if totalPages > 1}
            <div class="flex items-center justify-center gap-2 mt-6">
                <button
                    onclick={() => (currentPage = Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                    <ChevronLeft class="w-5 h-5" />
                </button>
                <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {currentPage} / {totalPages}
                </span>
                <button
                    onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                    <ChevronRight class="w-5 h-5" />
                </button>
            </div>
        {/if}
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Modal Header -->
            <div class="px-6 py-4 bg-gradient-to-r from-purple-500 to-violet-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">
                    {editingCoupon ? "ແກ້ໄຂຄູປອງ" : "ສ້າງຄູປອງໃໝ່"}
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
                <!-- Code -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ລະຫັດຄູປອງ *
                    </label>
                    <div class="flex gap-2">
                        <input
                            type="text"
                            bind:value={formData.code}
                            required
                            placeholder="SAVE20"
                            class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white uppercase font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <button
                            type="button"
                            onclick={generateCode}
                            class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                        >
                            <Sparkles class="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ຊື່ຄູປອງ *
                    </label>
                    <input
                        type="text"
                        bind:value={formData.name}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ລາຍລະອຽດ
                    </label>
                    <textarea
                        bind:value={formData.description}
                        rows="2"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    ></textarea>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ປະເພດສ່ວນຫຼຸດ
                        </label>
                        <select
                            bind:value={formData.type}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                            <option value="PERCENTAGE">ເປີເຊັນ (%)</option>
                            <option value="FIXED">ຈຳນວນເງິນ</option>
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
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ວັນສິ້ນສຸດ
                        </label>
                        <input
                            type="date"
                            bind:value={formData.endDate}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ຈຳນວນໃຊ້ໄດ້ (0 = ບໍ່ຈຳກັດ)
                    </label>
                    <input
                        type="number"
                        bind:value={formData.usageLimit}
                        min="0"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                </div>

                <div class="flex items-center gap-3">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" bind:checked={formData.isActive} class="sr-only peer" />
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
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
                        class="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-xl font-medium hover:from-purple-600 hover:to-violet-700 transition-all shadow-lg"
                    >
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
