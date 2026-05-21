<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import { get } from "svelte/store";
    import { api } from "$lib/api";
    import { toast } from "svelte-sonner";
    import { auth } from "$lib/stores/auth.svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { enforcePhoneInput, formatDateTime } from "$lib/utils";
    import { 
        Store, Plus, Clock, CheckCircle, XCircle, Eye, 
        Building2, MapPin, Phone, Mail, FileText, Send,
        AlertCircle, Loader2, Tag, User, Hash
    } from "lucide-svelte";

    const queryClient = useQueryClient();

    // Load business types from API
    const enumsQuery = createQuery({
        queryKey: ["enums-business-type"],
        queryFn: async () => {
            const res = await api.get("settings/enums?type=business_type").json<any>();
            return res.data?.business_type || [];
        }
    });

    // Load branches for selection
    const branchesQuery = createQuery({
        queryKey: ["branches-list"],
        queryFn: async () => {
            const res = await api.get("branches").json<any>();
            return res.data || [];
        }
    });

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
            toast.success(t('storeRequest.submitSuccess'));
            get(myRequestsQuery).refetch();
            showFormModal = false;
            resetForm();
        },
        onError: (error: any) => {
            toast.error(error?.message || t('storeRequest.submitError'));
        }
    });

    let showFormModal = $state(false);
    let showDetailModal = $state(false);
    let selectedRequest = $state<any>(null);
    let requestType = $state<"store" | "branch">("store");

    // Store-specific form
    let storeForm = $state({
        storeName: "",
        storeCode: "",
        businessType: "",
        taxId: "",
        branchId: "",
        address: "",
        phone: "",
        email: "",
        description: "",
        ownerName: "",
        ownerPhone: "",
        ownerEmail: ""
    });

    // Branch-specific form (branch of an existing store)
    let branchForm = $state({
        branchName: "",
        branchCode: "",
        parentBranchId: "",
        address: "",
        phone: "",
        email: "",
        description: ""
    });

    let uploadedDocuments = $state<{url: string, name: string}[]>([]);
    let isUploading = $state(false);

    async function handleFileUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files?.length) return;
        
        isUploading = true;
        try {
            for (const file of Array.from(input.files)) {
                // Check file type and size
                if (file.size > 5 * 1024 * 1024) {
                    toast.error(`ໄຟລ໌ ${file.name} ໃຫຍ່ເກີນໄປ (ສູງສຸດ 5MB)`);
                    continue;
                }
                
                const reader = new FileReader();
                const base64 = await new Promise<string>((resolve) => {
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });
                
                const res = await api.post("upload/single", {
                    json: { 
                        image: base64, 
                        folder: "store_requests",
                        resourceType: "auto"
                    }
                }).json<any>();
                
                if (res.success) {
                    uploadedDocuments.push({ url: res.data.url, name: file.name });
                    toast.success(`ອັບໂຫຼດເອກະສານສຳເລັດ`);
                }
            }
        } catch (error) {
            console.error("Upload error:", error);
            toast.error("ເກີດຂໍ້ຜິດພາດໃນການອັບໂຫຼດເອກະສານ");
        } finally {
            isUploading = false;
            input.value = '';
        }
    }

    function removeDocument(index: number) {
        uploadedDocuments.splice(index, 1);
    }

    function resetForm() {
        storeForm = {
            storeName: "",
            storeCode: "",
            businessType: "",
            taxId: "",
            branchId: "",
            address: "",
            phone: "",
            email: "",
            description: "",
            ownerName: auth.user?.name || "",
            ownerPhone: auth.user?.phone || "",
            ownerEmail: auth.user?.email || ""
        };
        branchForm = {
            branchName: "",
            branchCode: "",
            parentBranchId: "",
            address: "",
            phone: "",
            email: "",
            description: ""
        };
        uploadedDocuments = [];
    }

    function openCreateModal(type: "store" | "branch") {
        requestType = type;
        storeForm.ownerName = auth.user?.name || "";
        storeForm.ownerPhone = auth.user?.phone || "";
        storeForm.ownerEmail = auth.user?.email || "";
        showFormModal = true;
    }

    function viewDetail(request: any) {
        selectedRequest = request;
        showDetailModal = true;
    }

    function getRequestDisplayName(request: any): string {
        return request.storeName || request.branchName || request.data?.storeName || request.data?.branchName || '—';
    }

    function getRequestType(request: any): string {
        if (request.type === 'new_store') return 'ຂໍເປີດຮ້ານໃໝ່';
        if (request.type === 'new_branch') return 'ຂໍເປີດສາຂາ';
        return request.type;
    }

    function handleSubmit() {
        if (requestType === 'store') {
            if (!storeForm.storeName || !storeForm.address || !storeForm.phone) {
                toast.error(t('storeRequest.validationError'));
                return;
            }
            if (storeForm.phone.length < 8) {
                toast.error('ເບີໂທຕ້ອງມີຢ່າງໜ້ອຍ 8 ຕົວເລກ');
                return;
            }
            $createRequestMutation.mutate({
                type: 'new_store',
                storeName: storeForm.storeName,
                storeCode: storeForm.storeCode,
                branchId: storeForm.branchId || undefined,
                storeAddress: storeForm.address,
                storePhone: storeForm.phone,
                storeEmail: storeForm.email,
                reason: storeForm.description,
                metadata: {
                    businessType: storeForm.businessType,
                    taxId: storeForm.taxId,
                    ownerName: storeForm.ownerName,
                    ownerPhone: storeForm.ownerPhone,
                    ownerEmail: storeForm.ownerEmail,
                },
                documents: uploadedDocuments.map(doc => JSON.stringify(doc)),
            });
        } else {
            if (!branchForm.branchName || !branchForm.address || !branchForm.phone) {
                toast.error(t('storeRequest.validationError'));
                return;
            }
            if (branchForm.phone.length < 8) {
                toast.error('ເບີໂທຕ້ອງມີຢ່າງໜ້ອຍ 8 ຕົວເລກ');
                return;
            }
            $createRequestMutation.mutate({
                type: 'new_branch',
                branchName: branchForm.branchName,
                branchCode: branchForm.branchCode,
                parentBranchId: branchForm.parentBranchId || undefined,
                branchAddress: branchForm.address,
                branchPhone: branchForm.phone,
                branchEmail: branchForm.email,
                reason: branchForm.description,
                documents: uploadedDocuments.map(doc => JSON.stringify(doc)),
            });
        }
    }

    function getStatusColor(status: string) {
        switch (status) {
            case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
            case "approved": return "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-400";
            case "rejected": return "bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-400";
            default: return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
        }
    }

    function getStatusText(status: string) {
        switch (status) {
            case "pending": return t('status.pending');
            case "approved": return t('status.approved');
            case "rejected": return t('status.rejected');
            default: return status;
        }
    }

    function formatDate(date: string) { return formatDateTime(date); }
