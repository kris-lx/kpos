<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { toast } from "svelte-sonner";
    import {
        Truck,
        Plus,
        Search,
        X,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Phone,
        Mail,
        MapPin,
        Edit,
        Trash2,
        Building,
        User,
        Star,
        Download,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let isLoading = $state(true);
    let showModal = $state(false);
    let editingVendor = $state<any>(null);
    let currentPage = $state(1);
    let itemsPerPage = $state(10);
    let totalItems = $state(0);
    let searchTimeout: ReturnType<typeof setTimeout>;
    let isSaving = $state(false);

    // Data
    let vendors = $state<any[]>([]);

    // Form
    let formData = $state({
        name: "",
        code: "",
        contactName: "",
        phone: "",
        email: "",
        address: "",
        taxId: "",
        paymentTerms: 30,
        notes: "",
        isActive: true,
    });

    // Stats
    let stats = $derived({
        total: totalItems,
        active: vendors.filter((v) => v.isActive !== false).length,
        starred: vendors.filter((v) => v.isStarred).length,
    });

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
            const res = await api.get(`inventory/vendors?${params}`).json<any>();
            vendors = res.data || [];
            totalItems = res.meta?.total || 0;
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

    async function handleSubmit() {
        isSaving = true;
        try {
            if (editingVendor) {
                await api.put(`inventory/vendors/${editingVendor.id}`, { json: formData }).json();
                toast.success("ແກ້ໄຂສຳເລັດ");
            } else {
                await api.post("inventory/vendors", { json: formData }).json();
                toast.success("ເພີ່ມສຳເລັດ");
            }
            showModal = false;
            resetForm();
            loadData();
        } catch (e: any) {
            console.error("Failed to save:", e);
            const msg = e?.response?.data?.error?.message || e?.message || "ບໍ່ສາມາດບັນທຶກໄດ້";
            toast.error(msg);
        } finally {
            isSaving = false;
        }
    }

    async function handleDelete(vendor: any) {
        if (!confirm("ຕ້ອງການລຶບ?")) return;
        try {
            await api.delete(`inventory/vendors/${vendor.id}`).json();
            toast.success("ລຶບສຳເລັດ");
            loadData();
        } catch (e: any) {
            console.error("Failed to delete:", e);
            const msg = e?.response?.data?.error?.message || e?.message || "ບໍ່ສາມາດລຶບໄດ້";
            toast.error(msg);
        }
    }

    function openEdit(vendor: any) {
        editingVendor = vendor;
        formData = {
            name: vendor.name || "",
            code: vendor.code || "",
            contactName: vendor.contactName || "",
            phone: vendor.phone || "",
            email: vendor.email || "",
            address: vendor.address || "",
            taxId: vendor.taxId || "",
            paymentTerms: vendor.paymentTerms ?? 30,
            notes: vendor.notes || "",
            isActive: vendor.isActive !== false,
        };
        showModal = true;
    }

    function resetForm() {
        editingVendor = null;
        formData = { name: "", code: "", contactName: "", phone: "", email: "", address: "", taxId: "", paymentTerms: 30, notes: "", isActive: true };
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
    <title>ຜູ້ສະໜອງ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg">
                    <Truck class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ຜູ້ສະໜອງ</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ຈັດການຜູ້ສະໜອງສິນຄ້າ</p>
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
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl text-sm font-semibold shadow-lg"
            >
                <Plus class="w-5 h-5" />
                ເພີ່ມຜູ້ສະໜອງ
            </button>
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Truck class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ທັງໝົດ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <Building class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ໃຊ້ງານຢູ່</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg">
                    <Star class="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <span class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.starred}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຕິດດາວ</p>
        </div>
    </div>

    <!-- Search -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" bind:value={searchQuery} oninput={handleSearch} placeholder="ຄົ້ນຫາຜູ້ສະໜອງ..." class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500" />
        </div>
    </div>

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-amber-500 animate-spin" />
        </div>
    {:else if vendors.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <Truck class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີຜູ້ສະໜອງ</h3>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each vendors as vendor (vendor.id)}
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <div class="p-4 bg-gradient-to-r from-amber-500 to-orange-600">
                        <div class="flex items-center justify-between">
                            <h3 class="text-lg font-bold text-white truncate">{vendor.name}</h3>
                            {#if vendor.isStarred}
                                <Star class="w-5 h-5 text-yellow-300 fill-yellow-300" />
                            {/if}
                        </div>
                    </div>
                    <div class="p-4 space-y-3">
                        {#if vendor.contactName}
                            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <User class="w-4 h-4" />
                                <span>{vendor.contactName}</span>
                            </div>
                        {/if}
                        {#if vendor.phone}
                            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <Phone class="w-4 h-4" />
                                <span>{vendor.phone}</span>
                            </div>
                        {/if}
                        {#if vendor.email}
                            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <Mail class="w-4 h-4" />
                                <span class="truncate">{vendor.email}</span>
                            </div>
                        {/if}
                        {#if vendor.address}
                            <div class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <MapPin class="w-4 h-4 mt-0.5" />
                                <span class="line-clamp-2">{vendor.address}</span>
                            </div>
                        {/if}
                    </div>
                    <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                        <button onclick={() => openEdit(vendor)} class="p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg">
                            <Edit class="w-4 h-4" />
                        </button>
                        <button onclick={() => handleDelete(vendor)} class="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">
                            <Trash2 class="w-4 h-4" />
                        </button>
                    </div>
                </div>
            {/each}
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
                    {#each [5, 10, 20, 50, 100] as size (size)}
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
            <div class="px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">{editingVendor ? "ແກ້ໄຂຜູ້ສະໜອງ" : "ເພີ່ມຜູ້ສະໜອງ"}</h2>
                <button onclick={() => (showModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຊື່ບໍລິສັດ *</label>
                        <input type="text" bind:value={formData.name} required class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ລະຫັດ</label>
                        <input type="text" bind:value={formData.code} placeholder="VND-001" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຊື່ຜູ້ຕິດຕໍ່</label>
                    <input type="text" bind:value={formData.contactName} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ເບີໂທ</label>
                        <input type="text" bind:value={formData.phone} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ອີເມວ</label>
                        <input type="email" bind:value={formData.email} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ທີ່ຢູ່</label>
                    <textarea bind:value={formData.address} rows="2" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ເລກປະຈຳຕົວພາສີ</label>
                        <input type="text" bind:value={formData.taxId} placeholder="TAX-XXXXXXXXX" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ເງື່ອນໄຂກຳນົດຊຳລະ (ມື້)</label>
                        <input type="number" bind:value={formData.paymentTerms} min="0" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ໝາຍເຫດ</label>
                    <textarea bind:value={formData.notes} rows="2" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                </div>

                <div class="flex items-center gap-3">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" bind:checked={formData.isActive} class="sr-only peer" />
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 dark:peer-focus:ring-amber-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-amber-600"></div>
                        <span class="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">ໃຊ້ງານຢູ່</span>
                    </label>
                </div>

                <div class="flex justify-end gap-3 pt-4">
                    <button type="button" onclick={() => (showModal = false)} disabled={isSaving} class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium disabled:opacity-50">ຍົກເລີກ</button>
                    <button type="submit" disabled={isSaving} class="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-medium shadow-lg disabled:opacity-50">
                        {#if isSaving}<Loader2 class="w-4 h-4 animate-spin" />{/if}
                        ບັນທຶກ
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
