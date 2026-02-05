<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatCurrency, formatNumber, formatDate } from "$lib/utils";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Plus, X, Loader2, Trash2, Edit, Settings, Gift, Star, Sparkles, ChevronLeft, ChevronRight, AlertTriangle, AlertCircle, RefreshCw } from "lucide-svelte";

    let tiers = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showModal = $state(false);
    let showDeleteModal = $state(false);
    let tierToDelete = $state<any>(null);
    let isDeleting = $state(false);
    let editingTier = $state<any>(null);
    let isSaving = $state(false);
    let formData = $state({
        name: "",
        minPoints: 0,
        discountPercent: 0,
        pointsMultiplier: 1,
        benefits: [] as string[],
        color: "#6B7280",
        icon: "⭐",
    });

    // Pagination state
    let currentPage = $state(1);
    let pageSize = $state(10);
    let totalItems = $state(0);
    let totalPages = $derived(Math.ceil(totalItems / pageSize));

    let programSettings = $state({
        programName: "KPOS Loyalty",
        earnRate: 1,
        redeemRate: 100,
        pointsExpiry: 365,
        welcomeBonus: 50,
        birthdayBonus: 100,
        referralBonus: 200,
        isActive: true,
    });

    let newBenefit = $state("");

    const tierIcons = ["⭐", "🌟", "💎", "👑", "🏆", "🎖️"];
    const tierColors = [
        "#6B7280",
        "#CD7F32",
        "#C0C0C0",
        "#FFD700",
        "#E5E4E2",
        "#000000",
    ];

    onMount(() => {
        loadLoyaltyProgram();
    });

    async function loadLoyaltyProgram() {
        loading = true;
        error = null;
        try {
            const response = await api.get("customers/loyalty", {
                searchParams: {
                    page: currentPage,
                    limit: pageSize,
                }
            }).json<any>();
            if (response.success) {
                tiers = response.data?.tiers || [];
                programSettings = response.data?.settings || programSettings;
                totalItems = response.data?.pagination?.total || tiers.length;
            } else {
                error = "ບໍ່ສາມາດໂຫຼດຂໍ້ມູນໂປຣແກຣມສະມາຊິກໄດ້";
                tiers = [];
                totalItems = 0;
                toast.error("ບໍ່ສາມາດໂຫຼດຂໍ້ມູນໄດ້");
            }
        } catch (err) {
            console.error("Failed to load loyalty program:", err);
            error = "ເກີດຂໍ້ຜິດພາດໃນການໂຫຼດຂໍ້ມູນ";
            tiers = [];
            totalItems = 0;
            toast.error("ບໍ່ສາມາດໂຫຼດຂໍ້ມູນໄດ້");
        } finally {
            loading = false;
        }
    }

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadLoyaltyProgram();
        }
    }

    function nextPage() {
        if (currentPage < totalPages) {
            currentPage++;
            loadLoyaltyProgram();
        }
    }

    function prevPage() {
        if (currentPage > 1) {
            currentPage--;
            loadLoyaltyProgram();
        }
    }

    function openModal(tier?: any) {
        if (tier) {
            editingTier = tier;
            formData = { ...tier };
        } else {
            editingTier = null;
            formData = {
                name: "",
                minPoints: 0,
                discountPercent: 0,
                pointsMultiplier: 1,
                benefits: [],
                color: "#6B7280",
                icon: "⭐",
            };
        }
        showModal = true;
    }

    function addBenefit() {
        if (newBenefit.trim()) {
            formData.benefits = [...formData.benefits, newBenefit.trim()];
            newBenefit = "";
        }
    }

    function removeBenefit(index: number) {
        formData.benefits = formData.benefits.filter((_, i) => i !== index);
    }

    async function saveTier() {
        isSaving = true;
        try {
            if (editingTier) {
                await api.put(`customers/loyalty/tiers/${editingTier.id}`, {
                    json: formData,
                }).json();
                toast.success("ອັບເດດລະດັບສຳເລັດ");
            } else {
                await api.post("customers/loyalty/tiers", { json: formData }).json();
                toast.success("ເພີ່ມລະດັບສຳເລັດ");
            }
            showModal = false;
            loadLoyaltyProgram();
        } catch (error) {
            console.error("Failed to save tier:", error);
            toast.error("ບໍ່ສາມາດບັນທຶກໄດ້");
        } finally {
            isSaving = false;
        }
    }

    async function deleteTier(tier: any) {
        tierToDelete = tier;
        showDeleteModal = true;
    }

    async function confirmDelete() {
        if (!tierToDelete) return;
        isDeleting = true;
        try {
            await api.delete(`customers/loyalty/tiers/${tierToDelete.id}`).json();
            toast.success("ລົບລະດັບສຳເລັດ");
            showDeleteModal = false;
            tierToDelete = null;
            loadLoyaltyProgram();
        } catch (error) {
            console.error("Failed to delete tier:", error);
            toast.error("ບໍ່ສາມາດລົບໄດ້");
        } finally {
            isDeleting = false;
        }
    }

    function cancelDelete() {
        showDeleteModal = false;
        tierToDelete = null;
    }

    async function saveSettings() {
        try {
            await api.put("customers/loyalty/settings", {
                json: programSettings,
            }).json();
            toast.success("ບັນທຶກການຕັ້ງຄ່າແລ້ວ");
        } catch (error) {
            console.error("Failed to save settings:", error);
            toast.error("ບໍ່ສາມາດບັນທຶກໄດ້");
        }
    }
