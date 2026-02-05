<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { toast } from "svelte-sonner";
    import {
        ArrowLeft,
        Save,
        Shield,
        User,
        Check,
        X,
        Loader2,
        ChevronDown,
        ChevronRight,
        Eye,
        Edit,
        Plus,
        Trash2,
        Lock,
        Unlock,
        RefreshCw,
    } from "lucide-svelte";

    // Get user ID from URL
    const userId = $page.params.id;

    // State
    let isLoading = $state(true);
    let isSaving = $state(false);
    let userData = $state<any>(null);
    let rolePermissions = $state<string[]>([]);
    let userPermissions = $state<string[]>([]);
    let allPermissions = $state<any[]>([]);
    let expandedModules = $state<Set<string>>(new Set());
    let useCustomPermissions = $state(false);

    // Computed: Effective permissions (role + user)
    let effectivePermissions = $derived(() => {
        if (userData?.isSuperAdmin) return ['*'];
        const combined = [...new Set([...rolePermissions, ...userPermissions])];
        return combined;
    });

    // Load user permissions
    async function loadPermissions() {
        isLoading = true;
        try {
            const response = await api.get(`users/${userId}/permissions`).json<any>();
            if (response.success && response.data) {
                userData = response.data.user;
                rolePermissions = response.data.rolePermissions || [];
                userPermissions = response.data.userPermissions || [];
                useCustomPermissions = userPermissions.length > 0;
                
                // Expand all modules by default
                if (response.data.allPermissions) {
                    expandedModules = new Set(response.data.allPermissions.map((m: any) => m.module));
                }
            }
        } catch (error) {
            console.error("Failed to load permissions:", error);
            toast.error(t("common.loadingError"));
        } finally {
            isLoading = false;
        }
    }

    // Load all available permissions
    async function loadAllPermissions() {
        try {
            const response = await api.get("users/permissions/all").json<any>();
            if (response.success && response.data) {
                allPermissions = response.data;
            }
        } catch (error) {
            console.error("Failed to load all permissions:", error);
        }
    }

    // Toggle module expansion
    function toggleModule(module: string) {
        if (expandedModules.has(module)) {
            expandedModules.delete(module);
        } else {
            expandedModules.add(module);
        }
        expandedModules = new Set(expandedModules);
    }

    // Check if permission is granted
    function hasPermission(perm: string): boolean {
        if (userData?.isSuperAdmin) return true;
        return rolePermissions.includes(perm) || userPermissions.includes(perm);
    }

    // Check if permission is from role
    function isRolePermission(perm: string): boolean {
        return rolePermissions.includes(perm);
    }

    // Check if permission is user-specific
    function isUserPermission(perm: string): boolean {
        return userPermissions.includes(perm);
    }

    // Toggle user permission
    function togglePermission(perm: string) {
        if (userData?.isSuperAdmin) return; // Cannot modify super admin
        
        if (userPermissions.includes(perm)) {
            // Remove from user permissions
            userPermissions = userPermissions.filter(p => p !== perm);
        } else {
            // Add to user permissions
            userPermissions = [...userPermissions, perm];
        }
        useCustomPermissions = true;
    }

    // Select all permissions in a module
    function selectAllInModule(module: any) {
        const modulePerms = module.permissions.map((p: any) => p.value);
        const newPerms = [...new Set([...userPermissions, ...modulePerms])];
        userPermissions = newPerms;
        useCustomPermissions = true;
    }

    // Deselect all permissions in a module
    function deselectAllInModule(module: any) {
        const modulePerms = module.permissions.map((p: any) => p.value);
        userPermissions = userPermissions.filter(p => !modulePerms.includes(p));
        useCustomPermissions = userPermissions.length > 0;
    }

    // Reset to role permissions only
    function resetToRolePermissions() {
        userPermissions = [];
        useCustomPermissions = false;
    }

    // Save permissions
    async function savePermissions() {
        isSaving = true;
        try {
            const response = await api.put(`users/${userId}/permissions`, {
                json: { permissions: userPermissions }
            }).json<any>();

            if (response.success) {
                toast.success(t("staff.permissions.saveSuccess"));
            } else {
                toast.error(response.message || t("common.saveFailed"));
            }
        } catch (error) {
            console.error("Failed to save permissions:", error);
            toast.error(t("common.saveFailed"));
        } finally {
            isSaving = false;
        }
    }

    // Count permissions in module
    function countModulePermissions(module: any): { granted: number; total: number } {
        const total = module.permissions.length;
        const granted = module.permissions.filter((p: any) => hasPermission(p.value)).length;
        return { granted, total };
    }

    onMount(() => {
        loadAllPermissions();
        loadPermissions();
    });
</script>

<svelte:head>
    <title>{t("staff.permissions.title")} - {userData?.name || ""}</title>
</svelte:head>

