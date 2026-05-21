<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { get } from "svelte/store";
    import { api } from "$lib/api";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { cn, formatDateTime } from "$lib/utils";
    import {
        FileCheck, Clock, CheckCircle, XCircle, Search,
        ChevronLeft, ChevronRight, Eye, Loader2, Building2,
        Store, Calendar, User, Filter, ArrowLeft, Inbox,
        Sparkles, X, ExternalLink, FileText, Image as ImageIcon,
        Phone, Mail, MapPin, Tag, Shield, ChevronDown, RefreshCw,
        TrendingUp, Users, ShieldCheck
    } from "lucide-svelte";
    import { auth } from "$lib/stores/auth.svelte";

    const queryClient = useQueryClient();

    let canAccess = $state(false);
    onMount(async () => {
        try {
            const user = auth.user;
            if (!user) { goto("/login"); return; }
            if (user.isSuperAdmin || user.role === 'admin') {
                canAccess = true;
            } else {
                toast.error("ທ່ານບໍ່ມີສິດເຂົ້າເຖິງໜ້ານີ້");
                goto("/admin");
            }
        } catch { goto("/dashboard"); }
    });

    let statusFilter = $state<string>("");
    let typeFilter = $state<string>("");
    let searchQuery = $state("");
    let debouncedSearch = $state("");
    let currentPage = $state(1);
    let pageSize = $state(20);
    const pageSizeOptions = [10, 20, 50, 100];
    let searchTimeout: ReturnType<typeof setTimeout>;

    $effect(() => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { debouncedSearch = searchQuery; currentPage = 1; }, 400);
        return () => clearTimeout(searchTimeout);
    });

    const requestsQuery = createQuery({
        queryKey: ["admin-requests-all"],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (statusFilter) params.append("status", statusFilter);
            if (typeFilter) params.append("type", typeFilter);
            if (debouncedSearch) params.append("search", debouncedSearch);
            params.append("page", String(currentPage));
            params.append("limit", String(pageSize));
            return api.get(`admin/requests?${params}`).json<any>();
        },
        refetchOnWindowFocus: false,
    });

    $effect(() => {
        void statusFilter; void typeFilter; void debouncedSearch; void currentPage; void pageSize;
        $requestsQuery.refetch();
    });

    const approveMutation = createMutation({
        mutationFn: async ({ id, note }: { id: string; note?: string }) =>
            api.post(`admin/requests/${id}/approve`, { json: { note } }).json<any>(),
        onSuccess: (data: any) => {
            const store = data?.createdEntity;
            const tenant = data?.createdTenant;
            if (tenant) {
                toast.success(`✅ ອະນຸມັດສຳເລັດ — ສ້າງ Tenant: ${tenant.name} (${tenant.code})`);
            } else {
                toast.success("ອະນຸມັດສຳເລັດ");
            }
            get(requestsQuery).refetch();
            showReviewModal = false;
            showDetailModal = false;
        },
        onError: (err: any) => toast.error(err?.message || "ເກີດຂໍ້ຜິດພາດໃນການອະນຸມັດ")
    });

    const rejectMutation = createMutation({
        mutationFn: async ({ id, note }: { id: string; note: string }) =>
            api.post(`admin/requests/${id}/reject`, { json: { note } }).json<any>(),
        onSuccess: () => {
            toast.success("ປະຕິເສດສຳເລັດ");
            get(requestsQuery).refetch();
            showReviewModal = false;
            showDetailModal = false;
        },
        onError: (err: any) => toast.error(err?.message || "ເກີດຂໍ້ຜິດພາດ")
    });

    let showReviewModal = $state(false);
    let showDetailModal = $state(false);
    let showDocViewer = $state(false);
    let selectedRequest = $state<any>(null);
    let selectedDocUrl = $state<string>("");
    let reviewNote = $state("");
    let reviewAction = $state<"approve" | "reject">("approve");

    function openReviewModal(request: any, action: "approve" | "reject") {
        selectedRequest = request;
        reviewAction = action;
        reviewNote = "";
        showReviewModal = true;
    }
    function openDetailModal(request: any) {
        selectedRequest = request;
        showDetailModal = true;
    }
    function openDocViewer(url: string) {
        selectedDocUrl = url;
        showDocViewer = true;
    }

    function handleReview() {
        if (!selectedRequest) return;
        if (reviewAction === "approve") {
            $approveMutation.mutate({ id: selectedRequest.id, note: reviewNote || undefined });
        } else {
            if (!reviewNote.trim()) { toast.error("ກະລຸນາລະບຸເຫດຜົນ"); return; }
            $rejectMutation.mutate({ id: selectedRequest.id, note: reviewNote });
        }
    }

    function getStatusBadge(status: string) {
        const badges: Record<string, { bg: string; text: string; dot: string; label: string; icon: any }> = {
            pending:  { bg: "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700",  text: "text-amber-700 dark:text-amber-300",  dot: "bg-amber-400",  label: "ລໍຖ້າອະນຸມັດ", icon: Clock },
            approved: { bg: "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-400", label: "ອະນຸມັດແລ້ວ", icon: CheckCircle },
            rejected: { bg: "bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-700",   text: "text-danger-700 dark:text-danger-300",   dot: "bg-danger-400",   label: "ປະຕິເສດ",      icon: XCircle }
        };
        return badges[status] || badges.pending;
    }

    function getTypeInfo(type: string) {
        const types: Record<string, { label: string; icon: any; color: string; bg: string }> = {
            new_store:     { label: "ເປີດຮ້ານໃໝ່",    icon: Store,      color: "from-emerald-500 to-success-500",   bg: "bg-emerald-100 dark:bg-emerald-900/30" },
            new_tenant:    { label: "ສະໝັກໃໝ່",       icon: ShieldCheck, color: "from-violet-500 to-purple-500",   bg: "bg-violet-100 dark:bg-violet-900/30" },
            new_branch:    { label: "ເປີດສາຂາໃໝ່",   icon: Building2,  color: "from-blue-500 to-cyan-500",       bg: "bg-blue-100 dark:bg-blue-900/30" },
            branch_update: { label: "ແກ້ໄຂສາຂາ",    icon: Building2,  color: "from-orange-500 to-amber-500",    bg: "bg-orange-100 dark:bg-orange-900/30" },
        };
        return types[type] || { label: type, icon: FileCheck, color: "from-gray-500 to-gray-600", bg: "bg-gray-100 dark:bg-gray-700" };
    }

    function isImageUrl(url: string) {
        return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(url);
    }
    function isPdfUrl(url: string) {
        return /\.pdf(\?|$)/i.test(url);
    }
    function getFileName(url: string) {
        try { return decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'ເອກະສານ'); } catch { return 'ເອກະສານ'; }
    }

    function goToPage(page: number) {
        const tp = $requestsQuery.data?.meta?.totalPages || 1;
        if (page >= 1 && page <= tp) currentPage = page;
    }

    function formatDate(dateString: string) { return formatDateTime(dateString); }

    let totalItems = $derived($requestsQuery.data?.meta?.total || 0);
    let totalPages = $derived($requestsQuery.data?.meta?.totalPages || 1);
    let stats = $derived($requestsQuery.data?.stats || { pending: 0, approved: 0, rejected: 0 });
