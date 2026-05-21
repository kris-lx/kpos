<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { formatCurrency, formatDate } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import {
        Users,
        Plus,
        Search,
        Edit,
        Trash2,
        X,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Crown,
        Medal,
        Award,
        Star,
        Phone,
        Mail,
        Calendar,
        Gift,
        Eye,
        UserPlus,
        Filter,
        Download,
        Upload,
        MoreVertical,
        MapPin,
        Coins,
        TrendingUp,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let tierFilter = $state<string | null>(null);
    let isLoading = $state(true);
    let showModal = $state(false);
    let showViewModal = $state(false);
    let editingMember = $state<any>(null);
    let viewingMember = $state<any>(null);
    let currentPage = $state(1);
    let itemsPerPage = $state(8); // 2 rows x 4 columns
    const itemsPerPageOptions = [8, 16, 32, 50];

    // Data
    let members = $state<any[]>([]);
    let membershipTiers = $state<any[]>([]);

    // Form (matches Prisma Customer schema)
    let formData = $state({
        name: "",
        phone: "",
        email: "",
        birthDate: "",
        address: "",
        points: 0,
        totalSpent: 0,
        isActive: true,
    });

    function computeTier(points: number): string {
        if (membershipTiers.length > 0) {
            const sorted = [...membershipTiers].sort((a, b) => b.minPoints - a.minPoints);
            const tier = sorted.find((t) => points >= t.minPoints);
            return tier ? tier.name.toLowerCase() : "bronze";
        }
        // fallback while tiers load
        if (points >= 5000) return "platinum";
        if (points >= 2000) return "gold";
        if (points >= 500) return "silver";
        return "bronze";
    }

    // Stats
    let stats = $derived({
        total: members.length,
        platinum: members.filter((m) => computeTier(m.points || 0) === "platinum").length,
        gold: members.filter((m) => computeTier(m.points || 0) === "gold").length,
        silver: members.filter((m) => computeTier(m.points || 0) === "silver").length,
        bronze: members.filter((m) => computeTier(m.points || 0) === "bronze").length,
        totalPoints: members.reduce((sum, m) => sum + (m.points || 0), 0),
    });

    function getTierConfig(tier: string) {
        switch (tier) {
            case "platinum":
                return {
                    icon: Crown,
                    bg: "bg-gradient-to-r from-slate-700 to-slate-500",
                    text: "text-white",
                    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                    label: "Platinum",
                };
            case "gold":
                return {
                    icon: Medal,
                    bg: "bg-gradient-to-r from-amber-500 to-yellow-400",
                    text: "text-white",
                    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
                    label: "Gold",
                };
            case "silver":
                return {
                    icon: Award,
                    bg: "bg-gradient-to-r from-gray-400 to-gray-300",
                    text: "text-gray-800",
                    badge: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
                    label: "Silver",
                };
            default:
                return {
                    icon: Star,
                    bg: "bg-gradient-to-r from-orange-600 to-orange-400",
                    text: "text-white",
                    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400",
                    label: "Bronze",
                };
        }
    }

    async function loadData() {
        isLoading = true;
        try {
            const res = await api.get("customers?limit=100").json<any>();
            members = res.data || [];
        } catch (e) {
            console.error("Failed to load:", e);
            members = [];
        } finally {
            isLoading = false;
        }
    }

    async function loadMembershipTiers() {
        try {
            const res = await api.get("customers/loyalty").json<any>();
            if (res.success && Array.isArray(res.data?.tiers)) {
                membershipTiers = res.data.tiers;
            }
        } catch {
            // keep fallback computeTier logic
        }
    }

    async function handleSubmit() {
        try {
            const data = { ...formData };
            if (editingMember) {
                await api.put(`customers/${editingMember.id}`, { json: data }).json();
                toast.success("ອັບເດດສະມາຊິກສຳເລັດ");
            } else {
                await api.post("customers", { json: data }).json();
                toast.success("ເພີ່ມສະມາຊິກສຳເລັດ");
            }
            showModal = false;
            resetForm();
            loadData();
        } catch (e) {
            console.error("Failed to save:", e);
            toast.error(t("common.error"));
        }
    }

    async function handleDelete(member: any) {
        if (!confirm(t("common.confirmDelete"))) return;
        try {
            await api.delete(`customers/${member.id}`).json();
            toast.success("ລຶບສະມາຊິກສຳເລັດ");
            loadData();
        } catch (e) {
            console.error("Failed to delete:", e);
            toast.error(t("common.error"));
        }
    }

    function openEdit(member: any) {
        editingMember = member;
        formData = {
            name: member.name || "",
            phone: member.phone || "",
            email: member.email || "",
            birthDate: member.birthDate?.split("T")[0] || "",
            address: member.address || "",
            points: member.points || 0,
            totalSpent: member.totalSpent || 0,
            isActive: member.isActive ?? true,
        };
        showModal = true;
    }

    function openView(member: any) {
        viewingMember = member;
        showViewModal = true;
    }

    function resetForm() {
        editingMember = null;
        formData = {
            name: "",
            phone: "",
            email: "",
            birthDate: "",
            address: "",
            points: 0,
            totalSpent: 0,
            isActive: true,
        };
    }

    // Filtered
    let filteredMembers = $derived.by(() => {
        return members.filter((member) => {
            const matchSearch =
                member.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                member.phone?.includes(searchQuery) ||
                member.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                member.memberCode?.includes(searchQuery);

            const matchTier = !tierFilter || computeTier(member.points || 0) === tierFilter;

            return matchSearch && matchTier;
        });
    });

    let paginatedMembers = $derived.by(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredMembers.slice(start, start + itemsPerPage);
    });

    let totalItems = $derived(filteredMembers.length);
    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
        }
    }

    function exportToCSV() {
        const rows = [
            ["ລະຫັດ", "ຊື່", "ເບີໂທ", "ອີເມລ", "ຄະແນນ", "ຍອດໃຊ້ຈ່າຍ", "ລະດັບ", "ສະຖານະ"],
            ...filteredMembers.map((m) => [
                m.memberCode || m.id.slice(-8).toUpperCase(),
                m.name || "",
                m.phone || "",
                m.email || "",
                m.points || 0,
                m.totalSpent || 0,
                computeTier(m.points || 0),
                m.isActive ? "ໃຊ້ງານ" : "ປິດ",
            ]),
        ];
        const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    onMount(() => { loadData(); loadMembershipTiers(); });
</script>

<svelte:head>
    <title>ສະມາຊິກ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
                    <Users class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        ສະມາຊິກ
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        ຈັດການສະມາຊິກ ແລະ ຄະແນນສະສົມ
                    </p>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <button onclick={exportToCSV} class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                <Download class="w-4 h-4" />
                ສົ່ງອອກ CSV
            </button>
            <button
                onclick={() => {
                    resetForm();
                    showModal = true;
                }}
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:from-emerald-600 hover:to-teal-700 transition-all"
            >
                <UserPlus class="w-5 h-5" />
                ເພີ່ມສະມາຊິກ
            </button>
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                    <Users class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ທັງໝົດ</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <Crown class="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </div>
                <span class="text-2xl font-bold text-slate-600 dark:text-slate-400">{stats.platinum}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Platinum</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Medal class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.gold}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Gold</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <Award class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <span class="text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.silver}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Silver</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
                    <Star class="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <span class="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.bronze}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Bronze</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Coins class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span class="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.totalPoints.toLocaleString()}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຄະແນນລວມ</p>
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
                    placeholder="ຄົ້ນຫາຊື່, ເບີໂທ, ອີເມວ..."
                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
            </div>

            <div class="flex gap-2">
                {#each [
                    { id: null, label: "ທັງໝົດ" },
                    { id: "platinum", label: "Platinum" },
                    { id: "gold", label: "Gold" },
                    { id: "silver", label: "Silver" },
                    { id: "bronze", label: "Bronze" },
                ] as filter}
                    <button
                        onclick={() => { tierFilter = filter.id; currentPage = 1; }}
                        class={cn(
                            "px-3 py-2 rounded-lg text-sm font-medium transition-all",
                            tierFilter === filter.id
                                ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        )}
                    >
                        {filter.label}
                    </button>
                {/each}
            </div>
        </div>
    </div>

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-emerald-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else if paginatedMembers.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
            <Users class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີສະມາຊິກ</h3>
            <p class="text-gray-500 dark:text-gray-400 mt-2">ເພີ່ມສະມາຊິກໃໝ່ເພື່ອເລີ່ມຕົ້ນ</p>
        </div>
    {:else}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {#each paginatedMembers as member (member.id)}
                {@const tierConfig = getTierConfig(computeTier(member.points || 0))}
                {@const TierIcon = tierConfig.icon}

                <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-all">
                    <!-- Header with Tier -->
                    <div class={cn("p-4", tierConfig.bg)}>
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <TierIcon class={cn("w-5 h-5", tierConfig.text)} />
                                <span class={cn("text-sm font-semibold", tierConfig.text)}>
                                    {tierConfig.label}
                                </span>
                            </div>
                            <span class={cn("text-xs font-mono", tierConfig.text)}>
                                #{member.memberCode || "-"}
                            </span>
                        </div>
                    </div>

                    <!-- Content -->
                    <div class="p-4">
                        <h3 class="font-semibold text-gray-900 dark:text-white text-lg mb-3">
                            {member.name}
                        </h3>

                        <div class="space-y-2 text-sm">
                            {#if member.phone}
                                <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                    <Phone class="w-4 h-4" />
                                    <span>{member.phone}</span>
                                </div>
                            {/if}
                            {#if member.email}
                                <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                    <Mail class="w-4 h-4" />
                                    <span class="truncate">{member.email}</span>
                                </div>
                            {/if}
                        </div>

                        <!-- Stats -->
                        <div class="grid grid-cols-2 gap-2 mt-4">
                            <div class="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg text-center">
                                <p class="text-lg font-bold text-purple-600 dark:text-purple-400">
                                    {(member.points || 0).toLocaleString()}
                                </p>
                                <p class="text-xs text-purple-600/70 dark:text-purple-400/70">ຄະແນນ</p>
                            </div>
                            <div class="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg text-center">
                                <p class="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                    {formatCurrency(member.totalSpent || 0)}
                                </p>
                                <p class="text-xs text-emerald-600/70 dark:text-emerald-400/70">ໃຊ້ຈ່າຍ</p>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                            <button
                                onclick={() => openView(member)}
                                class="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                            >
                                <Eye class="w-4 h-4" />
                                ເບິ່ງ
                            </button>
                            <button
                                onclick={() => openEdit(member)}
                                class="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                            >
                                <Edit class="w-4 h-4" />
                                ແກ້ໄຂ
                            </button>
                            <button
                                onclick={() => handleDelete(member)}
                                class="p-2 text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded-lg transition-all"
                            >
                                <Trash2 class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    <!-- Pagination -->
    {#if totalPages >= 1}
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span>ສະແດງ</span>
                <select
                    bind:value={itemsPerPage}
                    onchange={() => { currentPage = 1; }}
                    class="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
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
                    <ChevronLeft class="w-5 h-5" />
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
            <div class="px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">
                    {editingMember ? "ແກ້ໄຂສະມາຊິກ" : "ເພີ່ມສະມາຊິກໃໝ່"}
                </h2>
                <button onclick={() => (showModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg transition-all">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <form
                onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}
                class="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
            >
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຊື່ *</label>
                    <input
                        type="text"
                        bind:value={formData.name}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ເບີໂທ</label>
                        <input
                            type="tel"
                            bind:value={formData.phone}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ອີເມວ</label>
                        <input
                            type="email"
                            bind:value={formData.email}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ວັນເດືອນປີເກີດ</label>
                    <input
                        type="date"
                        bind:value={formData.birthDate}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ທີ່ຢູ່</label>
                    <textarea
                        bind:value={formData.address}
                        rows="2"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                    ></textarea>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຄະແນນ</label>
                        <input
                            type="number"
                            bind:value={formData.points}
                            min="0"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຍອດໃຊ້ຈ່າຍ</label>
                        <input
                            type="number"
                            bind:value={formData.totalSpent}
                            min="0"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" bind:checked={formData.isActive} class="sr-only peer" />
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600"></div>
                    </label>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">ເປີດໃຊ້ງານ</span>
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
                        class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg"
                    >
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- View Modal -->
{#if showViewModal && viewingMember}
    {@const tierConfig = getTierConfig(computeTier(viewingMember.points || 0))}
    {@const TierIcon = tierConfig.icon}

    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Header -->
            <div class={cn("p-6", tierConfig.bg)}>
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                        <TierIcon class={cn("w-6 h-6", tierConfig.text)} />
                        <span class={cn("font-semibold", tierConfig.text)}>{tierConfig.label}</span>
                    </div>
                    <button onclick={() => (showViewModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg transition-all">
                        <X class={cn("w-5 h-5", tierConfig.text)} />
                    </button>
                </div>
                <h2 class={cn("text-2xl font-bold", tierConfig.text)}>{viewingMember.name}</h2>
                <p class={cn("text-sm opacity-80", tierConfig.text)}>#{viewingMember.memberCode || "-"}</p>
            </div>

            <!-- Content -->
            <div class="p-6 space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <div class="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-center">
                        <Coins class="w-6 h-6 mx-auto text-purple-500 mb-1" />
                        <p class="text-xl font-bold text-purple-600 dark:text-purple-400">{(viewingMember.points || 0).toLocaleString()}</p>
                        <p class="text-xs text-purple-600/70 dark:text-purple-400/70">ຄະແນນ</p>
                    </div>
                    <div class="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl text-center">
                        <TrendingUp class="w-6 h-6 mx-auto text-emerald-500 mb-1" />
                        <p class="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(viewingMember.totalSpent || 0)}</p>
                        <p class="text-xs text-emerald-600/70 dark:text-emerald-400/70">ໃຊ້ຈ່າຍລວມ</p>
                    </div>
                </div>

                <div class="space-y-3">
                    {#if viewingMember.phone}
                        <div class="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                            <Phone class="w-5 h-5 text-gray-400" />
                            <span>{viewingMember.phone}</span>
                        </div>
                    {/if}
                    {#if viewingMember.email}
                        <div class="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                            <Mail class="w-5 h-5 text-gray-400" />
                            <span>{viewingMember.email}</span>
                        </div>
                    {/if}
                    {#if viewingMember.birthDate}
                        <div class="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                            <Gift class="w-5 h-5 text-gray-400" />
                            <span>{formatDate(viewingMember.birthDate)}</span>
                        </div>
                    {/if}
                    {#if viewingMember.address}
                        <div class="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                            <MapPin class="w-5 h-5 text-gray-400" />
                            <span>{viewingMember.address}</span>
                        </div>
                    {/if}
                </div>

                <div class="flex gap-3 pt-4">
                    <button
                        onclick={() => { showViewModal = false; openEdit(viewingMember); }}
                        class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                        <Edit class="w-4 h-4" />
                        ແກ້ໄຂ
                    </button>
                    <button
                        onclick={() => (showViewModal = false)}
                        class="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium hover:from-emerald-600 hover:to-teal-700 transition-all"
                    >
                        ປິດ
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
