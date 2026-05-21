<script lang="ts">
    import {
        createQuery,
        createMutation,
        useQueryClient,
        QueryClient,
        QueryClientProvider,
    } from "@tanstack/svelte-query";
    import { get } from "svelte/store";
    import { api } from "$api";
    import { auth } from "$stores";
    import { cn } from "$utils";
    import { toast } from "svelte-sonner";
    import { t } from "$lib/i18n/index.svelte";
    import { Plus, Search, Pencil, Trash2, Tags, X, ChevronLeft, ChevronRight, Loader2, AlertCircle, RefreshCw } from "lucide-svelte";

    const queryClient = useQueryClient();

    // Rule-based CRUD — also requires write access to active store
    const hasWriteAccess = $derived(auth.hasStoreAccess('write') || !auth.activeStoreId);
    const canCreateCat = $derived(auth.canCreate('products') && hasWriteAccess);
    const canUpdateCat = $derived(auth.canUpdate('products') && hasWriteAccess);
    const canDeleteCat = $derived(auth.canDelete('products') && hasWriteAccess);

    let searchQuery = $state("");
    let showModal = $state(false);
    let editingCategory = $state<any>(null);
    let currentPage = $state(1);
    let itemsPerPage = $state(12); // 3 rows x 4 columns

    let form = $state({
        name: "",
        description: "",
        color: "#3B82F6",
        isActive: true,
    });

    const activeStoreId = $derived(auth.activeStoreId);

    const categoriesQuery = createQuery({
        queryKey: ["categories"],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (searchQuery) params.append("search", searchQuery);
            const response = await api.get(`categories?${params}`).json<any>();
            return response.data || [];
        },
    });

    // Refetch when search or store changes
    $effect(() => {
        void searchQuery; void activeStoreId;
        $categoriesQuery.refetch();
    });

    // Filtered and paginated
    let filteredCategories = $derived(
        ($categoriesQuery.data || []).filter((c: any) => {
            if (!searchQuery) return true;
            return c.name.toLowerCase().includes(searchQuery.toLowerCase());
        })
    );

    let paginatedCategories = $derived(
        filteredCategories.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    );

    let totalPages = $derived(Math.ceil(filteredCategories.length / itemsPerPage));

    // Reset page when search changes
    $effect(() => {
        if (searchQuery !== undefined) {
            currentPage = 1;
        }
    });

    const createMutate = createMutation({
        mutationFn: (data: any) =>
            api.post("categories", { json: data }).json(),
        onSuccess: () => {
            toast.success(t("common.saveSuccess"));
            get(categoriesQuery).refetch();
            closeModal();
        },
        onError: () => {
            toast.error(t("common.saveFailed"));
        },
    });

    const updateMutate = createMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) =>
            api.put(`categories/${id}`, { json: data }).json(),
        onSuccess: () => {
            toast.success(t("common.updateSuccess"));
            get(categoriesQuery).refetch();
            closeModal();
        },
        onError: () => {
            toast.error(t("common.updateFailed"));
        },
    });

    const deleteMutate = createMutation({
        mutationFn: (id: string) => api.delete(`categories/${id}`).json(),
        onSuccess: () => {
            toast.success(t("common.deleteSuccess"));
            get(categoriesQuery).refetch();
        },
        onError: () => {
            toast.error(t("common.deleteFailed"));
        },
    });

    function openCreate() {
        editingCategory = null;
        form = { name: "", description: "", color: "#3B82F6", isActive: true };
        showModal = true;
    }

    function openEdit(category: any) {
        editingCategory = category;
        form = {
            name: category.name,
            description: category.description || "",
            color: category.color || "#3B82F6",
            isActive: category.isActive ?? true,
        };
        showModal = true;
    }

    function closeModal() {
        showModal = false;
        editingCategory = null;
    }

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (editingCategory) {
            $updateMutate.mutate({ id: editingCategory.id, data: form });
        } else {
            $createMutate.mutate(form);
        }
    }

    function confirmDelete(category: any) {
        if (confirm(t("common.deleteMessage"))) {
            $deleteMutate.mutate(category.id);
        }
    }

    const colors = [
        "#EF4444",
        "#F97316",
        "#F59E0B",
        "#84CC16",
        "#22C55E",
        "#14B8A6",
        "#06B6D4",
        "#3B82F6",
        "#8B5CF6",
        "#EC4899",
    ];
