<script lang="ts">
    import { onMount } from "svelte";
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { auth } from "$stores";
    import { formatCurrency, formatDate, formatDateTime } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import MoneyInput from "$lib/components/MoneyInput.svelte";
    import {
        CreditCard,
        Search,
        ChevronLeft,
        ChevronRight,
        FileText,
        AlertCircle,
        RefreshCw,
        Loader2,
    } from "lucide-svelte";
    const t = i18n.t;

    let creditSales = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showPaymentModal = $state(false);
    let selectedSale = $state<any>(null);
    let paymentAmount = $state(0);
    let filterStatus = $state("all");
    let searchQuery = $state("");

    // Pagination state
    let currentPage = $state(1);
    let rowsPerPage = $state(10);

    onMount(() => {
        loadCreditSales();
    });

    async function ensureAuthReady(): Promise<boolean> {
        if (auth.isAuthenticated) return true;
        if (!auth.user) return false;
        return auth.refresh();
    }

    function isAuthError(err: unknown): boolean {
        const status = (err as { response?: { status?: number } })?.response?.status;
        return status === 401 || status === 403;
    }

    async function loadCreditSales() {
        loading = true;
        error = null;
        try {
            if (!(await ensureAuthReady())) return;
            const response = await api.get("sales/credit").json<any>();
            if (response.success) {
                creditSales = response.data || [];
            } else {
                error = t('common.loadError');
                creditSales = [];
            }
        } catch (err) {
            if (isAuthError(err)) return;
            console.error("Failed to load credit sales:", err);
            error = t('common.loadError');
            creditSales = [];
            toast.error(t('common.genericError'));
        } finally {
            loading = false;
        }
    }

    let filteredSales = $derived(
        creditSales.filter((sale) => {
            const matchesStatus =
                filterStatus === "all" || sale.status === filterStatus;
            const matchesSearch =
                !searchQuery ||
                sale.receiptNo
                    ?.toLowerCase()
                    .includes(searchQuery.toLowerCase()) ||
                sale.customer?.name
                    ?.toLowerCase()
                    .includes(searchQuery.toLowerCase()) ||
                sale.customer?.phone
                    ?.toLowerCase()
                    .includes(searchQuery.toLowerCase());
            return matchesStatus && matchesSearch;
        }),
    );

    // Reset to page 1 when filters change
    $effect(() => {
        searchQuery;
        filterStatus;
        currentPage = 1;
    });

    // Pagination derived values
    let totalPages = $derived(Math.ceil(filteredSales.length / rowsPerPage) || 1);
    let paginatedSales = $derived(
        filteredSales.slice(
            (currentPage - 1) * rowsPerPage,
            currentPage * rowsPerPage
        )
    );

    let stats = $derived({
        totalCredit: creditSales.reduce((sum, s) => sum + (s.total || 0), 0),
        totalPaid: creditSales.reduce((sum, s) => sum + (s.paid || 0), 0),
        totalRemaining: creditSales.reduce((sum, s) => sum + (s.remaining || 0), 0),
        overdueCount: creditSales.filter((s) => s.status === "overdue").length,
    });

    function openPayment(sale: any) {
        selectedSale = sale;
        paymentAmount = sale.remaining;
        showPaymentModal = true;
    }

    async function recordPayment() {
        try {
            await api.post(`sales/credit/${selectedSale.id}/payment`, {
                json: { amount: paymentAmount },
            });
            showPaymentModal = false;
            toast.success("ບັນທຶກການຊຳລະສຳເລັດ");
            loadCreditSales();
        } catch (err) {
            console.error("Failed to record payment:", err);
            toast.error("ບັນທຶກການຊຳລະບໍ່ສຳເລັດ");
        }
    }

    function getStatusLabel(status: string): string {
        const labels: Record<string, string> = {
            pending: "ຍັງບໍ່ຊຳລະ",
            partial: "ຊຳລະບາງສ່ວນ",
            paid: "ຊຳລະແລ້ວ",
            overdue: "ເກີນກຳນົດ",
        };
        return labels[status] || status;
    }

    function getStatusColor(status: string): string {
        const colors: Record<string, string> = {
            pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
            partial: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
            paid: "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400",
            overdue: "bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400",
        };
        return colors[status] || "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
        }
    }

    function handleRowsPerPageChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        rowsPerPage = parseInt(target.value);
        currentPage = 1;
    }
