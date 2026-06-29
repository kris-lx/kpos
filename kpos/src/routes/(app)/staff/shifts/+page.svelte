<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn, formatDateTime, formatTime } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { toast } from "svelte-sonner";
    import MoneyInput from "$lib/components/MoneyInput.svelte";
    import {
        Clock,
        Plus,
        Search,
        Filter,
        Eye,
        X,
        Calendar,
        DollarSign,
        Loader2,
        Play,
        Square,
        ArrowUpCircle,
        ArrowDownCircle,
        RefreshCw,
        User,
        Building2,
        Receipt,
        TrendingUp,
        TrendingDown,
        Minus,
        ChevronLeft,
        ChevronRight,
    } from "lucide-svelte";

    // Types
    interface Shift {
        id: string;
        shiftNo: string;
        branchId: string;
        userId: string;
        registerId?: string;
        openingBalance: number;
        closingBalance?: number;
        expectedBalance?: number;
        difference?: number;
        status: "OPEN" | "CLOSED";
        openedAt: string;
        closedAt?: string;
        notes?: string;
        user?: { name: string; email?: string };
        register?: { name: string };
        transactions?: any[];
        cashMovements?: any[];
    }

    interface CashMovement {
        id: string;
        type: "FLOAT" | "PICKUP" | "PAYOUT";
        amount: number;
        reason?: string;
        createdAt: string;
    }

    // State
    let searchQuery = $state("");
    let statusFilter = $state<"all" | "OPEN" | "CLOSED">("all");
    let isLoading = $state(true);
    let shifts = $state<Shift[]>([]);
    let currentShift = $state<Shift | null>(null);
    let showOpenModal = $state(false);
    let showCloseModal = $state(false);
    let showDetailModal = $state(false);
    let showCashMovementModal = $state(false);
    let selectedShift = $state<Shift | null>(null);
    let isSubmitting = $state(false);

    // Pagination
    let currentPage = $state(1);
    let totalPages = $state(1);
    let totalShifts = $state(0);
    let pageSize = $state(20);
    const pageSizeOptions = [5, 10, 20, 50, 70, 100];

    // Form state
    let openingBalance = $state(0);
    let closingBalance = $state(0);
    let closeNotes = $state("");
    let movementType = $state<"FLOAT" | "PICKUP" | "PAYOUT">("FLOAT");
    let movementAmount = $state(0);
    let movementReason = $state("");

    // Filtered shifts
    let filteredShifts = $derived(
        shifts.filter((s) => {
            const matchesSearch =
                s.shiftNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.user?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                "";
            const matchesStatus =
                statusFilter === "all" ? true : s.status === statusFilter;
            return matchesSearch && matchesStatus;
        }),
    );

    // Stats
    let stats = $derived({
        total: shifts.length,
        open: shifts.filter((s) => s.status === "OPEN").length,
        closed: shifts.filter((s) => s.status === "CLOSED").length,
        totalCash: shifts
            .filter((s) => s.status === "CLOSED")
            .reduce((sum, s) => sum + (s.closingBalance || 0), 0),
    });

    // Load shifts
    async function loadShifts() {
        isLoading = true;
        try {
            const params = new URLSearchParams();
            params.append("page", String(currentPage));
            params.append("limit", String(pageSize));
            if (statusFilter !== "all") params.append("status", statusFilter);

            const response = await api
                .get(`sales/shifts?${params}`)
                .json<any>();
            if (response.success) {
                shifts = response.data || [];
                totalShifts = response.meta?.total || 0;
                totalPages = response.meta?.totalPages || 1;
                if (currentPage > totalPages) currentPage = totalPages;
            }
        } catch (error) {
            console.error("Failed to load shifts:", error);
            toast.error(t("error.network"));
        } finally {
            isLoading = false;
        }
    }

    // Load current shift
    async function loadCurrentShift() {
        try {
            const response = await api.get("sales/shifts/current").json<any>();
            if (response.success) {
                currentShift = response.data;
            }
        } catch (error) {
            console.error("Failed to load current shift:", error);
        }
    }

    // Open shift
    async function openShift() {
        isSubmitting = true;
        try {
            const response = await api
                .post("sales/shifts/open", {
                    json: { openingBalance },
                })
                .json<any>();

            if (response.success) {
                toast.success(t("shifts.openSuccess"));
                currentShift = response.data;
                showOpenModal = false;
                openingBalance = 0;
                await loadShifts();
            } else {
                toast.error(response.error?.message || t("error.network"));
            }
        } catch (error: any) {
            const errData = await error.response?.json?.();
            toast.error(errData?.error?.message || t("error.network"));
        } finally {
            isSubmitting = false;
        }
    }

    // Close shift
    async function closeShift() {
        if (!currentShift) return;
        isSubmitting = true;
        try {
            const response = await api
                .post(`sales/shifts/${currentShift.id}/close`, {
                    json: { closingBalance, notes: closeNotes },
                })
                .json<any>();

            if (response.success) {
                toast.success(t("shifts.closeSuccess"));
                currentShift = null;
                showCloseModal = false;
                closingBalance = 0;
                closeNotes = "";
                await loadShifts();
            } else {
                toast.error(response.error?.message || t("error.network"));
            }
        } catch (error: any) {
            const errData = await error.response?.json?.();
            toast.error(errData?.error?.message || t("error.network"));
        } finally {
            isSubmitting = false;
        }
    }

    // Add cash movement
    async function addCashMovement() {
        if (!currentShift) return;
        isSubmitting = true;
        try {
            const response = await api
                .post(`sales/shifts/${currentShift.id}/cash-movement`, {
                    json: {
                        type: movementType,
                        amount: movementAmount,
                        reason: movementReason,
                    },
                })
                .json<any>();

            if (response.success) {
                toast.success(t("shifts.movementSuccess"));
                showCashMovementModal = false;
                movementAmount = 0;
                movementReason = "";
                await loadCurrentShift();
            } else {
                toast.error(response.error?.message || t("error.network"));
            }
        } catch (error: any) {
            const errData = await error.response?.json?.();
            toast.error(errData?.error?.message || t("error.network"));
        } finally {
            isSubmitting = false;
        }
    }

    // View shift details
    async function viewShiftDetails(shift: Shift) {
        try {
            const response = await api
                .get(`sales/shifts/${shift.id}`)
                .json<any>();
            if (response.success) {
                selectedShift = response.data;
                showDetailModal = true;
            }
        } catch (error) {
            toast.error(t("error.network"));
        }
    }

    $effect(() => {
        auth.activeStoreId; // reload on store switch
        loadShifts();
        loadCurrentShift();
    });

    function formatCurrency(amount: number): string {
        return (
            "₭" +
            new Intl.NumberFormat("lo-LA", {
                minimumFractionDigits: 0,
            }).format(amount)
        );
    }




    function getStatusColor(status: string): string {
        return status === "OPEN"
            ? "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400"
            : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }

    function getDifferenceColor(diff: number): string {
        if (diff > 0)
            return "text-success-600 dark:text-success-400";
        if (diff < 0)
            return "text-danger-600 dark:text-danger-400";
        return "text-gray-600 dark:text-gray-400";
    }

    function getMovementIcon(type: string) {
        switch (type) {
            case "FLOAT":
                return ArrowDownCircle;
            case "PICKUP":
                return ArrowUpCircle;
            case "PAYOUT":
                return ArrowUpCircle;
            default:
                return Minus;
        }
    }

    function getMovementColor(type: string): string {
        switch (type) {
            case "FLOAT":
                return "text-success-600 dark:text-success-400";
            case "PICKUP":
            case "PAYOUT":
                return "text-danger-600 dark:text-danger-400";
            default:
                return "text-gray-600 dark:text-gray-400";
        }
    }

    function changePageSize(size: number) {
        pageSize = size;
        currentPage = 1;
        loadShifts();
    }

    function closeFromBackdrop(event: MouseEvent, close: () => void) {
        if (event.target === event.currentTarget) close();
    }
