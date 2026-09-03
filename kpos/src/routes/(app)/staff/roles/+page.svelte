<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth, dialogStore } from "$stores";
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
        ShieldCheck,
        Save,
    } from "lucide-svelte";

    // CRUD permission gating — use hasPermission directly since rule-based check
    // has management.roles.create=false for store_owner but the permission roles:create is granted
    const canCreate = $derived(auth.hasPermission('roles:create'));
    const canUpdate = $derived(auth.hasPermission('roles:update'));
    const canDelete = $derived(auth.hasPermission('roles:delete'));
    const canCustomizeSystemRoles = $derived(!auth.isSuperAdmin && auth.roleLevel <= 2);
    const canEditPolicy = $derived(auth.isSuperAdmin || auth.roleLevel <= 2);

    function getRoleLevel(role: any): number | null {
        return Number.isInteger(role?.level) ? role.level : null;
    }

    // State
    let roles = $state<any[]>([]);
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let showModal = $state(false);
    let editingRole = $state<any>(null);
    let isSaving = $state(false);
    let searchQuery = $state("");
    let expandedRole = $state<string | null>(null);
    let expandedPermissionCategories = $state<string[]>([]);
    let policyLoading = $state(true);
    let policySaving = $state(false);
    let requireMakerChecker = $state(true);
    let excludedPermissionCount = $state(0);

    // Form state
    let formData = $state({
        name: "",
        displayName: "",
        description: "",
        permissions: [] as string[],
    });

    // The platform permission catalog is the source for the tenant role editor.
    // Keep a small fallback so an unseeded catalog does not make the form
    // unusable during first-time setup.
    const fallbackPermissionCategories = [
        { name: "dashboard",  label: t("nav.dashboard"),  permissions: ["dashboard:view"] },
        { name: "products",   label: t("nav.products"),   permissions: ["products:view", "products:create", "products:update", "products:delete"] },
        { name: "categories", label: t("nav.categories"), permissions: ["categories:view", "categories:create", "categories:update", "categories:delete"] },
        { name: "inventory",  label: t("nav.inventory"),  permissions: ["inventory:view", "inventory:create", "inventory:update", "inventory:delete"] },
        { name: "sales",      label: t("nav.sales"),      permissions: ["sales:view", "sales:create", "sales:void", "sales:refund", "sales:delete"] },
        { name: "customers",  label: t("nav.customers"),  permissions: ["customers:view", "customers:create", "customers:update", "customers:delete"] },
        { name: "staff",      label: t("nav.staff"),      permissions: ["staff:view", "staff:create", "staff:update", "staff:delete"] },
        { name: "attendance", label: t("nav.attendance"), permissions: ["attendance:clock", "attendance:view", "attendance:manage"] },
        { name: "reports",    label: t("nav.reports"),    permissions: ["reports:view", "reports:export"] },
        { name: "settings",   label: t("nav.settings"),   permissions: ["settings:view", "settings:update"] },
        { name: "branches",   label: t("nav.branches"),   permissions: ["branches:view", "branches:create", "branches:update", "branches:delete"] },
        { name: "roles",      label: t("staff.roles"),    permissions: ["roles:view", "roles:create", "roles:update", "roles:delete"] },
        { name: "promotions", label: t("nav.promotions"), permissions: ["promotions:view", "promotions:create", "promotions:update", "promotions:delete"] },
        { name: "payments",   label: t("nav.payments"),   permissions: ["payments:view", "payments:manage"] },
        { name: "restaurant", label: t("nav.restaurant"), permissions: ["restaurant:view", "restaurant:manage"] },
    ];
    let permissionCategories = $state(fallbackPermissionCategories);

    onMount(() => {
        loadRoles();
        loadPolicy();
        loadPermissionCatalog();
    });

    async function loadPermissionCatalog() {
        try {
            const response = await api.get("roles/permissions").json<any>();
            const grouped = response.data?.grouped;
            excludedPermissionCount = Number(response.data?.excludedCount) || 0;
            if (!grouped || typeof grouped !== "object") return;

            const catalog = Object.entries(grouped)
                .map(([name, group]: [string, any]) => ({
                    name,
                    label: group.label || name,
                    permissions: Array.isArray(group.permissions)
                        ? group.permissions.map((permission: any) => permission.key).filter(Boolean)
                        : [],
                }))
                .filter(category => category.permissions.length > 0);

            if (catalog.length > 0) {
                permissionCategories = catalog;
                expandedPermissionCategories = catalog.map(category => category.name);
            }
        } catch (err) {
            console.error("Failed to load permission catalog:", err);
        }
    }

    async function loadPolicy() {
        policyLoading = true;
        try {
            const response = await api.get("settings/operations").json<{ success: boolean; data?: { requireMakerChecker: boolean } }>();
            if (response.success && response.data) {
                requireMakerChecker = response.data.requireMakerChecker;
            }
        } catch (err) {
            console.error("Failed to load maker-checker policy:", err);
        } finally {
            policyLoading = false;
        }
    }

    async function savePolicy() {
        if (!canEditPolicy) return;
        policySaving = true;
        try {
            const response = await api.put("settings/operations", { json: { requireMakerChecker } }).json<{ success: boolean }>();
            if (response.success) {
                toast.success(t("common.saved"));
            } else {
                toast.error(t("common.genericError"));
            }
        } catch (err) {
            console.error("Failed to save maker-checker policy:", err);
            toast.error(t("common.genericError"));
        } finally {
            policySaving = false;
        }
    }

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

    function canEditRole(role: any) {
        return canUpdate && (
            !role.isSystem ||
            (canCustomizeSystemRoles && role.tenantId === null)
        );
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

    function categorySelectedCount(category: typeof permissionCategories[0]): number {
        return category.permissions.filter(permission => formData.permissions.includes(permission)).length;
    }

    function isPermissionCategoryExpanded(categoryName: string): boolean {
        return expandedPermissionCategories.includes(categoryName);
    }

    function togglePermissionCategory(categoryName: string) {
        if (isPermissionCategoryExpanded(categoryName)) {
            expandedPermissionCategories = expandedPermissionCategories.filter(name => name !== categoryName);
        } else {
            expandedPermissionCategories = [...expandedPermissionCategories, categoryName];
        }
    }

    function expandPermissionCategories() {
        expandedPermissionCategories = permissionCategories.map(category => category.name);
    }

    function collapsePermissionCategories() {
        expandedPermissionCategories = [];
    }

    async function handleSubmit() {
        if (!formData.name || !formData.displayName) {
            toast.error(t("roles.fillRequired"));
            return;
        }
        // A role saved with nothing checked grants nothing but is otherwise
        // indistinguishable from a real one in the list — found live where
        // this silently locked out a newly-approved store owner entirely.
        if (!formData.permissions || formData.permissions.length === 0) {
            toast.error('ກະລຸນາເລືອກຢ່າງໜ້ອຍໜຶ່ງສິດ — ບົດບາດທີ່ບໍ່ມີສິດຈະໃຊ້ງານບໍ່ໄດ້ເລີຍ');
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
            try {
                const body = await (error as any)?.response?.json?.();
                toast.error(body?.error?.message || t("roles.saveFailed"));
            } catch {
                toast.error(t("roles.saveFailed"));
            }
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
        
        if (!(await dialogStore.confirm(t("roles.confirmDelete")))) return;

        try {
            await api.delete(`roles/${id}`).json();
            toast.success(t("roles.deleteSuccess"));
            await loadRoles();
        } catch (error) {
            console.error("Failed to delete role:", error);
            toast.error(t("roles.deleteFailed"));
        }
    }

    function getPermissionLabel(permission: unknown): string {
        // Custom/system role payloads can contain a blank entry while the
        // permission catalog is being migrated. Keep the roles page usable
        // instead of calling charAt() on undefined and crashing the route.
        const permissionKey = typeof permission === "string" ? permission.trim() : "";
        const [, rawAction] = permissionKey.split(":");
        const action = (rawAction || permissionKey || "permission").trim();
        return action.charAt(0).toUpperCase() + action.slice(1);
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
                    {#if excludedPermissionCount > 0}
                        <p class="mt-2 max-w-3xl rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                            ສະແດງສະເພາະສິດທີ່ບັນຊີຂອງທ່ານສາມາດມອບຕໍ່ໄດ້. {excludedPermissionCount} ສິດຖືກຈຳກັດໂດຍ Super Admin.
                        </p>
                    {/if}
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

    <!-- Maker-Checker Approval Policy -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6 border border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-start gap-3">
            <div class="p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg shrink-0">
                <ShieldCheck class="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div class="flex-1 min-w-0">
                <h2 class="font-semibold text-gray-900 dark:text-white">ນະໂຍບາຍ Maker-Checker</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    ຜູ້ທີ່ສ້າງລາຍການ (Maker) ຈະບໍ່ສາມາດອະນຸມັດລາຍການຂອງຕົນເອງໄດ້. ກຳນົດສິດ Checker ໃນ Role ແລະເປີດ/ປິດບົດບາດ Maker, Checker ໃຫ້ລາຍຄົນຢູ່ໜ້າ Staff.
                </p>
                {#if policyLoading}
                    <div class="flex items-center gap-2 mt-3 text-sm text-gray-500 dark:text-gray-400">
                        <Loader2 class="w-4 h-4 animate-spin" /> ກຳລັງໂຫຼດ...
                    </div>
                {:else}
                    <label class="flex items-center justify-between gap-4 mt-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 max-w-xl">
                        <span class="text-sm font-medium text-gray-900 dark:text-white">
                            ບັງຄັບໃຊ້ Maker-Checker (ຫ້າມອະນຸມັດລາຍການຂອງຕົນເອງ)
                        </span>
                        <input
                            type="checkbox"
                            bind:checked={requireMakerChecker}
                            disabled={!canEditPolicy}
                            class="w-5 h-5 shrink-0 disabled:opacity-50"
                        />
                    </label>
                    {#if canEditPolicy}
                        <button
                            type="button"
                            onclick={savePolicy}
                            disabled={policySaving}
                            class="flex items-center gap-2 mt-3 px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                            {#if policySaving}
                                <Loader2 class="w-4 h-4 animate-spin" />
                            {:else}
                                <Save class="w-4 h-4" />
                            {/if}
                            ບັນທຶກ
                        </button>
                    {:else}
                        <p class="text-xs text-amber-600 dark:text-amber-400 mt-2">
                            ສະເພາະ owner ຫຼື super admin ເທົ່ານັ້ນທີ່ປ່ຽນນະໂຍບາຍນີ້ໄດ້
                        </p>
                    {/if}
                {/if}
            </div>
        </div>
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
            <AlertCircle class="w-12 h-12 text-danger-500 dark:text-danger-400 mb-4" />
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
                                    {#if role.isTemplate}
                                        <span class="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">
                                            Template · Copy to tenant
                                        </span>
                                    {/if}
                                    {#if getRoleLevel(role) !== null}
                                        <span class="px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-full">
                                            {t("common.level")} {getRoleLevel(role)}
                                        </span>
                                    {/if}
                                </div>
                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                    {role.description}
                                </p>
                                <div class="flex items-center gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    <span class="flex items-center gap-1">
                                        <Users class="w-3.5 h-3.5" />
                                        {role._count?.users || 0} users
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
                            {#if canEditRole(role)}
                            <button
                                onclick={() => openModal(role)}
                                class="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                <Edit class="w-4 h-4" />
                            </button>
                            {:else if role.isSystem}
                                <span class="p-2 text-gray-400 dark:text-gray-500" title="System role">
                                    <Lock class="w-4 h-4" />
                                </span>
                            {/if}
                            {#if canDelete && !role.isSystem}
                                <button
                                    onclick={() => deleteRole(role.id)}
                                    class="p-2 text-gray-500 hover:text-danger-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
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
        <button
            type="button"
            aria-label="Close modal"
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onclick={closeModal}
        ></button>
        
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
                        <label for="a11y-app-staff-roles-page-svelte-1" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("roles.name")} <span class="text-danger-500">*</span>
                        </label>
                        <input id="a11y-app-staff-roles-page-svelte-1"
                            type="text"
                            bind:value={formData.name}
                            placeholder="e.g., manager"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            required
                            disabled={editingRole?.isSystem}
                        />
                    </div>
                    <div>
                        <label for="a11y-app-staff-roles-page-svelte-2" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("roles.displayName")} <span class="text-danger-500">*</span>
                        </label>
                        <input id="a11y-app-staff-roles-page-svelte-2"
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
                    <label for="a11y-app-staff-roles-page-svelte-3" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("roles.description")}
                    </label>
                    <textarea id="a11y-app-staff-roles-page-svelte-3"
                        bind:value={formData.description}
                        rows="2"
                        placeholder={t("roles.descriptionPlaceholder")}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                    ></textarea>
                </div>

                <div class="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                    <ShieldCheck class="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div>
                        <p class="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Tenant Role — Store / Branch scope</p>
                        <p class="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                            Role ນີ້ໃຊ້ສຳລັບ store/branch ຂອງເຈົ້າເທົ່ານັ້ນ. ໜ້ານີ້ກຳນົດສິດຂອງ Role, ບໍ່ໄດ້ກຳນົດສິດສະເພາະບຸກຄົນ. ການກຳນົດ user override ໃຫ້ເຮັດໃນ Staff → Permissions.
                        </p>
                    </div>
                </div>

                <!-- Permissions -->
                <div>
                    <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div>
                            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t("roles.permissions")} · Role Permissions
                            </p>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                ເລືອກສິດຕາມ menu ແລະ sub-menu. CRUD ລະດັບ module ກວດ/ແກ້ໃນ Access Control.
                            </p>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1 rounded-full">
                                {formData.permissions.length} / {permissionCategories.reduce((total, category) => total + category.permissions.length, 0)} ສິດ
                            </span>
                            <button
                                type="button"
                                onclick={expandPermissionCategories}
                                class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                            >
                                ຂະຫຍາຍທັງໝົດ
                            </button>
                            <button
                                type="button"
                                onclick={collapsePermissionCategories}
                                class="text-xs text-gray-500 dark:text-gray-400 hover:underline"
                            >
                                ຫຍໍ້ທັງໝົດ
                            </button>
                        </div>
                    </div>

                    <!-- Permission tree with custom node content -->
                    <div class="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-primary-50/50 shadow-inner dark:border-slate-700 dark:from-slate-900 dark:via-gray-800 dark:to-primary-950/20 overflow-hidden max-h-[360px] overflow-y-auto">
                        {#each permissionCategories as category (category.name)}
                            {@const selectedCount = categorySelectedCount(category)}
                            {@const allSelected = selectedCount === category.permissions.length && category.permissions.length > 0}
                            {@const someSelected = selectedCount > 0 && !allSelected}
                            {@const categoryExpanded = isPermissionCategoryExpanded(category.name)}
                            <div class="border-b last:border-b-0 border-slate-200/80 dark:border-slate-700/80">
                                <!-- Custom parent node -->
                                <div class={cn(
                                    "group flex items-center gap-2 px-3 py-3 transition-colors",
                                    selectedCount > 0 ? "bg-primary-50/70 dark:bg-primary-950/20" : "bg-white/60 hover:bg-white dark:bg-gray-800/50 dark:hover:bg-gray-700/50"
                                )}>
                                    <button
                                        type="button"
                                        aria-label={categoryExpanded ? `ຫຍໍ້ ${category.label}` : `ຂະຫຍາຍ ${category.label}`}
                                        aria-expanded={categoryExpanded}
                                        onclick={() => togglePermissionCategory(category.name)}
                                        class="p-1.5 rounded-lg text-slate-400 hover:text-primary-700 dark:text-slate-500 dark:hover:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                                    >
                                        {#if categoryExpanded}
                                            <ChevronDown class="w-4 h-4" />
                                        {:else}
                                            <ChevronRight class="w-4 h-4" />
                                        {/if}
                                    </button>
                                    <label class="flex flex-1 min-w-0 items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            indeterminate={someSelected && !allSelected}
                                            onchange={() => toggleCategory(category)}
                                            class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600"
                                        />
                                        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-cyan-500 text-xs font-bold text-white shadow-sm shadow-primary-500/25">{category.label.charAt(0).toUpperCase()}</span>
                                        <span class="font-semibold text-gray-900 dark:text-white truncate">{category.label}</span>
                                        <span class="ml-auto shrink-0 rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-slate-700">
                                            {selectedCount}/{category.permissions.length}
                                        </span>
                                    </label>
                                </div>
                                {#if categoryExpanded}
                                    <!-- Custom child nodes -->
                                    <div role="group" class="relative ml-9 border-l border-dashed border-primary-200 pb-3 pl-5 pr-3 dark:border-primary-900/60">
                                        {#each category.permissions as permission (permission)}
                                            {@const action = String(permission).split(':').pop()?.toUpperCase() || 'VIEW'}
                                            {@const selected = formData.permissions.includes(permission)}
                                            <label class={cn(
                                                "relative flex items-center gap-2 rounded-xl px-2.5 py-2 cursor-pointer transition-all",
                                                selected ? "bg-white shadow-sm ring-1 ring-primary-200 dark:bg-slate-800 dark:ring-primary-900/70" : "hover:bg-white/80 dark:hover:bg-slate-800/70"
                                            )}>
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onchange={() => togglePermission(permission)}
                                                    class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600"
                                                />
                                                <span class={cn(
                                                    "inline-flex min-w-12 justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide",
                                                    selected ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
                                                )}>{action}</span>
                                                <span class={cn("text-sm", selected ? "font-medium text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300")}>
                                                    {getPermissionLabel(permission)}
                                                </span>
                                                <code class="ml-auto hidden text-[10px] text-slate-400 dark:text-slate-500 sm:inline">
                                                    {permission}
                                                </code>
                                            </label>
                                        {/each}
                                    </div>
                                {/if}
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