</script>

<svelte:head>
    <title>ຂໍເປີດຮ້ານ | KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <div class="max-w-5xl mx-auto space-y-6">
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
                    <p class="text-gray-500 dark:text-gray-400 mt-1">ສົ່ງຄຳຂໍເປີດຮ້ານໃໝ່ ຫຼື ສາຂາເພີ່ມເຕີມ</p>
                </div>
                <div class="flex gap-3">
                    <button onclick={() => openCreateModal("store")}
                        class="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">
                        <Store class="w-4 h-4" />ຂໍເປີດຮ້ານໃໝ່
                    </button>
                    <button onclick={() => openCreateModal("branch")}
                        class="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors">
                        <Building2 class="w-4 h-4" />ຂໍເປີດສາຂາ
                    </button>
                </div>
            </div>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-4">
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
                <div class="p-2.5 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl"><Clock class="w-5 h-5 text-yellow-600 dark:text-yellow-400" /></div>
                <div><p class="text-xl font-bold text-gray-900 dark:text-white">{$myRequestsQuery.data?.filter((r:any)=>r.status==='pending').length||0}</p><p class="text-xs text-gray-500">ລໍຖ້າ</p></div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
                <div class="p-2.5 bg-success-100 dark:bg-success-900/30 rounded-xl"><CheckCircle class="w-5 h-5 text-success-600 dark:text-success-400" /></div>
                <div><p class="text-xl font-bold text-gray-900 dark:text-white">{$myRequestsQuery.data?.filter((r:any)=>r.status==='approved').length||0}</p><p class="text-xs text-gray-500">ອະນຸມັດ</p></div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
                <div class="p-2.5 bg-danger-100 dark:bg-danger-900/30 rounded-xl"><XCircle class="w-5 h-5 text-danger-600 dark:text-danger-400" /></div>
                <div><p class="text-xl font-bold text-gray-900 dark:text-white">{$myRequestsQuery.data?.filter((r:any)=>r.status==='rejected').length||0}</p><p class="text-xs text-gray-500">ປະຕິເສດ</p></div>
            </div>
        </div>

        <!-- My Requests List -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div class="p-5 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">ຄຳຂໍຂອງຂ້ອຍ</h2>
            </div>
            {#if $myRequestsQuery.isLoading}
                <div class="p-12 text-center"><Loader2 class="w-8 h-8 animate-spin text-primary-600 mx-auto" /></div>
            {:else if !$myRequestsQuery.data?.length}
                <div class="p-12 text-center">
                    <Store class="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p class="text-gray-500 dark:text-gray-400">ທ່ານຍັງບໍ່ມີຄຳຂໍ</p>
                </div>
            {:else}
                <div class="divide-y divide-gray-100 dark:divide-gray-700">
                    {#each $myRequestsQuery.data as request (request.id)}
                        <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center justify-between gap-4">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="p-2.5 rounded-xl {request.type==='new_store'?'bg-primary-100 dark:bg-primary-900/30':'bg-emerald-100 dark:bg-emerald-900/30'} shrink-0">
                                    {#if request.type === 'new_store'}<Store class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                    {:else}<Building2 class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />{/if}
                                </div>
                                <div class="min-w-0">
                                    <p class="font-medium text-gray-900 dark:text-white truncate">{getRequestDisplayName(request)}</p>
                                    <p class="text-sm text-gray-500">{getRequestType(request)} • {formatDate(request.createdAt)}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="px-2.5 py-1 rounded-full text-xs font-medium {getStatusColor(request.status)}">{getStatusText(request.status)}</span>
                                <button onclick={() => viewDetail(request)} class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg">
                                    <Eye class="w-4 h-4 text-gray-500" />
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- ══════════════════════════════════════════════════════════
     NEW STORE Modal
══════════════════════════════════════════════════════════ -->
{#if showFormModal && requestType === 'store'}
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div class="sticky top-0 bg-white dark:bg-gray-800 p-5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 z-10">
            <div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-xl"><Store class="w-5 h-5 text-primary-600" /></div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">ຂໍເປີດຮ້ານໃໝ່</h2>
        </div>
        <div class="p-5 space-y-5">
            <!-- Section: Store Info -->
            <div class="space-y-3">
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 uppercase tracking-wide">
                    <Store class="w-4 h-4" />ຂໍ້ມູນຮ້ານ
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label for="store-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຊື່ຮ້ານ <span class="text-danger-500">*</span></label>
                        <input id="store-name" type="text" bind:value={storeForm.storeName} placeholder="ຊື່ຮ້ານ" class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm" />
                    </div>
                    <div>
                        <label for="store-code" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ລະຫັດຮ້ານ</label>
                        <input id="store-code" type="text" bind:value={storeForm.storeCode} placeholder="SHOP001" class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm" />
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label for="store-business-type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ປະເພດທຸລະກິດ</label>
                        <select id="store-business-type" bind:value={storeForm.businessType} class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-sm">
                            <option value="">ເລືອກປະເພດ</option>
                            {#each ($enumsQuery.data || []) as bt (bt.value)}
                                <option value={bt.value}>{bt.labelLao || bt.label}</option>
                            {/each}
                        </select>
                    </div>
                    <div>
                        <label for="store-tax-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເລກທີພາສີ (Tax ID)</label>
                        <input id="store-tax-id" type="text" bind:value={storeForm.taxId} placeholder="0000000000000" class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm" />
                    </div>
                </div>
                <!-- Branch Selection -->
                {#if ($branchesQuery.data || []).length > 0}
                <div>
                    <label for="store-branch" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        <Building2 class="w-3.5 h-3.5 inline -mt-0.5" /> ສາຂາທີ່ສັງກັດ
                    </label>
                    <select id="store-branch" bind:value={storeForm.branchId} class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-sm">
                        <option value="">ສ້າງສາຂາໃໝ່ (ອັດຕະໂນມັດ)</option>
                        {#each ($branchesQuery.data || []) as branch (branch.id)}
                            <option value={branch.id}>{branch.name} {branch.code ? `(${branch.code})` : ''}</option>
                        {/each}
                    </select>
                    <p class="text-xs text-gray-400 mt-1">ເລືອກສາຂາທີ່ຮ້ານນີ້ຈະຂຶ້ນກັບ ຫຼື ປ່ອຍຫວ່າງເພື່ອສ້າງສາຂາໃໝ່</p>
                </div>
                {/if}
            </div>

            <!-- Section: Contact -->
            <div class="space-y-3">
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 uppercase tracking-wide">
                    <MapPin class="w-4 h-4" />ຂໍ້ມູນຕິດຕໍ່
                </h3>
                <div>
                    <label for="store-address" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ທີ່ຢູ່ <span class="text-danger-500">*</span></label>
                    <textarea id="store-address" bind:value={storeForm.address} rows="2" placeholder="ທີ່ຢູ່ຮ້ານ" class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm resize-none"></textarea>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label for="store-phone" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເບີໂທ <span class="text-danger-500">*</span></label>
                        <input id="store-phone" type="tel" inputmode="numeric" bind:value={storeForm.phone}
                            oninput={(e)=>{storeForm.phone=enforcePhoneInput(e.currentTarget.value)}}
                            placeholder="20xxxxxxxx" maxlength="10"
                            class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-sm" />
                    </div>
                    <div>
                        <label for="store-email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ອີເມວ</label>
                        <input id="store-email" type="email" bind:value={storeForm.email} placeholder="shop@email.com" class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-sm" />
                    </div>
                </div>
            </div>

            <!-- Section: Owner -->
            <div class="space-y-3">
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 uppercase tracking-wide">
                    <User class="w-4 h-4" />ຂໍ້ມູນເຈົ້າຂອງ
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label for="store-owner-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຊື່ເຈົ້າຂອງ</label>
                        <input id="store-owner-name" type="text" bind:value={storeForm.ownerName} class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-sm" />
                    </div>
                    <div>
                        <label for="store-owner-phone" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເບີໂທ</label>
                        <input id="store-owner-phone" type="tel" bind:value={storeForm.ownerPhone} class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-sm" />
                    </div>
                    <div>
                        <label for="store-owner-email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ອີເມວ</label>
                        <input id="store-owner-email" type="email" bind:value={storeForm.ownerEmail} class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-sm" />
                    </div>
                </div>
            </div>

            <!-- Description -->
            <div>
                <label for="store-description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ລາຍລະອຽດເພີ່ມເຕີມ</label>
                <textarea id="store-description" bind:value={storeForm.description} rows="2" placeholder="ອະທິບາຍທຸລະກິດ..." class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-sm resize-none"></textarea>
            </div>

            <!-- Documents -->
            <div class="space-y-3">
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 uppercase tracking-wide">
                    <FileText class="w-4 h-4" />ເອກະສານຢັ້ງຢືນ
                </h3>
                <div class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors relative">
                    <input type="file" multiple accept="image/*,.pdf" onchange={handleFileUpload} disabled={isUploading} class="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                    {#if isUploading}
                        <Loader2 class="w-8 h-8 text-primary-500 animate-spin mx-auto mb-2" />
                        <p class="text-sm text-gray-500">ກຳລັງອັບໂຫຼດ...</p>
                    {:else}
                        <Plus class="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p class="text-sm text-gray-600 dark:text-gray-300 font-medium">ຄລິກເພື່ອເລືອກໄຟລ໌ ຫຼື ລາກໄຟລ໌ມາໃສ່</p>
                        <p class="text-xs text-gray-500 mt-1">ຮອງຮັບ: ຮູບພາບ ແລະ PDF (ບໍ່ເກີນ 5MB)</p>
                    {/if}
                </div>
                {#if uploadedDocuments.length > 0}
                    <div class="space-y-2 mt-3">
                        {#each uploadedDocuments as doc, i}
                            <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                <div class="flex items-center gap-3 overflow-hidden">
                                    <FileText class="w-5 h-5 text-primary-500 shrink-0" />
                                    <span class="text-sm text-gray-700 dark:text-gray-200 truncate">{doc.name}</span>
                                </div>
                                <button onclick={() => removeDocument(i)} class="p-1.5 hover:bg-danger-100 text-danger-500 rounded-md transition-colors" type="button">
                                    <XCircle class="w-4 h-4" />
                                </button>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
        <div class="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
            <button onclick={() => showFormModal = false} class="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">ຍົກເລີກ</button>
            <button onclick={handleSubmit} disabled={$createRequestMutation.isPending}
                class="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium text-sm disabled:opacity-50">
                {#if $createRequestMutation.isPending}<Loader2 class="w-4 h-4 animate-spin" />ກຳລັງສົ່ງ...
                {:else}<Send class="w-4 h-4" />ສົ່ງຄຳຂໍ{/if}
            </button>
        </div>
    </div>
</div>
{/if}

<!-- ══════════════════════════════════════════════════════════
     NEW BRANCH Modal
══════════════════════════════════════════════════════════ -->
{#if showFormModal && requestType === 'branch'}
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div class="sticky top-0 bg-white dark:bg-gray-800 p-5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 z-10">
            <div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl"><Building2 class="w-5 h-5 text-emerald-600" /></div>
            <div>
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">ຂໍເປີດສາຂາ</h2>
                <p class="text-xs text-gray-500">ສາຂາຂອງຮ້ານທີ່ທ່ານເປັນເຈົ້າຂອງ</p>
            </div>
        </div>
        <div class="p-5 space-y-4">
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label for="branch-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຊື່ສາຂາ <span class="text-danger-500">*</span></label>
                    <input id="branch-name" type="text" bind:value={branchForm.branchName} placeholder="ສາຂາຕົ້ນຕານ" class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 text-sm" />
                </div>
                <div>
                    <label for="branch-code" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ລະຫັດສາຂາ</label>
                    <input id="branch-code" type="text" bind:value={branchForm.branchCode} placeholder="BR001" class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 text-sm" />
                </div>
            </div>
            <!-- Parent Branch Selection -->
            {#if ($branchesQuery.data || []).length > 0}
            <div>
                <label for="parent-branch" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Building2 class="w-3.5 h-3.5 inline -mt-0.5" /> ສາຂາຫຼັກ (ທີ່ຂຶ້ນກັບ)
                </label>
                <select id="parent-branch" bind:value={branchForm.parentBranchId} class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 text-sm">
                    <option value="">ບໍ່ມີ (ສາຂາໃໝ່ເລີຍ)</option>
                    {#each ($branchesQuery.data || []) as branch (branch.id)}
                        <option value={branch.id}>{branch.name} {branch.code ? `(${branch.code})` : ''}</option>
                    {/each}
                </select>
            </div>
            {/if}
            <div>
                <label for="branch-address" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ທີ່ຢູ່ <span class="text-danger-500">*</span></label>
                <textarea id="branch-address" bind:value={branchForm.address} rows="2" placeholder="ທີ່ຢູ່ສາຂາ" class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 text-sm resize-none"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label for="branch-phone" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ເບີໂທ <span class="text-danger-500">*</span></label>
                    <input id="branch-phone" type="tel" inputmode="numeric" bind:value={branchForm.phone}
                        oninput={(e)=>{branchForm.phone=enforcePhoneInput(e.currentTarget.value)}}
                        placeholder="20xxxxxxxx" maxlength="10"
                        class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 text-sm" />
                </div>
                <div>
                    <label for="branch-email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ອີເມວ</label>
                    <input id="branch-email" type="email" bind:value={branchForm.email} placeholder="branch@email.com" class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 text-sm" />
                </div>
            </div>
            <div>
                <label for="branch-description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ລາຍລະອຽດ</label>
                <textarea id="branch-description" bind:value={branchForm.description} rows="2" placeholder="ເຫດຜົນທີ່ຕ້ອງການເປີດສາຂາ..." class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 text-sm resize-none"></textarea>
            </div>

            <!-- Documents -->
            <div class="space-y-3">
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 uppercase tracking-wide">
                    <FileText class="w-4 h-4" />ເອກະສານຢັ້ງຢືນ
                </h3>
                <div class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors relative">
                    <input type="file" multiple accept="image/*,.pdf" onchange={handleFileUpload} disabled={isUploading} class="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                    {#if isUploading}
                        <Loader2 class="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-2" />
                        <p class="text-sm text-gray-500">ກຳລັງອັບໂຫຼດ...</p>
                    {:else}
                        <Plus class="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p class="text-sm text-gray-600 dark:text-gray-300 font-medium">ຄລິກເພື່ອເລືອກໄຟລ໌ ຫຼື ລາກໄຟລ໌ມາໃສ່</p>
                        <p class="text-xs text-gray-500 mt-1">ຮອງຮັບ: ຮູບພາບ ແລະ PDF (ບໍ່ເກີນ 5MB)</p>
                    {/if}
                </div>
                {#if uploadedDocuments.length > 0}
                    <div class="space-y-2 mt-3">
                        {#each uploadedDocuments as doc, i}
                            <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                <div class="flex items-center gap-3 overflow-hidden">
                                    <FileText class="w-5 h-5 text-emerald-500 shrink-0" />
                                    <span class="text-sm text-gray-700 dark:text-gray-200 truncate">{doc.name}</span>
                                </div>
                                <button onclick={() => removeDocument(i)} class="p-1.5 hover:bg-danger-100 text-danger-500 rounded-md transition-colors" type="button">
                                    <XCircle class="w-4 h-4" />
                                </button>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
        <div class="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
            <button onclick={() => showFormModal = false} class="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">ຍົກເລີກ</button>
            <button onclick={handleSubmit} disabled={$createRequestMutation.isPending}
                class="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm disabled:opacity-50">
                {#if $createRequestMutation.isPending}<Loader2 class="w-4 h-4 animate-spin" />ກຳລັງສົ່ງ...
                {:else}<Send class="w-4 h-4" />ສົ່ງຄຳຂໍ{/if}
            </button>
        </div>
    </div>
</div>
{/if}

<!-- Detail Modal -->
{#if showDetailModal && selectedRequest}
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div class="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
            {#if selectedRequest.type === 'new_store'}<Store class="w-5 h-5 text-primary-600" />
            {:else}<Building2 class="w-5 h-5 text-emerald-600" />{/if}
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">ລາຍລະອຽດຄຳຂໍ</h2>
        </div>
        <div class="p-5 space-y-3">
            <div class="flex justify-between items-center">
                <span class="text-sm text-gray-500">ສະຖານະ</span>
                <span class="px-2.5 py-1 rounded-full text-xs font-medium {getStatusColor(selectedRequest.status)}">{getStatusText(selectedRequest.status)}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-sm text-gray-500">ປະເພດ</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{getRequestType(selectedRequest)}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-sm text-gray-500">{selectedRequest.type === 'new_store' ? 'ຊື່ຮ້ານ' : 'ຊື່ສາຂາ'}</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{getRequestDisplayName(selectedRequest)}</span>
            </div>
            {#if selectedRequest.storeAddress || selectedRequest.branchAddress}
            <div class="flex justify-between items-start gap-4">
                <span class="text-sm text-gray-500 shrink-0">ທີ່ຢູ່</span>
                <span class="text-sm text-gray-900 dark:text-white text-right">{selectedRequest.storeAddress || selectedRequest.branchAddress || '—'}</span>
            </div>
            {/if}
            {#if selectedRequest.metadata?.businessType || selectedRequest.businessType}
            <div class="flex justify-between items-center">
                <span class="text-sm text-gray-500">ປະເພດທຸລະກິດ</span>
                <span class="text-sm text-gray-900 dark:text-white">{selectedRequest.metadata?.businessType || selectedRequest.businessType}</span>
            </div>
            {/if}
            {#if selectedRequest.metadata?.taxId}
            <div class="flex justify-between items-center">
                <span class="text-sm text-gray-500">ເລກທີພາສີ</span>
                <span class="text-sm text-gray-900 dark:text-white">{selectedRequest.metadata?.taxId}</span>
            </div>
            {/if}
            {#if selectedRequest.metadata?.ownerName}
            <div class="flex justify-between items-center">
                <span class="text-sm text-gray-500">ເຈົ້າຂອງຮ້ານ</span>
                <span class="text-sm text-gray-900 dark:text-white">{selectedRequest.metadata?.ownerName}</span>
            </div>
            {/if}
            {#if selectedRequest.reason}
            <div class="pt-3 border-t border-gray-200 dark:border-gray-700">
                <p class="text-xs text-gray-500 mb-1.5">ລາຍລະອຽດເພີ່ມເຕີມ:</p>
                <p class="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">{selectedRequest.reason}</p>
            </div>
            {/if}
            <div class="flex justify-between items-center">
                <span class="text-sm text-gray-500">ວັນທີ</span>
                <span class="text-sm text-gray-900 dark:text-white">{formatDate(selectedRequest.createdAt)}</span>
            </div>
            {#if selectedRequest.documents && selectedRequest.documents.length > 0}
            <div class="pt-3 border-t border-gray-200 dark:border-gray-700">
                <p class="text-xs text-gray-500 mb-2">ເອກະສານແນບຕິດ:</p>
                <div class="space-y-2">
                    {#each selectedRequest.documents as docString}
                        {@const doc = typeof docString === 'string' ? JSON.parse(docString) : docString}
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                            <FileText class="w-5 h-5 text-primary-500 shrink-0" />
                            <span class="text-sm text-gray-700 dark:text-gray-200 truncate flex-1">{doc.name || 'ເອກະສານ'}</span>
                            <Eye class="w-4 h-4 text-gray-400 shrink-0" />
                        </a>
                    {/each}
                </div>
            </div>
            {/if}
            {#if selectedRequest.reviewNote}
            <div class="pt-3 border-t border-gray-200 dark:border-gray-700">
                <p class="text-xs text-gray-500 mb-1.5">ບັນທຶກຈາກ Admin:</p>
                <p class="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">{selectedRequest.reviewNote}</p>
            </div>
            {/if}
        </div>
        <div class="p-5 border-t border-gray-200 dark:border-gray-700">
            <button onclick={() => showDetailModal = false} class="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 text-sm">ປິດ</button>
        </div>
    </div>
</div>
{/if}
