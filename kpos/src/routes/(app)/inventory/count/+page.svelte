<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { formatDate } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import {
        ClipboardList,
        Plus,
        Search,
        X,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Package,
        Calendar,
        CheckCircle,
        AlertTriangle,
        Eye,
        Download,
        Hash,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let statusFilter = $state<string | null>(null);
    let isLoading = $state(true);
    let showModal = $state(false);
    let showViewModal = $state(false);
    let selectedCount = $state<any>(null);
    let currentPage = $state(1);
    let itemsPerPage = $state(10);
    let totalItems = $state(0);
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Data
    let stockCounts = $state<any[]>([]);
    let products = $state<any[]>([]);

    // Form
    let formData = $state({
        date: new Date().toISOString().split("T")[0],
        notes: "",
        items: [] as { productId: string; systemQty: number; actualQty: number }[],
    });

    // Stats
    let stats = $derived({
        total: totalItems,
        pending: stockCounts.filter((c) => c.status === "pending").length,
        completed: stockCounts.filter((c) => c.status === "completed").length,
        discrepancy: stockCounts.filter((c) => c.hasDiscrepancy).length,
    });

    function getStatusConfig(status: string) {
        switch (status) {
            case "completed":
                return { bg: "bg-green-100 dark:bg-green-900/50", text: "text-green-700 dark:text-green-400", label: "ສຳເລັດ" };
            case "pending":
                return { bg: "bg-amber-100 dark:bg-amber-900/50", text: "text-amber-700 dark:text-amber-400", label: "ລໍຖ້າ" };
            default:
                return { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", label: status };
        }
    }

    async function loadData() {
        isLoading = true;
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
            });
            if (statusFilter) {
                params.append("status", statusFilter);
            }
            const [countRes, prodRes] = await Promise.all([
                api.get(`inventory/stock-counts?${params}`).json<any>(),
                api.get("products?limit=1000").json<any>(),
            ]);
            stockCounts = countRes.data || [];
            totalItems = countRes.meta?.total || 0;
            products = prodRes.data || [];
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
        if (formData.items.length === 0) {
            toast.error("ກະລຸນາເພີ່ມສິນຄ້າ");
            return;
        }
        try {
            await api.post("inventory/stock-counts", { json: formData }).json();
            toast.success("ສ້າງການນັບສຳເລັດ");
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

    function addItem() {
        formData.items = [...formData.items, { productId: "", systemQty: 0, actualQty: 0 }];
    }

    function removeItem(index: number) {
        formData.items = formData.items.filter((_, i) => i !== index);
    }

    function resetForm() {
        formData = { date: new Date().toISOString().split("T")[0], notes: "", items: [] };
    }

    function viewCount(count: any) {
        selectedCount = count;
        showViewModal = true;
    }

    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
        }
    }

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });
</script>

