<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { get } from "svelte/store";
    import { api } from "$lib/api";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { cn, formatDate } from "$lib/utils";
    import {
        Users,
        Search,
        ChevronLeft,
        ChevronRight,
        ChevronDown,
        Eye,
        Loader2,
        Plus,
        Pencil,
        Trash2,
        ArrowLeft,
        X,
        Sparkles,
        Calendar,
        CheckCircle,
        XCircle,
        AlertTriangle,
        Crown,
        Shield,
        Mail,
        Phone,
        Building2,
        Store,
        Filter,
        UserCheck,
        UserX,
        ShoppingCart,
        Package,
        FileText,
        Settings,
        BarChart3,
        Utensils,
        UserPlus,
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
            
            // Super Admin, Admin ຈັດການທຸກຜູ້ໃຊ້; Shop Admin, Manager ຈັດການຜູ້ໃຊ້ໃນຮ້ານ/ສາຂາຕົນເອງ
            if (user.isSuperAdmin || ['admin', 'store_owner', 'branch_admin', 'store_manager'].includes(user.role)) {
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
    let roleFilter = $state("");
    let statusFilter = $state("");
    let currentPage = $state(1);
    let pageSize = $state(20);
    let pageSizeOptions = [5, 10, 20, 50, 100];

    const usersQuery = createQuery({
        queryKey: ["admin-users"],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (searchQuery) params.append("search", searchQuery);
            if (roleFilter) params.append("role", roleFilter);
            if (statusFilter) params.append("status", statusFilter);
            params.append("page", String(currentPage));
            params.append("limit", String(pageSize));
            const response = await api.get(`admin/users?${params}`).json<any>();
            return response;
        },
    });

    $effect(() => {
        void searchQuery; void roleFilter; void statusFilter; void currentPage; void pageSize;
        $usersQuery.refetch();
    });

    const rolesQuery = createQuery({
        queryKey: ["admin-roles-list"],
        queryFn: async () => {
            const response = await api.get("admin/roles?limit=1000").json<any>();
            return response.data || [];
        }
    });

    const branchesQuery = createQuery({
        queryKey: ["admin-branches-list"],
        queryFn: async () => {
            const response = await api.get("admin/branches?limit=1000").json<any>();
            return response.data || [];
        }
    });

    // Fetch permission groups from API
    const permissionsQuery = createQuery({
        queryKey: ["admin-permissions"],
        queryFn: async () => {
            const response = await api.get("admin/permissions").json<any>();
            return response.data || [];
        }
    });

    const toggleSuperAdminMutation = createMutation({
        mutationFn: async ({ id, isSuperAdmin: value }: { id: string; isSuperAdmin: boolean }) => {
            return api.patch(`admin/users/${id}/super-admin`, { json: { isSuperAdmin: value } }).json();
        },
        onSuccess: () => {
            toast.success("ອັບເດດສຳເລັດ");
            get(usersQuery).refetch();
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    const updateMutationFn = createMutation({
        mutationFn: async ({ id, data }: { id: string; data: any }) => {
            return api.patch(`admin/users/${id}`, { json: data }).json();
        },
        onSuccess: () => {
            toast.success("ອັບເດດຜູ້ໃຊ້ສຳເລັດ");
            get(usersQuery).refetch();
            showFormModal = false;
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    const createMutationFn = createMutation({
        mutationFn: async (data: any) => {
            return api.post(`admin/users`, { json: data }).json();
        },
        onSuccess: () => {
            toast.success("ເພີ່ມຜູ້ໃຊ້ສຳເລັດ");
            get(usersQuery).refetch();
            showFormModal = false;
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || "ເກີດຂໍ້ຜິດພາດໃນການເພີ່ມຜູ້ໃຊ້");
        }
    });

    const deleteMutationFn = createMutation({
        mutationFn: async (id: string) => {
            return api.delete(`admin/users/${id}`).json();
        },
        onSuccess: () => {
            toast.success("ລຶບຜູ້ໃຊ້ສຳເລັດ");
            get(usersQuery).refetch();
            showDeleteModal = false;
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    let showFormModal = $state(false);
    let showDetailModal = $state(false);
    let showDeleteModal = $state(false);
    let selectedUser = $state<any>(null);

    let formData = $state({
        name: "",
        email: "",
        phone: "",
        roleId: "",
        branchId: "",
        isActive: true,
        permissions: {} as Record<string, boolean>
    });

    // Permission accordion states
    let openPermissionGroups = $state<Record<string, boolean>>({});

    // Default permission groups (fallback if API not available)
    const defaultPermissionGroups = [
        {
            key: "pos",
            label: "ຂາຍໜ້າຮ້ານ (POS)",
            icon: "ShoppingCart",
            color: "from-emerald-500 to-green-500",
            permissions: [
                { key: "pos.view", label: "ເບິ່ງໜ້າ POS" },
                { key: "pos.sale", label: "ຂາຍສິນຄ້າ" },
                { key: "pos.discount", label: "ໃຫ້ສ່ວນຫຼຸດ" },
                { key: "pos.void", label: "ຍົກເລີກລາຍການ" },
                { key: "pos.refund", label: "ຄືນເງິນ" }
            ]
        },
        {
            key: "products",
            label: "ສິນຄ້າ",
            icon: "Package",
            color: "from-blue-500 to-cyan-500",
            permissions: [
                { key: "products.view", label: "ເບິ່ງສິນຄ້າ" },
                { key: "products.create", label: "ເພີ່ມສິນຄ້າ" },
                { key: "products.edit", label: "ແກ້ໄຂສິນຄ້າ" },
                { key: "products.delete", label: "ລຶບສິນຄ້າ" },
                { key: "products.import", label: "ນຳເຂົ້າສິນຄ້າ" }
            ]
        },
        {
            key: "inventory",
            label: "ສາງສິນຄ້າ",
            icon: "Package",
            color: "from-amber-500 to-orange-500",
            permissions: [
                { key: "inventory.view", label: "ເບິ່ງສາງ" },
                { key: "inventory.adjust", label: "ປັບສາງ" },
                { key: "inventory.transfer", label: "ໂອນສິນຄ້າ" },
                { key: "inventory.count", label: "ນັບສາງ" }
            ]
        },
        {
            key: "reports",
            label: "ລາຍງານ",
            icon: "BarChart3",
            color: "from-violet-500 to-purple-500",
            permissions: [
                { key: "reports.sales", label: "ລາຍງານຂາຍ" },
                { key: "reports.products", label: "ລາຍງານສິນຄ້າ" },
                { key: "reports.inventory", label: "ລາຍງານສາງ" },
                { key: "reports.staff", label: "ລາຍງານພະນັກງານ" },
                { key: "reports.customers", label: "ລາຍງານລູກຄ້າ" },
                { key: "reports.export", label: "ສົ່ງອອກລາຍງານ" }
            ]
        },
        {
            key: "restaurant",
            label: "ຮ້ານອາຫານ",
            icon: "Utensils",
            color: "from-pink-500 to-rose-500",
            permissions: [
                { key: "restaurant.view", label: "ເບິ່ງໂຕະ" },
                { key: "restaurant.manage", label: "ຈັດການໂຕະ" },
                { key: "restaurant.kitchen", label: "ເບິ່ງຄົວ" }
            ]
        },
        {
            key: "settings",
            label: "ຕັ້ງຄ່າ",
            icon: "Settings",
            color: "from-gray-500 to-slate-500",
            permissions: [
                { key: "settings.general", label: "ຕັ້ງຄ່າທົ່ວໄປ" },
                { key: "settings.payment", label: "ຕັ້ງຄ່າການຊຳລະ" },
                { key: "settings.printer", label: "ຕັ້ງຄ່າເຄື່ອງພິມ" },
                { key: "settings.tax", label: "ຕັ້ງຄ່າອາກອນ" }
            ]
        }
    ];

    // Use API data or fallback to defaults
    let permissionGroups = $derived($permissionsQuery.data?.length ? $permissionsQuery.data : defaultPermissionGroups);

    // Icon mapping for dynamic icons
    const iconMap: Record<string, any> = {
        ShoppingCart,
        Package,
        BarChart3,
        Utensils,
        Settings,
        Shield,
        Users,
        Building2,
        Store,
        FileText
    };

    function getIcon(iconName: string) {
        return iconMap[iconName] || Shield;
    }

    function togglePermissionGroup(key: string) {
        openPermissionGroups[key] = !openPermissionGroups[key];
    }

    function togglePermission(key: string) {
        formData.permissions[key] = !formData.permissions[key];
    }

    function toggleAllInGroup(groupKey: string, permissions: { key: string; label: string }[]) {
        const allChecked = permissions.every(p => formData.permissions[p.key]);
        permissions.forEach(p => {
            formData.permissions[p.key] = !allChecked;
        });
    }

    function openAddModal() {
        selectedUser = null;
        formData = {
            name: "",
            email: "",
            phone: "",
            password: "",
            roleId: "",
            branchId: "",
            isActive: true,
            permissions: {}
        };
        openPermissionGroups = {};
        showFormModal = true;
    }

    function openEditModal(user: any) {
        selectedUser = user;
        formData = {
            name: user.name || "",
            email: user.email || "",
            phone: user.phone || "",
            roleId: user.roleId || user.role?.id || "",
            branchId: user.branchId || user.branch?.id || "",
            isActive: user.isActive !== false,
            permissions: user.permissions || {}
        };
        openPermissionGroups = {};
        showFormModal = true;
    }

    function openDetailModal(user: any) {
        selectedUser = user;
        showDetailModal = true;
    }

    function openDeleteModal(user: any) {
        selectedUser = user;
        showDeleteModal = true;
    }

    function handleSubmit() {
        if (!formData.name.trim()) {
            toast.error("ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້");
            return;
        }
        if (selectedUser) {
            $updateMutationFn.mutate({ id: selectedUser.id, data: formData });
        } else {
            $createMutationFn.mutate(formData);
        }
    }

    function handleDelete() {
        if (selectedUser) {
            $deleteMutationFn.mutate(selectedUser.id);
        }
    }

    function toggleSuperAdmin(user: any) {
        $toggleSuperAdminMutation.mutate({ id: user.id, isSuperAdmin: !user.isSuperAdmin });
    }


    function getInitials(name: string) {
        return name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "??";
    }

    function getAvatarColor(name: string) {
        const colors = [
            "from-violet-500 to-purple-500",
            "from-blue-500 to-cyan-500",
            "from-emerald-500 to-green-500",
            "from-amber-500 to-orange-500",
            "from-pink-500 to-rose-500",
            "from-indigo-500 to-blue-500",
            "from-teal-500 to-emerald-500"
        ];
        const index = (name?.charCodeAt(0) || 0) % colors.length;
        return colors[index];
    }

    function goToPage(page: number) {
        const totalPages = $usersQuery.data?.meta?.totalPages || 1;
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
        }
    }

    function changePageSize(size: number) {
        pageSize = size;
        currentPage = 1;
    }

    let totalItems = $derived($usersQuery.data?.meta?.total || 0);
    let totalPages = $derived($usersQuery.data?.meta?.totalPages || 1);
</script>

<svelte:head>
    <title>ຈັດການຜູ້ໃຊ້ - Super Admin</title>
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
                    <div class="w-14 h-14 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/25">
                        <Users class="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 class="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">ຈັດການຜູ້ໃຊ້</h1>
                        <p class="text-gray-500 dark:text-gray-400">ເບິ່ງ ແລະ ຈັດການຜູ້ໃຊ້ທັງໝົດ</p>
                    </div>
                </div>
                <button
                    onclick={openAddModal}
                    class="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/30 transition-all"
                >
                    <UserPlus class="w-5 h-5" />
                    <span>ເພີ່ມຜູ້ໃຊ້ໃໝ່</span>
                </button>
            </div>

            <!-- Filters -->
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none p-5">
                <div class="flex flex-col lg:flex-row gap-4">
                    <!-- Search -->
                    <div class="flex-1 relative">
                        <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input 
                            type="text" 
                            bind:value={searchQuery}
                            placeholder="ຄົ້ນຫາຜູ້ໃຊ້..." 
                            class="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
                        />
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="relative">
                            <select 
                                bind:value={roleFilter}
                                class="appearance-none px-4 py-3 pr-10 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-gray-900 dark:text-white min-w-[140px]"
                            >
                                <option value="">ທຸກບົດບາດ</option>
                                {#each $rolesQuery.data || [] as role (role.id)}
                                    <option value={role.id}>{role.name}</option>
                                {/each}
                            </select>
                            <Filter class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                        <div class="relative">
                            <select 
                                bind:value={statusFilter}
                                class="appearance-none px-4 py-3 pr-10 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-gray-900 dark:text-white min-w-[140px]"
                            >
                                <option value="">ທຸກສະຖານະ</option>
                                <option value="active">ເປີດໃຊ້</option>
                                <option value="inactive">ປິດໃຊ້</option>
                            </select>
                            <Filter class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Users List -->
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                {#if $usersQuery.isLoading}
                    <div class="p-12 text-center">
                        <Loader2 class="w-10 h-10 animate-spin mx-auto text-emerald-500" />
                        <p class="text-gray-500 dark:text-gray-400 mt-4">ກຳລັງໂຫຼດ...</p>
                    </div>
                {:else if !$usersQuery.data?.data?.length}
                    <div class="p-16 text-center">
                        <div class="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Users class="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">ບໍ່ພົບຜູ້ໃຊ້</h3>
                        <p class="text-gray-500 dark:text-gray-400">ບໍ່ມີຜູ້ໃຊ້ທີ່ກົງກັບເງື່ອນໄຂການຄົ້ນຫາ</p>
                    </div>
                {:else}
                    <!-- Table for larger screens -->
                    <div class="hidden lg:block overflow-x-auto">
                        <table class="w-full">
                            <thead>
                                <tr class="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                                    <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ຜູ້ໃຊ້</th>
                                    <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ຕິດຕໍ່</th>
                                    <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ບົດບາດ</th>
                                    <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ສາຂາ</th>
                                    <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ສະຖານະ</th>
                                    <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Super Admin</th>
                                    <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ການດຳເນີນການ</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                                {#each $usersQuery.data.data as user (user.id)}
                                    <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td class="px-6 py-4">
                                            <div class="flex items-center gap-3">
                                                <div class={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br text-white font-semibold shadow-lg", getAvatarColor(user.name))}>
                                                    {getInitials(user.name)}
                                                </div>
                                                <div>
                                                    <p class="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                                        {user.name}
                                                        {#if user.isSuperAdmin}
                                                            <Crown class="w-4 h-4 text-amber-500" />
                                                        {/if}
                                                    </p>
                                                    <p class="text-xs text-gray-500 dark:text-gray-400">{formatDate(user.createdAt)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="space-y-1 text-sm">
                                                {#if user.email}
                                                    <p class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                                        <Mail class="w-3.5 h-3.5" />
                                                        {user.email}
                                                    </p>
                                                {/if}
                                                {#if user.phone}
                                                    <p class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                                        <Phone class="w-3.5 h-3.5" />
                                                        {user.phone}
                                                    </p>
                                                {/if}
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            {#if user.role}
                                                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-full text-xs font-medium">
                                                    <Shield class="w-3 h-3" />
                                                    {user.role.name}
                                                </span>
                                            {:else}
                                                <span class="text-gray-400">-</span>
                                            {/if}
                                        </td>
                                        <td class="px-6 py-4">
                                            {#if user.branch}
                                                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium">
                                                    <Building2 class="w-3 h-3" />
                                                    {user.branch.name}
                                                </span>
                                            {:else if user.store}
                                                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-medium">
                                                    <Store class="w-3 h-3" />
                                                    {user.store.name}
                                                </span>
                                            {:else}
                                                <span class="text-gray-400">-</span>
                                            {/if}
                                        </td>
                                        <td class="px-6 py-4">
                                            <span class={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                                                user.isActive !== false
                                                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                                    : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                            )}>
                                                {#if user.isActive !== false}
                                                    <UserCheck class="w-3 h-3" />
                                                    ເປີດໃຊ້
                                                {:else}
                                                    <UserX class="w-3 h-3" />
                                                    ປິດໃຊ້
                                                {/if}
                                            </span>
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="flex justify-center">
                                                <button 
                                                    onclick={() => toggleSuperAdmin(user)}
                                                    disabled={$toggleSuperAdminMutation.isPending}
                                                    class={cn(
                                                        "w-12 h-7 rounded-full relative transition-all",
                                                        user.isSuperAdmin 
                                                            ? "bg-gradient-to-r from-amber-400 to-orange-400 shadow-lg shadow-amber-500/30" 
                                                            : "bg-gray-200 dark:bg-gray-600"
                                                    )}
                                                >
                                                    <span class={cn(
                                                        "absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all",
                                                        user.isSuperAdmin ? "left-6" : "left-1"
                                                    )}></span>
                                                </button>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="flex justify-end gap-2">
                                                <button onclick={() => openDetailModal(user)} class="w-9 h-9 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 transition-colors">
                                                    <Eye class="w-4 h-4" />
                                                </button>
                                                <button onclick={() => openEditModal(user)} class="w-9 h-9 bg-emerald-500 hover:bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-105">
                                                    <Pencil class="w-4 h-4" />
                                                </button>
                                                <button onclick={() => openDeleteModal(user)} class="w-9 h-9 bg-red-500 hover:bg-red-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-all hover:scale-105">
                                                    <Trash2 class="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>

                    <!-- Cards for mobile -->
                    <div class="lg:hidden divide-y divide-gray-100 dark:divide-gray-700">
                        {#each $usersQuery.data.data as user (user.id)}
                            <div class="p-4">
                                <div class="flex items-start gap-4">
                                    <div class={cn("w-14 h-14 rounded-xl flex items-center justify-center bg-gradient-to-br text-white font-bold text-lg shadow-lg shrink-0", getAvatarColor(user.name))}>
                                        {getInitials(user.name)}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 mb-1">
                                            <p class="font-semibold text-gray-900 dark:text-white truncate">{user.name}</p>
                                            {#if user.isSuperAdmin}
                                                <Crown class="w-4 h-4 text-amber-500 shrink-0" />
                                            {/if}
                                        </div>
                                        {#if user.email}
                                            <p class="text-sm text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                                        {/if}
                                        <div class="flex flex-wrap gap-2 mt-2">
                                            {#if user.role}
                                                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-full text-xs">
                                                    <Shield class="w-3 h-3" />
                                                    {user.role.name}
                                                </span>
                                            {/if}
                                            <span class={cn(
                                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
                                                user.isActive !== false
                                                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                                    : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                            )}>
                                                {user.isActive !== false ? "ເປີດໃຊ້" : "ປິດໃຊ້"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex justify-between items-center mt-4">
                                    <button 
                                        onclick={() => toggleSuperAdmin(user)}
                                        class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        <span class={cn(
                                            "w-10 h-6 rounded-full relative transition-all",
                                            user.isSuperAdmin 
                                                ? "bg-gradient-to-r from-amber-400 to-orange-400" 
                                                : "bg-gray-200 dark:bg-gray-600"
                                        )}>
                                            <span class={cn(
                                                "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all",
                                                user.isSuperAdmin ? "left-5" : "left-1"
                                            )}></span>
                                        </span>
                                        Super Admin
                                    </button>
                                    <div class="flex gap-2">
                                        <button onclick={() => openDetailModal(user)} class="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 text-sm font-medium">
                                            ເບິ່ງ
                                        </button>
                                        <button onclick={() => openEditModal(user)} class="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium">
                                            ແກ້ໄຂ
                                        </button>
                                        <button onclick={() => openDeleteModal(user)} class="px-3 py-2 bg-red-500 text-white rounded-lg text-sm font-medium">
                                            ລຶບ
                                        </button>
                                    </div>
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
                                {#each pageSizeOptions as size (size)}
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
    {#if showDetailModal && selectedUser}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showDetailModal = false}></div>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
                <div class="sticky top-0 bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white">
                    <button onclick={() => showDetailModal = false} class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
                        <X class="w-5 h-5" />
                    </button>
                    <div class="flex items-center gap-4">
                        <div class={cn("w-16 h-16 rounded-xl flex items-center justify-center bg-gradient-to-br text-white font-bold text-xl shadow-lg", getAvatarColor(selectedUser.name))}>
                            {getInitials(selectedUser.name)}
                        </div>
                        <div>
                            <h3 class="text-xl font-bold flex items-center gap-2">
                                {selectedUser.name}
                                {#if selectedUser.isSuperAdmin}
                                    <Crown class="w-5 h-5 text-amber-300" />
                                {/if}
                            </h3>
                            <p class="text-sm opacity-90">{selectedUser.email || "ບໍ່ມີອີເມວ"}</p>
                        </div>
                    </div>
                </div>
                <div class="p-6 space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">ສະຖານະ</p>
                            <span class={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium",
                                selectedUser.isActive !== false 
                                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                    : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                            )}>
                                {#if selectedUser.isActive !== false}
                                    <CheckCircle class="w-4 h-4" />
                                {:else}
                                    <XCircle class="w-4 h-4" />
                                {/if}
                                {selectedUser.isActive !== false ? "ເປີດໃຊ້" : "ປິດໃຊ້"}
                            </span>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">ວັນທີ່ສ້າງ</p>
                            <p class="font-medium text-gray-900 dark:text-white text-sm">{formatDate(selectedUser.createdAt)}</p>
                        </div>
                    </div>

                    <div class="space-y-3">
                        {#if selectedUser.phone}
                            <div class="flex items-start gap-3">
                                <Phone class="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">ເບີໂທ</p>
                                    <p class="text-gray-900 dark:text-white">{selectedUser.phone}</p>
                                </div>
                            </div>
                        {/if}
                        {#if selectedUser.role}
                            <div class="flex items-start gap-3">
                                <Shield class="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">ບົດບາດ</p>
                                    <p class="text-gray-900 dark:text-white">{selectedUser.role.name}</p>
                                </div>
                            </div>
                        {/if}
                        {#if selectedUser.branch}
                            <div class="flex items-start gap-3">
                                <Building2 class="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">ສາຂາ</p>
                                    <p class="text-gray-900 dark:text-white">{selectedUser.branch.name}</p>
                                </div>
                            </div>
                        {/if}
                        {#if selectedUser.store}
                            <div class="flex items-start gap-3">
                                <Store class="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">ຮ້ານ</p>
                                    <p class="text-gray-900 dark:text-white">{selectedUser.store.name}</p>
                                </div>
                            </div>
                        {/if}
                    </div>

                    {#if selectedUser.isSuperAdmin}
                        <div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-100 dark:border-amber-800/50">
                            <div class="flex items-center gap-2">
                                <Crown class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                <span class="font-semibold text-amber-700 dark:text-amber-300">Super Admin</span>
                            </div>
                            <p class="text-sm text-amber-600 dark:text-amber-400 mt-1">ຜູ້ໃຊ້ນີ້ມີສິດເຂົ້າເຖິງທຸກລະບົບ</p>
                        </div>
                    {/if}
                </div>
                <div class="flex gap-3 p-6 pt-0">
                    <button onclick={() => showDetailModal = false} class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                        ປິດ
                    </button>
                    <button onclick={() => { showDetailModal = false; openEditModal(selectedUser); }} class="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/30 transition-all">
                        ແກ້ໄຂ
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Form Modal -->
    {#if showFormModal && selectedUser}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showFormModal = false}></div>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
                <div class="sticky top-0 bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white">
                    <button onclick={() => showFormModal = false} class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
                        <X class="w-5 h-5" />
                    </button>
                    <div class="flex items-center gap-3">
                        <Sparkles class="w-8 h-8" />
                        <div>
                            <h3 class="text-xl font-bold">ແກ້ໄຂຜູ້ໃຊ້</h3>
                            <p class="text-sm opacity-90">ອັບເດດຂໍ້ມູນຜູ້ໃຊ້</p>
                        </div>
                    </div>
                </div>
                <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ຊື່ຜູ້ໃຊ້ *</label>
                        <input
                            type="text"
                            bind:value={formData.name}
                            placeholder="ເຊັ່ນ: ທ. ວິໄລວັນ"
                            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-gray-900 dark:text-white"
                        />
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ອີເມວ</label>
                            <input
                                type="email"
                                bind:value={formData.email}
                                placeholder="example@email.com"
                                class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ເບີໂທ</label>
                            <input
                                type="tel"
                                bind:value={formData.phone}
                                placeholder="020 xxxx xxxx"
                                class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ບົດບາດ</label>
                        <select
                            bind:value={formData.roleId}
                            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-gray-900 dark:text-white"
                        >
                            <option value="">ເລືອກບົດບາດ</option>
                            {#each $rolesQuery.data || [] as role (role.id)}
                                <option value={role.id}>{role.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ສາຂາ</label>
                        <select
                            bind:value={formData.branchId}
                            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-gray-900 dark:text-white"
                        >
                            <option value="">ເລືອກສາຂາ</option>
                            {#each $branchesQuery.data || [] as branch (branch.id)}
                                <option value={branch.id}>{branch.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="isActive"
                            bind:checked={formData.isActive}
                            class="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <label for="isActive" class="text-sm font-medium text-gray-700 dark:text-gray-300">ເປີດໃຊ້ງານ</label>
                    </div>

                    <!-- Permissions Accordion -->
                    <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                        <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <Shield class="w-4 h-4 text-emerald-500" />
                            ກຳນົດສິດ
                        </h4>
                        <div class="space-y-2">
                            {#each permissionGroups as group (group.key)}
                                {@const GroupIcon = typeof group.icon === 'string' ? getIcon(group.icon) : group.icon}
                                {@const isOpen = openPermissionGroups[group.key]}
                                {@const checkedCount = group.permissions.filter((p: any) => formData.permissions[p.key]).length}
                                <div class="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                                    <!-- Accordion Header -->
                                    <button
                                        type="button"
                                        onclick={() => togglePermissionGroup(group.key)}
                                        class="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <div class="flex items-center gap-3">
                                            <div class={cn("w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br", group.color)}>
                                                <GroupIcon class="w-4 h-4 text-white" />
                                            </div>
                                            <span class="font-medium text-gray-900 dark:text-white text-sm">{group.label}</span>
                                            {#if checkedCount > 0}
                                                <span class="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs rounded-full font-medium">
                                                    {checkedCount}/{group.permissions.length}
                                                </span>
                                            {/if}
                                        </div>
                                        <ChevronDown class={cn("w-5 h-5 text-gray-400 transition-transform", isOpen && "rotate-180")} />
                                    </button>
                                    <!-- Accordion Content -->
                                    {#if isOpen}
                                        <div class="p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-600 space-y-2">
                                            <button
                                                type="button"
                                                onclick={() => toggleAllInGroup(group.key, group.permissions)}
                                                class="text-xs text-emerald-600 dark:text-emerald-400 hover:underline mb-2"
                                            >
                                                {group.permissions.every(p => formData.permissions[p.key]) ? "ຍົກເລີກທັງໝົດ" : "ເລືອກທັງໝົດ"}
                                            </button>
                                            <div class="grid grid-cols-2 gap-2">
                                                {#each group.permissions as permission (permission.key)}
                                                    <label class="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.permissions[permission.key] || false}
                                                            onchange={() => togglePermission(permission.key)}
                                                            class="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                        />
                                                        <span class="text-xs text-gray-700 dark:text-gray-300">{permission.label}</span>
                                                    </label>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>

                    <div class="flex gap-3 pt-4">
                        <button type="button" onclick={() => showFormModal = false} class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                            ຍົກເລີກ
                        </button>
                        <button 
                            type="submit"
                            disabled={$updateMutationFn.isPending}
                            class="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {#if $updateMutationFn.isPending}
                                <Loader2 class="w-5 h-5 animate-spin" />
                            {/if}
                            ບັນທຶກ
                        </button>
                    </div>
                </form>
            </div>
        </div>
    {/if}

    <!-- Delete Modal -->
    {#if showDeleteModal && selectedUser}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showDeleteModal = false}></div>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div class="p-6 text-center">
                    <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle class="w-8 h-8 text-red-600 dark:text-red-400" />
                    </div>
                    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">ລຶບຜູ້ໃຊ້?</h3>
                    <p class="text-gray-500 dark:text-gray-400 mb-4">ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບຜູ້ໃຊ້ <span class="font-semibold text-gray-900 dark:text-white">"{selectedUser.name}"</span>? ການດຳເນີນການນີ້ບໍ່ສາມາດຍ້ອນກັບໄດ້.</p>
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
