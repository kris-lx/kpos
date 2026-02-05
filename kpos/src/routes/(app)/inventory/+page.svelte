<script lang="ts">
    import {
        createQuery,
        createMutation,
        useQueryClient,
    } from "@tanstack/svelte-query";
    import { api } from "$api";
    import { cn, formatCurrency, formatDate } from "$utils";
    import { toast } from "svelte-sonner";
    import { t } from "$lib/i18n/index.svelte";
    import StoreBranchSelector from "$lib/components/StoreBranchSelector.svelte";
    import {
        Plus,
        Search,
        Pencil,
        Trash2,
        Package,
        AlertTriangle,
        ArrowUp,
        ArrowDown,
        X,
        Filter,
        ChevronLeft,
        ChevronRight,
        ChevronsLeft,
        ChevronsRight,
    } from "lucide-svelte";

    const queryClient = useQueryClient();

    // Pagination State
    let currentPage = $state(1);
    let pageSize = $state(10);
    const pageSizeOptions = [10, 20, 50, 100];

    // Search State with debounce
    let searchQuery = $state("");
    let debouncedSearch = $state("");
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Filter State
    let filterType = $state<"all" | "low" | "out">("all");

    // Modal State
    let showAdjustModal = $state(false);
    let selectedProduct = $state<any>(null);
    let adjustmentType = $state<"add" | "subtract">("add");
    let adjustmentQuantity = $state(0);
    let adjustmentReason = $state("");

    // Debounced search handler
    function handleSearchInput(value: string) {
        searchQuery = value;
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            debouncedSearch = value;
            currentPage = 1; // Reset to first page on search
        }, 300);
    }

    // Reset page when filter changes
    function handleFilterChange(type: "all" | "low" | "out") {
        filterType = type;
        currentPage = 1;
    }

    // Reset page when page size changes
    function handlePageSizeChange(size: number) {
        pageSize = size;
        currentPage = 1;
    }

    // Define response type
    interface InventoryResponse {
        data: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }

    // Helper function to build query params (avoids Svelte closure warning)
    function buildQueryParams() {
        const params = new URLSearchParams();
        if (debouncedSearch) params.append("search", debouncedSearch);
        if (filterType === "low") params.append("lowStock", "true");
        if (filterType === "out") params.append("outOfStock", "true");
        params.append("page", String(currentPage));
        params.append("limit", String(pageSize));
        return params.toString();
    }

    // Queries with server-side pagination
    const inventoryQuery = createQuery<InventoryResponse>({
        queryKey: ["inventory"],
        queryFn: async () => {
            const response = await api.get(`inventory?${buildQueryParams()}`).json<any>();
            return {
                data: response.data || [],
                total: response.total || response.pagination?.total || 0,
                page: response.page || response.pagination?.page || currentPage,
                limit: response.limit || response.pagination?.limit || pageSize,
                totalPages: response.totalPages || response.pagination?.pages || Math.ceil((response.total || response.pagination?.total || 0) / pageSize),
            };
        },
    });

    // Refetch when dependencies change
    $effect(() => {
        // Track dependencies explicitly
        void debouncedSearch;
        void filterType;
        void currentPage;
        void pageSize;
        // Trigger refetch
        $inventoryQuery.refetch();
    });

    // Pagination computed values
    let totalPages = $derived($inventoryQuery.data?.totalPages || 1);
    let totalItems = $derived($inventoryQuery.data?.total || 0);
    let startItem = $derived((currentPage - 1) * pageSize + 1);
    let endItem = $derived(Math.min(currentPage * pageSize, totalItems));

    // Generate page numbers for pagination
    let pageNumbers = $derived.by(() => {
        const pages: (number | string)[] = [];
        const maxVisiblePages = 5;
        
        if (totalPages <= maxVisiblePages) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            if (currentPage <= 3) {
                for (let i = 1; i <= 4; i++) pages.push(i);
                pages.push("...");
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 2) {
                pages.push(1);
                pages.push("...");
                for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                pages.push("...");
                for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
                pages.push("...");
                pages.push(totalPages);
            }
        }
        return pages;
    });

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
        }
    }

    // Mutations
    const adjustMutate = createMutation({
        mutationFn: async (data: any) => {
            return api.put("inventory/adjust", { json: data }).json();
        },
        onSuccess: () => {
            toast.success(t("inventory.adjustSuccess"));
            queryClient.invalidateQueries({ queryKey: ["inventory"] });
            queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
            closeModal();
        },
        onError: () => {
            toast.error(t("common.error"));
        },
    });

    function openAdjustModal(product: any) {
        selectedProduct = product;
        adjustmentType = "add";
        adjustmentQuantity = 0;
        adjustmentReason = "";
        showAdjustModal = true;
    }

    function closeModal() {
        showAdjustModal = false;
        selectedProduct = null;
        adjustmentQuantity = 0;
        adjustmentReason = "";
    }

    function handleAdjust(e: SubmitEvent) {
        e.preventDefault();

        const quantity =
            adjustmentType === "add" ? adjustmentQuantity : -adjustmentQuantity;

        // Use productId from inventory response (could be .id or .productId depending on API response)
        const prodId = selectedProduct.productId || selectedProduct.id;

        $adjustMutate.mutate({
            productId: prodId,
            quantity,
            reason: adjustmentReason,
            type: adjustmentType,
        });
    }

    // Stats query - fetches from dedicated endpoint for accurate counts
    const statsQuery = createQuery({
        queryKey: ["inventory-stats"],
        queryFn: async () => {
            const response = await api.get("inventory/stats").json<any>();
            return response.data || { total: 0, lowStock: 0, outOfStock: 0, totalValue: 0 };
        },
    });

    // Stats - use API data or fallback to page data
    let stats = $derived({
        total: $statsQuery.data?.total ?? totalItems,
        lowStock: $statsQuery.data?.lowStock ?? 0,
        outOfStock: $statsQuery.data?.outOfStock ?? 0,
        totalValue: $statsQuery.data?.totalValue ?? 0,
    });
