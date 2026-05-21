<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import {
        Receipt,
        Plus,
        Search,
        X,
        Loader2,
        Edit,
        Trash2,
        Percent,
        CheckCircle,
        XCircle,
        Calculator,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let isLoading = $state(true);
    let showModal = $state(false);
    let editingTax = $state<any>(null);

    // Data
    let taxes = $state<any[]>([]);

    // Form
    let formData = $state({
        name: "",
        rate: 0,
        type: "percentage",
        isActive: true,
        isDefault: false,
        description: "",
    });

    // Stats
    let stats = $derived({
        total: taxes.length,
        active: taxes.filter((t) => t.isActive).length,
        defaultTax: taxes.find((t) => t.isDefault),
    });

    async function loadData() {
        isLoading = true;
        try {
            const res = await api.get("settings/taxes").json<any>();
            taxes = res.data || [];
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            isLoading = false;
        }
    }

    async function handleSubmit() {
        try {
            if (editingTax) {
                await api.put(`settings/taxes/${editingTax.id}`, { json: formData }).json();
                toast.success("ແກ້ໄຂສຳເລັດ");
            } else {
                await api.post("settings/taxes", { json: formData }).json();
                toast.success("ເພີ່ມສຳເລັດ");
            }
            showModal = false;
            resetForm();
            loadData();
        } catch (e) {
            console.error("Failed to save:", e);
            toast.error(t("common.error"));
        }
    }

    async function handleDelete(tax: any) {
        if (!confirm("ຕ້ອງການລຶບ?")) return;
        try {
            await api.delete(`settings/taxes/${tax.id}`).json();
            toast.success("ລຶບສຳເລັດ");
            loadData();
        } catch (e) {
            toast.error(t("common.error"));
        }
    }

    function openEdit(tax: any) {
        editingTax = tax;
        formData = {
            name: tax.name || "",
            rate: tax.rate || 0,
            type: tax.type || "percentage",
            isActive: tax.isActive !== false,
            isDefault: tax.isDefault || false,
            description: tax.description || "",
        };
        showModal = true;
    }

    function resetForm() {
        editingTax = null;
        formData = { name: "", rate: 0, type: "percentage", isActive: true, isDefault: false, description: "" };
    }

    let filteredTaxes = $derived.by(() => {
        return taxes.filter((t) => t.name?.toLowerCase().includes(searchQuery.toLowerCase()));
    });

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });
</script>

<svelte:head>
    <title>ຕັ້ງຄ່າພາສີ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-orange-500 to-danger-600 rounded-xl shadow-lg">
                    <Calculator class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ຕັ້ງຄ່າພາສີ</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ຈັດການອັດຕາພາສີ VAT</p>
                </div>
            </div>
        </div>

        <button
            onclick={() => { resetForm(); showModal = true; }}
            class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-danger-600 text-white rounded-xl text-sm font-semibold shadow-lg"
        >
            <Plus class="w-5 h-5" />
            ເພີ່ມພາສີ
        </button>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
                    <Calculator class="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <span class="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ທັງໝົດ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-success-100 dark:bg-success-900/50 rounded-lg">
                    <CheckCircle class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <span class="text-2xl font-bold text-success-600 dark:text-success-400">{stats.active}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ເປີດໃຊ້ງານ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Percent class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.defaultTax?.rate || 0}%</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ພາສີເລີ່ມຕົ້ນ</p>
        </div>
    </div>

    <!-- Search -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" bind:value={searchQuery} placeholder="ຄົ້ນຫາພາສີ..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500" />
        </div>
    </div>

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-orange-500 animate-spin" />
        </div>
    {:else if filteredTaxes.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <Calculator class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີພາສີ</h3>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each filteredTaxes as tax (tax.id)}
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <div class={cn("p-4 flex items-center justify-between", tax.isDefault ? "bg-gradient-to-r from-orange-500 to-danger-600" : "bg-gray-100 dark:bg-gray-700")}>
                        <div class="flex items-center gap-3">
                            <Percent class={cn("w-6 h-6", tax.isDefault ? "text-white" : "text-gray-600 dark:text-gray-400")} />
                            <h3 class={cn("text-lg font-bold", tax.isDefault ? "text-white" : "text-gray-900 dark:text-white")}>{tax.name}</h3>
                        </div>
                        {#if tax.isDefault}
                            <span class="px-2 py-1 bg-white/20 rounded-full text-xs font-medium text-white">ເລີ່ມຕົ້ນ</span>
                        {/if}
                    </div>
                    <div class="p-4 space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="text-gray-500 dark:text-gray-400">ອັດຕາ:</span>
                            <span class="text-2xl font-bold text-orange-600 dark:text-orange-400">{tax.rate}%</span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-gray-500 dark:text-gray-400">ສະຖານະ:</span>
                            {#if tax.isActive}
                                <span class="inline-flex items-center gap-1 text-success-600 dark:text-success-400 text-sm">
                                    <CheckCircle class="w-4 h-4" /> ເປີດ
                                </span>
                            {:else}
                                <span class="inline-flex items-center gap-1 text-gray-400 text-sm">
                                    <XCircle class="w-4 h-4" /> ປິດ
                                </span>
                            {/if}
                        </div>
                        {#if tax.description}
                            <p class="text-sm text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">{tax.description}</p>
                        {/if}
                    </div>
                    <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                        <button onclick={() => openEdit(tax)} class="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg">
                            <Edit class="w-4 h-4" />
                        </button>
                        <button onclick={() => handleDelete(tax)} class="p-2 text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded-lg">
                            <Trash2 class="w-4 h-4" />
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-orange-500 to-danger-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">{editingTax ? "ແກ້ໄຂພາສີ" : "ເພີ່ມພາສີ"}</h2>
                <button onclick={() => (showModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຊື່ພາສີ *</label>
                    <input type="text" bind:value={formData.name} required placeholder="ເຊັ່ນ: VAT 10%" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ອັດຕາ (%) *</label>
                    <input type="number" bind:value={formData.rate} min="0" max="100" step="0.01" required class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ລາຍລະອຽດ</label>
                    <textarea bind:value={formData.description} rows="2" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                </div>

                <div class="flex items-center gap-4">
                    <label class="flex items-center gap-2">
                        <input type="checkbox" bind:checked={formData.isActive} class="w-4 h-4 rounded text-orange-600" />
                        <span class="text-sm text-gray-700 dark:text-gray-300">ເປີດໃຊ້ງານ</span>
                    </label>
                    <label class="flex items-center gap-2">
                        <input type="checkbox" bind:checked={formData.isDefault} class="w-4 h-4 rounded text-orange-600" />
                        <span class="text-sm text-gray-700 dark:text-gray-300">ເລີ່ມຕົ້ນ</span>
                    </label>
                </div>

                <div class="flex justify-end gap-3 pt-4">
                    <button type="button" onclick={() => (showModal = false)} class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium">ຍົກເລີກ</button>
                    <button type="submit" class="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-danger-600 text-white rounded-xl font-medium shadow-lg">ບັນທຶກ</button>
                </div>
            </form>
        </div>
    </div>
{/if}
