<!-- ═══════════════════════════════════════════════════════════════════════════
     Stores Management Page - KPOS Multi-Store System
     ═══════════════════════════════════════════════════════════════════════════ -->
<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { api } from "$api";
    import { auth } from "$stores";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { toast } from "svelte-sonner";
    import {
        Plus,
        Search,
        Store,
        Building2,
        MapPin,
        Phone,
        Users,
        Pencil,
        Trash2,
        Package,
        RefreshCw,
        X,
        Loader2,
        ChevronLeft,
        ChevronRight,
    } from "lucide-svelte";

    const queryClient = useQueryClient();

    // CRUD permission gating
    const canCreate = $derived(auth.canCreate('management.stores'));
    const canUpdate = $derived(auth.canUpdate('management.stores'));
    const canDelete = $derived(auth.canDelete('management.stores'));

    let searchQuery = $state("");
    let debouncedSearch = $state("");
    let selectedBranchId = $state<string | null>(null);
    let showModal = $state(false);
    let editingStore = $state<any>(null);
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Pagination
    let currentPage = $state(1);
    let pageSize = $state(6);
    const pageSizeOptions = [6, 10, 20, 50];

    // Debounce search
    $effect(() => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            debouncedSearch = searchQuery;
        }, 300);
        return () => clearTimeout(searchTimeout);
    });

    // Form state
    let formData = $state({
        name: "",
        code: "",
        branchId: "",
        address: "",
        phone: "",
        email: "",
        description: "",
        isDefault: false,
    });

    // Fetch branches scoped to admin's store
    const branchesQuery = createQuery({
        queryKey: ["admin-branches-list"],
        queryFn: async () => {
            const response = await api.get("admin/branches?limit=100").json<any>();
            return response.data || [];
        },
    });

    // Fetch stores - use getter for reactive query key
    const storesQuery = createQuery({
        queryKey: ["stores", debouncedSearch, selectedBranchId],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (debouncedSearch) params.append("search", debouncedSearch);
            if (selectedBranchId) params.append("branchId", selectedBranchId);
            const response = await api.get(`stores?${params}`).json<any>();
            return response.data || [];
        },
    });

    // Invalidate all stores queries (handles dynamic key)
    function invalidateStores() {
        queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'stores' });
    }

    // Create store mutation
    const createStoreMutation = createMutation({
        mutationFn: async (data: typeof formData) => {
            const response = await api.post("stores", { json: data }).json<any>();
            if (!response.success) throw new Error(response.error?.message || t("stores.createFailed"));
            return response.data;
        },
        onSuccess: () => {
            toast.success(t("stores.createSuccess"));
            invalidateStores();
            closeModal();
        },
        onError: (error: any) => {
            toast.error(error.message || t("stores.createFailed"));
        },
    });

    // Update store mutation
    const updateStoreMutation = createMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
            const response = await api.put(`stores/${id}`, { json: data }).json<any>();
            if (!response.success) throw new Error(response.error?.message || t("stores.updateFailed"));
            return response.data;
        },
        onSuccess: () => {
            toast.success(t("stores.updateSuccess"));
            invalidateStores();
            closeModal();
        },
        onError: (error: any) => {
            toast.error(error.message || t("stores.updateFailed"));
        },
    });

    // Delete store mutation
    const deleteStoreMutation = createMutation({
        mutationFn: async (id: string) => {
            const response = await api.delete(`stores/${id}`).json<any>();
            if (!response.success) throw new Error(response.error?.message || t("stores.deleteFailed"));
            return response.data;
        },
        onSuccess: () => {
            toast.success(t("stores.deleteSuccess"));
            invalidateStores();
        },
        onError: (error: any) => {
            toast.error(error.message || t("stores.deleteFailed"));
        },
    });

    function resetForm() {
        formData = {
            name: "",
            code: "",
            branchId: "",
            address: "",
            phone: "",
            email: "",
            description: "",
            isDefault: false,
        };
    }

    function openModal(store?: any) {
        if (store) {
            editingStore = store;
            formData = {
                name: store.name,
                code: store.code,
                branchId: store.branchId,
                address: store.address || "",
                phone: store.phone || "",
                email: store.email || "",
                description: store.description || "",
                isDefault: store.isDefault || false,
            };
        } else {
            editingStore = null;
            resetForm();
        }
        showModal = true;
    }

    function closeModal() {
        showModal = false;
        editingStore = null;
        resetForm();
    }

    function handleSubmit() {
        if (!formData.name || !formData.code || !formData.branchId) {
            toast.error(t("stores.fillRequired"));
            return;
        }
        if (editingStore) {
            $updateStoreMutation.mutate({ id: editingStore.id, data: formData });
        } else {
            $createStoreMutation.mutate(formData);
        }
    }

    async function handleDelete(store: any) {
        if (confirm(t("stores.deleteConfirm"))) {
            $deleteStoreMutation.mutate(store.id);
        }
    }

    const isPending = $derived($createStoreMutation.isPending || $updateStoreMutation.isPending);
