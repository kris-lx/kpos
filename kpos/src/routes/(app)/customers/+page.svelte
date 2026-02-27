<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { formatCurrency, enforcePhoneInput, formatPhone, formatDate } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import StoreBranchSelector from "$lib/components/StoreBranchSelector.svelte";
    import {
        Users,
        Plus,
        Search,
        Edit,
        Trash2,
        Phone,
        Mail,
        MapPin,
        Star,
        Crown,
        Gift,
        TrendingUp,
        Loader2,
        X,
        Wallet,
        ShoppingBag,
        Calendar,
        UserPlus,
        Award,
        ChevronRight,
        Heart,
        Filter,
        MoreVertical,
    } from "lucide-svelte";

    // Rule-based CRUD — also requires write access to active store
    const hasWriteAccess = $derived(auth.hasStoreAccess('write') || !auth.activeStoreId);
    const canCreateCustomer = $derived(auth.canCreate('customers') && hasWriteAccess);
    const canUpdateCustomer = $derived(auth.canUpdate('customers') && hasWriteAccess);
    const canDeleteCustomer = $derived(auth.canDelete('customers') && hasWriteAccess);

    // State
    let activeTab = $state<"all" | "members" | "vip">("all");
    let searchQuery = $state("");
    let isLoading = $state(true);
    let showModal = $state(false);
    let showDetailModal = $state(false);
    let editingCustomer = $state<any>(null);
    let selectedCustomer = $state<any>(null);

    // Pagination - 2 rows x 4 columns = 8
    let currentPage = $state(1);
    let itemsPerPage = $state(8);
    const itemsPerPageOptions = [8, 16, 32, 50];

    // Data
    let customers = $state<any[]>([]);

    // Form (matches Prisma Customer schema fields)
    let formData = $state({
        name: "",
        email: "",
        phone: "",
        address: "",
        taxId: "",
        birthDate: "",
        gender: "",
        notes: "",
        points: 0,
    });

    let genderOptions = $state<{value: string; label: string; labelLao?: string}[]>([]);

    async function loadEnums() {
        try {
            const res = await api.get("settings/enums?type=gender").json<any>();
            if (res.data?.gender) genderOptions = res.data.gender;
        } catch { /* keep defaults */ }
    }

    // Stats
    let stats = $derived({
        totalCustomers: customers.length,
        totalMembers: customers.filter((c) => c.points > 0).length,
        vipCustomers: customers.filter((c) => c.totalSpent > 1000000).length,
        newThisMonth: customers.filter((c) => {
            const date = new Date(c.createdAt);
            const now = new Date();
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }).length,
    });

    function getTierConfig(tier: string) {
        switch (tier) {
            case "PLATINUM":
                return {
                    bg: "bg-gradient-to-br from-violet-500 to-purple-600",
                    text: "text-white",
                    label: "ແພັດຕິນັມ",
                    icon: Crown,
                    badge: "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400",
                };
            case "GOLD":
                return {
                    bg: "bg-gradient-to-br from-amber-500 to-orange-600",
                    text: "text-white",
                    label: "ທອງ",
                    icon: Award,
                    badge: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400",
                };
            case "SILVER":
                return {
                    bg: "bg-gradient-to-br from-gray-400 to-gray-500",
                    text: "text-white",
                    label: "ເງິນ",
                    icon: Star,
                    badge: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400",
                };
            default:
                return {
                    bg: "bg-gradient-to-br from-amber-600 to-amber-700",
                    text: "text-white",
                    label: "ບຣອນ",
                    icon: Heart,
                    badge: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400",
                };
        }
    }

    async function loadData() {
        isLoading = true;
        try {
            const response = await api.get("customers").json<any>();
            customers = response.data || [];
        } catch (e) {
            console.error("Failed to load:", e);
            customers = [];
        } finally {
            isLoading = false;
        }
    }

    async function handleSubmit() {
        try {
            if (editingCustomer) {
                await api.put(`customers/${editingCustomer.id}`, { json: formData }).json();
                toast.success(t("common.success"));
            } else {
                await api.post("customers", { json: formData }).json();
                toast.success(t("common.success"));
            }
            showModal = false;
            resetForm();
            loadData();
        } catch (e) {
            console.error("Failed to save:", e);
            toast.error(t("common.error"));
        }
    }

    async function handleDelete(customer: any) {
        if (!confirm(t("common.confirmDelete"))) return;
        try {
            await api.delete(`customers/${customer.id}`).json();
            toast.success(t("common.success"));
            loadData();
        } catch (e) {
            console.error("Failed to delete:", e);
            toast.error(t("common.error"));
        }
    }

    function openEdit(customer: any) {
        editingCustomer = customer;
        formData = {
            name: customer.name || "",
            email: customer.email || "",
            phone: customer.phone || "",
            address: customer.address || "",
            taxId: customer.taxId || "",
            birthDate: customer.birthDate?.split("T")[0] || "",
            gender: customer.gender || "",
            notes: customer.notes || "",
            points: customer.points || 0,
        };
        showModal = true;
    }

    function openDetail(customer: any) {
        selectedCustomer = customer;
        showDetailModal = true;
    }

    function resetForm() {
        editingCustomer = null;
        formData = {
            name: "",
            email: "",
            phone: "",
            address: "",
            taxId: "",
            birthDate: "",
            gender: "",
            notes: "",
            points: 0,
        };
    }


    function getInitials(name: string): string {
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();
    }

    // Filtered data
    let filteredCustomers = $derived.by(() => {
        return customers.filter((customer) => {
            const matchSearch =
                customer.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                customer.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                customer.phone?.includes(searchQuery);
            
            const matchTab = 
                activeTab === "all" ? true :
                activeTab === "members" ? (customer.points > 0) :
                activeTab === "vip" ? (customer.totalSpent > 1000000) :
                true;

            return matchSearch && matchTab;
        });
    });

    // Pagination
    let totalItems = $derived(filteredCustomers.length);
    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));
    let paginatedCustomers = $derived.by(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredCustomers.slice(start, start + itemsPerPage);
    });

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
        }
    }

    // Reload when active store switches
    $effect(() => {
        auth.activeStoreId; // track dependency
        loadEnums();
        loadData();
    });
