<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { formatDate } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import {
        Plus,
        Edit,
        Trash2,
        X,
        Calendar,
        Clock,
        Users,
        Phone,
        Mail,
        ChevronLeft,
        ChevronRight,
        Search,
        CalendarDays,
        CheckCircle,
        XCircle,
        UserCheck,
        AlertCircle,
        StickyNote,
        Loader2,
        Filter,
    } from "lucide-svelte";

    // State
    let reservations = $state<any[]>([]);
    let tables = $state<any[]>([]);
    let isLoading = $state(false);
    let showModal = $state(false);
    let editingId = $state<string | null>(null);
    let selectedDate = $state(new Date().toISOString().split("T")[0]);
    let searchQuery = $state("");
    let statusFilter = $state("all");

    // Pagination
    let currentPage = $state(1);
    let itemsPerPage = $state(10);

    let formData = $state({
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        date: new Date().toISOString().split("T")[0],
        time: "18:00",
        partySize: 2,
        tableId: "",
        notes: "",
        status: "confirmed",
    });

    // Status config
    function getStatusConfig(status: string) {
        switch (status) {
            case "confirmed":
                return {
                    bg: "bg-green-100 dark:bg-green-900/50",
                    text: "text-green-700 dark:text-green-400",
                    icon: CheckCircle,
                    label: t("restaurant.confirmed"),
                    dot: "bg-green-500",
                };
            case "pending":
                return {
                    bg: "bg-amber-100 dark:bg-amber-900/50",
                    text: "text-amber-700 dark:text-amber-400",
                    icon: Clock,
                    label: t("restaurant.pending"),
                    dot: "bg-amber-500",
                };
            case "seated":
                return {
                    bg: "bg-blue-100 dark:bg-blue-900/50",
                    text: "text-blue-700 dark:text-blue-400",
                    icon: UserCheck,
                    label: t("restaurant.seated"),
                    dot: "bg-blue-500",
                };
            case "completed":
                return {
                    bg: "bg-gray-100 dark:bg-gray-700",
                    text: "text-gray-600 dark:text-gray-400",
                    icon: CheckCircle,
                    label: t("restaurant.completed"),
                    dot: "bg-gray-500",
                };
            case "cancelled":
                return {
                    bg: "bg-red-100 dark:bg-red-900/50",
                    text: "text-red-700 dark:text-red-400",
                    icon: XCircle,
                    label: t("restaurant.cancelled"),
                    dot: "bg-red-500",
                };
            case "no-show":
                return {
                    bg: "bg-orange-100 dark:bg-orange-900/50",
                    text: "text-orange-700 dark:text-orange-400",
                    icon: AlertCircle,
                    label: t("restaurant.noShow"),
                    dot: "bg-orange-500",
                };
            default:
                return {
                    bg: "bg-gray-100 dark:bg-gray-700",
                    text: "text-gray-600 dark:text-gray-400",
                    icon: Clock,
                    label: status,
                    dot: "bg-gray-500",
                };
        }
    }

    // Filter reservations
    let filteredReservations = $derived(
        reservations.filter((r) => {
            const matchSearch = 
                r.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.customerPhone?.includes(searchQuery);
            const matchStatus = statusFilter === "all" || r.status === statusFilter;
            return matchSearch && matchStatus;
        })
    );

    let paginatedReservations = $derived(
        filteredReservations.slice(
            (currentPage - 1) * itemsPerPage,
            currentPage * itemsPerPage
        )
    );

    let totalPages = $derived(Math.ceil(filteredReservations.length / itemsPerPage));

    // Stats
    let stats = $derived({
        total: reservations.length,
        confirmed: reservations.filter((r) => r.status === "confirmed").length,
        pending: reservations.filter((r) => r.status === "pending").length,
        seated: reservations.filter((r) => r.status === "seated").length,
        totalGuests: reservations.reduce((acc, r) => acc + (r.partySize || 0), 0),
    });

    async function loadData() {
        isLoading = true;
        try {
            const [resRes, tableRes] = await Promise.all([
                api.get(`restaurant/reservations?date=${selectedDate}`).json<any>(),
                api.get("restaurant/tables").json<any>(),
            ]);
            reservations = resRes.data || [];
            tables = tableRes.data || [];
            currentPage = 1;
        } catch (e) {
            console.error("Failed to load data:", e);
            toast.error(t("common.loadFailed"));
        } finally {
            isLoading = false;
        }
    }

    async function handleSubmit() {
        try {
            if (editingId) {
                await api.put(`restaurant/reservations/${editingId}`, {
                    json: formData,
                }).json();
                toast.success(t("restaurant.reservationUpdated"));
            } else {
                await api.post("restaurant/reservations", { json: formData }).json();
                toast.success(t("restaurant.reservationCreated"));
            }
            showModal = false;
            resetForm();
            loadData();
        } catch (e) {
            console.error("Failed to save:", e);
            toast.error(t("common.error"));
        }
    }

    async function updateStatus(id: string, status: string) {
        try {
            await api.put(`restaurant/reservations/${id}`, { json: { status } }).json();
            toast.success(t("common.success"));
            loadData();
        } catch (e) {
            console.error("Failed to update:", e);
            toast.error(t("common.error"));
        }
    }

    async function handleDelete(id: string) {
        if (confirm(t("restaurant.confirmDelete"))) {
            try {
                await api.delete(`restaurant/reservations/${id}`).json();
                toast.success(t("common.success"));
                loadData();
            } catch (e) {
                console.error("Failed to delete:", e);
                toast.error(t("common.error"));
            }
        }
    }

    function editReservation(r: any) {
        editingId = r.id;
        formData = { ...r };
        showModal = true;
    }

    function resetForm() {
        editingId = null;
        formData = {
            customerName: "",
            customerPhone: "",
            customerEmail: "",
            date: selectedDate,
            time: "18:00",
            partySize: 2,
            tableId: "",
            notes: "",
            status: "confirmed",
        };
    }

    function changeDate(days: number) {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + days);
        selectedDate = d.toISOString().split("T")[0];
        loadData();
    }

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) currentPage = page;
    }

    onMount(() => loadData());
