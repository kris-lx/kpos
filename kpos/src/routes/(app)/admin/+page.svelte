<script lang="ts">
    import { createQuery, useQueryClient } from "@tanstack/svelte-query";
    import { get } from "svelte/store";
    import { api } from "$lib/api";
    import { goto } from "$app/navigation";
    import { onMount, onDestroy } from "svelte";
    import { toast } from "svelte-sonner";
    import { cn } from "$lib/utils";
    import { auth } from "$lib/stores/auth.svelte";
    import {
        Shield,
        Building2,
        Store,
        Users,
        Clock,
        CheckCircle,
        TrendingUp,
        FileCheck,
        ChevronRight,
        Loader2,
        RefreshCw,
        Activity,
        Zap,
        BarChart3,
        Crown,
        Key,
        History,
        Server,
        Package,
        Sparkles,
        ArrowUpRight,
        ArrowDownRight,
        DollarSign,
        ShoppingCart,
        Boxes,
        UserCog,
        Settings,
        Bell,
        Eye,
        Globe,
        XCircle,
        Database,
        Wifi,
        HardDrive,
        Cpu,
        ShieldCheck,
        BadgeCheck,
        PieChart,
        LineChart,
    } from "lucide-svelte";
    import { createMutation } from "@tanstack/svelte-query";
    import { Chart, registerables } from 'chart.js';
    Chart.register(...registerables);

    const queryClient = useQueryClient();

    let canAccess = $state(false);
    let userRole = $state<'super_admin' | 'admin' | 'store_owner' | 'manager' | 'other'>('other');
    
    onMount(async () => {
        try {
            const user = auth.user;
            if (!user) {
                goto("/login");
                return;
            }
            
            // ກຳນົດສິດຕາມບົດບາດ
            if (user.isSuperAdmin) {
                userRole = 'super_admin';
                canAccess = true;
            } else if (user.role === 'admin') {
                userRole = 'admin';
                canAccess = true;
            } else if (user.role === 'store_owner') {
                userRole = 'store_owner';
                canAccess = true;
            } else if (user.role === 'manager') {
                userRole = 'manager';
                canAccess = true;
            } else {
                toast.error("ທ່ານບໍ່ມີສິດເຂົ້າເຖິງໜ້ານີ້");
                goto("/dashboard");
            }
        } catch {
            goto("/dashboard");
        }
    });

    // ດຶງຂໍ້ມູນ Dashboard ຕາມບົດບາດ
    const dashboardQuery = createQuery({
        queryKey: ["admin-dashboard"],
        queryFn: async () => {
            const response = await api.get("admin/dashboard").json<any>();
            return response.data;
        },
        enabled: canAccess
    });

    const pendingRequestsQuery = createQuery({
        queryKey: ["admin-requests-pending"],
        queryFn: async () => {
            const response = await api.get("admin/requests?status=pending&limit=5").json<any>();
            return response.data || [];
        },
        enabled: canAccess
    });

    const recentActivityQuery = createQuery({
        queryKey: ["admin-activity"],
        queryFn: async () => {
            const response = await api.get("admin/activity?limit=10").json<any>();
            return response.data || [];
        },
        enabled: canAccess
    });

    const systemHealthQuery = createQuery({
        queryKey: ["admin-system-health"],
        queryFn: async () => {
            const response = await api.get("admin/system/health").json<any>();
            return response.data || {
                database: { status: 'healthy', latency: 12 },
                api: { status: 'healthy', uptime: '99.9%' },
                storage: { used: 45, total: 100 },
                memory: { used: 60, total: 100 }
            };
        },
        enabled: canAccess
    });

    const chartDataQuery = createQuery({
        queryKey: ["admin-chart-data"],
        queryFn: async () => {
            const response = await api.get("admin/dashboard/chart-data").json<any>();
            return response.data || { usersByRole: [], storesByBranch: [], transactionsTrend: [] };
        },
        enabled: canAccess
    });

    // Canvas refs for charts
    let pieCanvas = $state<HTMLCanvasElement | undefined>();
    let barCanvas = $state<HTMLCanvasElement | undefined>();
    let lineCanvas = $state<HTMLCanvasElement | undefined>();
    let pieChart: Chart | null = null;
    let barChart: Chart | null = null;
    let lineChart: Chart | null = null;

    const ROLE_COLORS: Record<string, string> = {
        super_admin: '#7c3aed', admin: '#2563eb', store_owner: '#059669',
        branch_admin: '#0891b2', store_manager: '#d97706', cashier: '#16a34a',
        inventory_staff: '#9333ea', kitchen_staff: '#dc2626', waiter: '#ea580c',
        staff: '#6b7280', unknown: '#9ca3af',
    };

    function getColor(role: string, idx: number) {
        return ROLE_COLORS[role] ?? `hsl(${(idx * 47) % 360}, 60%, 50%)`;
    }

    $effect(() => {
        const data = $chartDataQuery.data;
        if (!data || !pieCanvas || !barCanvas || !lineCanvas) return;

        // Pie chart — users by role
        pieChart?.destroy();
        const pieCtx = pieCanvas.getContext('2d');
        if (pieCtx && data.usersByRole.length > 0) {
            pieChart = new Chart(pieCtx, {
                type: 'pie',
                data: {
                    labels: data.usersByRole.map((r: any) => r.role),
                    datasets: [{
                        data: data.usersByRole.map((r: any) => r.count),
                        backgroundColor: data.usersByRole.map((r: any, i: number) => getColor(r.role, i)),
                        borderWidth: 2,
                        borderColor: '#ffffff',
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } } }
            });
        }

        // Bar chart — stores per branch
        barChart?.destroy();
        const barCtx = barCanvas.getContext('2d');
        if (barCtx) {
            barChart = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: data.storesByBranch.length > 0 ? data.storesByBranch.map((r: any) => r.branch) : ['ຍັງບໍ່ມີຂໍ້ມູນ'],
                    datasets: [{
                        label: 'ຈຳນວນຮ້ານ',
                        data: data.storesByBranch.length > 0 ? data.storesByBranch.map((r: any) => r.count) : [0],
                        backgroundColor: '#3b82f6',
                        borderRadius: 6,
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
            });
        }

        // Line chart — transactions trend
        lineChart?.destroy();
        const lineCtx = lineCanvas.getContext('2d');
        if (lineCtx) {
            const labels = data.transactionsTrend.map((r: any) => r.date.slice(5));
            lineChart = new Chart(lineCtx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'ທຸລະກຳ',
                            data: data.transactionsTrend.map((r: any) => r.count),
                            borderColor: '#8b5cf6',
                            backgroundColor: 'rgba(139,92,246,0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                        },
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
            });
        }
    });

    onDestroy(() => { pieChart?.destroy(); barChart?.destroy(); lineChart?.destroy(); });

    // Refetch when canAccess becomes true (after onMount)
    $effect(() => {
        if (canAccess) {
            get(dashboardQuery).refetch();
            get(pendingRequestsQuery).refetch();
            get(recentActivityQuery).refetch();
            get(systemHealthQuery).refetch();
            get(chartDataQuery).refetch();
        }
    });

    const approveMutation = createMutation({
        mutationFn: async ({ id, note }: { id: string; note?: string }) => {
            return api.post(`admin/requests/${id}/approve`, { json: { note } }).json();
        },
        onSuccess: () => {
            toast.success("ອະນຸມັດສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
            queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    const rejectMutation = createMutation({
        mutationFn: async ({ id, note }: { id: string; note: string }) => {
            return api.post(`admin/requests/${id}/reject`, { json: { note } }).json();
        },
        onSuccess: () => {
            toast.success("ປະຕິເສດສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
            queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    let showReviewModal = $state(false);
    let selectedRequest = $state<any>(null);
    let reviewNote = $state("");
    let reviewAction = $state<"approve" | "reject">("approve");

    function openReviewModal(request: any, action: "approve" | "reject") {
        selectedRequest = request;
        reviewAction = action;
        reviewNote = "";
        showReviewModal = true;
    }

    function handleReview() {
        if (!selectedRequest) return;
        if (reviewAction === "approve") {
            $approveMutation.mutate({ id: selectedRequest.id, note: reviewNote });
        } else {
            if (!reviewNote.trim()) {
                toast.error("ກະລຸນາລະບຸເຫດຜົນ");
                return;
            }
            $rejectMutation.mutate({ id: selectedRequest.id, note: reviewNote });
        }
        showReviewModal = false;
    }

    function getRequestTypeLabel(type: string) {
        const labels: Record<string, string> = {
            new_store: "ຂໍເປີດຮ້ານໃໝ່",
            new_branch: "ຂໍເປີດສາຂາໃໝ່",
            branch_update: "ຂໍແກ້ໄຂສາຂາ"
        };
        return labels[type] || type;
    }

    function getRequestTypeIcon(type: string) {
        if (type === "new_store") return Store;
        if (type === "new_branch") return Building2;
        return FileCheck;
    }

    function getActivityIcon(action: string) {
        switch (action) {
            case 'user_created': return Users;
            case 'role_created': return Key;
            case 'branch_created': return Building2;
            case 'store_created': return Store;
            default: return Activity;
        }
    }

    function getActivityColor(action: string) {
        if (action.includes('created')) return 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30';
        if (action.includes('deleted')) return 'text-red-500 bg-red-100 dark:bg-red-900/30';
        if (action.includes('updated')) return 'text-blue-500 bg-blue-100 dark:bg-blue-900/30';
        return 'text-gray-500 bg-gray-100 dark:bg-gray-700';
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
        return `${diffDays} ມື້ກ່ອນ`;
    }

    function refreshData() {
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
        queryClient.invalidateQueries({ queryKey: ["admin-activity"] });
        queryClient.invalidateQueries({ queryKey: ["admin-system-health"] });
    }

    function getRoleLabel(role: string) {
        const labels: Record<string, string> = {
            super_admin: "Super Admin",
            admin: "Admin",
            store_owner: "Store Owner",
            manager: "Manager"
        };
        return labels[role] || role;
    }

    function getRoleColor(role: string) {
        const colors: Record<string, string> = {
            super_admin: "from-violet-600 to-purple-600",
            admin: "from-blue-600 to-cyan-600",
            store_owner: "from-emerald-600 to-green-600",
            manager: "from-amber-600 to-orange-600"
        };
        return colors[role] || "from-gray-600 to-slate-600";
    }

    // Database Backup
    let isBackingUp = $state(false);

    async function downloadBackup() {
        if (isBackingUp) return;
        isBackingUp = true;
        try {
            const response = await api.post("admin/backup").json<any>();
            const json = JSON.stringify(response, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `kpos-backup-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("ດາວໂຫລດ Backup ສຳເລັດ");
        } catch (e) {
            console.error("Backup failed:", e);
            toast.error("ການ Backup ລົ້ມເຫລວ");
        } finally {
            isBackingUp = false;
        }
    }

    // Quick Links ຕາມບົດບາດ
    let quickLinks = $derived.by(() => {
        if (userRole === 'super_admin' || userRole === 'admin') {
            return [
                { href: "/admin/requests", icon: FileCheck, label: "ຄຳຂໍລໍຖ້າ", desc: "ອະນຸມັດ/ປະຕິເສດຄຳຂໍ", color: "from-violet-500 to-purple-500", roles: ['super_admin', 'admin'] },
                { href: "/admin/branches", icon: Building2, label: "ຈັດການສາຂາ", desc: "ເບິ່ງ ແລະ ຈັດການສາຂາ", color: "from-blue-500 to-cyan-500", roles: ['super_admin', 'admin'] },
                { href: "/admin/users", icon: Users, label: "ຈັດການຜູ້ໃຊ້", desc: "ສ້າງ ແລະ ແກ້ໄຂຜູ້ໃຊ້", color: "from-amber-500 to-orange-500", roles: ['super_admin', 'admin', 'store_owner'] },
                { href: "/admin/roles", icon: Key, label: "ຈັດການບົດບາດ", desc: "ກຳນົດສິດ ແລະ ບົດບາດ", color: "from-pink-500 to-rose-500", roles: ['super_admin', 'admin'] },
                { href: "/admin/permissions", icon: Shield, label: "ຈັດການສິດ", desc: "ກຳນົດເມນູ ແລະ ສິດ", color: "from-teal-500 to-cyan-500", roles: ['super_admin', 'admin'] },
                { href: "/admin/audit", icon: History, label: "ປະຫວັດການໃຊ້ງານ", desc: "ເບິ່ງ Activity Logs", color: "from-indigo-500 to-blue-500", roles: ['super_admin', 'admin'] },
            ];
        }
        // Links ສຳລັບ Shop Admin ແລະ Manager
        return [
            { href: "/staff", icon: Users, label: "ຈັດການຜູ້ໃຊ້", desc: "ສ້າງ ແລະ ແກ້ໄຂຜູ້ໃຊ້ໃນຮ້ານ", color: "from-amber-500 to-orange-500", roles: ['store_owner', 'manager'] },
            { href: "/branches", icon: Building2, label: "ສາຂາຂອງຂ້ອຍ", desc: "ເບິ່ງສາຂາໃນຮ້ານ", color: "from-blue-500 to-cyan-500", roles: ['store_owner', 'manager'] },
            { href: "/products", icon: Package, label: "ຈັດການສິນຄ້າ", desc: "ເພີ່ມ, ແກ້ໄຂ, ລົບສິນຄ້າ", color: "from-emerald-500 to-green-500", roles: ['store_owner', 'manager'] },
            { href: "/inventory", icon: Boxes, label: "ຈັດການສາງ", desc: "Stock, SKU, Barcode", color: "from-violet-500 to-purple-500", roles: ['store_owner', 'manager'] },
        ];
    });
</script>

<svelte:head>
    <title>Super Admin Dashboard - KPOS</title>
</svelte:head>

{#if !canAccess}
    <div class="flex items-center justify-center h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <Loader2 class="h-12 w-12 animate-spin text-violet-500" />
    </div>
{:else}
    <div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div class="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
            <!-- Header -->
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="relative">
                        <div class="w-16 h-16 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-violet-500/25">
                            <Crown class="w-8 h-8 text-white" />
                        </div>
                        <div class="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center">
                            <CheckCircle class="w-3 h-3 text-white" />
                        </div>
                    </div>
                    <div>
                        <h1 class="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                            Super Admin
                        </h1>
                        <p class="text-gray-500 dark:text-gray-400 mt-1">ຄວບຄຸມ ແລະ ຈັດການລະບົບທັງໝົດ</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <button 
                        onclick={refreshData}
                        class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
                    >
                        <RefreshCw class="w-4 h-4" />
                        <span class="hidden sm:inline">ໂຫຼດຄືນ</span>
                    </button>
                    <button class="relative p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">
                        <Bell class="w-5 h-5" />
                        {#if ($pendingRequestsQuery.data?.length || 0) > 0}
                            <span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                                {$pendingRequestsQuery.data?.length}
                            </span>
                        {/if}
                    </button>
                </div>
            </div>

            <!-- Stats Grid -->
            {#if $dashboardQuery.isLoading}
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {#each Array(4) as _, i (i)}
                        <div class="h-36 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse"></div>
                    {/each}
                </div>
            {:else if $dashboardQuery.data}
                {@const stats = $dashboardQuery.data}
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <!-- Branches Card -->
                    <div class="group relative bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-300 overflow-hidden">
                        <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                        <div class="relative">
                            <div class="flex items-center justify-between mb-4">
                                <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                                    <Building2 class="w-6 h-6 text-white" />
                                </div>
                                <span class="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 text-xs font-medium rounded-full">Active</span>
                            </div>
                            <p class="text-3xl font-bold text-gray-900 dark:text-white">{stats.branches?.active || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ສາຂາເຄື່ອນໄຫວ</p>
                            <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                <p class="text-xs text-gray-400">ຈາກທັງໝົດ {stats.branches?.total || 0} ສາຂາ</p>
                            </div>
                        </div>
                    </div>

                    <!-- Stores Card -->
                    <div class="group relative bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-300 overflow-hidden">
                        <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-green-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                        <div class="relative">
                            <div class="flex items-center justify-between mb-4">
                                <div class="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                    <Store class="w-6 h-6 text-white" />
                                </div>
                                <span class="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-medium rounded-full flex items-center gap-1">
                                    <Activity class="w-3 h-3" /> Online
                                </span>
                            </div>
                            <p class="text-3xl font-bold text-gray-900 dark:text-white">{stats.stores?.active || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ຮ້ານເຄື່ອນໄຫວ</p>
                            <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                <p class="text-xs text-gray-400">ຈາກທັງໝົດ {stats.stores?.total || 0} ຮ້ານ</p>
                            </div>
                        </div>
                    </div>

                    <!-- Users Card -->
                    <div class="group relative bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-300 overflow-hidden">
                        <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                        <div class="relative">
                            <div class="flex items-center justify-between mb-4">
                                <div class="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30">
                                    <Users class="w-6 h-6 text-white" />
                                </div>
                                <span class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-full flex items-center gap-1">
                                    <Globe class="w-3 h-3" /> Total
                                </span>
                            </div>
                            <p class="text-3xl font-bold text-gray-900 dark:text-white">{stats.users?.total || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ຜູ້ໃຊ້ທັງໝົດ</p>
                            <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                <p class="text-xs text-gray-400">{stats.users?.active || 0} ເຄື່ອນໄຫວ</p>
                            </div>
                        </div>
                    </div>

                    <!-- Pending Requests Card -->
                    <div class="group relative bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none hover:shadow-2xl hover:shadow-violet-500/10 transition-all duration-300 overflow-hidden">
                        <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                        <div class="relative">
                            <div class="flex items-center justify-between mb-4">
                                <div class="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
                                    <Clock class="w-6 h-6 text-white" />
                                </div>
                                {#if (stats.requests?.pending || 0) > 0}
                                    <span class="px-2 py-1 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 text-xs font-semibold rounded-full animate-pulse">ລໍຖ້າ</span>
                                {:else}
                                    <span class="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-full">ບໍ່ມີ</span>
                                {/if}
                            </div>
                            <p class="text-3xl font-bold text-gray-900 dark:text-white">{stats.requests?.pending || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ຄຳຂໍລໍຖ້າ</p>
                            <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                <p class="text-xs text-gray-400">ຕ້ອງການອະນຸມັດ</p>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Main Content Grid -->
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <!-- Quick Actions -->
                <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                    <div class="p-5 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <Zap class="w-5 h-5 text-amber-500" />
                            ການດຳເນີນການດ່ວນ
                        </h3>
                    </div>
                    <div class="p-4 space-y-2">
                        {#each quickLinks as link (link.href)}
                            <a 
                                href={link.href} 
                                class="group flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all duration-200"
                            >
                                <div class={cn("w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg", link.color)}>
                                    <svelte:component this={link.icon} class="w-5 h-5 text-white" />
                                </div>
                                <div class="flex-1">
                                    <p class="font-medium text-gray-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{link.label}</p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">{link.desc}</p>
                                </div>
                                <ChevronRight class="w-5 h-5 text-gray-400 group-hover:text-violet-500 group-hover:translate-x-1 transition-all" />
                            </a>
                        {/each}
                    </div>
                </div>

                <!-- Pending Requests -->
                <div class="xl:col-span-2 bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                    <div class="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <FileCheck class="w-5 h-5 text-violet-500" />
                            ຄຳຂໍລໍຖ້າອະນຸມັດ
                        </h3>
                        <a href="/admin/requests" class="text-sm text-violet-600 dark:text-violet-400 hover:underline font-medium">ເບິ່ງທັງໝົດ →</a>
                    </div>
                    <div class="p-4">
                        {#if $pendingRequestsQuery.isLoading}
                            <div class="space-y-3">
                                {#each Array(3) as _, i (i)}
                                    <div class="h-20 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse"></div>
                                {/each}
                            </div>
                        {:else if $pendingRequestsQuery.data?.length === 0}
                            <div class="text-center py-12">
                                <div class="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle class="w-8 h-8 text-emerald-500" />
                                </div>
                                <p class="text-gray-500 dark:text-gray-400 font-medium">ບໍ່ມີຄຳຂໍລໍຖ້າອະນຸມັດ</p>
                                <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">ທຸກຄຳຂໍໄດ້ຮັບການດຳເນີນການແລ້ວ</p>
                            </div>
                        {:else}
                            <div class="space-y-3">
                                {#each $pendingRequestsQuery.data || [] as request (request.id)}
                                    {@const TypeIcon = getRequestTypeIcon(request.type)}
                                    <div class="group flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-700/50 hover:border-violet-200 dark:hover:border-violet-800 hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-300">
                                        <div class="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
                                            <TypeIcon class="w-6 h-6 text-white" />
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <p class="font-semibold text-gray-900 dark:text-white truncate">{request.storeName || request.branchName || "ຄຳຂໍ"}</p>
                                            <div class="flex items-center gap-2 mt-1">
                                                <span class="text-sm text-gray-500 dark:text-gray-400">{getRequestTypeLabel(request.type)}</span>
                                                <span class="w-1 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"></span>
                                                <span class="text-sm text-gray-400 dark:text-gray-500">{request.requester?.name}</span>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button
                                                onclick={() => openReviewModal(request, "approve")}
                                                class="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:scale-105"
                                            >
                                                <CheckCircle class="w-5 h-5" />
                                            </button>
                                            <button
                                                onclick={() => openReviewModal(request, "reject")}
                                                class="w-10 h-10 bg-red-500 hover:bg-red-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-red-500/30 hover:shadow-red-500/50 transition-all hover:scale-105"
                                            >
                                                <XCircle class="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>

            <!-- Today's Stats -->
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                <div class="p-5 border-b border-gray-100 dark:border-gray-700">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <BarChart3 class="w-5 h-5 text-blue-500" />
                        ພາບລວມມື້ນີ້
                    </h3>
                </div>
                <div class="p-5">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="relative overflow-hidden bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-2xl p-5 border border-blue-100 dark:border-blue-800/50">
                            <div class="flex items-center gap-3 mb-3">
                                <div class="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
                                    <TrendingUp class="w-5 h-5 text-white" />
                                </div>
                                <span class="text-sm font-medium text-blue-600 dark:text-blue-400">ລາຍການຂາຍ</span>
                            </div>
                            <p class="text-3xl font-bold text-gray-900 dark:text-white">{$dashboardQuery.data?.transactions?.today || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ລາຍການມື້ນີ້</p>
                        </div>
                        <div class="relative overflow-hidden bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-2xl p-5 border border-emerald-100 dark:border-emerald-800/50">
                            <div class="flex items-center gap-3 mb-3">
                                <div class="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                                    <Building2 class="w-5 h-5 text-white" />
                                </div>
                                <span class="text-sm font-medium text-emerald-600 dark:text-emerald-400">ສາຂາເຄື່ອນໄຫວ</span>
                            </div>
                            <p class="text-3xl font-bold text-gray-900 dark:text-white">{$dashboardQuery.data?.branches?.active || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ສາຂາທີ່ເປີດໃຊ້ງານ</p>
                        </div>
                        <div class="relative overflow-hidden bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-2xl p-5 border border-violet-100 dark:border-violet-800/50">
                            <div class="flex items-center gap-3 mb-3">
                                <div class="w-10 h-10 bg-violet-500 rounded-xl flex items-center justify-center">
                                    <Store class="w-5 h-5 text-white" />
                                </div>
                                <span class="text-sm font-medium text-violet-600 dark:text-violet-400">ຮ້ານເຄື່ອນໄຫວ</span>
                            </div>
                            <p class="text-3xl font-bold text-gray-900 dark:text-white">{$dashboardQuery.data?.stores?.active || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ຮ້ານທີ່ເປີດໃຊ້ງານ</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Activity & System Health Grid -->
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <!-- Recent Activity -->
                <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                    <div class="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <History class="w-5 h-5 text-indigo-500" />
                            ກິດຈະກຳລ່າສຸດ
                        </h3>
                        <a href="/admin/audit" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium">ເບິ່ງທັງໝົດ →</a>
                    </div>
                    <div class="p-4 max-h-80 overflow-y-auto">
                        {#if $recentActivityQuery.isLoading}
                            <div class="space-y-3">
                                {#each Array(5) as _, i (i)}
                                    <div class="h-14 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse"></div>
                                {/each}
                            </div>
                        {:else if ($recentActivityQuery.data?.length || 0) === 0}
                            <div class="text-center py-8">
                                <div class="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <History class="w-7 h-7 text-gray-400" />
                                </div>
                                <p class="text-gray-500 dark:text-gray-400">ບໍ່ມີກິດຈະກຳລ່າສຸດ</p>
                            </div>
                        {:else}
                            <div class="space-y-2">
                                {#each $recentActivityQuery.data || [] as activity (activity.id)}
                                    {@const ActivityIcon = getActivityIcon(activity.action)}
                                    <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <div class={cn("w-10 h-10 rounded-xl flex items-center justify-center", getActivityColor(activity.action))}>
                                            <ActivityIcon class="w-5 h-5" />
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{activity.description || activity.action}</p>
                                            <p class="text-xs text-gray-500 dark:text-gray-400">{activity.user?.name || 'System'}</p>
                                        </div>
                                        <span class="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{formatTimeAgo(activity.createdAt)}</span>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- System Health -->
                <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                    <div class="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <Server class="w-5 h-5 text-cyan-500" />
                            ສະຖານະລະບົບ
                        </h3>
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                            <span class="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Online</span>
                        </div>
                    </div>
                    <div class="p-4 space-y-4">
                        <!-- Database Status -->
                        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                                    <Database class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">Database</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">MongoDB</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 text-xs font-medium rounded-full">Healthy</span>
                                <p class="text-xs text-gray-400 mt-1">{$systemHealthQuery.data?.database?.latency || 12}ms</p>
                            </div>
                        </div>

                        <!-- API Status -->
                        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                                    <Wifi class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">API Server</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">Elysia.js</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 text-xs font-medium rounded-full">Running</span>
                                <p class="text-xs text-gray-400 mt-1">Uptime: {$systemHealthQuery.data?.api?.uptime || '99.9%'}</p>
                            </div>
                        </div>

                        <!-- Storage Usage -->
                        <div class="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                            <div class="flex items-center justify-between mb-2">
                                <div class="flex items-center gap-2">
                                    <HardDrive class="w-4 h-4 text-amber-500" />
                                    <span class="text-sm font-medium text-gray-900 dark:text-white">Storage</span>
                                </div>
                                <span class="text-xs text-gray-500 dark:text-gray-400">{$systemHealthQuery.data?.storage?.used || 45}GB / {$systemHealthQuery.data?.storage?.total || 100}GB</span>
                            </div>
                            <div class="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                <div 
                                    class="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                                    style="width: {(($systemHealthQuery.data?.storage?.used || 45) / ($systemHealthQuery.data?.storage?.total || 100)) * 100}%"
                                ></div>
                            </div>
                        </div>

                        <!-- Memory Usage -->
                        <div class="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                            <div class="flex items-center justify-between mb-2">
                                <div class="flex items-center gap-2">
                                    <Cpu class="w-4 h-4 text-violet-500" />
                                    <span class="text-sm font-medium text-gray-900 dark:text-white">Memory</span>
                                </div>
                                <span class="text-xs text-gray-500 dark:text-gray-400">{$systemHealthQuery.data?.memory?.used || 60}% used</span>
                            </div>
                            <div class="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                <div 
                                    class="h-full bg-gradient-to-r from-violet-400 to-violet-500 rounded-full transition-all duration-500"
                                    style="width: {$systemHealthQuery.data?.memory?.used || 60}%"
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Database Backup (super admin only) -->
            {#if userRole === 'super_admin'}
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                <div class="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Database class="w-5 h-5 text-emerald-500" />
                        ສຳຮອງຂໍ້ມູນ (Database Backup)
                    </h3>
                    <span class="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium rounded-full">Super Admin</span>
                </div>
                <div class="p-5">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 text-center">
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$dashboardQuery.data?.users?.total || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ຜູ້ໃຊ້</p>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 text-center">
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$dashboardQuery.data?.stores?.total || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ຮ້ານ</p>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 text-center">
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$dashboardQuery.data?.transactions?.today || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ທຸລະກຳມື້ນີ້</p>
                        </div>
                    </div>
                    <div class="flex flex-col sm:flex-row gap-3">
                        <button
                            onclick={downloadBackup}
                            disabled={isBackingUp}
                            class="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
                        >
                            {#if isBackingUp}
                                <Loader2 class="w-5 h-5 animate-spin" />
                                ກຳລັງດາວໂຫລດ...
                            {:else}
                                <HardDrive class="w-5 h-5" />
                                ດາວໂຫລດ JSON Backup
                            {/if}
                        </button>
                        <div class="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                            <Shield class="w-4 h-4 shrink-0" />
                            <span>ລາຍລະອຽດລະຫັດຜ່ານຖືກຍົກເວັ້ນ. ເໝາະສຳລັບການ restore ຂໍ້ມູນ.</span>
                        </div>
                    </div>
                </div>
            </div>
            {/if}

            <!-- Charts Section -->
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                <div class="p-5 border-b border-gray-100 dark:border-gray-700">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <BarChart3 class="w-5 h-5 text-blue-500" />
                        ສະຖິຕິ ແລະ ກາຟ
                    </h3>
                </div>
                {#if $chartDataQuery.isLoading}
                    <div class="p-8 flex justify-center"><Loader2 class="w-8 h-8 text-blue-500 animate-spin" /></div>
                {:else}
                    <div class="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <!-- Pie: Users by Role -->
                        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-2xl p-4">
                            <div class="flex items-center gap-2 mb-3">
                                <PieChart class="w-4 h-4 text-violet-500" />
                                <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">ຜູ້ໃຊ້ຕາມບົດບາດ</span>
                            </div>
                            {#if ($chartDataQuery.data?.usersByRole?.length || 0) === 0}
                                <div class="h-48 flex items-center justify-center text-gray-400 text-sm">ບໍ່ມີຂໍ້ມູນ</div>
                            {:else}
                                <div class="h-48 relative">
                                    <canvas bind:this={pieCanvas}></canvas>
                                </div>
                            {/if}
                        </div>

                        <!-- Bar: Stores per Branch -->
                        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-2xl p-4">
                            <div class="flex items-center gap-2 mb-3">
                                <BarChart3 class="w-4 h-4 text-blue-500" />
                                <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">ຮ້ານຕໍ່ສາຂາ</span>
                            </div>
                            <div class="h-48 relative">
                                <canvas bind:this={barCanvas}></canvas>
                            </div>
                        </div>

                        <!-- Line: Transactions Trend -->
                        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-2xl p-4">
                            <div class="flex items-center gap-2 mb-3">
                                <LineChart class="w-4 h-4 text-purple-500" />
                                <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">ທຸລະກຳ 7 ວັນ</span>
                            </div>
                            <div class="h-48 relative">
                                <canvas bind:this={lineCanvas}></canvas>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Roles & Permissions Summary -->
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                <div class="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <ShieldCheck class="w-5 h-5 text-pink-500" />
                        ບົດບາດ ແລະ ສິດ
                    </h3>
                    <div class="flex gap-2">
                        <a href="/admin/roles" class="px-3 py-1.5 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 text-sm font-medium rounded-lg hover:bg-pink-200 dark:hover:bg-pink-900/50 transition-colors">ຈັດການບົດບາດ</a>
                        <a href="/admin/permissions" class="px-3 py-1.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-sm font-medium rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors">ຈັດການສິດ</a>
                    </div>
                </div>
                <div class="p-5">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="text-center p-4 bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 rounded-xl border border-pink-100 dark:border-pink-800/50">
                            <div class="w-12 h-12 bg-pink-500 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-pink-500/30">
                                <Key class="w-6 h-6 text-white" />
                            </div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$dashboardQuery.data?.roles?.total || 6}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ບົດບາດ</p>
                        </div>
                        <div class="text-center p-4 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-xl border border-violet-100 dark:border-violet-800/50">
                            <div class="w-12 h-12 bg-violet-500 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-violet-500/30">
                                <Shield class="w-6 h-6 text-white" />
                            </div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$dashboardQuery.data?.permissions?.total || 45}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ສິດທັງໝົດ</p>
                        </div>
                        <div class="text-center p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl border border-amber-100 dark:border-amber-800/50">
                            <div class="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-amber-500/30">
                                <Crown class="w-6 h-6 text-white" />
                            </div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$dashboardQuery.data?.users?.superAdmins || 1}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">Super Admin</p>
                        </div>
                        <div class="text-center p-4 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
                            <div class="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/30">
                                <BadgeCheck class="w-6 h-6 text-white" />
                            </div>
                            <p class="text-2xl font-bold text-gray-900 dark:text-white">{$dashboardQuery.data?.users?.active || 0}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ຜູ້ໃຊ້ Active</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Review Modal -->
    {#if showReviewModal && selectedRequest}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showReviewModal = false}></div>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div class={cn("p-6 text-white", reviewAction === "approve" ? "bg-gradient-to-r from-emerald-500 to-green-500" : "bg-gradient-to-r from-red-500 to-rose-500")}>
                    <div class="flex items-center gap-3">
                        {#if reviewAction === "approve"}
                            <CheckCircle class="w-8 h-8" />
                        {:else}
                            <XCircle class="w-8 h-8" />
                        {/if}
                        <div>
                            <h3 class="text-xl font-bold">{reviewAction === "approve" ? "ອະນຸມັດຄຳຂໍ" : "ປະຕິເສດຄຳຂໍ"}</h3>
                            <p class="text-sm opacity-90">{selectedRequest.storeName || selectedRequest.branchName}</p>
                        </div>
                    </div>
                </div>
                <div class="p-6">
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-4">
                        <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">ປະເພດຄຳຂໍ</p>
                        <p class="font-medium text-gray-900 dark:text-white">{getRequestTypeLabel(selectedRequest.type)}</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-3 mb-1">ຜູ້ຂໍ</p>
                        <p class="font-medium text-gray-900 dark:text-white">{selectedRequest.requester?.name}</p>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {reviewAction === "approve" ? "ໝາຍເຫດ (ທາງເລືອກ)" : "ເຫດຜົນປະຕິເສດ *"}
                        </label>
                        <textarea
                            bind:value={reviewNote}
                            placeholder={reviewAction === "approve" ? "ໝາຍເຫດເພີ່ມເຕີມ..." : "ກະລຸນາລະບຸເຫດຜົນ..."}
                            rows="3"
                            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none transition-all"
                        ></textarea>
                    </div>
                </div>
                <div class="flex gap-3 p-6 pt-0">
                    <button 
                        onclick={() => showReviewModal = false}
                        class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                        ຍົກເລີກ
                    </button>
                    <button 
                        onclick={handleReview}
                        disabled={$approveMutation.isPending || $rejectMutation.isPending}
                        class={cn(
                            "flex-1 px-4 py-3 font-medium rounded-xl transition-all flex items-center justify-center gap-2",
                            reviewAction === "approve" 
                                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30" 
                                : "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
                        )}
                    >
                        {#if $approveMutation.isPending || $rejectMutation.isPending}
                            <Loader2 class="w-5 h-5 animate-spin" />
                        {/if}
                        {reviewAction === "approve" ? "ອະນຸມັດ" : "ປະຕິເສດ"}
                    </button>
                </div>
            </div>
        </div>
    {/if}
{/if}