</script>

<svelte:head>
    <title>{t("nav.customers")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl shadow-lg">
                    <Users class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        {t("nav.customers")}
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        ຈັດການຂໍ້ມູນລູກຄ້າ ແລະ ສະມາຊິກ
                    </p>
                </div>
            </div>
        </div>
        
        <div class="flex items-center gap-3">
            <StoreBranchSelector onchange={() => loadData()} />
            {#if canCreateCustomer}
            <button
                onclick={() => {
                    resetForm();
                    showModal = true;
                }}
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:from-cyan-600 hover:to-blue-700 transition-all"
            >
                <UserPlus class="w-5 h-5" />
                {t("customers.addCustomer")}
            </button>
            {/if}
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Users class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalCustomers}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("customers.totalCustomers")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Crown class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span class="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.totalMembers}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("customers.members")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Star class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.vipCustomers}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("customers.vipCustomers")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <TrendingUp class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.newThisMonth}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("customers.newThisMonth")}</p>
        </div>
    </div>

    <!-- Tabs & Search -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <!-- Tabs -->
            <div class="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                {#each [
                    { id: "all", icon: Users, label: t("common.all") },
                    { id: "members", icon: Crown, label: t("customers.members") },
                    { id: "vip", icon: Star, label: "VIP" },
                ] as tab}
                    <button
                        onclick={() => { activeTab = tab.id as any; currentPage = 1; }}
                        class={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            activeTab === tab.id
                                ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        )}
                    >
                        <tab.icon class="w-4 h-4" />
                        {tab.label}
                    </button>
                {/each}
            </div>
            
            <div class="flex-1"></div>
            
            <!-- Search -->
            <div class="relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder={t("common.search")}
                    class="pl-10 pr-4 py-2.5 w-full lg:w-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
            </div>
        </div>
    </div>

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-cyan-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else if filteredCustomers.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
            <Users class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">{t("customers.noCustomers")}</h3>
            <p class="text-gray-500 dark:text-gray-400 mt-2">ບໍ່ມີຂໍ້ມູນລູກຄ້າ</p>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {#each paginatedCustomers as customer (customer.id)}
                {@const tierConfig = getTierConfig(customer.totalSpent > 5000000 ? 'PLATINUM' : customer.totalSpent > 1000000 ? 'GOLD' : customer.totalSpent > 500000 ? 'SILVER' : 'BRONZE')}
                
                <div 
                    class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-all cursor-pointer"
                    onclick={() => openDetail(customer)}
                    role="button"
                    tabindex="0"
                >
                    <!-- Header with Avatar -->
                    <div class="relative p-4 pb-0">
                        <div class="flex items-start gap-3">
                            <!-- Avatar -->
                            <div class={cn(
                                "w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold shrink-0",
                                customer.points > 0 ? tierConfig.bg : "bg-gradient-to-br from-gray-400 to-gray-500",
                                tierConfig.text
                            )}>
                                {getInitials(customer.name)}
                            </div>
                            
                            <div class="flex-1 min-w-0">
                                <div class="flex items-start justify-between gap-2">
                                    <div>
                                        <h3 class="font-semibold text-gray-900 dark:text-white truncate">
                                            {customer.name}
                                        </h3>
                                        {#if customer.points > 0}
                                            <span class={cn(
                                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-1",
                                                tierConfig.badge
                                            )}>
                                                <tierConfig.icon class="w-3 h-3" />
                                                {tierConfig.label}
                                            </span>
                                        {/if}
                                    </div>
                                    {#if canUpdateCustomer}
                                    <button 
                                        onclick={(e) => { e.stopPropagation(); openEdit(customer); }}
                                        class="p-1.5 text-gray-400 hover:text-cyan-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                                    >
                                        <Edit class="w-4 h-4" />
                                    </button>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Contact Info -->
                    <div class="px-4 py-3 space-y-2">
                        {#if customer.phone}
                            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <Phone class="w-4 h-4 shrink-0" />
                                <span class="truncate">{formatPhone(customer.phone)}</span>
                            </div>
                        {/if}
                        {#if customer.email}
                            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <Mail class="w-4 h-4 shrink-0" />
                                <span class="truncate">{customer.email}</span>
                            </div>
                        {/if}
                    </div>

                    <!-- Stats Footer -->
                    <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs">
                        {#if customer.points > 0}
                            <div class="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                                <Gift class="w-3.5 h-3.5" />
                                <span class="font-medium">{customer.points || 0} ຄະແນນ</span>
                            </div>
                        {:else}
                            <span class="text-gray-500 dark:text-gray-400">ບໍ່ແມ່ນສະມາຊິກ</span>
                        {/if}
                        <div class="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                            <Calendar class="w-3.5 h-3.5" />
                            <span>{formatDate(customer.createdAt)}</span>
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Pagination -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span>ສະແດງ</span>
                <select
                    bind:value={itemsPerPage}
                    onchange={() => { currentPage = 1; }}
                    class="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-cyan-500"
                >
                    {#each itemsPerPageOptions as size (size)}
                        <option value={size}>{size}</option>
                    {/each}
                </select>
                <span>ລາຍການ (ຈາກ {totalItems})</span>
            </div>
            <div class="flex items-center gap-2">
                <button
                    onclick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                    <ChevronRight class="w-5 h-5 rotate-180" />
                </button>
                <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {currentPage} / {totalPages || 1}
                </span>
                <button
                    onclick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                    <ChevronRight class="w-5 h-5" />
                </button>
            </div>
        </div>
    {/if}
</div>

<!-- Add/Edit Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Modal Header -->
            <div class="px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">
                    {editingCustomer ? t("common.edit") : t("customers.addCustomer")}
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
                class="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
            >
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("common.name")} *
                    </label>
                    <input
                        type="text"
                        bind:value={formData.name}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("customers.phone")}
                        </label>
                        <input
                            type="tel"
                            bind:value={formData.phone}
                            oninput={(e) => { formData.phone = enforcePhoneInput(e.currentTarget.value); }}
                            placeholder="20xxxxxxxx"
                            maxlength="10"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("customers.email")}
                        </label>
                        <input
                            type="email"
                            bind:value={formData.email}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("customers.address")}
                    </label>
                    <textarea
                        bind:value={formData.address}
                        rows="2"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                    ></textarea>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("common.notes")}
                    </label>
                    <textarea
                        bind:value={formData.notes}
                        rows="2"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                    ></textarea>
                </div>

                <!-- Additional Fields -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ເລກປະຈຳຕົວຜູ້ເສຍອາກອນ
                        </label>
                        <input
                            type="text"
                            bind:value={formData.taxId}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ເພດ
                        </label>
                        <select
                            bind:value={formData.gender}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        >
                            <option value="">-- ເລືອກ --</option>
                            {#if genderOptions.length > 0}
                                {#each genderOptions as g (g.value)}
                                    <option value={g.value}>{g.labelLao || g.label}</option>
                                {/each}
                            {:else}
                                <option value="male">ຊາຍ</option>
                                <option value="female">ຍິງ</option>
                                <option value="other">ອື່ນໆ</option>
                            {/if}
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ວັນເດືອນປີເກີດ
                        </label>
                        <input
                            type="date"
                            bind:value={formData.birthDate}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ຄະແນນ
                        </label>
                        <input
                            type="number"
                            bind:value={formData.points}
                            min="0"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        />
                    </div>
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
                        class="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium hover:from-cyan-600 hover:to-blue-700 transition-all shadow-lg"
                    >
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- Detail Modal -->
{#if showDetailModal && selectedCustomer}
    {@const tierConfig = getTierConfig(selectedCustomer.totalSpent > 5000000 ? 'PLATINUM' : selectedCustomer.totalSpent > 1000000 ? 'GOLD' : selectedCustomer.totalSpent > 500000 ? 'SILVER' : 'BRONZE')}
    
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Header -->
            <div class={cn("px-6 py-6", selectedCustomer.points > 0 ? tierConfig.bg : "bg-gradient-to-r from-gray-500 to-gray-600")}>
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-16 h-16 rounded-xl bg-white/20 flex items-center justify-center text-2xl font-bold text-white">
                            {getInitials(selectedCustomer.name)}
                        </div>
                        <div>
                            <h2 class="text-xl font-bold text-white">{selectedCustomer.name}</h2>
                            {#if selectedCustomer.points > 0}
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium text-white mt-1">
                                    <tierConfig.icon class="w-3 h-3" />
                                    {tierConfig.label}
                                </span>
                            {/if}
                        </div>
                    </div>
                    <button
                        onclick={() => (showDetailModal = false)}
                        class="p-1.5 hover:bg-white/20 rounded-lg transition-all"
                    >
                        <X class="w-5 h-5 text-white" />
                    </button>
                </div>
            </div>

            <!-- Content -->
            <div class="p-6 space-y-6">
                <!-- Contact Info -->
                <div class="space-y-3">
                    <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ຂໍ້ມູນຕິດຕໍ່</h3>
                    <div class="space-y-2">
                        {#if selectedCustomer.phone}
                            <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                <Phone class="w-5 h-5 text-gray-400" />
                                <span class="text-gray-900 dark:text-white">{formatPhone(selectedCustomer.phone)}</span>
                            </div>
                        {/if}
                        {#if selectedCustomer.email}
                            <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                <Mail class="w-5 h-5 text-gray-400" />
                                <span class="text-gray-900 dark:text-white">{selectedCustomer.email}</span>
                            </div>
                        {/if}
                        {#if selectedCustomer.address}
                            <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                <MapPin class="w-5 h-5 text-gray-400" />
                                <span class="text-gray-900 dark:text-white">{selectedCustomer.address}</span>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Member Stats -->
                {#if selectedCustomer.points > 0}
                    <div class="space-y-3">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ສະຖິຕິສະມາຊິກ</h3>
                        <div class="grid grid-cols-2 gap-3">
                            <div class="p-4 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-center">
                                <Gift class="w-6 h-6 text-purple-500 mx-auto mb-1" />
                                <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">{selectedCustomer.points || 0}</p>
                                <p class="text-xs text-purple-600/70 dark:text-purple-400/70">ຄະແນນສະສົມ</p>
                            </div>
                            <div class="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-center">
                                <ShoppingBag class="w-6 h-6 text-blue-500 mx-auto mb-1" />
                                <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{selectedCustomer.totalOrders || 0}</p>
                                <p class="text-xs text-blue-600/70 dark:text-blue-400/70">ການສັ່ງຊື້</p>
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- Actions -->
                <div class="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onclick={() => { showDetailModal = false; openEdit(selectedCustomer); }}
                        class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                        <Edit class="w-4 h-4" />
                        {t("common.edit")}
                    </button>
                    <button
                        onclick={() => { showDetailModal = false; handleDelete(selectedCustomer); }}
                        class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 font-medium transition-all"
                    >
                        <Trash2 class="w-4 h-4" />
                        {t("common.delete")}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
