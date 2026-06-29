<script lang="ts">
    import { onMount } from "svelte";
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatCurrency, formatDate } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import { Minus, Search, Package, X, ChevronLeft, ChevronRight, Loader2, Trash2, AlertCircle, Pencil, Download } from "lucide-svelte";

    const t = i18n.t;

    // Rule-based CRUD gating
    const hasWriteAccess = $derived(auth.hasStoreAccess('write') || !auth.activeStoreId);
    const canCreateStockOut = $derived(auth.canCreate('inventory') && hasWriteAccess);
    const canUpdateStockOut = $derived(auth.canUpdate('inventory') && hasWriteAccess);
    const canDeleteStockOut = $derived(auth.canDelete('inventory') && hasWriteAccess);

    let stockOuts = $state<any[]>([]);
    let products = $state<any[]>([]);
    let loading = $state(false);
    let showModal = $state(false);
    let searchQuery = $state("");
    let isSaving = $state(false);
    let loadError = $state<string | null>(null);
    let editingId = $state<string | null>(null);

    // Server-side pagination
    let currentPage = $state(1);
    let pageSize = $state(10);
    let totalItems = $state(0);
    let totalPages = $state(0);
    let pageSizeOptions = [5, 10, 20, 50, 70, 100];

    let formData = $state({
        productId: "",
        quantity: 1,
        reason: "damaged",
        reference: "",
        notes: "",
        date: new Date().toISOString().split("T")[0],
    });

    let reasons = $state<{value: string; label: string; labelLao?: string; labelKey?: string}[]>([
        { value: "damaged", label: "Damaged", labelKey: "inventory.reason.damaged" },
        { value: "expired", label: "Expired", labelKey: "inventory.reason.expired" },
        { value: "lost", label: "Lost/Missing", labelKey: "inventory.reason.lost" },
        { value: "returned", label: "Returned to Vendor", labelKey: "inventory.reason.returned" },
        { value: "transfer", label: "Transfer", labelKey: "inventory.reason.transfer" },
        { value: "other", label: "Other", labelKey: "common.other" },
    ]);

    async function loadEnums() {
        try {
            const res = await api.get("settings/enums?type=stockout_reason").json<any>();
            if (res.data?.stockout_reason) reasons = res.data.stockout_reason;
        } catch { /* keep defaults */ }
    }

    async function loadData() {
        loading = true;
        loadError = null;
        try {
            const activeBranchId = auth.activeBranchId;
            const searchParams = new URLSearchParams({
                page: currentPage.toString(),
                limit: pageSize.toString(),
                ...(searchQuery && { search: searchQuery }),
                ...(activeBranchId && { branchId: activeBranchId }),
            });

            const [stockRes, prodRes, invRes] = await Promise.all([
                api.get(`inventory/stock-out?${searchParams}`).json<any>(),
                api.get("products?all=true").json<any>(),
                api.get("inventory?all=true").json<any>(),
            ]);
            stockOuts = stockRes.data || [];
            totalItems = stockRes.meta?.total || stockRes.total || stockOuts.length;
            totalPages = stockRes.meta?.totalPages || stockRes.totalPages || Math.ceil(totalItems / pageSize);
            
            // Map products with their current stock
            const inventoryMap = new Map((invRes.data || []).map((inv: any) => [inv.id, inv.stock]));
            products = (prodRes.data || []).map((p: any) => ({
                ...p,
                currentStock: inventoryMap.get(p.id) ?? p.stock ?? 0
            }));
        } catch (e) {
            console.error("Failed to load data:", e);
            loadError = t("common.loadError");
            toast.error(loadError);
            stockOuts = [];
            products = [];
            totalItems = 0;
            totalPages = 0;
        } finally {
            loading = false;
        }
    }

    async function handleSubmit() {
        isSaving = true;
        try {
            if (editingId) {
                await api.put(`inventory/stock-out/${editingId}`, { json: formData }).json();
                toast.success(t("common.updated"));
            } else {
                await api.post("inventory/stock-out", { json: formData }).json();
                toast.success(t("inventory.stockOutCreated"));
            }
            showModal = false;
            resetForm();
            loadData();
        } catch (e) {
            console.error("Failed to save stock out:", e);
            toast.error(t("common.error"));
        } finally {
            isSaving = false;
        }
    }

    function openEdit(item: any) {
        editingId = item.id;
        formData = {
            productId: item.productId || "",
            quantity: Math.abs(item.quantity) || 1,
            reason: item.reason || "damaged",
            reference: item.reference || "",
            notes: item.notes || "",
            date: item.createdAt ? new Date(item.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        };
        showModal = true;
    }

    function openAdd() {
        resetForm();
        showModal = true;
    }

    async function deleteStockOut(id: string) {
        if (!confirm(t("common.confirmDelete"))) return;
        try {
            await api.delete(`inventory/stock-out/${id}`).json();
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
            reason: "damaged",
            reference: "",
            notes: "",
            date: new Date().toISOString().split("T")[0],
        };
    }

    function handlePageChange(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
        }
    }

    function handlePageSizeChange() {
        currentPage = 1;
        loadData();
    }

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
            const res = await api.get(`inventory/stock-out?all=true${activeBranchId ? `&branchId=${activeBranchId}` : ''}`).json<any>();
            const rows: any[] = res.data || [];
            let csv = '﻿';
            csv += `${t("inventory.csvHeaderDate")},${t("inventory.csvHeaderProductName")},${t("inventory.csvHeaderQuantity")},${t("inventory.reason")},${t("inventory.csvHeaderReference")},${t("common.notes")}\n`;
            for (const item of rows) {
                const productName = products.find((p: any) => p.id === item.productId)?.name || item.productId;
                const reason = reasons.find((r: any) => r.value === item.reason);
                const reasonLabel = reason?.labelKey ? t(reason.labelKey) : (reason?.label || item.reason || '');
                const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString('lo-LA') : '';
                csv += `"${date}","${productName}","${Math.abs(item.quantity || 0)}","${reasonLabel}","${item.reference || ''}","${item.notes || ''}"\n`;
            }
            downloadFile(csv, `stockout-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
            toast.success(t("reports.exportSuccess"));
        } catch {
            toast.error(t("reports.exportFailed"));
        }
    }

    $effect(() => {
        auth.activeStoreId;
        loadEnums();
        loadData();
    });
</script>

<div class="space-y-6 p-6">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {t("inventory.stockOut")}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">{t("inventory.stockOutDesc")}</p>
        </div>
        <div class="flex items-center gap-2">
            <button
                onclick={exportToCsv}
                class="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium"
            >
                <Download class="h-4 w-4" />
                {t("common.export")}
            </button>
            {#if canCreateStockOut}
            <button
                onclick={openAdd}
                class="flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-white hover:bg-danger-700"
            >
                <Minus class="h-5 w-5" />
                {t("inventory.addStockOut")}
            </button>
            {/if}
        </div>
    </div>

    <div class="relative">
        <Search class="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
        <input
            type="text"
            bind:value={searchQuery}
            onkeydown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="{t('common.search')}..."
            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-10 pr-4 text-gray-900 dark:text-white focus:border-danger-500 focus:ring-1 focus:ring-danger-500"
        />
    </div>

    {#if loadError}
        <div class="flex flex-col items-center justify-center py-12 px-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <AlertCircle class="w-12 h-12 text-danger-500 mb-4" />
            <p class="text-gray-600 dark:text-gray-400 text-center mb-4">{loadError}</p>
            <button
                onclick={() => loadData()}
                class="px-4 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700"
            >
                {t("common.retry")}
            </button>
        </div>
    {:else}
        <div class="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("common.date")}</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("products.product")}</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("inventory.quantity")}</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("inventory.reason")}</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("inventory.reference")}</th>
                    <th class="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("common.notes")}</th>
                    <th class="px-6 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t("common.actions")}</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                {#if loading}
                    <tr>
                        <td colspan="7" class="px-6 py-12 text-center">
                            <Loader2 class="h-8 w-8 animate-spin text-danger-600 mx-auto" />
                        </td>
                    </tr>
                {:else if stockOuts.length === 0}
                    <tr>
                        <td colspan="7" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                            <Package class="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            {t("common.noData")}
                        </td>
                    </tr>
                {:else}
                    {#each stockOuts as item (item.id)}
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{formatDate(item.createdAt || item.date)}</td>
                            <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">{item.product?.name || "-"}</td>
                            <td class="whitespace-nowrap px-6 py-4 text-sm font-medium">
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-danger-100 text-danger-700">
                                    -{item.quantity}
                                </span>
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                <span class="rounded-full bg-gray-100 dark:bg-gray-600 px-2 py-1 text-xs text-gray-700 dark:text-gray-300">
                                    {item.reasonLabel || t(`inventory.reason${item.reason?.charAt(0).toUpperCase() + item.reason?.slice(1)}`)}
                                </span>
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{item.reference || "-"}</td>
                            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">{item.notes || "-"}</td>
                            <td class="px-6 py-4 text-center">
                                <div class="flex items-center justify-center gap-1">
                                    {#if canUpdateStockOut}
                                    <button
                                        onclick={() => openEdit(item)}
                                        class="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                                        title="{t('common.edit')}"
                                    >
                                        <Pencil class="w-4 h-4" />
                                    </button>
                                    {/if}
                                    {#if canDeleteStockOut}
                                    <button
                                        onclick={() => deleteStockOut(item.id)}
                                        class="p-2 text-gray-400 hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-lg"
                                        title="{t('common.delete')}"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                    {/if}
                                </div>
                            </td>
                        </tr>
                    {/each}
                {/if}
            </tbody>
        </table>

        <!-- Pagination -->
        <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-500 dark:text-gray-400">{t("common.rowsPerPage")}:</span>
                <select
                    bind:value={pageSize}
                    onchange={() => handlePageSizeChange()}
                    class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-1 px-2 text-gray-900 dark:text-white"
                >
                    {#each pageSizeOptions as size (size)}
                        <option value={size}>{size}</option>
                    {/each}
                </select>
            </div>
            <div class="flex items-center gap-4">
                <span class="text-sm text-gray-500 dark:text-gray-400">
                    {totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, totalItems)} {t("common.of")} {totalItems}
                </span>
                <div class="flex items-center gap-1">
                    <button
                        onclick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1 || loading}
                        class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("common.previous")}
                    >
                        <ChevronLeft class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    
                    {#each visiblePages as page, idx (idx)}
                        {#if page < 0}
                            <span class="px-2 text-gray-400">...</span>
                        {:else}
                            <button
                                onclick={() => handlePageChange(page)}
                                disabled={loading}
                                class="min-w-8 h-8 px-2 rounded-lg text-sm font-medium transition-colors
                                    {currentPage === page 
                                        ? 'bg-danger-600 text-white' 
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}
                                    disabled:opacity-50"
                            >
                                {page}
                            </button>
                        {/if}
                    {/each}
                    
                    <button
                        onclick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages || totalPages === 0 || loading}
                        class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("common.next")}
                    >
                        <ChevronRight class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                </div>
            </div>
        </div>
        </div>
    {/if}
</div>

{#if showModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onclick={(e) => e.target === e.currentTarget && (showModal = false)}
        onkeydown={(e) => e.key === "Escape" && (showModal = false)}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div class="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {editingId ? t("common.edit") : t("inventory.addStockOut")}
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
                    <label for="a11y-app-inventory-stockout-page-svelte-1" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("products.product")}</label>
                    <select id="a11y-app-inventory-stockout-page-svelte-1"
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
                        <label for="a11y-app-inventory-stockout-page-svelte-2" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("inventory.quantity")}</label>
                        <input id="a11y-app-inventory-stockout-page-svelte-2"
                            type="number"
                            bind:value={formData.quantity}
                            min="1"
                            required
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label for="a11y-app-inventory-stockout-page-svelte-3" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("inventory.reason")}</label>
                        <select id="a11y-app-inventory-stockout-page-svelte-3"
                            bind:value={formData.reason}
                            required
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                        >
                            {#each reasons as r (r.value)}
                                <option value={r.value}>{r.labelKey ? t(r.labelKey) : (i18n.locale === 'lo' ? (r.labelLao || r.label) : r.label)}</option>
                            {/each}
                        </select>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="a11y-app-inventory-stockout-page-svelte-4" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("inventory.reference")}</label>
                        <input id="a11y-app-inventory-stockout-page-svelte-4"
                            type="text"
                            bind:value={formData.reference}
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label for="a11y-app-inventory-stockout-page-svelte-5" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("common.date")}</label>
                        <input id="a11y-app-inventory-stockout-page-svelte-5"
                            type="date"
                            bind:value={formData.date}
                            required
                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>
                <div>
                    <label for="a11y-app-inventory-stockout-page-svelte-6" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("common.notes")}</label>
                    <textarea id="a11y-app-inventory-stockout-page-svelte-6"
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
                        class="flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-white hover:bg-danger-700 disabled:opacity-50"
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
