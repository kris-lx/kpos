<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { get } from "svelte/store";
    import { api } from "$lib/api";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { t } from '$lib/i18n/index.svelte';
    import { cn } from "$lib/utils";
    import {
        Key,
        ArrowLeft,
        Loader2,
        Plus,
        Trash2,
        Save,
        X,
        ChevronDown,
        ChevronRight,
        Shield,
        Users,
        Search,
        Edit,
        Eye,
        Copy,
        MoreVertical,
        CheckCircle,
        AlertTriangle,
        Crown,
        UserCog,
        ShoppingCart,
        Package,
        BarChart3,
        Settings,
        Building2,
        Store,
        FileText,
        Sparkles,
        Lock,
        Unlock,
        Check,
        Info
    } from "lucide-svelte";

    import { auth } from "$lib/stores/auth.svelte";

    const queryClient = useQueryClient();

    let canAccess = $state(false);
    let isSuperAdmin = $state(false);
    
    onMount(async () => {
        try {
            const user = auth.user;
            if (!user) {
                goto("/login");
                return;
            }
            isSuperAdmin = user.isSuperAdmin || false;
            // Allow super_admin, admin, hq_admin, hq_manager, branch_admin (roleLevel ≤ 5)
            if (auth.roleLevel <= 5) {
                canAccess = true;
            } else {
                toast.error(t('common.accessDenied'));
                goto("/admin");
            }
        } catch {
            goto("/dashboard");
        }
    });

    let searchQuery = $state("");
    let showFormModal = $state(false);
    let showDeleteModal = $state(false);
    let selectedRole = $state<any>(null);
    let isEditing = $state(false);

    const rolesQuery = createQuery({
        queryKey: ["admin-roles"],
        queryFn: async () => {
            const response = await api.get("admin/roles").json<any>();
            return response.data || [];
        }
    });

    const permissionsQuery = createQuery({
        queryKey: ["admin-permissions"],
        queryFn: async () => {
            const response = await api.get("admin/permissions").json<any>();
            return response.data || [];
        }
    });

    const menuPermissionsQuery = createQuery({
        queryKey: ["admin-menu-permissions"],
        queryFn: async () => {
            const response = await api.get("admin/menu-permissions").json<any>();
            return response.data || [];
        }
    });

    const roleTemplatesQuery = createQuery({
        queryKey: ["admin-role-templates"],
        queryFn: async () => {
            const response = await api.get("admin/roles/templates").json<any>();
            return response.data || [];
        }
    });

    const seedRolesMutation = createMutation({
        mutationFn: async () => {
            return api.post("admin/roles/seed").json();
        },
        onSuccess: () => {
            toast.success(t('common.created'));
            queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
        },
        onError: () => toast.error(t('common.genericError'))
    });

    const createMutationFn = createMutation({
        mutationFn: async (data: any) => {
            return api.post("admin/roles", { json: data }).json();
        },
        onSuccess: () => {
            toast.success(t('common.created'));
            get(rolesQuery).refetch();
            showFormModal = false;
            resetForm();
        },
        onError: () => toast.error(t('common.genericError'))
    });

    const updateMutationFn = createMutation({
        mutationFn: async ({ id, data }: { id: string; data: any }) => {
            return api.patch(`admin/roles/${id}`, { json: data }).json();
        },
        onSuccess: () => {
            toast.success(t('common.updated'));
            get(rolesQuery).refetch();
            showFormModal = false;
            resetForm();
        },
        onError: () => toast.error(t('common.genericError'))
    });

    const deleteMutationFn = createMutation({
        mutationFn: async (id: string) => {
            return api.delete(`admin/roles/${id}`).json();
        },
        onSuccess: () => {
            toast.success(t('common.deleted'));
            get(rolesQuery).refetch();
            showDeleteModal = false;
            selectedRole = null;
        },
        onError: () => toast.error(t('common.genericError'))
    });

    let formData = $state({
        name: "",
        displayName: "",
        description: "",
        permissions: [] as string[],
        isSystem: false
    });

    let expandedGroups = $state<Record<string, boolean>>({});
    let expandedMenus = $state<Record<string, boolean>>({});
    let useMenuPermissions = $state(true);

    function resetForm() {
        formData = {
            name: "",
            displayName: "",
            description: "",
            permissions: [],
            isSystem: false
        };
        isEditing = false;
        selectedRole = null;
    }

    function openCreateModal() {
        resetForm();
        showFormModal = true;
    }

    function openEditModal(role: any) {
        selectedRole = role;
        isEditing = true;
        formData = {
            name: role.name,
            displayName: role.displayName,
            description: role.description || "",
            permissions: [...(role.permissions || [])],
            isSystem: role.isSystem || false
        };
        showFormModal = true;
    }

    function openDeleteModal(role: any) {
        selectedRole = role;
        showDeleteModal = true;
    }

    function handleSubmit() {
        if (!formData.name.trim() || !formData.displayName.trim()) {
            toast.error(t('common.pleaseEnterRequired'));
            return;
        }

        if (isEditing && selectedRole) {
            $updateMutationFn.mutate({ id: selectedRole.id, data: formData });
        } else {
            $createMutationFn.mutate(formData);
        }
    }

    function handleDelete() {
        if (selectedRole) {
            $deleteMutationFn.mutate(selectedRole.id);
        }
    }

    function togglePermission(permissionKey: string) {
        if (formData.permissions.includes(permissionKey)) {
            formData.permissions = formData.permissions.filter(p => p !== permissionKey);
        } else {
            formData.permissions = [...formData.permissions, permissionKey];
        }
    }

    function toggleMenuPermission(menuKey: string, children?: any[]) {
        const childKeys = children?.map((c: any) => c.key) || [];
        const allKeys = [menuKey, ...childKeys];
        
        const allSelected = allKeys.every(k => formData.permissions.includes(k));
        
        if (allSelected) {
            formData.permissions = formData.permissions.filter(p => !allKeys.includes(p));
        } else {
            const newPermissions = new Set([...formData.permissions, ...allKeys]);
            formData.permissions = [...newPermissions];
        }
    }

    function toggleSingleMenuPermission(menuKey: string) {
        if (formData.permissions.includes(menuKey)) {
            formData.permissions = formData.permissions.filter(p => p !== menuKey);
        } else {
            formData.permissions = [...formData.permissions, menuKey];
        }
    }

    function isMenuFullySelected(menuKey: string, children?: any[]): boolean {
        const childKeys = children?.map((c: any) => c.key) || [];
        const allKeys = [menuKey, ...childKeys];
        return allKeys.every(k => formData.permissions.includes(k));
    }

    function isMenuPartiallySelected(menuKey: string, children?: any[]): boolean {
        const childKeys = children?.map((c: any) => c.key) || [];
        const allKeys = [menuKey, ...childKeys];
        const selectedCount = allKeys.filter(k => formData.permissions.includes(k)).length;
        return selectedCount > 0 && selectedCount < allKeys.length;
    }

    function toggleMenuExpand(key: string) {
        expandedMenus[key] = !expandedMenus[key];
    }

    function applyRoleTemplate(template: any) {
        formData.permissions = [...template.permissions];
        toast.success(`ນຳໃຊ້ແມ່ແບບ: ${template.displayName}`);
    }

    function selectAllMenus() {
        const allKeys: string[] = [];
        for (const menu of $menuPermissionsQuery.data || []) {
            allKeys.push(menu.key);
            if (menu.children) {
                for (const child of menu.children) {
                    allKeys.push(child.key);
                }
            }
        }
        formData.permissions = allKeys;
    }

    function clearAllMenus() {
        formData.permissions = [];
    }

    function toggleGroupPermissions(group: any) {
        const groupPermissions = group.permissions.map((p: any) => p.key);
        const allSelected = groupPermissions.every((p: string) => formData.permissions.includes(p));
        
        if (allSelected) {
            formData.permissions = formData.permissions.filter(p => !groupPermissions.includes(p));
        } else {
            const newPermissions = new Set([...formData.permissions, ...groupPermissions]);
            formData.permissions = [...newPermissions];
        }
    }

    function isGroupFullySelected(group: any): boolean {
        const groupPermissions = group.permissions.map((p: any) => p.key);
        return groupPermissions.every((p: string) => formData.permissions.includes(p));
    }

    function isGroupPartiallySelected(group: any): boolean {
        const groupPermissions = group.permissions.map((p: any) => p.key);
        const selectedCount = groupPermissions.filter((p: string) => formData.permissions.includes(p)).length;
        return selectedCount > 0 && selectedCount < groupPermissions.length;
    }

    function toggleGroup(key: string) {
        expandedGroups[key] = !expandedGroups[key];
    }

    function duplicateRole(role: any) {
        formData = {
            name: role.name + "_copy",
            displayName: role.displayName + " (ສຳເນົາ)",
            description: role.description || "",
            permissions: [...(role.permissions || [])],
            isSystem: false
        };
        isEditing = false;
        showFormModal = true;
    }

    const filteredRoles = $derived(
        ($rolesQuery.data || []).filter((role: any) =>
            role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            role.displayName.toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    function getRoleIcon(name: string) {
        switch (name) {
            case 'superadmin': return Crown;
            case 'admin': return Shield;
            case 'store_owner': return Store;
            case 'branch_admin': return Building2;
            case 'manager': return UserCog;
            case 'cashier': return ShoppingCart;
            default: return Users;
        }
    }

    function getRoleColor(name: string) {
        switch (name) {
            case 'superadmin': return 'from-amber-500 to-orange-500';
            case 'admin': return 'from-violet-500 to-purple-500';
            case 'store_owner': return 'from-emerald-500 to-success-500';
            case 'branch_admin': return 'from-blue-500 to-cyan-500';
            case 'manager': return 'from-pink-500 to-rose-500';
            case 'cashier': return 'from-teal-500 to-cyan-500';
            default: return 'from-gray-500 to-slate-500';
        }
    }

    const iconMap: Record<string, any> = {
        ShoppingCart, Package, BarChart3, Settings, Shield, Users, Building2, Store, FileText, Key
    };

    function getGroupIcon(iconName: string) {
        return iconMap[iconName] || Shield;
    }
</script>

<svelte:head>
    <title>ຈັດການບົດບາດ - Super Admin</title>
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
                    <div class="w-14 h-14 bg-gradient-to-br from-pink-600 to-rose-600 rounded-2xl flex items-center justify-center shadow-xl shadow-pink-500/25">
                        <Key class="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 class="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">ຈັດການບົດບາດ</h1>
                        <p class="text-gray-500 dark:text-gray-400">ສ້າງ ແລະ ກຳນົດສິດໃຫ້ແຕ່ລະບົດບາດ</p>
                    </div>
                </div>
                <div class="flex gap-3">
                    <div class="relative">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            bind:value={searchQuery}
                            placeholder="ຄົ້ນຫາບົດບາດ..."
                            class="pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all w-64"
                        />
                    </div>
                    <button 
                        onclick={() => $seedRolesMutation.mutate()}
                        disabled={$seedRolesMutation.isPending}
                        class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
                        title="ສ້າງບົດບາດເລີ່ມຕົ້ນ"
                    >
                        {#if $seedRolesMutation.isPending}
                            <Loader2 class="w-4 h-4 animate-spin" />
                        {:else}
                            <Sparkles class="w-4 h-4" />
                        {/if}
                        <span class="hidden sm:inline">ສ້າງບົດບາດເລີ່ມຕົ້ນ</span>
                    </button>
                    <button onclick={openCreateModal} class="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white font-medium rounded-xl shadow-lg shadow-pink-500/30 transition-all hover:scale-105">
                        <Plus class="w-5 h-5" />
                        <span>ເພີ່ມບົດບາດ</span>
                    </button>
                </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-white dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-lg">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/30">
                            <Key class="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$rolesQuery.data?.length || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ບົດບາດທັງໝົດ</p>
                        </div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-lg">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
                            <Shield class="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$permissionsQuery.data?.reduce((acc: number, g: any) => acc + (g.permissions?.length || 0), 0) || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ສິດທັງໝົດ</p>
                        </div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-lg">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30">
                            <Lock class="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{($rolesQuery.data || []).filter((r: any) => r.isSystem).length}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ບົດບາດລະບົບ</p>
                        </div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-lg">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-br from-emerald-500 to-success-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                            <Unlock class="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{($rolesQuery.data || []).filter((r: any) => !r.isSystem).length}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ບົດບາດກຳນົດເອງ</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Roles Grid -->
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl overflow-hidden">
                <div class="p-5 border-b border-gray-100 dark:border-gray-700">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">ລາຍການບົດບາດ</h3>
                </div>
                
                {#if $rolesQuery.isLoading}
                    <div class="p-8 text-center">
                        <Loader2 class="w-10 h-10 animate-spin mx-auto text-pink-500" />
                        <p class="text-gray-500 dark:text-gray-400 mt-4">ກຳລັງໂຫຼດ...</p>
                    </div>
                {:else if filteredRoles.length === 0}
                    <div class="p-16 text-center">
                        <div class="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Key class="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">ບໍ່ພົບບົດບາດ</h3>
                        <p class="text-gray-500 dark:text-gray-400 mb-4">ເລີ່ມຕົ້ນໂດຍການສ້າງບົດບາດໃໝ່</p>
                        <button onclick={openCreateModal} class="inline-flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white font-medium rounded-lg transition-colors">
                            <Plus class="w-4 h-4" />
                            ເພີ່ມບົດບາດ
                        </button>
                    </div>
                {:else}
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
                        {#each filteredRoles as role (role.id)}
                            {@const RoleIcon = getRoleIcon(role.name)}
                            <div class="group relative bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5 hover:shadow-xl hover:shadow-pink-500/5 transition-all duration-300">
                                <!-- System Badge -->
                                {#if role.isSystem}
                                    <div class="absolute top-3 right-3">
                                        <span class="px-2 py-1 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 text-xs font-medium rounded-full flex items-center gap-1">
                                            <Lock class="w-3 h-3" />
                                            ລະບົບ
                                        </span>
                                    </div>
                                {/if}

                                <div class="flex items-start gap-4">
                                    <div class={cn("w-14 h-14 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg", getRoleColor(role.name))}>
                                        <RoleIcon class="w-7 h-7 text-white" />
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h4 class="font-semibold text-gray-900 dark:text-white truncate">{role.displayName}</h4>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">{role.name}</p>
                                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">{role.description || 'ບໍ່ມີຄຳອະທິບາຍ'}</p>
                                    </div>
                                </div>

                                <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <Shield class="w-4 h-4 text-violet-500" />
                                            <span class="text-sm text-gray-600 dark:text-gray-400">{role.permissions?.length || 0} ສິດ</span>
                                        </div>
                                        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onclick={() => openEditModal(role)}
                                                class="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400 transition-colors"
                                                title="ແກ້ໄຂ"
                                            >
                                                <Edit class="w-4 h-4" />
                                            </button>
                                            <button 
                                                onclick={() => duplicateRole(role)}
                                                class="w-8 h-8 bg-violet-100 dark:bg-violet-900/30 hover:bg-violet-200 dark:hover:bg-violet-900/50 rounded-lg flex items-center justify-center text-violet-600 dark:text-violet-400 transition-colors"
                                                title="ສຳເນົາ"
                                            >
                                                <Copy class="w-4 h-4" />
                                            </button>
                                            {#if !role.isSystem}
                                                <button 
                                                    onclick={() => openDeleteModal(role)}
                                                    class="w-8 h-8 bg-danger-100 dark:bg-danger-900/30 hover:bg-danger-200 dark:hover:bg-danger-900/50 rounded-lg flex items-center justify-center text-danger-600 dark:text-danger-400 transition-colors"
                                                    title="ລຶບ"
                                                >
                                                    <Trash2 class="w-4 h-4" />
                                                </button>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Create/Edit Modal -->
    {#if showFormModal}
        <div class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
            <button type="button" aria-label="Close modal" class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showFormModal = false}></button>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden">
                <div class="bg-gradient-to-r from-pink-600 to-rose-600 p-6 text-white">
                    <button onclick={() => showFormModal = false} class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
                        <X class="w-5 h-5" />
                    </button>
                    <div class="flex items-center gap-3">
                        <Sparkles class="w-8 h-8" />
                        <div>
                            <h3 class="text-xl font-bold">{isEditing ? 'ແກ້ໄຂບົດບາດ' : 'ສ້າງບົດບາດໃໝ່'}</h3>
                            <p class="text-sm opacity-90">ກຳນົດຊື່ ແລະ ສິດສຳລັບບົດບາດ</p>
                        </div>
                    </div>
                </div>
                
                <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                    <!-- Basic Info -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label for="a11y-app-admin-roles-page-svelte-1" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ລະຫັດ (name) *</label>
                            <input id="a11y-app-admin-roles-page-svelte-1"
                                type="text" 
                                bind:value={formData.name} 
                                placeholder="ເຊັ່ນ: manager"
                                disabled={isEditing && selectedRole?.isSystem}
                                class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent text-gray-900 dark:text-white disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label for="a11y-app-admin-roles-page-svelte-2" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ຊື່ສະແດງ *</label>
                            <input id="a11y-app-admin-roles-page-svelte-2"
                                type="text" 
                                bind:value={formData.displayName} 
                                placeholder="ເຊັ່ນ: ຜູ້ຈັດການ"
                                class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>
                    <div>
                        <label for="a11y-app-admin-roles-page-svelte-3" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ຄຳອະທິບາຍ</label>
                        <textarea id="a11y-app-admin-roles-page-svelte-3"
                            bind:value={formData.description} 
                            placeholder="ອະທິບາຍບົດບາດນີ້..."
                            rows="2"
                            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent text-gray-900 dark:text-white resize-none"
                        ></textarea>
                    </div>

                    <!-- Role Templates -->
                    {#if !isEditing && $roleTemplatesQuery.data?.length > 0}
                        <div>
                            <p class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ໃຊ້ແມ່ແບບບົດບາດ</p>
                            <div class="flex flex-wrap gap-2">
                                {#each $roleTemplatesQuery.data as template (template.id)}
                                    <button
                                        type="button"
                                        onclick={() => applyRoleTemplate(template)}
                                        class="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-pink-100 dark:hover:bg-pink-900/30 text-gray-700 dark:text-gray-300 hover:text-pink-600 dark:hover:text-pink-400 text-sm rounded-lg border border-gray-200 dark:border-gray-600 transition-colors"
                                    >
                                        {template.displayName}
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- Menu Access Info -->
                    <div class="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                        <Info class="w-5 h-5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-blue-800 dark:text-blue-300">ສິດການເຂົ້າເຖິງເມນູ</p>
                            <p class="text-sm text-blue-700 dark:text-blue-400 mt-0.5">
                                ສິດການເຂົ້າເຖິງເມນູຖືກຄວບຄຸມໂດຍ <strong>Rules Management</strong> ແຍກຕ່າງຫາກ
                            </p>
                            <a
                                href="/admin/rules"
                                class="inline-flex items-center gap-1 mt-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                ໄປຫາ Rules Management →
                            </a>
                        </div>
                    </div>
                </form>

                <div class="flex gap-3 p-6 pt-0">
                    <button 
                        type="button"
                        onclick={() => showFormModal = false}
                        class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                        ຍົກເລີກ
                    </button>
                    <button 
                        onclick={handleSubmit}
                        disabled={$createMutationFn.isPending || $updateMutationFn.isPending}
                        class="flex-1 px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-medium rounded-xl shadow-lg shadow-pink-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {#if $createMutationFn.isPending || $updateMutationFn.isPending}
                            <Loader2 class="w-5 h-5 animate-spin" />
                        {:else}
                            <Save class="w-5 h-5" />
                        {/if}
                        {isEditing ? 'ບັນທຶກ' : 'ສ້າງ'}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Delete Modal -->
    {#if showDeleteModal && selectedRole}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button type="button" aria-label="Close modal" class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showDeleteModal = false}></button>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div class="bg-gradient-to-r from-danger-500 to-rose-500 p-6 text-white">
                    <div class="flex items-center gap-3">
                        <AlertTriangle class="w-8 h-8" />
                        <div>
                            <h3 class="text-xl font-bold">ລຶບບົດບາດ</h3>
                            <p class="text-sm opacity-90">{selectedRole.displayName}</p>
                        </div>
                    </div>
                </div>
                <div class="p-6">
                    <p class="text-gray-600 dark:text-gray-400">
                        ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບບົດບາດນີ້? ການກະທຳນີ້ບໍ່ສາມາດຍ້ອນກັບໄດ້.
                    </p>
                    <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mt-4">
                        <div class="flex items-start gap-3">
                            <AlertTriangle class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <p class="text-sm text-amber-700 dark:text-amber-400">
                                ຜູ້ໃຊ້ທີ່ມີບົດບາດນີ້ຈະບໍ່ມີບົດບາດອີກຕໍ່ໄປ
                            </p>
                        </div>
                    </div>
                </div>
                <div class="flex gap-3 p-6 pt-0">
                    <button 
                        onclick={() => showDeleteModal = false}
                        class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                        ຍົກເລີກ
                    </button>
                    <button 
                        onclick={handleDelete}
                        disabled={$deleteMutationFn.isPending}
                        class="flex-1 px-4 py-3 bg-danger-500 hover:bg-danger-600 text-white font-medium rounded-xl shadow-lg shadow-danger-500/30 transition-all flex items-center justify-center gap-2"
                    >
                        {#if $deleteMutationFn.isPending}
                            <Loader2 class="w-5 h-5 animate-spin" />
                        {:else}
                            <Trash2 class="w-5 h-5" />
                        {/if}
                        ລຶບ
                    </button>
                </div>
            </div>
        </div>
    {/if}
{/if}
