<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { api } from "$lib/api";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { cn } from "$lib/utils";
    import {
        Building2,
        Search,
        ChevronLeft,
        ChevronRight,
        Eye,
        Loader2,
        Plus,
        Pencil,
        Trash2,
        Store,
        MapPin,
        Phone,
        Mail,
        ArrowLeft,
        X,
        Sparkles,
        Users,
        Calendar,
        CheckCircle,
        XCircle,
        AlertTriangle
    } from "lucide-svelte";

    import { auth } from "$lib/stores/auth.svelte";

    const queryClient = useQueryClient();

    let canAccess = $state(false);
    let userRole = $state<string>('');
    let userStoreId = $state<string | null>(null);
    let isSuperAdmin = $state(false);
    
    onMount(async () => {
        try {
            const user = auth.user;
            if (!user) {
                goto("/login");
                return;
            }
            isSuperAdmin = user.isSuperAdmin || false;
            userRole = user.isSuperAdmin ? 'super_admin' : user.role;
            userStoreId = (user as any).storeId || null;
            
            // Super Admin, Admin ເຫັນທຸກສາຂາ; Shop Admin, Manager ເຫັນສະເພາະສາຂາຂອງຮ້ານຕົນເອງ
            if (user.isSuperAdmin || ['admin', 'shop_admin', 'manager'].includes(user.role)) {
                canAccess = true;
            } else {
                toast.error("ທ່ານບໍ່ມີສິດເຂົ້າເຖິງໜ້ານີ້");
                goto("/dashboard");
            }
        } catch {
            goto("/dashboard");
        }
    });

    let searchQuery = $state("");
    let currentPage = $state(1);
    let pageSize = $state(20);
    let pageSizeOptions = [5, 10, 20, 50, 100];

    const branchesQuery = createQuery({
        queryKey: ["admin-branches"],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (searchQuery) params.append("search", searchQuery);
            params.append("page", String(currentPage));
            params.append("limit", String(pageSize));
            const response = await api.get(`admin/branches?${params}`).json<any>();
            return response;
        },
    });

    $effect(() => {
        currentPage; pageSize; searchQuery;
        $branchesQuery.refetch();
    });

    const storesQuery = createQuery({
        queryKey: ["admin-stores-list"],
        queryFn: async () => {
            const response = await api.get("admin/stores?limit=1000").json<any>();
            return response.data || [];
        }
    });

    const createMutationFn = createMutation({
        mutationFn: async (data: any) => {
            return api.post("admin/branches", { json: data }).json();
        },
        onSuccess: () => {
            toast.success("ສ້າງສາຂາສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
            showFormModal = false;
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    const updateMutationFn = createMutation({
        mutationFn: async ({ id, data }: { id: string; data: any }) => {
            return api.put(`admin/branches/${id}`, { json: data }).json();
        },
        onSuccess: () => {
            toast.success("ອັບເດດສາຂາສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
            showFormModal = false;
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    const deleteMutationFn = createMutation({
        mutationFn: async (id: string) => {
            return api.delete(`admin/branches/${id}`).json();
        },
        onSuccess: () => {
            toast.success("ລຶບສາຂາສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
            showDeleteModal = false;
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    let showFormModal = $state(false);
    let showDetailModal = $state(false);
    let showDeleteModal = $state(false);
    let selectedBranch = $state<any>(null);
    let isEditing = $state(false);

    let formData = $state({
        name: "",
        code: "",
        storeId: "",
        address: "",
        phone: "",
        email: "",
        isActive: true
    });

    function openCreateModal() {
        isEditing = false;
        formData = { name: "", code: "", storeId: "", address: "", phone: "", email: "", isActive: true };
        showFormModal = true;
    }

    function openEditModal(branch: any) {
        isEditing = true;
        selectedBranch = branch;
        formData = {
            name: branch.name || "",
            code: branch.code || "",
            storeId: branch.storeId || branch.store?.id || "",
            address: branch.address || "",
            phone: branch.phone || "",
            email: branch.email || "",
            isActive: branch.isActive !== false
        };
        showFormModal = true;
    }

    function openDetailModal(branch: any) {
        selectedBranch = branch;
        showDetailModal = true;
    }

    function openDeleteModal(branch: any) {
        selectedBranch = branch;
        showDeleteModal = true;
    }

    function handleSubmit() {
        if (!formData.name.trim() || !formData.code.trim()) {
            toast.error("ກະລຸນາປ້ອນຊື່ ແລະ ລະຫັດສາຂາ");
            return;
        }
        if (isEditing && selectedBranch) {
            $updateMutationFn.mutate({ id: selectedBranch.id, data: formData });
        } else {
            $createMutationFn.mutate(formData);
        }
    }

    function handleDelete() {
        if (selectedBranch) {
            $deleteMutationFn.mutate(selectedBranch.id);
        }
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString("lo-LA", {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function goToPage(page: number) {
        const totalPages = $branchesQuery.data?.meta?.totalPages || 1;
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
        }
    }

    function changePageSize(size: number) {
        pageSize = size;
        currentPage = 1;
    }

    let totalItems = $derived($branchesQuery.data?.meta?.total || 0);
    let totalPages = $derived($branchesQuery.data?.meta?.totalPages || 1);
</script>

<svelte:head>
    <title>ຈັດການສາຂາ - Super Admin</title>
</svelte:head>

{#if !canAccess}
    <div class="flex items-center justify-center h-screen">
        <Loader2 class="h-12 w-12 animate-spin text-violet-500" />
    </div>
{:else}
    <div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div class="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <!-- Header -->
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div class="flex items-center gap-4">
                    <a href="/admin" class="w-10 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">
                        <ArrowLeft class="w-5 h-5" />
                    </a>
                    <div class="w-14 h-14 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/25">
                        <Building2 class="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 class="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">ຈັດການສາຂາ</h1>
                        <p class="text-gray-500 dark:text-gray-400">ເບິ່ງ ແລະ ຈັດການສາຂາທັງໝົດ</p>
                    </div>
                </div>
                <button onclick={openCreateModal} class="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:scale-105">
                    <Plus class="w-5 h-5" />
                    <span>ເພີ່ມສາຂາ</span>
                </button>
            </div>

            <!-- Search -->
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none p-5">
                <div class="relative">
                    <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input 
                        type="text" 
                        bind:value={searchQuery}
                        placeholder="ຄົ້ນຫາສາຂາ..." 
                        class="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            <!-- Branches Grid -->
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                {#if $branchesQuery.isLoading}
                    <div class="p-12 text-center">
                        <Loader2 class="w-10 h-10 animate-spin mx-auto text-blue-500" />
                        <p class="text-gray-500 dark:text-gray-400 mt-4">ກຳລັງໂຫຼດ...</p>
                    </div>
                {:else if !$branchesQuery.data?.data?.length}
                    <div class="p-16 text-center">
                        <div class="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Building2 class="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">ບໍ່ພົບສາຂາ</h3>
                        <p class="text-gray-500 dark:text-gray-400 mb-4">ບໍ່ມີສາຂາທີ່ກົງກັບເງື່ອນໄຂການຄົ້ນຫາ</p>
                        <button onclick={openCreateModal} class="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors">
                            <Plus class="w-4 h-4" />
                            ເພີ່ມສາຂາໃໝ່
                        </button>
                    </div>
                {:else}
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
                        {#each $branchesQuery.data.data as branch}
                            <div class="bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all group">
                                <div class="p-5">
                                    <div class="flex items-start justify-between mb-4">
                                        <div class="flex items-center gap-3">
                                            <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg">
                                                <Building2 class="w-6 h-6 text-white" />
                                            </div>
                                            <div>
                                                <h3 class="font-semibold text-gray-900 dark:text-white">{branch.name}</h3>
                                                <p class="text-sm text-gray-500 dark:text-gray-400">{branch.code}</p>
                                            </div>
                                        </div>
                                        <span class={cn(
                                            "px-2.5 py-1 rounded-full text-xs font-medium",
                                            branch.isActive !== false 
                                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                                : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                        )}>
                                            {branch.isActive !== false ? "ເປີດໃຊ້" : "ປິດໃຊ້"}
                                        </span>
                                    </div>

                                    {#if branch.store}
                                        <div class="flex items-center gap-2 mb-3 text-sm text-gray-600 dark:text-gray-400">
                                            <Store class="w-4 h-4" />
                                            <span>{branch.store.name}</span>
                                        </div>
                                    {/if}

                                    {#if branch.address}
                                        <div class="flex items-start gap-2 mb-2 text-sm text-gray-500 dark:text-gray-400">
                                            <MapPin class="w-4 h-4 mt-0.5 shrink-0" />
                                            <span class="line-clamp-2">{branch.address}</span>
                                        </div>
                                    {/if}

                                    <div class="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                                        {#if branch._count?.users !== undefined}
                                            <span class="flex items-center gap-1">
                                                <Users class="w-3.5 h-3.5" />
                                                {branch._count.users} ຜູ້ໃຊ້
                                            </span>
                                        {/if}
                                        <span class="flex items-center gap-1">
                                            <Calendar class="w-3.5 h-3.5" />
                                            {formatDate(branch.createdAt)}
                                        </span>
                                    </div>
                                </div>
                                <div class="flex border-t border-gray-200 dark:border-gray-600">
                                    <button onclick={() => openDetailModal(branch)} class="flex-1 flex items-center justify-center gap-2 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors">
                                        <Eye class="w-4 h-4" />
                                        <span class="text-sm">ເບິ່ງ</span>
                                    </button>
                                    <button onclick={() => openEditModal(branch)} class="flex-1 flex items-center justify-center gap-2 py-3 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-l border-r border-gray-200 dark:border-gray-600">
                                        <Pencil class="w-4 h-4" />
                                        <span class="text-sm">ແກ້ໄຂ</span>
                                    </button>
                                    <button onclick={() => openDeleteModal(branch)} class="flex-1 flex items-center justify-center gap-2 py-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                        <Trash2 class="w-4 h-4" />
                                        <span class="text-sm">ລຶບ</span>
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!-- Pagination -->
                    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 border-t border-gray-100 dark:border-gray-700">
                        <div class="flex items-center gap-2">
                            <span class="text-sm text-gray-500 dark:text-gray-400">ສະແດງ:</span>
                            <select 
                                bind:value={pageSize} 
                                onchange={() => changePageSize(pageSize)}
                                class="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
                            >
                                {#each pageSizeOptions as size}
                                    <option value={size}>{size} ລາຍການ</option>
                                {/each}
                            </select>
                            <span class="text-sm text-gray-500 dark:text-gray-400">
                                ({(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalItems)} ຈາກ {totalItems})
                            </span>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} class="w-9 h-9 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 transition-colors">
                                <ChevronLeft class="w-5 h-5" />
                            </button>
                            <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{currentPage} / {totalPages}</span>
                            <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} class="w-9 h-9 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 transition-colors">
                                <ChevronRight class="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Detail Modal -->
    {#if showDetailModal && selectedBranch}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showDetailModal = false}></div>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
                <div class="sticky top-0 bg-gradient-to-r from-blue-600 to-cyan-600 p-6 text-white">
                    <button onclick={() => showDetailModal = false} class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
                        <X class="w-5 h-5" />
                    </button>
                    <div class="flex items-center gap-3">
                        <Building2 class="w-8 h-8" />
                        <div>
                            <h3 class="text-xl font-bold">{selectedBranch.name}</h3>
                            <p class="text-sm opacity-90">{selectedBranch.code}</p>
                        </div>
                    </div>
                </div>
                <div class="p-6 space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">ສະຖານະ</p>
                            <span class={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium",
                                selectedBranch.isActive !== false 
                                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                    : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                            )}>
                                {#if selectedBranch.isActive !== false}
                                    <CheckCircle class="w-4 h-4" />
                                {:else}
                                    <XCircle class="w-4 h-4" />
                                {/if}
                                {selectedBranch.isActive !== false ? "ເປີດໃຊ້" : "ປິດໃຊ້"}
                            </span>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">ວັນທີ່ສ້າງ</p>
                            <p class="font-medium text-gray-900 dark:text-white text-sm">{formatDate(selectedBranch.createdAt)}</p>
                        </div>
                    </div>

                    {#if selectedBranch.store}
                        <div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-100 dark:border-emerald-800/50">
                            <div class="flex items-center gap-2 mb-2">
                                <Store class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                <span class="font-semibold text-emerald-700 dark:text-emerald-300">ຮ້ານ</span>
                            </div>
                            <p class="font-medium text-gray-900 dark:text-white">{selectedBranch.store.name}</p>
                            {#if selectedBranch.store.code}
                                <p class="text-sm text-gray-500 dark:text-gray-400">{selectedBranch.store.code}</p>
                            {/if}
                        </div>
                    {/if}

                    <div class="space-y-3">
                        {#if selectedBranch.address}
                            <div class="flex items-start gap-3">
                                <MapPin class="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">ທີ່ຢູ່</p>
                                    <p class="text-gray-900 dark:text-white">{selectedBranch.address}</p>
                                </div>
                            </div>
                        {/if}
                        {#if selectedBranch.phone}
                            <div class="flex items-start gap-3">
                                <Phone class="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">ເບີໂທ</p>
                                    <p class="text-gray-900 dark:text-white">{selectedBranch.phone}</p>
                                </div>
                            </div>
                        {/if}
                        {#if selectedBranch.email}
                            <div class="flex items-start gap-3">
                                <Mail class="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">ອີເມວ</p>
                                    <p class="text-gray-900 dark:text-white">{selectedBranch.email}</p>
                                </div>
                            </div>
                        {/if}
                    </div>

                    {#if selectedBranch._count}
                        <div class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/50">
                            <div class="flex items-center gap-2 mb-2">
                                <Users class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                <span class="font-semibold text-blue-700 dark:text-blue-300">ສະຖິຕິ</span>
                            </div>
                            <p class="text-sm text-gray-600 dark:text-gray-400">ຜູ້ໃຊ້: <span class="font-medium text-gray-900 dark:text-white">{selectedBranch._count.users || 0}</span></p>
                        </div>
                    {/if}
                </div>
                <div class="flex gap-3 p-6 pt-0">
                    <button onclick={() => showDetailModal = false} class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                        ປິດ
                    </button>
                    <button onclick={() => { showDetailModal = false; openEditModal(selectedBranch); }} class="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl shadow-lg shadow-blue-500/30 transition-all">
                        ແກ້ໄຂ
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Form Modal -->
    {#if showFormModal}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showFormModal = false}></div>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
                <div class="sticky top-0 bg-gradient-to-r from-blue-600 to-cyan-600 p-6 text-white">
                    <button onclick={() => showFormModal = false} class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
                        <X class="w-5 h-5" />
                    </button>
                    <div class="flex items-center gap-3">
                        <Sparkles class="w-8 h-8" />
                        <div>
                            <h3 class="text-xl font-bold">{isEditing ? "ແກ້ໄຂສາຂາ" : "ເພີ່ມສາຂາໃໝ່"}</h3>
                            <p class="text-sm opacity-90">{isEditing ? "ອັບເດດຂໍ້ມູນສາຂາ" : "ສ້າງສາຂາໃໝ່ໃນລະບົບ"}</p>
                        </div>
                    </div>
                </div>
                <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="col-span-2 sm:col-span-1">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ຊື່ສາຂາ *</label>
                            <input
                                type="text"
                                bind:value={formData.name}
                                placeholder="ເຊັ່ນ: ສາຂາຕົ້ນຕານ"
                                class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                            />
                        </div>
                        <div class="col-span-2 sm:col-span-1">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ລະຫັດສາຂາ *</label>
                            <input
                                type="text"
                                bind:value={formData.code}
                                placeholder="ເຊັ່ນ: BR001"
                                class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ຮ້ານ</label>
                        <select
                            bind:value={formData.storeId}
                            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                        >
                            <option value="">ເລືອກຮ້ານ</option>
                            {#each $storesQuery.data || [] as store}
                                <option value={store.id}>{store.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ທີ່ຢູ່</label>
                        <textarea
                            bind:value={formData.address}
                            placeholder="ທີ່ຢູ່ສາຂາ"
                            rows="2"
                            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 dark:text-white"
                        ></textarea>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ເບີໂທ</label>
                            <input
                                type="tel"
                                bind:value={formData.phone}
                                placeholder="020 xxxx xxxx"
                                class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ອີເມວ</label>
                            <input
                                type="email"
                                bind:value={formData.email}
                                placeholder="example@email.com"
                                class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <div class="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="isActive"
                            bind:checked={formData.isActive}
                            class="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label for="isActive" class="text-sm font-medium text-gray-700 dark:text-gray-300">ເປີດໃຊ້ງານ</label>
                    </div>

                    <div class="flex gap-3 pt-4">
                        <button type="button" onclick={() => showFormModal = false} class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                            ຍົກເລີກ
                        </button>
                        <button 
                            type="submit"
                            disabled={$createMutationFn.isPending || $updateMutationFn.isPending}
                            class="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {#if $createMutationFn.isPending || $updateMutationFn.isPending}
                                <Loader2 class="w-5 h-5 animate-spin" />
                            {/if}
                            {isEditing ? "ບັນທຶກ" : "ສ້າງສາຂາ"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    {/if}

    <!-- Delete Modal -->
    {#if showDeleteModal && selectedBranch}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showDeleteModal = false}></div>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div class="p-6 text-center">
                    <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle class="w-8 h-8 text-red-600 dark:text-red-400" />
                    </div>
                    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">ລຶບສາຂາ?</h3>
                    <p class="text-gray-500 dark:text-gray-400 mb-4">ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບສາຂາ <span class="font-semibold text-gray-900 dark:text-white">"{selectedBranch.name}"</span>? ການດຳເນີນການນີ້ບໍ່ສາມາດຍ້ອນກັບໄດ້.</p>
                </div>
                <div class="flex gap-3 p-6 pt-0">
                    <button onclick={() => showDeleteModal = false} class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                        ຍົກເລີກ
                    </button>
                    <button 
                        onclick={handleDelete}
                        disabled={$deleteMutationFn.isPending}
                        class="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl shadow-lg shadow-red-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {#if $deleteMutationFn.isPending}
                            <Loader2 class="w-5 h-5 animate-spin" />
                        {/if}
                        ລຶບ
                    </button>
                </div>
            </div>
        </div>
    {/if}
{/if}
