<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Loader2, Save, Puzzle, Link, Settings, X } from "lucide-svelte";
    const t = i18n.t;

    let integrations = $state<any[]>([]);
    let loading = $state(true);
    let showModal = $state(false);
    let selectedIntegration = $state<any>(null);

    const availableIntegrations = [
        {
            id: "bcel",
            name: "BCEL One",
            description: "ເຊື່ອມຕໍ່ກັບ BCEL One ເພື່ອຮັບຊຳລະ QR Code",
            icon: "🏦",
            category: "payment",
            status: "available",
        },
        {
            id: "ldb",
            name: "LDB Bank",
            description: "ເຊື່ອມຕໍ່ກັບ LDB Bank ເພື່ອຮັບຊຳລະເງິນ",
            icon: "🏦",
            category: "payment",
            status: "available",
        },
        {
            id: "onepay",
            name: "OnePay",
            description: "ຮັບຊຳລະຜ່ານ OnePay wallet",
            icon: "💳",
            category: "payment",
            status: "coming_soon",
        },
        {
            id: "grab",
            name: "GrabFood",
            description: "ຮັບອໍເດີຈາກ GrabFood ອັດຕະໂນມັດ",
            icon: "🛵",
            category: "delivery",
            status: "coming_soon",
        },
        {
            id: "foodpanda",
            name: "foodpanda",
            description: "ຮັບອໍເດີຈາກ foodpanda ອັດຕະໂນມັດ",
            icon: "🐼",
            category: "delivery",
            status: "coming_soon",
        },
        {
            id: "line",
            name: "LINE Official",
            description: "ສົ່ງການແຈ້ງເຕືອນໃຫ້ລູກຄ້າຜ່ານ LINE",
            icon: "💬",
            category: "messaging",
            status: "available",
        },
        {
            id: "google_sheets",
            name: "Google Sheets",
            description: "ສົ່ງອອກຂໍ້ມູນອັດຕະໂນມັດໄປ Google Sheets",
            icon: "📊",
            category: "reporting",
            status: "available",
        },
        {
            id: "accounting",
            name: "ລະບົບບັນຊີ",
            description: "ເຊື່ອມຕໍ່ກັບລະບົບບັນຊີ",
            icon: "📒",
            category: "accounting",
            status: "available",
        },
    ];

    onMount(() => {
        loadIntegrations();
    });

    async function loadIntegrations() {
        loading = true;
        try {
            const response = await api.get("settings/integrations").json<any>();
            if (response.success) {
                integrations = response.data || [];
            }
        } catch (error) {
            console.error("Failed to load integrations:", error);
            // Sample connected integrations
            integrations = [
                {
                    id: "bcel",
                    connected: true,
                    lastSync: new Date().toISOString(),
                },
            ];
        } finally {
            loading = false;
        }
    }

    function isConnected(integrationId: string): boolean {
        return integrations.some((i) => i.id === integrationId && i.connected);
    }

    function getIntegrationConfig(integrationId: string): any {
        return integrations.find((i) => i.id === integrationId);
    }

    function openConfig(integration: any) {
        selectedIntegration = integration;
        showModal = true;
    }

    async function connect(integrationId: string) {
        try {
            await api.post(`settings/integrations/${integrationId}/connect`).json();
            loadIntegrations();
            toast.success("ເຊື່ອມຕໍ່ສຳເລັດ");
        } catch (error) {
            console.error("Failed to connect:", error);
            toast.error("ເຊື່ອມຕໍ່ບໍ່ສຳເລັດ");
        }
    }

    async function disconnect(integrationId: string) {
        if (!confirm("ຕ້ອງການຍົກເລີກການເຊື່ອມຕໍ່ບໍ?")) return;
        try {
            await api.post(`settings/integrations/${integrationId}/disconnect`).json();
            toast.success("ຍົກເລີກການເຊື່ອມຕໍ່ແລ້ວ");
            loadIntegrations();
        } catch (error) {
            console.error("Failed to disconnect:", error);
            toast.error("ຍົກເລີກການເຊື່ອມຕໍ່ບໍ່ສຳເລັດ");
        }
    }

    function getCategoryLabel(category: string): string {
        const labels: Record<string, string> = {
            payment: "ການຊຳລະເງິນ",
            delivery: "ບໍລິການສົ່ງ",
            messaging: "ການແຈ້ງເຕືອນ",
            reporting: "ລາຍງານ",
            accounting: "ບັນຊີ",
        };
        return labels[category] || category;
    }

    function getCategoryColor(category: string): string {
        const colors: Record<string, string> = {
            payment: "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300",
            delivery: "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300",
            messaging: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300",
            reporting: "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300",
            accounting: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300",
        };
        return colors[category] || "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
    }
</script>

<svelte:head>
    <title>{t("settings.integrations")} - KPOS</title>
</svelte:head>