</script>

<svelte:head>
    <title>{t("nav.categories")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg">
                    <Tags class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        {t("nav.categories")}
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        ຈັດການໝວດໝູ່ສິນຄ້າ
                    </p>
                </div>
            </div>
        </div>

        {#if canCreateCat}
        <button
            onclick={openCreate}
            class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:from-purple-600 hover:to-pink-700 transition-all"
        >
            <Plus class="w-5 h-5" />
            {t("common.addNew")}
        </button>
        {/if}
    </div>

    <!-- Search -->
    <div class="bg-white dark:bg-gray-800 rounded-xl p-4 mb-6 shadow-sm">
        <div class="relative">
            <Search
                class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            />
            <input
                type="text"
                placeholder="{t('common.search')}..."
                bind:value={searchQuery}
                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
        </div>
    </div>

    <!-- Stats -->
    <div class="flex items-center gap-4 mb-6">
        <div class="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <span class="text-sm text-gray-500 dark:text-gray-400">{t("common.total")}:</span>
            <span class="ml-2 font-bold text-gray-900 dark:text-white">{filteredCategories.length}</span>
        </div>
    </div>

    <!-- Categories Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {#if $categoriesQuery.isLoading}
            {#each Array(8) as _, i (i)}
                <div class="bg-white dark:bg-gray-800 rounded-xl p-6 animate-pulse shadow-sm">
                    <div class="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl mb-4"></div>
                    <div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2"></div>
                    <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                </div>
            {/each}
        {:else if $categoriesQuery.isError}
            <div class="col-span-full flex flex-col items-center justify-center py-16 gap-4">
                <div class="p-4 bg-danger-50 dark:bg-danger-900/30 rounded-full">
                    <AlertCircle class="w-10 h-10 text-danger-500 dark:text-danger-400" />
                </div>
                <div class="text-center">
                    <p class="font-semibold text-gray-900 dark:text-white">ໂຫຼດໝວດໝູ່ບໍ່ສຳເລັດ</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ກວດສອບການເຊື່ອມຕໍ່ ແລ້ວລອງໃໝ່</p>
                </div>
                <button
                    onclick={() => $categoriesQuery.refetch()}
                    class="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-xl text-sm font-medium hover:bg-purple-600 transition-all"
                >
                    <RefreshCw class="w-4 h-4" />
                    ລອງໃໝ່
                </button>
            </div>
        {:else if paginatedCategories.length === 0}
            <div class="col-span-full text-center py-12 text-gray-500">
                <Tags class="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                <p class="text-lg font-medium text-gray-900 dark:text-white">{t("common.noData")}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("common.addNew")}</p>
            </div>
        {:else}
            {#each paginatedCategories as category (category.id)}
                <div
                    class="bg-white dark:bg-gray-800 rounded-xl p-6 relative group shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-700"
                >
                    <!-- Action Buttons -->
                    <div
                        class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
                    >
                        {#if canUpdateCat}
                        <button
                            onclick={() => openEdit(category)}
                            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                            title={t("common.edit")}
                        >
                            <Pencil class="w-4 h-4 text-gray-500 dark:text-gray-400 hover:text-purple-500" />
                        </button>
                        {/if}
                        {#if canDeleteCat}
                        <button
                            onclick={() => confirmDelete(category)}
                            class="p-2 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded-lg transition-all"
                            title={t("common.delete")}
                        >
                            <Trash2 class="w-4 h-4 text-gray-500 dark:text-gray-400 hover:text-danger-500" />
                        </button>
                        {/if}
                    </div>

                    <!-- Icon -->
                    <div
                        class="w-12 h-12 rounded-xl mb-4 flex items-center justify-center"
                        style="background-color: {category.color || '#3B82F6'}20"
                    >
                        <Tags
                            class="w-6 h-6"
                            style="color: {category.color || '#3B82F6'}"
                        />
                    </div>

                    <!-- Info -->
                    <h3 class="font-semibold text-gray-900 dark:text-white mb-1">
                        {category.name}
                    </h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {category.productCount || 0} {t("nav.products")}
                    </p>

                    <!-- Inactive Badge -->
                    {#if !category.isActive}
                        <span
                            class="absolute top-4 left-4 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded-full"
                        >
                            {t("common.inactive")}
                        </span>
                    {/if}
                </div>
            {/each}
        {/if}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="flex items-center justify-center gap-2 mt-6">
            <button
                onclick={() => (currentPage = Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all bg-white dark:bg-gray-800"
            >
                <ChevronLeft class="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            
            <div class="flex gap-1">
                {#each Array(Math.min(totalPages, 5)) as _, i (i)}
                    {@const pageNum = totalPages <= 5 ? i + 1 : (currentPage <= 3 ? i + 1 : currentPage + i - 2)}
                    {#if pageNum >= 1 && pageNum <= totalPages}
                        <button
                            onclick={() => (currentPage = pageNum)}
                            class={cn(
                                "w-10 h-10 rounded-lg font-medium transition-all",
                                currentPage === pageNum
                                    ? "bg-purple-500 text-white shadow-lg"
                                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                            )}
                        >
                            {pageNum}
                        </button>
                    {/if}
                {/each}
            </div>
            
            <button
                onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all bg-white dark:bg-gray-800"
            >
                <ChevronRight class="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
        </div>
        
        <p class="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
            {t("common.showing")} {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredCategories.length)} {t("common.of")} {filteredCategories.length}
        </p>
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onclick={closeModal}
    >
        <div
            class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl"
            onclick={(e) => e.stopPropagation()}
        >
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-500 to-pink-600 rounded-t-2xl">
                <h3 class="text-lg font-semibold text-white">
                    {editingCategory ? t("common.edit") : t("common.addNew")}
                </h3>
                <button onclick={closeModal} class="p-1 hover:bg-white/20 rounded-lg transition-all">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>
            
            <!-- Form -->
            <form onsubmit={handleSubmit} class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("common.name")} *
                    </label>
                    <input
                        type="text"
                        bind:value={form.name}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("common.description")}
                    </label>
                    <textarea
                        bind:value={form.description}
                        rows="2"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    ></textarea>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ສີ
                    </label>
                    <div class="flex gap-2 flex-wrap">
                        {#each colors as color (color)}
                            <button
                                type="button"
                                onclick={() => (form.color = color)}
                                class={cn(
                                    "w-8 h-8 rounded-full transition-all",
                                    form.color === color
                                        ? "scale-110 ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800"
                                        : "hover:scale-110"
                                )}
                                style="background-color: {color}"
                            ></button>
                        {/each}
                    </div>
                </div>
                
                <label class="flex items-center gap-3 cursor-pointer">
                    <div class="relative">
                        <input
                            type="checkbox"
                            bind:checked={form.isActive}
                            class="sr-only peer"
                        />
                        <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                    </div>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("common.active")}</span>
                </label>
                
                <!-- Actions -->
                <div class="flex gap-3 pt-4">
                    <button
                        type="button"
                        onclick={closeModal}
                        class="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="submit"
                        disabled={$createMutate.isPending || $updateMutate.isPending}
                        class="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-600 text-white font-medium hover:from-purple-600 hover:to-pink-700 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {#if $createMutate.isPending || $updateMutate.isPending}
                            <Loader2 class="w-4 h-4 animate-spin" />
                        {/if}
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
