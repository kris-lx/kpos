<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { api } from "$api";
    import { auth } from "$stores";
    import { cn } from "$utils";
    import { toast } from "svelte-sonner";
    import {
        Plus,
        Search,
        Building2,
        MapPin,
        Phone,
        Users,
        Pencil,
        Trash2,
        X,
        Loader2,
    } from "lucide-svelte";

    const queryClient = useQueryClient();
    
    let searchQuery = $state("");
    let showModal = $state(false);
    let showDeleteModal = $state(false);
    let editingBranch = $state<any>(null);
    let deletingBranch = $state<any>(null);
    
    // Form state
    let formData = $state({
        name: "",
        code: "",
        address: "",
        phone: "",
        email: "",
        isMain: false,
    });

    const branchesQuery = createQuery({
        queryKey: ["branches", searchQuery],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (searchQuery) params.append("search", searchQuery);
            const response = await api.get(`branches?${params}`).json<any>();
            return response.data || [];
        },
    });
    
    // Create mutation
    const createMut = createMutation({
        mutationFn: async (data: typeof formData) => {
            const response = await api.post("branches", { json: data }).json<any>();
            return response.data;
        },
        onSuccess: () => {
            toast.success("ເພີ່ມສາຂາສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["branches"] });
            closeModal();
        },
        onError: (error: any) => {
            toast.error(error?.message || "ເກີດຂໍ້ຜິດພາດ");
        },
    });
    
    // Update mutation
    const updateMut = createMutation({
        mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
            const response = await api.put(`branches/${id}`, { json: data }).json<any>();
            return response.data;
        },
        onSuccess: () => {
            toast.success("ແກ້ໄຂສາຂາສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["branches"] });
            closeModal();
        },
        onError: (error: any) => {
            toast.error(error?.message || "ເກີດຂໍ້ຜິດພາດ");
        },
    });
    
    // Delete mutation
    const deleteMut = createMutation({
        mutationFn: async (id: string) => {
            const response = await api.delete(`branches/${id}`).json<any>();
            return response;
        },
        onSuccess: () => {
            toast.success("ລົບສາຂາສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["branches"] });
            closeDeleteModal();
        },
        onError: (error: any) => {
            toast.error(error?.message || "ເກີດຂໍ້ຜິດພາດ");
        },
    });
    
    function openCreate() {
        editingBranch = null;
        formData = { name: "", code: "", address: "", phone: "", email: "", isMain: false };
        showModal = true;
    }
    
    function openEdit(branch: any) {
        editingBranch = branch;
        formData = {
            name: branch.name || "",
            code: branch.code || "",
            address: branch.address || "",
            phone: branch.phone || "",
            email: branch.email || "",
            isMain: branch.isMain || false,
        };
        showModal = true;
    }
    
    function openDelete(branch: any) {
        deletingBranch = branch;
        showDeleteModal = true;
    }
    
    function closeModal() {
        showModal = false;
        editingBranch = null;
    }
    
    function closeDeleteModal() {
        showDeleteModal = false;
        deletingBranch = null;
    }
    
    function handleSubmit() {
        if (!formData.name || !formData.code) {
            toast.error("ກະລຸນາປ້ອນຊື່ ແລະ ລະຫັດສາຂາ");
            return;
        }
        
        if (editingBranch) {
            $updateMut.mutate({ id: editingBranch.id, data: formData });
        } else {
            $createMut.mutate(formData);
        }
    }
    
    function handleDelete() {
        if (deletingBranch) {
            $deleteMut.mutate(deletingBranch.id);
        }
    }
    
    const isLoading = $derived($createMut.isPending || $updateMut.isPending);
</script>

<svelte:head>
    <title>ສາຂາ - KPOS</title>
</svelte:head>

<div class="p-6">
    <div class="flex items-center justify-between mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                ສາຂາ
            </h1>
            <p class="text-gray-500">ຈັດການສາຂາຮ້ານຄ້າ</p>
        </div>
        {#if auth.hasPermission("branches:create")}
            <button
                onclick={openCreate}
                class="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600"
            >
                <Plus class="w-4 h-4" />
                <span>ເພີ່ມສາຂາ</span>
            </button>
        {/if}
    </div>

    <div class="bg-white dark:bg-gray-900 rounded-xl p-4 mb-6">
        <div class="relative">
            <Search
                class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            />
            <input
                type="text"
                placeholder="ຄົ້ນຫາສາຂາ..."
                bind:value={searchQuery}
                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
            />
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#if $branchesQuery.isLoading}
            {#each Array(3) as _}
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl p-6 animate-pulse"
                >
                    <div class="flex items-center gap-4 mb-4">
                        <div
                            class="w-14 h-14 bg-gray-200 dark:bg-gray-700 rounded-xl"
                        ></div>
                        <div class="flex-1 space-y-2">
                            <div
                                class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3"
                            ></div>
                            <div
                                class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"
                            ></div>
                        </div>
                    </div>
                </div>
            {/each}
        {:else if $branchesQuery.data?.length === 0}
            <div class="col-span-full text-center py-12 text-gray-500">
                <Building2 class="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p class="text-lg font-medium">ບໍ່ພົບສາຂາ</p>
            </div>
        {:else}
            {#each $branchesQuery.data || [] as branch}
                <div
                    class="bg-white dark:bg-gray-900 rounded-xl p-6 relative group"
                >
                    <div class="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {#if auth.hasPermission("branches:update")}
                        <button
                            onclick={() => openEdit(branch)}
                            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            <Pencil class="w-4 h-4 text-gray-400" />
                        </button>
                        {/if}
                        {#if auth.hasPermission("branches:delete")}
                        <button
                            onclick={() => openDelete(branch)}
                            class="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                        >
                            <Trash2 class="w-4 h-4 text-red-500" />
                        </button>
                        {/if}
                    </div>

                    <div class="flex items-center gap-4 mb-4">
                        <div
                            class="w-14 h-14 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center"
                        >
                            <Building2 class="w-7 h-7 text-primary-600" />
                        </div>
                        <div>
                            <h3
                                class="font-semibold text-gray-900 dark:text-white"
                            >
                                {branch.name}
                            </h3>
                            <span
                                class={cn(
                                    "text-xs px-2 py-0.5 rounded-full",
                                    branch.isActive
                                        ? "bg-success-100 text-success-700"
                                        : "bg-gray-100 text-gray-500",
                                )}
                            >
                                {branch.isActive ? "ເປີດໃຊ້ງານ" : "ປິດໃຊ້ງານ"}
                            </span>
                        </div>
                    </div>

                    <div class="space-y-2 text-sm text-gray-500">
                        {#if branch.address}
                            <div class="flex items-start gap-2">
                                <MapPin class="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{branch.address}</span>
                            </div>
                        {/if}
                        {#if branch.phone}
                            <div class="flex items-center gap-2">
                                <Phone class="w-4 h-4" />
                                <span>{branch.phone}</span>
                            </div>
                        {/if}
                        <div class="flex items-center gap-2">
                            <Users class="w-4 h-4" />
                            <span>{branch.employeeCount || 0} ພະນັກງານ</span>
                        </div>
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>

<!-- Create/Edit Modal -->
{#if showModal}
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={closeModal}>
    <div class="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg mx-4 p-6" onclick={(e) => e.stopPropagation()}>
        <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                {editingBranch ? "ແກ້ໄຂສາຂາ" : "ເພີ່ມສາຂາໃໝ່"}
            </h2>
            <button onclick={closeModal} class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X class="w-5 h-5" />
            </button>
        </div>
        
        <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຊື່ສາຂາ *</label>
                    <input
                        type="text"
                        bind:value={formData.name}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-primary-500"
                        placeholder="ສາຂາໃຫຍ່"
                        required
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ລະຫັດສາຂາ *</label>
                    <input
                        type="text"
                        bind:value={formData.code}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-primary-500"
                        placeholder="HQ"
                        required
                    />
                </div>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ທີ່ຢູ່</label>
                <input
                    type="text"
                    bind:value={formData.address}
                    class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-primary-500"
                    placeholder="ນະຄອນຫຼວງວຽງຈັນ"
                />
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເບີໂທ</label>
                    <input
                        type="text"
                        bind:value={formData.phone}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-primary-500"
                        placeholder="+856 20 1234 5678"
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ອີເມວ</label>
                    <input
                        type="email"
                        bind:value={formData.email}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-primary-500"
                        placeholder="branch@kpos.la"
                    />
                </div>
            </div>
            
            <div class="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="isMain"
                    bind:checked={formData.isMain}
                    class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label for="isMain" class="text-sm text-gray-700 dark:text-gray-300">ສາຂາຫຼັກ</label>
            </div>
            
            <div class="flex gap-3 pt-4">
                <button
                    type="button"
                    onclick={closeModal}
                    class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    ຍົກເລີກ
                </button>
                <button
                    type="submit"
                    disabled={isLoading}
                    class="flex-1 px-4 py-2.5 rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {#if isLoading}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {/if}
                    {editingBranch ? "ບັນທຶກ" : "ເພີ່ມ"}
                </button>
            </div>
        </form>
    </div>
</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal && deletingBranch}
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={closeDeleteModal}>
    <div class="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md mx-4 p-6" onclick={(e) => e.stopPropagation()}>
        <div class="text-center">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 class="w-8 h-8 text-red-500" />
            </div>
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-2">ຢືນຢັນການລົບ</h2>
            <p class="text-gray-500 mb-6">
                ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລົບສາຂາ <strong>{deletingBranch.name}</strong>?
            </p>
            
            <div class="flex gap-3">
                <button
                    onclick={closeDeleteModal}
                    class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    ຍົກເລີກ
                </button>
                <button
                    onclick={handleDelete}
                    disabled={$deleteMut.isPending}
                    class="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {#if $deleteMut.isPending}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {/if}
                    ລົບ
                </button>
            </div>
        </div>
    </div>
</div>
{/if}
