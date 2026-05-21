<script lang="ts">
    import { cn, formatCurrency } from "$utils";
    import { api } from "$api";
    import { t } from "$lib/i18n/index.svelte";
    import { auth } from "$stores";
    import { toast } from "svelte-sonner";
    import {
        Package,
        Search,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Download,
        TrendingUp,
        TrendingDown,
        ShoppingCart,
        DollarSign,
        BarChart3,
        Star,
        ArrowUpRight,
        ArrowDownRight,
        FileSpreadsheet,
        FileType,
        FileText,
        Printer,
        ChevronDown,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let periodFilter = $state("month");
    let isLoading = $state(true);
    let currentPage = $state(1);
    let itemsPerPage = $state(20);
    let totalItems = $state(0);
    let showExportMenu = $state(false);
    let exporting = $state(false);

    // Page size options
    const pageSizeOptions = [5, 10, 20, 50, 70, 100];

    // Data
    let productReports = $state<any[]>([]);

    // Stats
    let stats = $derived({
        totalProducts: productReports.length,
        totalSales: productReports.reduce((sum, p) => sum + (p.totalSales || 0), 0),
        totalRevenue: productReports.reduce((sum, p) => sum + (p.revenue || 0), 0),
        topSeller: productReports.length > 0 ? productReports.reduce((a, b) => (a.totalSales || 0) > (b.totalSales || 0) ? a : b) : null,
    });

    async function loadData() {
        isLoading = true;
        try {
            const params = new URLSearchParams();
            params.append("period", periodFilter);
            params.append("page", currentPage.toString());
            params.append("limit", itemsPerPage.toString());
            if (searchQuery) params.append("search", searchQuery);
            
            const res = await api.get(`reports/products?${params}`).json<any>();
            productReports = res.data || [];
            totalItems = res.pagination?.total || productReports.length;
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });

    // For export - use all filtered data
    let filteredProducts = $derived(productReports);

    // Server-side pagination - data already paginated
    let paginatedProducts = $derived(productReports);

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

    // Debounced search
    let searchTimeout: ReturnType<typeof setTimeout>;
    function handleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadData();
        }, 300);
    }

    $effect(() => {
        periodFilter;
        currentPage = 1;
        loadData();
    });

    // Export functions
    function exportToExcel() {
        exporting = true;
        showExportMenu = false;
        try {
            let csv = '\ufeff';
            csv += 'ອັນດັບ,ສິນຄ້າ,SKU,ຈຳນວນຂາຍ,ລາຍຮັບ\n';
            filteredProducts.forEach((p, i) => {
                csv += `${i + 1},"${p.name || ''}","${p.sku || ''}",${p.totalSales || 0},"${formatCurrency(p.revenue || 0)}"\n`;
            });
            downloadFile(csv, `products-report-${periodFilter}.csv`, 'text/csv;charset=utf-8');
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
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t("reports.inventory")}</title>
<style>body{font-family:'Noto Sans Lao','Phetsarath OT',sans-serif;padding:20px}h1{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#f5f5f5}.text-right{text-align:right}</style></head>
<body><h1>${t("reports.inventory")}</h1><p style="text-align:center">${new Date().toLocaleDateString('lo-LA')}</p>
<table><tr><th>ອັນດັບ</th><th>ສິນຄ້າ</th><th>SKU</th><th>ຈຳນວນຂາຍ</th><th>ລາຍຮັບ</th></tr>
${filteredProducts.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name || ''}</td><td>${p.sku || ''}</td><td class="text-right">${p.totalSales || 0}</td><td class="text-right">${formatCurrency(p.revenue || 0)}</td></tr>`).join('')}
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
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:8px}th{background:#f0f0f0}</style></head>
<body><h1 style="text-align:center">${t("reports.inventory")}</h1><p style="text-align:center">${new Date().toLocaleDateString('lo-LA')}</p>
<table><tr><th>ອັນດັບ</th><th>ສິນຄ້າ</th><th>SKU</th><th>ຈຳນວນຂາຍ</th><th>ລາຍຮັບ</th></tr>
${filteredProducts.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name || ''}</td><td>${p.sku || ''}</td><td>${p.totalSales || 0}</td><td>${formatCurrency(p.revenue || 0)}</td></tr>`).join('')}
</table></body></html>`;
        downloadFile(html, `products-report-${periodFilter}.doc`, 'application/msword');
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
    <title>ລາຍງານສິນຄ້າ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                    <BarChart3 class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ລາຍງານສິນຄ້າ</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ວິເຄາະປະສິດທິພາບສິນຄ້າ</p>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <select bind:value={periodFilter} class="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                <option value="day">{t("reports.today")}</option>
                <option value="week">{t("reports.thisWeek")}</option>
                <option value="month">{t("reports.thisMonth")}</option>
                <option value="year">{t("reports.thisYear")}</option>
            </select>
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
                            <FileSpreadsheet class="w-5 h-5 text-success-600" />
                            <span>{t("reports.exportExcel")}</span>
                        </button>
                        <button onclick={() => exportToPdf()} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
                            <FileType class="w-5 h-5 text-danger-600" />
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
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Package class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalProducts}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ສິນຄ້າທັງໝົດ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-success-100 dark:bg-success-900/50 rounded-lg">
                    <ShoppingCart class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <span class="text-2xl font-bold text-success-600 dark:text-success-400">{stats.totalSales}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຂາຍລວມ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                    <DollarSign class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span class="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(stats.totalRevenue)}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ລາຍຮັບລວມ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Star class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-sm font-bold text-amber-600 dark:text-amber-400 truncate max-w-20">{stats.topSeller?.name || "-"}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຂາຍດີທີ່ສຸດ</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" bind:value={searchQuery} placeholder="ຄົ້ນຫາສິນຄ້າ..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
        </div>
    </div>

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-blue-500 animate-spin" />
        </div>
    {:else if paginatedProducts.length === 0}
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
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">#</th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ສິນຄ້າ</th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">SKU</th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຈຳນວນຂາຍ</th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ລາຍຮັບ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ແນວໂນ້ມ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each paginatedProducts as product, i}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                                <td class="px-6 py-4">
                                    <span class="text-gray-500 dark:text-gray-400">{(currentPage - 1) * itemsPerPage + i + 1}</span>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-2">
                                        <Package class="w-4 h-4 text-gray-400" />
                                        <span class="font-medium text-gray-900 dark:text-white">{product.name}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-gray-500 dark:text-gray-400 font-mono text-sm">{product.sku || "-"}</td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-bold text-gray-900 dark:text-white">{product.totalSales || 0}</span>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(product.revenue || 0)}</span>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex justify-center">
                                        {#if (product.trend || 0) > 0}
                                            <span class="inline-flex items-center gap-1 text-success-600 dark:text-success-400 text-sm">
                                                <ArrowUpRight class="w-4 h-4" />
                                                +{product.trend}%
                                            </span>
                                        {:else if (product.trend || 0) < 0}
                                            <span class="inline-flex items-center gap-1 text-danger-600 dark:text-danger-400 text-sm">
                                                <ArrowDownRight class="w-4 h-4" />
                                                {product.trend}%
                                            </span>
                                        {:else}
                                            <span class="text-gray-400 text-sm">-</span>
                                        {/if}
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
    {#if totalPages > 1}
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-500 dark:text-gray-400">ສະແດງ:</span>
                <select 
                    bind:value={itemsPerPage} 
                    onchange={() => changePageSize(itemsPerPage)}
                    class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                    {#each pageSizeOptions as size (size)}
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
