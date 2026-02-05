<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { i18n, t } from "$lib/i18n/index.svelte";
    import { themeStore, auth } from "$stores";
    import { api } from "$api";
    import { cn } from "$utils";
    import StoreBranchSelector from "$lib/components/StoreBranchSelector.svelte";
    import {
        TrendingUp,
        TrendingDown,
        DollarSign,
        ShoppingCart,
        Users,
        Package,
        AlertTriangle,
        Clock,
        BarChart3,
        PieChart,
        ArrowUpRight,
        ArrowDownRight,
        RefreshCw,
    } from "lucide-svelte";
    import { Chart, registerables } from "chart.js";
    
    // Register Chart.js components
    Chart.register(...registerables);

    // Dashboard state
    let isLoading = $state(true);
    let error = $state("");
    let lastUpdated = $state<Date | null>(null);
    
    // Chart references
    let salesChartEl: HTMLCanvasElement | null = null;
    let salesChart: Chart | null = null;
    let chartPeriod = $state<'today' | 'week' | 'month'>('week');

    // Dashboard data
    let salesSummary = $state({
        todaySales: 0,
        todayOrders: 0,
        todayCustomers: 0,
        avgOrderValue: 0,
        salesGrowth: 0,
        ordersGrowth: 0,
        customersGrowth: 0,
    });

    let recentTransactions = $state<any[]>([]);
    let topProducts = $state<any[]>([]);
    let lowStockAlerts = $state<any[]>([]);
    let hourlyData = $state<{ hour: string; sales: number }[]>([]);

    // Quick stats cards
    const statsCards = $derived([
        {
            title: t("dashboard.todaySales"),
            value: formatCurrency(salesSummary.todaySales),
            change: salesSummary.salesGrowth,
            icon: DollarSign,
            color: "text-green-500",
            bgColor: "bg-green-50 dark:bg-green-900/20",
        },
        {
            title: t("dashboard.todayOrders"),
            value: salesSummary.todayOrders.toString(),
            change: salesSummary.ordersGrowth,
            icon: ShoppingCart,
            color: "text-blue-500",
            bgColor: "bg-blue-50 dark:bg-blue-900/20",
        },
        {
            title: t("dashboard.todayCustomers"),
            value: salesSummary.todayCustomers.toString(),
            change: salesSummary.customersGrowth,
            icon: Users,
            color: "text-purple-500",
            bgColor: "bg-purple-50 dark:bg-purple-900/20",
        },
        {
            title: t("dashboard.avgOrderValue"),
            value: formatCurrency(salesSummary.avgOrderValue),
            change: 0,
            icon: BarChart3,
            color: "text-orange-500",
            bgColor: "bg-orange-50 dark:bg-orange-900/20",
        },
    ]);

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
        error = "";

        try {
            // Load all dashboard data in parallel
            const [summaryRes, transactionsRes, productsRes, alertsRes, chartRes] =
                await Promise.all([
                    api
                        .get("dashboard/stats")
                        .json()
                        .catch(() => null),
                    api
                        .get("dashboard/recent-transactions")
                        .json()
                        .catch(() => ({ data: [] })),
                    api
                        .get("dashboard/top-products")
                        .json()
                        .catch(() => ({ data: [] })),
                    api
                        .get("dashboard/low-stock")
                        .json()
                        .catch(() => ({ data: [] })),
                    api
                        .get("dashboard/sales-chart?period=7days")
                        .json()
                        .catch(() => ({ data: [] })),
                ]);

            if ((summaryRes as any)?.data) {
                const data = (summaryRes as any).data;
                salesSummary = {
                    todaySales: data.todaySales || 0,
                    todayOrders: data.todayOrders || 0,
                    todayCustomers: data.totalCustomers || 0,
                    avgOrderValue: data.avgOrderValue || 0,
                    salesGrowth: 0,
                    ordersGrowth: 0,
                    customersGrowth: 0,
                };
            }

            // Transform transactions data from API format
            const rawTransactions = (transactionsRes as any)?.data || [];
            recentTransactions = rawTransactions.map((tx: any) => ({
                id: tx.transactionNo || tx.id,
                time: tx.createdAt || new Date(),
                total: tx.total || 0,
                items: tx.items?.length || tx.itemCount || 0,
                paymentMethod: tx.paymentMethod || 'cash',
            }));

            // Transform top products data from API format  
            const rawProducts = (productsRes as any)?.data || [];
            topProducts = rawProducts.map((p: any) => ({
                name: p.name,
                sold: p.totalQuantity || p.sold || 0,
                revenue: p.totalRevenue || p.revenue || 0,
            }));

            lowStockAlerts = (alertsRes as any)?.data || [];
            lastUpdated = new Date();

            // Load chart data from API or use sample data
            const chartData = (chartRes as any)?.data || [];
            if (chartData.length > 0) {
                hourlyData = chartData.map((d: any) => ({
                    hour: d.date?.split('T')[0] || d.date,
                    sales: d.total || 0,
                }));
            } else {
                // Generate sample hourly data for chart if no data
                hourlyData = Array.from({ length: 7 }, (_, i) => {
                    const date = new Date();
                    date.setDate(date.getDate() - (6 - i));
                    return {
                        hour: date.toLocaleDateString('lo-LA', { weekday: 'short' }),
                        sales: Math.floor(Math.random() * 100000) + 50000,
                    };
                });
            }
        } catch (e) {
            console.error("Dashboard load error:", e);
            // Use sample data for demo
            salesSummary = {
                todaySales: 125680,
                todayOrders: 48,
                todayCustomers: 35,
                avgOrderValue: 2618,
                salesGrowth: 12.5,
                ordersGrowth: 8.3,
                customersGrowth: 5.2,
            };

            recentTransactions = [
                {
                    id: "TXN001",
                    time: new Date(),
                    total: 1250,
                    items: 3,
                    paymentMethod: "cash",
                },
                {
                    id: "TXN002",
                    time: new Date(),
                    total: 3480,
                    items: 5,
                    paymentMethod: "card",
                },
                {
                    id: "TXN003",
                    time: new Date(),
                    total: 890,
                    items: 2,
                    paymentMethod: "promptpay",
                },
            ];

            topProducts = [
                { name: "ກາເຟລາເຕ້", sold: 45, revenue: 4050000 },
                { name: "ເອັສເປຣສໂຊ່", sold: 38, revenue: 2280000 },
                { name: "ຄາປູຊີໂນ່", sold: 32, revenue: 3200000 },
                { name: "ຊາຂຽວ", sold: 28, revenue: 2240000 },
                { name: "ໂມກກາ", sold: 25, revenue: 2750000 },
            ];

            lowStockAlerts = [
                { name: "ນົມສົດ", currentStock: 5, minStock: 10 },
                { name: "ນ້ຳຕານ", currentStock: 2, minStock: 5 },
                { name: "ຈອກພລາສຕິກ", currentStock: 50, minStock: 100 },
            ];

            // Sample chart data for 7 days
            hourlyData = Array.from({ length: 7 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (6 - i));
                return {
                    hour: date.toLocaleDateString('lo-LA', { weekday: 'short' }),
                    sales: Math.floor(Math.random() * 100000) + 50000,
                };
            });
        } finally {
            isLoading = false;
            lastUpdated = new Date();
            // Update chart after data loads
            updateSalesChart();
        }
    }
    
    function updateSalesChart() {
        if (!salesChartEl) return;
        
        // Destroy existing chart
        if (salesChart) {
            salesChart.destroy();
            salesChart = null;
        }
        
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#9ca3af' : '#6b7280';
        const gridColor = isDark ? '#374151' : '#e5e7eb';
        
        salesChart = new Chart(salesChartEl, {
            type: 'bar',
            data: {
                labels: hourlyData.map(d => d.hour),
                datasets: [{
                    label: t("dashboard.sales"),
                    data: hourlyData.map(d => d.sales),
                    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.8)' : 'rgba(99, 102, 241, 0.6)',
                    borderColor: 'rgb(99, 102, 241)',
                    borderWidth: 1,
                    borderRadius: 6,
                    hoverBackgroundColor: 'rgb(99, 102, 241)',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false,
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1f2937' : '#fff',
                        titleColor: isDark ? '#fff' : '#111827',
                        bodyColor: isDark ? '#d1d5db' : '#4b5563',
                        borderColor: isDark ? '#374151' : '#e5e7eb',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: (context) => formatCurrency(context.raw as number),
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false,
                        },
                        ticks: {
                            color: textColor,
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: gridColor,
                        },
                        ticks: {
                            color: textColor,
                            callback: (value) => {
                                if (typeof value === 'number') {
                                    return (value / 1000).toFixed(0) + 'K';
                                }
                                return value;
                            }
                        }
                    }
                }
            }
        });
    }
    
    async function handlePeriodChange(period: 'today' | 'week' | 'month') {
        chartPeriod = period;
        // Reload chart data with new period
        try {
            const periodMap = {
                'today': '1day',
                'week': '7days',
                'month': '30days'
            };
            const chartRes = await api.get(`dashboard/sales-chart?period=${periodMap[period]}`).json<any>().catch(() => ({ data: [] }));
            const chartData = chartRes.data || [];
            
            if (chartData.length > 0) {
                hourlyData = chartData.map((d: any) => ({
                    hour: d.date?.split('T')[0] || d.date,
                    sales: d.total || 0,
                }));
            }
            updateSalesChart();
        } catch (e) {
            console.error('Failed to load chart data:', e);
        }
    }

    onMount(() => {
        loadDashboardData();

        // Auto refresh every 5 minutes
        const interval = setInterval(loadDashboardData, 5 * 60 * 1000);
        return () => {
            clearInterval(interval);
            if (salesChart) {
                salesChart.destroy();
            }
        };
    });
    
    onDestroy(() => {
        if (salesChart) {
            salesChart.destroy();
        }
    });
