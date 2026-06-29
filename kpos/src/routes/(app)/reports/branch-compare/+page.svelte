<script lang="ts">
    import { api } from "$lib/api";
    import { t } from '$lib/i18n/index.svelte';
    import { formatCurrency } from "$lib/utils";
    import { cn } from "$lib/utils";
    import { ArrowUpRight, ArrowDownRight, Minus, Calendar, RefreshCw, Loader2, Building2, TrendingUp, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, ChevronDown } from "lucide-svelte";

    const today = new Date().toISOString().split("T")[0];
    const mtdStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

    let from = $state(mtdStart);
    let to = $state(today);
    let loading = $state(false);
    let error = $state<string | null>(null);
    let data = $state<any[]>([]);
    let period = $state<any>(null);
    let showExportMenu = $state(false);
    let exporting = $state(false);
    let totalItems = $state(0);
    const pageSizeOptions = [5, 10, 20, 50, 70, 100];
    let pageSize = $state(10);
    let currentPage = $state(1);
    const totalPages = $derived(Math.max(1, Math.ceil(totalItems / pageSize)));
    const paginatedData = $derived(data);

    async function load() {
        loading = true;
        error = null;
        try {
            const res = await api.get(`reports/branch-compare?from=${from}&to=${to}&page=${currentPage}&limit=${pageSize}`).json<any>();
            data = res.data || [];
            period = res.period || null;
            totalItems = res.pagination?.total ?? data.length;
        } catch {
            error = t('common.loadError');
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        load();
    });

    const maxSales = $derived(data.length > 0 ? Math.max(...data.map((b: any) => b.totalSales)) : 1);

    function downloadBlob(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function csvValue(value: unknown) {
        return `"${String(value ?? "").replace(/"/g, '""')}"`;
    }

    async function getExportData() {
        if (totalItems <= data.length) return data;
        const res = await api.get(`reports/branch-compare?from=${from}&to=${to}&page=1&limit=100`).json<any>();
        return res.data || data;
    }

    function buildExportRows(rowsData: any[]) {
        const headers = ["#", "Branch", "Code", "Total Sales", "Orders", "Average Order", "Discount", "Net Revenue", "Voids"];
        const rows = rowsData.map((branch: any, index: number) => [
            index + 1,
            branch.branchName,
            branch.branchCode,
            branch.totalSales ?? 0,
            branch.orderCount ?? 0,
            branch.avgOrder ?? 0,
            branch.discountTotal ?? 0,
            branch.netRevenue ?? 0,
            branch.voidCount ?? 0,
        ]);
        return [headers, ...rows];
    }

    async function exportExcel() {
        showExportMenu = false;
        exporting = true;
        try {
            const csv = buildExportRows(await getExportData()).map(row => row.map(csvValue).join(",")).join("\n");
            downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `branch_compare_${from}_${to}.csv`);
        } finally {
            exporting = false;
        }
    }

    async function exportPdf() {
        showExportMenu = false;
        exporting = true;
        try {
            const { default: jsPDF } = await import("jspdf");
            const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
            const rows = buildExportRows(await getExportData());
            let y = 54;
            doc.setFontSize(16);
            doc.text("Branch Compare Report", 40, 32);
            doc.setFontSize(9);
            doc.text(`${from} - ${to}`, 40, 46);
            doc.setFontSize(8);
            doc.text(rows[0].join("   "), 40, y);
            y += 14;
            rows.slice(1).forEach((row) => {
                if (y > 560) {
                    doc.addPage();
                    y = 40;
                }
                doc.text(row.map(String).join("   "), 40, y);
                y += 14;
            });
            doc.save(`branch_compare_${from}_${to}.pdf`);
        } finally {
            exporting = false;
        }
    }

    async function exportWord() {
        showExportMenu = false;
        exporting = true;
        try {
            const rows = buildExportRows(await getExportData());
            const escapeXml = (value: unknown) => String(value ?? "").replace(/[<>&]/g, c => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");
            const table = rows.map((row, index) =>
                `<tr>${row.map(cell => `<${index === 0 ? "th" : "td"}>${escapeXml(cell)}</${index === 0 ? "th" : "td"}>`).join("")}</tr>`
            ).join("");
            const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px;font-size:12px}th{background:#f3f4f6}</style></head><body><h1>Branch Compare Report</h1><p>${from} - ${to}</p><table>${table}</table></body></html>`;
            downloadBlob(new Blob([html], { type: "application/msword;charset=utf-8" }), `branch_compare_${from}_${to}.doc`);
        } finally {
            exporting = false;
        }
    }
</script>

<svelte:head>
    <title>ປຽບທຽບສາຂາ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div class="flex items-center gap-4">
            <a href="/reports" class="text-sm text-primary-600 dark:text-primary-400 hover:underline">← ລາຍງານ</a>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ປຽບທຽບສາຂາ</h1>
        </div>
        <div class="relative">
            <button
                onclick={() => showExportMenu = !showExportMenu}
                disabled={exporting || loading || data.length === 0}
                class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
                {#if exporting}
                    <Loader2 class="w-4 h-4 animate-spin" />
                {:else}
                    <Download class="w-4 h-4" />
                {/if}
                Export
                <ChevronDown class="w-4 h-4" />
            </button>
            {#if showExportMenu}
                <div class="absolute right-0 mt-2 w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl z-20 overflow-hidden">
                    <button onclick={exportExcel} class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <FileSpreadsheet class="w-4 h-4 text-success-600" /> Excel / CSV
                    </button>
                    <button onclick={exportPdf} class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <FileText class="w-4 h-4 text-danger-500" /> PDF
                    </button>
                    <button onclick={exportWord} class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <FileText class="w-4 h-4 text-blue-600" /> Word
                    </button>
                </div>
            {/if}
        </div>
    </div>

    <!-- Date Range Filter -->
    <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
        <div class="flex flex-wrap items-end gap-4">
            <div>
                <label for="a11y-app-reports-branch-compare-page-svelte-1" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຈາກວັນທີ</label>
                <div class="relative">
                    <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input id="a11y-app-reports-branch-compare-page-svelte-1"
                        type="date"
                        bind:value={from}
                        class="pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                </div>
            </div>
            <div>
                <label for="a11y-app-reports-branch-compare-page-svelte-2" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຫາວັນທີ</label>
                <div class="relative">
                    <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input id="a11y-app-reports-branch-compare-page-svelte-2"
                        type="date"
                        bind:value={to}
                        class="pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                </div>
            </div>
            <button
                onclick={load}
                disabled={loading}
                class="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
                {#if loading}
                    <Loader2 class="w-4 h-4 animate-spin" />
                {:else}
                    <RefreshCw class="w-4 h-4" />
                {/if}
                ໂຫຼດຂໍ້ມູນ
            </button>
        </div>
    </div>

    <!-- Error State -->
    {#if error}
        <div class="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-xl p-4 mb-6 text-danger-700 dark:text-danger-400">
            {error}
        </div>
    {/if}

    <!-- Loading Skeleton -->
    {#if loading}
        <div class="space-y-4">
            {#each Array(3) as _, i (i)}
                <div class="bg-white dark:bg-gray-800 rounded-xl p-6 animate-pulse">
                    <div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-40 mb-4"></div>
                    <div class="grid grid-cols-4 gap-4">
                        {#each Array(4) as _, j (j)}
                            <div class="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>

    <!-- No Data -->
    {:else if data.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-xl p-12 text-center shadow-sm border border-gray-200 dark:border-gray-700">
            <Building2 class="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p class="text-gray-500 dark:text-gray-400">ບໍ່ມີຂໍ້ມູນສາຂາໃນຊ່ວງນີ້</p>
        </div>

    {:else}
        <!-- Summary Bar Chart Cards -->
        <div class="space-y-4 mb-6">
            {#each paginatedData as branch, i (branch.branchId)}
                <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="flex items-start justify-between gap-4 mb-4">
                        <div class="flex items-center gap-3">
                            <div class={cn(
                                "w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white",
                                i === 0 ? "bg-primary-500" : i === 1 ? "bg-blue-500" : "bg-gray-400"
                            )}>
                                #{(currentPage - 1) * pageSize + i + 1}
                            </div>
                            <div>
                                <p class="font-semibold text-gray-900 dark:text-white">{branch.branchName}</p>
                                <p class="text-xs text-gray-500 dark:text-gray-400">{branch.branchCode}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-xl font-bold text-primary-600">{formatCurrency(branch.totalSales)}</p>
                            <p class="text-xs text-gray-500">{branch.orderCount} ລາຍການ</p>
                        </div>
                    </div>

                    <!-- Sales bar -->
                    <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 mb-4">
                        <div
                            class={cn("h-2 rounded-full transition-all", i === 0 ? "bg-primary-500" : i === 1 ? "bg-blue-500" : "bg-gray-400")}
                            style="width: {maxSales > 0 ? Math.round((branch.totalSales / maxSales) * 100) : 0}%"
                        ></div>
                    </div>

                    <!-- Stats Grid -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">ສະເລ່ຍ/ໃບ</p>
                            <p class="font-semibold text-gray-900 dark:text-white">{formatCurrency(branch.avgOrder)}</p>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">ສ່ວນຫຼຸດ</p>
                            <p class="font-semibold text-danger-600 dark:text-danger-400">-{formatCurrency(branch.discountTotal)}</p>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">ລາຍໄດ້ສຸດທິ</p>
                            <p class="font-semibold text-success-600 dark:text-success-400">{formatCurrency(branch.netRevenue)}</p>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">ຍົກເລີກ</p>
                            <p class={cn("font-semibold", branch.voidCount > 0 ? "text-warning-600 dark:text-warning-400" : "text-gray-900 dark:text-white")}>
                                {branch.voidCount} ລາຍການ
                            </p>
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Summary Table -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <TrendingUp class="w-5 h-5 text-primary-500" />
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">ສະຫຼຸບລວມ</h2>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-700/50">
                            <th class="px-4 py-3 font-medium">ສາຂາ</th>
                            <th class="px-4 py-3 font-medium text-right">ຍອດຂາຍ</th>
                            <th class="px-4 py-3 font-medium text-right">ຈຳນວນໃບ</th>
                            <th class="px-4 py-3 font-medium text-right">ສະເລ່ຍ/ໃບ</th>
                            <th class="px-4 py-3 font-medium text-right">ສ່ວນຫຼຸດ</th>
                            <th class="px-4 py-3 font-medium text-right">ລາຍໄດ້ສຸດທິ</th>
                            <th class="px-4 py-3 font-medium text-right">ຍົກເລີກ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedData as branch (branch.branchId)}
                            <tr class="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">
                                    {branch.branchName}
                                    <span class="ml-1 text-xs text-gray-400">({branch.branchCode})</span>
                                </td>
                                <td class="px-4 py-3 text-right font-semibold text-primary-600">{formatCurrency(branch.totalSales)}</td>
                                <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{branch.orderCount}</td>
                                <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{formatCurrency(branch.avgOrder)}</td>
                                <td class="px-4 py-3 text-right text-danger-600 dark:text-danger-400">-{formatCurrency(branch.discountTotal)}</td>
                                <td class="px-4 py-3 text-right font-semibold text-success-600 dark:text-success-400">{formatCurrency(branch.netRevenue)}</td>
                                <td class="px-4 py-3 text-right {branch.voidCount > 0 ? 'text-warning-600' : 'text-gray-500'}">{branch.voidCount}</td>
                            </tr>
                        {/each}
                        {#if data}
                        <!-- Totals row -->
                        {@const totals = data.reduce((acc: any, b: any) => ({
                            sales: acc.sales + b.totalSales,
                            orders: acc.orders + b.orderCount,
                            discount: acc.discount + b.discountTotal,
                            net: acc.net + b.netRevenue,
                            voids: acc.voids + b.voidCount,
                        }), { sales: 0, orders: 0, discount: 0, net: 0, voids: 0 })}
                        <tr class="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 font-bold">
                            <td class="px-4 py-3 text-gray-900 dark:text-white">ລວມທັງໝົດ</td>
                            <td class="px-4 py-3 text-right text-primary-600">{formatCurrency(totals.sales)}</td>
                            <td class="px-4 py-3 text-right text-gray-900 dark:text-white">{totals.orders}</td>
                            <td class="px-4 py-3 text-right text-gray-900 dark:text-white">
                                {formatCurrency(totals.orders > 0 ? Math.round(totals.sales / totals.orders) : 0)}
                            </td>
                            <td class="px-4 py-3 text-right text-danger-600">-{formatCurrency(totals.discount)}</td>
                            <td class="px-4 py-3 text-right text-success-600">{formatCurrency(totals.net)}</td>
                            <td class="px-4 py-3 text-right text-gray-900 dark:text-white">{totals.voids}</td>
                        </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        </div>
        <div class="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3">
            <select bind:value={pageSize} onchange={() => currentPage = 1} class="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                {#each pageSizeOptions as size}<option value={size}>{size} / ໜ້າ</option>{/each}
            </select>
            <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500">{currentPage} / {totalPages} · {totalItems} ສາຂາ</span>
                <button onclick={() => currentPage--} disabled={currentPage <= 1} class="p-2 rounded-lg border disabled:opacity-40"><ChevronLeft class="w-4 h-4" /></button>
                <button onclick={() => currentPage++} disabled={currentPage >= totalPages} class="p-2 rounded-lg border disabled:opacity-40"><ChevronRight class="w-4 h-4" /></button>
            </div>
        </div>
    {/if}
</div>
