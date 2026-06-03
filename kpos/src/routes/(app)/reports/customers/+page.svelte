<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatCurrency, formatNumber, formatDate } from "$lib/utils";
    import { onMount } from "svelte";
    import { auth } from "$stores";
    import { toast } from "svelte-sonner";
    import { Download, Loader2, Users, UserPlus, Activity, DollarSign, Receipt, Heart, Trophy, PieChart, TrendingUp, Target, Cake, Star, Calendar, ChevronLeft, ChevronRight, Search, FileText, FileSpreadsheet, ChevronDown } from "lucide-svelte";

    let reportData = $state<any>({
        summary: {},
        topCustomers: [],
        customerGrowth: [],
        segments: [],
        retentionRate: 0,
    });
    let loading = $state(true);
    let dateRange = $state({
        from: new Date(new Date().setMonth(new Date().getMonth() - 1))
            .toISOString()
            .split("T")[0],
        to: new Date().toISOString().split("T")[0],
    });

    // Pagination state for top customers
    let currentPage = $state(1);
    let itemsPerPage = $state(10);
    let pageSizeOptions = [5, 10, 20, 50, 70, 80, 100];
    let totalItems = $state(0);
    let searchQuery = $state("");
    let searchTimeout: ReturnType<typeof setTimeout>;
    
    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage) || 1);

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadReport();
        }
    }

    function changePageSize(size: number) {
        itemsPerPage = size;
        currentPage = 1;
        loadReport();
    }

    function handleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadReport();
        }, 300);
    }

    $effect(() => {
        auth.activeStoreId;
        loadReport();
    });

    async function loadReport() {
        loading = true;
        try {
            const params = new URLSearchParams({
                from: dateRange.from,
                to: dateRange.to,
                page: currentPage.toString(),
                limit: itemsPerPage.toString()
            });
            if (searchQuery) params.append('search', searchQuery);
            const custRptBranchId = auth.activeBranchId;
            if (custRptBranchId && !auth.isSuperAdmin) params.append('branchId', custRptBranchId);
            
            const response = await api
                .get(`reports/customers?${params}`)
                .json<any>();
            if (response.success) {
                reportData = response.data;
                if (response.data.pagination) {
                    totalItems = response.data.pagination.total || 0;
                }
                toast.success(t("reports.dataLoaded"));
            }
        } catch (error) {
            console.error("Failed to load customer report:", error);
            toast.error(t("reports.loadError"));
        } finally {
            loading = false;
        }
    }

    function getSegmentColor(name: string): string {
        const colors: Record<string, string> = {
            VIP: "bg-purple-500",
            ປະຈຳ: "bg-blue-500",
            ທົ່ວໄປ: "bg-success-500",
            ໃໝ່: "bg-gray-500",
        };
        return colors[name] || "bg-gray-500";
    }

    let showExportMenu = $state(false);

    function buildCsvRows(): string[][] {
        const headers = ['#', 'ຊື່', 'ໂທລະສັບ', 'ອີເມວ', 'ລະຫັດສະມາຊິກ', 'ຍອດຊື້ລວມ', 'ຈຳນວນອໍເດີ'];
        const rows = (reportData.topCustomers || []).map((c: any) => [
            c.rank,
            c.name,
            c.phone || '',
            c.email || '',
            c.memberCode || '',
            c.totalSpent ?? 0,
            c.orderCount ?? 0,
        ]);
        return [headers, ...rows];
    }

    function exportExcel() {
        showExportMenu = false;
        const rows = buildCsvRows();
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const bom = '\uFEFF';
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customers_report_${dateRange.from}_${dateRange.to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('reports.exportSuccess'));
    }

    function exportPdf() {
        showExportMenu = false;
        const rows = buildCsvRows();
        const tableRows = rows.slice(1).map(r =>
            `<tr>${r.map((v, i) => `<td style="border:1px solid #ddd;padding:6px 10px;${i >= 5 ? 'text-align:right' : ''}">${v}</td>`).join('')}</tr>`
        ).join('');
        const summary = reportData.summary || {};
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>ລາຍງານລູກຄ້າ</title>
<style>body{font-family:sans-serif;padding:24px}h1{font-size:20px;margin-bottom:8px}p{margin:2px 0;color:#555;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f3f4f6;border:1px solid #ddd;padding:8px 10px;text-align:left;font-size:13px}td{font-size:12px}@media print{button{display:none}}</style>
</head><body>
<h1>ລາຍງານລູກຄ້າ</h1>
<p>ໄລຍະ: ${dateRange.from} ຫາ ${dateRange.to}</p>
<p>ລູກຄ້າທັງໝົດ: ${summary.totalCustomers ?? 0} | ລູກຄ້າໃໝ່: ${summary.newCustomers ?? 0} | ລູກຄ້າມີການຊື້: ${summary.activeCustomers ?? 0}</p>
<table><thead><tr>${rows[0].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table>
<script>window.onload=()=>window.print()<\/script></body></html>`;
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
        toast.success(t('reports.exportSuccess'));
    }

    function exportWord() {
        showExportMenu = false;
        const rows = buildCsvRows();
        const tableRows = rows.slice(1).map(r =>
            `<w:tr>${r.map(v => `<w:tc><w:p><w:r><w:t>${String(v).replace(/[<>&]/g, c => c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;')}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`
        ).join('');
        const headerRow = `<w:tr>${rows[0].map(h => `<w:tc><w:tcPr><w:shd w:fill="F3F4F6"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${h}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
        const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml">
<w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>ລາຍງານລູກຄ້າ</w:t></w:r></w:p>
<w:p><w:r><w:t>ໄລຍະ: ${dateRange.from} ຫາ ${dateRange.to}</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single"/><w:left w:val="single"/><w:bottom w:val="single"/><w:right w:val="single"/><w:insideH w:val="single"/><w:insideV w:val="single"/></w:tblBorders></w:tblPr>
${headerRow}${tableRows}</w:tbl></w:body></w:wordDocument>`;
        const blob = new Blob([xml], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customers_report_${dateRange.from}_${dateRange.to}.doc`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('reports.exportSuccess'));
    }
</script>

<svelte:head>
    <title>ລາຍງານລູກຄ້າ - KPOS</title>
</svelte:head>

<div class="p-6">
    <div class="flex justify-between items-center mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ລາຍງານລູກຄ້າ</h1>
            <p class="text-gray-500 dark:text-gray-400">ວິເຄາະພຶດຕິກຳ ແລະ ມູນຄ່າລູກຄ້າ</p>
        </div>
        <div class="flex gap-4">
            <div class="flex gap-2 items-center">
                <div class="relative">
                    <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="date"
                        bind:value={dateRange.from}
                        class="pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
                <span class="text-gray-500 dark:text-gray-400">-</span>
                <div class="relative">
                    <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="date"
                        bind:value={dateRange.to}
                        class="pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
                <button
                    onclick={loadReport}
                    class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                    ໂຫຼດ
                </button>
            </div>
            <div class="relative">
                <button
                    onclick={() => showExportMenu = !showExportMenu}
                    class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"
                >
                    <Download class="w-4 h-4" />
                    ສົ່ງອອກ
                    <ChevronDown class="w-4 h-4" />
                </button>
                {#if showExportMenu}
                    <div class="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-20">
                        <button onclick={exportExcel} class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-xl">
                            <FileSpreadsheet class="w-4 h-4 text-success-600" /> Excel / CSV
                        </button>
                        <button onclick={exportPdf} class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <FileText class="w-4 h-4 text-danger-500" /> PDF (Print)
                        </button>
                        <button onclick={exportWord} class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-b-xl">
                            <FileText class="w-4 h-4 text-blue-600" /> Word (.doc)
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    {#if loading}
        <div class="flex justify-center py-12">
            <Loader2 class="w-8 h-8 animate-spin text-primary-600" />
        </div>
    {:else}
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                <div class="flex items-center gap-2 mb-2">
                    <Users class="w-4 h-4 text-primary-600" />
                    <p class="text-sm text-gray-500 dark:text-gray-400">ລູກຄ້າທັງໝົດ</p>
                </div>
                <p class="text-2xl font-bold text-primary-600">
                    {formatNumber(reportData.summary.totalCustomers)}
                </p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                <div class="flex items-center gap-2 mb-2">
                    <UserPlus class="w-4 h-4 text-success-600 dark:text-success-400" />
                    <p class="text-sm text-gray-500 dark:text-gray-400">ລູກຄ້າໃໝ່</p>
                </div>
                <p class="text-2xl font-bold text-success-600 dark:text-success-400">
                    +{formatNumber(reportData.summary.newCustomers)}
                </p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                <div class="flex items-center gap-2 mb-2">
                    <Activity class="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <p class="text-sm text-gray-500 dark:text-gray-400">ລູກຄ້າມີການຊື້</p>
                </div>
                <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {formatNumber(reportData.summary.activeCustomers)}
                </p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                <div class="flex items-center gap-2 mb-2">
                    <DollarSign class="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <p class="text-sm text-gray-500 dark:text-gray-400">ລາຍຮັບລວມ</p>
                </div>
                <p class="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {formatCurrency(reportData.summary.totalRevenue)}
                </p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                <div class="flex items-center gap-2 mb-2">
                    <Receipt class="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <p class="text-sm text-gray-500 dark:text-gray-400">ຍອດສະເລ່ຍ/ບິນ</p>
                </div>
                <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {formatCurrency(reportData.summary.avgOrderValue)}
                </p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                <div class="flex items-center gap-2 mb-2">
                    <Heart class="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <p class="text-sm text-gray-500 dark:text-gray-400">ອັດຕາຮັກສາ</p>
                </div>
                <p class="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
                    {(reportData.retentionRate ?? reportData.summary?.retentionRate ?? 0).toFixed(1)}%
                </p>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <!-- Top Customers -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-3">
                    <div class="flex justify-between items-center">
                        <h2 class="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <Trophy class="w-5 h-5 text-yellow-500" />
                            ລູກຄ້າທີ່ດີທີ່ສຸດ
                        </h2>
                    </div>
                    <!-- Search -->
                    <div class="relative">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            bind:value={searchQuery} 
                            oninput={() => handleSearch()} 
                            placeholder="ຄົ້ນຫາລູກຄ້າ..." 
                            class="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500" 
                        />
                    </div>
                </div>
                <div class="divide-y divide-gray-200 dark:divide-gray-700">
                    {#each reportData.topCustomers || [] as customer, index}
                        <div class="p-4 flex items-center gap-4">
                            <span
                                class="w-8 h-8 flex items-center justify-center rounded-full font-bold
                                {(currentPage - 1) * itemsPerPage + index === 0
                                    ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
                                    : (currentPage - 1) * itemsPerPage + index === 1
                                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                      : (currentPage - 1) * itemsPerPage + index === 2
                                        ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300'
                                        : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}"
                            >
                                {(currentPage - 1) * itemsPerPage + index + 1}
                            </span>
                            <div class="flex-1">
                                <p class="font-medium text-gray-900 dark:text-white">{customer.name}</p>
                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                    {customer.phone}
                                </p>
                            </div>
                            <div class="text-right">
                                <p class="font-bold text-primary-600">
                                    {formatCurrency(customer.totalSpent)}
                                </p>
                                <p class="text-xs text-gray-500 dark:text-gray-400">
                                    {customer.orderCount} ອໍເດີ
                                </p>
                            </div>
                        </div>
                    {/each}
                </div>
                <!-- Totals row -->
                {#if (reportData.topCustomers || []).length > 0}
                    {@const custTotals = (reportData.topCustomers || []).reduce(
                        (a: any, c: any) => ({ spent: a.spent + (c.totalSpent || 0), orders: a.orders + (c.orderCount || 0) }),
                        { spent: 0, orders: 0 }
                    )}
                    <div class="p-4 flex items-center gap-4 bg-primary-50 dark:bg-primary-900/20 border-t-2 border-primary-200 dark:border-primary-700 font-bold">
                        <span class="w-8 h-8"></span>
                        <div class="flex-1">
                            <p class="text-gray-900 dark:text-white">ລວມທັງໝົດ ({totalItems} ຄົນ)</p>
                        </div>
                        <div class="text-right">
                            <p class="font-bold text-primary-600">{formatCurrency(custTotals.spent)}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">{custTotals.orders} ອໍເດີ</p>
                        </div>
                    </div>
                {/if}
                <!-- Pagination for Top Customers -->
                {#if totalPages >= 1}
                    <div class="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
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
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-sm text-gray-700 dark:text-gray-300">
                                {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} / {totalItems}
                            </span>
                            <button
                                onclick={() => goToPage(currentPage - 1)}
                                disabled={currentPage === 1}
                                class="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
                            >
                                <ChevronLeft class="h-4 w-4" />
                            </button>
                            <span class="px-2 text-sm text-gray-600 dark:text-gray-400">{currentPage} / {totalPages}</span>
                            <button
                                onclick={() => goToPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                class="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
                            >
                                <ChevronRight class="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Customer Segments -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 class="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <PieChart class="w-5 h-5 text-blue-500" />
                        ກຸ່ມລູກຄ້າ
                    </h2>
                </div>
                <div class="p-4">
                    <div class="flex h-8 rounded-lg overflow-hidden mb-4">
                        {#each (reportData.segments || []) as segment (segment.name)}
                            <div
                                class="{getSegmentColor(
                                    segment.name,
                                )} transition-all"
                                style="width: {segment.percentage}%"
                                title="{segment.name}: {segment.percentage}%"
                            ></div>
                        {/each}
                    </div>
                    <div class="space-y-3">
                        {#each (reportData.segments || []) as segment (segment.name)}
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span
                                        class="w-3 h-3 rounded-full {getSegmentColor(
                                            segment.name,
                                        )}"
                                    ></span>
                                    <span class="font-medium text-gray-900 dark:text-white"
                                        >{segment.name}</span
                                    >
                                </div>
                                <div class="flex gap-4 text-sm">
                                    <span class="text-gray-500 dark:text-gray-400"
                                        >{formatNumber(segment.count)} ຄົນ ({segment.percentage}%)</span
                                    >
                                    <span class="font-semibold text-gray-900 dark:text-white"
                                        >{formatCurrency(segment.revenue)}</span
                                    >
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>

        <!-- Customer Growth Chart -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp class="w-5 h-5 text-success-500" />
                    ແນວໂນ້ມລູກຄ້າ
                </h2>
            </div>
            <div class="p-4">
                <div class="flex items-end gap-2 h-48">
                    {#each (reportData.customerGrowth || []) as month (month.month)}
                        <div class="flex-1 flex flex-col items-center gap-1">
                            <div
                                class="w-full flex flex-col gap-1"
                                style="height: 160px;"
                            >
                                <div
                                    class="flex-1 flex flex-col justify-end gap-1"
                                >
                                    <div
                                        class="bg-success-400 dark:bg-success-500 rounded-t transition-all"
                                        style="height: {(month.new / 80) *
                                            100}px"
                                        title="ລູກຄ້າໃໝ່: {month.new}"
                                    ></div>
                                    <div
                                        class="bg-blue-400 dark:bg-blue-500 rounded-t transition-all"
                                        style="height: {(month.returning /
                                            300) *
                                            100}px"
                                        title="ລູກຄ້າກັບມາ: {month.returning}"
                                    ></div>
                                </div>
                            </div>
                            <span class="text-xs text-gray-500 dark:text-gray-400"
                                >{month.month.split("-")[1]}</span
                            >
                        </div>
                    {/each}
                </div>
                <div class="flex justify-center gap-6 mt-4">
                    <div class="flex items-center gap-2">
                        <span class="w-3 h-3 bg-success-400 dark:bg-success-500 rounded"></span>
                        <span class="text-sm text-gray-600 dark:text-gray-400">ລູກຄ້າໃໝ່</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="w-3 h-3 bg-blue-400 dark:bg-blue-500 rounded"></span>
                        <span class="text-sm text-gray-600 dark:text-gray-400">ລູກຄ້າກັບມາ</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Additional Insights from real data -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                <h3 class="font-medium mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp class="w-5 h-5 text-success-500" />
                    ການເຕີບໂຕ
                </h3>
                <p class="text-3xl font-bold {(reportData.summary?.growthRate ?? 0) >= 0 ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'}">
                    {(reportData.summary?.growthRate ?? 0) >= 0 ? '+' : ''}{(reportData.summary?.growthRate ?? 0).toFixed(1)}%
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400">ອັດຕາເຕີບໂຕລູກຄ້າໃໝ່</p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                <h3 class="font-medium mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                    <Activity class="w-5 h-5 text-blue-500" />
                    ສະເລ່ຍ / ລູກຄ້າ
                </h3>
                <p class="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(reportData.summary?.avgOrderValue ?? 0)}
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400">ຍອດສະເລ່ຍຕໍ່ບິນ</p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                <h3 class="font-medium mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                    <Receipt class="w-5 h-5 text-purple-500" />
                    ສະເລ່ຍ / ຄັ້ງ
                </h3>
                <p class="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {(reportData.summary?.avgOrdersPerCustomer ?? 0).toFixed(1)}
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400">ຄັ້ງສະເລ່ຍຕໍ່ລູກຄ້າ</p>
            </div>
        </div>
    {/if}
</div>