</script>

<svelte:head>
    <title>ຄຳຂໍທັງໝົດ - Super Admin</title>
</svelte:head>

{#if !canAccess}
    <div class="flex items-center justify-center h-screen">
        <Loader2 class="h-12 w-12 animate-spin text-violet-500" />
    </div>
{:else}
    <div class="min-h-screen bg-linear-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div class="p-4 lg:p-8 max-w-7xl mx-auto space-y-5">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div class="flex items-center gap-4">
                    <a href="/admin" class="w-10 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">
                        <ArrowLeft class="w-5 h-5" />
                    </a>
                    <div class="w-12 h-12 bg-linear-to-br from-violet-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/25">
                        <FileCheck class="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 class="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">ຄຳຂໍທັງໝົດ</h1>
                        <p class="text-sm text-gray-500 dark:text-gray-400">ອະນຸມັດ / ປະຕິເສດ ຄຳຂໍເປີດຮ້ານ ແລະ ສາຂາ</p>
                    </div>
                </div>
                <button onclick={() => queryClient.invalidateQueries({ queryKey: ['admin-requests-all'] })}
                    class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">
                    <RefreshCw class="w-4 h-4 {$requestsQuery.isFetching ? 'animate-spin' : ''}" />
                    ໂຫຼດໃໝ່
                </button>
            </div>

            <!-- Stats Cards -->
            <div class="grid grid-cols-3 gap-4">
                <button onclick={() => { statusFilter = 'pending'; currentPage = 1; }}
                    class={cn("rounded-2xl p-4 text-left transition-all border-2 shadow-sm",
                        statusFilter === 'pending'
                            ? "bg-amber-500 border-amber-500 text-white shadow-amber-200 dark:shadow-amber-900/30"
                            : "bg-white dark:bg-gray-800 border-transparent hover:border-amber-200 dark:hover:border-amber-700")}>
                    <div class="flex items-center gap-3 mb-1">
                        <div class={cn("w-9 h-9 rounded-xl flex items-center justify-center", statusFilter === 'pending' ? "bg-white/20" : "bg-amber-100 dark:bg-amber-900/30")}>
                            <Clock class={cn("w-5 h-5", statusFilter === 'pending' ? "text-white" : "text-amber-600 dark:text-amber-400")} />
                        </div>
                        <span class={cn("text-2xl font-bold", statusFilter === 'pending' ? "text-white" : "text-gray-900 dark:text-white")}>{stats.pending}</span>
                    </div>
                    <p class={cn("text-sm font-medium", statusFilter === 'pending' ? "text-white/80" : "text-gray-500 dark:text-gray-400")}>ລໍຖ້າ</p>
                </button>
                <button onclick={() => { statusFilter = 'approved'; currentPage = 1; }}
                    class={cn("rounded-2xl p-4 text-left transition-all border-2 shadow-sm",
                        statusFilter === 'approved'
                            ? "bg-emerald-500 border-emerald-500 text-white shadow-emerald-200 dark:shadow-emerald-900/30"
                            : "bg-white dark:bg-gray-800 border-transparent hover:border-emerald-200 dark:hover:border-emerald-700")}>
                    <div class="flex items-center gap-3 mb-1">
                        <div class={cn("w-9 h-9 rounded-xl flex items-center justify-center", statusFilter === 'approved' ? "bg-white/20" : "bg-emerald-100 dark:bg-emerald-900/30")}>
                            <CheckCircle class={cn("w-5 h-5", statusFilter === 'approved' ? "text-white" : "text-emerald-600 dark:text-emerald-400")} />
                        </div>
                        <span class={cn("text-2xl font-bold", statusFilter === 'approved' ? "text-white" : "text-gray-900 dark:text-white")}>{stats.approved}</span>
                    </div>
                    <p class={cn("text-sm font-medium", statusFilter === 'approved' ? "text-white/80" : "text-gray-500 dark:text-gray-400")}>ອະນຸມັດ</p>
                </button>
                <button onclick={() => { statusFilter = 'rejected'; currentPage = 1; }}
                    class={cn("rounded-2xl p-4 text-left transition-all border-2 shadow-sm",
                        statusFilter === 'rejected'
                            ? "bg-danger-500 border-danger-500 text-white shadow-danger-200 dark:shadow-danger-900/30"
                            : "bg-white dark:bg-gray-800 border-transparent hover:border-danger-200 dark:hover:border-danger-700")}>
                    <div class="flex items-center gap-3 mb-1">
                        <div class={cn("w-9 h-9 rounded-xl flex items-center justify-center", statusFilter === 'rejected' ? "bg-white/20" : "bg-danger-100 dark:bg-danger-900/30")}>
                            <XCircle class={cn("w-5 h-5", statusFilter === 'rejected' ? "text-white" : "text-danger-600 dark:text-danger-400")} />
                        </div>
                        <span class={cn("text-2xl font-bold", statusFilter === 'rejected' ? "text-white" : "text-gray-900 dark:text-white")}>{stats.rejected}</span>
                    </div>
                    <p class={cn("text-sm font-medium", statusFilter === 'rejected' ? "text-white/80" : "text-gray-500 dark:text-gray-400")}>ປະຕິເສດ</p>
                </button>
            </div>

            <!-- Filters -->
            <div class="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-sm p-4">
                <div class="flex flex-col sm:flex-row gap-3">
                    <div class="flex-1 relative">
                        <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" bind:value={searchQuery}
                            placeholder="ຄົ້ນຫາຊື່ຮ້ານ, ລະຫັດ, ອີເມວ..."
                            class="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm text-gray-900 dark:text-white transition-all" />
                    </div>
                    <div class="flex gap-3">
                        <div class="relative">
                            <select bind:value={statusFilter} onchange={() => currentPage = 1}
                                class="appearance-none pl-3 pr-8 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent min-w-32.5">
                                <option value="">ທຸກສະຖານະ</option>
                                <option value="pending">ລໍຖ້າ</option>
                                <option value="approved">ອະນຸມັດ</option>
                                <option value="rejected">ປະຕິເສດ</option>
                            </select>
                            <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>
                        <div class="relative">
                            <select bind:value={typeFilter} onchange={() => currentPage = 1}
                                class="appearance-none pl-3 pr-8 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent min-w-37.5">
                                <option value="">ທຸກປະເພດ</option>
                                <option value="new_store">ເປີດຮ້ານໃໝ່</option>
                                <option value="new_tenant">ສະໝັກໃໝ່</option>
                                <option value="new_branch">ເປີດສາຂາໃໝ່</option>
                                <option value="branch_update">ແກ້ໄຂສາຂາ</option>
                            </select>
                            <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>
                        {#if statusFilter || typeFilter || searchQuery}
                            <button onclick={() => { statusFilter = ''; typeFilter = ''; searchQuery = ''; currentPage = 1; }}
                                class="px-3 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-xl text-sm transition-colors flex items-center gap-1.5">
                                <X class="w-3.5 h-3.5" /> ລ້າງ
                            </button>
                        {/if}
                    </div>
                </div>
            </div>

            <!-- Requests Table -->
            <div class="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-sm overflow-hidden">
                {#if $requestsQuery.isLoading}
                    <div class="p-12 text-center">
                        <Loader2 class="w-8 h-8 animate-spin mx-auto text-violet-500" />
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-3">ກຳລັງໂຫຼດ...</p>
                    </div>
                {:else if $requestsQuery.isError}
                    <div class="p-12 text-center">
                        <XCircle class="w-10 h-10 text-danger-400 mx-auto mb-3" />
                        <p class="text-gray-600 dark:text-gray-400">ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ</p>
                        <button onclick={() => queryClient.invalidateQueries({ queryKey: ['admin-requests-all'] })}
                            class="mt-3 text-sm text-violet-600 dark:text-violet-400 hover:underline">ລອງໃໝ່</button>
                    </div>
                {:else if !$requestsQuery.data?.data?.length}
                    <div class="p-16 text-center">
                        <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Inbox class="w-8 h-8 text-gray-400" />
                        </div>
                        <p class="font-medium text-gray-700 dark:text-gray-300">ບໍ່ພົບຄຳຂໍ</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ບໍ່ມີຄຳຂໍທີ່ກົງກັບເງື່ອນໄຂ</p>
                        {#if statusFilter || typeFilter || searchQuery}
                            <button onclick={() => { statusFilter = ''; typeFilter = ''; searchQuery = ''; }}
                                class="mt-3 text-sm text-violet-600 dark:text-violet-400 hover:underline">ລ້າງຕົວກອງ</button>
                        {/if}
                    </div>
                {:else}
                    <!-- Desktop Table -->
                    <div class="hidden lg:block overflow-x-auto">
                        <table class="w-full">
                            <thead>
                                <tr class="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                                    <th class="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ປະເພດ</th>
                                    <th class="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ຊື່ / ລະຫັດ</th>
                                    <th class="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ຜູ້ສະໝັກ</th>
                                    <th class="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ເອກະສານ</th>
                                    <th class="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ວັນທີ່</th>
                                    <th class="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ສະຖານະ</th>
                                    <th class="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ດຳເນີນການ</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-700/50">
                                {#each $requestsQuery.data.data as request (request.id)}
                                    {@const typeInfo = getTypeInfo(request.type)}
                                    {@const statusBadge = getStatusBadge(request.status)}
                                    {@const TypeIcon = typeInfo.icon}
                                    {@const StatusIcon = statusBadge.icon}
                                    <tr class="hover:bg-gray-50/80 dark:hover:bg-gray-700/20 transition-colors group">
                                        <td class="px-5 py-3.5">
                                            <div class="flex items-center gap-2.5">
                                                <div class={cn("w-9 h-9 rounded-xl flex items-center justify-center bg-linear-to-br shrink-0", typeInfo.color)}>
                                                    <TypeIcon class="w-4.5 h-4.5 text-white" />
                                                </div>
                                                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{typeInfo.label}</span>
                                            </div>
                                        </td>
                                        <td class="px-5 py-3.5">
                                            <p class="font-semibold text-sm text-gray-900 dark:text-white">{request.storeName || request.branchName || '-'}</p>
                                            <p class="text-xs text-gray-400 font-mono mt-0.5">{request.storeCode || request.branchCode || ''}</p>
                                        </td>
                                        <td class="px-5 py-3.5">
                                            <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{request.requester?.name || '-'}</p>
                                            <p class="text-xs text-gray-400 mt-0.5">{request.requester?.email || ''}</p>
                                            {#if request.requester?.phone}
                                                <p class="text-xs text-gray-400">{request.requester.phone}</p>
                                            {/if}
                                        </td>
                                        <td class="px-5 py-3.5">
                                            {#if request.documents?.length}
                                                <button onclick={() => { selectedRequest = request; openDocViewer(request.documents[0]); }}
                                                    class="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-medium hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors">
                                                    <FileText class="w-3.5 h-3.5" />
                                                    {request.documents.length} ໄຟລ໌
                                                </button>
                                            {:else}
                                                <span class="text-xs text-gray-400">-</span>
                                            {/if}
                                        </td>
                                        <td class="px-5 py-3.5">
                                            <p class="text-xs text-gray-500 dark:text-gray-400">{formatDate(request.createdAt)}</p>
                                        </td>
                                        <td class="px-5 py-3.5">
                                            <span class={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold", statusBadge.bg, statusBadge.text)}>
                                                <span class={cn("w-1.5 h-1.5 rounded-full", statusBadge.dot)}></span>
                                                {statusBadge.label}
                                            </span>
                                        </td>
                                        <td class="px-5 py-3.5">
                                            <div class="flex justify-end gap-1.5">
                                                <button onclick={() => openDetailModal(request)}
                                                    class="w-8 h-8 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 transition-colors" title="ເບິ່ງລາຍລະອຽດ">
                                                    <Eye class="w-4 h-4" />
                                                </button>
                                                {#if request.status === 'pending'}
                                                    <button onclick={() => openReviewModal(request, 'approve')}
                                                        class="w-8 h-8 bg-emerald-500 hover:bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-sm transition-all hover:scale-105" title="ອະນຸມັດ">
                                                        <CheckCircle class="w-4 h-4" />
                                                    </button>
                                                    <button onclick={() => openReviewModal(request, 'reject')}
                                                        class="w-8 h-8 bg-danger-500 hover:bg-danger-600 rounded-lg flex items-center justify-center text-white shadow-sm transition-all hover:scale-105" title="ປະຕິເສດ">
                                                        <XCircle class="w-4 h-4" />
                                                    </button>
                                                {/if}
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>

                    <!-- Mobile Cards -->
                    <div class="lg:hidden divide-y divide-gray-100 dark:divide-gray-700/50">
                        {#each $requestsQuery.data.data as request (request.id)}
                            {@const typeInfo = getTypeInfo(request.type)}
                            {@const statusBadge = getStatusBadge(request.status)}
                            {@const TypeIcon = typeInfo.icon}
                            {@const StatusIcon = statusBadge.icon}
                            <div class="p-4">
                                <div class="flex items-start gap-3 mb-3">
                                    <div class={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-linear-to-br shrink-0", typeInfo.color)}>
                                        <TypeIcon class="w-5 h-5 text-white" />
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <p class="font-semibold text-sm text-gray-900 dark:text-white">{request.storeName || request.branchName || '-'}</p>
                                            <span class={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", statusBadge.bg, statusBadge.text)}>
                                                <StatusIcon class="w-3 h-3" />{statusBadge.label}
                                            </span>
                                        </div>
                                        <p class="text-xs text-gray-500 mt-0.5">{typeInfo.label} • {request.requester?.name}</p>
                                        <p class="text-xs text-gray-400">{formatDate(request.createdAt)}</p>
                                    </div>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick={() => openDetailModal(request)} class="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center justify-center gap-1">
                                        <Eye class="w-3.5 h-3.5" /> ລາຍລະອຽດ
                                    </button>
                                    {#if request.documents?.length}
                                        <button onclick={() => { selectedRequest = request; openDocViewer(request.documents[0]); }}
                                            class="py-2 px-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg text-xs font-medium text-violet-700 dark:text-violet-300 flex items-center gap-1">
                                            <FileText class="w-3.5 h-3.5" /> {request.documents.length}
                                        </button>
                                    {/if}
                                    {#if request.status === 'pending'}
                                        <button onclick={() => openReviewModal(request, 'approve')} class="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1">
                                            <CheckCircle class="w-3.5 h-3.5" /> ອະນຸມັດ
                                        </button>
                                        <button onclick={() => openReviewModal(request, 'reject')} class="flex-1 py-2 bg-danger-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1">
                                            <XCircle class="w-3.5 h-3.5" /> ປະຕິເສດ
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!-- Pagination -->
                    <div class="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-700/50">
                        <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                            <select bind:value={pageSize} onchange={() => currentPage = 1}
                                class="px-2 py-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white">
                                {#each pageSizeOptions as s (s)}<option value={s}>{s}</option>{/each}
                            </select>
                            ຈາກ {totalItems} ລາຍການ
                        </div>
                        <div class="flex items-center gap-1">
                            <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}
                                class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 text-gray-600 dark:text-gray-300 transition-colors">
                                <ChevronLeft class="w-4 h-4" />
                            </button>
                            <span class="px-3 text-sm text-gray-600 dark:text-gray-400">{currentPage} / {totalPages}</span>
                            <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}
                                class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 text-gray-600 dark:text-gray-300 transition-colors">
                                <ChevronRight class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- ═══ DETAIL MODAL ═══ -->
    {#if showDetailModal && selectedRequest}
        {@const req = selectedRequest}
        {@const badge = getStatusBadge(req.status)}
        {@const BIcon = badge.icon}
        {@const typeInfo = getTypeInfo(req.type)}
        {@const TIcon = typeInfo.icon}
        <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showDetailModal = false}></div>
            <div class="relative bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
                <!-- Header -->
                <div class="bg-linear-to-r from-violet-600 to-purple-600 px-6 py-5 text-white shrink-0">
                    <button onclick={() => showDetailModal = false} class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-colors">
                        <X class="w-4 h-4" />
                    </button>
                    <div class="flex items-center gap-3">
                        <div class={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-linear-to-br", typeInfo.color)}>
                            <TIcon class="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 class="font-bold text-lg leading-tight">{req.storeName || req.branchName || 'ຄຳຂໍ'}</h3>
                            <div class="flex items-center gap-2 mt-0.5">
                                <span class="text-sm opacity-80">{typeInfo.label}</span>
                                <span class={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/20", badge.text.replace('dark:', ''))}>
                                    <BIcon class="w-3 h-3" />{badge.label}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Body -->
                <div class="overflow-y-auto flex-1 p-5 space-y-4">
                    <!-- Business Info -->
                    {#if req.storeName}
                        <div class="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 p-4">
                            <p class="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Store class="w-3.5 h-3.5" /> ຂໍ້ມູນທຸລະກິດ</p>
                            <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div><span class="text-gray-400">ຊື່ຮ້ານ</span><p class="font-semibold text-gray-900 dark:text-white mt-0.5">{req.storeName}</p></div>
                                <div><span class="text-gray-400">ລະຫັດ</span><p class="font-mono font-bold text-violet-600 dark:text-violet-400 mt-0.5">{req.storeCode || '-'}</p></div>
                                {#if req.storeAddress}<div class="col-span-2"><span class="text-gray-400">ທີ່ຢູ່</span><p class="font-medium text-gray-900 dark:text-white mt-0.5">{req.storeAddress}</p></div>{/if}
                                {#if req.storePhone}<div><span class="text-gray-400">ໂທລະສັບ</span><p class="font-medium text-gray-900 dark:text-white mt-0.5">{req.storePhone}</p></div>{/if}
                                {#if req.storeEmail}<div><span class="text-gray-400">ອີເມວ</span><p class="font-medium text-gray-900 dark:text-white mt-0.5 truncate">{req.storeEmail}</p></div>{/if}
                                {#if req.metadata?.businessType}<div><span class="text-gray-400">ປະເພດທຸລະກິດ</span><p class="font-medium text-gray-900 dark:text-white mt-0.5">{req.metadata.businessType}</p></div>{/if}
                            </div>
                        </div>
                    {/if}

                    <!-- KYC / Owner Info -->
                    {#if req.metadata?.ownerName || req.metadata?.taxCertificateNo || req.metadata?.businessLicenseNo}
                        <div class="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10 p-4">
                            <p class="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Shield class="w-3.5 h-3.5" /> ຂໍ້ມູນ KYC / ເຈົ້າຂອງ</p>
                            <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                {#if req.metadata?.ownerName}<div><span class="text-gray-400">ຊື່ເຈົ້າຂອງ</span><p class="font-semibold text-gray-900 dark:text-white mt-0.5">{req.metadata.ownerName}</p></div>{/if}
                                {#if req.metadata?.ownerPhone}<div><span class="text-gray-400">ເບີໂທ</span><p class="font-medium text-gray-900 dark:text-white mt-0.5">{req.metadata.ownerPhone}</p></div>{/if}
                                {#if req.metadata?.ownerIdType}<div><span class="text-gray-400">ປະເພດ ID</span><p class="font-medium text-gray-900 dark:text-white mt-0.5">{req.metadata.ownerIdType}</p></div>{/if}
                                {#if req.metadata?.ownerIdNumber}<div><span class="text-gray-400">ເລກ ID</span><p class="font-mono font-medium text-gray-900 dark:text-white mt-0.5">{req.metadata.ownerIdNumber}</p></div>{/if}
                                {#if req.metadata?.businessLicenseNo}<div><span class="text-gray-400">ໃບອະນຸຍາດ</span><p class="font-mono font-medium text-gray-900 dark:text-white mt-0.5">{req.metadata.businessLicenseNo}</p></div>{/if}
                                {#if req.metadata?.taxCertificateNo}<div><span class="text-gray-400">ໃບທະບຽນພາສີ</span><p class="font-mono font-medium text-gray-900 dark:text-white mt-0.5">{req.metadata.taxCertificateNo}</p></div>{/if}
                            </div>
                        </div>
                    {/if}

                    <!-- Applicant -->
                    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><User class="w-3.5 h-3.5" /> ຜູ້ສະໝັກ</p>
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center text-violet-600 dark:text-violet-400 font-bold text-sm shrink-0">
                                {(req.requester?.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p class="font-semibold text-gray-900 dark:text-white">{req.requester?.name || '-'}</p>
                                <p class="text-sm text-gray-500">{req.requester?.email || ''}</p>
                                {#if req.requester?.phone}<p class="text-xs text-gray-400">{req.requester.phone}</p>{/if}
                            </div>
                        </div>
                        <p class="text-xs text-gray-400 mt-2 flex items-center gap-1"><Calendar class="w-3 h-3" /> ສົ່ງຄຳຂໍ: {formatDate(req.createdAt)}</p>
                    </div>

                    <!-- Documents -->
                    {#if req.documents?.length}
                        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <FileText class="w-3.5 h-3.5" /> ເອກະສານແນບ ({req.documents.length} ໄຟລ໌)
                            </p>
                            <div class="grid grid-cols-2 gap-2">
                                {#each req.documents as docUrl, i}
                                    {@const img = isImageUrl(docUrl)}
                                    {@const pdf = isPdfUrl(docUrl)}
                                    {@const fname = getFileName(docUrl)}
                                    {#if img}
                                        <button onclick={() => openDocViewer(docUrl)} class="relative group rounded-xl overflow-hidden border-2 border-transparent hover:border-violet-400 transition-all aspect-video bg-gray-200 dark:bg-gray-700">
                                            <img src={docUrl} alt={fname} class="w-full h-full object-cover" loading="lazy" />
                                            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                                                <Eye class="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        </button>
                                    {:else}
                                        <a href={docUrl} target="_blank" rel="noopener noreferrer"
                                            class="flex items-center gap-2 p-3 bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-violet-400 transition-all group">
                                            <div class={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", pdf ? 'bg-danger-100 dark:bg-danger-900/30' : 'bg-blue-100 dark:bg-blue-900/30')}>
                                                <FileText class={cn("w-4 h-4", pdf ? 'text-danger-500' : 'text-blue-500')} />
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <p class="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{fname}</p>
                                                <p class="text-xs text-gray-400">{pdf ? 'PDF' : 'ເອກະສານ'}</p>
                                            </div>
                                            <ExternalLink class="w-3.5 h-3.5 text-gray-400 group-hover:text-violet-500 shrink-0 transition-colors" />
                                        </a>
                                    {/if}
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- Review Note -->
                    {#if req.reviewNote}
                        <div class="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-900/10 p-4">
                            <p class="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider mb-2">ໝາຍເຫດ</p>
                            <p class="text-sm text-gray-700 dark:text-gray-300">{req.reviewNote}</p>
                            {#if req.reviewer}
                                <p class="text-xs text-gray-400 mt-2">ໂດຍ: {req.reviewer.name} • {formatDate(req.reviewedAt)}</p>
                            {/if}
                        </div>
                    {/if}
                </div>

                <!-- Footer -->
                <div class="border-t border-gray-100 dark:border-gray-700 px-5 py-4 flex gap-3 shrink-0 bg-white dark:bg-gray-900">
                    <button onclick={() => showDetailModal = false}
                        class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm">
                        ປິດ
                    </button>
                    {#if req.status === 'pending'}
                        <button onclick={() => { showDetailModal = false; openReviewModal(req, 'approve'); }}
                            class="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm">
                            <CheckCircle class="w-4 h-4" /> ອະນຸມັດ
                        </button>
                        <button onclick={() => { showDetailModal = false; openReviewModal(req, 'reject'); }}
                            class="flex-1 py-2.5 bg-danger-500 hover:bg-danger-600 text-white font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm">
                            <XCircle class="w-4 h-4" /> ປະຕິເສດ
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    <!-- ═══ DOCUMENT VIEWER MODAL ═══ -->
    {#if showDocViewer && selectedDocUrl}
        <div class="fixed inset-0 z-60 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-md" onclick={() => showDocViewer = false}></div>
            <div class="relative w-full max-w-4xl max-h-[90vh] bg-gray-900 rounded-2xl overflow-hidden flex flex-col">
                <div class="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
                    <p class="text-sm text-gray-300 font-medium truncate">{getFileName(selectedDocUrl)}</p>
                    <div class="flex items-center gap-2">
                        <a href={selectedDocUrl} target="_blank" rel="noopener noreferrer"
                            class="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-colors">
                            <ExternalLink class="w-3.5 h-3.5" /> ເປີດໃໝ່
                        </a>
                        <button onclick={() => showDocViewer = false} class="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center justify-center text-gray-300 transition-colors">
                            <X class="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div class="flex-1 overflow-auto flex items-center justify-center bg-gray-950 p-4">
                    {#if isImageUrl(selectedDocUrl)}
                        <img src={selectedDocUrl} alt="document" class="max-w-full max-h-full object-contain rounded-lg" />
                    {:else if isPdfUrl(selectedDocUrl)}
                        <iframe src={selectedDocUrl} title="PDF Viewer" class="w-full h-full min-h-[70vh] rounded-lg" frameborder="0"></iframe>
                    {:else}
                        <div class="text-center text-gray-400">
                            <FileText class="w-16 h-16 mx-auto mb-3 opacity-40" />
                            <p class="text-sm">ບໍ່ສາມາດສະແດງໄຟລ໌ນີ້ໃນ Preview</p>
                            <a href={selectedDocUrl} target="_blank" rel="noopener noreferrer"
                                class="mt-3 inline-flex items-center gap-1.5 text-violet-400 hover:text-violet-300 text-sm">
                                <ExternalLink class="w-4 h-4" /> ດາວໂຫຼດ / ເປີດ
                            </a>
                        </div>
                    {/if}
                </div>
                <!-- Doc navigation if multiple docs -->
                {#if selectedRequest?.documents?.length > 1}
                    <div class="border-t border-gray-700 px-5 py-3 flex items-center gap-2 overflow-x-auto shrink-0">
                        {#each selectedRequest.documents as docUrl, i}
                            <button onclick={() => selectedDocUrl = docUrl}
                                class={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors",
                                    selectedDocUrl === docUrl
                                        ? 'bg-violet-600 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600')}>
                                {#if isImageUrl(docUrl)}
                                    <ImageIcon class="w-3.5 h-3.5" />
                                {:else}
                                    <FileText class="w-3.5 h-3.5" />
                                {/if}
                                ໄຟລ໌ {i + 1}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- ═══ REVIEW MODAL ═══ -->
    {#if showReviewModal && selectedRequest}
        <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showReviewModal = false}></div>
            <div class="relative bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden">
                <div class={cn("px-6 py-5 text-white", reviewAction === 'approve' ? 'bg-linear-to-r from-emerald-500 to-success-500' : 'bg-linear-to-r from-danger-500 to-rose-600')}>
                    <div class="flex items-center gap-3">
                        {#if reviewAction === 'approve'}
                            <CheckCircle class="w-7 h-7" />
                        {:else}
                            <XCircle class="w-7 h-7" />
                        {/if}
                        <div>
                            <h3 class="font-bold text-lg">{reviewAction === 'approve' ? 'ຢືນຢັນອະນຸມັດ' : 'ຢືນຢັນປະຕິເສດ'}</h3>
                            <p class="text-sm opacity-80 truncate">{selectedRequest.storeName || selectedRequest.branchName}</p>
                        </div>
                    </div>
                </div>
                <div class="p-5 space-y-4">
                    {#if reviewAction === 'approve'}
                        <div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3.5 border border-emerald-200 dark:border-emerald-700/50">
                            <p class="text-sm text-emerald-800 dark:text-emerald-200 font-medium">ລະບົບຈະ:</p>
                            <ul class="text-xs text-emerald-700 dark:text-emerald-300 mt-1.5 space-y-1 list-disc list-inside">
                                <li>ສ້າງ Tenant ໃໝ່ສຳລັບ {selectedRequest.storeName}</li>
                                <li>ສ້າງສາຂາ ແລະ ຮ້ານຄ້າ</li>
                                <li>ເປີດໃຊ້ງານບັນຊີຜູ້ໃຊ້</li>
                            </ul>
                        </div>
                    {/if}
                    <div>
                        <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {reviewAction === 'approve' ? 'ໝາຍເຫດ (ທາງເລືອກ)' : 'ເຫດຜົນປະຕິເສດ *'}
                        </p>
                        <textarea bind:value={reviewNote}
                            placeholder={reviewAction === 'approve' ? 'ໝາຍເຫດຫາຜູ້ສະໝັກ...' : 'ກະລຸນາລະບຸເຫດຜົນ...'}
                            rows="3"
                            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none text-sm text-gray-900 dark:text-white"
                        ></textarea>
                    </div>
                </div>
                <div class="border-t border-gray-100 dark:border-gray-700 px-5 py-4 flex gap-3">
                    <button onclick={() => showReviewModal = false}
                        class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm">
                        ຍົກເລີກ
                    </button>
                    <button onclick={handleReview}
                        disabled={$approveMutation.isPending || $rejectMutation.isPending}
                        class={cn(
                            'flex-1 py-2.5 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60',
                            reviewAction === 'approve'
                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm'
                                : 'bg-danger-500 hover:bg-danger-600 text-white shadow-sm'
                        )}>
                        {#if $approveMutation.isPending || $rejectMutation.isPending}
                            <Loader2 class="w-4 h-4 animate-spin" />
                        {/if}
                        {reviewAction === 'approve' ? 'ອະນຸມັດ' : 'ປະຕິເສດ'}
                    </button>
                </div>
            </div>
        </div>
    {/if}
{/if}
