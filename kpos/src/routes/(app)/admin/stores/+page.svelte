<script lang="ts">
    import { onMount } from "svelte";
    import { api } from "$lib/api";
    import { goto } from "$app/navigation";
    import { cn, formatCurrency } from "$lib/utils";
    import { auth } from "$lib/stores/auth.svelte";
    import { toast } from "svelte-sonner";
    import { t } from '$lib/i18n/index.svelte';
    import {
        Building2, Store, Package, Boxes, Users, BarChart3,
        ChevronRight, ChevronDown, RefreshCw, Loader2, Search,
        Tag, DollarSign, ArrowLeft, MapPin, Phone,
    } from "lucide-svelte";

    let canAccess = $state(false);
    let isLoading = $state(true);
    let searchQuery = $state("");
    let expandedTenants = $state<Set<string>>(new Set());
    let selectedBranch = $state<any>(null);
    let groupedData = $state<any[]>([]);

    onMount(async () => {
        const user = auth.user;
        if (!user) { goto("/login"); return; }
        if (!user.isSuperAdmin && !['admin', 'hq_admin', 'store_owner'].includes(user.role)) {
            toast.error(t('common.accessDenied'));
            goto("/dashboard");
            return;
        }
        canAccess = true;
        // Auto-expand single tenant
        await loadData();
    });

    async function loadData() {
        isLoading = true;
        try {
            const res = await api.get("admin/stores-overview").json<any>();
            if (res.success) {
                groupedData = res.data || [];
                // Auto-expand if only one tenant
                if (groupedData.length === 1 && groupedData[0].tenant) {
                    expandedTenants.add(groupedData[0].tenant.id);
                    expandedTenants = new Set(expandedTenants);
                } else {
                    // Expand all by default
                    for (const g of groupedData) {
                        if (g.tenant?.id) expandedTenants.add(g.tenant.id);
                    }
                    expandedTenants = new Set(expandedTenants);
                }
            }
        } catch {
            toast.error(t('common.loadFailed'));
        } finally {
            isLoading = false;
        }
    }

    function toggleTenant(id: string) {
        if (expandedTenants.has(id)) expandedTenants.delete(id);
        else expandedTenants.add(id);
        expandedTenants = new Set(expandedTenants);
    }

    const filteredData = $derived.by(() => {
        if (!searchQuery.trim()) return groupedData;
        const q = searchQuery.toLowerCase();
        return groupedData.map(g => ({
            ...g,
            branches: g.branches.filter((b: any) =>
                b.name?.toLowerCase().includes(q) ||
                b.code?.toLowerCase().includes(q) ||
                b.address?.toLowerCase().includes(q)
            ),
        })).filter(g => g.branches.length > 0 || g.tenant?.name?.toLowerCase().includes(q));
    });

    const totals = $derived.by(() => {
        let branches = 0, products = 0, users = 0, stockVal = 0;
        for (const g of groupedData) {
            branches += g.branches.length;
            for (const b of g.branches) {
                products += b.stats.productCount;
                users += b.stats.userCount;
                stockVal += b.stats.stockValue;
            }
        }
        return { branches, products, users, stockVal };
    });
</script>

