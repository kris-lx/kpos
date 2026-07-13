<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { cn, formatCurrency, formatDateTime, escapeHtml, escapeCsvCell } from "$lib/utils";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import {
        TrendingUp,
        TrendingDown,
        DollarSign,
        ShoppingCart,
        Users,
        Package,
        Calendar,
        Download,
        RefreshCw,
        Loader2,
        BarChart3,
        FileText,
        Wallet,
        AlertCircle,
        FileSpreadsheet,
        FileType,
        Printer,
        ChevronDown,
        BookOpen,
        ShieldCheck,
        Building2,
    } from "lucide-svelte";

    // State
    let dateRange = $state<"today" | "week" | "month" | "year">("month");
    let selectedReport = $state<"sales" | "products" | "customers">("sales");
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showExportMenu = $state(false);
    let exporting = $state(false);

    // Pagination
    const PAGE_SIZE = 10;
    let salesPage = $state(1);
    let productsPage = $state(1);
    let customersPage = $state(1);

    // Data
    let periodSummary = $state<any>({});  // from salesRes.summary — reflects selected date range
    let salesData = $state<any[]>([]);
    let topProducts = $state<any[]>([]);
    let topCustomers = $state<any[]>([]);

    let pagedSales = $derived(salesData.slice((salesPage - 1) * PAGE_SIZE, salesPage * PAGE_SIZE));
    let salesTotalPages = $derived(Math.max(1, Math.ceil(salesData.length / PAGE_SIZE)));
    let pagedProducts = $derived(topProducts.slice((productsPage - 1) * PAGE_SIZE, productsPage * PAGE_SIZE));
    let productsTotalPages = $derived(Math.max(1, Math.ceil(topProducts.length / PAGE_SIZE)));
    let pagedCustomers = $derived(topCustomers.slice((customersPage - 1) * PAGE_SIZE, customersPage * PAGE_SIZE));
    let customersTotalPages = $derived(Math.max(1, Math.ceil(topCustomers.length / PAGE_SIZE)));

    // Date range labels
    const dateRangeLabels = $derived({
        today: t("reports.today"),
        week: t("reports.thisWeek"),
        month: t("reports.thisMonth"),
        year: t("reports.thisYear"),
    });

    // R-10: compute date range once per load, share value across all calls
    function getDateRange(): { start: Date; end: Date; startStr: string; endStr: string } {
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const start = new Date(end);
        switch (dateRange) {
            case "today":  start.setHours(0, 0, 0, 0); break;
            case "week":   start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0); break;
            case "year":   start.setFullYear(start.getFullYear() - 1); start.setHours(0, 0, 0, 0); break;
            default:       start.setMonth(start.getMonth() - 1); start.setHours(0, 0, 0, 0);
        }
        return { start, end, startStr: start.toISOString().split("T")[0], endStr: end.toISOString().split("T")[0] };
    }

    $effect(() => {
        dateRange;
        auth.activeStoreId;
        loadData();
    });

    async function loadData() {
        loading = true;
        error = null;
        try {
            const { startStr, endStr } = getDateRange();
            const params = `startDate=${startStr}&endDate=${endStr}`;

            const [salesRes, productsRes, customersRes] = await Promise.all([
                api.get(`reports/sales?${params}`).json<any>().catch(() => ({ data: [], summary: {} })),
                api.get(`reports/top-products?${params}&limit=10`).json<any>().catch(() => ({ data: [] })),
                api.get(`reports/customers?limit=10&from=${startStr}&to=${endStr}`).json<any>().catch(() => ({ data: { topCustomers: [], summary: {} } })),
            ]);

            // R-08/R-11: use period sales summary (reflects selected date range)
            periodSummary = salesRes.summary || {};
            salesData = salesRes.data || [];
            topProducts = productsRes.data || [];
            const custData = customersRes.data || {};
            topCustomers = custData.topCustomers || [];
        } catch (e) {
            console.error("Failed to load reports:", e);
            error = t('common.loadError');
        } finally {
            loading = false;
        }
    }

    // Export functions
    async function exportToExcel() {
        exporting = true;
        showExportMenu = false;
        try {
            const data = getExportData();
            const headers = getExportHeaders();
            
            // Create CSV content (Excel compatible)
            let csv = '\ufeff'; // BOM for UTF-8
            csv += headers.join(',') + '\n';
            data.forEach(row => {
                csv += headers.map(h => escapeCsvCell(row[h])).join(',') + '\n';
            });
            
            downloadFile(csv, `report-${selectedReport}-${dateRange}.csv`, 'text/csv;charset=utf-8');
            toast.success(t("reports.exportSuccess"));
        } catch (e) {
            console.error('Export failed:', e);
            toast.error(t("reports.exportFailed"));
        } finally {
            exporting = false;
        }
    }

    async function exportToPdf() {
        exporting = true;
        showExportMenu = false;
        try {
            const data = getExportData();
            const headers = getExportHeaders();
            
            // Create HTML for PDF
            const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${t("reports.title")} - ${dateRangeLabels[dateRange]}</title>
    <style>
        body { font-family: 'Noto Sans Lao', 'Phetsarath OT', sans-serif; padding: 20px; }
        h1 { text-align: center; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; }
        .text-right { text-align: right; }
        .header-info { text-align: center; margin-bottom: 10px; color: #666; }
    </style>
</head>
<body>
    <h1>${t("reports.title")}</h1>
    <p class="header-info">${dateRangeLabels[dateRange]} - ${new Date().toLocaleDateString('lo-LA')}</p>
    <table>
        <thead>
            <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>
            ${data.map(row => `<tr>${headers.map(h => `<td>${escapeHtml(row[h])}</td>`).join('')}</tr>`).join('')}
        </tbody>
    </table>
</body>
</html>`;

            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(html);
                printWindow.document.close();
            }
            if (printWindow) {
                printWindow.onload = () => {
                    printWindow.print();
                };
            }
            toast.success(t("reports.exportSuccess"));
        } catch (e) {
            console.error('Export failed:', e);
            toast.error(t("reports.exportFailed"));
        } finally {
            exporting = false;
        }
    }

    async function exportToWord() {
        exporting = true;
        showExportMenu = false;
        try {
            const data = getExportData();
            const headers = getExportHeaders();
            
            // Create HTML table for Word
            const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
    <meta charset="utf-8">
    <title>${t("reports.title")}</title>
    <style>
        body { font-family: 'Noto Sans Lao', 'Phetsarath OT', sans-serif; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 8px; }
        th { background: #f0f0f0; }
        h1 { text-align: center; }
    </style>
</head>
<body>
    <h1>${t("reports.title")} - ${dateRangeLabels[dateRange]}</h1>
    <p style="text-align:center">${new Date().toLocaleDateString('lo-LA')}</p>
    <table>
        <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
        ${data.map(row => `<tr>${headers.map(h => `<td>${escapeHtml(row[h])}</td>`).join('')}</tr>`).join('')}
    </table>
</body>
</html>`;

            downloadFile(html, `report-${selectedReport}-${dateRange}.doc`, 'application/msword');
            toast.success(t("reports.exportSuccess"));
        } catch (e) {
            console.error('Export failed:', e);
            toast.error(t("reports.exportFailed"));
        } finally {
            exporting = false;
        }
    }

    function getExportData(): any[] {
        switch (selectedReport) {
            case 'sales':
                return salesData.map(s => ({
                    'ວັນທີ': s.date,
                    'ຈຳນວນ': s.count,
                    'ຍອດລວມ': formatCurrency(s.total),
                }));
            case 'products':
                return topProducts.map((p, i) => ({
                    'ອັນດັບ': i + 1,
                    'ສິນຄ້າ': p.productName,
                    'ຈຳນວນຂາຍ': p.quantitySold,
                    'ລາຍຮັບ': formatCurrency(p.revenue),
                }));
            case 'customers':
                return topCustomers.map((c, i) => ({
                    'ອັນດັບ': i + 1,
                    'ຊື່': c.name,
                    'ໂທລະສັບ': c.phone || '-',
                    'ຍອດໃຊ້ຈ່າຍ': formatCurrency(c.totalSpent),
                    'ຈຳນວນຄັ້ງ': c.visitCount,
                }));
            default:
                return [];
        }
    }

    function getExportHeaders(): string[] {
        switch (selectedReport) {
            case 'sales':
                return ['ວັນທີ', 'ຈຳນວນ', 'ຍອດລວມ'];
            case 'products':
                return ['ອັນດັບ', 'ສິນຄ້າ', 'ຈຳນວນຂາຍ', 'ລາຍຮັບ'];
            case 'customers':
                return ['ອັນດັບ', 'ຊື່', 'ໂທລະສັບ', 'ຍອດໃຊ້ຈ່າຍ', 'ຈຳນວນຄັ້ງ'];
            default:
                return [];
        }
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
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function handlePrint() {
        showExportMenu = false;
        window.print();
    }

    function printAsReceipt() {
        showExportMenu = false;
        const data = getExportData();
        const headers = getExportHeaders();
        const title = selectedReport === 'sales' ? 'ລາຍງານການຂາຍ' : selectedReport === 'products' ? 'ລາຍງານສິນຄ້າ' : 'ລາຍງານລູກຄ້າ';
        const now = new Date().toLocaleString('lo-LA');
        const divider = '─'.repeat(32);

        let lines = [
            'KPOS',
            title,
            dateRangeLabels[dateRange],
            now,
            divider,
        ];

        data.forEach((row, i) => {
            const vals = headers.map(h => `${escapeHtml(h)}: ${escapeHtml(row[h])}`);
            lines.push(`${i + 1}. ${vals.join(' | ')}`);
        });

        lines.push(divider);
        if (selectedReport === 'sales') {
            const totalAmount = salesData.reduce((s: number, r: any) => s + (r.total || 0), 0);
            const totalCount = salesData.reduce((s: number, r: any) => s + (r.count || 0), 0);
            lines.push(`ລວມ: ${totalCount} ລາຍການ`);
            lines.push(`ຍອດລວມ: ${formatCurrency(totalAmount)}`);
        }
        lines.push('', 'ພິມໂດຍ: KPOS System');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
@page { margin: 0; size: 80mm auto; }
body { font-family: 'Noto Sans Lao', 'Phetsarath OT', monospace; font-size: 12px; width: 72mm; margin: 4mm auto; line-height: 1.6; }
.center { text-align: center; }
.bold { font-weight: bold; }
.divider { border-top: 1px dashed #000; margin: 4px 0; }
</style></head><body>
${lines.map(l => l === divider ? '<div class="divider"></div>' : `<div${l === 'KPOS' || l === title ? ' class="center bold"' : ''}>${l}</div>`).join('\n')}
</body></html>`;

        const win = window.open('', '_blank', 'width=320,height=600');
        if (win) {
            win.document.write(html);
            win.document.close();
            win.onload = () => win.print();
        }
    }
</script>

<svelte:head>
    <title>{t("reports.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{t("reports.title")}</h1>
            <p class="text-gray-500 dark:text-gray-400">{t("reports.subtitle")}</p>
        </div>

        <div class="flex items-center gap-3">
            <!-- Date Range -->
            <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                {#each Object.entries(dateRangeLabels) as [key, label]}
                    <button
                        onclick={() => (dateRange = key as typeof dateRange)}
                        class={cn(
                            "px-4 py-2 text-sm font-medium transition-colors",
                            dateRange === key
                                ? "bg-primary-500 text-white"
                                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700",
                        )}
                    >
                        {label}
                    </button>
                {/each}
            </div>

            <button
                onclick={() => loadData()}
                disabled={loading}
                class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700"
            >
                <RefreshCw class={cn("w-4 h-4", loading && "animate-spin")} />
            </button>

            <!-- Export Dropdown -->
            <div class="relative">
                <button 
                    onclick={() => showExportMenu = !showExportMenu}
                    disabled={exporting}
                    class="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    {#if exporting}
                        <Loader2 class="w-4 h-4 animate-spin" />
                        <span>{t("reports.exporting")}</span>
                    {:else}
                        <Download class="w-4 h-4" />
                        <span>{t("reports.export")}</span>
                        <ChevronDown class="w-4 h-4" />
                    {/if}
                </button>

                {#if showExportMenu}
                    <div class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                        <button
                            onclick={() => exportToExcel()}
                            class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                            <FileSpreadsheet class="w-5 h-5 text-success-600" />
                            <span>{t("reports.exportExcel")}</span>
                        </button>
                        <button
                            onclick={() => exportToPdf()}
                            class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                            <FileType class="w-5 h-5 text-danger-600" />
                            <span>{t("reports.exportPdf")}</span>
                        </button>
                        <button
                            onclick={() => exportToWord()}
                            class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                            <FileText class="w-5 h-5 text-blue-600" />
                            <span>{t("reports.exportWord")}</span>
                        </button>
                        <hr class="border-gray-200 dark:border-gray-700" />
                        <button
                            onclick={() => handlePrint()}
                            class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                            <Printer class="w-5 h-5 text-gray-600" />
                            <span>{t("reports.print")}</span>
                        </button>
                        <button
                            onclick={() => printAsReceipt()}
                            class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                            <FileText class="w-5 h-5 text-orange-600" />
                            <span>ພິມແບບໃບບິນ</span>
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    {#if loading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-primary-500 animate-spin" />
        </div>
    {:else if error}
        <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <AlertCircle class="w-12 h-12 mx-auto text-danger-400" />
            <p class="mt-4 text-gray-700 dark:text-gray-300">{error}</p>
            <button
                onclick={() => loadData()}
                class="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
                {t("reports.retry")}
            </button>
        </div>
    {:else}
        <!-- Summary Cards — R-08/R-11: real period data, R-07: no hardcoded % -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <DollarSign class="w-6 h-6 text-primary-600" />
                    </div>
                    <span class="text-xs text-gray-400 dark:text-gray-500">{dateRangeLabels[dateRange]}</span>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("reports.totalSales")}</p>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(periodSummary.totalSales || 0)}
                </p>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
                        <ShoppingCart class="w-6 h-6 text-success-600" />
                    </div>
                    <span class="text-xs text-gray-400 dark:text-gray-500">{dateRangeLabels[dateRange]}</span>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("reports.totalOrders")}</p>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                    {new Intl.NumberFormat("lo-LA").format(periodSummary.totalOrders || 0)}
                </p>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <BarChart3 class="w-6 h-6 text-blue-600" />
                    </div>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("reports.avgOrderValue")}</p>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(periodSummary.totalOrders > 0 ? Math.round((periodSummary.totalSales || 0) / periodSummary.totalOrders) : 0)}
                </p>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <TrendingDown class="w-6 h-6 text-purple-600" />
                    </div>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("reports.totalDiscount")}</p>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(periodSummary.totalDiscount || 0)}
                </p>
            </div>
        </div>

        <!-- Report Tabs -->
        <div class="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <div class="flex border-b border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => (selectedReport = "sales")}
                    class={cn(
                        "px-6 py-4 text-sm font-medium transition-colors border-b-2 -mb-px",
                        selectedReport === "sales"
                            ? "border-primary-500 text-primary-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
                    )}
                >
                    {t("reports.salesTab")}
                </button>
                <button
                    onclick={() => (selectedReport = "products")}
                    class={cn(
                        "px-6 py-4 text-sm font-medium transition-colors border-b-2 -mb-px",
                        selectedReport === "products"
                            ? "border-primary-500 text-primary-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
                    )}
                >
                    {t("reports.productsTab")}
                </button>
                <button
                    onclick={() => (selectedReport = "customers")}
                    class={cn(
                        "px-6 py-4 text-sm font-medium transition-colors border-b-2 -mb-px",
                        selectedReport === "customers"
                            ? "border-primary-500 text-primary-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
                    )}
                >
                    {t("reports.customersTab")}
                </button>
            </div>

            <div class="p-6">
                {#if selectedReport === "sales"}
                    <!-- Sales Data -->
                    {#if salesData.length === 0}
                        <div class="h-60 flex items-center justify-center">
                            <div class="text-center text-gray-400">
                                <BarChart3 class="w-16 h-16 mx-auto mb-4" />
                                <p class="text-lg font-medium">{t("reports.noSalesData")}</p>
                                <p class="text-sm">{dateRangeLabels[dateRange]}</p>
                            </div>
                        </div>
                    {:else}
                        <div class="space-y-3">
                            {#each pagedSales as sale}
                                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                    <div>
                                        <p class="font-medium text-gray-900 dark:text-white">{sale.date}</p>
                                        <p class="text-sm text-gray-500">{sale.count} {t("reports.items")}</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="font-bold text-gray-900 dark:text-white">{formatCurrency(sale.total)}</p>
                                    </div>
                                </div>
                            {/each}
                        </div>
                        {#if salesData.length > 0}
                            <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <span class="text-sm text-gray-500">{t("common.page")} {salesPage}/{salesTotalPages}</span>
                                <div class="flex gap-2">
                                    <button onclick={() => salesPage = Math.max(1, salesPage - 1)} disabled={salesPage <= 1} class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
                                    <button onclick={() => salesPage = Math.min(salesTotalPages, salesPage + 1)} disabled={salesPage >= salesTotalPages} class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
                                </div>
                            </div>
                        {/if}
                    {/if}
                {:else if selectedReport === "products"}
                    <!-- Top Products -->
                    {#if topProducts.length === 0}
                        <div class="h-60 flex items-center justify-center">
                            <div class="text-center text-gray-400">
                                <Package class="w-16 h-16 mx-auto mb-4" />
                                <p class="text-lg font-medium">{t("reports.noData")}</p>
                            </div>
                        </div>
                    {:else}
                        <div class="space-y-4">
                            {#each pagedProducts as product, index}
                                <div class="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                    <div class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center font-bold text-primary-600">
                                        {product.rank || (productsPage - 1) * PAGE_SIZE + index + 1}
                                    </div>
                                    <div class="flex-1">
                                        <p class="font-medium text-gray-900 dark:text-white">{product.productName}</p>
                                        <p class="text-sm text-gray-500">{product.quantitySold} {t("reports.pieces")}</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="font-bold text-gray-900 dark:text-white">{formatCurrency(product.revenue)}</p>
                                        <p class="text-sm text-gray-500">{t("reports.revenue")}</p>
                                    </div>
                                </div>
                            {/each}
                        </div>
                        {#if topProducts.length > 0}
                            <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <span class="text-sm text-gray-500">{t("common.page")} {productsPage}/{productsTotalPages}</span>
                                <div class="flex gap-2">
                                    <button onclick={() => productsPage = Math.max(1, productsPage - 1)} disabled={productsPage <= 1} class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
                                    <button onclick={() => productsPage = Math.min(productsTotalPages, productsPage + 1)} disabled={productsPage >= productsTotalPages} class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
                                </div>
                            </div>
                        {/if}
                    {/if}
                {:else}
                    <!-- Top Customers -->
                    {#if topCustomers.length === 0}
                        <div class="h-60 flex items-center justify-center">
                            <div class="text-center text-gray-400">
                                <Users class="w-16 h-16 mx-auto mb-4" />
                                <p class="text-lg font-medium">{t("reports.noCustomerData")}</p>
                            </div>
                        </div>
                    {:else}
                        <div class="space-y-4">
                            {#each pagedCustomers as customer, index}
                                <div class="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                    <div class="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center font-bold text-purple-600">
                                        {customer.rank || (customersPage - 1) * PAGE_SIZE + index + 1}
                                    </div>
                                    <div class="flex-1">
                                        <p class="font-medium text-gray-900 dark:text-white">{customer.name}</p>
                                        <p class="text-sm text-gray-500">{customer.phone || "-"}</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="font-bold text-gray-900 dark:text-white">{formatCurrency(customer.totalSpent)}</p>
                                        <p class="text-sm text-gray-500">{customer.visitCount} {t("reports.times")}</p>
                                    </div>
                                </div>
                            {/each}
                        </div>
                        {#if topCustomers.length > 0}
                            <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <span class="text-sm text-gray-500">{t("common.page")} {customersPage}/{customersTotalPages}</span>
                                <div class="flex gap-2">
                                    <button onclick={() => customersPage = Math.max(1, customersPage - 1)} disabled={customersPage <= 1} class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
                                    <button onclick={() => customersPage = Math.min(customersTotalPages, customersPage + 1)} disabled={customersPage >= customersTotalPages} class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
                                </div>
                            </div>
                        {/if}
                    {/if}
                {/if}
            </div>
        </div>

        <!-- Quick Links — R-09: fixed icons, R-12: POSPOS-style categories -->
        <div class="mt-6">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{t("reports.subReports")}</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <a href="/reports/products" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:shadow-sm transition-all group">
                    <BarChart3 class="w-7 h-7 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                    <p class="font-medium text-gray-900 dark:text-white text-sm">{t("reports.products")}</p>
                    <p class="text-xs text-gray-400 mt-0.5">ຍອດຂາຍ · ສ່ວນແບ່ງ</p>
                </a>
                <a href="/reports/inventory" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-teal-400 hover:shadow-sm transition-all group">
                    <Package class="w-7 h-7 text-teal-500 mb-2 group-hover:scale-110 transition-transform" />
                    <p class="font-medium text-gray-900 dark:text-white text-sm">{t("reports.inventory")}</p>
                    <p class="text-xs text-gray-400 mt-0.5">ສາງ · ສ່ຽງໝົດ</p>
                </a>
                <a href="/reports/staff" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-purple-400 hover:shadow-sm transition-all group">
                    <Users class="w-7 h-7 text-purple-500 mb-2 group-hover:scale-110 transition-transform" />
                    <p class="font-medium text-gray-900 dark:text-white text-sm">{t("reports.staff")}</p>
                    <p class="text-xs text-gray-400 mt-0.5">ຜົນງານ · ຍົກເລີກ</p>
                </a>
                <a href="/reports/customers" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-pink-400 hover:shadow-sm transition-all group">
                    <Users class="w-7 h-7 text-pink-500 mb-2 group-hover:scale-110 transition-transform" />
                    <p class="font-medium text-gray-900 dark:text-white text-sm">{t("reports.customers")}</p>
                    <p class="text-xs text-gray-400 mt-0.5">VIP · ໃໝ່ · ຄ້ຳ</p>
                </a>
                <a href="/reports/financial" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-success-400 hover:shadow-sm transition-all group">
                    <DollarSign class="w-7 h-7 text-success-500 mb-2 group-hover:scale-110 transition-transform" />
                    <p class="font-medium text-gray-900 dark:text-white text-sm">{t("reports.financial")}</p>
                    <p class="text-xs text-gray-400 mt-0.5">ລາຍຮັບ · ຕົ້ນທຶນ</p>
                </a>
                <a href="/reports/promotions" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-orange-400 hover:shadow-sm transition-all group">
                    <Wallet class="w-7 h-7 text-orange-500 mb-2 group-hover:scale-110 transition-transform" />
                    <p class="font-medium text-gray-900 dark:text-white text-sm">{t("reports.promotions")}</p>
                    <p class="text-xs text-gray-400 mt-0.5">ຄູປ໋ອງ · ຍົດໃຊ້</p>
                </a>
                <a href="/reports/period-compare" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:shadow-sm transition-all group">
                    <Calendar class="w-7 h-7 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
                    <p class="font-medium text-gray-900 dark:text-white text-sm">{t("reports.periodCompare")}</p>
                    <p class="text-xs text-gray-400 mt-0.5">ໄຕມາດ · ເດືອນ</p>
                </a>
                <a href="/reports/branch-compare" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-teal-400 hover:shadow-sm transition-all group">
                    <Building2 class="w-7 h-7 text-teal-500 mb-2 group-hover:scale-110 transition-transform" />
                    <p class="font-medium text-gray-900 dark:text-white text-sm">ປຽບທຽບສາຂາ</p>
                    <p class="text-xs text-gray-400 mt-0.5">ຍອດຂາຍ · ສາຂາ</p>
                </a>
                <a href="/reports/gl" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-violet-400 hover:shadow-sm transition-all group">
                    <BookOpen class="w-7 h-7 text-violet-500 mb-2 group-hover:scale-110 transition-transform" />
                    <p class="font-medium text-gray-900 dark:text-white text-sm">GL / ການກວດກາ</p>
                    <p class="text-xs text-gray-400 mt-0.5">P&L · Audit Trail</p>
                </a>
            </div>
        </div>
    {/if}
</div>

<!-- Click outside to close export menu -->
{#if showExportMenu}
    <button
        type="button"
        aria-label="Close export menu"
        class="fixed inset-0 z-40"
        onclick={() => showExportMenu = false}
    ></button>
{/if}