<div class="p-6">
    <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Puzzle class="w-6 h-6" />
            {t("settings.integrations")}
        </h1>
        <p class="text-gray-500 dark:text-gray-400">ເຊື່ອມຕໍ່ກັບບໍລິການພາຍນອກ</p>
    </div>

    {#if loading}
        <div class="flex justify-center py-12">
            <Loader2 class="h-8 w-8 animate-spin text-primary-600" />
        </div>
    {:else}
        <!-- Connected Integrations -->
        {#if integrations.length > 0}
            <div class="mb-8">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Link class="w-5 h-5" />
                    ເຊື່ອມຕໍ່ແລ້ວ
                </h2>
                <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {#each integrations.filter((i) => i.connected) as config}
                        {@const integration = availableIntegrations.find(
                            (a) => a.id === config.id,
                        )}
                        {#if integration}
                            <div
                                class="bg-white dark:bg-gray-800 rounded-lg border-2 border-green-200 dark:border-green-800 p-4"
                            >
                                <div class="flex items-start justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="text-3xl">
                                            {integration.icon}
                                        </div>
                                        <div>
                                            <h3
                                                class="font-medium text-gray-900 dark:text-white"
                                            >
                                                {integration.name}
                                            </h3>
                                            <span class="text-xs text-green-600 dark:text-green-400"
                                                >● ເຊື່ອມຕໍ່ແລ້ວ</span
                                            >
                                        </div>
                                    </div>
                                </div>
                                <div class="mt-3 text-xs text-gray-500 dark:text-gray-400">
                                    ຊິງຄ໌ລ່າສຸດ: {new Date(
                                        config.lastSync,
                                    ).toLocaleString("lo-LA")}
                                </div>
                                <div class="mt-3 flex gap-2">
                                    <button
                                        onclick={() => openConfig(integration)}
                                        class="px-3 py-1 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded flex items-center gap-1"
                                    >
                                        <Settings class="w-3 h-3" />
                                        ຕັ້ງຄ່າ
                                    </button>
                                    <button
                                        onclick={() =>
                                            disconnect(integration.id)}
                                        class="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded flex items-center gap-1"
                                    >
                                        <X class="w-3 h-3" />
                                        ຍົກເລີກ
                                    </button>
                                </div>
                            </div>
                        {/if}
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Available Integrations -->
        <div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Puzzle class="w-5 h-5" />
                ບໍລິການທີ່ສາມາດເຊື່ອມຕໍ່ໄດ້
            </h2>
            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {#each availableIntegrations.filter((i) => !isConnected(i.id)) as integration}
                    <div
                        class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow {integration.status ===
                        'coming_soon'
                            ? 'opacity-60'
                            : ''}"
                    >
                        <div class="flex items-start justify-between">
                            <div class="flex items-center gap-3">
                                <div class="text-3xl">{integration.icon}</div>
                                <div>
                                    <h3 class="font-medium text-gray-900 dark:text-white">
                                        {integration.name}
                                    </h3>
                                    <span
                                        class="px-2 py-0.5 text-xs rounded {getCategoryColor(
                                            integration.category,
                                        )}"
                                    >
                                        {getCategoryLabel(integration.category)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <p class="mt-3 text-sm text-gray-600 dark:text-gray-400">
                            {integration.description}
                        </p>
                        <div class="mt-4">
                            {#if integration.status === "coming_soon"}
                                <span
                                    class="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded"
                                    >ເລິ່ມໃຊ້ໄດ້ໄວໆນີ້</span
                                >
                            {:else}
                                <button
                                    onclick={() => connect(integration.id)}
                                    class="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                >
                                    ເຊື່ອມຕໍ່
                                </button>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>

{#if showModal && selectedIntegration}
    <div
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <div class="flex items-center gap-3 mb-4">
                <div class="text-3xl">{selectedIntegration.icon}</div>
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">{selectedIntegration.name}</h2>
            </div>
            <p class="text-gray-600 dark:text-gray-400 mb-6">{selectedIntegration.description}</p>

            <div class="space-y-4">
                {#if selectedIntegration.id === "bcel"}
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >Merchant ID</label
                        >
                        <input
                            type="text"
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            placeholder="BCEL Merchant ID"
                        />
                    </div>
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >API Key</label
                        >
                        <input
                            type="password"
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            placeholder="API Key"
                        />
                    </div>
                {:else if selectedIntegration.id === "line"}
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >Channel Access Token</label
                        >
                        <textarea
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            rows="3"
                            placeholder="LINE Channel Access Token"
                        ></textarea>
                    </div>
                {:else if selectedIntegration.id === "google_sheets"}
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >Spreadsheet ID</label
                        >
                        <input
                            type="text"
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            placeholder="Google Sheets ID"
                        />
                    </div>
                {:else}
                    <p class="text-gray-500 dark:text-gray-400">ການຕັ້ງຄ່າສຳລັບບໍລິການນີ້</p>
                {/if}
            </div>

            <div class="flex justify-end gap-3 mt-6">
                <button
                    onclick={() => (showModal = false)}
                    class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                    ປິດ
                </button>
                <button
                    class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
                >
                    <Save class="w-4 h-4" />
                    ບັນທຶກ
                </button>
            </div>
        </div>
    </div>
{/if}