<svelte:head>
    <title>ນັບສິນຄ້າ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg">
                    <ClipboardList class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ນັບສິນຄ້າ</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ນັບ ແລະ ກວດກາສາງ</p>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <button class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium">
                <Download class="w-4 h-4" />
                ສົ່ງອອກ
            </button>
            <button
                onclick={() => { resetForm(); showModal = true; }}
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl text-sm font-semibold shadow-lg"
            >
                <Plus class="w-5 h-5" />
                ນັບສິນຄ້າ
            </button>
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-violet-100 dark:bg-violet-900/50 rounded-lg">
                    <ClipboardList class="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <span class="text-2xl font-bold text-violet-600 dark:text-violet-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ການນັບທັງໝົດ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Hash class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ລໍຖ້າ</p>
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
                <div class="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                    <AlertTriangle class="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <span class="text-2xl font-bold text-red-600 dark:text-red-400">{stats.discrepancy}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ມີຜິດປົກກະຕິ</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="text" bind:value={searchQuery} oninput={handleSearch} placeholder="ຄົ້ນຫາ..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500" />
            </div>
            <div class="flex gap-2">
                {#each [{ id: null, label: "ທັງໝົດ" }, { id: "pending", label: "ລໍຖ້າ" }, { id: "completed", label: "ສຳເລັດ" }] as filter (filter.id)}
                    <button
                        onclick={() => { statusFilter = filter.id; handleFilterChange(); }}
                        class={cn("px-3 py-2 rounded-lg text-sm font-medium transition-all", statusFilter === filter.id ? "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
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
            <Loader2 class="w-10 h-10 text-violet-500 animate-spin" />
        </div>
    {:else if stockCounts.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <ClipboardList class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີການນັບ</h3>
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ວັນທີ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ລາຍການ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ສະຖານະ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຜິດປົກກະຕິ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຈັດການ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each stockCounts as count (count.id)}
                            {@const statusConfig = getStatusConfig(count.status)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                        <Calendar class="w-4 h-4" />
                                        <span>{formatDate(count.date || count.createdAt)}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span class="font-medium text-gray-900 dark:text-white">{count.items?.length || 0} ລາຍການ</span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span class={cn("px-2.5 py-1 rounded-full text-xs font-medium", statusConfig.bg, statusConfig.text)}>
                                        {statusConfig.label}
                                    </span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    {#if count.hasDiscrepancy}
                                        <span class="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-sm">
                                            <AlertTriangle class="w-4 h-4" /> ມີ
                                        </span>
                                    {:else}
                                        <span class="text-green-600 dark:text-green-400 text-sm">ບໍ່ມີ</span>
                                    {/if}
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <button onclick={() => viewCount(count)} class="p-2 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 rounded-lg">
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
    {#if totalPages >= 1}
        <div class="flex items-center justify-between mt-6 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-600 dark:text-gray-400">ສະແດງ</span>
                <select
                    bind:value={itemsPerPage}
                    onchange={() => { currentPage = 1; loadData(); }}
                    class="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                >
                    {#each [10, 20, 50, 100] as size (size)}
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

<!-- Create Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div class="px-6 py-4 bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">ນັບສິນຄ້າ</h2>
                <button onclick={() => (showModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4 overflow-y-auto flex-1">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ວັນທີ</label>
                    <input type="date" bind:value={formData.date} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                </div>

                <div>
                    <div class="flex justify-between items-center mb-2">
                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">ລາຍການສິນຄ້າ</label>
                        <button type="button" onclick={addItem} class="text-violet-600 hover:text-violet-700 text-sm font-medium">+ ເພີ່ມ</button>
                    </div>
                    <div class="space-y-2 max-h-60 overflow-y-auto">
                        {#each formData.items as item, i}
                            <div class="flex gap-2 items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <select bind:value={item.productId} class="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                                    <option value="">ເລືອກສິນຄ້າ</option>
                                    {#each products as product (product.id)}
                                        <option value={product.id}>{product.name}</option>
                                    {/each}
                                </select>
                                <input type="number" bind:value={item.systemQty} placeholder="ລະບົບ" class="w-20 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
                                <input type="number" bind:value={item.actualQty} placeholder="ຕົວຈິງ" class="w-20 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
                                <button type="button" onclick={() => removeItem(i)} class="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                                    <X class="w-4 h-4" />
                                </button>
                            </div>
                        {/each}
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ໝາຍເຫດ</label>
                    <textarea bind:value={formData.notes} rows="2" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                </div>

                <div class="flex justify-end gap-3 pt-4">
                    <button type="button" onclick={() => (showModal = false)} class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium">ຍົກເລີກ</button>
                    <button type="submit" class="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-medium shadow-lg">ບັນທຶກ</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- View Modal -->
{#if showViewModal && selectedCount}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">ລາຍລະອຽດການນັບ</h2>
                <button onclick={() => (showViewModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <div class="p-6 space-y-4">
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500 dark:text-gray-400">ວັນທີ:</span>
                    <span class="font-medium text-gray-900 dark:text-white">{formatDate(selectedCount.date)}</span>
                </div>
                <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ລາຍການ:</h4>
                    <div class="space-y-2 max-h-60 overflow-y-auto">
                        {#each selectedCount.items || [] as item (item.productId)}
                            <div class="flex justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
                                <span class="text-gray-900 dark:text-white">{getProductName(item.productId)}</span>
                                <span class={cn(item.systemQty !== item.actualQty ? "text-red-600" : "text-gray-500")}>
                                    {item.systemQty} → {item.actualQty}
                                </span>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}
