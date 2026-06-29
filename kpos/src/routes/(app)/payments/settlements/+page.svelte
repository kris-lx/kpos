<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn, formatCurrency, formatDate } from "$utils";
    import { api } from "$api";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import MoneyInput from "$lib/components/MoneyInput.svelte";
    import {
        Wallet,
        Plus,
        Search,
        X,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Calendar,
        CheckCircle,
        Clock,
        Download,
        Eye,
        DollarSign,
        Building,
        TrendingUp,
    } from "lucide-svelte";

    // Rule-based CRUD gating
    const hasWriteAccess = $derived(auth.hasStoreAccess('write') || !auth.activeStoreId);
    const canCreateSettlement = $derived(auth.canCreate('payments') && hasWriteAccess);

    // State
    let searchQuery = $state("");
    let statusFilter = $state<string | null>(null);
    let isLoading = $state(true);
    let showModal = $state(false);
    let showViewModal = $state(false);
    let selectedSettlement = $state<any>(null);
    let currentPage = $state(1);
    let itemsPerPage = $state(20);

    // Data
    let settlements = $state<any[]>([]);

    // Form
    let formData = $state({
        date: new Date().toISOString().split("T")[0],
        amount: 0,
        paymentMethod: "cash",
        bankAccount: "",
        reference: "",
        notes: "",
    });

    let paymentMethodOptions = $state<{value: string; label: string; labelLao?: string}[]>([]);

    async function loadEnums() {
        try {
            const res = await api.get("settings/enums?type=payment_method").json<any>();
            if (res.data?.payment_method) paymentMethodOptions = res.data.payment_method;
        } catch { /* keep defaults */ }
    }

    // Stats
    let stats = $derived({
        total: settlements.length,
        completed: settlements.filter((s) => s.status === "completed").length,
        pending: settlements.filter((s) => s.status === "pending").length,
        totalAmount: settlements.filter((s) => s.status === "completed").reduce((sum, s) => sum + (s.amount || 0), 0),
    });

    function getStatusConfig(status: string) {
        switch (status) {
            case "completed":
                return { bg: "bg-success-100 dark:bg-success-900/50", text: "text-success-700 dark:text-success-400", label: "ສຳເລັດ" };
            case "pending":
                return { bg: "bg-amber-100 dark:bg-amber-900/50", text: "text-amber-700 dark:text-amber-400", label: "ລໍຖ້າ" };
            default:
                return { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", label: status };
        }
    }

    async function loadData() {
        isLoading = true;
        try {
            const res = await api.get("payments/settlements").json<any>();
            settlements = res.data || [];
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            isLoading = false;
        }
    }

    async function handleSubmit() {
        try {
            await api.post("payments/settlements", { json: formData }).json();
            toast.success(t('common.created'));
            showModal = false;
            resetForm();
            loadData();
        } catch (e) {
            console.error("Failed to save:", e);
            toast.error(t("common.error"));
        }
    }

    function viewSettlement(s: any) {
        selectedSettlement = s;
        showViewModal = true;
    }

    function resetForm() {
        formData = { date: new Date().toISOString().split("T")[0], amount: 0, paymentMethod: "cash", bankAccount: "", reference: "", notes: "" };
    }

    let showExportMenu = $state(false);

    function exportToCsv() {
        let csv = '\ufeff';
        csv += 'ວັນທີ,ລະຫັດ,ວິທີຊຳລະ,ຍອດເງິນ,ສະຖານະ,ໝາຍເຫດ\n';
        for (const s of filteredSettlements) {
            csv += `"${formatDate(s.date || s.createdAt)}","${s.reference || ''}","${s.paymentMethod || ''}","${s.amount}","${getStatusConfig(s.status).label}","${s.notes || ''}"\n`;
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `settlements-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(t('common.exportSuccess'));
        showExportMenu = false;
    }

    function exportToPdf() {
        const rows = filteredSettlements.map(s =>
            `<tr><td>${formatDate(s.date || s.createdAt)}</td><td>${s.reference || ''}</td><td>${s.paymentMethod || ''}</td><td style="text-align:right">${formatCurrency(s.amount)}</td><td>${getStatusConfig(s.status).label}</td></tr>`
        ).join('');
        const total = filteredSettlements.reduce((sum, s) => sum + (s.amount || 0), 0);
        const html = `<html><head><meta charset="utf-8"><style>body{font-family:'Noto Sans Lao',sans-serif}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:12px}th{background:#f5f5f5}tfoot td{font-weight:bold}</style></head><body><h2 style="text-align:center">ລາຍການຊຳລະ</h2><table><thead><tr><th>ວັນທີ</th><th>ລະຫັດ</th><th>ວິທີຊຳລະ</th><th>ຍອດເງິນ</th><th>ສະຖານະ</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3" style="text-align:right">ລວມ</td><td style="text-align:right">${formatCurrency(total)}</td><td></td></tr></tfoot></table></body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (w) w.onload = () => w.print();
        toast.success(t('common.exportSuccess'));
        showExportMenu = false;
    }

    let filteredSettlements = $derived.by(() => {
        return settlements.filter((s) => {
            const matchSearch = s.reference?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchStatus = !statusFilter || s.status === statusFilter;
            return matchSearch && matchStatus;
        });
    });

    let paginatedSettlements = $derived.by(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredSettlements.slice(start, start + itemsPerPage);
    });

    let totalPages = $derived(Math.ceil(filteredSettlements.length / itemsPerPage));

    onMount(() => {
        loadEnums();
        loadData();
    });
</script>

<svelte:head>
    <title>ການຊຳລະ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                    <Wallet class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ການຊຳລະ</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ຈັດການການຊຳລະເງິນ</p>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <div class="relative">
                <button onclick={() => showExportMenu = !showExportMenu} class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium">
                    <Download class="w-4 h-4" />
                    ສົ່ງອອກ
                </button>
                {#if showExportMenu}
                    <div class="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                        <button onclick={exportToCsv} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">Excel (CSV)</button>
                        <button onclick={exportToPdf} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">PDF</button>
                    </div>
                {/if}
            </div>
            {#if canCreateSettlement}
            <button
                onclick={() => { resetForm(); showModal = true; }}
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-sm font-semibold shadow-lg"
            >
                <Plus class="w-5 h-5" />
                ເພີ່ມການຊຳລະ
            </button>
            {/if}
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                    <Wallet class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <span class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.total}</span>
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
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <TrendingUp class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span class="text-xl font-bold text-purple-600 dark:text-purple-400">{formatCurrency(stats.totalAmount)}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຍອດລວມ</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="text" bind:value={searchQuery} placeholder="ຄົ້ນຫາ..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div class="flex gap-2">
                {#each [{ id: null, label: "ທັງໝົດ" }, { id: "pending", label: "ລໍຖ້າ" }, { id: "completed", label: "ສຳເລັດ" }] as filter (filter.id)}
                    <button
                        onclick={() => { statusFilter = filter.id; currentPage = 1; }}
                        class={cn("px-3 py-2 rounded-lg text-sm font-medium transition-all", statusFilter === filter.id ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
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
            <Loader2 class="w-10 h-10 text-indigo-500 animate-spin" />
        </div>
    {:else if paginatedSettlements.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <Wallet class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີການຊຳລະ</h3>
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ວັນທີ</th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ລະຫັດ</th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ບັນຊີ</th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຍອດເງິນ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ສະຖານະ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຈັດການ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each paginatedSettlements as settlement (settlement.id)}
                            {@const statusConfig = getStatusConfig(settlement.status)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                        <Calendar class="w-4 h-4" />
                                        <span>{formatDate(settlement.date || settlement.createdAt)}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <span class="font-mono text-sm text-gray-900 dark:text-white">{settlement.reference || settlement.id?.slice(-8)}</span>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                        <Building class="w-4 h-4" />
                                        <span>{settlement.bankAccount || "-"}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-bold text-gray-900 dark:text-white">{formatCurrency(settlement.amount)}</span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span class={cn("px-2.5 py-1 rounded-full text-xs font-medium", statusConfig.bg, statusConfig.text)}>
                                        {statusConfig.label}
                                    </span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <button onclick={() => viewSettlement(settlement)} class="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg">
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

<!-- Create Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">ເພີ່ມການຊຳລະ</h2>
                <button onclick={() => (showModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="a11y-app-payments-settlements-page-svelte-1" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ວັນທີ</label>
                        <input id="a11y-app-payments-settlements-page-svelte-1" type="date" bind:value={formData.date} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                        <label for="a11y-app-payments-settlements-page-svelte-2" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຍອດເງິນ *</label>
                        <MoneyInput id="a11y-app-payments-settlements-page-svelte-2" bind:value={formData.amount} min={0} required class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                </div>

                <div>
                    <label for="a11y-app-payments-settlements-page-svelte-3" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ວິທີຊຳລະ</label>
                    <select id="a11y-app-payments-settlements-page-svelte-3" bind:value={formData.paymentMethod} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                        {#if paymentMethodOptions.length > 0}
                            {#each paymentMethodOptions as pm (pm.value)}
                                <option value={pm.value}>{pm.labelLao || pm.label}</option>
                            {/each}
                        {:else}
                            <option value="cash">ເງິນສົດ</option>
                            <option value="bank">ໂອນທະນາຄານ</option>
                            <option value="check">ເຊັກ</option>
                        {/if}
                    </select>
                </div>

                <div>
                    <label for="a11y-app-payments-settlements-page-svelte-4" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ບັນຊີທະນາຄານ</label>
                    <input id="a11y-app-payments-settlements-page-svelte-4" type="text" bind:value={formData.bankAccount} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                </div>

                <div>
                    <label for="a11y-app-payments-settlements-page-svelte-5" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ເລກອ້າງອີງ</label>
                    <input id="a11y-app-payments-settlements-page-svelte-5" type="text" bind:value={formData.reference} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                </div>

                <div>
                    <label for="a11y-app-payments-settlements-page-svelte-6" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ໝາຍເຫດ</label>
                    <textarea id="a11y-app-payments-settlements-page-svelte-6" bind:value={formData.notes} rows="2" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                </div>

                <div class="flex justify-end gap-3 pt-4">
                    <button type="button" onclick={() => (showModal = false)} class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium">ຍົກເລີກ</button>
                    <button type="submit" class="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium shadow-lg">ບັນທຶກ</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- View Modal -->
{#if showViewModal && selectedSettlement}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">ລາຍລະອຽດ</h2>
                <button onclick={() => (showViewModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <div class="p-6 space-y-4">
                <div class="flex justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ລະຫັດ:</span>
                    <span class="font-mono text-gray-900 dark:text-white">{selectedSettlement.reference || selectedSettlement.id?.slice(-8)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ວັນທີ:</span>
                    <span class="text-gray-900 dark:text-white">{formatDate(selectedSettlement.date)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ບັນຊີ:</span>
                    <span class="text-gray-900 dark:text-white">{selectedSettlement.bankAccount || "-"}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ສະຖານະ:</span>
                    {#if selectedSettlement.status}
                        {@const statusConfig = getStatusConfig(selectedSettlement.status)}
                        <span class={cn("px-2 py-1 rounded-full text-xs font-medium", statusConfig.bg, statusConfig.text)}>{statusConfig.label}</span>
                    {/if}
                </div>
                {#if selectedSettlement.notes}
                    <div>
                        <span class="text-gray-500 dark:text-gray-400 text-sm">ໝາຍເຫດ:</span>
                        <p class="text-gray-900 dark:text-white mt-1">{selectedSettlement.notes}</p>
                    </div>
                {/if}
                <div class="border-t border-gray-200 dark:border-gray-700 pt-4 flex justify-between">
                    <span class="text-lg font-semibold text-gray-700 dark:text-gray-300">ຍອດເງິນ:</span>
                    <span class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(selectedSettlement.amount)}</span>
                </div>
            </div>
        </div>
    </div>
{/if}
