<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn, formatCurrency, formatDate, escapeCsvCell, escapeHtml } from "$utils";
    import { api } from "$api";
    import { toast } from "svelte-sonner";
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
    let pageSizeOptions = [5, 10, 20, 30, 50, 70, 100];
    let totalItems = $state(0);
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Data
    let transactions = $state<any[]>([]);

    // Stats
    let stats = $derived({
        total: totalItems,
        completed: transactions.filter((t) => t.status === "completed").length,
        pending: transactions.filter((t) => t.status === "pending").length,
        failed: transactions.filter((t) => t.status === "failed").length,
        totalAmount: transactions.filter((t) => t.status === "completed").reduce((sum, t) => sum + (t.amount || 0), 0),
    });

    function getStatusConfig(status: string) {
        switch (status) {
            case "completed":
                return { bg: "bg-success-100 dark:bg-success-900/50", text: "text-success-700 dark:text-success-400", label: "ສຳເລັດ", icon: CheckCircle };
            case "pending":
                return { bg: "bg-amber-100 dark:bg-amber-900/50", text: "text-amber-700 dark:text-amber-400", label: "ລໍຖ້າ", icon: Clock };
            case "failed":
                return { bg: "bg-danger-100 dark:bg-danger-900/50", text: "text-danger-700 dark:text-danger-400", label: "ລົ້ມເຫລວ", icon: XCircle };
            default:
                return { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", label: status, icon: Clock };
        }
    }

    function getMethodConfig(method: string) {
        switch (method) {
            case "cash":
                return { icon: Banknote, label: "ເງິນສົດ", color: "text-success-600 dark:text-success-400" };
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
            const params: Record<string, string | number> = {
                page: currentPage,
                limit: itemsPerPage,
            };
            if (searchQuery) params.search = searchQuery;
            if (statusFilter) params.status = statusFilter.toUpperCase();

            const res = await api.get("payments/transactions", { searchParams: params }).json<any>();
            const raw = res.data || [];
            transactions = raw.map((tx: any) => ({
                id: tx.id,
                reference: tx.transactionNo || tx.id?.slice(-8),
                createdAt: tx.createdAt,
                customerName: tx.customer?.name || '-',
                paymentMethod: tx.payments?.[0]?.methodName?.toLowerCase() || tx.payments?.[0]?.paymentMethod?.code?.toLowerCase() || 'cash',
                amount: tx.total || 0,
                status: (tx.status || '').toLowerCase(),
                type: tx.type,
                items: tx.items,
                raw: tx,
            }));
            totalItems = res.meta?.total || transactions.length;
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            isLoading = false;
        }
    }

    function handleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadData();
        }, 300);
    }

    function changePageSize(size: number) {
        itemsPerPage = size;
        currentPage = 1;
        loadData();
    }

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
        }
    }

    function viewTransaction(tx: any) {
        selectedTransaction = tx;
        showViewModal = true;
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

    function exportToExcel() {
        let csv = '\ufeff';
        csv += 'ວັນທີ,ລະຫັດ,ລູກຄ້າ,ວິທີຊຳລະ,ຍອດເງິນ,ສະຖານະ\n';
        for (const tx of filteredTransactions) {
            csv += `"${formatDate(tx.createdAt)}",${escapeCsvCell(tx.reference)},${escapeCsvCell(tx.customerName)},"${getMethodConfig(tx.paymentMethod).label}","${formatCurrency(tx.amount)}","${getStatusConfig(tx.status).label}"\n`;
        }
        downloadFile(csv, `transactions-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
        toast.success(t('common.exportSuccess'));
    }

    function exportToPdf() {
        const rows = filteredTransactions.map(tx =>
            `<tr><td>${formatDate(tx.createdAt)}</td><td>${escapeHtml(tx.reference)}</td><td>${escapeHtml(tx.customerName)}</td><td>${getMethodConfig(tx.paymentMethod).label}</td><td class="text-right">${formatCurrency(tx.amount)}</td><td>${getStatusConfig(tx.status).label}</td></tr>`
        ).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ລາຍການຊຳລະ</title>
<style>body{font-family:'Noto Sans Lao',sans-serif;padding:20px}h1{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:12px}th{background:#f5f5f5}.text-right{text-align:right}</style></head>
<body><h1>ລາຍການຊຳລະ</h1><p style="text-align:center">${new Date().toLocaleDateString('lo-LA')}</p>
<table><tr><th>ວັນທີ</th><th>ລະຫັດ</th><th>ລູກຄ້າ</th><th>ວິທີຊຳລະ</th><th>ຍອດເງິນ</th><th>ສະຖານະ</th></tr>${rows}</table></body></html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (w) w.onload = () => w.print();
        toast.success(t('common.exportSuccess'));
    }

    function exportToWord() {
        const rows = filteredTransactions.map(tx =>
            `<tr><td>${formatDate(tx.createdAt)}</td><td>${escapeHtml(tx.reference)}</td><td>${escapeHtml(tx.customerName)}</td><td>${getMethodConfig(tx.paymentMethod).label}</td><td>${formatCurrency(tx.amount)}</td><td>${getStatusConfig(tx.status).label}</td></tr>`
        ).join('');
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:8px}th{background:#f0f0f0}</style></head>
<body><h1 style="text-align:center">ລາຍການຊຳລະ</h1><p style="text-align:center">${new Date().toLocaleDateString('lo-LA')}</p>
<table><tr><th>ວັນທີ</th><th>ລະຫັດ</th><th>ລູກຄ້າ</th><th>ວິທີຊຳລະ</th><th>ຍອດເງິນ</th><th>ສະຖານະ</th></tr>${rows}</table></body></html>`;
        downloadFile(html, `transactions-${new Date().toISOString().split('T')[0]}.doc`, 'application/msword');
        toast.success(t('common.exportSuccess'));
    }

    let showExportMenu = $state(false);

    let filteredTransactions = $derived.by(() => {
        return transactions.filter((tx) => {
            const matchMethod = !methodFilter || tx.paymentMethod === methodFilter;
            return matchMethod;
        });
    });

    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage) || 1);

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

        <div class="relative">
            <button onclick={() => showExportMenu = !showExportMenu} class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium">
                <Download class="w-4 h-4" />
                ສົ່ງອອກ
            </button>
            {#if showExportMenu}
                <div class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                    <button onclick={() => { exportToExcel(); showExportMenu = false; }} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">
                        Excel (CSV)
                    </button>
                    <button onclick={() => { exportToPdf(); showExportMenu = false; }} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">
                        PDF
                    </button>
                    <button onclick={() => { exportToWord(); showExportMenu = false; }} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">
                        Word
                    </button>
                </div>
            {/if}
        </div>
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
                <div class="p-2 bg-success-100 dark:bg-success-900/50 rounded-lg">
                    <CheckCircle class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <span class="text-2xl font-bold text-success-600 dark:text-success-400">{stats.completed}</span>
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
                <div class="p-2 bg-danger-100 dark:bg-danger-900/50 rounded-lg">
                    <XCircle class="w-5 h-5 text-danger-600 dark:text-danger-400" />
                </div>
                <span class="text-2xl font-bold text-danger-600 dark:text-danger-400">{stats.failed}</span>
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
                <input type="text" bind:value={searchQuery} oninput={() => handleSearch()} placeholder="ຄົ້ນຫາລະຫັດ, ລູກຄ້າ..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div class="flex gap-2 flex-wrap">
                <span class="text-sm text-gray-500 py-2">ສະຖານະ:</span>
                {#each [{ id: null, label: "ທັງໝົດ" }, { id: "completed", label: "ສຳເລັດ" }, { id: "pending", label: "ລໍຖ້າ" }, { id: "failed", label: "ລົ້ມເຫລວ" }] as filter (filter.id)}
                    <button
                        onclick={() => { statusFilter = filter.id; currentPage = 1; loadData(); }}
                        class={cn("px-3 py-2 rounded-lg text-sm font-medium transition-all", statusFilter === filter.id ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
                    >
                        {filter.label}
                    </button>
                {/each}
            </div>
            <div class="flex gap-2 flex-wrap">
                <span class="text-sm text-gray-500 py-2">ວິທີ:</span>
                {#each [{ id: null, label: "ທັງໝົດ" }, { id: "cash", label: "ເງິນສົດ" }, { id: "card", label: "ບັດ" }, { id: "mobile", label: "ມືຖື" }] as filter (filter.id)}
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
    {:else if filteredTransactions.length === 0}
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
                        {#each filteredTransactions as tx (tx.id)}
                            {@const statusConfig = getStatusConfig(tx.status)}
                            {@const methodConfig = getMethodConfig(tx.paymentMethod)}
                            {@const MethodIcon = methodConfig.icon}
                            {@const StatusIcon = statusConfig.icon}
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
                                        <MethodIcon class={cn("w-4 h-4", methodConfig.color)} />
                                        <span class={cn("text-sm", methodConfig.color)}>{methodConfig.label}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-bold text-gray-900 dark:text-white">{formatCurrency(tx.amount)}</span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span class={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium", statusConfig.bg, statusConfig.text)}>
                                        <StatusIcon class="w-3.5 h-3.5" />
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
    <div class="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700">
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
            <span class="text-sm text-gray-500 dark:text-gray-400">({totalItems} ລາຍການ)</span>
        </div>
        <div class="flex items-center gap-2">
            <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700">
                <ChevronLeft class="w-5 h-5" />
            </button>
            <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{currentPage} / {totalPages}</span>
            <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700">
                <ChevronRight class="w-5 h-5" />
            </button>
        </div>
    </div>
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
