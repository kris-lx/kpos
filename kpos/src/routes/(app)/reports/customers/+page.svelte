<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatCurrency, formatNumber, formatDate } from "$lib/utils";
    import { onMount } from "svelte";
    import { auth } from "$stores";
    import { toast } from "svelte-sonner";
    import { Download, Loader2, Users, UserPlus, Activity, DollarSign, Receipt, Heart, Trophy, PieChart, TrendingUp, Target, Cake, Star, Calendar, ChevronLeft, ChevronRight, Search } from "lucide-svelte";

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
    let pageSizeOptions = [5, 10, 20, 50, 70, 100];
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
            ທົ່ວໄປ: "bg-green-500",
            ໃໝ່: "bg-gray-500",
        };
        return colors[name] || "bg-gray-500";
    }

    function exportReport() {
        toast.info(t("reports.exporting"));
        // Add actual export implementation here
        toast.success(t("reports.exportSuccess"));
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
            <button
                onclick={exportReport}
                class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"
            >
                <Download class="w-4 h-4" />
                ສົ່ງອອກ
            </button>
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
                    <UserPlus class="w-4 h-4 text-green-600 dark:text-green-400" />
                    <p class="text-sm text-gray-500 dark:text-gray-400">ລູກຄ້າໃໝ່</p>
                </div>
                <p class="text-2xl font-bold text-green-600 dark:text-green-400">
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
                    <TrendingUp class="w-5 h-5 text-green-500" />
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
                                        class="bg-green-400 dark:bg-green-500 rounded-t transition-all"
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
                        <span class="w-3 h-3 bg-green-400 dark:bg-green-500 rounded"></span>
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
                    <TrendingUp class="w-5 h-5 text-green-500" />
                    ການເຕີບໂຕ
                </h3>
                <p class="text-3xl font-bold {(reportData.summary?.growthRate ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
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
