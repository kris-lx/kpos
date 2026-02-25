<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatNumber, formatDate } from "$lib/utils";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Search, Loader2, X, Plus, Minus, User, TrendingUp, TrendingDown, Gift, ArrowUpRight, ArrowDownRight, Sparkles, AlertCircle, RefreshCw, ChevronLeft, ChevronRight } from "lucide-svelte";
    const t = i18n.t;

    let pointsHistory = $state<any[]>([]);
    let customers = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let searchQuery = $state("");
    let selectedCustomer = $state<any>(null);
    let showAdjustModal = $state(false);
    let isSaving = $state(false);
    let adjustForm = $state({
        customerId: "",
        points: 0,
        type: "add",
        reason: "",
    });

    // Pagination
    let currentPage = $state(1);
    let pageSize = $state(20);
    let totalItems = $state(0);
    const pageSizeOptions = [5, 10, 20, 30, 50, 70, 100];
    let searchTimeout: ReturnType<typeof setTimeout>;

    const pointsConfig = $state({
        earnRate: 1, // 1 point per 1000 LAK
        redeemRate: 100, // 100 points = 1000 LAK
        minRedeem: 100,
        expiryDays: 365,
    });

    onMount(() => {
        loadCustomers();
    });

    async function loadCustomers() {
        loading = true;
        error = null;
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: pageSize.toString(),
            });
            if (searchQuery) params.append('search', searchQuery);
            const response = await api.get(`customers?${params}`).json<any>();
            if (response.success) {
                customers = response.data || [];
                totalItems = response.meta?.total || response.pagination?.total || customers.length;
            } else {
                error = "ບໍ່ສາມາດໂຫຼດຂໍ້ມູນລູກຄ້າໄດ້";
                customers = [];
                totalItems = 0;
                toast.error("ບໍ່ສາມາດໂຫຼດຂໍ້ມູນລູກຄ້າໄດ້");
            }
        } catch (err) {
            console.error("Failed to load customers:", err);
            error = "ເກີດຂໍ້ຜິດພາດໃນການໂຫຼດຂໍ້ມູນລູກຄ້າ";
            customers = [];
            totalItems = 0;
            toast.error("ເກີດຂໍ້ຜິດພາດໃນການໂຫຼດຂໍ້ມູນລູກຄ້າ");
        } finally {
            loading = false;
        }
    }

    function handleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadCustomers();
        }, 300);
    }

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadCustomers();
        }
    }

    function changePageSize(size: number) {
        pageSize = size;
        currentPage = 1;
        loadCustomers();
    }

    async function loadPointsHistory(customerId: string) {
        try {
            const response = await api
                .get(`customers/${customerId}/points/history`)
                .json<any>();
            if (response.success) {
                pointsHistory = response.data || [];
            } else {
                pointsHistory = [];
                toast.error("ບໍ່ສາມາດໂຫຼດປະຫວັດຄະແນນໄດ້");
            }
        } catch (err) {
            console.error("Failed to load points history:", err);
            pointsHistory = [];
            toast.error("ບໍ່ສາມາດໂຫຼດປະຫວັດຄະແນນໄດ້");
        }
    }

    function selectCustomer(customer: any) {
        selectedCustomer = customer;
        loadPointsHistory(customer.id);
    }

    function openAdjustModal(customer: any) {
        adjustForm = {
            customerId: customer.id,
            points: 0,
            type: "add",
            reason: "",
        };
        showAdjustModal = true;
    }

    async function saveAdjustment() {
        const points = adjustForm.type === "add" ? adjustForm.points : -adjustForm.points;
        isSaving = true;
        try {
            await api.post(`customers/${adjustForm.customerId}/points/adjust`, {
                json: {
                    points,
                    reason: adjustForm.reason,
                },
            });
            toast.success("ປັບຄະແນນສຳເລັດ");
            showAdjustModal = false;
            loadCustomers();
            if (selectedCustomer?.id === adjustForm.customerId) {
                loadPointsHistory(adjustForm.customerId);
            }
        } catch (error) {
            console.error("Failed to adjust points:", error);
            toast.error("ບໍ່ສາມາດປັບຄະແນນໄດ້");
        } finally {
            isSaving = false;
        }
    }

    function getTypeLabel(type: string): string {
        const labels: Record<string, string> = {
            earn: "ໄດ້ຮັບ",
            redeem: "ແລກໃຊ້",
            bonus: "ໂບນັດ",
            adjust: "ປັບແກ້",
            expire: "ໝົດອາຍຸ",
        };
        return labels[type] || type;
    }

    function getTypeColor(type: string): string {
        const colors: Record<string, string> = {
            earn: "text-green-600",
            redeem: "text-orange-600",
            bonus: "text-purple-600",
            adjust: "text-blue-600",
            expire: "text-red-600",
        };
        return colors[type] || "text-gray-600";
    }

    let totalPages = $derived(Math.ceil(totalItems / pageSize) || 1);
