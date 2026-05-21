<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import { Plus, Loader2, X, CreditCard, Wallet, Edit, AlertCircle, RefreshCw } from "lucide-svelte";
    const t = i18n.t;

    let paymentMethods = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showModal = $state(false);
    let editingMethod = $state<any>(null);
    let formData = $state({
        name: "",
        code: "",
        type: "cash",
        isActive: true,
        isDefault: false,
        icon: "banknotes",
        settings: {
            requireReference: false,
            requireApproval: false,
            processingFee: 0,
            minAmount: 0,
            maxAmount: 0,
        },
    });

    const defaultPaymentTypes = [
        { value: "cash", label: "ເງິນສົດ" },
        { value: "card", label: "ບັດເຄຣດິດ/ເດບິດ" },
        { value: "qr", label: "QR Code" },
        { value: "bank_transfer", label: "ໂອນເງິນ" },
        { value: "ewallet", label: "E-Wallet" },
        { value: "credit", label: "ສິນເຊື່ອ" },
    ];
    let paymentTypes = $state(defaultPaymentTypes);

    async function loadPaymentTypes() {
        try {
            const res = await api.get('settings/enums?type=payment_method').json<any>();
            if (res.data?.payment_method?.length) {
                paymentTypes = res.data.payment_method.map((e: any) => ({ value: e.value, label: e.labelLao || e.label }));
            }
        } catch { /* keep defaults */ }
    }

    $effect(() => {
        auth.activeStoreId;
        loadPaymentMethods();
    });

    onMount(() => {
        loadPaymentTypes();
    });

    async function loadPaymentMethods() {
        loading = true;
        error = null;
        try {
            const response = await api
                .get("payments/methods")
                .json<any>();
            if (response.success) {
                paymentMethods = response.data || [];
            } else {
                throw new Error(response.message || "Failed to load payment methods");
            }
        } catch (err) {
            console.error("Failed to load payment methods:", err);
            paymentMethods = [];
            error = "ບໍ່ສາມາດໂຫລດຂໍ້ມູນວິທີການຊຳລະໄດ້";
            toast.error("ບໍ່ສາມາດໂຫລດຂໍ້ມູນວິທີການຊຳລະໄດ້");
        } finally {
            loading = false;
        }
    }

    function openModal(method?: any) {
        if (method) {
            editingMethod = method;
            formData = { ...method };
        } else {
            editingMethod = null;
            formData = {
                name: "",
                code: "",
                type: "cash",
                isActive: true,
                isDefault: false,
                icon: "banknotes",
                settings: {
                    requireReference: false,
                    requireApproval: false,
                    processingFee: 0,
                    minAmount: 0,
                    maxAmount: 0,
                },
            };
        }
        showModal = true;
    }

    async function saveMethod() {
        try {
            if (editingMethod) {
                await api.put(`payments/methods/${editingMethod.id}`, {
                    json: formData,
                }).json();
                toast.success("ແກ້ໄຂວິທີການຊຳລະສຳເລັດ");
            } else {
                await api.post("payments/methods", { json: formData }).json();
                toast.success("ເພີ່ມວິທີການຊຳລະສຳເລັດ");
            }
            showModal = false;
            loadPaymentMethods();
        } catch (error) {
            console.error("Failed to save payment method:", error);
            toast.error("ບັນທຶກບໍ່ສຳເລັດ");
        }
    }

    async function toggleActive(method: any) {
        try {
            await api.put(`payments/methods/${method.id}`, {
                json: { ...method, isActive: !method.isActive },
            }).json();
            toast.success(method.isActive ? "ປິດໃຊ້ງານແລ້ວ" : "ເປີດໃຊ້ງານແລ້ວ");
            loadPaymentMethods();
        } catch (error) {
            console.error("Failed to toggle payment method:", error);
            toast.error("ປ່ຽນສະຖານະບໍ່ສຳເລັດ");
        }
    }

    async function setDefault(method: any) {
        try {
            await api.put(`payments/methods/${method.id}`, { json: { isDefault: true } }).json();
            toast.success("ຕັ້ງເປັນຄ່າເລີ່ມຕົ້ນແລ້ວ");
            loadPaymentMethods();
        } catch (error) {
            console.error("Failed to set default:", error);
            toast.error("ຕັ້ງຄ່າເລີ່ມຕົ້ນບໍ່ສຳເລັດ");
        }
    }

    function getTypeColor(type: string): string {
        const colors: Record<string, string> = {
            cash: "bg-success-100 dark:bg-success-900/50 text-success-700 dark:text-success-300",
            card: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300",
            qr: "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300",
            bank_transfer: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300",
            ewallet: "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300",
            credit: "bg-danger-100 dark:bg-danger-900/50 text-danger-700 dark:text-danger-300",
        };
        return colors[type] || "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
    }
