<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { toast } from "svelte-sonner";
    import { onMount } from "svelte";
    import {
        Shield,
        Plus,
        Search,
        Edit,
        Trash2,
        Check,
        X,
        Users,
        Lock,
        Loader2,
        ChevronDown,
        ChevronRight,
        AlertCircle,
        RefreshCw,
    } from "lucide-svelte";

    // CRUD permission gating — use hasPermission directly since rule-based check
    // has management.roles.create=false for store_owner but the permission roles:create is granted
    const canCreate = $derived(auth.hasPermission('roles:create'));
    const canUpdate = $derived(auth.hasPermission('roles:update'));
    const canDelete = $derived(auth.hasPermission('roles:delete'));

    // State
    let roles = $state<any[]>([]);
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let showModal = $state(false);
    let editingRole = $state<any>(null);
    let isSaving = $state(false);
    let searchQuery = $state("");
    let expandedRole = $state<string | null>(null);

    // Form state
    let formData = $state({
        name: "",
        displayName: "",
        description: "",
        permissions: [] as string[],
    });

    // Permission categories
    const permissionCategories = [
        {
            name: "dashboard",
            label: "Dashboard",
            permissions: ["dashboard:view"],
        },
        {
            name: "products",
            label: "Products",
            permissions: ["products:view", "products:create", "products:update", "products:delete"],
        },
        {
            name: "categories",
            label: "Categories",
            permissions: ["categories:view", "categories:create", "categories:update", "categories:delete"],
        },
        {
            name: "inventory",
            label: "Inventory",
            permissions: ["inventory:view", "inventory:create", "inventory:update", "inventory:delete"],
        },
        {
            name: "sales",
            label: "Sales",
            permissions: ["sales:view", "sales:create", "sales:void", "sales:refund"],
        },
        {
            name: "customers",
            label: "Customers",
            permissions: ["customers:view", "customers:create", "customers:update", "customers:delete"],
        },
        {
            name: "staff",
            label: "Staff",
            permissions: ["staff:view", "staff:create", "staff:update", "staff:delete"],
        },
        {
            name: "reports",
            label: "Reports",
            permissions: ["reports:view", "reports:export"],
        },
        {
            name: "settings",
            label: "Settings",
            permissions: ["settings:view", "settings:update"],
        },
        {
            name: "branches",
            label: "Branches",
            permissions: ["branches:view", "branches:create", "branches:update", "branches:delete"],
        },
        {
            name: "roles",
            label: "Roles",
            permissions: ["roles:view", "roles:create", "roles:update", "roles:delete"],
        },
        {
            name: "promotions",
            label: "Promotions",
            permissions: ["promotions:view", "promotions:create", "promotions:update", "promotions:delete"],
        },
        {
            name: "payments",
            label: "Payments",
            permissions: ["payments:view", "payments:manage"],
        },
        {
            name: "restaurant",
            label: "Restaurant",
            permissions: ["restaurant:view", "restaurant:manage"],
        },
    ];

    onMount(() => {
        loadRoles();
    });

    async function loadRoles() {
        isLoading = true;
        error = null;
        try {
            const response = await api.get("roles").json<any>();
            if (response.success && response.data) {
                roles = response.data;
            }
        } catch (err) {
            console.error("Failed to load roles:", err);
            error = t("roles.loadFailed");
            toast.error(t("roles.loadFailed"));
            roles = [];
        } finally {
            isLoading = false;
        }
    }

    let filteredRoles = $derived(
        roles.filter(role => {
            if (!searchQuery) return true;
            const query = searchQuery.toLowerCase();
            return role.name.toLowerCase().includes(query) ||
                   role.displayName.toLowerCase().includes(query) ||
                   role.description?.toLowerCase().includes(query);
        })
    );

    function openModal(role?: any) {
        if (role) {
            editingRole = role;
            formData = {
                name: role.name,
                displayName: role.displayName,
                description: role.description || "",
                permissions: [...role.permissions],
            };
        } else {
            editingRole = null;
            formData = {
                name: "",
                displayName: "",
                description: "",
                permissions: [],
            };
        }
        showModal = true;
    }

    function closeModal() {
        showModal = false;
        editingRole = null;
    }

    function togglePermission(permission: string) {
        if (formData.permissions.includes(permission)) {
            formData.permissions = formData.permissions.filter(p => p !== permission);
        } else {
            formData.permissions = [...formData.permissions, permission];
        }
    }

    function toggleCategory(category: typeof permissionCategories[0]) {
        const allSelected = category.permissions.every(p => formData.permissions.includes(p));
        if (allSelected) {
            formData.permissions = formData.permissions.filter(p => !category.permissions.includes(p));
        } else {
            const newPermissions = category.permissions.filter(p => !formData.permissions.includes(p));
            formData.permissions = [...formData.permissions, ...newPermissions];
        }
    }

    async function handleSubmit() {
        if (!formData.name || !formData.displayName) {
            toast.error(t("roles.fillRequired"));
            return;
        }

        isSaving = true;
        try {
            if (editingRole) {
                await api.put(`roles/${editingRole.id}`, { json: formData }).json();
                toast.success(t("roles.updateSuccess"));
            } else {
                await api.post("roles", { json: formData }).json();
                toast.success(t("roles.createSuccess"));
            }
            closeModal();
            await loadRoles();
        } catch (error) {
            console.error("Failed to save role:", error);
            toast.error(t("roles.saveFailed"));
        } finally {
            isSaving = false;
        }
    }

    async function deleteRole(id: string) {
        const role = roles.find(r => r.id === id);
        if (role?.isSystem) {
            toast.error(t("roles.cannotDeleteSystem"));
            return;
        }
        
        if (!confirm(t("roles.confirmDelete"))) return;

        try {
            await api.delete(`roles/${id}`).json();
            toast.success(t("roles.deleteSuccess"));
            await loadRoles();
        } catch (error) {
            console.error("Failed to delete role:", error);
            toast.error(t("roles.deleteFailed"));
        }
    }

    function getPermissionLabel(permission: string): string {
        const [module, action] = permission.split(":");
        return `${action.charAt(0).toUpperCase() + action.slice(1)}`;
    }
