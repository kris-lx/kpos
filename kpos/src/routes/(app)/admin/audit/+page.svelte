<script lang="ts">
    import { createQuery, useQueryClient } from "@tanstack/svelte-query";
    import { api } from "$lib/api";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { cn } from "$lib/utils";
    import {
        History,
        ArrowLeft,
        Loader2,
        Search,
        Filter,
        Calendar,
        ChevronLeft,
        ChevronRight,
        ChevronDown,
        Download,
        RefreshCw,
        User,
        Shield,
        Building2,
        Store,
        Key,
        Lock,
        Unlock,
        UserPlus,
        UserMinus,
        Edit,
        Trash2,
        Eye,
        Settings,
        ShoppingCart,
        Package,
        FileText,
        Activity,
        AlertTriangle,
        CheckCircle,
        XCircle,
        Clock,
        X
    } from "lucide-svelte";

    import { auth } from "$lib/stores/auth.svelte";

    const queryClient = useQueryClient();

    let canAccess = $state(false);
    onMount(async () => {
        try {
            const user = auth.user;
            if (!user) {
                goto("/login");
                return;
            }
            // ສະເພາະ Super Admin ແລະ Admin ເທົ່ານັ້ນທີ່ເບິ່ງ Audit Logs ໄດ້
            if (user.isSuperAdmin || user.role === 'admin') {
                canAccess = true;
            } else {
                toast.error("ທ່ານບໍ່ມີສິດເຂົ້າເຖິງໜ້ານີ້");
                goto("/admin");
            }
        } catch {
            goto("/dashboard");
        }
    });

    let searchQuery = $state("");
    let actionFilter = $state("");
    let userFilter = $state("");
    let dateFrom = $state("");
    let dateTo = $state("");
    let currentPage = $state(1);
    let pageSize = $state(20);
    let showFilters = $state(false);
    let showDetailModal = $state(false);
    let selectedLog = $state<any>(null);

    const auditQuery = createQuery({
        queryKey: () => ["admin-audit-logs", currentPage, pageSize, searchQuery, actionFilter, userFilter, dateFrom, dateTo],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.append("page", String(currentPage));
            params.append("limit", String(pageSize));
            if (searchQuery) params.append("search", searchQuery);
            if (actionFilter) params.append("action", actionFilter);
            if (userFilter) params.append("userId", userFilter);
            if (dateFrom) params.append("dateFrom", dateFrom);
            if (dateTo) params.append("dateTo", dateTo);
            
            const response = await api.get(`admin/audit?${params}`).json<any>();
            return response;
        },
    });

    const usersQuery = createQuery({
        queryKey: ["admin-users-list"],
        queryFn: async () => {
            const response = await api.get("admin/users?limit=1000").json<any>();
            return response.data || [];
        }
    });

    function refreshData() {
        queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
    }

    function clearFilters() {
        searchQuery = "";
        actionFilter = "";
        userFilter = "";
        dateFrom = "";
        dateTo = "";
        currentPage = 1;
    }

    function openDetailModal(log: any) {
        selectedLog = log;
        showDetailModal = true;
    }

    function getActionIcon(action: string) {
        switch (action) {
            case 'user_created': return UserPlus;
            case 'user_deleted': return UserMinus;
            case 'user_updated': return Edit;
            case 'role_created': 
            case 'role_updated':
            case 'role_deleted': return Key;
            case 'permission_updated': return Shield;
            case 'branch_created':
            case 'branch_updated':
            case 'branch_deleted': return Building2;
            case 'store_created':
            case 'store_updated':
            case 'store_deleted': return Store;
            case 'login': return Unlock;
            case 'logout': return Lock;
            case 'login_failed': return XCircle;
            case 'settings_updated': return Settings;
            case 'product_created':
            case 'product_updated':
            case 'product_deleted': return Package;
            case 'sale_created':
            case 'sale_voided':
            case 'sale_refunded': return ShoppingCart;
            default: return Activity;
        }
    }

    function getActionColor(action: string) {
        if (action.includes('created') || action === 'login') return 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30';
        if (action.includes('deleted') || action === 'logout' || action.includes('failed') || action.includes('voided')) return 'text-red-500 bg-red-100 dark:bg-red-900/30';
        if (action.includes('updated')) return 'text-blue-500 bg-blue-100 dark:bg-blue-900/30';
        return 'text-gray-500 bg-gray-100 dark:bg-gray-700';
    }

    function getActionLabel(action: string) {
        const labels: Record<string, string> = {
            'user_created': 'ສ້າງຜູ້ໃຊ້',
            'user_updated': 'ແກ້ໄຂຜູ້ໃຊ້',
            'user_deleted': 'ລຶບຜູ້ໃຊ້',
            'role_created': 'ສ້າງບົດບາດ',
            'role_updated': 'ແກ້ໄຂບົດບາດ',
            'role_deleted': 'ລຶບບົດບາດ',
            'permission_updated': 'ແກ້ໄຂສິດ',
            'branch_created': 'ສ້າງສາຂາ',
            'branch_updated': 'ແກ້ໄຂສາຂາ',
            'branch_deleted': 'ລຶບສາຂາ',
            'store_created': 'ສ້າງຮ້ານ',
            'store_updated': 'ແກ້ໄຂຮ້ານ',
            'store_deleted': 'ລຶບຮ້ານ',
            'login': 'ເຂົ້າສູ່ລະບົບ',
            'logout': 'ອອກຈາກລະບົບ',
            'login_failed': 'ເຂົ້າສູ່ລະບົບລົ້ມເຫຼວ',
            'settings_updated': 'ແກ້ໄຂການຕັ້ງຄ່າ',
            'product_created': 'ສ້າງສິນຄ້າ',
            'product_updated': 'ແກ້ໄຂສິນຄ້າ',
            'product_deleted': 'ລຶບສິນຄ້າ',
            'sale_created': 'ສ້າງການຂາຍ',
            'sale_voided': 'ຍົກເລີກການຂາຍ',
            'sale_refunded': 'ຄືນເງິນ',
        };
        return labels[action] || action;
    }

    function formatDateTime(date: string) {
        return new Intl.DateTimeFormat('lo-LA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(new Date(date));
    }

    function formatTimeAgo(date: string) {
        const now = new Date();
        const past = new Date(date);
        const diffMs = now.getTime() - past.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'ຫາກໍ່ນີ້';
        if (diffMins < 60) return `${diffMins} ນາທີກ່ອນ`;
        if (diffHours < 24) return `${diffHours} ຊົ່ວໂມງກ່ອນ`;
        if (diffDays < 7) return `${diffDays} ມື້ກ່ອນ`;
        return formatDateTime(date);
    }

    async function exportLogs() {
        try {
            toast.info("ກຳລັງສົ່ງອອກ...");
            const params = new URLSearchParams();
            if (searchQuery) params.append("search", searchQuery);
            if (actionFilter) params.append("action", actionFilter);
            if (userFilter) params.append("userId", userFilter);
            if (dateFrom) params.append("dateFrom", dateFrom);
            if (dateTo) params.append("dateTo", dateTo);
            params.append("format", "csv");
            
            const response = await api.get(`admin/audit/export?${params}`).blob();
            const url = window.URL.createObjectURL(response);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success("ສົ່ງອອກສຳເລັດ");
        } catch {
            toast.error("ເກີດຂໍ້ຜິດພາດໃນການສົ່ງອອກ");
        }
    }

    const actionOptions = [
        { value: '', label: 'ທັງໝົດ' },
        { value: 'login', label: 'ເຂົ້າສູ່ລະບົບ' },
        { value: 'logout', label: 'ອອກຈາກລະບົບ' },
        { value: 'user_created', label: 'ສ້າງຜູ້ໃຊ້' },
        { value: 'user_updated', label: 'ແກ້ໄຂຜູ້ໃຊ້' },
        { value: 'user_deleted', label: 'ລຶບຜູ້ໃຊ້' },
        { value: 'role_created', label: 'ສ້າງບົດບາດ' },
        { value: 'role_updated', label: 'ແກ້ໄຂບົດບາດ' },
        { value: 'permission_updated', label: 'ແກ້ໄຂສິດ' },
        { value: 'settings_updated', label: 'ແກ້ໄຂການຕັ້ງຄ່າ' },
    ];

    const totalPages = $derived(Math.ceil(($auditQuery.data?.total || 0) / pageSize));
</script>

<svelte:head>
    <title>ປະຫວັດການໃຊ້ງານ - Super Admin</title>
</svelte:head>

{#if !canAccess}
    <div class="flex items-center justify-center h-screen">
        <Loader2 class="h-12 w-12 animate-spin text-violet-500" />
    </div>
{:else}
    <div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div class="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <!-- Header -->
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div class="flex items-center gap-4">
                    <a href="/admin" class="w-10 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">
                        <ArrowLeft class="w-5 h-5" />
                    </a>
                    <div class="w-14 h-14 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/25">
                        <History class="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 class="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">ປະຫວັດການໃຊ້ງານ</h1>
                        <p class="text-gray-500 dark:text-gray-400">ຕິດຕາມກິດຈະກຳທັງໝົດໃນລະບົບ</p>
                    </div>
                </div>
                <div class="flex gap-3">
                    <button 
                        onclick={refreshData}
                        class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
                    >
                        <RefreshCw class="w-4 h-4" />
                        <span class="hidden sm:inline">ໂຫຼດຄືນ</span>
                    </button>
                    <button 
                        onclick={exportLogs}
                        class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
                    >
                        <Download class="w-4 h-4" />
                        <span class="hidden sm:inline">ສົ່ງອອກ</span>
                    </button>
                </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-white dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-lg">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                            <History class="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$auditQuery.data?.total || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ລາຍການທັງໝົດ</p>
                        </div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-lg">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                            <Unlock class="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$auditQuery.data?.stats?.logins || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ເຂົ້າສູ່ລະບົບ</p>
                        </div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-lg">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <Edit class="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$auditQuery.data?.stats?.changes || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ການແກ້ໄຂ</p>
                        </div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-lg">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-br from-red-500 to-rose-500 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/30">
                            <AlertTriangle class="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$auditQuery.data?.stats?.errors || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ຂໍ້ຜິດພາດ</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Filters -->
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl overflow-hidden">
                <div class="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-4">
                    <div class="relative flex-1 min-w-64">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            bind:value={searchQuery}
                            placeholder="ຄົ້ນຫາ..."
                            class="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        />
                    </div>
                    <select
                        bind:value={actionFilter}
                        class="px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                        {#each actionOptions as option}
                            <option value={option.value}>{option.label}</option>
                        {/each}
                    </select>
                    <button 
                        onclick={() => showFilters = !showFilters}
                        class={cn(
                            "flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm transition-all",
                            showFilters 
                                ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400"
                                : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                        )}
                    >
                        <Filter class="w-4 h-4" />
                        ຕົວກອງ
                        <ChevronDown class={cn("w-4 h-4 transition-transform", showFilters && "rotate-180")} />
                    </button>
                    {#if searchQuery || actionFilter || userFilter || dateFrom || dateTo}
                        <button 
                            onclick={clearFilters}
                            class="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-all"
                        >
                            <X class="w-4 h-4" />
                            ລ້າງ
                        </button>
                    {/if}
                </div>

                {#if showFilters}
                    <div class="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ຜູ້ໃຊ້</label>
                            <select
                                bind:value={userFilter}
                                class="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            >
                                <option value="">ທັງໝົດ</option>
                                {#each $usersQuery.data || [] as user}
                                    <option value={user.id}>{user.name} ({user.email})</option>
                                {/each}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ວັນທີເລີ່ມ</label>
                            <input
                                type="date"
                                bind:value={dateFrom}
                                class="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ວັນທີສິ້ນສຸດ</label>
                            <input
                                type="date"
                                bind:value={dateTo}
                                class="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                {/if}

                <!-- Logs Table -->
                <div class="overflow-x-auto">
                    {#if $auditQuery.isLoading}
                        <div class="p-12 text-center">
                            <Loader2 class="w-10 h-10 animate-spin mx-auto text-indigo-500" />
                            <p class="text-gray-500 dark:text-gray-400 mt-4">ກຳລັງໂຫຼດ...</p>
                        </div>
                    {:else if ($auditQuery.data?.data?.length || 0) === 0}
                        <div class="p-16 text-center">
                            <div class="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                <History class="w-10 h-10 text-gray-400" />
                            </div>
                            <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">ບໍ່ພົບປະຫວັດ</h3>
                            <p class="text-gray-500 dark:text-gray-400">ບໍ່ມີກິດຈະກຳທີ່ກົງກັບເງື່ອນໄຂ</p>
                        </div>
                    {:else}
                        <table class="w-full">
                            <thead class="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ກິດຈະກຳ</th>
                                    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ຜູ້ໃຊ້</th>
                                    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ລາຍລະອຽດ</th>
                                    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">IP</th>
                                    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ເວລາ</th>
                                    <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ລາຍລະອຽດ</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                                {#each $auditQuery.data?.data || [] as log}
                                    {@const ActionIcon = getActionIcon(log.action)}
                                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <td class="px-4 py-3">
                                            <div class="flex items-center gap-3">
                                                <div class={cn("w-9 h-9 rounded-lg flex items-center justify-center", getActionColor(log.action))}>
                                                    <ActionIcon class="w-4 h-4" />
                                                </div>
                                                <span class="text-sm font-medium text-gray-900 dark:text-white">{getActionLabel(log.action)}</span>
                                            </div>
                                        </td>
                                        <td class="px-4 py-3">
                                            <div class="flex items-center gap-2">
                                                <div class="w-8 h-8 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                                                    {log.user?.name?.charAt(0) || '?'}
                                                </div>
                                                <div>
                                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{log.user?.name || 'System'}</p>
                                                    <p class="text-xs text-gray-500 dark:text-gray-400">{log.user?.email || ''}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-4 py-3">
                                            <p class="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">{log.description || '-'}</p>
                                        </td>
                                        <td class="px-4 py-3">
                                            <span class="text-sm text-gray-500 dark:text-gray-400 font-mono">{log.ip || '-'}</span>
                                        </td>
                                        <td class="px-4 py-3">
                                            <div>
                                                <p class="text-sm text-gray-900 dark:text-white">{formatTimeAgo(log.createdAt)}</p>
                                                <p class="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(log.createdAt)}</p>
                                            </div>
                                        </td>
                                        <td class="px-4 py-3 text-center">
                                            <button 
                                                onclick={() => openDetailModal(log)}
                                                class="w-8 h-8 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-400 transition-colors mx-auto"
                                            >
                                                <Eye class="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    {/if}
                </div>

                <!-- Pagination -->
                {#if ($auditQuery.data?.data?.length || 0) > 0}
                    <div class="p-4 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-4">
                        <div class="flex items-center gap-2">
                            <span class="text-sm text-gray-500 dark:text-gray-400">ສະແດງ</span>
                            <select
                                bind:value={pageSize}
                                onchange={() => currentPage = 1}
                                class="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                            <span class="text-sm text-gray-500 dark:text-gray-400">ຈາກ {$auditQuery.data?.total || 0} ລາຍການ</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <button 
                                onclick={() => currentPage = Math.max(1, currentPage - 1)}
                                disabled={currentPage === 1}
                                class="w-9 h-9 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft class="w-4 h-4" />
                            </button>
                            <span class="text-sm text-gray-700 dark:text-gray-300 px-3">
                                ໜ້າ {currentPage} / {totalPages || 1}
                            </span>
                            <button 
                                onclick={() => currentPage = Math.min(totalPages, currentPage + 1)}
                                disabled={currentPage >= totalPages}
                                class="w-9 h-9 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Detail Modal -->
    {#if showDetailModal && selectedLog}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showDetailModal = false}></div>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div class="bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white">
                    <button onclick={() => showDetailModal = false} class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
                        <X class="w-5 h-5" />
                    </button>
                    {#if selectedLog}
                        {@const ActionIcon = getActionIcon(selectedLog.action)}
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                                <ActionIcon class="w-6 h-6" />
                            </div>
                            <div>
                                <h3 class="text-xl font-bold">{getActionLabel(selectedLog.action)}</h3>
                                <p class="text-sm opacity-90">{formatDateTime(selectedLog.createdAt)}</p>
                            </div>
                        </div>
                    {/if}
                </div>
                <div class="p-6 space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">ຜູ້ໃຊ້</p>
                            <p class="font-medium text-gray-900 dark:text-white">{selectedLog.user?.name || 'System'}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">{selectedLog.user?.email || ''}</p>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">IP Address</p>
                            <p class="font-medium text-gray-900 dark:text-white font-mono">{selectedLog.ip || '-'}</p>
                        </div>
                    </div>
                    
                    {#if selectedLog.description}
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">ລາຍລະອຽດ</p>
                            <p class="text-gray-900 dark:text-white">{selectedLog.description}</p>
                        </div>
                    {/if}

                    {#if selectedLog.metadata}
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">ຂໍ້ມູນເພີ່ມເຕີມ</p>
                            <pre class="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(selectedLog.metadata, null, 2)}</pre>
                        </div>
                    {/if}

                    {#if selectedLog.userAgent}
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">User Agent</p>
                            <p class="text-xs text-gray-700 dark:text-gray-300 break-all">{selectedLog.userAgent}</p>
                        </div>
                    {/if}
                </div>
                <div class="p-6 pt-0">
                    <button 
                        onclick={() => showDetailModal = false}
                        class="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                        ປິດ
                    </button>
                </div>
            </div>
        </div>
    {/if}
{/if}