</script>

<svelte:head>
    <title>ຂາຍເຊື່ອ - KPOS</title>
</svelte:head>

<div class="p-6 dark:bg-gray-900 min-h-screen">
    <div
        class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6"
    >
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ຂາຍເຊື່ອ</h1>
            <p class="text-gray-500 dark:text-gray-400">ຈັດການລາຍການຂາຍເຊື່ອ</p>
        </div>
        <button
            onclick={loadCreditSales}
            disabled={loading}
            class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-primary-500 dark:hover:bg-primary-600"
        >
            <RefreshCw class="w-4 h-4 {loading ? 'animate-spin' : ''}" />
            ໂຫຼດໃໝ່
        </button>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <p class="text-sm text-gray-500 dark:text-gray-400">ຍອດເຊື່ອທັງໝົດ</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(stats.totalCredit)}
            </p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <p class="text-sm text-gray-500 dark:text-gray-400">ຮັບຊຳລະແລ້ວ</p>
            <p class="text-2xl font-bold text-success-600 dark:text-success-400">
                {formatCurrency(stats.totalPaid)}
            </p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <p class="text-sm text-gray-500 dark:text-gray-400">ຍັງຄ້າງຊຳລະ</p>
            <p class="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {formatCurrency(stats.totalRemaining)}
            </p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <p class="text-sm text-gray-500 dark:text-gray-400">ເກີນກຳນົດ</p>
            <p class="text-2xl font-bold text-danger-600 dark:text-danger-400">
                {stats.overdueCount} ລາຍການ
            </p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-6">
        <div class="flex flex-col sm:flex-row gap-4">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="ຄົ້ນຫາເລກບິນ ຫຼື ຊື່ລູກຄ້າ..."
                    class="w-full pl-10 pr-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                />
            </div>
            <select
                bind:value={filterStatus}
                class="px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
                <option value="all">ທັງໝົດ</option>
                <option value="pending">ຍັງບໍ່ຊຳລະ</option>
                <option value="partial">ຊຳລະບາງສ່ວນ</option>
                <option value="paid">ຊຳລະແລ້ວ</option>
                <option value="overdue">ເກີນກຳນົດ</option>
            </select>
        </div>
    </div>

    {#if loading}
        <div class="flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
            <Loader2 class="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin" />
            <p class="mt-4 text-gray-500 dark:text-gray-400">ກຳລັງໂຫຼດຂໍ້ມູນ...</p>
        </div>
    {:else if error}
        <div class="flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
            <AlertCircle class="w-12 h-12 text-danger-500 dark:text-danger-400" />
            <p class="mt-4 text-gray-700 dark:text-gray-300 font-medium">{error}</p>
            <button
                onclick={loadCreditSales}
                class="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
            >
                ລອງໃໝ່
            </button>
        </div>
    {:else if filteredSales.length === 0}
        <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
            <FileText class="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
            <p class="mt-4 text-gray-500 dark:text-gray-400">
                {#if creditSales.length === 0}
                    ບໍ່ມີລາຍການຂາຍເຊື່ອ
                {:else}
                    ບໍ່ພົບຂໍ້ມູນທີ່ຄົ້ນຫາ
                {/if}
            </p>
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead class="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                                >ເລກບິນ</th
                            >
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                                >ລູກຄ້າ</th
                            >
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                                >ຍອດເງິນ</th
                            >
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                                >ຊຳລະແລ້ວ</th
                            >
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                                >ຄ້າງຊຳລະ</th
                            >
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                                >ກຳນົດ</th
                            >
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                                >ສະຖານະ</th
                            >
                            <th
                                class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                            ></th>
                        </tr>
                    </thead>
                    <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {#each paginatedSales as sale (sale.id)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <p class="font-medium text-gray-900 dark:text-white">
                                        {sale.receiptNo}
                                    </p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">
                                        {formatDate(sale.createdAt)}
                                    </p>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <p class="text-gray-900 dark:text-white">
                                        {sale.customer?.name || '-'}
                                    </p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">
                                        {sale.customer?.phone || '-'}
                                    </p>
                                </td>
                                <td
                                    class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white"
                                >
                                    {formatCurrency(sale.total || 0)}
                                </td>
                                <td
                                    class="px-6 py-4 whitespace-nowrap text-sm text-success-600 dark:text-success-400"
                                >
                                    {formatCurrency(sale.paid || 0)}
                                </td>
                                <td
                                    class="px-6 py-4 whitespace-nowrap text-sm font-medium text-orange-600 dark:text-orange-400"
                                >
                                    {formatCurrency(sale.remaining || 0)}
                                </td>
                                <td
                                    class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300"
                                >
                                    {formatDate(sale.dueDate)}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <span
                                        class="px-2 py-1 text-xs rounded {getStatusColor(
                                            sale.status,
                                        )}"
                                    >
                                        {getStatusLabel(sale.status)}
                                    </span>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-right">
                                    {#if sale.remaining > 0}
                                        <button
                                            onclick={() => openPayment(sale)}
                                            class="flex items-center gap-1 px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
                                        >
                                            <CreditCard class="w-4 h-4" />
                                            ຮັບຊຳລະ
                                        </button>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <!-- Pagination -->
            <div class="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t dark:border-gray-700">
                <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span>ສະແດງ</span>
                    <select
                        value={rowsPerPage}
                        onchange={handleRowsPerPageChange}
                        class="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                    <span>ແຖວ | ທັງໝົດ {filteredSales.length} ລາຍການ</span>
                </div>
                <div class="flex items-center gap-2">
                    <button
                        onclick={() => goToPage(currentPage - 1)}
                        disabled={currentPage <= 1}
                        class="p-2 rounded border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400"
                    >
                        <ChevronLeft class="w-4 h-4" />
                    </button>
                    <span class="text-sm text-gray-600 dark:text-gray-400">
                        ໜ້າ {currentPage} / {totalPages}
                    </span>
                    <button
                        onclick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        class="p-2 rounded border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400"
                    >
                        <ChevronRight class="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>

{#if showPaymentModal && selectedSale}
    <div
        class="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50"
    >
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl">
            <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">ຮັບຊຳລະເງິນ</h2>

            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                    ເລກບິນ: {selectedSale.receiptNo}
                </p>
                <p class="font-medium text-gray-900 dark:text-white">{selectedSale.customer?.name || '-'}</p>
                <div class="mt-2 flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">ຍອດຄ້າງຊຳລະ:</span>
                    <span class="font-bold text-orange-600 dark:text-orange-400"
                        >{formatCurrency(selectedSale.remaining)}</span
                    >
                </div>
            </div>

            <div class="space-y-4">
                <label class="block">
                    <span class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >ຈຳນວນເງິນຮັບ (₭)</span
                    >
                    <MoneyInput
                        bind:value={paymentAmount}
                        max={selectedSale.remaining}
                        class="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </label>
                <div class="flex gap-2">
                    <button
                        onclick={() => (paymentAmount = selectedSale.remaining)}
                        class="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-500"
                    >
                        ຊຳລະເຕັມ
                    </button>
                    <button
                        onclick={() =>
                            (paymentAmount = Math.floor(
                                selectedSale.remaining / 2,
                            ))}
                        class="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-500"
                    >
                        50%
                    </button>
                </div>
            </div>

            <div class="flex justify-end gap-3 mt-6">
                <button
                    onclick={() => (showPaymentModal = false)}
                    class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                    ຍົກເລີກ
                </button>
                <button
                    onclick={recordPayment}
                    disabled={paymentAmount <= 0 ||
                        paymentAmount > selectedSale.remaining}
                    class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-primary-500 dark:hover:bg-primary-600"
                >
                    ບັນທຶກ
                </button>
            </div>
        </div>
    </div>
{/if}