</script>

<svelte:head>
    <title>{t("roles.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {t("roles.title")}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t("roles.subtitle")}
            </p>
        </div>
        {#if canCreate}
        <button
            onclick={() => openModal()}
            class={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all mt-4 sm:mt-0",
                "bg-primary-600 text-white hover:bg-primary-700",
            )}
        >
            <Plus class="w-4 h-4" />
            {t("roles.createNew")}
        </button>
        {/if}
    </div>

    <!-- Search -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6">
        <div class="p-4">
            <div class="relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder={t("roles.searchPlaceholder")}
                    class={cn(
                        "w-full pl-10 pr-4 py-2 rounded-lg border",
                        "border-gray-300 dark:border-gray-600",
                        "bg-white dark:bg-gray-700",
                        "text-gray-900 dark:text-white",
                        "placeholder-gray-400 dark:placeholder-gray-500",
                        "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                    )}
                />
            </div>
        </div>
    </div>

    <!-- Roles List -->
    {#if isLoading}
        <div class="flex items-center justify-center py-12">
            <Loader2 class="w-8 h-8 animate-spin text-primary-600 dark:text-primary-400" />
        </div>
    {:else if error}
        <div class="flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <AlertCircle class="w-12 h-12 text-red-500 dark:text-red-400 mb-4" />
            <p class="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
            <button
                onclick={() => loadRoles()}
                class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 transition-colors"
            >
                <RefreshCw class="w-4 h-4" />
                {t("common.retry")}
            </button>
        </div>
    {:else}
        <div class="space-y-4">
            {#each filteredRoles as role (role.id)}
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                    <!-- Role Header -->
                    <div class="p-4 flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <div class={cn(
                                "p-3 rounded-xl",
                                role.isSystem ? "bg-purple-50 dark:bg-purple-900/20" : "bg-blue-50 dark:bg-blue-900/20"
                            )}>
                                <Shield class={cn(
                                    "w-6 h-6",
                                    role.isSystem ? "text-purple-500" : "text-blue-500"
                                )} />
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <h3 class="font-semibold text-gray-900 dark:text-white">
                                        {role.displayName}
                                    </h3>
                                    {#if role.isSystem}
                                        <span class="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-full">
                                            System
                                        </span>
                                    {/if}
                                </div>
                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                    {role.description}
                                </p>
                                <div class="flex items-center gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    <span class="flex items-center gap-1">
                                        <Users class="w-3.5 h-3.5" />
                                        {role.usersCount || 0} users
                                    </span>
                                    <span class="flex items-center gap-1">
                                        <Lock class="w-3.5 h-3.5" />
                                        {role.permissions?.length || 0} permissions
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <button
                                onclick={() => expandedRole = expandedRole === role.id ? null : role.id}
                                class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                {#if expandedRole === role.id}
                                    <ChevronDown class="w-5 h-5" />
                                {:else}
                                    <ChevronRight class="w-5 h-5" />
                                {/if}
                            </button>
                            {#if canUpdate && !role.isSystem}
                            <button
                                onclick={() => openModal(role)}
                                class="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                <Edit class="w-4 h-4" />
                            </button>
                            {/if}
                            {#if canDelete && !role.isSystem}
                                <button
                                    onclick={() => deleteRole(role.id)}
                                    class="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                    <Trash2 class="w-4 h-4" />
                                </button>
                            {/if}
                        </div>
                    </div>

                    <!-- Expanded Permissions -->
                    {#if expandedRole === role.id}
                        <div class="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Permissions</h4>
                            <div class="flex flex-wrap gap-2">
                                {#each role.permissions as permission (permission)}
                                    <span class="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg">
                                        {permission}
                                    </span>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}

            {#if filteredRoles.length === 0}
                <div class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                    <Shield class="w-12 h-12 mb-3 opacity-50" />
                    <p>{t("roles.noRoles")}</p>
                </div>
            {/if}
        </div>
    {/if}
</div>

<!-- Add/Edit Role Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div 
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onclick={closeModal}
        ></div>
        
        <!-- Modal -->
        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <!-- Header -->
            <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {editingRole ? t("roles.editRole") : t("roles.createNew")}
                </h2>
                <button
                    onclick={closeModal}
                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>
            
            <!-- Form -->
            <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-180px)]">
                <!-- Name -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("roles.name")} <span class="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            bind:value={formData.name}
                            placeholder="e.g., manager"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            required
                            disabled={editingRole?.isSystem}
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("roles.displayName")} <span class="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            bind:value={formData.displayName}
                            placeholder="e.g., Manager"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            required
                        />
                    </div>
                </div>

                <!-- Description -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("roles.description")}
                    </label>
                    <textarea
                        bind:value={formData.description}
                        rows="2"
                        placeholder={t("roles.descriptionPlaceholder")}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                    ></textarea>
                </div>

                <!-- Permissions -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        {t("roles.permissions")}
                    </label>
                    <div class="space-y-3 max-h-[300px] overflow-y-auto">
                        {#each permissionCategories as category (category.name)}
                            {@const allSelected = category.permissions.every(p => formData.permissions.includes(p))}
                            {@const someSelected = category.permissions.some(p => formData.permissions.includes(p))}
                            <div class="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                                <div class="flex items-center justify-between mb-2">
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            indeterminate={someSelected && !allSelected}
                                            onchange={() => toggleCategory(category)}
                                            class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                                        />
                                        <span class="font-medium text-gray-900 dark:text-white">{category.label}</span>
                                    </label>
                                </div>
                                <div class="flex flex-wrap gap-2 ml-6">
                                    {#each category.permissions as permission (permission)}
                                        <label class="flex items-center gap-1.5 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.permissions.includes(permission)}
                                                onchange={() => togglePermission(permission)}
                                                class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                                            />
                                            <span class="text-sm text-gray-600 dark:text-gray-400">
                                                {getPermissionLabel(permission)}
                                            </span>
                                        </label>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </form>

            <!-- Footer -->
            <div class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onclick={closeModal}
                    class="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                >
                    {t("common.cancel")}
                </button>
                <button
                    type="button"
                    onclick={handleSubmit}
                    disabled={isSaving}
                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {#if isSaving}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {/if}
                    {editingRole ? t("common.save") : t("common.create")}
                </button>
            </div>
        </div>
    </div>
{/if}
