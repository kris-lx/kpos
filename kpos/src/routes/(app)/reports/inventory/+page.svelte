<script lang="ts">
    import { onMount } from "svelte";
    import { cn, formatCurrency } from "$utils";
    import { api } from "$api";
    import { t } from "$lib/i18n/index.svelte";
    import { toast } from "svelte-sonner";
    import {
        Warehouse,
        Search,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Download,
        Package,
        AlertTriangle,
        TrendingUp,
        TrendingDown,
        Archive,
        BarChart3,
        FileSpreadsheet,
        FileType,
        FileText,
        ChevronDown,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let stockFilter = $state<string | null>(null);
    let isLoading = $state(true);
    let currentPage = $state(1);
    let itemsPerPage = $state(20);
    let totalItems = $state(0);
    let showExportMenu = $state(false);
    let exporting = $state(false);

    // Page size options
    const pageSizeOptions = [5, 10, 20, 50, 70, 100];

    // Data
    let inventoryReport = $state<any[]>([]);
    let summaryData = $state<any>({});

    // Stats from API
    let stats = $derived({
        totalProducts: summaryData.totalItems || inventoryReport.length,
        totalStock: inventoryReport.reduce((sum, p) => sum + (p.currentStock || 0), 0),
        lowStock: summaryData.lowStockItems || inventoryReport.filter((p) => (p.currentStock || 0) <= (p.minStock || 10)).length,
        outOfStock: summaryData.outOfStock || 0,
        totalValue: summaryData.totalStockValue || inventoryReport.reduce((sum, p) => sum + ((p.currentStock || 0) * (p.unitCost || 0)), 0),
    });

    function getStockStatus(current: number, min: number) {
        if (current <= 0) return { bg: "bg-red-100 dark:bg-red-900/50", text: "text-red-700 dark:text-red-400", label: "ໝົດສາງ" };
        if (current <= min) return { bg: "bg-amber-100 dark:bg-amber-900/50", text: "text-amber-700 dark:text-amber-400", label: "ຕໍ່າ" };
        return { bg: "bg-green-100 dark:bg-green-900/50", text: "text-green-700 dark:text-green-400", label: "ປົກກະຕິ" };
    }

    async function loadData() {
        isLoading = true;
        try {
            const params = new URLSearchParams();
            params.append("page", currentPage.toString());
            params.append("limit", itemsPerPage.toString());
            if (stockFilter) params.append("stockFilter", stockFilter);
            if (searchQuery) params.append("search", searchQuery);
            
            const res = await api.get(`reports/inventory?${params}`).json<any>();
            inventoryReport = res.data || [];
            totalItems = res.pagination?.total || inventoryReport.length;
            summaryData = res.summary || {};
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            isLoading = false;
        }
    }

    // For export
    let filteredInventory = $derived(() => inventoryReport);

    // Server-side pagination - data already paginated
    let paginatedInventory = $derived(() => inventoryReport);

    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
        }
    }

    function changePageSize(size: number) {
        itemsPerPage = size;
        currentPage = 1;
        loadData();
    }

    function changeStockFilter(filter: string | null) {
        stockFilter = filter;
        currentPage = 1;
        loadData();
    }

    // Debounced search
    let searchTimeout: ReturnType<typeof setTimeout>;
    function handleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadData();
        }, 300);
    }

    onMount(() => loadData());

    // Export functions
    function exportToExcel() {
        exporting = true;
        showExportMenu = false;
        try {
            let csv = '\ufeff';
            csv += 'ລຳດັບ,ສິນຄ້າ,SKU,ສະຕ໋ອກ,ສະຕ໋ອກຕໍ່າສຸດ,ລາຄາ,ມູນຄ່າ,ສະຖານະ\n';
            filteredInventory().forEach((p, i) => {
                const status = getStockStatus(p.currentStock || 0, p.minStock || 10);
                csv += `${i + 1},"${p.name || ''}","${p.sku || ''}",${p.currentStock || 0},${p.minStock || 0},"${formatCurrency(p.unitCost || 0)}","${formatCurrency((p.currentStock || 0) * (p.unitCost || 0))}","${status.label}"\n`;
            });
            downloadFile(csv, `inventory-report.csv`, 'text/csv;charset=utf-8');
            toast.success(t("reports.exportSuccess"));
        } catch (e) {
            toast.error(t("reports.exportFailed"));
        } finally {
            exporting = false;
        }
    }

    function exportToPdf() {
        exporting = true;
        showExportMenu = false;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t("reports.warehouse")}</title>
