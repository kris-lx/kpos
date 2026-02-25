<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import { Loader2, Save, Puzzle, Link, Settings, X, Plus, Key, Eye, EyeOff, Copy, Trash2, Edit, RefreshCw, Shield } from "lucide-svelte";
    const t = i18n.t;

    let activeTab = $state<"services" | "apikeys">("services");

    // Services
    let integrations = $state<any[]>([]);
    let loading = $state(true);
    let showModal = $state(false);
    let selectedIntegration = $state<any>(null);

    // API Keys
    let apiKeys = $state<any[]>([]);
    let apiKeysLoading = $state(false);
    let showKeyModal = $state(false);
    let editingKey = $state<any>(null);
    let showKeyValues = $state<Record<string, boolean>>({});
    let keyForm = $state({ name: "", service: "", apiKey: "", secretKey: "", isActive: true });
    let keySaving = $state(false);

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

    $effect(() => {
        auth.activeStoreId;
        loadIntegrations();
        loadApiKeys();
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
            integrations = [];
        } finally {
            loading = false;
        }
    }

    async function loadApiKeys() {
        apiKeysLoading = true;
        try {
            const res = await api.get("settings/api-keys").json<any>();
            apiKeys = res.data || [];
        } catch (e) {
            console.error("Failed to load API keys:", e);
            apiKeys = [];
        } finally {
            apiKeysLoading = false;
        }
    }

    function openKeyModal(key?: any) {
        if (key) {
            editingKey = key;
            keyForm = { name: key.name, service: key.service, apiKey: key.apiKey, secretKey: key.secretKey || "", isActive: key.isActive };
        } else {
            editingKey = null;
            keyForm = { name: "", service: "", apiKey: "", secretKey: "", isActive: true };
        }
        showKeyModal = true;
    }

    async function saveKey() {
        if (!keyForm.name || !keyForm.apiKey) {
            toast.error("ກະລຸນາປ້ອນຊື່ ແລະ API Key");
            return;
        }
        keySaving = true;
        try {
            if (editingKey) {
                await api.put(`settings/api-keys/${editingKey.id}`, { json: keyForm }).json();
                toast.success(t("integrations.updateSuccess"));
            } else {
                await api.post("settings/api-keys", { json: keyForm }).json();
                toast.success(t("integrations.createSuccess"));
            }
            showKeyModal = false;
            loadApiKeys();
        } catch (e) {
            console.error("Failed to save key:", e);
            toast.error(t("integrations.saveFailed"));
        } finally {
            keySaving = false;
        }
    }

    async function deleteKey(key: any) {
        if (!confirm(t("integrations.confirmDelete"))) return;
        try {
            await api.delete(`settings/api-keys/${key.id}`).json();
            toast.success(t("integrations.deleteSuccess"));
            loadApiKeys();
        } catch (e) {
            toast.error(t("integrations.deleteFailed"));
        }
    }

    function copyKey(value: string) {
        navigator.clipboard.writeText(value);
        toast.success(t("integrations.keyCopied"));
    }

    function toggleShowKey(id: string) {
        showKeyValues = { ...showKeyValues, [id]: !showKeyValues[id] };
    }

    function maskKey(key: string): string {
        if (!key) return "";
        return key.slice(0, 4) + "•".repeat(Math.max(0, key.length - 8)) + key.slice(-4);
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
    <div class="mb-6 flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Puzzle class="w-6 h-6" />
                {t("settings.integrations")}
            </h1>
            <p class="text-gray-500 dark:text-gray-400">{t("integrations.subtitle")}</p>
        </div>
        {#if activeTab === "apikeys"}
            <button
                onclick={() => openKeyModal()}
                class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
            >
                <Plus class="w-4 h-4" />
                {t("integrations.addKey")}
            </button>
        {/if}
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        <button
            onclick={() => (activeTab = "services")}
            class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all {activeTab === 'services' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}"
        >
            <Link class="w-4 h-4" />
            ບໍລິການ
        </button>
        <button
            onclick={() => (activeTab = "apikeys")}
            class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all {activeTab === 'apikeys' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}"
        >
            <Key class="w-4 h-4" />
            API Keys
            {#if apiKeys.length > 0}
                <span class="px-1.5 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-400 rounded-full">{apiKeys.length}</span>
            {/if}
        </button>
    </div>

    <!-- API Keys Tab -->
    {#if activeTab === "apikeys"}
        {#if apiKeysLoading}
            <div class="flex justify-center py-12">
                <Loader2 class="h-8 w-8 animate-spin text-primary-600" />
            </div>
        {:else if apiKeys.length === 0}
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-16 text-center">
                <Shield class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{t("integrations.noKeys")}</h3>
                <p class="text-gray-500 dark:text-gray-400 mt-2 mb-6">ເພີ່ມ API Key ເພື່ອເຊື່ອມຕໍ່ກັບບໍລິການພາຍນອກ</p>
                <button
                    onclick={() => openKeyModal()}
                    class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium mx-auto"
                >
                    <Plus class="w-4 h-4" />
                    {t("integrations.addKey")}
                </button>
            </div>
        {:else}
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                            <th class="px-4 py-3">{t("integrations.keyName")}</th>
                            <th class="px-4 py-3">{t("integrations.service")}</th>
                            <th class="px-4 py-3">{t("integrations.keyValue")}</th>
                            <th class="px-4 py-3">{t("integrations.status")}</th>
                            <th class="px-4 py-3 text-center">{t("common.actions")}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                        {#each apiKeys as key (key.id)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-2">
                                        <Key class="w-4 h-4 text-gray-400" />
                                        <span class="font-medium text-gray-900 dark:text-white">{key.name}</span>
                                    </div>
                                </td>
                                <td class="px-4 py-3 text-gray-600 dark:text-gray-400">{key.service || "-"}</td>
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-2">
                                        <code class="text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                            {showKeyValues[key.id] ? key.apiKey : maskKey(key.apiKey)}
                                        </code>
                                        <button onclick={() => toggleShowKey(key.id)} class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                            {#if showKeyValues[key.id]}
                                                <EyeOff class="w-4 h-4" />
                                            {:else}
                                                <Eye class="w-4 h-4" />
                                            {/if}
                                        </button>
                                        <button onclick={() => copyKey(key.apiKey)} class="text-gray-400 hover:text-primary-600">
                                            <Copy class="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                                <td class="px-4 py-3">
                                    <span class="px-2 py-1 text-xs rounded-full {key.isActive ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}">
                                        {key.isActive ? t("integrations.connected") : t("integrations.disconnected")}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <div class="flex items-center justify-center gap-1">
                                        <button onclick={() => openKeyModal(key)} class="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                            <Edit class="w-4 h-4" />
                                        </button>
                                        <button onclick={() => deleteKey(key)} class="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg">
                                            <Trash2 class="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}

    <!-- Services Tab -->
    {:else}
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
                    {#each integrations.filter((i) => i.connected) as config (config.id)}
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
                {#each availableIntegrations.filter((i) => !isConnected(i.id)) as integration (integration.id)}
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
    {/if}
</div>

{#if showKeyModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Key class="w-5 h-5" />
                    {editingKey ? t("integrations.editKey") : t("integrations.addKey")}
                </h2>
                <button onclick={() => (showKeyModal = false)} class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                    <X class="w-5 h-5 text-gray-500" />
                </button>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label for="key-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("integrations.keyName")} *</label>
                    <input id="key-name" type="text" bind:value={keyForm.name} placeholder="ຊື່ Key" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                    <label for="key-service" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("integrations.service")}</label>
                    <input id="key-service" type="text" bind:value={keyForm.service} placeholder="ເຊັ່ນ: BCEL, LINE, Shopee" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                    <label for="key-apikey" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("integrations.keyValue")} *</label>
                    <input id="key-apikey" type="text" bind:value={keyForm.apiKey} placeholder="API Key" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono" />
                </div>
                <div>
                    <label for="key-secret" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("integrations.keySecret")}</label>
                    <input id="key-secret" type="password" bind:value={keyForm.secretKey} placeholder="Secret Key (ຖ້າມີ)" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono" />
                </div>
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" bind:checked={keyForm.isActive} class="rounded border-gray-300 dark:border-gray-600" />
                    <span class="text-sm text-gray-700 dark:text-gray-300">{t("common.enabled")}</span>
                </label>
            </div>
            <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <button onclick={() => (showKeyModal = false)} class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">
                    {t("common.cancel")}
                </button>
                <button onclick={saveKey} disabled={keySaving} class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50">
                    {#if keySaving}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" />{/if}
                    {t("common.save")}
                </button>
            </div>
        </div>
    </div>
{/if}

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
