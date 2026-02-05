<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn, formatCurrency, formatDate } from "$utils";
    import { api } from "$api";
    import {
        Receipt,
        Search,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Calendar,
        CreditCard,
        Banknote,
        Smartphone,
        CheckCircle,
        XCircle,
        Clock,
        Download,
        Eye,
        X,
        DollarSign,
        TrendingUp,
        ArrowDownRight,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let statusFilter = $state<string | null>(null);
    let methodFilter = $state<string | null>(null);
    let isLoading = $state(true);
    let showViewModal = $state(false);
    let selectedTransaction = $state<any>(null);
    let currentPage = $state(1);
    let itemsPerPage = $state(20);

    // Data
    let transactions = $state<any[]>([]);

    // Stats
    let stats = $derived({
        total: transactions.length,
        completed: transactions.filter((t) => t.status === "completed").length,
        pending: transactions.filter((t) => t.status === "pending").length,
        failed: transactions.filter((t) => t.status === "failed").length,
        totalAmount: transactions.filter((t) => t.status === "completed").reduce((sum, t) => sum + (t.amount || 0), 0),
    });

    function getStatusConfig(status: string) {
        switch (status) {
            case "completed":
                return { bg: "bg-green-100 dark:bg-green-900/50", text: "text-green-700 dark:text-green-400", label: "ສຳເລັດ", icon: CheckCircle };
            case "pending":
                return { bg: "bg-amber-100 dark:bg-amber-900/50", text: "text-amber-700 dark:text-amber-400", label: "ລໍຖ້າ", icon: Clock };
            case "failed":
                return { bg: "bg-red-100 dark:bg-red-900/50", text: "text-red-700 dark:text-red-400", label: "ລົ້ມເຫລວ", icon: XCircle };
            default:
                return { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", label: status, icon: Clock };
        }
    }

    function getMethodConfig(method: string) {
        switch (method) {
            case "cash":
                return { icon: Banknote, label: "ເງິນສົດ", color: "text-green-600 dark:text-green-400" };
            case "card":
                return { icon: CreditCard, label: "ບັດ", color: "text-blue-600 dark:text-blue-400" };
            case "mobile":
                return { icon: Smartphone, label: "ມືຖື", color: "text-purple-600 dark:text-purple-400" };
            default:
                return { icon: DollarSign, label: method, color: "text-gray-600 dark:text-gray-400" };
        }
    }

    async function loadData() {
        isLoading = true;
        try {
            const res = await api.get("payments/transactions").json<any>();
            transactions = res.data || [];
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            isLoading = false;
        }
    }

    function viewTransaction(tx: any) {
        selectedTransaction = tx;
        showViewModal = true;
    }

    let filteredTransactions = $derived(() => {
        return transactions.filter((tx) => {
            const matchSearch = tx.reference?.toLowerCase().includes(searchQuery.toLowerCase()) || tx.customerName?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchStatus = !statusFilter || tx.status === statusFilter;
            const matchMethod = !methodFilter || tx.paymentMethod === methodFilter;
            return matchSearch && matchStatus && matchMethod;
        });
    });

    let paginatedTransactions = $derived(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredTransactions().slice(start, start + itemsPerPage);
    });

    let totalPages = $derived(Math.ceil(filteredTransactions().length / itemsPerPage));

    onMount(() => loadData());
</script>

<svelte:head>
    <title>ລາຍການຊຳລະ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
                    <Receipt class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ລາຍການຊຳລະ</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ປະຫວັດການຊຳລະເງິນ</p>
                </div>
            </div>
        </div>

        <button class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium">
            <Download class="w-4 h-4" />
            ສົ່ງອອກ
        </button>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                    <Receipt class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ທັງໝົດ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.completed}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ສຳເລັດ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Clock class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ລໍຖ້າ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                    <XCircle class="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <span class="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ລົ້ມເຫລວ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm md:col-span-1 col-span-2">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-teal-100 dark:bg-teal-900/50 rounded-lg">
                    <TrendingUp class="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <span class="text-xl font-bold text-teal-600 dark:text-teal-400">{formatCurrency(stats.totalAmount)}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຍອດລວມ</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="text" bind:value={searchQuery} placeholder="ຄົ້ນຫາລະຫັດ, ລູກຄ້າ..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div class="flex gap-2 flex-wrap">
                <span class="text-sm text-gray-500 py-2">ສະຖານະ:</span>
                {#each [{ id: null, label: "ທັງໝົດ" }, { id: "completed", label: "ສຳເລັດ" }, { id: "pending", label: "ລໍຖ້າ" }, { id: "failed", label: "ລົ້ມເຫລວ" }] as filter}
                    <button
                        onclick={() => { statusFilter = filter.id; currentPage = 1; }}
                        class={cn("px-3 py-2 rounded-lg text-sm font-medium transition-all", statusFilter === filter.id ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
                    >
                        {filter.label}
                    </button>
                {/each}
            </div>
            <div class="flex gap-2 flex-wrap">
                <span class="text-sm text-gray-500 py-2">ວິທີ:</span>
                {#each [{ id: null, label: "ທັງໝົດ" }, { id: "cash", label: "ເງິນສົດ" }, { id: "card", label: "ບັດ" }, { id: "mobile", label: "ມືຖື" }] as filter}
                    <button
                        onclick={() => { methodFilter = filter.id; currentPage = 1; }}
                        class={cn("px-3 py-2 rounded-lg text-sm font-medium transition-all", methodFilter === filter.id ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
                    >
                        {filter.label}
                    </button>
                {/each}
            </div>
        </div>
    </div>

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-emerald-500 animate-spin" />
        </div>
    {:else if paginatedTransactions().length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <Receipt class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີລາຍການ</h3>
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ວັນທີ/ເວລາ</th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ລະຫັດ</th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ລູກຄ້າ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ວິທີຊຳລະ</th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຍອດເງິນ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ສະຖານະ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຈັດການ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each paginatedTransactions() as tx}
                            {@const statusConfig = getStatusConfig(tx.status)}
                            {@const methodConfig = getMethodConfig(tx.paymentMethod)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                        <Calendar class="w-4 h-4" />
                                        <span class="text-sm">{formatDate(tx.createdAt)}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <span class="font-mono text-sm text-gray-900 dark:text-white">{tx.reference || tx.id?.slice(-8)}</span>
                                </td>
                                <td class="px-6 py-4 text-gray-600 dark:text-gray-400">{tx.customerName || "-"}</td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-center gap-2">
                                        <svelte:component this={methodConfig.icon} class={cn("w-4 h-4", methodConfig.color)} />
                                        <span class={cn("text-sm", methodConfig.color)}>{methodConfig.label}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-bold text-gray-900 dark:text-white">{formatCurrency(tx.amount)}</span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span class={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium", statusConfig.bg, statusConfig.text)}>
                                        <svelte:component this={statusConfig.icon} class="w-3.5 h-3.5" />
                                        {statusConfig.label}
                                    </span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <button onclick={() => viewTransaction(tx)} class="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg">
                                        <Eye class="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="flex items-center justify-center gap-2 mt-6">
            <button onclick={() => (currentPage = Math.max(1, currentPage - 1))} disabled={currentPage === 1} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50">
                <ChevronLeft class="w-5 h-5" />
            </button>
            <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{currentPage} / {totalPages}</span>
            <button onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50">
                <ChevronRight class="w-5 h-5" />
            </button>
        </div>
    {/if}
</div>

<!-- View Modal -->
{#if showViewModal && selectedTransaction}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">ລາຍລະອຽດ</h2>
                <button onclick={() => (showViewModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <div class="p-6 space-y-4">
                <div class="flex justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ລະຫັດ:</span>
                    <span class="font-mono text-gray-900 dark:text-white">{selectedTransaction.reference || selectedTransaction.id?.slice(-8)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ວັນທີ:</span>
                    <span class="text-gray-900 dark:text-white">{formatDate(selectedTransaction.createdAt)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ລູກຄ້າ:</span>
                    <span class="text-gray-900 dark:text-white">{selectedTransaction.customerName || "-"}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ວິທີຊຳລະ:</span>
                    <span class="text-gray-900 dark:text-white">{getMethodConfig(selectedTransaction.paymentMethod).label}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ສະຖານະ:</span>
                    {#if selectedTransaction}
                        {@const statusConfig = getStatusConfig(selectedTransaction.status)}
                        <span class={cn("px-2 py-1 rounded-full text-xs font-medium", statusConfig.bg, statusConfig.text)}>{statusConfig.label}</span>
                    {/if}
                </div>
                <div class="border-t border-gray-200 dark:border-gray-700 pt-4 flex justify-between">
                    <span class="text-lg font-semibold text-gray-700 dark:text-gray-300">ຍອດເງິນ:</span>
                    <span class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedTransaction.amount)}</span>
                </div>
            </div>
        </div>
    </div>
{/if}
