<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { api } from "$lib/api";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { cn, formatDateTime } from "$lib/utils";
    import {
        FileCheck,
        Clock,
        CheckCircle,
        XCircle,
        Search,
        ChevronLeft,
        ChevronRight,
        Eye,
        Loader2,
        Building2,
        Store,
        Calendar,
        User,
        Filter,
        ArrowLeft,
        Inbox,
        Sparkles,
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
            // ສະເພາະ Super Admin ແລະ Admin ເທົ່ານັ້ນທີ່ເຂົ້າເຖິງໄດ້
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

    let statusFilter = $state<string>("");
    let typeFilter = $state<string>("");
    let searchQuery = $state("");
    let debouncedSearch = $state("");
    let currentPage = $state(1);
    let pageSize = $state(20);
    let pageSizeOptions = [5, 10, 20, 50, 100];
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Debounce search
    $effect(() => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            debouncedSearch = searchQuery;
        }, 300);
        return () => clearTimeout(searchTimeout);
    });

    const requestsQuery = createQuery({
        queryKey: () => ["admin-requests-all", statusFilter, typeFilter, debouncedSearch, currentPage, pageSize],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (statusFilter) params.append("status", statusFilter);
            if (typeFilter) params.append("type", typeFilter);
            if (debouncedSearch) params.append("search", debouncedSearch);
            params.append("page", String(currentPage));
            params.append("limit", String(pageSize));
            const response = await api.get(`admin/requests?${params}`).json<any>();
            return response;
        },
    });

    const approveMutation = createMutation({
        mutationFn: async ({ id, note }: { id: string; note?: string }) => {
            return api.post(`admin/requests/${id}/approve`, { json: { note } }).json();
        },
        onSuccess: () => {
            toast.success("ອະນຸມັດສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["admin-requests-all"] });
            showReviewModal = false;
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    const rejectMutation = createMutation({
        mutationFn: async ({ id, note }: { id: string; note: string }) => {
            return api.post(`admin/requests/${id}/reject`, { json: { note } }).json();
        },
        onSuccess: () => {
            toast.success("ປະຕິເສດສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["admin-requests-all"] });
            showReviewModal = false;
        },
        onError: () => toast.error("ເກີດຂໍ້ຜິດພາດ")
    });

    let showReviewModal = $state(false);
    let showDetailModal = $state(false);
    let selectedRequest = $state<any>(null);
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
    }

    function getStatusBadge(status: string) {
        const badges: Record<string, { bg: string; text: string; label: string; icon: any }> = {
            pending: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400", label: "ລໍຖ້າ", icon: Clock },
            approved: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-400", label: "ອະນຸມັດ", icon: CheckCircle },
            rejected: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400", label: "ປະຕິເສດ", icon: XCircle }
        };
        return badges[status] || badges.pending;
    }

    function getTypeInfo(type: string) {
        const types: Record<string, { label: string; icon: any; color: string }> = {
            new_store: { label: "ເປີດຮ້ານໃໝ່", icon: Store, color: "from-emerald-500 to-green-500" },
            new_branch: { label: "ເປີດສາຂາໃໝ່", icon: Building2, color: "from-blue-500 to-cyan-500" },
            branch_update: { label: "ແກ້ໄຂສາຂາ", icon: Building2, color: "from-violet-500 to-purple-500" }
        };
        return types[type] || { label: type, icon: FileCheck, color: "from-gray-500 to-gray-600" };
    }

    function formatDate(dateString: string) {
        return formatDateTime(dateString);
    }

    function goToPage(page: number) {
        const totalPages = $requestsQuery.data?.meta?.totalPages || 1;
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
        }
    }

    function changePageSize(size: number) {
        pageSize = size;
        currentPage = 1;
    }

    let totalItems = $derived($requestsQuery.data?.meta?.total || 0);
    let totalPages = $derived($requestsQuery.data?.meta?.totalPages || 1);
</script>

<svelte:head>
    <title>ຄຳຂໍທັງໝົດ - Super Admin</title>
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
                    <div class="w-14 h-14 bg-gradient-to-br from-violet-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl shadow-violet-500/25">
                        <FileCheck class="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 class="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">ຄຳຂໍທັງໝົດ</h1>
                        <p class="text-gray-500 dark:text-gray-400">ຈັດການຄຳຂໍເປີດຮ້ານ ແລະ ສາຂາ</p>
                    </div>
                </div>
            </div>

            <!-- Filters -->
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none p-5">
                <div class="flex flex-col lg:flex-row gap-4">
                    <!-- Search -->
                    <div class="flex-1 relative">
                        <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input 
                            type="text" 
                            bind:value={searchQuery}
                            placeholder="ຄົ້ນຫາຄຳຂໍ..." 
                            class="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
                        />
                    </div>
                    <!-- Status Filter -->
                    <div class="flex items-center gap-3">
                        <div class="relative">
                            <select 
                                bind:value={statusFilter}
                                class="appearance-none px-4 py-3 pr-10 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-gray-900 dark:text-white min-w-[140px]"
                            >
                                <option value="">ທຸກສະຖານະ</option>
                                <option value="pending">ລໍຖ້າ</option>
                                <option value="approved">ອະນຸມັດແລ້ວ</option>
                                <option value="rejected">ປະຕິເສດແລ້ວ</option>
                            </select>
                            <Filter class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                        <div class="relative">
                            <select 
                                bind:value={typeFilter}
                                class="appearance-none px-4 py-3 pr-10 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-gray-900 dark:text-white min-w-[160px]"
                            >
                                <option value="">ທຸກປະເພດ</option>
                                <option value="new_store">ເປີດຮ້ານໃໝ່</option>
                                <option value="new_branch">ເປີດສາຂາໃໝ່</option>
                                <option value="branch_update">ແກ້ໄຂສາຂາ</option>
                            </select>
                            <Filter class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Requests List -->
            <div class="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                {#if $requestsQuery.isLoading}
                    <div class="p-12 text-center">
                        <Loader2 class="w-10 h-10 animate-spin mx-auto text-violet-500" />
                        <p class="text-gray-500 dark:text-gray-400 mt-4">ກຳລັງໂຫຼດ...</p>
                    </div>
                {:else if !$requestsQuery.data?.data?.length}
                    <div class="p-16 text-center">
                        <div class="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Inbox class="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">ບໍ່ພົບຄຳຂໍ</h3>
                        <p class="text-gray-500 dark:text-gray-400">ບໍ່ມີຄຳຂໍທີ່ກົງກັບເງື່ອນໄຂການຄົ້ນຫາ</p>
                    </div>
                {:else}
                    <!-- Table for larger screens -->
                    <div class="hidden lg:block overflow-x-auto">
                        <table class="w-full">
                            <thead>
                                <tr class="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                                    <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ປະເພດ</th>
                                    <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ຊື່</th>
                                    <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ຜູ້ຂໍ</th>
                                    <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ວັນທີ່</th>
                                    <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ສະຖານະ</th>
                                    <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ການດຳເນີນການ</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                                {#each $requestsQuery.data.data as request (request.id)}
                                    {@const typeInfo = getTypeInfo(request.type)}
                                    {@const statusBadge = getStatusBadge(request.status)}
                                    {@const TypeIcon = typeInfo.icon}
                                    {@const StatusIcon = statusBadge.icon}
                                    <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td class="px-6 py-4">
                                            <div class="flex items-center gap-3">
                                                <div class={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg", typeInfo.color)}>
                                                    <TypeIcon class="w-5 h-5 text-white" />
                                                </div>
                                                <span class="font-medium text-gray-900 dark:text-white">{typeInfo.label}</span>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <p class="font-semibold text-gray-900 dark:text-white">{request.storeName || request.branchName || "-"}</p>
                                            {#if request.storeCode || request.branchCode}
                                                <p class="text-sm text-gray-500 dark:text-gray-400">{request.storeCode || request.branchCode}</p>
                                            {/if}
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="flex items-center gap-2">
                                                <div class="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                                                    <User class="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                                </div>
                                                <div>
                                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{request.requester?.name}</p>
                                                    <p class="text-xs text-gray-500 dark:text-gray-400">{request.requester?.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                                <Calendar class="w-4 h-4" />
                                                {formatDate(request.createdAt)}
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <span class={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold", statusBadge.bg, statusBadge.text)}>
                                                <StatusIcon class="w-3.5 h-3.5" />
                                                {statusBadge.label}
                                            </span>
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="flex justify-end gap-2">
                                                <button onclick={() => openDetailModal(request)} class="w-9 h-9 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 transition-colors">
                                                    <Eye class="w-4 h-4" />
                                                </button>
                                                {#if request.status === "pending"}
                                                    <button onclick={() => openReviewModal(request, "approve")} class="w-9 h-9 bg-emerald-500 hover:bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-105">
                                                        <CheckCircle class="w-4 h-4" />
                                                    </button>
                                                    <button onclick={() => openReviewModal(request, "reject")} class="w-9 h-9 bg-red-500 hover:bg-red-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-all hover:scale-105">
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

                    <!-- Cards for mobile -->
                    <div class="lg:hidden divide-y divide-gray-100 dark:divide-gray-700">
                        {#each $requestsQuery.data.data as request (request.id)}
                            {@const typeInfo = getTypeInfo(request.type)}
                            {@const statusBadge = getStatusBadge(request.status)}
                            {@const TypeIcon = typeInfo.icon}
                            {@const StatusIcon = statusBadge.icon}
                            <div class="p-4">
                                <div class="flex items-start gap-4">
                                    <div class={cn("w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg shrink-0", typeInfo.color)}>
                                        <TypeIcon class="w-6 h-6 text-white" />
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 mb-1">
                                            <p class="font-semibold text-gray-900 dark:text-white truncate">{request.storeName || request.branchName || "-"}</p>
                                            <span class={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0", statusBadge.bg, statusBadge.text)}>
                                                <StatusIcon class="w-3 h-3" />
                                                {statusBadge.label}
                                            </span>
                                        </div>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">{typeInfo.label}</p>
                                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">{request.requester?.name} • {formatDate(request.createdAt)}</p>
                                    </div>
                                </div>
                                <div class="flex justify-end gap-2 mt-3">
                                    <button onclick={() => openDetailModal(request)} class="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 text-sm font-medium">
                                        ເບິ່ງ
                                    </button>
                                    {#if request.status === "pending"}
                                        <button onclick={() => openReviewModal(request, "approve")} class="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium">
                                            ອະນຸມັດ
                                        </button>
                                        <button onclick={() => openReviewModal(request, "reject")} class="px-3 py-2 bg-red-500 text-white rounded-lg text-sm font-medium">
                                            ປະຕິເສດ
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!-- Pagination -->
                    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 border-t border-gray-100 dark:border-gray-700">
                        <div class="flex items-center gap-2">
                            <span class="text-sm text-gray-500 dark:text-gray-400">ສະແດງ:</span>
                            <select 
                                bind:value={pageSize} 
                                onchange={() => changePageSize(pageSize)}
                                class="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
                            >
                                {#each pageSizeOptions as size (size)}
                                    <option value={size}>{size} ລາຍການ</option>
                                {/each}
                            </select>
                            <span class="text-sm text-gray-500 dark:text-gray-400">
                                ({(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalItems)} ຈາກ {totalItems})
                            </span>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} class="w-9 h-9 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 transition-colors">
                                <ChevronLeft class="w-5 h-5" />
                            </button>
                            <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{currentPage} / {totalPages}</span>
                            <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} class="w-9 h-9 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 transition-colors">
                                <ChevronRight class="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Detail Modal -->
    {#if showDetailModal && selectedRequest}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showDetailModal = false}></div>
            <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
                <div class="sticky top-0 bg-gradient-to-r from-violet-600 to-purple-600 p-6 text-white">
                    <button onclick={() => showDetailModal = false} class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
                        <X class="w-5 h-5" />
                    </button>
                    <div class="flex items-center gap-3">
                        <Sparkles class="w-8 h-8" />
                        <div>
                            <h3 class="text-xl font-bold">ລາຍລະອຽດຄຳຂໍ</h3>
                            <p class="text-sm opacity-90">{getTypeInfo(selectedRequest.type).label}</p>
                        </div>
                    </div>
                </div>
                <div class="p-6 space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">ສະຖານະ</p>
                            {#if selectedRequest}
                                {@const badge = getStatusBadge(selectedRequest.status)}
                                {@const Icon = badge.icon}
                                <span class={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium", badge.bg, badge.text)}>
                                    <Icon class="w-4 h-4" />
                                    {badge.label}
                                </span>
                            {/if}
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">ວັນທີ່ສ້າງ</p>
                            <p class="font-medium text-gray-900 dark:text-white text-sm">{formatDate(selectedRequest.createdAt)}</p>
                        </div>
                    </div>

                    {#if selectedRequest.storeName}
                        <div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-100 dark:border-emerald-800/50">
                            <div class="flex items-center gap-2 mb-3">
                                <Store class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                <span class="font-semibold text-emerald-700 dark:text-emerald-300">ຂໍ້ມູນຮ້ານ</span>
                            </div>
                            <div class="space-y-2 text-sm">
                                <p><span class="text-gray-500 dark:text-gray-400">ຊື່:</span> <span class="font-medium text-gray-900 dark:text-white">{selectedRequest.storeName}</span></p>
                                <p><span class="text-gray-500 dark:text-gray-400">ລະຫັດ:</span> <span class="font-medium text-gray-900 dark:text-white">{selectedRequest.storeCode}</span></p>
                                {#if selectedRequest.storeAddress}
                                    <p><span class="text-gray-500 dark:text-gray-400">ທີ່ຢູ່:</span> <span class="font-medium text-gray-900 dark:text-white">{selectedRequest.storeAddress}</span></p>
                                {/if}
                            </div>
                        </div>
                    {/if}

                    {#if selectedRequest.branchName}
                        <div class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/50">
                            <div class="flex items-center gap-2 mb-3">
                                <Building2 class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                <span class="font-semibold text-blue-700 dark:text-blue-300">ຂໍ້ມູນສາຂາ</span>
                            </div>
                            <div class="space-y-2 text-sm">
                                <p><span class="text-gray-500 dark:text-gray-400">ຊື່:</span> <span class="font-medium text-gray-900 dark:text-white">{selectedRequest.branchName}</span></p>
                                <p><span class="text-gray-500 dark:text-gray-400">ລະຫັດ:</span> <span class="font-medium text-gray-900 dark:text-white">{selectedRequest.branchCode}</span></p>
                            </div>
                        </div>
                    {/if}

                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <User class="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            <span class="text-sm text-gray-500 dark:text-gray-400">ຜູ້ຂໍ</span>
                        </div>
                        <p class="font-medium text-gray-900 dark:text-white">{selectedRequest.requester?.name}</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">{selectedRequest.requester?.email}</p>
                    </div>

                    {#if selectedRequest.reviewNote}
                        <div class="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-4 border border-violet-100 dark:border-violet-800/50">
                            <p class="text-sm font-medium text-violet-700 dark:text-violet-300 mb-2">ໝາຍເຫດຈາກຜູ້ອະນຸມັດ</p>
                            <p class="text-gray-700 dark:text-gray-300">{selectedRequest.reviewNote}</p>
                            {#if selectedRequest.reviewer}
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ໂດຍ: {selectedRequest.reviewer.name}</p>
                            {/if}
                        </div>
                    {/if}
                </div>
                <div class="flex gap-3 p-6 pt-0">
                    <button onclick={() => showDetailModal = false} class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                        ປິດ
                    </button>
                    {#if selectedRequest.status === "pending"}
                        <button onclick={() => { showDetailModal = false; openReviewModal(selectedRequest, "approve"); }} class="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/30 transition-all">
                            ອະນຸມັດ
                        </button>
                        <button onclick={() => { showDetailModal = false; openReviewModal(selectedRequest, "reject"); }} class="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl shadow-lg shadow-red-500/30 transition-all">
                            ປະຕິເສດ
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

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
                        <p class="font-medium text-gray-900 dark:text-white">{getTypeInfo(selectedRequest.type).label}</p>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {reviewAction === "approve" ? "ໝາຍເຫດ (ທາງເລືອກ)" : "ເຫດຜົນປະຕິເສດ *"}
                        </label>
                        <textarea
                            bind:value={reviewNote}
                            placeholder={reviewAction === "approve" ? "ໝາຍເຫດເພີ່ມເຕີມ..." : "ກະລຸນາລະບຸເຫດຜົນ..."}
                            rows="3"
                            class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none transition-all text-gray-900 dark:text-white"
                        ></textarea>
                    </div>
                </div>
                <div class="flex gap-3 p-6 pt-0">
                    <button onclick={() => showReviewModal = false} class="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
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