{#if !canAccess}
    <div class="flex items-center justify-center h-64">
        <Loader2 class="w-8 h-8 animate-spin text-primary-500" />
    </div>
{:else}
<div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
            <button onclick={() => goto("/admin")} class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <ArrowLeft class="w-5 h-5 text-gray-500" />
            </button>
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ສາຂາ ແລະ ສະຖິຕິ</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400">ພາບລວມທຸກຮ້ານ / ສາຂາ ພ້ອມຂໍ້ມູນສິນຄ້າ, ສະຕ໋ອກ, ຜູ້ໃຊ້</p>
            </div>
        </div>
        <button
            onclick={loadData}
            disabled={isLoading}
            class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
        >
            <RefreshCw class={cn("w-4 h-4", isLoading && "animate-spin")} />
            ໂຫຼດໃໝ່
        </button>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each [
            { label: "ສາຂາທັງໝົດ", value: totals.branches, icon: Building2, color: "blue" },
            { label: "ສິນຄ້າ (ຮາຍການ)", value: totals.products, icon: Package, color: "green" },
            { label: "ຜູ້ໃຊ້", value: totals.users, icon: Users, color: "purple" },
            { label: "ມູນຄ່າສະຕ໋ອກ", value: formatCurrency(totals.stockVal), icon: DollarSign, color: "orange" },
        ] as card (card.label)}
            {@const CardIcon = card.icon}
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="flex items-center gap-3">
                    <div class={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        card.color === "blue" && "bg-blue-100 dark:bg-blue-900/30",
                        card.color === "green" && "bg-success-100 dark:bg-success-900/30",
                        card.color === "purple" && "bg-purple-100 dark:bg-purple-900/30",
                        card.color === "orange" && "bg-orange-100 dark:bg-orange-900/30",
                    )}>
                        <CardIcon class={cn(
                            "w-5 h-5",
                            card.color === "blue" && "text-blue-600 dark:text-blue-400",
                            card.color === "green" && "text-success-600 dark:text-success-400",
                            card.color === "purple" && "text-purple-600 dark:text-purple-400",
                            card.color === "orange" && "text-orange-600 dark:text-orange-400",
                        )} />
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
                        <p class="text-lg font-bold text-gray-900 dark:text-white">{card.value}</p>
                    </div>
                </div>
            </div>
        {/each}
    </div>

    <!-- Search -->
    <div class="relative max-w-sm">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
            type="text"
            bind:value={searchQuery}
            placeholder="ຄົ້ນຫາສາຂາ, ລະຫັດ..."
            class="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm"
        />
    </div>

    {#if isLoading}
        <div class="flex items-center justify-center py-16">
            <Loader2 class="w-8 h-8 animate-spin text-primary-500" />
        </div>
    {:else if filteredData.length === 0}
        <div class="text-center py-16 text-gray-400">
            <Building2 class="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>ບໍ່ພົບຂໍ້ມູນ</p>
        </div>
    {:else}
        <!-- Tenant groups -->
        <div class="space-y-4">
            {#each filteredData as group (group.tenant?.id ?? 'orphaned')}
                {@const isExpanded = group.tenant?.id ? expandedTenants.has(group.tenant.id) : true}
                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <!-- Tenant header -->
                    {#if group.tenant}
                        <button
                            onclick={() => toggleTenant(group.tenant.id)}
                            class="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                        >
                            {#if group.tenant.logo}
                                <img src={group.tenant.logo} alt={group.tenant.name} class="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                            {:else}
                                <div class="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                                    <Store class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                </div>
                            {/if}
                            <div class="flex-1 min-w-0">
                                <p class="font-semibold text-gray-900 dark:text-white">{group.tenant.name}</p>
                                <p class="text-xs text-gray-500 dark:text-gray-400">{group.branches.length} ສາຂາ · ແຜນ: {group.tenant.plan || 'free'}</p>
                            </div>
                            <ChevronDown class={cn("w-5 h-5 text-gray-400 transition-transform", isExpanded && "rotate-180")} />
                        </button>
                    {/if}

                    <!-- Branches grid -->
                    {#if isExpanded}
                        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4 border-t border-gray-100 dark:border-gray-700/50">
                            {#each group.branches as branch (branch.id)}
                                <button
                                    onclick={() => selectedBranch = selectedBranch?.id === branch.id ? null : branch}
                                    class={cn(
                                        "text-left p-4 rounded-xl border-2 transition-all hover:shadow-md",
                                        selectedBranch?.id === branch.id
                                            ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                            : "border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700"
                                    )}
                                >
                                    <div class="flex items-start gap-3 mb-3">
                                        {#if branch.logo}
                                            <img src={branch.logo} alt={branch.name} class="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700 shrink-0" />
                                        {:else}
                                            <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                                                <Building2 class="w-5 h-5 text-gray-400" />
                                            </div>
                                        {/if}
                                        <div class="flex-1 min-w-0">
                                            <p class="font-semibold text-gray-900 dark:text-white truncate">{branch.name}</p>
                                            <p class="text-xs text-gray-500 dark:text-gray-400">{branch.code}{branch.isMain ? ' · ສາຂາຫຼັກ' : ''}</p>
                                        </div>
                                    </div>
                                    {#if branch.address || branch.phone}
                                        <div class="space-y-1 mb-3">
                                            {#if branch.address}
                                                <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                                    <MapPin class="w-3 h-3 shrink-0" />
                                                    <span class="truncate">{branch.address}</span>
                                                </div>
                                            {/if}
                                            {#if branch.phone}
                                                <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                                    <Phone class="w-3 h-3 shrink-0" />
                                                    <span>{branch.phone}</span>
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}
                                    <!-- Stats row -->
                                    <div class="grid grid-cols-3 gap-2">
                                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
                                            <p class="text-sm font-bold text-gray-900 dark:text-white">{branch.stats.productCount}</p>
                                            <p class="text-[10px] text-gray-500 dark:text-gray-400">ສິນຄ້າ</p>
                                        </div>
                                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
                                            <p class="text-sm font-bold text-gray-900 dark:text-white">{branch.stats.userCount}</p>
                                            <p class="text-[10px] text-gray-500 dark:text-gray-400">ຜູ້ໃຊ້</p>
                                        </div>
                                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
                                            <p class="text-sm font-bold text-gray-900 dark:text-white">{branch.stats.storeCount}</p>
                                            <p class="text-[10px] text-gray-500 dark:text-gray-400">ຮ້ານ/POS</p>
                                        </div>
                                    </div>
                                </button>

                                <!-- Expanded branch detail (inline below clicked card) -->
                                {#if selectedBranch?.id === branch.id}
                                    <div class="md:col-span-2 xl:col-span-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-primary-200 dark:border-primary-800 p-5">
                                        <div class="flex items-center justify-between mb-4">
                                            <h3 class="font-semibold text-gray-900 dark:text-white">{branch.name} — ລາຍລະອຽດ</h3>
                                            <button onclick={() => selectedBranch = null} class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm">✕</button>
                                        </div>
                                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {#each [
                                                { label: "ສິນຄ້າ", value: branch.stats.productCount, icon: Package, suffix: "ລາຍການ" },
                                                { label: "ໝວດໝູ່", value: branch.stats.categoryCount, icon: Tag, suffix: "ໝວດ" },
                                                { label: "ສະຕ໋ອກລວມ", value: branch.stats.stockQty, icon: Boxes, suffix: "ຊິ້ນ" },
                                                { label: "ມູນຄ່າສະຕ໋ອກ", value: formatCurrency(branch.stats.stockValue), icon: DollarSign, suffix: "" },
                                                { label: "ຜູ້ໃຊ້", value: branch.stats.userCount, icon: Users, suffix: "ຄົນ" },
                                                { label: "ຮ້ານ/POS", value: branch.stats.storeCount, icon: Store, suffix: "ຮ້ານ" },
                                            ] as stat (stat.label)}
                                                {@const StatIcon = stat.icon}
                                                <div class="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                                                    <div class="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shrink-0">
                                                        <StatIcon class="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                                    </div>
                                                    <div>
                                                        <p class="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                                                        <p class="font-bold text-gray-900 dark:text-white">{stat.value} <span class="text-xs font-normal text-gray-400">{stat.suffix}</span></p>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                        <div class="mt-4 flex gap-3">
                                            <a href="/branches" class="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                                                <ChevronRight class="w-3.5 h-3.5" /> ຈັດການສາຂາ
                                            </a>
                                            <a href="/inventory" class="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                                                <ChevronRight class="w-3.5 h-3.5" /> ສິນຄ້າ / ສະຕ໋ອກ
                                            </a>
                                        </div>
                                    </div>
                                {/if}
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>
{/if}