<style>body{font-family:'Phetsarath OT',sans-serif;padding:20px}h1{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px;font-size:12px}th{background:#f5f5f5}.text-right{text-align:right}.low{color:#d97706}.out{color:#dc2626}.ok{color:#16a34a}</style></head>
<body><h1>${t("reports.warehouse")}</h1><p style="text-align:center">${new Date().toLocaleDateString('lo-LA')}</p>
<table><tr><th>ລຳດັບ</th><th>ສິນຄ້າ</th><th>SKU</th><th>ສະຕ໋ອກ</th><th>ຕໍ່າສຸດ</th><th>ລາຄາ</th><th>ມູນຄ່າ</th><th>ສະຖານະ</th></tr>
${filteredInventory().map((p, i) => { const st = getStockStatus(p.currentStock || 0, p.minStock || 10); const cls = st.label === 'ໝົດສາງ' ? 'out' : st.label === 'ຕໍ່າ' ? 'low' : 'ok'; return `<tr><td>${i + 1}</td><td>${p.name || ''}</td><td>${p.sku || ''}</td><td class="text-right">${p.currentStock || 0}</td><td class="text-right">${p.minStock || 0}</td><td class="text-right">${formatCurrency(p.unitCost || 0)}</td><td class="text-right">${formatCurrency((p.currentStock || 0) * (p.unitCost || 0))}</td><td class="${cls}">${st.label}</td></tr>`; }).join('')}
</table></body></html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (w) w.onload = () => w.print();
        toast.success(t("reports.exportSuccess"));
        exporting = false;
    }

    function exportToWord() {
        exporting = true;
        showExportMenu = false;
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:6px;font-size:11px}th{background:#f0f0f0}</style></head>
<body><h1 style="text-align:center">${t("reports.warehouse")}</h1><p style="text-align:center">${new Date().toLocaleDateString('lo-LA')}</p>
<table><tr><th>ລຳດັບ</th><th>ສິນຄ້າ</th><th>SKU</th><th>ສະຕ໋ອກ</th><th>ຕໍ່າສຸດ</th><th>ລາຄາ</th><th>ມູນຄ່າ</th><th>ສະຖານະ</th></tr>
${filteredInventory().map((p, i) => { const st = getStockStatus(p.currentStock || 0, p.minStock || 10); return `<tr><td>${i + 1}</td><td>${p.name || ''}</td><td>${p.sku || ''}</td><td>${p.currentStock || 0}</td><td>${p.minStock || 0}</td><td>${formatCurrency(p.unitCost || 0)}</td><td>${formatCurrency((p.currentStock || 0) * (p.unitCost || 0))}</td><td>${st.label}</td></tr>`; }).join('')}
</table></body></html>`;
        downloadFile(html, `inventory-report.doc`, 'application/msword');
        toast.success(t("reports.exportSuccess"));
        exporting = false;
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
</script>

<svelte:head>
    <title>{t("reports.warehouse")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg">
                    <Warehouse class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{t("reports.warehouse")}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{t("reports.warehouseDesc")}</p>
                </div>
            </div>
        </div>

        <!-- Export Dropdown -->
        <div class="relative">
            <button 
                onclick={() => showExportMenu = !showExportMenu}
                disabled={exporting}
                class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium"
            >
                {#if exporting}
                    <Loader2 class="w-4 h-4 animate-spin" />
                {:else}
                    <Download class="w-4 h-4" />
                {/if}
                <span>{t("reports.export")}</span>
                <ChevronDown class="w-4 h-4" />
            </button>
            {#if showExportMenu}
                <div class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                    <button onclick={() => exportToExcel()} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
                        <FileSpreadsheet class="w-5 h-5 text-green-600" />
                        <span>{t("reports.exportExcel")}</span>
                    </button>
                    <button onclick={() => exportToPdf()} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
                        <FileType class="w-5 h-5 text-red-600" />
                        <span>{t("reports.exportPdf")}</span>
                    </button>
                    <button onclick={() => exportToWord()} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
                        <FileText class="w-5 h-5 text-blue-600" />
                        <span>{t("reports.exportWord")}</span>
                    </button>
                </div>
            {/if}
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-teal-100 dark:bg-teal-900/50 rounded-lg">
                    <Package class="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <span class="text-2xl font-bold text-teal-600 dark:text-teal-400">{stats.totalProducts}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ລາຍການ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-cyan-100 dark:bg-cyan-900/50 rounded-lg">
                    <Archive class="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <span class="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{stats.totalStock}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຈຳນວນລວມ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <AlertTriangle class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.lowStock}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ສາງຕໍ່າ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                    <TrendingUp class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span class="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(stats.totalValue)}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ມູນຄ່າສາງ</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="text" bind:value={searchQuery} placeholder="ຄົ້ນຫາສິນຄ້າ..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500" />
            </div>
            <div class="flex gap-2">
                {#each [{ id: null, label: "ທັງໝົດ" }, { id: "ok", label: "ປົກກະຕິ" }, { id: "low", label: "ສາງຕໍ່າ" }, { id: "out", label: "ໝົດສາງ" }] as filter}
                    <button
                        onclick={() => { stockFilter = filter.id; currentPage = 1; }}
                        class={cn("px-3 py-2 rounded-lg text-sm font-medium transition-all", stockFilter === filter.id ? "bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
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
            <Loader2 class="w-10 h-10 text-teal-500 animate-spin" />
        </div>
    {:else if paginatedInventory().length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <BarChart3 class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີຂໍ້ມູນ</h3>
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ສິນຄ້າ</th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">SKU</th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຈຳນວນ</th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຂັ້ນຕໍ່າ</th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ມູນຄ່າ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ສະຖານະ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each paginatedInventory() as product}
                            {@const status = getStockStatus(product.currentStock || 0, product.minStock || 10)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-2">
                                        <Package class="w-4 h-4 text-gray-400" />
                                        <span class="font-medium text-gray-900 dark:text-white">{product.name}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-gray-500 dark:text-gray-400 font-mono text-sm">{product.sku || "-"}</td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-bold text-gray-900 dark:text-white">{product.currentStock || 0}</span>
                                </td>
                                <td class="px-6 py-4 text-right text-gray-500 dark:text-gray-400">{product.minStock || 10}</td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency((product.currentStock || 0) * (product.unitCost || 0))}</span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span class={cn("px-2.5 py-1 rounded-full text-xs font-medium", status.bg, status.text)}>
                                        {status.label}
                                    </span>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-500 dark:text-gray-400">ສະແດງ:</span>
                <select 
                    bind:value={itemsPerPage} 
                    onchange={() => changePageSize(itemsPerPage)}
                    class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                    {#each pageSizeOptions as size}
                        <option value={size}>{size} ລາຍການ</option>
                    {/each}
                </select>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                    ({(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} ຈາກ {totalItems})
                </span>
            </div>
            <div class="flex items-center gap-2">
                <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 text-gray-700 dark:text-gray-300">
                    <ChevronLeft class="w-5 h-5" />
                </button>
                <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{currentPage} / {totalPages}</span>
                <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 text-gray-700 dark:text-gray-300">
                    <ChevronRight class="w-5 h-5" />
                </button>
            </div>
        </div>
    {/if}
</div>
