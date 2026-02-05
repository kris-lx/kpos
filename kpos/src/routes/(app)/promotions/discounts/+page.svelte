<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { formatCurrency } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import {
        BadgePercent,
        Plus,
        Search,
        Edit,
        Trash2,
        Tag,
        Percent,
        X,
        Loader2,
        Check,
        Package,
        Layers,
        ArrowLeft,
        ToggleLeft,
        ToggleRight,
        Clock,
        Target,
        ChevronLeft,
        ChevronRight,
        ShoppingBag,
        Filter,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let filterActive = $state<"all" | "active" | "inactive">("all");
    let isLoading = $state(true);
    let showModal = $state(false);
    let editingDiscount = $state<any>(null);
    let currentPage = $state(1);
    let itemsPerPage = $state(12);
    let totalItems = $state(0);
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Data
    let discounts = $state<any[]>([]);
    let products = $state<any[]>([]);
    let categories = $state<any[]>([]);

    // Form
    let formData = $state({
        name: "",
        description: "",
        discountType: "PERCENTAGE",
        discountValue: 10,
        applyTo: "all",
        productIds: [] as string[],
        categoryIds: [] as string[],
        minQuantity: 1,
        startDate: "",
        endDate: "",
        isActive: true,
    });

    // Stats
    let stats = $derived({
        total: discounts.length,
        active: discounts.filter((d) => d.isActive).length,
        percentage: discounts.filter((d) => d.discountType === "PERCENTAGE" || d.discountType === "percentage").length,
        fixed: discounts.filter((d) => d.discountType === "FIXED" || d.discountType === "fixed").length,
    });

    function getApplyToLabel(applyTo: string) {
        switch (applyTo) {
            case "all": return "ທັງໝົດ";
            case "products": return "ສິນຄ້າ";
            case "categories": return "ໝວດໝູ່";
            default: return applyTo;
        }
    }

    function getApplyToConfig(applyTo: string) {
        switch (applyTo) {
            case "all":
                return { icon: ShoppingBag, bg: "bg-blue-100 dark:bg-blue-900/50", text: "text-blue-600 dark:text-blue-400" };
            case "products":
                return { icon: Package, bg: "bg-green-100 dark:bg-green-900/50", text: "text-green-600 dark:text-green-400" };
            case "categories":
                return { icon: Layers, bg: "bg-purple-100 dark:bg-purple-900/50", text: "text-purple-600 dark:text-purple-400" };
            default:
                return { icon: Tag, bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400" };
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
            if (filterActive !== 'all') params.set('isActive', filterActive === 'active' ? 'true' : 'false');
            
            const [discRes, prodRes, catRes] = await Promise.all([
                api.get(`promotions/discounts?${params}`).json<any>(),
                api.get("products").json<any>(),
                api.get("categories").json<any>(),
            ]);
            discounts = discRes.data || [];
            totalItems = discRes.meta?.total || discounts.length;
            products = prodRes.data || [];
            categories = catRes.data || [];
        } catch (e) {
            console.error("Failed to load:", e);
            discounts = [];
            totalItems = 0;
        } finally {
            isLoading = false;
        }
    }

    // Watch for search changes with debounce
    $effect(() => {
        const query = searchQuery;
        const filter = filterActive;
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
            if (editingDiscount) {
                await api.put(`promotions/discounts/${editingDiscount.id}`, { json: formData }).json();
                toast.success(t("common.success"));
            } else {
                await api.post("promotions/discounts", { json: formData }).json();
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

    async function toggleActive(discount: any) {
        try {
            await api.put(`promotions/discounts/${discount.id}`, {
                json: { isActive: !discount.isActive }
            }).json();
            toast.success(t("common.success"));
            loadData();
        } catch (e) {
            console.error("Failed to update:", e);
            toast.error(t("common.error"));
        }
    }

    async function handleDelete(discount: any) {
        if (!confirm(t("common.confirmDelete"))) return;
        try {
            await api.delete(`promotions/discounts/${discount.id}`).json();
            toast.success(t("common.success"));
            loadData();
        } catch (e) {
            console.error("Failed to delete:", e);
            toast.error(t("common.error"));
        }
    }

    function openEdit(discount: any) {
        editingDiscount = discount;
        formData = {
            name: discount.name || "",
            description: discount.description || "",
            discountType: discount.discountType || "PERCENTAGE",
            discountValue: discount.discountValue || 0,
            applyTo: discount.applyTo || "all",
            productIds: discount.productIds || [],
            categoryIds: discount.categoryIds || [],
            minQuantity: discount.minQuantity || 1,
            startDate: discount.startDate?.split("T")[0] || "",
            endDate: discount.endDate?.split("T")[0] || "",
            isActive: discount.isActive ?? true,
        };
        showModal = true;
    }

    function resetForm() {
        editingDiscount = null;
        formData = {
            name: "",
            description: "",
            discountType: "PERCENTAGE",
            discountValue: 10,
            applyTo: "all",
            productIds: [],
            categoryIds: [],
            minQuantity: 1,
            startDate: "",
            endDate: "",
            isActive: true,
        };
    }

    function formatDate(date: string): string {
        if (!date) return "-";
        return new Intl.DateTimeFormat("lo-LA", {
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(new Date(date));
    }

    function toggleProductSelection(productId: string) {
        if (formData.productIds.includes(productId)) {
            formData.productIds = formData.productIds.filter((id) => id !== productId);
        } else {
            formData.productIds = [...formData.productIds, productId];
        }
    }

    function toggleCategorySelection(categoryId: string) {
        if (formData.categoryIds.includes(categoryId)) {
            formData.categoryIds = formData.categoryIds.filter((id) => id !== categoryId);
        } else {
            formData.categoryIds = [...formData.categoryIds, categoryId];
        }
    }

    // Filtered and paginated - now using server-side data directly
    let filteredDiscounts = $derived(() => {
        // Server already filters, so just return discounts
        return discounts;
    });

    let paginatedDiscounts = $derived(() => {
        // Server already paginates, so just return discounts
        return discounts;
    });

    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));

    onMount(() => {
        // Initial load handled by effect
    });
</script>

<svelte:head>
    <title>{t("promotions.discounts")} - KPOS</title>
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
                <div class="p-2.5 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl shadow-lg">
                    <BadgePercent class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        {t("promotions.discounts")}
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        ຈັດການສ່ວນຫຼຸດສິນຄ້າ
                    </p>
                </div>
            </div>
        </div>

        <button
            onclick={() => {
                resetForm();
                showModal = true;
            }}
            class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:from-orange-600 hover:to-red-700 transition-all"
        >
            <Plus class="w-5 h-5" />
            ສ້າງສ່ວນຫຼຸດໃໝ່
        </button>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
                    <BadgePercent class="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <span class="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ສ່ວນຫຼຸດທັງໝົດ</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <Check class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ເປີດໃຊ້ງານ</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Percent class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span class="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.percentage}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ສ່ວນຫຼຸດ %</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Tag class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.fixed}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ສ່ວນຫຼຸດເງິນ</p>
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
                    placeholder="ຄົ້ນຫາສ່ວນຫຼຸດ..."
                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
            </div>

            <!-- Status Filter -->
            <div class="flex gap-2">
                {#each [
                    { id: "all", label: t("common.all") },
                    { id: "active", label: "ເປີດໃຊ້" },
                    { id: "inactive", label: "ປິດໃຊ້" },
                ] as filter}
                    <button
                        onclick={() => { filterActive = filter.id as any; }}
                        class={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            filterActive === filter.id
                                ? "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        )}
                    >
                        {filter.label}
                    </button>
                {/each}
            </div>
        </div>
    </div>

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-orange-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else if paginatedDiscounts().length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
            <BadgePercent class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີສ່ວນຫຼຸດ</h3>
            <p class="text-gray-500 dark:text-gray-400 mt-2">ສ້າງສ່ວນຫຼຸດໃໝ່ເພື່ອເລີ່ມຕົ້ນ</p>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each paginatedDiscounts() as discount}
                {@const applyConfig = getApplyToConfig(discount.applyTo)}
                {@const ApplyIcon = applyConfig.icon}

                <div class={cn(
                    "bg-white dark:bg-gray-800 rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md",
                    discount.isActive
                        ? "border-gray-200 dark:border-gray-700"
                        : "border-gray-200 dark:border-gray-700 opacity-60"
                )}>
                    <!-- Header -->
                    <div class="px-4 py-3 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 border-b border-orange-100 dark:border-orange-800 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            {#if discount.discountType === "PERCENTAGE" || discount.discountType === "percentage"}
                                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                                    <Percent class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                </div>
                                <span class="text-xl font-bold text-purple-600 dark:text-purple-400">{discount.discountValue}%</span>
                            {:else}
                                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                                    <Tag class="w-5 h-5 text-green-600 dark:text-green-400" />
                                </div>
                                <span class="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(discount.discountValue)}</span>
                            {/if}
                        </div>
                        <button
                            onclick={() => toggleActive(discount)}
                            class="p-1"
                        >
                            {#if discount.isActive}
                                <ToggleRight class="w-8 h-8 text-green-500" />
                            {:else}
                                <ToggleLeft class="w-8 h-8 text-gray-400" />
                            {/if}
                        </button>
                    </div>

                    <!-- Content -->
                    <div class="p-4">
                        <h3 class="font-semibold text-gray-900 dark:text-white mb-1">{discount.name}</h3>
                        {#if discount.description}
                            <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{discount.description}</p>
                        {/if}

                        <!-- Apply To -->
                        <div class="flex items-center gap-2 mb-3">
                            <div class={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm", applyConfig.bg)}>
                                <ApplyIcon class={cn("w-4 h-4", applyConfig.text)} />
                                <span class={cn("font-medium", applyConfig.text)}>{getApplyToLabel(discount.applyTo)}</span>
                            </div>
                            {#if discount.minQuantity > 1}
                                <span class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                    ຂັ້ນຕ່ຳ {discount.minQuantity} ຊິ້ນ
                                </span>
                            {/if}
                        </div>

                        <!-- Selected Items Count -->
                        {#if discount.applyTo === "products" && discount.productIds?.length > 0}
                            <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                ໃຊ້ກັບ {discount.productIds.length} ສິນຄ້າ
                            </div>
                        {:else if discount.applyTo === "categories" && discount.categoryIds?.length > 0}
                            <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                ໃຊ້ກັບ {discount.categoryIds.length} ໝວດໝູ່
                            </div>
                        {/if}

                        <!-- Dates -->
                        {#if discount.startDate || discount.endDate}
                            <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <Clock class="w-3.5 h-3.5" />
                                {#if discount.startDate}
                                    <span>{formatDate(discount.startDate)}</span>
                                {/if}
                                {#if discount.startDate && discount.endDate}
                                    <span>→</span>
                                {/if}
                                {#if discount.endDate}
                                    <span>{formatDate(discount.endDate)}</span>
                                {/if}
                            </div>
                        {/if}
                    </div>

                    <!-- Actions -->
                    <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-1">
                        <button
                            onclick={() => openEdit(discount)}
                            class="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-all"
                        >
                            <Edit class="w-4 h-4" />
                        </button>
                        <button
                            onclick={() => handleDelete(discount)}
                            class="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all"
                        >
                            <Trash2 class="w-4 h-4" />
                        </button>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Pagination -->
        {#if totalPages >= 1}
            <div class="flex items-center justify-between mt-6 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-600 dark:text-gray-400">ສະແດງ</span>
                    <select
                        bind:value={itemsPerPage}
                        onchange={() => { currentPage = 1; }}
                        class="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    >
                        {#each [10, 20, 50, 100] as size}
                            <option value={size}>{size}</option>
                        {/each}
                    </select>
                    <span class="text-sm text-gray-600 dark:text-gray-400">ລາຍການ</span>
                </div>
                <div class="flex items-center gap-2">
                    <button
                        onclick={() => (currentPage = Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                    >
                        <ChevronLeft class="w-5 h-5" />
                    </button>
                    <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                        {currentPage} / {totalPages} (ທັງໝົດ {totalItems})
                    </span>
                    <button
                        onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                    >
                        <ChevronRight class="w-5 h-5" />
                    </button>
                </div>
            </div>
        {/if}
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Modal Header -->
            <div class="px-6 py-4 bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">
                    {editingDiscount ? "ແກ້ໄຂສ່ວນຫຼຸດ" : "ສ້າງສ່ວນຫຼຸດໃໝ່"}
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
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ຊື່ສ່ວນຫຼຸດ *
                    </label>
                    <input
                        type="text"
                        bind:value={formData.name}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ລາຍລະອຽດ
                    </label>
                    <textarea
                        bind:value={formData.description}
                        rows="2"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                    ></textarea>
                </div>

                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ປະເພດສ່ວນຫຼຸດ
                        </label>
                        <select
                            bind:value={formData.discountType}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                            bind:value={formData.discountValue}
                            required
                            min="0"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ຊື້ຂັ້ນຕ່ຳ (ຊິ້ນ)
                        </label>
                        <input
                            type="number"
                            bind:value={formData.minQuantity}
                            min="1"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <!-- Apply To -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ນຳໃຊ້ກັບ
                    </label>
                    <div class="flex gap-2">
                        {#each [
                            { id: "all", label: "ທັງໝົດ", icon: ShoppingBag },
                            { id: "products", label: "ສິນຄ້າ", icon: Package },
                            { id: "categories", label: "ໝວດໝູ່", icon: Layers },
                        ] as option}
                            <button
                                type="button"
                                onclick={() => (formData.applyTo = option.id)}
                                class={cn(
                                    "flex items-center gap-2 px-4 py-2.5 rounded-xl border font-medium transition-all",
                                    formData.applyTo === option.id
                                        ? "bg-orange-100 dark:bg-orange-900/50 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400"
                                        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                                )}
                            >
                                <option.icon class="w-4 h-4" />
                                {option.label}
                            </button>
                        {/each}
                    </div>
                </div>

                <!-- Products Selection -->
                {#if formData.applyTo === "products"}
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ເລືອກສິນຄ້າ
                        </label>
                        <div class="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl p-2 space-y-1">
                            {#each products as product}
                                <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.productIds.includes(product.id)}
                                        onchange={() => toggleProductSelection(product.id)}
                                        class="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                                    />
                                    <span class="text-sm text-gray-900 dark:text-white">{product.name}</span>
                                </label>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Categories Selection -->
                {#if formData.applyTo === "categories"}
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ເລືອກໝວດໝູ່
                        </label>
                        <div class="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl p-2 space-y-1">
                            {#each categories as category}
                                <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.categoryIds.includes(category.id)}
                                        onchange={() => toggleCategorySelection(category.id)}
                                        class="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                                    />
                                    <span class="text-sm text-gray-900 dark:text-white">{category.name}</span>
                                </label>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Dates -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ວັນເລີ່ມຕົ້ນ
                        </label>
                        <input
                            type="date"
                            bind:value={formData.startDate}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ວັນສິ້ນສຸດ
                        </label>
                        <input
                            type="date"
                            bind:value={formData.endDate}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" bind:checked={formData.isActive} class="sr-only peer" />
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 dark:peer-focus:ring-orange-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-orange-600"></div>
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
                        class="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-medium hover:from-orange-600 hover:to-red-700 transition-all shadow-lg"
                    >
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
