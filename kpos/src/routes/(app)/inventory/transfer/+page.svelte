<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$lib/stores/auth.svelte";
    import { formatDate } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import {
        ArrowRightLeft,
        Plus,
        Search,
        X,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Package,
        Calendar,
        Building2,
        ArrowRight,
        Check,
        Clock,
        Download,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let statusFilter = $state<string | null>(null);
    let isLoading = $state(true);
    let showModal = $state(false);
    let currentPage = $state(1);
    let itemsPerPage = $state(10);
    let totalItems = $state(0);
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Data
    let transfers = $state<any[]>([]);
    let products = $state<any[]>([]);
    let branches = $state<any[]>([]);

    // Branches scoped to what the current user can access
    let accessibleBranches = $derived(
        auth.isSuperAdmin || (auth.roleLevel ?? 7) <= 2
            ? branches
            : branches.filter(b => auth.accessibleBranchIds.includes(b.id))
    );
    // "From" dropdown: only branches user owns; "To" excludes selected "from"
    let fromBranches = $derived(
        auth.isSuperAdmin || (auth.roleLevel ?? 7) <= 2
            ? branches
            : branches.filter(b => auth.accessibleBranchIds.includes(b.id))
    );
    // "To" dropdown: all branches (can transfer to any branch in tenant) minus selected "from"
    let toBranches = $derived(branches.filter(b => b.id !== formData.fromBranchId));

    // Form
    let formData = $state({
        productId: "",
        quantity: 1,
        fromBranchId: "",
        toBranchId: "",
        reference: "",
        notes: "",
        date: new Date().toISOString().split("T")[0],
    });

    // Stats
    let stats = $derived({
        total: totalItems,
        pending: transfers.filter((t) => t.status === "PENDING").length,
        completed: transfers.filter((t) => t.status === "COMPLETED").length,
        rejected: transfers.filter((t) => t.status === "REJECTED").length,
        totalQty: transfers.reduce((sum, t) => sum + ((t.items || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0)), 0),
    });

    const canApprove = $derived(
        auth.hasPermission('inventory:update') &&
        (auth.roleLevel <= 5 || auth.user?.isSuperAdmin)
    );

    function getStatusConfig(status: string) {
        switch (status?.toUpperCase()) {
            case "COMPLETED":
                return { bg: "bg-success-100 dark:bg-success-900/50", text: "text-success-700 dark:text-success-400", label: "ສຳເລັດ" };
            case "PENDING":
                return { bg: "bg-amber-100 dark:bg-amber-900/50", text: "text-amber-700 dark:text-amber-400", label: "ລໍຖ້າອະນຸມັດ" };
            case "REJECTED":
                return { bg: "bg-danger-100 dark:bg-danger-900/50", text: "text-danger-700 dark:text-danger-400", label: "ປະຕິເສດ" };
            default:
                return { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", label: status };
        }
    }

    async function approveTransfer(id: string) {
        try {
            await api.patch(`inventory/transfers/${id}/approve`, { json: {} }).json();
            toast.success('ອະນຸມັດການໂອນສຳເລັດ — ສະຕ໋ອກໄດ້ຖືກໂອນແລ້ວ');
            loadData();
        } catch (e: any) {
            const msg = await e?.response?.json?.().catch(() => null);
            toast.error(msg?.error?.message || 'ບໍ່ສາມາດອະນຸມັດໄດ້');
        }
    }

    async function rejectTransfer(id: string) {
        const reason = prompt('ເຫດຜົນໃນການປະຕິເສດ (ທາງເລືອກ):');
        if (reason === null) return; // cancelled
        try {
            await api.patch(`inventory/transfers/${id}/reject`, { json: { reason } }).json();
            toast.success('ປະຕິເສດການໂອນແລ້ວ');
            loadData();
        } catch (e: any) {
            const msg = await e?.response?.json?.().catch(() => null);
            toast.error(msg?.error?.message || 'ບໍ່ສາມາດປະຕິເສດໄດ້');
        }
    }

    async function loadData() {
        isLoading = true;
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
            });
            if (searchQuery.trim()) {
                params.append("search", searchQuery.trim());
            }
            if (statusFilter) {
                params.append("status", statusFilter);
            }
            const [transferRes, prodRes, branchRes] = await Promise.all([
                api.get(`inventory/transfers?${params}`).json<any>(),
                api.get("products?all=true").json<any>(),
                api.get("branches?all=true").json<any>(),
            ]);
            transfers = transferRes.data || [];
            totalItems = transferRes.meta?.total || 0;
            products = prodRes.data || [];
            branches = branchRes.data || [];

            // Auto-set fromBranchId to user's active branch
            if (!formData.fromBranchId && auth.activeBranchId) {
                formData.fromBranchId = auth.activeBranchId;
            }
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

    function handleFilterChange() {
        currentPage = 1;
        loadData();
    }

    async function handleSubmit() {
        if (formData.fromBranchId === formData.toBranchId) {
            toast.error("ສາຂາຕົ້ນທາງ ແລະ ປາຍທາງຕ້ອງບໍ່ຄືກັນ");
            return;
        }
        try {
            await api.post("inventory/transfers", { json: formData }).json();
            toast.success("ສ້າງການໂອນສຳເລັດ");
            showModal = false;
            resetForm();
            loadData();
        } catch (e) {
            console.error("Failed to save:", e);
            toast.error(t("common.error"));
        }
    }

    function getProductName(productId: string) {
        return products.find((p) => p.id === productId)?.name || "-";
    }

    function getBranchName(branchId: string) {
        return branches.find((b) => b.id === branchId)?.name || "-";
    }

    function resetForm() {
        formData = {
            productId: "",
            quantity: 1,
            fromBranchId: "",
            toBranchId: "",
            reference: "",
            notes: "",
            date: new Date().toISOString().split("T")[0],
        };
    }

    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
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

    function exportToCsv() {
        let csv = '﻿';
        csv += 'ວັນທີ,ສາຂາຕົ້ນທາງ,ສາຂາປາຍທາງ,ສິນຄ້າ,ຈຳນວນ,ໝາຍເຫດ,ສະຖານະ\n';
        for (const tr of transfers) {
            const fromName = getBranchName(tr.fromBranchId);
            const toName = getBranchName(tr.toBranchId);
            const itemSummary = (tr.items || []).map((i: any) => `${getProductName(i.productId)} x${i.quantity}`).join('; ');
            const totalQty = (tr.items || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0);
            const statusLabel = tr.status === 'completed' ? 'ສຳເລັດ' : tr.status === 'pending' ? 'ລໍຖ້າ' : tr.status;
            const date = tr.createdAt ? new Date(tr.createdAt).toLocaleDateString('lo-LA') : '';
            csv += `"${date}","${fromName}","${toName}","${itemSummary}","${totalQty}","${tr.notes || ''}","${statusLabel}"\n`;
        }
        downloadFile(csv, `transfers-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
        toast.success(t('common.exportSuccess'));
    }

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });
</script>

<svelte:head>
    <title>ໂອນສິນຄ້າ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl shadow-lg">
                    <ArrowRightLeft class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ໂອນສິນຄ້າ</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ໂອນສິນຄ້າລະຫວ່າງສາຂາ</p>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <button onclick={exportToCsv} class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium">
                <Download class="w-4 h-4" />
                ສົ່ງອອກ
            </button>
            <button
                onclick={() => { resetForm(); showModal = true; }}
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl text-sm font-semibold shadow-lg"
            >
                <Plus class="w-5 h-5" />
                ໂອນສິນຄ້າ
            </button>
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-cyan-100 dark:bg-cyan-900/50 rounded-lg">
                    <ArrowRightLeft class="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <span class="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ການໂອນທັງໝົດ</p>
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
                <div class="p-2 bg-success-100 dark:bg-success-900/50 rounded-lg">
                    <Check class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <span class="text-2xl font-bold text-success-600 dark:text-success-400">{stats.completed}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ສຳເລັດ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Package class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalQty}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຈຳນວນລວມ</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="text" bind:value={searchQuery} oninput={handleSearch} placeholder="ຄົ້ນຫາສິນຄ້າ..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500" />
            </div>
            <div class="flex gap-2">
                {#each [{ id: null, label: "ທັງໝົດ" }, { id: "pending", label: "ລໍຖ້າ" }, { id: "completed", label: "ສຳເລັດ" }] as filter (filter.id)}
                    <button
                        onclick={() => { statusFilter = filter.id; handleFilterChange(); }}
                        class={cn("px-3 py-2 rounded-lg text-sm font-medium transition-all", statusFilter === filter.id ? "bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
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
            <Loader2 class="w-10 h-10 text-cyan-500 animate-spin" />
        </div>
    {:else if transfers.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <ArrowRightLeft class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີການໂອນສິນຄ້າ</h3>
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ວັນທີ</th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ສິນຄ້າ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຈາກ → ໄປ</th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຈຳນວນ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ສະຖານະ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ດຳເນີນການ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each transfers as transfer (transfer.id)}
                            {@const statusConfig = getStatusConfig(transfer.status)}
                            {@const itemList = transfer.items || []}
                            {@const totalQty = itemList.reduce((s: number, i: any) => s + (i.quantity || 0), 0)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                        <Calendar class="w-4 h-4" />
                                        <span>{formatDate(transfer.date || transfer.createdAt)}</span>
                                    </div>
                                    {#if transfer.transferNo}
                                        <div class="text-xs text-gray-400 mt-0.5">{transfer.transferNo}</div>
                                    {/if}
                                </td>
                                <td class="px-6 py-4">
                                    <div class="space-y-1">
                                        {#each itemList as item (item.id)}
                                            <div class="flex items-center gap-2">
                                                <Package class="w-4 h-4 text-gray-400 shrink-0" />
                                                <span class="font-medium text-gray-900 dark:text-white text-sm">{item.productName || getProductName(item.productId)}</span>
                                                <span class="text-gray-500 text-sm">×{item.quantity}</span>
                                            </div>
                                        {:else}
                                            <span class="text-gray-400 text-sm">{getProductName(transfer.productId)}</span>
                                        {/each}
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-center gap-2">
                                        <span class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300">{getBranchName(transfer.fromBranchId)}</span>
                                        <ArrowRight class="w-4 h-4 text-cyan-500" />
                                        <span class="px-2 py-1 bg-cyan-100 dark:bg-cyan-900/50 rounded text-sm text-cyan-700 dark:text-cyan-400">{getBranchName(transfer.toBranchId)}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-bold text-gray-900 dark:text-white">{totalQty || transfer.quantity || 0}</span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span class={cn("px-2.5 py-1 rounded-full text-xs font-medium", statusConfig.bg, statusConfig.text)}>
                                        {statusConfig.label}
                                    </span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    {#if transfer.status === 'PENDING' && canApprove}
                                        <div class="flex items-center justify-center gap-2">
                                            <button
                                                onclick={() => approveTransfer(transfer.id)}
                                                class="p-1.5 rounded-lg bg-success-100 hover:bg-success-200 text-success-700 transition-colors"
                                                title="ອະນຸມັດ"
                                            >
                                                <Check class="w-4 h-4" />
                                            </button>
                                            <button
                                                onclick={() => rejectTransfer(transfer.id)}
                                                class="p-1.5 rounded-lg bg-danger-100 hover:bg-danger-200 text-danger-700 transition-colors"
                                                title="ປະຕິເສດ"
                                            >
                                                <X class="w-4 h-4" />
                                            </button>
                                        </div>
                                    {:else if transfer.status === 'COMPLETED'}
                                        <span class="text-xs text-gray-400">ໂດຍ: {transfer.approvedBy ? transfer.approvedBy.slice(-6) : '—'}</span>
                                    {:else}
                                        <span class="text-gray-400">—</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}

    <!-- Pagination -->
    {#if totalPages >= 1}
        <div class="flex items-center justify-between mt-6 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-600 dark:text-gray-400">ສະແດງ</span>
                <select
                    bind:value={itemsPerPage}
                    onchange={() => { currentPage = 1; loadData(); }}
                    class="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                >
                    {#each [5, 10, 20, 50, 70, 100] as size (size)}
                        <option value={size}>{size}</option>
                    {/each}
                </select>
                <span class="text-sm text-gray-600 dark:text-gray-400">ລາຍການ</span>
            </div>
            <div class="flex items-center gap-2">
                <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50">
                    <ChevronLeft class="w-5 h-5" />
                </button>
                <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{currentPage} / {totalPages} (ທັງໝົດ {totalItems})</span>
                <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50">
                    <ChevronRight class="w-5 h-5" />
                </button>
            </div>
        </div>
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">ໂອນສິນຄ້າ</h2>
                <button onclick={() => (showModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4">
                <div>
                    <label for="a11y-app-inventory-transfer-page-svelte-1" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ສິນຄ້າ *</label>
                    <select id="a11y-app-inventory-transfer-page-svelte-1" bind:value={formData.productId} required class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                        <option value="">ເລືອກສິນຄ້າ</option>
                        {#each products as product (product.id)}
                            <option value={product.id}>{product.name}</option>
                        {/each}
                    </select>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="a11y-app-inventory-transfer-page-svelte-2" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຈາກສາຂາ *</label>
                        <select id="a11y-app-inventory-transfer-page-svelte-2" bind:value={formData.fromBranchId} required class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                            <option value="">ເລືອກສາຂາ</option>
                            {#each fromBranches as branch (branch.id)}
                                <option value={branch.id}>{branch.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div>
                        <label for="a11y-app-inventory-transfer-page-svelte-3" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ໄປສາຂາ *</label>
                        <select id="a11y-app-inventory-transfer-page-svelte-3" bind:value={formData.toBranchId} required class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                            <option value="">ເລືອກສາຂາ</option>
                            {#each toBranches as branch (branch.id)}
                                <option value={branch.id}>{branch.name}</option>
                            {/each}
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="a11y-app-inventory-transfer-page-svelte-4" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຈຳນວນ *</label>
                        <input id="a11y-app-inventory-transfer-page-svelte-4" type="number" bind:value={formData.quantity} min="1" required class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                        <label for="a11y-app-inventory-transfer-page-svelte-5" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ວັນທີ</label>
                        <input id="a11y-app-inventory-transfer-page-svelte-5" type="date" bind:value={formData.date} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                </div>

                <div>
                    <label for="a11y-app-inventory-transfer-page-svelte-6" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ໝາຍເຫດ</label>
                    <textarea id="a11y-app-inventory-transfer-page-svelte-6" bind:value={formData.notes} rows="2" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                </div>

                <div class="flex justify-end gap-3 pt-4">
                    <button type="button" onclick={() => (showModal = false)} class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium">ຍົກເລີກ</button>
                    <button type="submit" class="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium shadow-lg">ບັນທຶກ</button>
                </div>
            </form>
        </div>
    </div>
{/if}