</script>

<svelte:head>
    <title>{t("restaurant.reservationsTitle")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg">
                    <CalendarDays class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        {t("restaurant.reservationsTitle")}
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {t("restaurant.reservationsSubtitle")}
                    </p>
                </div>
            </div>
        </div>
        
        <button
            onclick={() => {
                resetForm();
                showModal = true;
            }}
            class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:from-purple-600 hover:to-indigo-700 transition-all"
        >
            <Plus class="w-5 h-5" />
            {t("restaurant.addReservation")}
        </button>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <CalendarDays class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span class="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.totalReservations")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.confirmed}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.confirmed")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Clock class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.pending")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <UserCheck class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.seated}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.seated")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                    <Users class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <span class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.totalGuests}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("restaurant.guests")}</p>
        </div>
    </div>

    <!-- Date Picker & Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <!-- Date Navigation -->
            <div class="flex items-center gap-2">
                <button
                    onclick={() => changeDate(-1)}
                    class="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all"
                >
                    <ChevronLeft class="w-5 h-5" />
                </button>
                <div class="relative">
                    <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="date"
                        bind:value={selectedDate}
                        onchange={() => loadData()}
                        class="pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                </div>
                <button
                    onclick={() => changeDate(1)}
                    class="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all"
                >
                    <ChevronRight class="w-5 h-5" />
                </button>
                <span class="text-lg font-semibold text-gray-900 dark:text-white ml-2">
                    {formatDate(selectedDate)}
                </span>
            </div>
            
            <div class="flex-1"></div>
            
            <!-- Search -->
            <div class="relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder={t("common.search")}
                    class="pl-10 pr-4 py-2.5 w-full lg:w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
            </div>
            
            <!-- Status Filter -->
            <div class="relative">
                <Filter class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                    bind:value={statusFilter}
                    class="pl-10 pr-8 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none"
                >
                    <option value="all">{t("common.all")}</option>
                    <option value="confirmed">{t("restaurant.confirmed")}</option>
                    <option value="pending">{t("restaurant.pending")}</option>
                    <option value="seated">{t("restaurant.seated")}</option>
                    <option value="completed">{t("restaurant.completed")}</option>
                    <option value="cancelled">{t("restaurant.cancelled")}</option>
                </select>
            </div>
        </div>
    </div>

    <!-- Reservations Grid -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-purple-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else if filteredReservations.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
            <CalendarDays class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">{t("restaurant.noReservations")}</h3>
            <p class="text-gray-500 dark:text-gray-400 mt-2">ບໍ່ມີການຈອງໃນວັນທີ່ເລືອກ</p>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each paginatedReservations as r}
                {@const config = getStatusConfig(r.status)}
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <!-- Header -->
                    <div class={cn("px-4 py-3 flex items-center justify-between", config.bg)}>
                        <div class="flex items-center gap-3">
                            <div class="p-2 bg-white/80 dark:bg-gray-800/80 rounded-lg shadow-sm">
                                <Clock class={cn("w-5 h-5", config.text)} />
                            </div>
                            <div>
                                <div class={cn("text-xl font-bold", config.text)}>
                                    {r.time}
                                </div>
                                <div class="text-xs text-gray-600 dark:text-gray-400">
                                    {formatDate(r.date)}
                                </div>
                            </div>
                        </div>
                        <span class={cn(
                            "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
                            config.bg, config.text
                        )}>
                            <span class={cn("w-2 h-2 rounded-full", config.dot)}></span>
                            {config.label}
                        </span>
                    </div>

                    <!-- Content -->
                    <div class="p-4">
                        <div class="flex items-start gap-3 mb-4">
                            <div class="shrink-0 w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                                {r.customerName?.charAt(0).toUpperCase() || "?"}
                            </div>
                            <div class="flex-1 min-w-0">
                                <h3 class="font-semibold text-gray-900 dark:text-white truncate">
                                    {r.customerName}
                                </h3>
                                {#if r.customerPhone}
                                    <div class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        <Phone class="w-3.5 h-3.5" />
                                        {r.customerPhone}
                                    </div>
                                {/if}
                                {#if r.customerEmail}
                                    <div class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        <Mail class="w-3.5 h-3.5" />
                                        {r.customerEmail}
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                            <div class="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                <Users class="w-4 h-4" />
                                <span class="font-medium">{r.partySize} {t("restaurant.guests")}</span>
                            </div>
                            {#if r.table}
                                <div class="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-lg">
                                    <span class="font-medium">{r.table.name}</span>
                                </div>
                            {/if}
                        </div>

                        {#if r.notes}
                            <div class="mt-3 p-3 bg-amber-50 dark:bg-amber-900/30 rounded-xl border border-amber-200 dark:border-amber-800">
                                <div class="flex items-start gap-2">
                                    <StickyNote class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <p class="text-sm text-amber-800 dark:text-amber-300">{r.notes}</p>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Actions -->
                    <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
                        <div class="flex gap-2">
                            {#if r.status === "confirmed"}
                                <button
                                    onclick={() => updateStatus(r.id, "seated")}
                                    class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all flex items-center gap-1.5"
                                >
                                    <UserCheck class="w-4 h-4" />
                                    {t("restaurant.seat")}
                                </button>
                            {/if}
                            {#if r.status === "pending"}
                                <button
                                    onclick={() => updateStatus(r.id, "confirmed")}
                                    class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-all flex items-center gap-1.5"
                                >
                                    <CheckCircle class="w-4 h-4" />
                                    {t("common.confirm")}
                                </button>
                            {/if}
                        </div>
                        <div class="flex gap-1">
                            <button
                                onclick={() => editReservation(r)}
                                class="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-all"
                            >
                                <Edit class="w-4 h-4" />
                            </button>
                            {#if r.status !== "cancelled" && r.status !== "completed"}
                                <button
                                    onclick={() => handleDelete(r.id)}
                                    class="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all"
                                >
                                    <Trash2 class="w-4 h-4" />
                                </button>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Pagination -->
        {#if totalPages > 1}
            <div class="flex items-center justify-center gap-2 mt-6">
                <button
                    onclick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    class="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
                >
                    <ChevronLeft class="w-5 h-5" />
                </button>
                
                {#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page = i + 1;
                    if (totalPages > 5) {
                        if (currentPage <= 3) page = i + 1;
                        else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                        else page = currentPage - 2 + i;
                    }
                    return page;
                }) as page}
                    <button
                        onclick={() => goToPage(page)}
                        class={cn(
                            "w-10 h-10 rounded-xl text-sm font-medium transition-all",
                            page === currentPage
                                ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg"
                                : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        )}
                    >
                        {page}
                    </button>
                {/each}
                
                <button
                    onclick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    class="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
                >
                    <ChevronRight class="w-5 h-5" />
                </button>
            </div>
        {/if}
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Modal Header -->
            <div class="px-6 py-4 bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">
                    {editingId ? t("restaurant.editReservation") : t("restaurant.addReservation")}
                </h2>
                <button
                    onclick={() => (showModal = false)}
                    class="p-1.5 hover:bg-white/20 rounded-lg transition-all"
                >
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <!-- Modal Content -->
            <form
                onsubmit={(e) => {
                    e.preventDefault();
                    handleSubmit();
                }}
                class="p-6 space-y-4"
            >
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("restaurant.customerName")} *
                    </label>
                    <input
                        type="text"
                        bind:value={formData.customerName}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("common.phone")}
                        </label>
                        <div class="relative">
                            <Phone class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="tel"
                                bind:value={formData.customerPhone}
                                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("common.email")}
                        </label>
                        <div class="relative">
                            <Mail class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="email"
                                bind:value={formData.customerEmail}
                                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("common.date")} *
                        </label>
                        <div class="relative">
                            <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="date"
                                bind:value={formData.date}
                                required
                                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("restaurant.time")} *
                        </label>
                        <div class="relative">
                            <Clock class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="time"
                                bind:value={formData.time}
                                required
                                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("restaurant.partySize")}
                        </label>
                        <div class="relative">
                            <Users class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="number"
                                bind:value={formData.partySize}
                                min="1"
                                max="50"
                                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("restaurant.table")}
                    </label>
                    <select
                        bind:value={formData.tableId}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                        <option value="">{t("restaurant.autoAssign")}</option>
                        {#each tables as table}
                            <option value={table.id}>
                                {table.name} ({table.capacity} {t("restaurant.seats")})
                            </option>
                        {/each}
                    </select>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("common.notes")}
                    </label>
                    <textarea
                        bind:value={formData.notes}
                        rows="2"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                        placeholder="ອາຫານແພ້, ງານພິເສດ, ຄວາມຕ້ອງການພິເສດ..."
                    ></textarea>
                </div>

                <div class="flex justify-end gap-3 pt-4">
                    <button
                        type="button"
                        onclick={() => (showModal = false)}
                        class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="submit"
                        class="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-medium hover:from-purple-600 hover:to-indigo-700 transition-all shadow-lg"
                    >
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
