<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { auth } from "$stores";
    import { api } from "$api";
    import { cn } from "$utils";
    import StoreBranchSelector from "$lib/components/StoreBranchSelector.svelte";
    import {
        DollarSign,
        ShoppingCart,
        Package,
        AlertTriangle,
        Clock,
        BarChart3,
        ArrowUpRight,
        ArrowDownRight,
        RefreshCw,
        CreditCard,
        Award,
        XCircle,
        RotateCcw,
    } from "lucide-svelte";
    import { Chart, registerables } from "chart.js";

    Chart.register(...registerables);

    let isLoading = $state(true);
    let loadError = $state("");
    let lastUpdated = $state<Date | null>(null);

    let salesChartEl: HTMLCanvasElement | null = null;
    let salesChart: Chart | null = null;
    let chartPeriod = $state<"today" | "week" | "month">("week");

    let stats = $state<Record<string, any>>({});
    let recentTransactions = $state<any[]>([]);

    function formatCurrency(amount: number): string {
        return (
            new Intl.NumberFormat("lo-LA", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            }).format(amount) + " ₭"
        );
    }

    function formatTime(date: Date | string): string {
        return new Intl.DateTimeFormat("lo-LA", {
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(date));
    }

    async function loadDashboardData() {
        isLoading = true;
        loadError = "";
        try {
            const branchParam = auth.activeBranchId
                ? `branchId=${auth.activeBranchId}`
                : "";

            const [statsRes, txRes] = await Promise.all([
                api
                    .get(
                        `dashboard/stats${branchParam ? "?" + branchParam : ""}`,
                    )
                    .json()
                    .catch(() => null),
                api
                    .get(
                        `dashboard/recent-transactions${branchParam ? "?" + branchParam : ""}`,
                    )
                    .json()
                    .catch(() => ({ data: [] })),
            ]);

            if ((statsRes as any)?.data) {
                stats = (statsRes as any).data;
            }

            const rawTx = (txRes as any)?.data;
            recentTransactions = Array.isArray(rawTx)
                ? rawTx.map((tx: any) => ({
                      id: tx.transactionNo || tx.id,
                      time: tx.createdAt || new Date(),
                      total: tx.total || 0,
                      items: tx.itemCount || tx.items?.length || 0,
                      type: tx.type || "SALE",
                      status: tx.status || "COMPLETED",
                      customerName: tx.customer?.name || null,
                      cashierName: tx.user?.name || null,
                  }))
                : [];

            lastUpdated = new Date();
            updateSalesChart();
        } catch (e) {
            console.error("Dashboard load error:", e);
            loadError = String(e);
        } finally {
            isLoading = false;
            lastUpdated = new Date();
        }
    }

    async function handlePeriodChange(period: "today" | "week" | "month") {
        chartPeriod = period;
        if (period === "week") {
            updateSalesChart();
            return;
        }
        try {
            const periodMap = { today: "1day", week: "7days", month: "30days" };
            const res = await api
                .get(`dashboard/sales-chart?period=${periodMap[period]}`)
                .json<any>()
                .catch(() => ({ data: [] }));
            const data = (res.data || []).map((d: any) => ({
                date: d.date?.split("T")[0] || d.date,
                amount: d.total || 0,
                orders: 0,
            }));
            updateSalesChart(data);
        } catch (e) {
            console.error("Chart load error:", e);
        }
    }

    function updateSalesChart(
        customData?: { date: string; amount: number; orders: number }[],
    ) {
        if (!salesChartEl) return;
        if (salesChart) {
            salesChart.destroy();
            salesChart = null;
        }

        const chartData: { date: string; amount: number; orders: number }[] =
            customData ??
            (stats.last7DaysSales || []).map((d: any) => ({
                date: d.date,
                amount: d.amount,
                orders: d.orders,
            }));

        const isDark = document.documentElement.classList.contains("dark");
        const textColor = isDark ? "#9ca3af" : "#6b7280";
        const gridColor = isDark ? "#374151" : "#e5e7eb";

        salesChart = new Chart(salesChartEl, {
            type: "bar",
            data: {
                labels: chartData.map((d) => d.date),
                datasets: [
                    {
                        label: t("dashboard.sales"),
                        data: chartData.map((d) => d.amount),
                        backgroundColor: isDark
                            ? "rgba(99, 102, 241, 0.8)"
                            : "rgba(99, 102, 241, 0.6)",
                        borderColor: "rgb(99, 102, 241)",
                        borderWidth: 1,
                        borderRadius: 6,
                        hoverBackgroundColor: "rgb(99, 102, 241)",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? "#1f2937" : "#fff",
                        titleColor: isDark ? "#fff" : "#111827",
                        bodyColor: isDark ? "#d1d5db" : "#4b5563",
                        borderColor: isDark ? "#374151" : "#e5e7eb",
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: (ctx) =>
                                formatCurrency(ctx.raw as number),
                        },
                    },
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: textColor } },
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            callback: (v) =>
                                typeof v === "number"
                                    ? (v / 1000).toFixed(0) + "K"
                                    : v,
                        },
                    },
                },
            },
        });
    }

    $effect(() => {
        const _storeId = auth.activeStoreId;
        loadDashboardData();
    });

    onMount(() => {
        const interval = setInterval(() => {
            if (!document.hidden) loadDashboardData();
        }, 5 * 60 * 1000);

        function handleVisibility() {
            if (!document.hidden) loadDashboardData();
        }
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibility);
            if (salesChart) salesChart.destroy();
        };
    });

    onDestroy(() => {
        if (salesChart) salesChart.destroy();
    });