</script>

<svelte:head>
    <title>{t("stores.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                    <Store class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{t("stores.title")}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{t("stores.subtitle")}</p>
                </div>
            </div>
        </div>

        {#if canCreate}
        <button
            onclick={() => openModal()}
            class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:shadow-xl transition-all"
        >
            <Plus class="w-5 h-5" />
            {t("stores.addStore")}
        </button>
        {/if}
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                    <Store class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <span class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{$storesQuery.data?.length || 0}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("stores.totalStores")}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <Store class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span class="text-2xl font-bold text-green-600 dark:text-green-400">{$storesQuery.data?.filter((s: any) => s.isActive !== false).length || 0}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("stores.activeStores")}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Building2 class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{$branchesQuery.data?.length || 0}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("branches.title")}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Users class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span class="text-2xl font-bold text-purple-600 dark:text-purple-400">{$storesQuery.data?.reduce((sum: number, s: any) => sum + (s._count?.userAccess || 0), 0) || 0}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("stores.staffCount")}</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder={t("stores.searchPlaceholder")}
                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            <select
                bind:value={selectedBranchId}
                class="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
                <option value={null}>{t("stores.allBranches")}</option>
                {#if $branchesQuery.data}
                    {#each $branchesQuery.data as branch (branch.id)}
                        <option value={branch.id}>{branch.name}</option>
                    {/each}
                {/if}
            </select>

            <button
                onclick={() => queryClient.invalidateQueries({ queryKey: ["stores"] })}
                class="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
                <RefreshCw class={cn("w-5 h-5 text-gray-500", $storesQuery.isFetching && "animate-spin")} />
            </button>
        </div>
    </div>

    <!-- Stores Grid -->
    {#if $storesQuery.isLoading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-indigo-500 animate-spin" />
        </div>
    {:else if $storesQuery.data?.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <Store class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">{t("stores.noStores")}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("stores.noStoresDesc")}</p>
            <button
                onclick={() => openModal()}
                class="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600"
            >
                {t("stores.addStore")}
            </button>
        </div>
    {:else}
        {@const allStores = $storesQuery.data || []}
        {@const totalPages = Math.ceil(allStores.length / pageSize)}
        {@const paginatedStores = allStores.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {#each paginatedStores as store (store.id)}
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <!-- Card Header -->
                    <div class="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <Store class="w-6 h-6 text-white" />
                            <div>
                                <h3 class="font-bold text-white">{store.name}</h3>
                                <p class="text-xs text-white/70">{store.code}</p>
                            </div>
                        </div>
                        {#if store.isDefault}
                            <span class="px-2 py-1 bg-white/20 text-white text-xs rounded-lg font-medium">
                                {t("stores.default")}
                            </span>
                        {/if}
                    </div>

                    <!-- Card Body -->
                    <div class="p-4 space-y-3">
                        <!-- Branch -->
                        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <Building2 class="w-4 h-4" />
                            <span>{store.branch?.name || "-"}</span>
                        </div>

                        <!-- Address -->
                        {#if store.address}
                            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <MapPin class="w-4 h-4" />
                                <span class="truncate">{store.address}</span>
                            </div>
                        {/if}

                        <!-- Phone -->
                        {#if store.phone}
                            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <Phone class="w-4 h-4" />
                                <span>{store.phone}</span>
                            </div>
                        {/if}

                        <!-- Stats -->
                        <div class="pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4">
                            <div class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                                <Users class="w-4 h-4" />
                                <span>{store._count?.userAccess || 0}</span>
                            </div>
                            <div class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                                <Package class="w-4 h-4" />
                                <span>{store._count?.products || 0}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Card Footer -->
                    <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                        {#if canUpdate}
                        <button
                            onclick={() => openModal(store)}
                            class="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg"
                            title={t("stores.editStore")}
                        >
                            <Pencil class="w-4 h-4" />
                        </button>
                        {/if}
                        {#if canDelete}
                        <button
                            onclick={() => handleDelete(store)}
                            class="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                            title={t("stores.deleteStore")}
                            disabled={$deleteStoreMutation.isPending}
                        >
                            <Trash2 class="w-4 h-4" />
                        </button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>

        <!-- Pagination -->
        {#if allStores.length > pageSize}
            <div class="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span>ສະແດງ</span>
                    <select bind:value={pageSize} onchange={() => (currentPage = 1)} class="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        {#each pageSizeOptions as size (size)}
                            <option value={size}>{size}</option>
                        {/each}
                    </select>
                    <span>ຈາກ {allStores.length}</span>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick={() => currentPage = Math.max(1, currentPage - 1)} disabled={currentPage === 1} class="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50">
                        <ChevronLeft class="w-4 h-4" />
                    </button>
                    <span class="text-sm text-gray-600 dark:text-gray-400">ໜ້າ {currentPage} / {totalPages}</span>
                    <button onclick={() => currentPage = Math.min(totalPages, currentPage + 1)} disabled={currentPage >= totalPages} class="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50">
                        <ChevronRight class="w-4 h-4" />
                    </button>
                </div>
            </div>
        {/if}
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Modal Header -->
            <div class="px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">
                    {editingStore ? t("stores.editStore") : t("stores.addStore")}
                </h2>
                <button onclick={closeModal} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <!-- Modal Body -->
            <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("stores.name")} *</label>
                        <input
                            type="text"
                            bind:value={formData.name}
                            required
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("stores.code")} *</label>
                        <input
                            type="text"
                            bind:value={formData.code}
                            required
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("stores.branch")} *</label>
                    <select
                        bind:value={formData.branchId}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    >
                        <option value="">{t("stores.selectBranch")}</option>
                        {#if $branchesQuery.data}
                            {#each $branchesQuery.data as branch (branch.id)}
                                <option value={branch.id}>{branch.name}</option>
                            {/each}
                        {/if}
                    </select>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("stores.address")}</label>
                    <input
                        type="text"
                        bind:value={formData.address}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    />
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("stores.phone")}</label>
                        <input
                            type="text"
                            bind:value={formData.phone}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("stores.email")}</label>
                        <input
                            type="email"
                            bind:value={formData.email}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("stores.description")}</label>
                    <textarea
                        bind:value={formData.description}
                        rows="2"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"
                    ></textarea>
                </div>

                <div class="flex items-center gap-2">
                    <input
                        type="checkbox"
                        bind:checked={formData.isDefault}
                        id="isDefault"
                        class="w-4 h-4 rounded text-indigo-600"
                    />
                    <label for="isDefault" class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("stores.isDefault")}</label>
                </div>

                <div class="flex justify-end gap-3 pt-4">
                    <button
                        type="button"
                        onclick={closeModal}
                        class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="submit"
                        disabled={isPending}
                        class="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium shadow-lg disabled:opacity-50 flex items-center gap-2"
                    >
                        {#if isPending}
                            <Loader2 class="w-4 h-4 animate-spin" />
                        {/if}
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