<div class="p-6 max-w-5xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-4">
            <button
                onclick={() => goto("/staff")}
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
                <ArrowLeft class="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                    {t("staff.permissions.title")}
                </h1>
                {#if userData}
                    <p class="text-gray-500 dark:text-gray-400 mt-1">
                        {userData.name} ({userData.email})
                    </p>
                {/if}
            </div>
        </div>

        <div class="flex items-center gap-3">
            {#if useCustomPermissions}
                <button
                    onclick={resetToRolePermissions}
                    class={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
                        "hover:bg-gray-200 dark:hover:bg-gray-700"
                    )}
                >
                    <RefreshCw class="w-4 h-4" />
                    {t("staff.permissions.resetToRole")}
                </button>
            {/if}
            <button
                onclick={savePermissions}
                disabled={isSaving}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors",
                    "bg-primary-600 hover:bg-primary-700",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
            >
                {#if isSaving}
                    <Loader2 class="w-4 h-4 animate-spin" />
                {:else}
                    <Save class="w-4 h-4" />
                {/if}
                {t("common.save")}
            </button>
        </div>
    </div>

    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-8 h-8 animate-spin text-primary-500" />
        </div>
    {:else if userData?.isSuperAdmin}
        <!-- Super Admin Notice -->
        <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-center">
            <Shield class="w-12 h-12 mx-auto text-amber-500 mb-3" />
            <h3 class="text-lg font-semibold text-amber-800 dark:text-amber-200">
                {t("staff.permissions.superAdminNotice")}
            </h3>
            <p class="text-amber-600 dark:text-amber-400 mt-2">
                {t("staff.permissions.superAdminDesc")}
            </p>
        </div>
    {:else}
        <!-- User Info Card -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <div class="flex items-center gap-4">
                <div class="w-14 h-14 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <User class="w-7 h-7 text-primary-600 dark:text-primary-400" />
                </div>
                <div class="flex-1">
                    <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                        {userData?.name}
                    </h2>
                    <p class="text-gray-500 dark:text-gray-400">{userData?.email}</p>
                </div>
                <div class="text-right">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        <Shield class="w-4 h-4" />
                        {userData?.role?.displayName || userData?.role?.name || "Staff"}
                    </span>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {rolePermissions.length} {t("staff.permissions.rolePerms")} •
                        {userPermissions.length} {t("staff.permissions.customPerms")}
                    </p>
                </div>
            </div>
        </div>

        <!-- Legend -->
        <div class="flex items-center gap-6 mb-4 px-2">
            <div class="flex items-center gap-2">
                <div class="w-4 h-4 rounded bg-blue-500"></div>
                <span class="text-sm text-gray-600 dark:text-gray-400">{t("staff.permissions.fromRole")}</span>
            </div>
            <div class="flex items-center gap-2">
                <div class="w-4 h-4 rounded bg-green-500"></div>
                <span class="text-sm text-gray-600 dark:text-gray-400">{t("staff.permissions.custom")}</span>
            </div>
            <div class="flex items-center gap-2">
                <div class="w-4 h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                <span class="text-sm text-gray-600 dark:text-gray-400">{t("staff.permissions.notGranted")}</span>
            </div>
        </div>

        <!-- Permissions List -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {#each allPermissions as module, i}
                {@const counts = countModulePermissions(module)}
                <div class={cn(i > 0 && "border-t border-gray-200 dark:border-gray-700")}>
                    <!-- Module Header -->
                    <button
                        onclick={() => toggleModule(module.module)}
                        class="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                    >
                        <div class="flex items-center gap-3">
                            {#if expandedModules.has(module.module)}
                                <ChevronDown class="w-5 h-5 text-gray-400" />
                            {:else}
                                <ChevronRight class="w-5 h-5 text-gray-400" />
                            {/if}
                            <span class="font-medium text-gray-900 dark:text-white">
                                {module.label}
                            </span>
                            <span class="text-sm text-gray-500 dark:text-gray-400">
                                ({counts.granted}/{counts.total})
                            </span>
                        </div>
                        <div class="flex items-center gap-2">
                            <button
                                onclick|stopPropagation={() => selectAllInModule(module)}
                                class="px-2 py-1 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                            >
                                {t("common.selectAll")}
                            </button>
                            <button
                                onclick|stopPropagation={() => deselectAllInModule(module)}
                                class="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            >
                                {t("common.unselectAll")}
                            </button>
                        </div>
                    </button>

                    <!-- Module Permissions -->
                    {#if expandedModules.has(module.module)}
                        <div class="px-6 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {#each module.permissions as perm}
                                {@const isGranted = hasPermission(perm.value)}
                                {@const isFromRole = isRolePermission(perm.value)}
                                {@const isCustom = isUserPermission(perm.value)}
                                <button
                                    onclick={() => togglePermission(perm.value)}
                                    class={cn(
                                        "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                                        isGranted
                                            ? isCustom
                                                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                                : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                                            : "bg-gray-50 dark:bg-gray-750 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                                    )}
                                >
                                    <div class={cn(
                                        "w-5 h-5 rounded flex items-center justify-center shrink-0",
                                        isGranted
                                            ? isCustom
                                                ? "bg-green-500 text-white"
                                                : "bg-blue-500 text-white"
                                            : "bg-gray-300 dark:bg-gray-600"
                                    )}>
                                        {#if isGranted}
                                            <Check class="w-3.5 h-3.5" />
                                        {/if}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <p class={cn(
                                            "text-sm font-medium truncate",
                                            isGranted
                                                ? "text-gray-900 dark:text-white"
                                                : "text-gray-600 dark:text-gray-400"
                                        )}>
                                            {perm.label}
                                        </p>
                                        <p class="text-xs text-gray-500 dark:text-gray-500 truncate">
                                            {perm.value}
                                        </p>
                                    </div>
                                    {#if isFromRole && !isCustom}
                                        <Lock class="w-4 h-4 text-blue-400 shrink-0" title="From Role" />
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>

        <!-- Summary -->
        <div class="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
            <h3 class="font-medium text-gray-900 dark:text-white mb-2">
                {t("staff.permissions.summary")}
            </h3>
            <div class="flex flex-wrap gap-2">
                {#each effectivePermissions() as perm}
                    <span class={cn(
                        "px-2 py-1 text-xs font-medium rounded-full",
                        isUserPermission(perm)
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                            : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    )}>
                        {perm}
                    </span>
                {:else}
                    <span class="text-sm text-gray-500 dark:text-gray-400">
                        {t("staff.permissions.noPermissions")}
                    </span>
                {/each}
            </div>
        </div>
    {/if}
</div>