</script>

<svelte:head>
    <title>{t("dashboard.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {t("dashboard.title")}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t("dashboard.subtitle")}
            </p>
        </div>
        <div class="flex items-center gap-3 mt-4 sm:mt-0">
            <StoreBranchSelector onchange={() => loadDashboardData()} />
            {#if lastUpdated}
                <span class="text-xs text-gray-500 dark:text-gray-400">
                    {t("dashboard.lastUpdated")}: {formatTime(lastUpdated)}
                </span>
            {/if}
            <button
                onclick={() => loadDashboardData()}
                disabled={isLoading}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    "bg-primary-600 text-white hover:bg-primary-700",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
            >
                <RefreshCw class={cn("w-4 h-4", isLoading && "animate-spin")} />
                {t("common.refresh")}
            </button>
        </div>
    </div>

    <!-- Error Alert -->
    {#if loadError}
        <div class="mb-6 p-4 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-xl flex items-center gap-3">
            <AlertTriangle class="w-5 h-5 text-danger-500 shrink-0" />
            <div class="flex-1">
                <p class="text-sm font-medium text-danger-800 dark:text-danger-200">{t("common.error")}</p>
                <p class="text-xs text-danger-600 dark:text-danger-400 mt-1">{loadError}</p>
            </div>
            <button
                onclick={() => { loadError = ""; loadDashboardData(); }}
                class="text-sm text-danger-600 dark:text-danger-400 hover:underline"
            >{t("common.retry")}</button>
        </div>
    {/if}

    <!-- Row 1: 4 KPI Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <!-- Today Sales -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
            <div class="flex items-center justify-between mb-3">
                <div class="p-2.5 rounded-lg bg-success-50 dark:bg-success-900/20">
                    <DollarSign class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                {#if stats.salesGrowthPct !== undefined && stats.salesGrowthPct !== 0}
                    <div class={cn("flex items-center text-xs font-semibold px-2 py-1 rounded-full",
                        stats.salesGrowthPct > 0
                            ? "text-success-700 bg-success-50 dark:text-success-400 dark:bg-success-900/20"
                            : "text-danger-700 bg-danger-50 dark:text-danger-400 dark:bg-danger-900/20"
                    )}>
                        {#if stats.salesGrowthPct > 0}
                            <ArrowUpRight class="w-3 h-3 mr-0.5" />
                        {:else}
                            <ArrowDownRight class="w-3 h-3 mr-0.5" />
                        {/if}
                        {Math.abs(stats.salesGrowthPct).toFixed(1)}%
                    </div>
                {/if}
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.todaySales")}</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                {formatCurrency(stats.todaySales || 0)}
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                vs {formatCurrency(stats.yesterdaySales || 0)} {t("dashboard.yesterday")}
            </p>
        </div>

        <!-- Today Orders -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
            <div class="flex items-center justify-between mb-3">
                <div class="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <ShoppingCart class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                {#if stats.avgOrderValue}
                    <span class="text-xs text-gray-400 dark:text-gray-500">
                        ø {formatCurrency(stats.avgOrderValue)}
                    </span>
                {/if}
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.todayOrders")}</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                {new Intl.NumberFormat("lo-LA").format(stats.todayOrders || 0)}
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {new Intl.NumberFormat("lo-LA").format(stats.totalCustomers || 0)} {t("dashboard.todayCustomers")}
            </p>
        </div>

        <!-- MTD Sales -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
            <div class="flex items-center justify-between mb-3">
                <div class="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                    <BarChart3 class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                {#if stats.mtdGrowthPct !== undefined && stats.mtdGrowthPct !== 0}
                    <div class={cn("flex items-center text-xs font-semibold px-2 py-1 rounded-full",
                        stats.mtdGrowthPct > 0
                            ? "text-success-700 bg-success-50 dark:text-success-400 dark:bg-success-900/20"
                            : "text-danger-700 bg-danger-50 dark:text-danger-400 dark:bg-danger-900/20"
                    )}>
                        {#if stats.mtdGrowthPct > 0}
                            <ArrowUpRight class="w-3 h-3 mr-0.5" />
                        {:else}
                            <ArrowDownRight class="w-3 h-3 mr-0.5" />
                        {/if}
                        {Math.abs(stats.mtdGrowthPct).toFixed(1)}%
                    </div>
                {/if}
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.mtdSales")}</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                {formatCurrency(stats.monthToDateSales || 0)}
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                vs {formatCurrency(stats.lastMonthSales || 0)} {t("dashboard.lastMonth")}
            </p>
        </div>

        <!-- Net Revenue -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
            <div class="flex items-center justify-between mb-3">
                <div class="p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                    <CreditCard class="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                {#if stats.lowStockCount > 0}
                    <span class="text-xs font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                        <AlertTriangle class="w-3 h-3" />{stats.lowStockCount}
                    </span>
                {/if}
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.netRevenue")}</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                {formatCurrency(stats.netRevenue || 0)}
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {new Intl.NumberFormat("lo-LA").format(stats.totalProducts || 0)} {t("dashboard.products")}
            </p>
        </div>
    </div>

    <!-- Row 2: Sales Chart + Payment Methods -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <!-- Sales Chart -->
        <div class="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white">
                    {t("dashboard.salesChart")}
                </h2>
                <select
                    bind:value={chartPeriod}
                    onchange={(e) => handlePeriodChange(e.currentTarget.value as "today" | "week" | "month")}
                    class="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                    <option value="today">{t("dashboard.today")}</option>
                    <option value="week">{t("dashboard.thisWeek")}</option>
                    <option value="month">{t("dashboard.thisMonth")}</option>
                </select>
            </div>
            <div class="relative min-h-[256px] h-64">
                <canvas bind:this={salesChartEl}></canvas>
            </div>
        </div>

        <!-- Payment Methods -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4">
                {t("dashboard.paymentMethods")}
            </h2>
            {#if (stats.revenueByPaymentMethod || []).length === 0}
                <div class="flex flex-col items-center justify-center h-40 text-gray-400 dark:text-gray-500">
                    <CreditCard class="w-10 h-10 mb-2 opacity-40" />
                    <p class="text-sm">{t("dashboard.noData")}</p>
                </div>
            {:else}
                <div class="space-y-3">
                    {#each stats.revenueByPaymentMethod as pm}
                        <div>
                            <div class="flex justify-between text-sm mb-1">
                                <span class="font-medium text-gray-700 dark:text-gray-300 capitalize">{pm.method}</span>
                                <span class="text-gray-500 dark:text-gray-400">{pm.pct}%</span>
                            </div>
                            <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                                <div
                                    class="bg-primary-500 h-2 rounded-full transition-all"
                                    style="width: {pm.pct}%"
                                ></div>
                            </div>
                            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">{formatCurrency(pm.amount)}</p>
                        </div>
                    {/each}
                </div>
            {/if}

            <!-- Void/Refund summary -->
            {#if (stats.voidCount || 0) + (stats.refundCount || 0) > 0}
                <div class="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
                    {#if stats.voidCount > 0}
                        <div class="flex justify-between items-center text-sm">
                            <span class="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                                <XCircle class="w-4 h-4 text-danger-400" />
                                {t("dashboard.voids")} ({stats.voidCount})
                            </span>
                            <span class="text-danger-500 font-medium">{formatCurrency(stats.voidAmount || 0)}</span>
                        </div>
                    {/if}
                    {#if stats.refundCount > 0}
                        <div class="flex justify-between items-center text-sm">
                            <span class="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                                <RotateCcw class="w-4 h-4 text-orange-400" />
                                {t("dashboard.refunds")} ({stats.refundCount})
                            </span>
                            <span class="text-orange-500 font-medium">{formatCurrency(stats.refundAmount || 0)}</span>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>

    <!-- Row 3: Top Products + Recent Transactions -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <!-- Top Products -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4">
                {t("dashboard.topProducts")}
            </h2>
            {#if (stats.topProducts || []).length === 0}
                <div class="flex flex-col items-center justify-center h-40 text-gray-400 dark:text-gray-500">
                    <Package class="w-10 h-10 mb-2 opacity-40" />
                    <p class="text-sm">{t("dashboard.noSalesToday")}</p>
                </div>
            {:else}
                <div class="space-y-3">
                    {#each stats.topProducts as product, i}
                        <div class="flex items-center gap-3">
                            <span class={cn(
                                "w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold shrink-0",
                                i === 0 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                : i === 1 ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                : i === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                : "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                            )}>{i + 1}</span>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{product.name}</p>
                                <p class="text-xs text-gray-400 dark:text-gray-500">{product.qtySold} {t("dashboard.sold")}</p>
                            </div>
                            <span class="text-sm font-semibold text-gray-900 dark:text-white shrink-0">
                                {formatCurrency(product.revenue)}
                            </span>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Recent Transactions -->
        <div class="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white">
                    {t("dashboard.recentTransactions")}
                </h2>
                <a href="/pos" class="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                    {t("common.viewAll")}
                </a>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="text-left text-xs text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-700">
                            <th class="pb-2">{t("dashboard.transactionId")}</th>
                            <th class="pb-2">{t("dashboard.time")}</th>
                            <th class="pb-2">{t("dashboard.items")}</th>
                            <th class="pb-2 text-right">{t("dashboard.total")}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {#each recentTransactions.slice(0, 8) as txn (txn.id)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                <td class="py-2.5">
                                    <span class="font-medium text-gray-900 dark:text-white">{txn.id}</span>
                                    {#if txn.type === "REFUND"}
                                        <span class="ml-1 text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">refund</span>
                                    {:else if txn.status === "VOIDED"}
                                        <span class="ml-1 text-xs px-1.5 py-0.5 rounded bg-danger-100 text-danger-600 dark:bg-danger-900/30 dark:text-danger-400">void</span>
                                    {/if}
                                </td>
                                <td class="py-2.5 text-gray-500 dark:text-gray-400">{formatTime(txn.time)}</td>
                                <td class="py-2.5 text-gray-500 dark:text-gray-400">{txn.items}</td>
                                <td class="py-2.5 text-right font-semibold text-gray-900 dark:text-white">
                                    {formatCurrency(txn.total)}
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="4" class="py-10 text-center text-gray-400 dark:text-gray-500">
                                    <Clock class="w-8 h-8 mx-auto mb-2 opacity-40" />
                                    <p class="text-sm">{t('dashboard.noRecentTransactions')}</p>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Row 4: Low Stock Alerts + Top Cashier -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Low Stock Alerts -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <AlertTriangle class="w-4 h-4 text-orange-500" />
                    {t("dashboard.lowStockAlerts")}
                    {#if stats.lowStockCount > 0}
                        <span class="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 font-semibold">
                            {stats.lowStockCount}
                        </span>
                    {/if}
                </h2>
                <a href="/inventory" class="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                    {t("common.viewAll")}
                </a>
            </div>
            {#if (stats.lowStockItems || []).length === 0}
                <div class="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
                    <Package class="w-10 h-10 mb-2 opacity-40" />
                    <p class="text-sm">{t("dashboard.noAlerts")}</p>
                </div>
            {:else}
                <div class="space-y-2">
                    {#each stats.lowStockItems as item}
                        <div class="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-100 dark:border-orange-900/30">
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                                <p class="text-xs text-gray-400 dark:text-gray-500">{t("dashboard.minStock")}: {item.minQty}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-lg font-bold text-orange-600 dark:text-orange-400">{item.qty}</p>
                                <p class="text-xs text-gray-400 dark:text-gray-500">{t("dashboard.remaining")}</p>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Top Cashier -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Award class="w-4 h-4 text-yellow-500" />
                {t("dashboard.topCashier")}
            </h2>
            {#if stats.topCashier}
                <div class="flex items-center gap-4 p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-100 dark:border-yellow-900/30 mb-6">
                    <div class="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center shrink-0">
                        <span class="text-lg font-bold text-yellow-700 dark:text-yellow-400">
                            {stats.topCashier.name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                    </div>
                    <div class="flex-1">
                        <p class="font-semibold text-gray-900 dark:text-white">{stats.topCashier.name}</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            {new Intl.NumberFormat("lo-LA").format(stats.topCashier.orderCount)} {t("dashboard.orders")}
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-gray-900 dark:text-white">{formatCurrency(stats.topCashier.totalSales)}</p>
                        <p class="text-xs text-gray-400 dark:text-gray-500">{t("dashboard.totalSales")}</p>
                    </div>
                </div>
            {:else}
                <div class="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500 mb-4">
                    <Award class="w-10 h-10 mb-2 opacity-40" />
                    <p class="text-sm">{t("dashboard.noSalesToday")}</p>
                </div>
            {/if}

            <!-- Summary stats row -->
            <div class="grid grid-cols-2 gap-3">
                <div class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                    <p class="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.products")}</p>
                    <p class="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                        {new Intl.NumberFormat("lo-LA").format(stats.totalProducts || 0)}
                    </p>
                </div>
                <div class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                    <p class="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.todayCustomers")}</p>
                    <p class="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                        {new Intl.NumberFormat("lo-LA").format(stats.totalCustomers || 0)}
                    </p>
                </div>
            </div>
        </div>
    </div>
</div>
