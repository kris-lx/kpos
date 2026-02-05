<!-- ═══════════════════════════════════════════════════════════════════════════
     Cash Registers Management Page - KPOS
     ═══════════════════════════════════════════════════════════════════════════ -->
<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { t } from "$lib/i18n/index.svelte";
    import { cn, formatCurrency, formatDate } from "$utils";
    import { api } from "$api";
    import { toast } from "svelte-sonner";
    import {
        MonitorSmartphone,
        Plus,
        Search,
        X,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Power,
        PowerOff,
        DollarSign,
        Edit,
        Trash2,
        Building,
        User,
        Clock,
        Download,
        RefreshCw,
    } from "lucide-svelte";

    const queryClient = useQueryClient();

    // State
    let searchQuery = $state("");
    let statusFilter = $state<string | null>(null);
    let showModal = $state(false);
    let editingRegister = $state<any>(null);
    let currentPage = $state(1);
    let itemsPerPage = 12;

    // Form
    let formData = $state({
        name: "",
        branchId: "",
        assignedStaffId: "",
        openingBalance: 0,
        isActive: true,
    });

    // Fetch registers
    const registersQuery = createQuery({
        queryKey: ["cash-registers"],
        queryFn: async () => {
            const response = await api.get("management/cash-registers").json<any>();
            return response.data || [];
        },
    });

    // Fetch branches
    const branchesQuery = createQuery({
        queryKey: ["branches"],
        queryFn: async () => {
            const response = await api.get("branches").json<any>();
            return response.data || [];
        },
    });

    // Fetch staff
    const staffQuery = createQuery({
        queryKey: ["staff"],
        queryFn: async () => {
            const response = await api.get("staff").json<any>();
            return response.data || [];
        },
    });

    // Create mutation
    const createMutationFn = createMutation({
        mutationFn: async (data: typeof formData) => {
            const response = await api.post("management/cash-registers", { json: data }).json<any>();
            return response.data;
        },
        onSuccess: () => {
            toast.success(t("registers.createSuccess"));
            queryClient.invalidateQueries({ queryKey: ["cash-registers"] });
            closeModal();
        },
        onError: (error: any) => {
            toast.error(error.message || t("common.error"));
        },
    });

    // Update mutation
    const updateMutationFn = createMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
            const response = await api.put(`management/cash-registers/${id}`, { json: data }).json<any>();
            return response.data;
        },
        onSuccess: () => {
            toast.success(t("registers.updateSuccess"));
            queryClient.invalidateQueries({ queryKey: ["cash-registers"] });
            closeModal();
        },
        onError: (error: any) => {
            toast.error(error.message || t("common.error"));
        },
    });

    // Delete mutation
    const deleteMutationFn = createMutation({
        mutationFn: async (id: string) => {
            const response = await api.delete(`management/cash-registers/${id}`).json<any>();
            return response.data;
        },
        onSuccess: () => {
            toast.success(t("registers.deleteSuccess"));
            queryClient.invalidateQueries({ queryKey: ["cash-registers"] });
        },
        onError: (error: any) => {
            toast.error(error.message || t("common.error"));
        },
    });

    // Stats
    const stats = $derived({
        total: $registersQuery.data?.length || 0,
        active: $registersQuery.data?.filter((r: any) => r.isActive && r.status === "open").length || 0,
        inactive: $registersQuery.data?.filter((r: any) => !r.isActive || r.status === "closed").length || 0,
        totalCash: $registersQuery.data?.reduce((sum: number, r: any) => sum + (r.currentBalance || 0), 0) || 0,
    });

    // Filtered data
    const filteredRegisters = $derived(() => {
        const data = $registersQuery.data || [];
        return data.filter((r: any) => {
            const matchSearch = r.name?.toLowerCase().includes(searchQuery.toLowerCase());
            let matchStatus = true;
            if (statusFilter === "active") matchStatus = r.isActive && r.status === "open";
            else if (statusFilter === "inactive") matchStatus = !r.isActive || r.status === "closed";
            return matchSearch && matchStatus;
        });
    });

    const paginatedRegisters = $derived(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredRegisters().slice(start, start + itemsPerPage);
    });

    const totalPages = $derived(Math.ceil(filteredRegisters().length / itemsPerPage));

    function getStatusConfig(register: any) {
        if (!register.isActive) return { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", label: t("registers.statusDisabled") };
        if (register.status === "open") return { bg: "bg-green-100 dark:bg-green-900/50", text: "text-green-700 dark:text-green-400", label: t("registers.statusOpen") };
        return { bg: "bg-red-100 dark:bg-red-900/50", text: "text-red-700 dark:text-red-400", label: t("registers.statusClosed") };
    }

    function getBranchName(id: string) {
        return $branchesQuery.data?.find((b: any) => b.id === id)?.name || "-";
    }

    function getStaffName(id: string) {
        return $staffQuery.data?.find((s: any) => s.id === id)?.name || "-";
    }

    function openModal(register?: any) {
        if (register) {
            editingRegister = register;
            formData = {
                name: register.name || "",
                branchId: register.branchId || "",
                assignedStaffId: register.assignedStaffId || "",
                openingBalance: register.openingBalance || 0,
                isActive: register.isActive !== false,
            };
        } else {
            editingRegister = null;
            formData = { name: "", branchId: "", assignedStaffId: "", openingBalance: 0, isActive: true };
        }
        showModal = true;
    }

    function closeModal() {
        showModal = false;
        editingRegister = null;
        formData = { name: "", branchId: "", assignedStaffId: "", openingBalance: 0, isActive: true };
    }

    function handleSubmit() {
        if (!formData.name) {
            toast.error(t("common.fillRequired"));
            return;
        }
        if (editingRegister) {
            $updateMutationFn.mutate({ id: editingRegister.id, data: formData });
        } else {
            $createMutationFn.mutate(formData);
        }
    }

    function handleDelete(register: any) {
        if (confirm(t("registers.deleteConfirm"))) {
            $deleteMutationFn.mutate(register.id);
        }
    }

    const isPending = $derived($createMutationFn.isPending || $updateMutationFn.isPending);
</script>

<svelte:head>
    <title>{t("registers.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-slate-600 to-gray-700 rounded-xl shadow-lg">
                    <MonitorSmartphone class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{t("registers.title")}</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{t("registers.subtitle")}</p>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <button class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium">
                <Download class="w-4 h-4" />
                {t("registers.export")}
            </button>
            <button
                onclick={() => openModal()}
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-slate-600 to-gray-700 text-white rounded-xl text-sm font-semibold shadow-lg"
            >
                <Plus class="w-5 h-5" />
                {t("registers.addRegister")}
            </button>
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-slate-100 dark:bg-slate-900/50 rounded-lg">
                    <MonitorSmartphone class="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </div>
                <span class="text-2xl font-bold text-slate-600 dark:text-slate-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("registers.totalRegisters")}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <Power class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("registers.openRegisters")}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                    <PowerOff class="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <span class="text-2xl font-bold text-red-600 dark:text-red-400">{stats.inactive}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("registers.closedRegisters")}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                    <DollarSign class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span class="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(stats.totalCash)}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("registers.totalCash")}</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder={t("registers.searchPlaceholder")}
                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-slate-500"
                />
            </div>
            <div class="flex gap-2">
                {#each [{ id: null, label: t("registers.all") }, { id: "active", label: t("registers.active") }, { id: "inactive", label: t("registers.inactive") }] as filter}
                    <button
                        onclick={() => { statusFilter = filter.id; currentPage = 1; }}
                        class={cn("px-3 py-2 rounded-lg text-sm font-medium transition-all", statusFilter === filter.id ? "bg-slate-100 dark:bg-slate-900/50 text-slate-700 dark:text-slate-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
                    >
                        {filter.label}
                    </button>
                {/each}
            </div>
            <button
                onclick={() => queryClient.invalidateQueries({ queryKey: ["cash-registers"] })}
                class="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
                <RefreshCw class={cn("w-5 h-5 text-gray-500", $registersQuery.isFetching && "animate-spin")} />
            </button>
        </div>
    </div>

    <!-- Content -->
    {#if $registersQuery.isLoading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-slate-500 animate-spin" />
        </div>
    {:else if paginatedRegisters().length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <MonitorSmartphone class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">{t("registers.noRegisters")}</h3>
            <button
                onclick={() => openModal()}
                class="mt-4 px-4 py-2 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700"
            >
                {t("registers.addRegister")}
            </button>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each paginatedRegisters() as register}
                {@const statusConfig = getStatusConfig(register)}
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <div class="p-4 bg-gradient-to-r from-slate-600 to-gray-700 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <MonitorSmartphone class="w-6 h-6 text-white" />
                            <h3 class="text-lg font-bold text-white">{register.name}</h3>
                        </div>
                        <span class={cn("px-2.5 py-1 rounded-full text-xs font-medium", statusConfig.bg, statusConfig.text)}>
                            {statusConfig.label}
                        </span>
                    </div>
                    <div class="p-4 space-y-3">
                        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <Building class="w-4 h-4" />
                            <span>{t("registers.branch")}: {getBranchName(register.branchId)}</span>
                        </div>
                        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <User class="w-4 h-4" />
                            <span>{t("registers.assignedStaff")}: {getStaffName(register.assignedStaffId)}</span>
                        </div>
                        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <Clock class="w-4 h-4" />
                            <span>{t("registers.lastOpened")}: {register.lastOpened ? formatDate(register.lastOpened) : "-"}</span>
                        </div>
                        <div class="pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div class="flex justify-between items-center">
                                <span class="text-sm text-gray-500 dark:text-gray-400">{t("registers.currentBalance")}:</span>
                                <span class="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(register.currentBalance || 0)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                        <button
                            onclick={() => openModal(register)}
                            class="p-2 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/30 rounded-lg"
                            title={t("registers.editRegister")}
                        >
                            <Edit class="w-4 h-4" />
                        </button>
                        <button
                            onclick={() => handleDelete(register)}
                            class="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                            title={t("registers.deleteRegister")}
                            disabled={$deleteMutationFn.isPending}
                        >
                            <Trash2 class="w-4 h-4" />
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="flex items-center justify-center gap-2 mt-6">
            <button
                onclick={() => (currentPage = Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50"
            >
                <ChevronLeft class="w-5 h-5" />
            </button>
            <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{currentPage} / {totalPages}</span>
            <button
                onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50"
            >
                <ChevronRight class="w-5 h-5" />
            </button>
        </div>
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-slate-600 to-gray-700 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">{editingRegister ? t("registers.editRegister") : t("registers.addRegister")}</h2>
                <button onclick={closeModal} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("registers.name")} *</label>
                    <input
                        type="text"
                        bind:value={formData.name}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("registers.branch")}</label>
                    <select
                        bind:value={formData.branchId}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    >
                        <option value="">{t("registers.selectBranch")}</option>
                        {#if $branchesQuery.data}
                            {#each $branchesQuery.data as branch}
                                <option value={branch.id}>{branch.name}</option>
                            {/each}
                        {/if}
                    </select>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("registers.assignedStaff")}</label>
                    <select
                        bind:value={formData.assignedStaffId}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    >
                        <option value="">{t("registers.selectStaff")}</option>
                        {#if $staffQuery.data}
                            {#each $staffQuery.data as s}
                                <option value={s.id}>{s.name}</option>
                            {/each}
                        {/if}
                    </select>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("registers.openingBalance")}</label>
                    <input
                        type="number"
                        bind:value={formData.openingBalance}
                        min="0"
                        step="0.01"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    />
                </div>

                <div class="flex items-center gap-2">
                    <input
                        type="checkbox"
                        bind:checked={formData.isActive}
                        id="isActive"
                        class="w-4 h-4 rounded text-slate-600"
                    />
                    <label for="isActive" class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("registers.isActive")}</label>
                </div>

                <div class="flex justify-end gap-3 pt-4">
                    <button
                        type="button"
                        onclick={closeModal}
                        class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="submit"
                        disabled={isPending}
                        class="px-5 py-2.5 bg-gradient-to-r from-slate-600 to-gray-700 text-white rounded-xl font-medium shadow-lg disabled:opacity-50 flex items-center gap-2"
                    >
                        {#if isPending}
                            <Loader2 class="w-4 h-4 animate-spin" />
                        {/if}
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