</script>

<svelte:head>
    <title>{t("dashboard.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6"
    >
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {t("dashboard.title")}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t("dashboard.subtitle")}
            </p>
        </div>
        <div class="flex items-center gap-3 mt-4 sm:mt-0">
            <StoreBranchSelector on:change={() => loadDashboardData()} />
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

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {#each statsCards as card}
            <div
                class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
            >
                <div class="flex items-center justify-between">
                    <div class={cn("p-3 rounded-lg", card.bgColor)}>
                        <card.icon class={cn("w-6 h-6", card.color)} />
                    </div>
                    {#if card.change !== 0}
                        <div
                            class={cn(
                                "flex items-center text-sm font-medium",
                                card.change > 0
                                    ? "text-green-500"
                                    : "text-red-500",
                            )}
                        >
                            {#if card.change > 0}
                                <ArrowUpRight class="w-4 h-4 mr-1" />
                            {:else}
                                <ArrowDownRight class="w-4 h-4 mr-1" />
                            {/if}
                            {Math.abs(card.change).toFixed(1)}%
                        </div>
                    {/if}
                </div>
                <div class="mt-4">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {card.title}
                    </p>
                    <p
                        class="text-2xl font-bold text-gray-900 dark:text-white mt-1"
                    >
                        {card.value}
                    </p>
                </div>
            </div>
        {/each}
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Sales Chart -->
        <div
            class="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
        >
            <div class="flex items-center justify-between mb-6">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {t("dashboard.salesChart")}
                </h2>
                <select
                    bind:value={chartPeriod}
                    onchange={(e) => handlePeriodChange(e.currentTarget.value as 'today' | 'week' | 'month')}
                    class="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                    <option value="today">{t("dashboard.today")}</option>
                    <option value="week">{t("dashboard.thisWeek")}</option>
                    <option value="month">{t("dashboard.thisMonth")}</option>
                </select>
            </div>

            <!-- Chart.js Canvas -->
            <div class="h-64 relative">
                <canvas bind:this={salesChartEl}></canvas>
            </div>
        </div>

        <!-- Top Products -->
        <div
            class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
        >
            <h2
                class="text-lg font-semibold text-gray-900 dark:text-white mb-4"
            >
                {t("dashboard.topProducts")}
            </h2>
            <div class="space-y-4">
                {#each topProducts.slice(0, 5) as product, i}
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <span
                                class={cn(
                                    "w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium",
                                    i === 0
                                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                        : i === 1
                                          ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                          : i === 2
                                            ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                            : "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
                                )}
                            >
                                {i + 1}
                            </span>
                            <div>
                                <p
                                    class="text-sm font-medium text-gray-900 dark:text-white"
                                >
                                    {product.name}
                                </p>
                                <p
                                    class="text-xs text-gray-500 dark:text-gray-400"
                                >
                                    {product.sold}
                                    {t("dashboard.sold")}
                                </p>
                            </div>
                        </div>
                        <span
                            class="text-sm font-semibold text-gray-900 dark:text-white"
                        >
                            {formatCurrency(product.revenue)}
                        </span>
                    </div>
                {/each}
            </div>
        </div>
    </div>

    <!-- Second Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <!-- Recent Transactions -->
        <div
            class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
        >
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {t("dashboard.recentTransactions")}
                </h2>
                <a
                    href="/pos"
                    class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                    {t("common.viewAll")}
                </a>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr
                            class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase"
                        >
                            <th class="pb-3">{t("dashboard.transactionId")}</th>
                            <th class="pb-3">{t("dashboard.time")}</th>
                            <th class="pb-3">{t("dashboard.items")}</th>
                            <th class="pb-3 text-right"
                                >{t("dashboard.total")}</th
                            >
                        </tr>
                    </thead>
                    <tbody
                        class="divide-y divide-gray-100 dark:divide-gray-700"
                    >
                        {#each recentTransactions.slice(0, 5) as txn}
                            <tr class="text-sm">
                                <td
                                    class="py-3 font-medium text-gray-900 dark:text-white"
                                >
                                    {txn.id}
                                </td>
                                <td
                                    class="py-3 text-gray-500 dark:text-gray-400"
                                >
                                    {formatTime(txn.time)}
                                </td>
                                <td
                                    class="py-3 text-gray-500 dark:text-gray-400"
                                >
                                    {txn.items}
                                </td>
                                <td
                                    class="py-3 text-right font-medium text-gray-900 dark:text-white"
                                >
                                    {formatCurrency(txn.total)}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Low Stock Alerts -->
        <div
            class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
        >
            <div class="flex items-center justify-between mb-4">
                <h2
                    class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
                >
                    <AlertTriangle class="w-5 h-5 text-orange-500" />
                    {t("dashboard.lowStockAlerts")}
                </h2>
                <a
                    href="/inventory"
                    class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                    {t("common.viewAll")}
                </a>
            </div>
            {#if lowStockAlerts.length === 0}
                <div
                    class="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400"
                >
                    <Package class="w-12 h-12 mb-2 opacity-50" />
                    <p>{t("dashboard.noAlerts")}</p>
                </div>
            {:else}
                <div class="space-y-3">
                    {#each lowStockAlerts as alert}
                        <div
                            class="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
                        >
                            <div>
                                <p
                                    class="text-sm font-medium text-gray-900 dark:text-white"
                                >
                                    {alert.name}
                                </p>
                                <p
                                    class="text-xs text-gray-500 dark:text-gray-400"
                                >
                                    {t("dashboard.minStock")}: {alert.minStock}
                                </p>
                            </div>
                            <div class="text-right">
                                <p
                                    class="text-lg font-bold text-orange-600 dark:text-orange-400"
                                >
                                    {alert.currentStock}
                                </p>
                                <p
                                    class="text-xs text-gray-500 dark:text-gray-400"
                                >
                                    {t("dashboard.remaining")}
                                </p>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>
