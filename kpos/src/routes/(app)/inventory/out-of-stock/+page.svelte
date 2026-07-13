<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn, escapeCsvCell } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { formatDate } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import {
        PackageX,
        Search,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Package,
        AlertTriangle,
        Download,
        RefreshCw,
        ChevronsLeft,
        ChevronsRight,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let isLoading = $state(true);
    let currentPage = $state(1);
    let itemsPerPage = $state(20);
    let totalItems = $state(0);
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Data
    let outOfStockProducts = $state<any[]>([]);

    // Stats
    let stats = $derived({
        total: totalItems,
        critical: outOfStockProducts.filter((p) => p.quantity < 0).length,
        zero: outOfStockProducts.filter((p) => p.quantity === 0).length,
    });

    async function loadData() {
        isLoading = true;
        try {
            const activeBranchId = auth.activeBranchId;
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
                ...(activeBranchId && { branchId: activeBranchId }),
            });
            if (searchQuery.trim()) {
                params.append("search", searchQuery.trim());
            }
            const res = await api.get(`inventory/out-of-stock?${params}`).json<any>();
            outOfStockProducts = res.data || [];
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

    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
        }
    }

    // Generate visible page numbers
    let visiblePages = $derived.by(() => {
        const pages: number[] = [];
        const maxVisible = 5;
        
        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            const start = Math.max(1, currentPage - 2);
            const end = Math.min(totalPages, start + maxVisible - 1);
            
            for (let i = start; i <= end; i++) pages.push(i);
            
            if (start > 1) pages.unshift(-1);
            if (end < totalPages) pages.push(-2);
        }
        
        return pages;
    });

    function downloadFile(content: string, filename: string, type: string) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function exportToCsv() {
        try {
            const activeBranchId = auth.activeBranchId;
            const res = await api.get(`inventory/out-of-stock?limit=10000${activeBranchId ? `&branchId=${activeBranchId}` : ''}`).json<any>();
            const rows: any[] = res.data || [];
            let csv = '﻿';
            csv += 'ຊື່ສິນຄ້າ,SKU,ສາຂາ,ສະຕ໋ອກ,ສະຕ໋ອກຕ່ຳສຸດ,ໝວດໝູ່\n';
            for (const item of rows) {
                csv += `${escapeCsvCell(item.product?.name || item.name || '')},${escapeCsvCell(item.product?.sku || item.sku || '')},${escapeCsvCell(item.branch?.name || '')},"${item.quantity ?? 0}","${item.minStock || item.product?.minStock || 0}",${escapeCsvCell(item.category?.name || '')}\n`;
            }
            downloadFile(csv, `out-of-stock-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
            toast.success(t('common.exportSuccess'));
        } catch {
            toast.error(t('common.exportFailed'));
        }
    }

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });
</script>

<svelte:head>
    <title>ສິນຄ້າໝົດສະຕ໋ອກ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-danger-500 to-danger-700 rounded-xl shadow-lg">
                    <PackageX class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ສິນຄ້າໝົດສະຕ໋ອກ</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ສິນຄ້າທີ່ໝົດ ຫຼື ຕິດລົບໃນສະຕ໋ອກ</p>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <button 
                onclick={loadData}
                class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
            >
                <RefreshCw class="w-4 h-4" />
                ໂຫລດໃໝ່
            </button>
            <button onclick={exportToCsv} class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
                <Download class="w-4 h-4" />
                ສົ່ງອອກ
            </button>
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-danger-100 dark:bg-danger-900/30 rounded-lg">
                    <PackageX class="w-5 h-5 text-danger-600 dark:text-danger-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ທັງໝົດ</p>
                    <p class="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Package class="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ສິນຄ້າເປັນ 0</p>
                    <p class="text-xl font-bold text-gray-900 dark:text-white">{stats.zero}</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-danger-100 dark:bg-danger-900/30 rounded-lg">
                    <AlertTriangle class="w-5 h-5 text-danger-600 dark:text-danger-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ສິນຄ້າຕິດລົບ</p>
                    <p class="text-xl font-bold text-gray-900 dark:text-white">{stats.critical}</p>
                </div>
            </div>
        </div>
    </div>

    <!-- Search -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 mb-6">
        <div class="flex flex-col md:flex-row gap-4">
            <div class="flex-1 relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    oninput={handleSearch}
                    placeholder="ຄົ້ນຫາສິນຄ້າ..."
                    class="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-danger-500"
                />
            </div>
        </div>
    </div>

    <!-- Table -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {#if isLoading}
            <div class="flex items-center justify-center py-20">
                <Loader2 class="w-8 h-8 animate-spin text-danger-600" />
            </div>
        {:else if outOfStockProducts.length === 0}
            <div class="text-center py-20">
                <Package class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                <p class="text-gray-500 dark:text-gray-400">ບໍ່ມີສິນຄ້າໝົດສະຕ໋ອກ</p>
            </div>
        {:else}
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ສິນຄ້າ</th>
                            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">SKU</th>
                            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ສາຂາ</th>
                            <th class="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ຈຳນວນ</th>
                            <th class="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ສະຖານະ</th>
                            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ອັບເດດລ່າສຸດ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                        {#each outOfStockProducts as item (item.id)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-3">
                                        {#if item.image}
                                            <img src={item.image} alt={item.productName} class="w-10 h-10 rounded-lg object-cover" />
                                        {:else}
                                            <div class="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                                                <Package class="w-5 h-5 text-gray-400" />
                                            </div>
                                        {/if}
                                        <div>
                                            <p class="font-medium text-gray-900 dark:text-white">{item.productName}</p>
                                            {#if item.barcode}
                                                <p class="text-xs text-gray-500 dark:text-gray-400">{item.barcode}</p>
                                            {/if}
                                        </div>
                                    </div>
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.sku || "-"}</td>
                                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.branchName || "-"}</td>
                                <td class="px-4 py-3 text-center">
                                    <span class={cn(
                                        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold",
                                        item.quantity < 0 
                                            ? "bg-danger-100 dark:bg-danger-900/50 text-danger-700 dark:text-danger-400"
                                            : "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400"
                                    )}>
                                        {item.quantity}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-center">
                                    {#if item.quantity < 0}
                                        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-400">
                                            <AlertTriangle class="w-3 h-3" />
                                            ຕິດລົບ
                                        </span>
                                    {:else}
                                        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                                            <PackageX class="w-3 h-3" />
                                            ໝົດ
                                        </span>
                                    {/if}
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                    {formatDate(item.updatedAt)}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <!-- Pagination -->
            <div class="p-4 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-500 dark:text-gray-400">ຈຳນວນຕໍ່ໜ້າ:</span>
                    <select
                        bind:value={itemsPerPage}
                        onchange={() => { currentPage = 1; loadData(); }}
                        class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-1 px-2 text-gray-900 dark:text-white"
                    >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </div>
                
                <div class="flex items-center gap-4">
                    <span class="text-sm text-gray-500 dark:text-gray-400">
                        {#if totalItems > 0}
                            {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} ຈາກ {totalItems}
                        {:else}
                            0 ຈາກ 0
                        {/if}
                    </span>
                    
                    <div class="flex items-center gap-1">
                        <button
                            onclick={() => goToPage(1)}
                            disabled={currentPage === 1 || totalPages === 0}
                            class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronsLeft class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                        
                        <button
                            onclick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1 || totalPages === 0}
                            class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                        
                        <div class="flex items-center gap-1">
                            {#each visiblePages as page, idx (idx)}
                                {#if page < 0}
                                    <span class="px-2 text-gray-400 dark:text-gray-500">...</span>
                                {:else}
                                    <button
                                        onclick={() => goToPage(page)}
                                        class={cn(
                                            "min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors",
                                            currentPage === page 
                                                ? "bg-danger-600 text-white" 
                                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        )}
                                    >
                                        {page}
                                    </button>
                                {/if}
                            {/each}
                        </div>
                        
                        <button
                            onclick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages || totalPages === 0}
                            class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                        
                        <button
                            onclick={() => goToPage(totalPages)}
                            disabled={currentPage === totalPages || totalPages === 0}
                            class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronsRight class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>