</script>

<svelte:head>
    <title>ໂປຣແກຣມສະມາຊິກ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg">
                    <Sparkles class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ໂປຣແກຣມສະມາຊິກ</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ຈັດການລະບົບຄະແນນສະສົມ ແລະ ລະດັບສະມາຊິກ</p>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <!-- Active Toggle -->
            <div class="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">ສະຖານະ</span>
                <button
                    onclick={() => (programSettings.isActive = !programSettings.isActive)}
                    class="relative w-14 h-7 rounded-full transition-colors {programSettings.isActive ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}"
                >
                    <div class="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transform transition-transform {programSettings.isActive ? 'left-8' : 'left-1'}"></div>
                </button>
                <span class="text-xs font-semibold {programSettings.isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}">
                    {programSettings.isActive ? 'ເປີດ' : 'ປິດ'}
                </span>
            </div>
        </div>
    </div>

    <!-- Stats Overview -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Star class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span class="text-2xl font-bold text-purple-600 dark:text-purple-400">{tiers.length}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ລະດັບທັງໝົດ</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Gift class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{programSettings.earnRate}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຄະແນນ/1,000₭</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Sparkles class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{programSettings.redeemRate}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຄະແນນ = 1,000₭</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <Gift class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span class="text-2xl font-bold text-green-600 dark:text-green-400">{programSettings.welcomeBonus}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ໂບນັດຕ້ອນຮັບ</p>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Settings Panel -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-purple-500 to-pink-600">
                <div class="flex items-center gap-2">
                    <Settings class="h-5 w-5 text-white" />
                    <h2 class="font-semibold text-lg text-white">ຕັ້ງຄ່າໂປຣແກຣມ</h2>
                </div>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຊື່ໂປຣແກຣມ</label>
                    <input
                        type="text"
                        bind:value={programSettings.programName}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ອັດຕາໄດ້ຮັບ</label>
                        <div class="relative">
                            <input
                                type="number"
                                bind:value={programSettings.earnRate}
                                min="0"
                                step="0.1"
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">ຄະແນນ/1K</span>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ອັດຕາແລກ</label>
                        <div class="relative">
                            <input
                                type="number"
                                bind:value={programSettings.redeemRate}
                                min="0"
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">= 1K</span>
                        </div>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຄະແນນໝົດອາຍຸ</label>
                    <div class="relative">
                        <input
                            type="number"
                            bind:value={programSettings.pointsExpiry}
                            min="0"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">ວັນ</span>
                    </div>
                </div>
                
                <!-- Bonus Section -->
                <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div class="flex items-center gap-2 mb-4">
                        <Gift class="h-4 w-4 text-purple-500" />
                        <h3 class="font-semibold text-gray-900 dark:text-white">ໂບນັດພິເສດ</h3>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        <div class="text-center p-3 bg-green-50 dark:bg-green-900/30 rounded-xl">
                            <input
                                type="number"
                                bind:value={programSettings.welcomeBonus}
                                min="0"
                                class="w-full text-center text-lg font-bold bg-transparent text-green-600 dark:text-green-400 border-none focus:ring-0"
                            />
                            <p class="text-xs text-green-600/70 dark:text-green-400/70">ສະມັກໃໝ່</p>
                        </div>
                        <div class="text-center p-3 bg-pink-50 dark:bg-pink-900/30 rounded-xl">
                            <input
                                type="number"
                                bind:value={programSettings.birthdayBonus}
                                min="0"
                                class="w-full text-center text-lg font-bold bg-transparent text-pink-600 dark:text-pink-400 border-none focus:ring-0"
                            />
                            <p class="text-xs text-pink-600/70 dark:text-pink-400/70">ວັນເກີດ</p>
                        </div>
                        <div class="text-center p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
                            <input
                                type="number"
                                bind:value={programSettings.referralBonus}
                                min="0"
                                class="w-full text-center text-lg font-bold bg-transparent text-blue-600 dark:text-blue-400 border-none focus:ring-0"
                            />
                            <p class="text-xs text-blue-600/70 dark:text-blue-400/70">ແນະນຳເພື່ອນ</p>
                        </div>
                    </div>
                </div>
                
                <button
                    onclick={saveSettings}
                    class="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-semibold hover:from-purple-600 hover:to-pink-700 transition-all shadow-lg"
                >
                    ບັນທຶກການຕັ້ງຄ່າ
                </button>
            </div>
        </div>

        <!-- Tiers Panel -->
        <div class="lg:col-span-2">
            <div class="flex justify-between items-center mb-4">
                <div class="flex items-center gap-2">
                    <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                        <Star class="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <h2 class="font-semibold text-lg text-gray-900 dark:text-white">ລະດັບສະມາຊິກ</h2>
                </div>
                <button
                    onclick={() => openModal()}
                    class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:from-amber-600 hover:to-orange-700 transition-all"
                >
                    <Plus class="h-4 w-4" />
                    ເພີ່ມລະດັບ
                </button>
            </div>

            {#if loading}
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
                    <Loader2 class="h-10 w-10 animate-spin text-purple-600 mx-auto" />
                    <p class="text-gray-500 dark:text-gray-400 mt-4">ກຳລັງໂຫຼດ...</p>
                </div>
            {:else if error}
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center shadow-sm">
                    <AlertCircle class="h-12 w-12 mx-auto text-red-500 dark:text-red-400 mb-4" />
                    <p class="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
                    <button
                        onclick={loadLoyaltyProgram}
                        class="flex items-center gap-2 mx-auto px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-semibold hover:from-purple-600 hover:to-pink-700 transition-all"
                    >
                        <RefreshCw class="h-4 w-4" />
                        ລອງໃໝ່
                    </button>
                </div>
            {:else if tiers.length === 0}
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
                    <Star class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີລະດັບສະມາຊິກ</h3>
                    <p class="text-gray-500 dark:text-gray-400 mt-2">ເພີ່ມລະດັບໃໝ່ເພື່ອເລີ່ມຕົ້ນ</p>
                    <button
                        onclick={() => openModal()}
                        class="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-semibold shadow-lg hover:from-amber-600 hover:to-orange-700 transition-all"
                    >
                        <Plus class="h-4 w-4" />
                        ເພີ່ມລະດັບ
                    </button>
                </div>
            {:else}
                <div class="grid gap-4 md:grid-cols-2">
                    {#each tiers.sort((a, b) => (a.minPoints || 0) - (b.minPoints || 0)) as tier}
                        <div
                            class="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-lg transition-all"
                            style="border-left: 6px solid {tier.color}"
                        >
                            <!-- Tier Header -->
                            <div class="p-4 flex items-center gap-4">
                                <div 
                                    class="w-14 h-14 rounded-xl flex items-center justify-center text-3xl"
                                    style="background: linear-gradient(135deg, {tier.color}20, {tier.color}40)"
                                >
                                    {tier.icon || '⭐'}
                                </div>
                                <div class="flex-1">
                                    <h3 class="font-bold text-xl" style="color: {tier.color}">
                                        {tier.name}
                                    </h3>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">
                                        ຄະແນນຂັ້ນຕ່ຳ: {formatNumber(tier.minPoints || 0)}
                                    </p>
                                </div>
                                <div class="text-right">
                                    <span class="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-full">
                                        {formatNumber(tier.memberCount || 0)} ສະມາຊິກ
                                    </span>
                                </div>
                            </div>

                            <!-- Stats -->
                            <div class="px-4 pb-4">
                                <div class="grid grid-cols-3 gap-2">
                                    <div class="text-center p-3 bg-green-50 dark:bg-green-900/30 rounded-xl">
                                        <p class="text-xl font-bold text-green-600 dark:text-green-400">
                                            {tier.discountPercent || 0}%
                                        </p>
                                        <p class="text-xs text-green-600/70 dark:text-green-400/70">ສ່ວນຫຼຸດ</p>
                                    </div>
                                    <div class="text-center p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
                                        <p class="text-xl font-bold text-blue-600 dark:text-blue-400">
                                            x{tier.pointsMultiplier || 1}
                                        </p>
                                        <p class="text-xs text-blue-600/70 dark:text-blue-400/70">ຄູນຄະແນນ</p>
                                    </div>
                                    <div class="text-center p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl">
                                        <p class="text-xl font-bold text-purple-600 dark:text-purple-400">
                                            {tier.benefits?.length || 0}
                                        </p>
                                        <p class="text-xs text-purple-600/70 dark:text-purple-400/70">ສິດທິພິເສດ</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Benefits Preview -->
                            {#if tier.benefits && tier.benefits.length > 0}
                                <div class="px-4 pb-4">
                                    <div class="flex flex-wrap gap-1">
                                        {#each tier.benefits.slice(0, 3) as benefit}
                                            <span class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                                                {benefit}
                                            </span>
                                        {/each}
                                        {#if tier.benefits.length > 3}
                                            <span class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                                                +{tier.benefits.length - 3}
                                            </span>
                                        {/if}
                                    </div>
                                </div>
                            {/if}

                            <!-- Actions -->
                            <div class="flex gap-2 border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50">
                                <button
                                    onclick={() => openModal(tier)}
                                    class="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                                >
                                    <Edit class="h-4 w-4" />
                                    ແກ້ໄຂ
                                </button>
                                <button
                                    onclick={() => deleteTier(tier)}
                                    class="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                                >
                                    <Trash2 class="h-4 w-4" />
                                    ລົບ
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>

                <!-- Pagination -->
                {#if totalPages > 1}
                    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div class="text-sm text-gray-600 dark:text-gray-400">
                            ສະແດງ {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalItems)} ຈາກ {totalItems} ລາຍການ
                        </div>
                        <div class="flex items-center gap-2">
                            <button
                                onclick={prevPage}
                                disabled={currentPage === 1}
                                class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400 transition-all"
                            >
                                <ChevronLeft class="h-5 w-5" />
                            </button>
                            <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                onclick={nextPage}
                                disabled={currentPage === totalPages}
                                class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400 transition-all"
                            >
                                <ChevronRight class="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                {/if}
            {/if}
        </div>
    </div>
</div>

{#if showModal}
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl">
            <!-- Modal Header -->
            <div class="px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">
                    {editingTier ? "ແກ້ໄຂລະດັບ" : "ເພີ່ມລະດັບໃໝ່"}
                </h2>
                <button onclick={() => (showModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg transition-all">
                    <X class="h-5 w-5 text-white" />
                </button>
            </div>

            <!-- Modal Content -->
            <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div class="flex gap-4">
                    <div class="flex-1">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຊື່ລະດັບ</label>
                        <input
                            type="text"
                            bind:value={formData.name}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ໄອຄອນ</label>
                        <div class="flex gap-1">
                            {#each tierIcons as icon}
                                <button
                                    type="button"
                                    onclick={() => (formData.icon = icon)}
                                    class="w-10 h-10 text-xl rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all {formData.icon === icon ? 'ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-900/30' : ''}"
                                >
                                    {icon}
                                </button>
                            {/each}
                        </div>
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ສີ</label>
                    <div class="flex gap-2">
                        {#each tierColors as color}
                            <button
                                type="button"
                                onclick={() => (formData.color = color)}
                                class="w-9 h-9 rounded-full border-2 border-gray-200 dark:border-gray-700 transition-all {formData.color === color ? 'ring-2 ring-offset-2 ring-amber-500 dark:ring-offset-gray-800 scale-110' : ''}"
                                style="background-color: {color}"
                            ></button>
                        {/each}
                    </div>
                </div>
                
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຄະແນນຂັ້ນຕ່ຳ</label>
                        <input
                            type="number"
                            bind:value={formData.minPoints}
                            min="0"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ສ່ວນຫຼຸດ %</label>
                        <input
                            type="number"
                            bind:value={formData.discountPercent}
                            min="0"
                            max="100"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຄູນຄະແນນ</label>
                        <input
                            type="number"
                            bind:value={formData.pointsMultiplier}
                            min="1"
                            max="10"
                            step="0.1"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ສິດທິພິເສດ</label>
                    <div class="flex gap-2 mb-2">
                        <input
                            type="text"
                            bind:value={newBenefit}
                            onkeypress={(e) => e.key === "Enter" && addBenefit()}
                            placeholder="ເພີ່ມສິດທິພິເສດ..."
                            class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        <button
                            type="button"
                            onclick={addBenefit}
                            class="px-4 py-2.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded-xl font-medium hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-all"
                        >
                            ເພີ່ມ
                        </button>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        {#each formData.benefits as benefit, index}
                            <span class="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm flex items-center gap-2">
                                {benefit}
                                <button
                                    type="button"
                                    onclick={() => removeBenefit(index)}
                                    class="w-4 h-4 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50 text-red-500 hover:bg-red-200 dark:hover:bg-red-900 transition-all"
                                >
                                    ×
                                </button>
                            </span>
                        {/each}
                    </div>
                </div>
            </div>
            
            <!-- Modal Footer -->
            <div class="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => (showModal = false)}
                    class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                    ຍົກເລີກ
                </button>
                <button
                    onclick={saveTier}
                    disabled={isSaving}
                    class="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-semibold hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg disabled:opacity-50"
                >
                    {#if isSaving}
                        <Loader2 class="h-4 w-4 animate-spin" />
                    {/if}
                    ບັນທຶກ
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div class="p-6">
                <div class="flex items-center gap-4 mb-4">
                    <div class="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
                        <AlertTriangle class="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-gray-900 dark:text-white">ຢືນຢັນການລົບ</h2>
                        <p class="text-sm text-gray-500 dark:text-gray-400">ການດຳເນີນການນີ້ບໍ່ສາມາດຍົກເລີກໄດ້</p>
                    </div>
                </div>
                <p class="text-gray-600 dark:text-gray-300">
                    ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລົບລະດັບ <span class="font-bold" style="color: {tierToDelete?.color}">{tierToDelete?.name}</span>? 
                    ສະມາຊິກທັງໝົດ {formatNumber(tierToDelete?.memberCount || 0)} ຄົນຈະຖືກຍ້າຍໄປລະດັບອື່ນ.
                </p>
            </div>
            <div class="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={cancelDelete}
                    class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                    ຍົກເລີກ
                </button>
                <button
                    onclick={confirmDelete}
                    disabled={isDeleting}
                    class="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold hover:from-red-600 hover:to-red-700 transition-all shadow-lg disabled:opacity-50"
                >
                    {#if isDeleting}
                        <Loader2 class="h-4 w-4 animate-spin" />
                    {/if}
                    ລົບ
                </button>
            </div>
        </div>
    </div>
{/if}