</script>

<svelte:head>
    <title>{t("inventory.title")} - KPOS</title>
</svelte:head>

<div class="p-6">
    <!-- Header -->
    <div
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
    >
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {t("inventory.title")}
            </h1>
            <p class="text-gray-500">{t("inventory.subtitle")}</p>
        </div>
        <div class="flex items-center gap-3">
            <StoreBranchSelector on:change={() => $inventoryQuery.refetch()} />
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-900 rounded-xl p-4">
            <div class="flex items-center gap-3">
                <div
                    class="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center"
                >
                    <Package class="w-5 h-5 text-primary-600" />
                </div>
                <div>
                    <p class="text-sm text-gray-500">{t("inventory.totalProducts")}</p>
                    <p class="text-xl font-bold text-gray-900 dark:text-white">
                        {stats.total}
                    </p>
                </div>
            </div>
        </div>

        <div class="bg-white dark:bg-gray-900 rounded-xl p-4">
            <div class="flex items-center gap-3">
                <div
                    class="w-10 h-10 rounded-lg bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center"
                >
                    <AlertTriangle class="w-5 h-5 text-warning-600" />
                </div>
                <div>
                    <p class="text-sm text-gray-500">{t("inventory.lowStock")}</p>
                    <p class="text-xl font-bold text-warning-600">
                        {stats.lowStock}
                    </p>
                </div>
            </div>
        </div>

        <div class="bg-white dark:bg-gray-900 rounded-xl p-4">
            <div class="flex items-center gap-3">
                <div
                    class="w-10 h-10 rounded-lg bg-error-100 dark:bg-error-900/30 flex items-center justify-center"
                >
                    <Package class="w-5 h-5 text-error-600" />
                </div>
                <div>
                    <p class="text-sm text-gray-500">{t("inventory.outOfStock")}</p>
                    <p class="text-xl font-bold text-error-600">
                        {stats.outOfStock}
                    </p>
                </div>
            </div>
        </div>

        <div class="bg-white dark:bg-gray-900 rounded-xl p-4">
            <div class="flex items-center gap-3">
                <div
                    class="w-10 h-10 rounded-lg bg-success-100 dark:bg-success-900/30 flex items-center justify-center"
                >
                    <Package class="w-5 h-5 text-success-600" />
                </div>
                <div>
                    <p class="text-sm text-gray-500">{t("inventory.stockValue")}</p>
                    <p class="text-xl font-bold text-success-600">
                        {formatCurrency(stats.totalValue)}
                    </p>
                </div>
            </div>
        </div>
    </div>

    <!-- Filters -->
    <div
        class="bg-white dark:bg-gray-900 rounded-xl p-4 mb-6 flex flex-col sm:flex-row gap-4"
    >
        <div class="flex-1 relative">
            <Search
                class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            />
            <input
                type="text"
                placeholder={t("inventory.searchPlaceholder")}
                value={searchQuery}
                oninput={(e) => handleSearchInput(e.currentTarget.value)}
                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
        </div>

        <div class="flex gap-2">
            <button
                onclick={() => handleFilterChange("all")}
                class={cn(
                    "px-4 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    filterType === "all"
                        ? "bg-primary-500 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
                )}
            >
                {t("common.all")}
            </button>
            <button
                onclick={() => handleFilterChange("low")}
                class={cn(
                    "px-4 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    filterType === "low"
                        ? "bg-warning-500 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
                )}
            >
                {t("inventory.lowStock")}
            </button>
            <button
                onclick={() => handleFilterChange("out")}
                class={cn(
                    "px-4 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    filterType === "out"
                        ? "bg-error-500 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
                )}
            >
                {t("inventory.outOfStock")}
            </button>
        </div>
    </div>

    <!-- Inventory Table -->
    <div class="bg-white dark:bg-gray-900 rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead class="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th
                            class="text-left px-6 py-4 text-sm font-medium text-gray-500"
                            >{t("inventory.product")}</th
                        >
                        <th
                            class="text-left px-6 py-4 text-sm font-medium text-gray-500"
                            >{t("product.sku")}</th
                        >
                        <th
                            class="text-right px-6 py-4 text-sm font-medium text-gray-500"
                            >{t("inventory.remaining")}</th
                        >
                        <th
                            class="text-right px-6 py-4 text-sm font-medium text-gray-500"
                            >{t("inventory.minimum")}</th
                        >
                        <th
                            class="text-right px-6 py-4 text-sm font-medium text-gray-500"
                            >{t("common.value")}</th
                        >
                        <th
                            class="text-center px-6 py-4 text-sm font-medium text-gray-500"
                            >{t("common.status")}</th
                        >
                        <th
                            class="text-right px-6 py-4 text-sm font-medium text-gray-500"
                            >{t("common.actions")}</th
                        >
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                    {#if $inventoryQuery.isLoading}
                        {#each Array(5) as _}
                            <tr>
                                <td colspan="7" class="px-6 py-4">
                                    <div
                                        class="animate-pulse flex items-center gap-4"
                                    >
                                        <div
                                            class="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg"
                                        ></div>
                                        <div class="flex-1 space-y-2">
                                            <div
                                                class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"
                                            ></div>
                                            <div
                                                class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"
                                            ></div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    {:else if $inventoryQuery.data?.data?.length === 0}
                        <tr>
                            <td
                                colspan="7"
                                class="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
                            >
                                <Package
                                    class="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600"
                                />
                                <p>{t("inventory.noProducts")}</p>
                            </td>
                        </tr>
                    {:else}
                        {#each $inventoryQuery.data?.data || [] as product}
                            <tr
                                class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                            >
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-4">
                                        <div
                                            class="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center"
                                        >
                                            <Package
                                                class="w-6 h-6 text-gray-400"
                                            />
                                        </div>
                                        <div>
                                            <p
                                                class="font-medium text-gray-900 dark:text-white"
                                            >
                                                {product.name}
                                            </p>
                                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                                {product.category?.name || "-"}
                                            </p>
                                        </div>
                                    </div>
                                </td>
                                <td
                                    class="px-6 py-4 text-gray-500 dark:text-gray-400 font-mono text-sm"
                                    >{product.sku}</td
                                >
                                <td
                                    class="px-6 py-4 text-right font-bold text-lg text-gray-900 dark:text-white"
                                >
                                    {product.stock}
                                    <span
                                        class="text-xs font-normal text-gray-400"
                                        >{product.unit || t("product.unit.piece")}</span
                                    >
                                </td>
                                <td class="px-6 py-4 text-right text-gray-500 dark:text-gray-400"
                                    >{product.minStock || 5}</td
                                >
                                <td class="px-6 py-4 text-right font-medium text-gray-900 dark:text-white">
                                    {formatCurrency(
                                        (product.cost || product.price) *
                                            product.stock,
                                    )}
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span
                                        class={cn(
                                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                            product.stock === 0
                                                ? "bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-400"
                                                : product.stock <=
                                                    product.minStock
                                                  ? "bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400"
                                                  : "bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400",
                                        )}
                                    >
                                        {product.stock === 0
                                            ? t("inventory.statusOutOfStock")
                                            : product.stock <= product.minStock
                                              ? t("inventory.statusLowStock")
                                              : t("inventory.statusNormal")}
                                    </span>
                                </td>
                                <td class="px-6 py-4">
                                    <div
                                        class="flex items-center justify-end gap-2"
                                    >
                                        <button
                                            onclick={() =>
                                                openAdjustModal(product)}
                                            class="px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg"
                                        >
                                            {t("inventory.adjust")}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>
        </div>

        <!-- Pagination Controls -->
        {#if totalItems > 0}
            <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <!-- Page Size Selector & Info -->
                <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2">
                        <label for="page-size-select" class="text-sm text-gray-500 dark:text-gray-400">{t("common.showing")}</label>
                        <select
                            id="page-size-select"
                            value={pageSize}
                            onchange={(e) => handlePageSizeChange(Number(e.currentTarget.value))}
                            class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                            {#each pageSizeOptions as size}
                                <option value={size}>{size}</option>
                            {/each}
                        </select>
                        <span class="text-sm text-gray-500 dark:text-gray-400">{t("common.records")}</span>
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                        {t("common.showing")} {startItem} - {endItem} {t("common.of")} {totalItems} {t("common.records")}
                    </div>
                </div>

                <!-- Page Navigation -->
                <div class="flex items-center gap-1">
                    <!-- First Page -->
                    <button
                        onclick={() => goToPage(1)}
                        disabled={currentPage === 1}
                        class="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("common.first")}
                    >
                        <ChevronsLeft class="w-4 h-4" />
                    </button>

                    <!-- Previous Page -->
                    <button
                        onclick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        class="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("common.previous")}
                    >
                        <ChevronLeft class="w-4 h-4" />
                    </button>

                    <!-- Page Numbers -->
                    {#each pageNumbers as page}
                        {#if page === "..."}
                            <span class="px-2 py-1 text-gray-400 dark:text-gray-500">...</span>
                        {:else}
                            <button
                                onclick={() => goToPage(page as number)}
                                class={cn(
                                    "min-w-9 h-9 px-3 rounded-lg text-sm font-medium transition-colors",
                                    currentPage === page
                                        ? "bg-primary-500 text-white"
                                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                )}
                            >
                                {page}
                            </button>
                        {/if}
                    {/each}

                    <!-- Next Page -->
                    <button
                        onclick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        class="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("common.next")}
                    >
                        <ChevronRight class="w-4 h-4" />
                    </button>

                    <!-- Last Page -->
                    <button
                        onclick={() => goToPage(totalPages)}
                        disabled={currentPage === totalPages}
                        class="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("common.last")}
                    >
                        <ChevronsRight class="w-4 h-4" />
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

<!-- Adjust Stock Modal -->
{#if showAdjustModal && selectedProduct}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    >
        <div
            class="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-xl"
        >
            <div
                class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800"
            >
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {t("inventory.adjust")}
                </h3>
                <button
                    onclick={closeModal}
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                    <X class="w-6 h-6" />
                </button>
            </div>

            <form onsubmit={handleAdjust} class="p-4 space-y-4">
                <!-- Product Info -->
                <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p class="font-medium text-gray-900 dark:text-white">
                        {selectedProduct.name}
                    </p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {t("inventory.currentStock")}: {selectedProduct.stock}
                        {selectedProduct.unit || t("product.unit.piece")}
                    </p>
                </div>

                <!-- Adjustment Type -->
                <div class="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onclick={() => (adjustmentType = "add")}
                        class={cn(
                            "flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-colors",
                            adjustmentType === "add"
                                ? "border-success-500 bg-success-50 dark:bg-success-900/30 text-success-700 dark:text-success-400"
                                : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-success-300",
                        )}
                    >
                        <ArrowUp class="w-5 h-5" />
                        <span class="font-medium">{t("inventory.addStock")}</span>
                    </button>
                    <button
                        type="button"
                        onclick={() => (adjustmentType = "subtract")}
                        class={cn(
                            "flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-colors",
                            adjustmentType === "subtract"
                                ? "border-error-500 bg-error-50 dark:bg-error-900/30 text-error-700 dark:text-error-400"
                                : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-error-300",
                        )}
                    >
                        <ArrowDown class="w-5 h-5" />
                        <span class="font-medium">{t("inventory.reduceStock")}</span>
                    </button>
                </div>

                <!-- Quantity -->
                <div>
                    <label
                        for="adjustment-quantity"
                        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >{t("inventory.quantity")} *</label
                    >
                    <input
                        id="adjustment-quantity"
                        type="number"
                        bind:value={adjustmentQuantity}
                        required
                        min="1"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                </div>

                <!-- Reason -->
                <div>
                    <label
                        for="adjustment-reason"
                        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >{t("inventory.reason")}</label
                    >
                    <select
                        id="adjustment-reason"
                        bind:value={adjustmentReason}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="">-- {t("inventory.selectReason")} --</option>
                        {#if adjustmentType === "add"}
                            <option value="purchase">{t("inventory.reason.purchase")}</option>
                            <option value="return">{t("inventory.reason.return")}</option>
                            <option value="correction">{t("inventory.reason.correction")}</option>
                        {:else}
                            <option value="damaged">{t("inventory.reason.damaged")}</option>
                            <option value="expired">{t("inventory.reason.expired")}</option>
                            <option value="lost">{t("inventory.reason.lost")}</option>
                            <option value="correction">{t("inventory.reason.correction")}</option>
                        {/if}
                    </select>
                </div>

                <!-- Preview -->
                <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("inventory.stockAfterAdjust")}</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                        {adjustmentType === "add"
                            ? selectedProduct.stock + adjustmentQuantity
                            : Math.max(
                                  0,
                                  selectedProduct.stock - adjustmentQuantity,
                              )}
                        <span class="text-sm font-normal text-gray-400"
                            >{selectedProduct.unit || t("product.unit.piece")}</span
                        >
                    </p>
                </div>

                <div class="flex gap-3 pt-4">
                    <button
                        type="button"
                        onclick={closeModal}
                        class="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="submit"
                        disabled={$adjustMutate.isPending ||
                            adjustmentQuantity <= 0}
                        class={cn(
                            "flex-1 py-2.5 rounded-xl font-medium text-white disabled:opacity-50",
                            adjustmentType === "add"
                                ? "bg-success-500 hover:bg-success-600"
                                : "bg-error-500 hover:bg-error-600",
                        )}
                    >
                        {adjustmentType === "add" ? t("inventory.addStock") : t("inventory.reduceStock")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