</script>

<svelte:head>
    <title>{t("shifts.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {t("shifts.title")}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t("shifts.subtitle")}
            </p>
        </div>
        <div class="flex gap-2 mt-4 sm:mt-0">
            {#if currentShift}
                <button
                    onclick={() => (showCashMovementModal = true)}
                    class={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        "bg-blue-600 text-white hover:bg-blue-700",
                    )}
                >
                    <DollarSign class="w-4 h-4" />
                    {t("shifts.cashMovement")}
                </button>
                <button
                    onclick={() => (showCloseModal = true)}
                    class={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        "bg-danger-600 text-white hover:bg-danger-700",
                    )}
                >
                    <Square class="w-4 h-4" />
                    {t("shifts.close")}
                </button>
            {:else}
                <button
                    onclick={() => (showOpenModal = true)}
                    class={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        "bg-primary-600 text-white hover:bg-primary-700",
                    )}
                >
                    <Play class="w-4 h-4" />
                    {t("shifts.open")}
                </button>
            {/if}
        </div>
    </div>

    <!-- Current Shift Card -->
    {#if currentShift}
        <div class="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 mb-6 text-white shadow-lg">
            <!-- Header row: title + badge + End Work button -->
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-4">
                    <div class="p-3 bg-white/20 rounded-xl">
                        <Clock class="w-8 h-8" />
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="text-xl font-bold">{t("shifts.currentShift")}</h2>
                            <span class="px-2 py-0.5 bg-success-400/30 border border-success-300/50 rounded-full text-xs font-medium text-success-100 animate-pulse">● {t("shifts.working")}</span>
                        </div>
                        <p class="text-primary-100">{currentShift.shiftNo}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button
                        onclick={() => (showCashMovementModal = true)}
                        class="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors"
                    >
                        <DollarSign class="w-4 h-4" />
                        {t("shifts.cashMovement")}
                    </button>
                    <button
                        onclick={() => (showCloseModal = true)}
                        class="flex items-center gap-2 px-5 py-2.5 bg-danger-500 hover:bg-danger-600 rounded-xl text-sm font-semibold transition-colors shadow-lg"
                    >
                        <Square class="w-4 h-4" />
                        {t("shifts.closeShift")}
                    </button>
                </div>
            </div>
            <!-- Stats row -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="text-center bg-white/10 rounded-xl p-3">
                    <p class="text-primary-100 text-sm">{t("shifts.openedAt")}</p>
                    <p class="font-semibold">{formatDateTime(currentShift.openedAt)}</p>
                </div>
                <div class="text-center bg-white/10 rounded-xl p-3">
                    <p class="text-primary-100 text-sm">{t("shifts.openingBalance")}</p>
                    <p class="font-semibold">{formatCurrency(currentShift.openingBalance)}</p>
                </div>
                <div class="text-center bg-white/10 rounded-xl p-3">
                    <p class="text-primary-100 text-sm">{t("shifts.transactions")}</p>
                    <p class="font-semibold">{currentShift.transactions?.length || 0}</p>
                </div>
                <div class="text-center bg-white/10 rounded-xl p-3">
                    <p class="text-primary-100 text-sm">{t("shifts.cashMovements")}</p>
                    <p class="font-semibold">{currentShift.cashMovements?.length || 0}</p>
                </div>
            </div>
        </div>
    {:else}
        <!-- No active shift — start work banner -->
        <div class="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 mb-6 text-center">
            <div class="w-16 h-16 mx-auto rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-4">
                <Play class="w-8 h-8 text-primary-500" />
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t("shifts.notStarted")}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-5">{t("shifts.startWorkHint")}</p>
            <button
                onclick={() => (showOpenModal = true)}
                class="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors shadow-lg"
            >
                <Play class="w-5 h-5" />
                {t("shifts.startWork")}
            </button>
        </div>
    {/if}

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <Clock class="w-5 h-5 text-blue-500" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                        {stats.total}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        {t("shifts.totalShifts")}
                    </p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-success-50 dark:bg-success-900/20 rounded-lg">
                    <Play class="w-5 h-5 text-success-500" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                        {stats.open}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        {t("shifts.openShifts")}
                    </p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <Square class="w-5 h-5 text-gray-500" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">
                        {stats.closed}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        {t("shifts.closedShifts")}
                    </p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <DollarSign class="w-5 h-5 text-purple-500" />
                </div>
                <div>
                    <p class="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCurrency(stats.totalCash)}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        {t("shifts.totalCash")}
                    </p>
                </div>
            </div>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6">
        <div class="p-4 flex flex-col sm:flex-row gap-4">
            <!-- Status Tabs -->
            <div class="flex gap-1 bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg">
                {#each [
                    { key: "all", label: t("common.all") },
                    { key: "OPEN", label: t("shifts.open") },
                    { key: "CLOSED", label: t("shifts.closed") },
                ] as tab}
                    <button
                        onclick={() => {
                            statusFilter = tab.key as any;
                            currentPage = 1;
                            loadShifts();
                        }}
                        class={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-all",
                            statusFilter === tab.key
                                ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
                        )}
                    >
                        {tab.label}
                    </button>
                {/each}
            </div>

            <!-- Search -->
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder={t("shifts.searchPlaceholder")}
                    class="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
            </div>

            <!-- Refresh -->
            <button
                onclick={() => loadShifts()}
                class="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
                <RefreshCw class="w-4 h-4" />
                {t("common.refresh")}
            </button>
        </div>
    </div>

    <!-- Shifts Table -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        {#if isLoading}
            <div class="flex items-center justify-center h-64">
                <Loader2 class="w-8 h-8 text-primary-600 animate-spin" />
            </div>
        {:else if filteredShifts.length === 0}
            <div class="flex flex-col items-center justify-center h-64">
                <Clock class="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                <p class="text-gray-500 dark:text-gray-400">
                    {t("shifts.noShifts")}
                </p>
            </div>
        {:else}
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t("shifts.shiftNo")}
                            </th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t("shifts.staff")}
                            </th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t("shifts.openedAt")}
                            </th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t("shifts.closedAt")}
                            </th>
                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t("shifts.openingBalance")}
                            </th>
                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t("shifts.closingBalance")}
                            </th>
                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t("shifts.difference")}
                            </th>
                            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t("common.status")}
                            </th>
                            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t("common.actions")}
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each filteredShifts as shift (shift.id)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td class="px-4 py-3">
                                    <span class="font-medium text-gray-900 dark:text-white">
                                        {shift.shiftNo}
                                    </span>
                                </td>
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-2">
                                        <div class="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                                            <User class="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                        </div>
                                        <span class="text-gray-900 dark:text-white">
                                            {shift.user?.name || "-"}
                                        </span>
                                    </div>
                                </td>
                                <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
                                    {formatDateTime(shift.openedAt)}
                                </td>
                                <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
                                    {shift.closedAt ? formatDateTime(shift.closedAt) : "-"}
                                </td>
                                <td class="px-4 py-3 text-right text-gray-900 dark:text-white font-medium">
                                    {formatCurrency(shift.openingBalance)}
                                </td>
                                <td class="px-4 py-3 text-right text-gray-900 dark:text-white font-medium">
                                    {shift.closingBalance !== undefined && shift.closingBalance !== null
                                        ? formatCurrency(shift.closingBalance)
                                        : "-"}
                                </td>
                                <td class="px-4 py-3 text-right font-medium {getDifferenceColor(shift.difference || 0)}">
                                    {#if shift.difference !== undefined && shift.difference !== null}
                                        <span class="flex items-center justify-end gap-1">
                                            {#if shift.difference > 0}
                                                <TrendingUp class="w-4 h-4" />
                                                +{formatCurrency(shift.difference)}
                                            {:else if shift.difference < 0}
                                                <TrendingDown class="w-4 h-4" />
                                                {formatCurrency(shift.difference)}
                                            {:else}
                                                {formatCurrency(0)}
                                            {/if}
                                        </span>
                                    {:else}
                                        -
                                    {/if}
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <span class="px-2 py-1 text-xs font-medium rounded-full {getStatusColor(shift.status)}">
                                        {shift.status === "OPEN" ? t("shifts.open") : t("shifts.closed")}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <button
                                        onclick={() => viewShiftDetails(shift)}
                                        class="p-2 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                        title={t("common.view")}
                                    >
                                        <Eye class="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <!-- Pagination -->
            {#if totalShifts > 0}
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {t("common.showing")} {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalShifts)} {t("common.of")} {totalShifts}
                    </p>
                    <div class="flex items-center gap-2">
                        <select
                            value={pageSize}
                            onchange={(e) => changePageSize(Number(e.currentTarget.value))}
                            class="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200"
                            aria-label="Rows per page"
                        >
                            {#each pageSizeOptions as size (size)}
                                <option value={size}>{size}</option>
                            {/each}
                        </select>
                        <button
                            onclick={() => {
                                if (currentPage > 1) {
                                    currentPage--;
                                    loadShifts();
                                }
                            }}
                            disabled={currentPage <= 1}
                            class="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft class="w-4 h-4" />
                        </button>
                        <span class="text-sm text-gray-600 dark:text-gray-400">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            onclick={() => {
                                if (currentPage < totalPages) {
                                    currentPage++;
                                    loadShifts();
                                }
                            }}
                            disabled={currentPage >= totalPages}
                            class="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight class="w-4 h-4" />
                        </button>
                    </div>
                </div>
            {/if}
        {/if}
    </div>
</div>

<!-- Open Shift Modal -->
{#if showOpenModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        onclick={(e) => closeFromBackdrop(e, () => (showOpenModal = false))}
        onkeydown={(e) => e.key === "Escape" && (showOpenModal = false)}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div
            class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md"
            role="document"
        >
            <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {t("shifts.openShift")}
                </h3>
                <button
                    onclick={() => (showOpenModal = false)}
                    class="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>
            <div class="p-4 space-y-4">
                <div>
                    <label for="openingBalance" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("shifts.openingBalance")}
                    </label>
                    <div class="relative">
                        <DollarSign class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            id="openingBalance"
                            type="number"
                            bind:value={openingBalance}
                            min="0"
                            step="1000"
                            class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                    </div>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("shifts.openingBalanceHint")}
                    </p>
                </div>
            </div>
            <div class="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => (showOpenModal = false)}
                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    {t("common.cancel")}
                </button>
                <button
                    onclick={openShift}
                    disabled={isSubmitting}
                    class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {#if isSubmitting}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {:else}
                        <Play class="w-4 h-4" />
                    {/if}
                    {t("shifts.openShift")}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Close Shift Modal -->
{#if showCloseModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        onclick={(e) => closeFromBackdrop(e, () => (showCloseModal = false))}
        onkeydown={(e) => e.key === "Escape" && (showCloseModal = false)}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div
            class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md"
            role="document"
        >
            <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {t("shifts.closeShift")}
                </h3>
                <button
                    onclick={() => (showCloseModal = false)}
                    class="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>
            <div class="p-4 space-y-4">
                <!-- Current shift info -->
                {#if currentShift}
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            {t("shifts.shiftNo")}: <span class="font-medium text-gray-900 dark:text-white">{currentShift.shiftNo}</span>
                        </p>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {t("shifts.openingBalance")}: <span class="font-medium text-gray-900 dark:text-white">{formatCurrency(currentShift.openingBalance)}</span>
                        </p>
                    </div>
                {/if}

                <div>
                    <label for="closingBalance" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("shifts.closingBalance")}
                    </label>
                    <div class="relative">
                        <DollarSign class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            id="closingBalance"
                            type="number"
                            bind:value={closingBalance}
                            min="0"
                            step="1000"
                            class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div>
                    <label for="closeNotes" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("common.notes")}
                    </label>
                    <textarea
                        id="closeNotes"
                        bind:value={closeNotes}
                        rows="3"
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                        placeholder={t("shifts.closeNotesPlaceholder")}
                    ></textarea>
                </div>
            </div>
            <div class="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => (showCloseModal = false)}
                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    {t("common.cancel")}
                </button>
                <button
                    onclick={closeShift}
                    disabled={isSubmitting}
                    class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-danger-600 text-white rounded-lg hover:bg-danger-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {#if isSubmitting}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {:else}
                        <Square class="w-4 h-4" />
                    {/if}
                    {t("shifts.closeShift")}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Cash Movement Modal -->
{#if showCashMovementModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        onclick={(e) => closeFromBackdrop(e, () => (showCashMovementModal = false))}
        onkeydown={(e) => e.key === "Escape" && (showCashMovementModal = false)}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div
            class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md"
            role="document"
        >
            <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {t("shifts.addCashMovement")}
                </h3>
                <button
                    onclick={() => (showCashMovementModal = false)}
                    class="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>
            <div class="p-4 space-y-4">
                <div>
                    <p class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t("shifts.movementType")}
                    </p>
                    <div class="grid grid-cols-3 gap-2">
                        {#each [
                            { key: "FLOAT", label: t("shifts.float"), icon: ArrowDownCircle, color: "green" },
                            { key: "PICKUP", label: t("shifts.pickup"), icon: ArrowUpCircle, color: "blue" },
                            { key: "PAYOUT", label: t("shifts.payout"), icon: ArrowUpCircle, color: "red" },
                        ] as type}
                            {@const MovementTypeIcon = type.icon}
                            <button
                                onclick={() => (movementType = type.key as any)}
                                class={cn(
                                    "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all",
                                    movementType === type.key
                                        ? type.color === "green"
                                            ? "border-success-500 bg-success-50 dark:bg-success-900/20"
                                            : type.color === "blue"
                                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                            : "border-danger-500 bg-danger-50 dark:bg-danger-900/20"
                                        : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500",
                                )}
                            >
                                <MovementTypeIcon
                                    class={cn(
                                        "w-6 h-6",
                                        type.color === "green"
                                            ? "text-success-600 dark:text-success-400"
                                            : type.color === "blue"
                                            ? "text-blue-600 dark:text-blue-400"
                                            : "text-danger-600 dark:text-danger-400",
                                    )}
                                />
                                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {type.label}
                                </span>
                            </button>
                        {/each}
                    </div>
                </div>

                <div>
                    <label for="movementAmount" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("common.amount")}
                    </label>
                    <div class="relative">
                        <DollarSign class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <MoneyInput
                            bind:value={movementAmount}
                            min={0}
                            class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div>
                    <label for="movementReason" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("shifts.reason")}
                    </label>
                    <input
                        id="movementReason"
                        type="text"
                        bind:value={movementReason}
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder={t("shifts.reasonPlaceholder")}
                    />
                </div>
            </div>
            <div class="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => (showCashMovementModal = false)}
                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    {t("common.cancel")}
                </button>
                <button
                    onclick={addCashMovement}
                    disabled={isSubmitting || movementAmount <= 0}
                    class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {#if isSubmitting}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {:else}
                        <Plus class="w-4 h-4" />
                    {/if}
                    {t("common.add")}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Shift Detail Modal -->
{#if showDetailModal && selectedShift}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        onclick={(e) => closeFromBackdrop(e, () => (showDetailModal = false))}
        onkeydown={(e) => e.key === "Escape" && (showDetailModal = false)}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div
            class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            role="document"
        >
            <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                        {t("shifts.shiftDetails")}
                    </h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{selectedShift.shiftNo}</p>
                </div>
                <button
                    onclick={() => (showDetailModal = false)}
                    class="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>
            <div class="p-4 overflow-y-auto flex-1 space-y-6">
                <!-- Shift Info -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                        <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                            <User class="w-4 h-4" />
                            <span class="text-sm">{t("shifts.staff")}</span>
                        </div>
                        <p class="font-medium text-gray-900 dark:text-white">{selectedShift.user?.name || "-"}</p>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                        <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                            <Building2 class="w-4 h-4" />
                            <span class="text-sm">{t("shifts.register")}</span>
                        </div>
                        <p class="font-medium text-gray-900 dark:text-white">{selectedShift.register?.name || "-"}</p>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                        <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                            <Calendar class="w-4 h-4" />
                            <span class="text-sm">{t("shifts.openedAt")}</span>
                        </div>
                        <p class="font-medium text-gray-900 dark:text-white">{formatDateTime(selectedShift.openedAt)}</p>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                        <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                            <Calendar class="w-4 h-4" />
                            <span class="text-sm">{t("shifts.closedAt")}</span>
                        </div>
                        <p class="font-medium text-gray-900 dark:text-white">
                            {selectedShift.closedAt ? formatDateTime(selectedShift.closedAt) : "-"}
                        </p>
                    </div>
                </div>

                <!-- Balance Summary -->
                <div>
                    <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        {t("shifts.balanceSummary")}
                    </h4>
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
                        <div class="flex justify-between">
                            <span class="text-gray-600 dark:text-gray-400">{t("shifts.openingBalance")}</span>
                            <span class="font-medium text-gray-900 dark:text-white">{formatCurrency(selectedShift.openingBalance)}</span>
                        </div>
                        {#if selectedShift.closingBalance !== undefined && selectedShift.closingBalance !== null}
                            <div class="flex justify-between">
                                <span class="text-gray-600 dark:text-gray-400">{t("shifts.closingBalance")}</span>
                                <span class="font-medium text-gray-900 dark:text-white">{formatCurrency(selectedShift.closingBalance)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600 dark:text-gray-400">{t("shifts.expectedBalance")}</span>
                                <span class="font-medium text-gray-900 dark:text-white">{formatCurrency(selectedShift.expectedBalance || 0)}</span>
                            </div>
                            <div class="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-600">
                                <span class="font-medium text-gray-700 dark:text-gray-300">{t("shifts.difference")}</span>
                                <span class="font-bold {getDifferenceColor(selectedShift.difference || 0)}">
                                    {#if (selectedShift.difference || 0) > 0}+{/if}{formatCurrency(selectedShift.difference || 0)}
                                </span>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Transactions -->
                {#if selectedShift.transactions && selectedShift.transactions.length > 0}
                    <div>
                        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                            <Receipt class="w-4 h-4" />
                            {t("shifts.transactions")} ({selectedShift.transactions.length})
                        </h4>
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-600 max-h-48 overflow-y-auto">
                            {#each selectedShift.transactions.slice(0, 10) as tx (tx.transactionNo)}
                                <div class="p-3 flex justify-between items-center">
                                    <div>
                                        <p class="text-sm font-medium text-gray-900 dark:text-white">{tx.transactionNo}</p>
                                        <p class="text-xs text-gray-500 dark:text-gray-400">{formatTime(tx.createdAt)}</p>
                                    </div>
                                    <span class="font-medium text-gray-900 dark:text-white">{formatCurrency(tx.total)}</span>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Cash Movements -->
                {#if selectedShift.cashMovements && selectedShift.cashMovements.length > 0}
                    <div>
                        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                            <DollarSign class="w-4 h-4" />
                            {t("shifts.cashMovements")} ({selectedShift.cashMovements.length})
                        </h4>
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-600">
                            {#each selectedShift.cashMovements as movement (movement.id)}
                                {@const MovementIcon = getMovementIcon(movement.type)}
                                <div class="p-3 flex justify-between items-center">
                                    <div class="flex items-center gap-3">
                                        <MovementIcon
                                            class="w-5 h-5 {getMovementColor(movement.type)}"
                                        />
                                        <div>
                                            <p class="text-sm font-medium text-gray-900 dark:text-white">
                                                {movement.type === "FLOAT"
                                                    ? t("shifts.float")
                                                    : movement.type === "PICKUP"
                                                    ? t("shifts.pickup")
                                                    : t("shifts.payout")}
                                            </p>
                                            {#if movement.reason}
                                                <p class="text-xs text-gray-500 dark:text-gray-400">{movement.reason}</p>
                                            {/if}
                                        </div>
                                    </div>
                                    <span class="font-medium {getMovementColor(movement.type)}">
                                        {movement.type === "FLOAT" ? "+" : "-"}{formatCurrency(movement.amount)}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Notes -->
                {#if selectedShift.notes}
                    <div>
                        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {t("common.notes")}
                        </h4>
                        <p class="text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            {selectedShift.notes}
                        </p>
                    </div>
                {/if}
            </div>
            <div class="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => (showDetailModal = false)}
                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    {t("common.close")}
                </button>
            </div>
        </div>
    </div>
{/if}
