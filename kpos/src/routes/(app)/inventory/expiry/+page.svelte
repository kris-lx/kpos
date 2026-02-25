<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { formatDate } from "$lib/utils";
    import {
        Clock,
        Search,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Package,
        Calendar,
        AlertTriangle,
        AlertCircle,
        CheckCircle,
        Download,
        Filter,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let daysFilter = $state<number | null>(null);
    let isLoading = $state(true);
    let currentPage = $state(1);
    let itemsPerPage = $state(20);
    let totalItems = $state(0);
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Data
    let expiringProducts = $state<any[]>([]);

    // Stats
    let stats = $derived({
        total: totalItems,
        expired: expiringProducts.filter((p) => getDaysUntilExpiry(p.expiryDate) < 0).length,
        critical: expiringProducts.filter((p) => { const d = getDaysUntilExpiry(p.expiryDate); return d >= 0 && d <= 7; }).length,
        warning: expiringProducts.filter((p) => { const d = getDaysUntilExpiry(p.expiryDate); return d > 7 && d <= 30; }).length,
        ok: expiringProducts.filter((p) => getDaysUntilExpiry(p.expiryDate) > 30).length,
    });

    function getDaysUntilExpiry(date: string) {
        const expiry = new Date(date);
        const today = new Date();
        return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    function getExpiryConfig(days: number) {
        if (days < 0) return { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", label: "ໝົດອາຍຸແລ້ວ", icon: AlertCircle };
        if (days <= 7) return { bg: "bg-red-100 dark:bg-red-900/50", text: "text-red-700 dark:text-red-400", label: `${days} ມື້`, icon: AlertTriangle };
        if (days <= 30) return { bg: "bg-amber-100 dark:bg-amber-900/50", text: "text-amber-700 dark:text-amber-400", label: `${days} ມື້`, icon: Clock };
        return { bg: "bg-green-100 dark:bg-green-900/50", text: "text-green-700 dark:text-green-400", label: `${days} ມື້`, icon: CheckCircle };
    }

    async function loadData() {
        isLoading = true;
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
            });
            if (searchQuery.trim()) {
                params.append("search", searchQuery.trim());
            }
            if (daysFilter !== null) {
                params.append("daysFilter", daysFilter.toString());
            }
            const res = await api.get(`inventory/expiring?${params}`).json<any>();
            expiringProducts = res.data || [];
            totalItems = res.meta?.total || 0;
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            isLoading = false;
        }
    }

    function handleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadData();
        }, 300);
    }

    function handleFilterChange() {
        currentPage = 1;
        loadData();
    }

    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
        }
    }

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });
</script>

<svelte:head>
    <title>ສິນຄ້າໃກ້ໝົດອາຍຸ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl shadow-lg">
                    <Clock class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ສິນຄ້າໃກ້ໝົດອາຍຸ</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ຕິດຕາມອາຍຸສິນຄ້າ</p>
                </div>
            </div>
        </div>

        <button class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium">
            <Download class="w-4 h-4" />
            ສົ່ງອອກ
        </button>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Package class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ທັງໝົດ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <AlertCircle class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <span class="text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.expired}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ໝົດອາຍຸແລ້ວ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                    <AlertTriangle class="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <span class="text-2xl font-bold text-red-600 dark:text-red-400">{stats.critical}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">≤ 7 ມື້</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Clock class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.warning}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">8-30 ມື້</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.ok}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">&gt; 30 ມື້</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="text" bind:value={searchQuery} oninput={handleSearch} placeholder="ຄົ້ນຫາສິນຄ້າ..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500" />
            </div>
            <div class="flex gap-2 flex-wrap">
                {#each [{ id: null, label: "ທັງໝົດ" }, { id: 0, label: "ໝົດອາຍຸ" }, { id: 7, label: "≤ 7 ມື້" }, { id: 30, label: "8-30 ມື້" }, { id: 31, label: "> 30 ມື້" }] as filter (filter.id)}
                    <button
                        onclick={() => { daysFilter = filter.id; handleFilterChange(); }}
                        class={cn("px-3 py-2 rounded-lg text-sm font-medium transition-all", daysFilter === filter.id ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
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
            <Loader2 class="w-10 h-10 text-red-500 animate-spin" />
        </div>
    {:else if expiringProducts.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <CheckCircle class="w-16 h-16 mx-auto text-green-500" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີສິນຄ້າໃກ້ໝົດອາຍຸ</h3>
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ສິນຄ້າ</th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">SKU</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ວັນໝົດອາຍຸ</th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຈຳນວນ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ສະຖານະ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each expiringProducts as product (product.id)}
                            {@const days = getDaysUntilExpiry(product.expiryDate)}
                            {@const config = getExpiryConfig(days)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-2">
                                        <Package class="w-4 h-4 text-gray-400" />
                                        <span class="font-medium text-gray-900 dark:text-white">{product.productName}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-gray-500 dark:text-gray-400">{product.sku || "-"}</td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
                                        <Calendar class="w-4 h-4" />
                                        <span>{formatDate(product.expiryDate)}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-bold text-gray-900 dark:text-white">{product.quantity}</span>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex justify-center">
                                        <span class={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", config.bg, config.text)}>
                                            <svelte:component this={config.icon} class="w-3.5 h-3.5" />
                                            {config.label}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}

    <!-- Pagination -->
    {#if totalPages >= 1}
        <div class="flex items-center justify-between mt-6 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-600 dark:text-gray-400">ສະແດງ</span>
                <select
                    bind:value={itemsPerPage}
                    onchange={() => { currentPage = 1; loadData(); }}
                    class="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                >
                    {#each [10, 20, 50, 100] as size (size)}
                        <option value={size}>{size}</option>
                    {/each}
                </select>
                <span class="text-sm text-gray-600 dark:text-gray-400">ລາຍການ</span>
            </div>
            <div class="flex items-center gap-2">
                <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50">
                    <ChevronLeft class="w-5 h-5" />
                </button>
                <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{currentPage} / {totalPages} (ທັງໝົດ {totalItems})</span>
                <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50">
                    <ChevronRight class="w-5 h-5" />
                </button>
            </div>
        </div>
    {/if}
</div>
