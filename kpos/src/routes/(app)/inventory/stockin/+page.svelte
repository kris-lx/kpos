<script lang="ts">
    import { onMount } from "svelte";
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatCurrency, formatDate, formatDateTime } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import { Plus, Search, Package, X, ChevronLeft, ChevronRight, Loader2, Trash2, AlertCircle, ChevronsLeft, ChevronsRight, Pencil, Download } from "lucide-svelte";
    import MoneyInput from "$lib/components/MoneyInput.svelte";

    const t = i18n.t;

    // State
    let stockIns = $state<any[]>([]);
    let products = $state<any[]>([]);
    let vendors = $state<any[]>([]);
    let loading = $state(false);
    let showModal = $state(false);
    let searchQuery = $state("");
    let isSaving = $state(false);
    let errorMessage = $state("");
    let editingId = $state<string | null>(null);

    // Server-side pagination
    let currentPage = $state(1);
    let pageSize = $state(10);
    let totalItems = $state(0);
    let totalPages = $derived(Math.ceil(totalItems / pageSize));
    let pageSizeOptions = [10, 25, 50];

    // Form state
    let formData = $state({
        productId: "",
        quantity: 1,
        unitCost: 0,
        supplier: "",
        reference: "",
        notes: "",
        date: new Date().toISOString().split("T")[0],
        expiryDate: "",
        batchNumber: "",
    });

    // Load data with server-side pagination
    async function loadData() {
        loading = true;
        errorMessage = "";
        try {
            const activeBranchId = auth.activeBranchId;
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: pageSize.toString(),
                ...(searchQuery && { search: searchQuery }),
                ...(activeBranchId && { branchId: activeBranchId }),
            });

            const [stockRes, prodRes, vendorRes, invRes] = await Promise.all([
                api.get(`inventory/stock-in?${params}`).json<any>(),
                api.get(`products?limit=1000${activeBranchId ? `&branchId=${activeBranchId}` : ''}`).json<any>(),
                api.get(`inventory/vendors?limit=1000${activeBranchId ? `&branchId=${activeBranchId}` : ''}`).json<any>(),
                api.get(`inventory?limit=1000${activeBranchId ? `&branchId=${activeBranchId}` : ''}`).json<any>(),
            ]);
            
            stockIns = stockRes.data || [];
            totalItems = stockRes.meta?.total || stockRes.total || stockIns.length;
            
            // Map products with their current stock
            const inventoryMap = new Map((invRes.data || []).map((inv: any) => [inv.id, inv.stock]));
            products = (prodRes.data || []).map((p: any) => ({
                ...p,
                currentStock: inventoryMap.get(p.id) ?? p.stock ?? 0
            }));
            
            vendors = vendorRes.data || [];
        } catch (e) {
            console.error("Failed to load data:", e);
            errorMessage = t("common.loadError") || "Failed to load data. Please try again.";
            stockIns = [];
            products = [];
            totalItems = 0;
            toast.error(t("common.loadError") || "Failed to load data");
        } finally {
            loading = false;
        }
    }

    // Handle page change
    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
        }
    }

    // Handle page size change
    function handlePageSizeChange() {
        currentPage = 1;
        loadData();
    }

    // Handle search
    function handleSearch() {
        currentPage = 1;
        loadData();
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
            
            if (start > 1) pages.unshift(-1); // -1 represents ellipsis
            if (end < totalPages) pages.push(-2); // -2 represents ellipsis
        }
        
        return pages;
    });

    // Handle submit (create or update)
    async function handleSubmit() {
        isSaving = true;
        try {
            if (editingId) {
                // Update existing
                await api.put(`inventory/stock-in/${editingId}`, { json: formData }).json();
                toast.success(t("common.updated") || "ອັບເດດສຳເລັດ");
            } else {
                // Create new
                await api.post("inventory/stock-in", { json: formData }).json();
                toast.success(t("inventory.stockInCreated"));
            }
            showModal = false;
            resetForm();
            loadData();
        } catch (e) {
            console.error("Failed to save stock in:", e);
            toast.error(t("common.error"));
        } finally {
            isSaving = false;
        }
    }

    // Open edit modal
    function openEdit(item: any) {
        editingId = item.id;
        formData = {
            productId: item.productId || "",
            quantity: Math.abs(item.quantity) || 1,
            unitCost: item.unitCost || 0,
            supplier: item.supplier || item.reason || "",
            reference: item.reference || "",
            notes: item.notes || "",
            date: item.createdAt ? new Date(item.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().split("T")[0] : "",
            batchNumber: item.batchNumber || "",
        };
        showModal = true;
    }

    // Open add modal
    function openAdd() {
        resetForm();
        showModal = true;
    }

    async function deleteStockIn(id: string) {
        if (!confirm(t("common.confirmDelete"))) return;
        try {
            await api.delete(`inventory/stock-in/${id}`).json();
            toast.success(t("common.deleted"));
            loadData();
        } catch (e) {
            toast.error(t("common.error"));
        }
    }

    function resetForm() {
        editingId = null;
        formData = {
            productId: "",
            quantity: 1,
            unitCost: 0,
            supplier: "",
            reference: "",
            notes: "",
            date: new Date().toISOString().split("T")[0],
            expiryDate: "",
            batchNumber: "",
        };
    }

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
            const res = await api.get(`inventory/stock-in?limit=10000${activeBranchId ? `&branchId=${activeBranchId}` : ''}`).json<any>();
            const rows: any[] = res.data || [];
            let csv = '﻿';
            csv += 'ວັນທີ,ຊື່ສິນຄ້າ,ຈຳນວນ,ລາຄາທຶນ,ຜູ້ສະໜອງ,ເລກອ້າງອີງ,ຫມາຍເລກ Batch\n';
            for (const item of rows) {
                const productName = products.find((p: any) => p.id === item.productId)?.name || item.productId;
                const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString('lo-LA') : '';
                csv += `"${date}","${productName}","${item.quantity || 0}","${item.unitCost || 0}","${item.supplier || ''}","${item.reference || ''}","${item.batchNumber || ''}"\n`;
            }
            downloadFile(csv, `stockin-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
            toast.success('ສົ່ງອອກ CSV ສຳເລັດ');
        } catch {
            toast.error('ສົ່ງອອກລົ້ມເຫລວ');
        }
    }

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });
</script>

<div class="space-y-6 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {t("inventory.stockIn")}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">{t("inventory.stockInDesc")}</p>
        </div>
        <div class="flex items-center gap-2">
            <button
                onclick={exportToCsv}
                class="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium"
            >
                <Download class="h-4 w-4" />
                ສົ່ງອອກ
            </button>
            <button
                onclick={openAdd}
                class="flex items-center gap-2 rounded-lg bg-success-600 px-4 py-2 text-white hover:bg-success-700"
            >
                <Plus class="h-5 w-5" />
                {t("inventory.addStockIn")}
            </button>
        </div>
    </div>

    <!-- Search & Filter -->
    <div class="flex gap-4">
        <div class="relative flex-1">
            <Search class="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            <input
                type="text"
                bind:value={searchQuery}
                onkeydown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="{t('common.search')}..."
                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-10 pr-4 text-gray-900 dark:text-white focus:border-success-500 focus:ring-1 focus:ring-success-500"
            />
        </div>
        <button
            onclick={handleSearch}
            class="rounded-lg bg-gray-100 dark:bg-gray-700 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
            {t("common.search")}
        </button>
    </div>

    <!-- Error Message -->
    {#if errorMessage}
        <div class="flex items-center gap-3 rounded-lg border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900/20 p-4 text-danger-700 dark:text-danger-400">
            <AlertCircle class="h-5 w-5 flex-shrink-0" />
            <p>{errorMessage}</p>
            <button
                onclick={loadData}
                class="ml-auto rounded-lg bg-danger-100 dark:bg-danger-800/30 px-3 py-1 text-sm hover:bg-danger-200 dark:hover:bg-danger-800/50"
            >
                {t("common.retry")}
            </button>
        </div>
    {/if}

    <!-- Table -->
    <div class="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("common.date")}</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("products.product")}</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("inventory.quantity")}</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("inventory.unitCost")}</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("inventory.totalCost")}</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("inventory.supplier")}</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("inventory.reference")}</th>
                    <th class="px-6 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("common.actions")}</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                {#if loading}
                    <tr>
                        <td colspan="8" class="px-6 py-12 text-center">
                            <Loader2 class="h-8 w-8 animate-spin text-success-600 mx-auto" />
                        </td>
                    </tr>
                {:else if stockIns.length === 0}
                    <tr>
                        <td colspan="8" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                            <Package class="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                            {t("common.noData")}
                        </td>
                    </tr>
                {:else}
                    {#each stockIns as item (item.id)}
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{formatDate(item.createdAt || item.date)}</td>
                            <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">{item.product?.name || "-"}</td>
                            <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-700">
                                    +{item.quantity}
                                </span>
                            </td>
                            <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{formatCurrency(item.unitCost)}</td>
                            <td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(item.quantity * item.unitCost)}</td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{item.supplier || "-"}</td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{item.reference || "-"}</td>
                            <td class="px-6 py-4 text-center">
                                <div class="flex items-center justify-center gap-1">
                                    <button
                                        onclick={() => openEdit(item)}
                                        class="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                                        title="{t('common.edit')}"
                                    >
                                        <Pencil class="w-4 h-4" />
                                    </button>
                                    <button
                                        onclick={() => deleteStockIn(item.id)}
                                        class="p-2 text-gray-400 hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-lg"
                                        title="{t('common.delete')}"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    {/each}
                {/if}
            </tbody>
        </table>

        <!-- Pagination -->
        <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-500 dark:text-gray-400">{t("common.rowsPerPage")}:</span>
                <select
                    bind:value={pageSize}
                    onchange={handlePageSizeChange}
                    class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-1 px-2 text-gray-900 dark:text-white"
                >
                    {#each pageSizeOptions as size (size)}
                        <option value={size}>{size}</option>
                    {/each}
                </select>
            </div>
            
            <div class="flex items-center gap-4">
                <span class="text-sm text-gray-500 dark:text-gray-400">
                    {#if totalItems > 0}
                        {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalItems)} {t("common.of")} {totalItems}
                    {:else}
                        0 {t("common.of")} 0
                    {/if}
                </span>
                
                <div class="flex items-center gap-1">
                    <!-- First page -->
                    <button
                        onclick={() => goToPage(1)}
                        disabled={currentPage === 1 || totalPages === 0}
                        class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("common.firstPage")}
                    >
                        <ChevronsLeft class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    
                    <!-- Previous page -->
                    <button
                        onclick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1 || totalPages === 0}
                        class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("common.previousPage")}
                    >
                        <ChevronLeft class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    
                    <!-- Page numbers -->
                    <div class="flex items-center gap-1">
                        {#each visiblePages as page, idx (idx)}
                            {#if page < 0}
                                <span class="px-2 text-gray-400 dark:text-gray-500">...</span>
                            {:else}
                                <button
                                    onclick={() => goToPage(page)}
                                    class="min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors
                                        {currentPage === page 
                                            ? 'bg-success-600 text-white' 
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                                >
                                    {page}
                                </button>
                            {/if}
                        {/each}
                    </div>
                    
                    <!-- Next page -->
                    <button
                        onclick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages || totalPages === 0}
                        class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("common.nextPage")}
                    >
                        <ChevronRight class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    
                    <!-- Last page -->
                    <button
                        onclick={() => goToPage(totalPages)}
                        disabled={currentPage === totalPages || totalPages === 0}
                        class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("common.lastPage")}
                    >
                        <ChevronsRight class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Modal -->
{#if showModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onclick={() => showModal = false}
    >
        <div 
            class="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl"
            onclick={(e) => e.stopPropagation()}
        >
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {editingId ? t("common.edit") : t("inventory.addStockIn")}
                </h2>
                <button onclick={() => showModal = false} class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                    <X class="w-5 h-5 text-gray-500" />
                </button>
            </div>
            <form
                onsubmit={(e) => {
                    e.preventDefault();
                    handleSubmit();
                }}
                class="space-y-4"
            >
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("products.product")}</label>
                    <select
                        bind:value={formData.productId}
                        required
                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                    >
                        <option value="">{t("common.select")}</option>
                        {#each products as p (p.id)}
                            <option value={p.id}>{p.name} ({t("inventory.stock")}: {p.currentStock ?? p.stock ?? 0})</option>
                        {/each}
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("inventory.quantity")}</label>
                        <input
                            type="number"
                            bind:value={formData.quantity}
                            min="1"
                            required
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("inventory.unitCost")}</label>
                        <MoneyInput
                            bind:value={formData.unitCost}
                            min={0}
                            required
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("inventory.supplier")}</label>
                    <select
                        bind:value={formData.supplier}
                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                    >
                        <option value="">{t("common.select")}</option>
                        {#each vendors as v (v.id)}
                            <option value={v.name}>{v.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("inventory.reference")}</label>
                        <input
                            type="text"
                            bind:value={formData.reference}
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("common.date")}</label>
                        <input
                            type="date"
                            bind:value={formData.date}
                            required
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("inventory.expiryDate")}</label>
                        <input
                            type="date"
                            bind:value={formData.expiryDate}
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("inventory.batchNo")}</label>
                        <input
                            type="text"
                            bind:value={formData.batchNumber}
                            placeholder="LOT-001"
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("common.notes")}</label>
                    <textarea
                        bind:value={formData.notes}
                        rows="2"
                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                    ></textarea>
                </div>
                <div class="flex justify-end gap-3 pt-4">
                    <button
                        type="button"
                        onclick={() => (showModal = false)}
                        class="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving}
                        class="flex items-center gap-2 rounded-lg bg-success-600 px-4 py-2 text-white hover:bg-success-700 disabled:opacity-50"
                    >
                        {#if isSaving}
                            <Loader2 class="w-4 h-4 animate-spin" />
                        {/if}
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
