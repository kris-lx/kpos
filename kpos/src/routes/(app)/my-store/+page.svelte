<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { api } from "$lib/api";
    import { toast } from "svelte-sonner";
    import { auth } from "$lib/stores/auth.svelte";
    import { goto } from "$app/navigation";
    import { 
        Store, Settings, Users, Building2, MapPin, Phone, Mail, 
        Clock, CheckCircle, XCircle, Edit, Save, X, Loader2,
        BarChart3, Package, ShoppingCart, TrendingUp, Calendar,
        Plus, Eye, Trash2, Power, PowerOff
    } from "lucide-svelte";

    const queryClient = useQueryClient();

    // Check if user has a store
    const user = auth.user;
    const storeId = user?.storeId;

    // Get store details
    const storeQuery = createQuery({
        queryKey: ["my-store", storeId],
        queryFn: async () => {
            if (!storeId) return null;
            const response = await api.get(`admin/stores/${storeId}/details`).json<any>();
            return response.data;
        },
        enabled: !!storeId
    });

    // Get store stats
    const statsQuery = createQuery({
        queryKey: ["my-store-stats", storeId],
        queryFn: async () => {
            if (!storeId) return null;
            const response = await api.get(`admin/stores/${storeId}/stats`).json<any>();
            return response.data;
        },
        enabled: !!storeId
    });

    // Get store branches
    const branchesQuery = createQuery({
        queryKey: ["my-store-branches", storeId],
        queryFn: async () => {
            if (!storeId) return [];
            const response = await api.get(`admin/stores/${storeId}/branches`).json<any>();
            return response.data || [];
        },
        enabled: !!storeId
    });

    // Get store users
    const usersQuery = createQuery({
        queryKey: ["my-store-users", storeId],
        queryFn: async () => {
            if (!storeId) return [];
            const response = await api.get(`admin/stores/${storeId}/users`).json<any>();
            return response.data || [];
        },
        enabled: !!storeId
    });

    // Update store mutation
    const updateStoreMutation = createMutation({
        mutationFn: async (data: any) => {
            return api.put(`admin/stores/${storeId}/update`, { json: data }).json();
        },
        onSuccess: () => {
            toast.success("ອັບເດດຮ້ານສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["my-store"] });
            isEditing = false;
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    // Toggle store status
    const toggleStatusMutation = createMutation({
        mutationFn: async (isActive: boolean) => {
            return api.patch(`admin/stores/${storeId}/status`, { json: { isActive } }).json();
        },
        onSuccess: () => {
            toast.success("ອັບເດດສະຖານະສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["my-store"] });
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    let isEditing = $state(false);
    let activeTab = $state<"overview" | "branches" | "users" | "settings">("overview");

    let editForm = $state({
        name: "",
        address: "",
        phone: "",
        email: "",
        description: ""
    });

    function startEditing() {
        if ($storeQuery.data) {
            editForm = {
                name: $storeQuery.data.name || "",
                address: $storeQuery.data.address || "",
                phone: $storeQuery.data.phone || "",
                email: $storeQuery.data.email || "",
                description: $storeQuery.data.description || ""
            };
            isEditing = true;
        }
    }

    function cancelEditing() {
        isEditing = false;
    }

    function saveChanges() {
        $updateStoreMutation.mutate(editForm);
    }

    function formatDate(date: string) {
        return new Date(date).toLocaleDateString("lo-LA", {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function formatCurrency(amount: number) {
        return new Intl.NumberFormat("lo-LA").format(amount) + " ₭";
    }
</script>

<svelte:head>
    <title>ຮ້ານຂອງຂ້ອຍ | KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <div class="max-w-7xl mx-auto space-y-6">
        {#if !storeId}
            <!-- No Store -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
                <Store class="w-20 h-20 text-gray-300 dark:text-gray-600 mx-auto" />
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white mt-6">ທ່ານຍັງບໍ່ມີຮ້ານ</h2>
                <p class="text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
                    ສົ່ງຄຳຂໍເປີດຮ້ານໃໝ່ເພື່ອເລີ່ມຕົ້ນໃຊ້ງານລະບົບ KPOS
                </p>
                <button
                    onclick={() => goto("/store-request")}
                    class="mt-6 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors inline-flex items-center gap-2"
                >
                    <Plus class="w-5 h-5" />
                    ຂໍເປີດຮ້ານໃໝ່
                </button>
            </div>
        {:else if $storeQuery.isLoading}
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
                <Loader2 class="w-12 h-12 animate-spin text-primary-600 mx-auto" />
                <p class="text-gray-500 dark:text-gray-400 mt-4">ກຳລັງໂຫຼດຂໍ້ມູນຮ້ານ...</p>
            </div>
        {:else if $storeQuery.data}
            <!-- Store Header -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div class="flex items-center gap-4">
                        <div class="p-4 bg-primary-100 dark:bg-primary-900/30 rounded-2xl">
                            <Store class="w-10 h-10 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                            <div class="flex items-center gap-3">
                                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                                    {$storeQuery.data.name}
                                </h1>
                                <span class="px-2.5 py-1 rounded-full text-xs font-medium {$storeQuery.data.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}">
                                    {$storeQuery.data.isActive ? "ເປີດໃຊ້ງານ" : "ປິດໃຊ້ງານ"}
                                </span>
                            </div>
                            <p class="text-gray-500 dark:text-gray-400 mt-1">
                                ລະຫັດ: {$storeQuery.data.code} • ສ້າງເມື່ອ: {formatDate($storeQuery.data.createdAt)}
                            </p>
                        </div>
                    </div>
                    <div class="flex gap-3">
                        <button
                            onclick={() => $toggleStatusMutation.mutate(!$storeQuery.data.isActive)}
                            class="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {#if $storeQuery.data.isActive}
                                <PowerOff class="w-5 h-5" />
                                ປິດຮ້ານ
                            {:else}
                                <Power class="w-5 h-5" />
                                ເປີດຮ້ານ
                            {/if}
                        </button>
                        <button
                            onclick={startEditing}
                            class="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
                        >
                            <Edit class="w-5 h-5" />
                            ແກ້ໄຂຂໍ້ມູນ
                        </button>
                    </div>
                </div>
            </div>

            <!-- Tabs -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div class="border-b border-gray-200 dark:border-gray-700">
                    <nav class="flex gap-1 p-2">
                        <button
                            onclick={() => activeTab = "overview"}
                            class="px-4 py-2.5 rounded-lg font-medium transition-colors {activeTab === 'overview' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                        >
                            <BarChart3 class="w-5 h-5 inline-block mr-2" />
                            ພາບລວມ
                        </button>
                        <button
                            onclick={() => activeTab = "branches"}
                            class="px-4 py-2.5 rounded-lg font-medium transition-colors {activeTab === 'branches' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                        >
                            <Building2 class="w-5 h-5 inline-block mr-2" />
                            ສາຂາ ({$branchesQuery.data?.length || 0})
                        </button>
                        <button
                            onclick={() => activeTab = "users"}
                            class="px-4 py-2.5 rounded-lg font-medium transition-colors {activeTab === 'users' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                        >
                            <Users class="w-5 h-5 inline-block mr-2" />
                            ພະນັກງານ ({$usersQuery.data?.length || 0})
                        </button>
                        <button
                            onclick={() => activeTab = "settings"}
                            class="px-4 py-2.5 rounded-lg font-medium transition-colors {activeTab === 'settings' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                        >
                            <Settings class="w-5 h-5 inline-block mr-2" />
                            ຕັ້ງຄ່າ
                        </button>
                    </nav>
                </div>

                <div class="p-6">
                    {#if activeTab === "overview"}
                        <!-- Stats Grid -->
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <p class="text-blue-100 text-sm">ຍອດຂາຍມື້ນີ້</p>
                                        <p class="text-2xl font-bold mt-1">
                                            {formatCurrency($statsQuery.data?.todaySales || 0)}
                                        </p>
                                    </div>
                                    <ShoppingCart class="w-10 h-10 text-blue-200" />
                                </div>
                            </div>
                            <div class="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <p class="text-emerald-100 text-sm">ອໍເດີມື້ນີ້</p>
                                        <p class="text-2xl font-bold mt-1">
                                            {$statsQuery.data?.todayOrders || 0}
                                        </p>
                                    </div>
                                    <Package class="w-10 h-10 text-emerald-200" />
                                </div>
                            </div>
                            <div class="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-5 text-white">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <p class="text-purple-100 text-sm">ສິນຄ້າທັງໝົດ</p>
                                        <p class="text-2xl font-bold mt-1">
                                            {$statsQuery.data?.totalProducts || 0}
                                        </p>
                                    </div>
                                    <Package class="w-10 h-10 text-purple-200" />
                                </div>
                            </div>
                            <div class="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-5 text-white">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <p class="text-orange-100 text-sm">ພະນັກງານ</p>
                                        <p class="text-2xl font-bold mt-1">
                                            {$usersQuery.data?.length || 0}
                                        </p>
                                    </div>
                                    <Users class="w-10 h-10 text-orange-200" />
                                </div>
                            </div>
                        </div>

                        <!-- Store Info -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="space-y-4">
                                <h3 class="font-semibold text-gray-900 dark:text-white">ຂໍ້ມູນຮ້ານ</h3>
                                <div class="space-y-3">
                                    <div class="flex items-start gap-3">
                                        <MapPin class="w-5 h-5 text-gray-400 mt-0.5" />
                                        <div>
                                            <p class="text-sm text-gray-500 dark:text-gray-400">ທີ່ຢູ່</p>
                                            <p class="text-gray-900 dark:text-white">{$storeQuery.data.address || "-"}</p>
                                        </div>
                                    </div>
                                    <div class="flex items-start gap-3">
                                        <Phone class="w-5 h-5 text-gray-400 mt-0.5" />
                                        <div>
                                            <p class="text-sm text-gray-500 dark:text-gray-400">ເບີໂທ</p>
                                            <p class="text-gray-900 dark:text-white">{$storeQuery.data.phone || "-"}</p>
                                        </div>
                                    </div>
                                    <div class="flex items-start gap-3">
                                        <Mail class="w-5 h-5 text-gray-400 mt-0.5" />
                                        <div>
                                            <p class="text-sm text-gray-500 dark:text-gray-400">ອີເມວ</p>
                                            <p class="text-gray-900 dark:text-white">{$storeQuery.data.email || "-"}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="space-y-4">
                                <h3 class="font-semibold text-gray-900 dark:text-white">ສາຂາ</h3>
                                {#if $branchesQuery.data?.length}
                                    <div class="space-y-2">
                                        {#each $branchesQuery.data.slice(0, 3) as branch}
                                            <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                                <div class="flex items-center gap-3">
                                                    <Building2 class="w-5 h-5 text-gray-400" />
                                                    <span class="text-gray-900 dark:text-white">{branch.name}</span>
                                                </div>
                                                <span class="text-sm text-gray-500">{branch.code}</span>
                                            </div>
                                        {/each}
                                    </div>
                                {:else}
                                    <p class="text-gray-500 dark:text-gray-400">ບໍ່ມີສາຂາ</p>
                                {/if}
                            </div>
                        </div>
                    {:else if activeTab === "branches"}
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <h3 class="font-semibold text-gray-900 dark:text-white">ສາຂາທັງໝົດ</h3>
                                <button class="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors">
                                    <Plus class="w-4 h-4" />
                                    ເພີ່ມສາຂາ
                                </button>
                            </div>
                            {#if $branchesQuery.data?.length}
                                <div class="grid gap-4">
                                    {#each $branchesQuery.data as branch}
                                        <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                            <div class="flex items-center gap-4">
                                                <div class="p-3 bg-white dark:bg-gray-600 rounded-lg">
                                                    <Building2 class="w-6 h-6 text-primary-600 dark:text-primary-400" />
                                                </div>
                                                <div>
                                                    <h4 class="font-medium text-gray-900 dark:text-white">{branch.name}</h4>
                                                    <p class="text-sm text-gray-500 dark:text-gray-400">
                                                        {branch.code} • {branch.address || "ບໍ່ມີທີ່ຢູ່"}
                                                    </p>
                                                </div>
                                            </div>
                                            <div class="flex items-center gap-2">
                                                <span class="px-2.5 py-1 rounded-full text-xs font-medium {branch.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                                    {branch.isActive ? "ເປີດ" : "ປິດ"}
                                                </span>
                                                <button class="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">
                                                    <Edit class="w-4 h-4 text-gray-500" />
                                                </button>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {:else}
                                <div class="text-center py-12">
                                    <Building2 class="w-12 h-12 text-gray-300 mx-auto" />
                                    <p class="text-gray-500 mt-4">ບໍ່ມີສາຂາ</p>
                                </div>
                            {/if}
                        </div>
                    {:else if activeTab === "users"}
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <h3 class="font-semibold text-gray-900 dark:text-white">ພະນັກງານທັງໝົດ</h3>
                                <button class="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors">
                                    <Plus class="w-4 h-4" />
                                    ເພີ່ມພະນັກງານ
                                </button>
                            </div>
                            {#if $usersQuery.data?.length}
                                <div class="overflow-x-auto">
                                    <table class="w-full">
                                        <thead>
                                            <tr class="border-b border-gray-200 dark:border-gray-700">
                                                <th class="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">ຊື່</th>
                                                <th class="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">ອີເມວ</th>
                                                <th class="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">ບົດບາດ</th>
                                                <th class="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">ສະຖານະ</th>
                                                <th class="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">ການກະທຳ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {#each $usersQuery.data as user}
                                                <tr class="border-b border-gray-100 dark:border-gray-700/50">
                                                    <td class="py-3 px-4">
                                                        <span class="font-medium text-gray-900 dark:text-white">{user.name}</span>
                                                    </td>
                                                    <td class="py-3 px-4 text-gray-600 dark:text-gray-400">{user.email}</td>
                                                    <td class="py-3 px-4">
                                                        <span class="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs">
                                                            {user.role || "Staff"}
                                                        </span>
                                                    </td>
                                                    <td class="py-3 px-4">
                                                        <span class="px-2.5 py-1 rounded-full text-xs font-medium {user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                                            {user.isActive ? "ເປີດ" : "ປິດ"}
                                                        </span>
                                                    </td>
                                                    <td class="py-3 px-4 text-right">
                                                        <button class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                                            <Edit class="w-4 h-4 text-gray-500" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                        </tbody>
                                    </table>
                                </div>
                            {:else}
                                <div class="text-center py-12">
                                    <Users class="w-12 h-12 text-gray-300 mx-auto" />
                                    <p class="text-gray-500 mt-4">ບໍ່ມີພະນັກງານ</p>
                                </div>
                            {/if}
                        </div>
                    {:else if activeTab === "settings"}
                        <div class="space-y-6">
                            <h3 class="font-semibold text-gray-900 dark:text-white">ຕັ້ງຄ່າຮ້ານ</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div class="space-y-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຊື່ຮ້ານ</label>
                                        <input
                                            type="text"
                                            value={$storeQuery.data.name}
                                            disabled
                                            class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ລະຫັດຮ້ານ</label>
                                        <input
                                            type="text"
                                            value={$storeQuery.data.code}
                                            disabled
                                            class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                </div>
                                <div class="space-y-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເບີໂທ</label>
                                        <input
                                            type="text"
                                            value={$storeQuery.data.phone || ""}
                                            disabled
                                            class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ອີເມວ</label>
                                        <input
                                            type="text"
                                            value={$storeQuery.data.email || ""}
                                            disabled
                                            class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                </div>
                            </div>
                            <button
                                onclick={startEditing}
                                class="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
                            >
                                <Edit class="w-5 h-5" />
                                ແກ້ໄຂຂໍ້ມູນ
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </div>
</div>

<!-- Edit Modal -->
{#if isEditing}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg">
            <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">ແກ້ໄຂຂໍ້ມູນຮ້ານ</h2>
            </div>

            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຊື່ຮ້ານ</label>
                    <input
                        type="text"
                        bind:value={editForm.name}
                        class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ທີ່ຢູ່</label>
                    <textarea
                        bind:value={editForm.address}
                        rows="2"
                        class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                    ></textarea>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເບີໂທ</label>
                        <input
                            type="tel"
                            bind:value={editForm.phone}
                            class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ອີເມວ</label>
                        <input
                            type="email"
                            bind:value={editForm.email}
                            class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                </div>
            </div>

            <div class="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button
                    onclick={cancelEditing}
                    class="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                    ຍົກເລີກ
                </button>
                <button
                    onclick={saveChanges}
                    disabled={$updateStoreMutation.isPending}
                    class="flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                    {#if $updateStoreMutation.isPending}
                        <Loader2 class="w-5 h-5 animate-spin" />
                    {:else}
                        <Save class="w-5 h-5" />
                    {/if}
                    ບັນທຶກ
                </button>
            </div>
        </div>
    </div>
{/if}
