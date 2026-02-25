<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { cn, formatCurrency, formatDateTime } from "$lib/utils";
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
    } from "lucide-svelte";

    // State
    let dateRange = $state<"today" | "week" | "month" | "year">("month");
    let selectedReport = $state<"sales" | "products" | "customers">("sales");
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showExportMenu = $state(false);
    let exporting = $state(false);

    // Data
    let summary = $state<any>({});
    let salesData = $state<any[]>([]);
    let topProducts = $state<any[]>([]);
    let topCustomers = $state<any[]>([]);

    // Date range labels
    const dateRangeLabels = $derived({
        today: t("reports.today"),
        week: t("reports.thisWeek"),
        month: t("reports.thisMonth"),
        year: t("reports.thisYear"),
    });

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });

    async function loadData() {
        loading = true;
        error = null;
        try {
            const params = getDateParams();
            const now = new Date().toISOString().split("T")[0];
            const pastDate = new Date();
            switch (dateRange) {
                case "today": pastDate.setHours(0,0,0,0); break;
                case "week": pastDate.setDate(pastDate.getDate() - 7); break;
                case "year": pastDate.setFullYear(pastDate.getFullYear() - 1); break;
                default: pastDate.setMonth(pastDate.getMonth() - 1);
            }
            const fromDate = pastDate.toISOString().split("T")[0];

            const [summaryRes, salesRes, productsRes, customersRes] =
                await Promise.all([
                    api.get(`reports/summary`).json<any>().catch(() => ({ data: {} })),
                    api.get(`reports/sales?${params}`).json<any>().catch(() => ({ data: [] })),
                    api.get(`reports/top-products?${params}&limit=10`).json<any>().catch(() => ({ data: [] })),
                    api.get(`reports/customers?limit=10&from=${fromDate}&to=${now}`).json<any>().catch(() => ({ data: { topCustomers: [], summary: {} } })),
                ]);

            summary = summaryRes.data || {};
            salesData = salesRes.data || [];
            topProducts = productsRes.data || [];
            // customers endpoint returns { data: { topCustomers, summary, ... } }
            const custData = customersRes.data || {};
            topCustomers = custData.topCustomers || [];
        } catch (e) {
            console.error("Failed to load reports:", e);
            error = "ບໍ່ສາມາດໂຫຼດຂໍ້ມູນໄດ້";
        } finally {
            loading = false;
        }
    }

    function getDateParams(): string {
        const now = new Date();
        let start: Date;

        switch (dateRange) {
            case "today":
                start = new Date(now.setHours(0, 0, 0, 0));
                break;
            case "week":
                start = new Date(now);
                start.setDate(start.getDate() - 7);
                break;
            case "month":
                start = new Date(now);
                start.setMonth(start.getMonth() - 1);
                break;
            case "year":
                start = new Date(now);
                start.setFullYear(start.getFullYear() - 1);
                break;
            default:
                start = new Date(now);
                start.setMonth(start.getMonth() - 1);
        }

        return `startDate=${start.toISOString().split("T")[0]}&endDate=${new Date().toISOString().split("T")[0]}`;
    }

    $effect(() => {
        dateRange;
        auth.activeStoreId; // re-run when store switches
        loadData();
    });

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
                csv += headers.map(h => {
                    const val = row[h] ?? '';
                    return `"${String(val).replace(/"/g, '""')}"`;
                }).join(',') + '\n';
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
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
            ${data.map(row => `<tr>${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}</tr>`).join('')}
        </tbody>
    </table>
</body>
</html>`;
            
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const printWindow = window.open(url, '_blank');
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
        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        ${data.map(row => `<tr>${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}</tr>`).join('')}
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
        URL.revokeObjectURL(url);
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
            const vals = headers.map(h => `${h}: ${row[h] ?? ''}`);
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
                            <FileSpreadsheet class="w-5 h-5 text-green-600" />
                            <span>{t("reports.exportExcel")}</span>
                        </button>
                        <button
                            onclick={() => exportToPdf()}
                            class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                            <FileType class="w-5 h-5 text-red-600" />
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
            <AlertCircle class="w-12 h-12 mx-auto text-red-400" />
            <p class="mt-4 text-gray-700 dark:text-gray-300">{error}</p>
            <button
                onclick={() => loadData()}
                class="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
                {t("reports.retry")}
            </button>
        </div>
    {:else}
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <DollarSign class="w-6 h-6 text-primary-600" />
                    </div>
                    <div class="flex items-center gap-1 text-green-500 text-sm">
                        <TrendingUp class="w-4 h-4" />
                        <span>+12.5%</span>
                    </div>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("reports.totalSales")}</p>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(summary.todaySales || 0)}
                </p>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <ShoppingCart class="w-6 h-6 text-green-600" />
                    </div>
                    <div class="flex items-center gap-1 text-green-500 text-sm">
                        <TrendingUp class="w-4 h-4" />
                        <span>+8.2%</span>
                    </div>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("reports.totalOrders")}</p>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                    {summary.todayOrders || 0}
                </p>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <Package class="w-6 h-6 text-blue-600" />
                    </div>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("reports.totalProducts")}</p>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                    {summary.totalProducts || 0}
                </p>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <Users class="w-6 h-6 text-purple-600" />
                    </div>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("reports.totalCustomers")}</p>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                    {summary.totalCustomers || 0}
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
                            {#each salesData.slice(0, 10) as sale, index}
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
                            {#each topProducts as product, index}
                                <div class="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                    <div class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center font-bold text-primary-600">
                                        {product.rank || index + 1}
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
                            {#each topCustomers as customer, index}
                                <div class="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                    <div class="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center font-bold text-purple-600">
                                        {customer.rank || index + 1}
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
                    {/if}
                {/if}
            </div>
        </div>

        <!-- Quick Links -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <a href="/reports/products" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors">
                <Package class="w-8 h-8 text-blue-500 mb-3" />
                <p class="font-medium text-gray-900 dark:text-white">{t("reports.inventory")}</p>
                <p class="text-sm text-gray-500">{t("reports.inventoryDesc")}</p>
            </a>
            <a href="/reports/inventory" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors">
                <Wallet class="w-8 h-8 text-teal-500 mb-3" />
                <p class="font-medium text-gray-900 dark:text-white">{t("reports.warehouse")}</p>
                <p class="text-sm text-gray-500">{t("reports.warehouseDesc")}</p>
            </a>
            <a href="/reports/financial" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors">
                <DollarSign class="w-8 h-8 text-green-500 mb-3" />
                <p class="font-medium text-gray-900 dark:text-white">{t("reports.financial")}</p>
                <p class="text-sm text-gray-500">{t("reports.financialDesc")}</p>
            </a>
            <a href="/reports/staff" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors">
                <Users class="w-8 h-8 text-purple-500 mb-3" />
                <p class="font-medium text-gray-900 dark:text-white">{t("reports.staff")}</p>
                <p class="text-sm text-gray-500">{t("reports.staffDesc")}</p>
            </a>
        </div>
    {/if}
</div>

<!-- Click outside to close export menu -->
{#if showExportMenu}
    <button
        class="fixed inset-0 z-40"
        onclick={() => showExportMenu = false}
    ></button>
{/if}
