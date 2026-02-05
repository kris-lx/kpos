<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { api } from "$lib/api";
    import { toast } from "svelte-sonner";
    import { auth } from "$lib/stores/auth.svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { 
        Store, Plus, Clock, CheckCircle, XCircle, Eye, 
        Building2, MapPin, Phone, Mail, FileText, Send,
        AlertCircle, Loader2, ChevronRight
    } from "lucide-svelte";

    const queryClient = useQueryClient();

    // Get user's requests
    const myRequestsQuery = createQuery({
        queryKey: ["my-store-requests"],
        queryFn: async () => {
            const response = await api.get("admin/my-requests").json<any>();
            return response.data || [];
        }
    });

    // Create request mutation
    const createRequestMutation = createMutation({
        mutationFn: async (data: any) => {
            return api.post("admin/requests", { json: data }).json();
        },
        onSuccess: () => {
            toast.success("ສົ່ງຄຳຂໍສຳເລັດ");
            queryClient.invalidateQueries({ queryKey: ["my-store-requests"] });
            showFormModal = false;
            resetForm();
        },
        onError: (error: any) => {
            toast.error(error?.message || "ເກີດຂໍ້ຜິດພາດ");
        }
    });

    let showFormModal = $state(false);
    let showDetailModal = $state(false);
    let selectedRequest = $state<any>(null);
    let requestType = $state<"store" | "branch">("store");

    let formData = $state({
        type: "store" as "store" | "branch",
        storeName: "",
        storeCode: "",
        businessType: "",
        address: "",
        phone: "",
        email: "",
        description: "",
        ownerName: "",
        ownerPhone: "",
        ownerEmail: ""
    });

    function resetForm() {
        formData = {
            type: "store",
            storeName: "",
            storeCode: "",
            businessType: "",
            address: "",
            phone: "",
            email: "",
            description: "",
            ownerName: auth.user?.name || "",
            ownerPhone: auth.user?.phone || "",
            ownerEmail: auth.user?.email || ""
        };
    }

    function openCreateModal(type: "store" | "branch") {
        requestType = type;
        formData.type = type;
        formData.ownerName = auth.user?.name || "";
        formData.ownerPhone = auth.user?.phone || "";
        formData.ownerEmail = auth.user?.email || "";
        showFormModal = true;
    }

    function viewDetail(request: any) {
        selectedRequest = request;
        showDetailModal = true;
    }

    function handleSubmit() {
        if (!formData.storeName || !formData.address || !formData.phone) {
            toast.error("ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບ");
            return;
        }
        $createRequestMutation.mutate(formData);
    }

    function getStatusColor(status: string) {
        switch (status) {
            case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
            case "approved": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
            case "rejected": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
            default: return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
        }
    }

    function getStatusIcon(status: string) {
        switch (status) {
            case "pending": return Clock;
            case "approved": return CheckCircle;
            case "rejected": return XCircle;
            default: return AlertCircle;
        }
    }

    function getStatusText(status: string) {
        switch (status) {
            case "pending": return "ລໍຖ້າອະນຸມັດ";
            case "approved": return "ອະນຸມັດແລ້ວ";
            case "rejected": return "ຖືກປະຕິເສດ";
            default: return status;
        }
    }

    function formatDate(date: string) {
        return new Date(date).toLocaleDateString("lo-LA", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    const businessTypes = [
        { value: "retail", label: "ຮ້ານຂາຍຍ່ອຍ" },
        { value: "restaurant", label: "ຮ້ານອາຫານ" },
        { value: "cafe", label: "ຮ້ານກາເຟ" },
        { value: "grocery", label: "ຮ້ານຂາຍເຄື່ອງ" },
        { value: "pharmacy", label: "ຮ້ານຂາຍຢາ" },
        { value: "electronics", label: "ຮ້ານເຄື່ອງໄຟຟ້າ" },
        { value: "clothing", label: "ຮ້ານເຄື່ອງນຸ່ງ" },
        { value: "other", label: "ອື່ນໆ" }
    ];
</script>

<svelte:head>
    <title>ຂໍເປີດຮ້ານ | KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <div class="max-w-6xl mx-auto space-y-6">
        <!-- Header -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-xl">
                            <Store class="w-6 h-6 text-primary-600 dark:text-primary-400" />
                        </div>
                        ຂໍເປີດຮ້ານ / ສາຂາ
                    </h1>
                    <p class="text-gray-500 dark:text-gray-400 mt-1">
                        ສົ່ງຄຳຂໍເປີດຮ້ານໃໝ່ ຫຼື ສາຂາເພີ່ມເຕີມ
                    </p>
                </div>
                <div class="flex gap-3">
                    <button
                        onclick={() => openCreateModal("store")}
                        class="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
                    >
                        <Plus class="w-5 h-5" />
                        ຂໍເປີດຮ້ານໃໝ່
                    </button>
                    <button
                        onclick={() => openCreateModal("branch")}
                        class="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors"
                    >
                        <Building2 class="w-5 h-5" />
                        ຂໍເປີດສາຂາ
                    </button>
                </div>
            </div>
        </div>

        <!-- Info Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <div class="flex items-center gap-3">
                    <div class="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl">
                        <Clock class="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">
                            {$myRequestsQuery.data?.filter((r: any) => r.status === "pending").length || 0}
                        </p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">ລໍຖ້າອະນຸມັດ</p>
                    </div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <div class="flex items-center gap-3">
                    <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                        <CheckCircle class="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">
                            {$myRequestsQuery.data?.filter((r: any) => r.status === "approved").length || 0}
                        </p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">ອະນຸມັດແລ້ວ</p>
                    </div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <div class="flex items-center gap-3">
                    <div class="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
                        <XCircle class="w-6 h-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">
                            {$myRequestsQuery.data?.filter((r: any) => r.status === "rejected").length || 0}
                        </p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">ຖືກປະຕິເສດ</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- My Requests List -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">ຄຳຂໍຂອງຂ້ອຍ</h2>
            </div>

            {#if $myRequestsQuery.isLoading}
                <div class="p-12 text-center">
                    <Loader2 class="w-8 h-8 animate-spin text-primary-600 mx-auto" />
                    <p class="text-gray-500 dark:text-gray-400 mt-2">ກຳລັງໂຫຼດ...</p>
                </div>
            {:else if !$myRequestsQuery.data?.length}
                <div class="p-12 text-center">
                    <Store class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto" />
                    <p class="text-gray-500 dark:text-gray-400 mt-4">ທ່ານຍັງບໍ່ມີຄຳຂໍ</p>
                    <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">ກົດປຸ່ມ "ຂໍເປີດຮ້ານໃໝ່" ເພື່ອເລີ່ມຕົ້ນ</p>
                </div>
            {:else}
                <div class="divide-y divide-gray-200 dark:divide-gray-700">
                    {#each $myRequestsQuery.data as request}
                        <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-4">
                                    <div class="p-3 bg-gray-100 dark:bg-gray-700 rounded-xl">
                                        {#if request.type === "store"}
                                            <Store class="w-6 h-6 text-primary-600 dark:text-primary-400" />
                                        {:else}
                                            <Building2 class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                                        {/if}
                                    </div>
                                    <div>
                                        <h3 class="font-medium text-gray-900 dark:text-white">
                                            {request.storeName}
                                        </h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            {request.type === "store" ? "ຂໍເປີດຮ້ານໃໝ່" : "ຂໍເປີດສາຂາ"} • {formatDate(request.createdAt)}
                                        </p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3">
                                    <span class="px-3 py-1 rounded-full text-sm font-medium {getStatusColor(request.status)}">
                                        {getStatusText(request.status)}
                                    </span>
                                    <button
                                        onclick={() => viewDetail(request)}
                                        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                                    >
                                        <Eye class="w-5 h-5 text-gray-500" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- Create Request Modal -->
{#if showFormModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
                    {#if formData.type === "store"}
                        <Store class="w-6 h-6 text-primary-600" />
                        ຂໍເປີດຮ້ານໃໝ່
                    {:else}
                        <Building2 class="w-6 h-6 text-emerald-600" />
                        ຂໍເປີດສາຂາ
                    {/if}
                </h2>
            </div>

            <div class="p-6 space-y-6">
                <!-- Store Info -->
                <div class="space-y-4">
                    <h3 class="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                        <Store class="w-5 h-5" />
                        ຂໍ້ມູນຮ້ານ
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ຊື່ຮ້ານ <span class="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                bind:value={formData.storeName}
                                placeholder="ປ້ອນຊື່ຮ້ານ"
                                class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ລະຫັດຮ້ານ
                            </label>
                            <input
                                type="text"
                                bind:value={formData.storeCode}
                                placeholder="ເຊັ່ນ: SHOP001"
                                class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            ປະເພດທຸລະກິດ
                        </label>
                        <select
                            bind:value={formData.businessType}
                            class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                            <option value="">ເລືອກປະເພດ</option>
                            {#each businessTypes as type}
                                <option value={type.value}>{type.label}</option>
                            {/each}
                        </select>
                    </div>
                </div>

                <!-- Contact Info -->
                <div class="space-y-4">
                    <h3 class="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                        <MapPin class="w-5 h-5" />
                        ຂໍ້ມູນຕິດຕໍ່
                    </h3>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            ທີ່ຢູ່ <span class="text-red-500">*</span>
                        </label>
                        <textarea
                            bind:value={formData.address}
                            rows="2"
                            placeholder="ປ້ອນທີ່ຢູ່ຮ້ານ"
                            class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        ></textarea>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ເບີໂທ <span class="text-red-500">*</span>
                            </label>
                            <input
                                type="tel"
                                bind:value={formData.phone}
                                placeholder="020 XXXX XXXX"
                                class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ອີເມວ
                            </label>
                            <input
                                type="email"
                                bind:value={formData.email}
                                placeholder="shop@example.com"
                                class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                </div>

                <!-- Owner Info -->
                <div class="space-y-4">
                    <h3 class="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                        <FileText class="w-5 h-5" />
                        ຂໍ້ມູນເຈົ້າຂອງ
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ຊື່ເຈົ້າຂອງ
                            </label>
                            <input
                                type="text"
                                bind:value={formData.ownerName}
                                class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ເບີໂທເຈົ້າຂອງ
                            </label>
                            <input
                                type="tel"
                                bind:value={formData.ownerPhone}
                                class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ອີເມວເຈົ້າຂອງ
                            </label>
                            <input
                                type="email"
                                bind:value={formData.ownerEmail}
                                class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                </div>

                <!-- Description -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        ລາຍລະອຽດເພີ່ມເຕີມ
                    </label>
                    <textarea
                        bind:value={formData.description}
                        rows="3"
                        placeholder="ອະທິບາຍກ່ຽວກັບທຸລະກິດຂອງທ່ານ..."
                        class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    ></textarea>
                </div>
            </div>

            <div class="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button
                    onclick={() => showFormModal = false}
                    class="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                    ຍົກເລີກ
                </button>
                <button
                    onclick={handleSubmit}
                    disabled={$createRequestMutation.isPending}
                    class="flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                    {#if $createRequestMutation.isPending}
                        <Loader2 class="w-5 h-5 animate-spin" />
                        ກຳລັງສົ່ງ...
                    {:else}
                        <Send class="w-5 h-5" />
                        ສົ່ງຄຳຂໍ
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Detail Modal -->
{#if showDetailModal && selectedRequest}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg">
            <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                    ລາຍລະອຽດຄຳຂໍ
                </h2>
            </div>

            <div class="p-6 space-y-4">
                <div class="flex items-center justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ສະຖານະ</span>
                    <span class="px-3 py-1 rounded-full text-sm font-medium {getStatusColor(selectedRequest.status)}">
                        {getStatusText(selectedRequest.status)}
                    </span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ປະເພດ</span>
                    <span class="text-gray-900 dark:text-white">
                        {selectedRequest.type === "store" ? "ເປີດຮ້ານໃໝ່" : "ເປີດສາຂາ"}
                    </span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ຊື່ຮ້ານ</span>
                    <span class="text-gray-900 dark:text-white font-medium">{selectedRequest.storeName}</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ທີ່ຢູ່</span>
                    <span class="text-gray-900 dark:text-white text-right max-w-[200px]">{selectedRequest.address}</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ເບີໂທ</span>
                    <span class="text-gray-900 dark:text-white">{selectedRequest.phone}</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-gray-500 dark:text-gray-400">ວັນທີສົ່ງ</span>
                    <span class="text-gray-900 dark:text-white">{formatDate(selectedRequest.createdAt)}</span>
                </div>

                {#if selectedRequest.reviewNote}
                    <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
                        <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">ບັນທຶກຈາກ Admin:</p>
                        <p class="text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                            {selectedRequest.reviewNote}
                        </p>
                    </div>
                {/if}
            </div>

            <div class="p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => showDetailModal = false}
                    class="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                    ປິດ
                </button>
            </div>
        </div>
    </div>
{/if}
