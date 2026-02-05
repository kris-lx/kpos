<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { toast } from "svelte-sonner";
    import {
        Users,
        Plus,
        Search,
        Filter,
        Edit,
        Trash2,
        Eye,
        Shield,
        Clock,
        Phone,
        Mail,
        MoreVertical,
        UserCheck,
        UserX,
        Calendar,
        DollarSign,
        Loader2,
        ChevronLeft,
        ChevronRight,
        X,
        AlertTriangle,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let activeTab = $state<"all" | "active" | "inactive">("all");
    let showAddModal = $state(false);
    let showViewModal = $state(false);
    let showDeleteModal = $state(false);
    let selectedStaff = $state<any>(null);
    let isLoading = $state(true);
    let isSaving = $state(false);

    // Pagination
    let currentPage = $state(1);
    let totalPages = $state(1);
    let totalItems = $state(0);
    const pageSize = 20;

    // Staff data from API
    let staffList = $state<any[]>([]);

    // Form data for add/edit
    let formData = $state({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "staff",
        branchId: "",
        roleId: "",
        isActive: true,
    });
    
    // Branches and Roles for dropdowns
    let branches = $state<any[]>([]);
    let roles = $state<any[]>([]);
    
    // Load branches and roles
    async function loadDropdownData() {
        try {
            const [branchRes, roleRes] = await Promise.all([
                api.get("branches").json<any>(),
                api.get("admin/roles").json<any>()
            ]);
            branches = branchRes.data || [];
            roles = roleRes.data || [];
        } catch (error) {
            console.error("Failed to load dropdown data:", error);
        }
    }

    // Filtered staff
    let filteredStaff = $derived(
        staffList.filter((s) => {
            const matchesSearch =
                s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.phone || "").includes(searchQuery);
            const matchesTab =
                activeTab === "all"
                    ? true
                    : activeTab === "active"
                      ? s.isActive === true
                      : s.isActive === false;
            return matchesSearch && matchesTab;
        }),
    );

    // Stats
    let stats = $derived({
        total: staffList.length,
        active: staffList.filter((s) => s.isActive === true).length,
        inactive: staffList.filter((s) => s.isActive === false).length,
        totalSales: 0,
    });

    // Load staff from API
    async function loadStaff() {
        isLoading = true;
        try {
            const params = new URLSearchParams();
            params.append("page", String(currentPage));
            params.append("limit", String(pageSize));
            if (activeTab !== "all") {
                params.append("isActive", activeTab === "active" ? "true" : "false");
            }
            if (searchQuery) {
                params.append("search", searchQuery);
            }

            const response = await api.get(`staff?${params}`).json<any>();
            if (response.success && response.data) {
                staffList = response.data.map((s: any) => ({
                    ...s,
                    roleLabel: s.roleRelation?.displayName || s.role,
                    branch: s.branch?.name || "-",
                    status: s.isActive ? "active" : "inactive",
                    joinDate: s.createdAt?.slice(0, 10) || "",
                    lastActive: s.lastLoginAt || "-",
                    totalSales: 0,
                    commission: 0,
                }));
                totalItems = response.meta?.total || staffList.length;
                totalPages = response.meta?.totalPages || 1;
            }
        } catch (error) {
            console.error("Failed to load staff:", error);
            toast.error(t("error.network"));
        } finally {
            isLoading = false;
        }
    }

    // View staff details
    function viewStaff(staff: any) {
        selectedStaff = staff;
        showViewModal = true;
    }

    // Open edit modal
    function editStaff(staff: any) {
        selectedStaff = staff;
        formData = {
            name: staff.name || "",
            email: staff.email || "",
            password: "",
            phone: staff.phone || "",
            role: staff.role || "staff",
            branchId: staff.branchId || "",
            roleId: staff.roleId || "",
            isActive: staff.isActive ?? true,
        };
        showAddModal = true;
    }

    // Confirm delete
    function confirmDelete(staff: any) {
        selectedStaff = staff;
        showDeleteModal = true;
    }

    // Delete staff
    async function deleteStaff() {
        if (!selectedStaff) return;
        isSaving = true;
        try {
            const response = await api.delete(`staff/${selectedStaff.id}`).json<any>();
            if (response.success) {
                toast.success(t("staff.deleteSuccess"));
                showDeleteModal = false;
                selectedStaff = null;
                await loadStaff();
            } else {
                toast.error(response.error?.message || t("error.network"));
            }
        } catch (error: any) {
            const errData = await error.response?.json?.();
            toast.error(errData?.error?.message || t("error.network"));
        } finally {
            isSaving = false;
        }
    }

    // Save staff (add/edit)
    async function saveStaff() {
        if (!formData.name || !formData.email) {
            toast.error(t("staff.fillRequired"));
            return;
        }
        isSaving = true;
        try {
            let response;
            if (selectedStaff) {
                response = await api.put(`staff/${selectedStaff.id}`, { json: formData }).json<any>();
            } else {
                response = await api.post("staff", { json: formData }).json<any>();
            }
            if (response.success) {
                toast.success(selectedStaff ? t("staff.updateSuccess") : t("staff.createSuccess"));
                showAddModal = false;
                selectedStaff = null;
                formData = { name: "", email: "", password: "", phone: "", role: "staff", branchId: "", roleId: "", isActive: true };
                await loadStaff();
            } else {
                toast.error(response.error?.message || t("error.network"));
            }
        } catch (error: any) {
            const errData = await error.response?.json?.();
            toast.error(errData?.error?.message || t("error.network"));
        } finally {
            isSaving = false;
        }
    }

    // Open add modal
    function openAddModal() {
        selectedStaff = null;
        formData = { name: "", email: "", password: "", phone: "", role: "staff", branchId: "", roleId: "", isActive: true };
        showAddModal = true;
    }

    onMount(() => {
        loadStaff();
        loadDropdownData();
    });

    function formatCurrency(amount: number): string {
        return (
            "₭" +
            new Intl.NumberFormat("lo-LA", {
                minimumFractionDigits: 0,
            }).format(amount)
        );
    }

    function formatDate(date: string): string {
        return new Intl.DateTimeFormat("lo-LA", {
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(new Date(date));
    }

    function getRoleColor(role: string): string {
        switch (role) {
            case "admin":
                return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
            case "manager":
                return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
            case "cashier":
                return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
            case "kitchen":
                return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
            default:
                return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
        }
    }

    function getStatusColor(status: string): string {
        return status === "active"
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    }

    function getInitials(name: string): string {
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase();
    }
</script>

<svelte:head>
    <title>{t("staff.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6"
    >
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {t("staff.title")}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t("staff.subtitle")}
            </p>
        </div>
        <div class="flex gap-2 mt-4 sm:mt-0">
            <button
                onclick={() => goto("/staff/shifts")}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700",
                )}
            >
                <Clock class="w-4 h-4" />
                {t("shifts.title")}
            </button>
            <button
                onclick={openAddModal}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    "bg-primary-600 text-white hover:bg-primary-700",
                )}
            >
                <Plus class="w-4 h-4" />
                {t("staff.addNew")}
            </button>
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div
            class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
        >
            <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <Users class="w-5 h-5 text-blue-500" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                        {stats.total}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        {t("staff.totalStaff")}
                    </p>
                </div>
            </div>
        </div>
        <div
            class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
        >
            <div class="flex items-center gap-3">
                <div class="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <UserCheck class="w-5 h-5 text-green-500" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                        {stats.active}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        {t("staff.active")}
                    </p>
                </div>
            </div>
        </div>
        <div
            class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
        >
            <div class="flex items-center gap-3">
                <div class="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <UserX class="w-5 h-5 text-red-500" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                        {stats.inactive}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        {t("staff.inactive")}
                    </p>
                </div>
            </div>
        </div>
        <div
            class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
        >
            <div class="flex items-center gap-3">
                <div class="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <DollarSign class="w-5 h-5 text-purple-500" />
                </div>
                <div>
                    <p class="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCurrency(stats.totalSales)}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        {t("staff.totalSales")}
                    </p>
                </div>
            </div>
        </div>
    </div>

    <!-- Filters & Search -->
    <div
        class="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6"
    >
        <div class="p-4 flex flex-col sm:flex-row gap-4">
            <!-- Tabs -->
            <div
                class="flex gap-1 bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg"
            >
                {#each [{ id: "all", label: t("staff.all") }, { id: "active", label: t("staff.active") }, { id: "inactive", label: t("staff.inactive") }] as tab}
                    <button
                        onclick={() => { activeTab = tab.id as any; currentPage = 1; loadStaff(); }}
                        class={cn(
                            "px-4 py-2 rounded-md text-sm font-medium transition-all",
                            activeTab === tab.id
                                ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
                        )}
                    >
                        {tab.label}
                    </button>
                {/each}
            </div>

            <!-- Search -->
            <div class="relative flex-1">
                <Search
                    class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder={t("staff.searchPlaceholder")}
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

    <!-- Staff List -->
    <div
        class="bg-white dark:bg-gray-800 rounded-xl shadow-sm"
    >
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead class="bg-gray-50 dark:bg-gray-700/50">
                    <tr
                        class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase"
                    >
                        <th class="px-4 py-3">{t("staff.name")}</th>
                        <th class="px-4 py-3">{t("staff.contact")}</th>
                        <th class="px-4 py-3">{t("staff.role")}</th>
                        <th class="px-4 py-3">{t("staff.branch")}</th>
                        <th class="px-4 py-3">{t("staff.status")}</th>
                        <th class="px-4 py-3 text-right">{t("staff.sales")}</th>
                        <th class="px-4 py-3 text-center"
                            >{t("common.actions")}</th
                        >
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    {#each filteredStaff as staff}
                        <tr
                            class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                            <td class="px-4 py-3">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-400 font-medium"
                                    >
                                        {getInitials(staff.name)}
                                    </div>
                                    <div>
                                        <p
                                            class="font-medium text-gray-900 dark:text-white"
                                        >
                                            {staff.name}
                                        </p>
                                        <p
                                            class="text-xs text-gray-500 dark:text-gray-400"
                                        >
                                            {t("staff.joined")}: {formatDate(
                                                staff.joinDate,
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </td>
                            <td class="px-4 py-3">
                                <div class="text-sm">
                                    <div
                                        class="flex items-center gap-1 text-gray-600 dark:text-gray-300"
                                    >
                                        <Mail class="w-3 h-3" />
                                        {staff.email}
                                    </div>
                                    <div
                                        class="flex items-center gap-1 text-gray-500 dark:text-gray-400"
                                    >
                                        <Phone class="w-3 h-3" />
                                        {staff.phone}
                                    </div>
                                </div>
                            </td>
                            <td class="px-4 py-3">
                                <span
                                    class={cn(
                                        "px-2 py-1 rounded-full text-xs font-medium",
                                        getRoleColor(staff.role),
                                    )}
                                >
                                    {staff.roleLabel}
                                </span>
                            </td>
                            <td
                                class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300"
                            >
                                {staff.branch}
                            </td>
                            <td class="px-4 py-3">
                                <span
                                    class={cn(
                                        "px-2 py-1 rounded-full text-xs font-medium",
                                        getStatusColor(staff.status),
                                    )}
                                >
                                    {staff.status === "active"
                                        ? t("staff.active")
                                        : t("staff.inactive")}
                                </span>
                            </td>
                            <td
                                class="px-4 py-3 text-right font-medium text-gray-900 dark:text-white"
                            >
                                {formatCurrency(staff.totalSales)}
                                {#if staff.commission > 0}
                                    <p
                                        class="text-xs text-gray-500 dark:text-gray-400"
                                    >
                                        {staff.commission}% {t(
                                            "staff.commission",
                                        )}
                                    </p>
                                {/if}
                            </td>
                            <td class="px-4 py-3">
                                <div
                                    class="flex items-center justify-center gap-1"
                                >
                                    <button
                                        onclick={() => viewStaff(staff)}
                                        class="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                        title={t("common.view")}
                                    >
                                        <Eye class="w-4 h-4" />
                                    </button>
                                    <button
                                        onclick={() => editStaff(staff)}
                                        class="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                        title={t("common.edit")}
                                    >
                                        <Edit class="w-4 h-4" />
                                    </button>
                                    <button
                                        onclick={() => goto(`/staff/${staff.id}/permissions`)}
                                        class="p-2 text-gray-500 hover:text-amber-600 dark:text-gray-400 dark:hover:text-amber-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                        title={t("staff.permissions.managePermissions")}
                                    >
                                        <Shield class="w-4 h-4" />
                                    </button>
                                    <button
                                        onclick={() => confirmDelete(staff)}
                                        class="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                        title={t("common.delete")}
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        {#if filteredStaff.length === 0}
            <div
                class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400"
            >
                <Users class="w-12 h-12 mb-3 opacity-50" />
                <p>{t("staff.noStaffFound")}</p>
            </div>
        {/if}

        <!-- Pagination -->
        {#if totalPages > 1}
            <div class="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                    {t("common.showing")} {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalItems)} {t("common.of")} {totalItems}
                </p>
                <div class="flex items-center gap-2">
                    <button
                        onclick={() => { if (currentPage > 1) { currentPage--; loadStaff(); } }}
                        disabled={currentPage <= 1}
                        class="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft class="w-4 h-4" />
                    </button>
                    <span class="text-sm text-gray-600 dark:text-gray-400">
                        {currentPage} / {totalPages}
                    </span>
                    <button
                        onclick={() => { if (currentPage < totalPages) { currentPage++; loadStaff(); } }}
                        disabled={currentPage >= totalPages}
                        class="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight class="w-4 h-4" />
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

<!-- Add/Edit Staff Modal -->
{#if showAddModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div 
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onclick={() => { showAddModal = false; selectedStaff = null; }}
            role="button"
            tabindex="-1"
        ></div>
        
        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
            <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedStaff ? t("staff.editStaff") : t("staff.addNew")}
                </h2>
                <button
                    onclick={() => { showAddModal = false; selectedStaff = null; }}
                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>
            
            <form onsubmit={(e) => { e.preventDefault(); saveStaff(); }} class="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-180px)]">
                <div>
                    <label for="staffName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("staff.name")} <span class="text-red-500">*</span>
                    </label>
                    <input
                        id="staffName"
                        type="text"
                        bind:value={formData.name}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        required
                    />
                </div>
                <div>
                    <label for="staffEmail" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("staff.email")} <span class="text-red-500">*</span>
                    </label>
                    <input
                        id="staffEmail"
                        type="email"
                        bind:value={formData.email}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        required
                    />
                </div>
                <div>
                    <label for="staffPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("staff.password")} {#if !selectedStaff}<span class="text-red-500">*</span>{/if}
                    </label>
                    <input
                        id="staffPassword"
                        type="password"
                        bind:value={formData.password}
                        placeholder={selectedStaff ? "ປ່ອຍວ່າງຖ້າບໍ່ຕ້ອງການປ່ຽນ" : ""}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        required={!selectedStaff}
                    />
                </div>
                <div>
                    <label for="staffPhone" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("staff.phone")}
                    </label>
                    <input
                        id="staffPhone"
                        type="tel"
                        bind:value={formData.phone}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                </div>
                <div>
                    <label for="staffBranch" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("staff.branch")} <span class="text-red-500">*</span>
                    </label>
                    <select
                        id="staffBranch"
                        bind:value={formData.branchId}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        required
                    >
                        <option value="">-- ເລືອກສາຂາ --</option>
                        {#each branches as branch}
                            <option value={branch.id}>{branch.name}</option>
                        {/each}
                    </select>
                </div>
                <div>
                    <label for="staffRole" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("staff.role")}
                    </label>
                    <select
                        id="staffRole"
                        bind:value={formData.roleId}
                        onchange={(e) => {
                            const selectedRole = roles.find(r => r.id === (e.target as HTMLSelectElement).value);
                            if (selectedRole) formData.role = selectedRole.name;
                        }}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                        <option value="">-- ເລືອກບົດບາດ --</option>
                        {#each roles as role}
                            <option value={role.id}>{role.displayName || role.name}</option>
                        {/each}
                    </select>
                </div>
                <label class="flex items-center gap-2">
                    <input type="checkbox" bind:checked={formData.isActive} class="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
                    <span class="text-sm text-gray-700 dark:text-gray-300">{t("staff.isActive")}</span>
                </label>
            </form>

            <div class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onclick={() => { showAddModal = false; selectedStaff = null; }}
                    class="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                >
                    {t("common.cancel")}
                </button>
                <button
                    type="button"
                    onclick={saveStaff}
                    disabled={isSaving}
                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {#if isSaving}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {/if}
                    {selectedStaff ? t("common.save") : t("common.create")}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- View Staff Modal -->
{#if showViewModal && selectedStaff}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div 
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onclick={() => { showViewModal = false; selectedStaff = null; }}
            role="button"
            tabindex="-1"
        ></div>
        
        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg">
            <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {t("staff.details")}
                </h2>
                <button
                    onclick={() => { showViewModal = false; selectedStaff = null; }}
                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>
            
            <div class="p-6 space-y-4">
                <div class="flex items-center gap-4">
                    <div class="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-400 text-xl font-bold">
                        {getInitials(selectedStaff.name)}
                    </div>
                    <div>
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{selectedStaff.name}</h3>
                        <span class={cn("px-2 py-1 rounded-full text-xs font-medium", getRoleColor(selectedStaff.role))}>
                            {selectedStaff.roleLabel}
                        </span>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{t("staff.email")}</p>
                        <p class="font-medium text-gray-900 dark:text-white">{selectedStaff.email}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{t("staff.phone")}</p>
                        <p class="font-medium text-gray-900 dark:text-white">{selectedStaff.phone || "-"}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{t("staff.branch")}</p>
                        <p class="font-medium text-gray-900 dark:text-white">{selectedStaff.branch}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{t("staff.status")}</p>
                        <span class={cn("px-2 py-1 rounded-full text-xs font-medium", getStatusColor(selectedStaff.status))}>
                            {selectedStaff.status === "active" ? t("staff.active") : t("staff.inactive")}
                        </span>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{t("staff.joined")}</p>
                        <p class="font-medium text-gray-900 dark:text-white">{formatDate(selectedStaff.joinDate)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{t("staff.sales")}</p>
                        <p class="font-medium text-gray-900 dark:text-white">{formatCurrency(selectedStaff.totalSales)}</p>
                    </div>
                </div>
            </div>

            <div class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => { showViewModal = false; editStaff(selectedStaff); }}
                    class="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    <Edit class="w-4 h-4" />
                    {t("common.edit")}
                </button>
                <button
                    onclick={() => { showViewModal = false; selectedStaff = null; }}
                    class="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                >
                    {t("common.close")}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal && selectedStaff}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div 
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onclick={() => { showDeleteModal = false; selectedStaff = null; }}
            role="button"
            tabindex="-1"
        ></div>
        
        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div class="p-6 text-center">
                <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <AlertTriangle class="w-8 h-8 text-red-600" />
                </div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {t("staff.confirmDelete")}
                </h3>
                <p class="text-gray-500 dark:text-gray-400">
                    {t("staff.deleteWarning", { name: selectedStaff.name })}
                </p>
            </div>
            
            <div class="flex items-center justify-center gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => { showDeleteModal = false; selectedStaff = null; }}
                    class="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                >
                    {t("common.cancel")}
                </button>
                <button
                    onclick={deleteStaff}
                    disabled={isSaving}
                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {#if isSaving}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {/if}
                    {t("common.delete")}
                </button>
            </div>
        </div>
    </div>
{/if}