</script>

<svelte:head>
    <title>ຄະແນນສະສົມ - KPOS</title>
</svelte:head>

<div class="p-6">
    <div class="flex justify-between items-center mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ຄະແນນສະສົມ</h1>
            <p class="text-gray-500 dark:text-gray-400">ຈັດການຄະແນນສະສົມລູກຄ້າ</p>
        </div>
    </div>

    <!-- Points Summary -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <div class="flex items-center gap-2">
                <User class="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <p class="text-sm text-gray-500 dark:text-gray-400">ລູກຄ້າທີ່ມີຄະແນນ</p>
            </div>
            <p class="text-2xl font-bold text-primary-600">
                {formatNumber(customers.length)}
            </p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <div class="flex items-center gap-2">
                <Sparkles class="h-4 w-4 text-green-500" />
                <p class="text-sm text-gray-500 dark:text-gray-400">ຄະແນນທັງໝົດໃນລະບົບ</p>
            </div>
            <p class="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatNumber(customers.reduce((sum, c) => sum + (c.points || 0), 0))}
            </p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <div class="flex items-center gap-2">
                <TrendingUp class="h-4 w-4 text-blue-500" />
                <p class="text-sm text-gray-500 dark:text-gray-400">ອັດຕາໄດ້ຮັບ</p>
            </div>
            <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {pointsConfig.earnRate} ຄະແນນ/1,000₭
            </p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <div class="flex items-center gap-2">
                <Gift class="h-4 w-4 text-orange-500" />
                <p class="text-sm text-gray-500 dark:text-gray-400">ອັດຕາແລກ</p>
            </div>
            <p class="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {pointsConfig.redeemRate} ຄະແນນ = 1,000₭
            </p>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Customer List -->
        <div class="lg:col-span-1 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
            <div class="p-4 border-b dark:border-gray-700">
                <div class="relative">
                    <Search class="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        bind:value={searchQuery}
                        oninput={handleSearch}
                        placeholder="ຄົ້ນຫາລູກຄ້າ..."
                        class="w-full pl-10 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                    />
                </div>
            </div>

            {#if loading}
                <div class="flex justify-center py-8">
                    <Loader2 class="h-6 w-6 animate-spin text-primary-600" />
                </div>
            {:else if error}
                <div class="text-center py-8 px-4">
                    <AlertCircle class="h-10 w-10 mx-auto text-red-500 dark:text-red-400 mb-3" />
                    <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">{error}</p>
                    <button
                        onclick={loadCustomers}
                        class="flex items-center gap-2 mx-auto px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
                    >
                        <RefreshCw class="h-3 w-3" />
                        ລອງໃໝ່
                    </button>
                </div>
            {:else}
                <div class="divide-y dark:divide-gray-700 max-h-[500px] overflow-y-auto">
                    {#each customers as customer (customer.id)}
                        <button
                            onclick={() => selectCustomer(customer)}
                            class="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors {selectedCustomer?.id === customer.id
                                ? 'bg-primary-50 dark:bg-primary-900/30 border-l-4 border-primary-600'
                                : ''}"
                        >
                            <div class="flex justify-between items-start">
                                <div>
                                    <p class="font-medium text-gray-900 dark:text-white">
                                        {customer.name}
                                    </p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">
                                        {customer.phone}
                                    </p>
                                </div>
                                <div class="text-right">
                                    <p class="font-bold text-primary-600">
                                        {formatNumber(customer.points || 0)}
                                    </p>
                                    <p class="text-xs text-gray-400">ຄະແນນ</p>
                                </div>
                            </div>
                        </button>
                    {/each}
                </div>
                <!-- Pagination -->
                {#if totalItems > pageSize}
                    <div class="p-3 border-t dark:border-gray-700 flex items-center justify-between">
                        <select value={pageSize} onchange={(e) => changePageSize(Number(e.currentTarget.value))} class="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                            {#each pageSizeOptions as size (size)}
                                <option value={size}>{size}</option>
                            {/each}
                        </select>
                        <div class="flex items-center gap-1">
                            <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} class="p-1 rounded disabled:opacity-50">
                                <ChevronLeft class="w-4 h-4" />
                            </button>
                            <span class="text-xs text-gray-500 dark:text-gray-400">{currentPage}/{totalPages}</span>
                            <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} class="p-1 rounded disabled:opacity-50">
                                <ChevronRight class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                {/if}
            {/if}
        </div>

        <!-- Points Details -->
        <div class="lg:col-span-2">
            {#if selectedCustomer}
                <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                    <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                        <div>
                            <h3 class="font-semibold text-lg text-gray-900 dark:text-white">
                                {selectedCustomer.name}
                            </h3>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                {selectedCustomer.phone}
                            </p>
                        </div>
                        <button
                            onclick={() => openAdjustModal(selectedCustomer)}
                            class="flex items-center gap-1 px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
                        >
                            <Plus class="h-4 w-4" />
                            ປັບຄະແນນ
                        </button>
                    </div>

                    <div class="p-4 grid grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                        <div class="text-center">
                            <p class="text-2xl font-bold text-primary-600">
                                {formatNumber(selectedCustomer.points || 0)}
                            </p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">ຄະແນນປັດຈຸບັນ</p>
                        </div>
                        <div class="text-center">
                            <p class="text-2xl font-bold text-green-600 dark:text-green-400">
                                ₭{formatNumber(selectedCustomer.totalSpent || 0)}
                            </p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">ຈຳນວນທຸລະກຳ</p>
                        </div>
                        <div class="text-center">
                            <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                ₭{formatNumber(selectedCustomer.totalSpent || 0)}
                            </p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">
                                ຍອດໃຊ້ຈ່າຍທັງໝົດ
                            </p>
                        </div>
                    </div>

                    <div class="p-4">
                        <h4 class="font-medium mb-3 text-gray-900 dark:text-white">ປະຫວັດຄະແນນ</h4>
                        <div class="space-y-2 max-h-[300px] overflow-y-auto">
                            {#each pointsHistory as history (history.id)}
                                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                    <div class="flex items-center gap-3">
                                        <span class="w-8 h-8 flex items-center justify-center rounded-full {history.points > 0 ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/50'}">
                                            {#if history.points > 0}
                                                <ArrowUpRight class="h-4 w-4 text-green-600 dark:text-green-400" />
                                            {:else}
                                                <ArrowDownRight class="h-4 w-4 text-red-600 dark:text-red-400" />
                                            {/if}
                                        </span>
                                        <div>
                                            <p class="text-sm font-medium text-gray-900 dark:text-white">
                                                {history.reason}
                                            </p>
                                            <p class="text-xs text-gray-500 dark:text-gray-400">
                                                {formatDate(history.createdAt || history.date)}
                                                {#if history.orderId}
                                                    · {history.orderId}
                                                {/if}
                                            </p>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <p class="font-bold {getTypeColor(history.type)}">
                                            {history.points > 0 ? "+" : ""}{formatNumber(history.points)}
                                        </p>
                                        <p class="text-xs text-gray-400">
                                            {getTypeLabel(history.type)}
                                        </p>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            {:else}
                <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-12 text-center">
                    <User class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
                    <p class="mt-4 text-gray-500 dark:text-gray-400">
                        ເລືອກລູກຄ້າເພື່ອເບິ່ງລາຍລະອຽດຄະແນນ
                    </p>
                </div>
            {/if}
        </div>
    </div>
</div>

{#if showAdjustModal}
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">ປັບຄະແນນ</h2>
                <button onclick={() => (showAdjustModal = false)} class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <X class="h-6 w-6" />
                </button>
            </div>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ປະເພດ</label>
                    <div class="flex gap-4">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" bind:group={adjustForm.type} value="add" class="text-primary-600" />
                            <Plus class="h-4 w-4 text-green-500" />
                            <span class="text-gray-700 dark:text-gray-300">ເພີ່ມ</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" bind:group={adjustForm.type} value="deduct" class="text-primary-600" />
                            <Minus class="h-4 w-4 text-red-500" />
                            <span class="text-gray-700 dark:text-gray-300">ຫັກ</span>
                        </label>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຈຳນວນຄະແນນ</label>
                    <input
                        type="number"
                        bind:value={adjustForm.points}
                        min="0"
                        class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເຫດຜົນ</label>
                    <textarea
                        bind:value={adjustForm.reason}
                        rows="3"
                        class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                        placeholder="ລະບຸເຫດຜົນໃນການປັບຄະແນນ"
                    ></textarea>
                </div>
            </div>
            <div class="flex justify-end gap-3 mt-6">
                <button
                    onclick={() => (showAdjustModal = false)}
                    class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                    ຍົກເລີກ
                </button>
                <button
                    onclick={saveAdjustment}
                    disabled={isSaving}
                    class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                    {#if isSaving}
                        <Loader2 class="h-4 w-4 animate-spin" />
                    {/if}
                    ບັນທຶກ
                </button>
            </div>
        </div>
    </div>
{/if}