</script>

<svelte:head>
    <title>{t("settings.payments")} - KPOS</title>
</svelte:head>

<div class="p-6">
    <div class="flex justify-between items-center mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CreditCard class="w-6 h-6 text-primary-600" />
                {t("settings.payments")}
            </h1>
            <p class="text-gray-500 dark:text-gray-400">ຕັ້ງຄ່າວິທີການຊຳລະເງິນ</p>
        </div>
        <button
            onclick={() => openModal()}
            class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
        >
            <Plus class="w-4 h-4" />
            ເພີ່ມວິທີການຊຳລະ
        </button>
    </div>

    {#if loading}
        <div class="flex justify-center py-12">
            <Loader2 class="h-8 w-8 animate-spin text-primary-600" />
        </div>
    {:else if error}
        <div class="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle class="h-12 w-12 text-danger-500 mb-4" />
            <p class="text-danger-600 dark:text-danger-400 mb-4">{error}</p>
            <button
                onclick={() => loadPaymentMethods()}
                class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
            >
                <RefreshCw class="w-4 h-4" />
                ລອງໃໝ່
            </button>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each paymentMethods as method (method.id)}
                <div
                    class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
                >
                    <div class="flex items-start justify-between">
                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center"
                            >
                                <Wallet class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            </div>
                            <div>
                                <h3 class="font-medium text-gray-900 dark:text-white">
                                    {method.name}
                                </h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                    {method.code}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            {#if method.isDefault}
                                <span
                                    class="px-2 py-1 text-xs bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded"
                                    >ຄ່າເລີ່ມຕົ້ນ</span
                                >
                            {/if}
                            <button
                                onclick={() => toggleActive(method)}
                                class="w-10 h-6 rounded-full transition-colors {method.isActive
                                    ? 'bg-success-500'
                                    : 'bg-gray-300 dark:bg-gray-600'}"
                            >
                                <div
                                    class="w-4 h-4 rounded-full bg-white shadow transform transition-transform {method.isActive
                                        ? 'translate-x-5'
                                        : 'translate-x-1'}"
                                ></div>
                            </button>
                        </div>
                    </div>
                    <div class="mt-3 flex items-center gap-2">
                        <span
                            class="px-2 py-1 text-xs rounded {getTypeColor(
                                method.type,
                            )}"
                        >
                            {paymentTypes.find((t) => t.value === method.type)
                                ?.label || method.type}
                        </span>
                    </div>
                    <div class="mt-4 flex gap-2">
                        <button
                            onclick={() => openModal(method)}
                            class="px-3 py-1 text-sm text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded flex items-center gap-1"
                        >
                            <Edit class="w-3 h-3" />
                            ແກ້ໄຂ
                        </button>
                        {#if !method.isDefault}
                            <button
                                onclick={() => setDefault(method)}
                                class="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                            >
                                ຕັ້ງເປັນຄ່າເລີ່ມຕົ້ນ
                            </button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

{#if showModal}
    <div
        class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
    >
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {editingMethod ? "ແກ້ໄຂວິທີການຊຳລະ" : "ເພີ່ມວິທີການຊຳລະ"}
                </h2>
                <button onclick={() => (showModal = false)} class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <X class="w-5 h-5" />
                </button>
            </div>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >ຊື່</label
                    >
                    <input
                        type="text"
                        bind:value={formData.name}
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >ລະຫັດ</label
                    >
                    <input
                        type="text"
                        bind:value={formData.code}
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >ປະເພດ</label
                    >
                    <select
                        bind:value={formData.type}
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        {#each paymentTypes as type (type.value)}
                            <option value={type.value}>{type.label}</option>
                        {/each}
                    </select>
                </div>
                <div class="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="isActive"
                        bind:checked={formData.isActive}
                        class="rounded border-gray-300 dark:border-gray-600"
                    />
                    <label for="isActive" class="text-sm text-gray-700 dark:text-gray-300"
                        >ເປີດໃຊ້ງານ</label
                    >
                </div>
            </div>
            <div class="flex justify-end gap-3 mt-6">
                <button
                    onclick={() => (showModal = false)}
                    class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                    ຍົກເລີກ
                </button>
                <button
                    onclick={saveMethod}
                    class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                    ບັນທຶກ
                </button>
            </div>
        </div>
    </div>
{/if}
