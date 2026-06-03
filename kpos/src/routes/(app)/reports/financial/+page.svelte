<script lang="ts">
    import { onMount } from "svelte";
    import { cn, formatCurrency } from "$utils";
    import { api } from "$api";
    import { t } from "$lib/i18n/index.svelte";
    import { auth } from "$stores";
    import { toast } from "svelte-sonner";
    import {
        DollarSign,
        Loader2,
        Download,
        TrendingUp,
        TrendingDown,
        CreditCard,
        Banknote,
        Wallet,
        PieChart,
        ArrowUpRight,
        ArrowDownRight,
        Receipt,
        Coins,
        FileSpreadsheet,
        FileType,
        FileText,
        ChevronDown,
    } from "lucide-svelte";

    // State
    let periodFilter = $state("month");
    let isLoading = $state(true);
    let showExportMenu = $state(false);
    let exporting = $state(false);

    // Data
    let financialData = $state<any>({
        revenue: 0,
        expenses: 0,
        profit: 0,
        profitMargin: 0,
        previousRevenue: 0,
        previousExpenses: 0,
        taxCollected: 0,
        discountsGiven: 0,
        paymentMethods: [],
        dailyData: [],
    });

    // Stats calculations
    let revenueChange = $derived(financialData.previousRevenue > 0 ? ((financialData.revenue - financialData.previousRevenue) / financialData.previousRevenue * 100).toFixed(1) : 0);
    let expenseChange = $derived(financialData.previousExpenses > 0 ? ((financialData.expenses - financialData.previousExpenses) / financialData.previousExpenses * 100).toFixed(1) : 0);

    // Pagination for daily data
    const DAILY_PAGE_SIZE = 15;
    let dailyPage = $state(1);
    let pagedDailyData = $derived((financialData.dailyData || []).slice((dailyPage - 1) * DAILY_PAGE_SIZE, dailyPage * DAILY_PAGE_SIZE));
    let dailyTotalPages = $derived(Math.max(1, Math.ceil((financialData.dailyData || []).length / DAILY_PAGE_SIZE)));

    $effect(() => { periodFilter; dailyPage = 1; });

    async function loadData() {
        isLoading = true;
        try {
            const res = await api.get(`reports/financial?period=${periodFilter}`).json<any>();
            financialData = res.data || {};
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            isLoading = false;
        }
    }

    function getPaymentIcon(method: string) {
        switch (method) {
            case "cash": return Banknote;
            case "card": return CreditCard;
            case "mobile": return Wallet;
            default: return Coins;
        }
    }

    function getPaymentColor(method: string) {
        switch (method) {
            case "cash": return "text-success-600 dark:text-success-400 bg-success-100 dark:bg-success-900/50";
            case "card": return "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50";
            case "mobile": return "text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50";
            default: return "text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700";
        }
    }

    let prevPeriod = $state(periodFilter);

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });

    $effect(() => {
        if (periodFilter !== prevPeriod) {
            prevPeriod = periodFilter;
            loadData();
        }
    });

    // Export functions
    function exportToExcel() {
        exporting = true;
        showExportMenu = false;
        try {
            let csv = '\ufeff';
            csv += 'ລາຍການ,ຈຳນວນ\n';
            csv += `ລາຍຮັບ,"${formatCurrency(financialData.revenue || 0)}"\n`;
            csv += `ລາຍຈ່າຍ,"${formatCurrency(financialData.expenses || 0)}"\n`;
            csv += `ກຳໄລ,"${formatCurrency(financialData.profit || 0)}"\n`;
            csv += `ອັດຕາກຳໄລ,"${(financialData.profitMargin || 0).toFixed(1)}%"\n`;
            csv += '\nວິທີການຊຳລະ,ຍອດ,ຈຳນວນ\n';
            (financialData.paymentMethods || []).forEach((p: any) => {
                csv += `"${p.methodName || ''}","${formatCurrency(p.total || 0)}",${p.count || 0}\n`;
            });
            downloadFile(csv, `financial-report-${periodFilter}.csv`, 'text/csv;charset=utf-8');
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
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t("reports.financial")}</title>
<style>body{font-family:'Noto Sans Lao','Phetsarath OT',sans-serif;padding:20px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:8px}th{background:#f5f5f5}.text-right{text-align:right}</style></head>
<body><h1>${t("reports.financial")}</h1><p style="text-align:center">${new Date().toLocaleDateString('lo-LA')}</p>
<table><tr><th>ລາຍການ</th><th>ຈຳນວນ</th></tr>
<tr><td>ລາຍຮັບ</td><td class="text-right">${formatCurrency(financialData.revenue || 0)}</td></tr>
<tr><td>ລາຍຈ່າຍ</td><td class="text-right">${formatCurrency(financialData.expenses || 0)}</td></tr>
<tr><td>ກຳໄລ</td><td class="text-right">${formatCurrency(financialData.profit || 0)}</td></tr>
<tr><td>ອັດຕາກຳໄລ</td><td class="text-right">${(financialData.profitMargin || 0).toFixed(1)}%</td></tr></table>
<h2>ວິທີການຊຳລະ</h2><table><tr><th>ວິທີ</th><th>ຍອດ</th><th>ຈຳນວນ</th></tr>
${(financialData.paymentMethods || []).map((p: any) => `<tr><td>${p.methodName || ''}</td><td class="text-right">${formatCurrency(p.total || 0)}</td><td class="text-right">${p.count || 0}</td></tr>`).join('')}
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
<body><h1 style="text-align:center">${t("reports.financial")}</h1><p style="text-align:center">${new Date().toLocaleDateString('lo-LA')}</p>
<table><tr><th>ລາຍການ</th><th>ຈຳນວນ</th></tr>
<tr><td>ລາຍຮັບ</td><td>${formatCurrency(financialData.revenue || 0)}</td></tr>
<tr><td>ລາຍຈ່າຍ</td><td>${formatCurrency(financialData.expenses || 0)}</td></tr>
<tr><td>ກຳໄລ</td><td>${formatCurrency(financialData.profit || 0)}</td></tr>
<tr><td>ອັດຕາກຳໄລ</td><td>${(financialData.profitMargin || 0).toFixed(1)}%</td></tr></table>
<h2>ວິທີການຊຳລະ</h2><table><tr><th>ວິທີ</th><th>ຍອດ</th><th>ຈຳນວນ</th></tr>
${(financialData.paymentMethods || []).map((p: any) => `<tr><td>${p.methodName || ''}</td><td>${formatCurrency(p.total || 0)}</td><td>${p.count || 0}</td></tr>`).join('')}
</table></body></html>`;
        downloadFile(html, `financial-report-${periodFilter}.doc`, 'application/msword');
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
    <title>{t("reports.financial")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-success-500 to-emerald-600 rounded-xl shadow-lg">
                    <DollarSign class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{t("reports.financial")}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{t("reports.financialDesc")}</p>
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

    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-success-500 animate-spin" />
        </div>
    {:else}
        <!-- Main Stats -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-gradient-to-br from-success-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
                <div class="flex items-center justify-between">
                    <div class="p-2 bg-white/20 rounded-lg">
                        <TrendingUp class="w-6 h-6" />
                    </div>
                    {#if Number(revenueChange) > 0}
                        <span class="inline-flex items-center gap-1 text-sm bg-white/20 px-2 py-1 rounded-full">
                            <ArrowUpRight class="w-4 h-4" /> +{revenueChange}%
                        </span>
                    {:else if Number(revenueChange) < 0}
                        <span class="inline-flex items-center gap-1 text-sm bg-white/20 px-2 py-1 rounded-full">
                            <ArrowDownRight class="w-4 h-4" /> {revenueChange}%
                        </span>
                    {/if}
                </div>
                <p class="text-white/80 text-sm mt-4">ລາຍຮັບ</p>
                <p class="text-2xl font-bold mt-1">{formatCurrency(financialData.revenue)}</p>
            </div>

            <div class="bg-gradient-to-br from-danger-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg">
                <div class="flex items-center justify-between">
                    <div class="p-2 bg-white/20 rounded-lg">
                        <TrendingDown class="w-6 h-6" />
                    </div>
                    {#if Number(expenseChange) > 0}
                        <span class="inline-flex items-center gap-1 text-sm bg-white/20 px-2 py-1 rounded-full">
                            <ArrowUpRight class="w-4 h-4" /> +{expenseChange}%
                        </span>
                    {:else if Number(expenseChange) < 0}
                        <span class="inline-flex items-center gap-1 text-sm bg-white/20 px-2 py-1 rounded-full">
                            <ArrowDownRight class="w-4 h-4" /> {expenseChange}%
                        </span>
                    {/if}
                </div>
                <p class="text-white/80 text-sm mt-4">ລາຍຈ່າຍ</p>
                <p class="text-2xl font-bold mt-1">{formatCurrency(financialData.expenses)}</p>
            </div>

            <div class="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
                <div class="flex items-center justify-between">
                    <div class="p-2 bg-white/20 rounded-lg">
                        <Wallet class="w-6 h-6" />
                    </div>
                </div>
                <p class="text-white/80 text-sm mt-4">ກຳໄລ</p>
                <p class="text-2xl font-bold mt-1">{formatCurrency(financialData.profit)}</p>
            </div>

            <div class="bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl p-5 text-white shadow-lg">
                <div class="flex items-center justify-between">
                    <div class="p-2 bg-white/20 rounded-lg">
                        <PieChart class="w-6 h-6" />
                    </div>
                </div>
                <p class="text-white/80 text-sm mt-4">ອັດຕາກຳໄລ</p>
                <p class="text-2xl font-bold mt-1">{financialData.profitMargin || 0}%</p>
            </div>
        </div>

        <!-- Tax & Discount row -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 flex items-center gap-4">
                <div class="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                    <Receipt class="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ພາສີລວມ</p>
                    <p class="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(financialData.taxCollected || 0)}</p>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 flex items-center gap-4">
                <div class="p-3 bg-rose-100 dark:bg-rose-900/30 rounded-xl">
                    <TrendingDown class="w-6 h-6 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ສ່ວນຫຼຸດລວມ</p>
                    <p class="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(financialData.discountsGiven || 0)}</p>
                </div>
            </div>
        </div>

        <div class="grid md:grid-cols-2 gap-6">
            <!-- Payment Methods -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">ວິທີຊຳລະ</h3>
                <div class="space-y-4">
                    {#each financialData.paymentMethods || [] as method (method.type)}
                        {@const Icon = getPaymentIcon(method.type)}
                        {@const colorClass = getPaymentColor(method.type)}
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class={cn("p-2 rounded-lg", colorClass)}>
                                    <Icon class="w-5 h-5" />
                                </div>
                                <div>
                                    <p class="font-medium text-gray-900 dark:text-white">{method.label || method.methodName || method.type || 'ອື່ນໆ'}</p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">{method.count || 0} ລາຍການ</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="font-bold text-gray-900 dark:text-white">{formatCurrency(method.total || method.amount || 0)}</p>
                                <p class="text-sm text-gray-500 dark:text-gray-400">{method.percentage || 0}%</p>
                            </div>
                        </div>
                    {/each}
                    {#if (financialData.paymentMethods || []).length === 0}
                        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
                            <Receipt class="w-12 h-12 mx-auto opacity-50" />
                            <p class="mt-2">ບໍ່ມີຂໍ້ມູນ</p>
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Daily Summary -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">ສະຫຼຸບລາຍວັນ</h3>
                <div class="space-y-3">
                    {#each pagedDailyData as day (day.date)}
                        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                            <div>
                                <p class="font-medium text-gray-900 dark:text-white">{day.date}</p>
                                <p class="text-sm text-gray-500 dark:text-gray-400">{day.transactions || 0} ລາຍການ</p>
                            </div>
                            <div class="text-right">
                                <p class="font-bold text-success-600 dark:text-success-400">{formatCurrency(day.revenue)}</p>
                                <p class="text-sm text-danger-500">{formatCurrency(day.expenses)}</p>
                            </div>
                        </div>
                    {/each}
                    {#if (financialData.dailyData || []).length === 0}
                        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
                            <PieChart class="w-12 h-12 mx-auto opacity-50" />
                            <p class="mt-2">ບໍ່ມີຂໍ້ມູນ</p>
                        </div>
                    {/if}
                </div>
                {#if (financialData.dailyData || []).length > 0}
                    <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <span class="text-sm text-gray-500">ໜ້າ {dailyPage}/{dailyTotalPages} · {(financialData.dailyData || []).length} ວັນ</span>
                        <div class="flex gap-2">
                            <button onclick={() => dailyPage = Math.max(1, dailyPage - 1)} disabled={dailyPage <= 1} class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
                            <button onclick={() => dailyPage = Math.min(dailyTotalPages, dailyPage + 1)} disabled={dailyPage >= dailyTotalPages} class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
