<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import { Loader2, Save, Puzzle, Link, Settings, X, Plus, Key, Eye, EyeOff, Copy, Trash2, Edit, RefreshCw, Shield, Mail, Send, FileText, History, CheckCircle2, XCircle } from "lucide-svelte";
    const t = i18n.t;

    let activeTab = $state<"services" | "apikeys" | "email">("services");

    // Email providers
    type EmailProviderType = "smtp" | "brevo" | "sendgrid" | "mailgun";
    let emailProviders = $state<any[]>([]);
    let emailProvidersLoading = $state(false);
    let showEmailModal = $state(false);
    let editingEmailProvider = $state<any>(null);
    let emailSaving = $state(false);
    let emailForm = $state<{ name: string; type: EmailProviderType; isActive: boolean; isDefault: boolean; config: Record<string, any> }>({
        name: "", type: "smtp", isActive: true, isDefault: false, config: {},
    });
    let testingProviderId = $state<string | null>(null);
    let testEmailAddress = $state("");

    // Email templates
    let emailTemplates = $state<any[]>([]);
    let emailTemplatesLoading = $state(false);
    let editingTemplate = $state<any>(null);
    let templateForm = $state({ subject: "", htmlBody: "" });
    let templateSaving = $state(false);

    // Email logs
    let emailLogs = $state<any[]>([]);
    let emailLogsLoading = $state(false);
    let emailSubTab = $state<"providers" | "templates" | "logs">("providers");

    const EMAIL_FIELD_DEFS: Record<EmailProviderType, { key: string; label: string; type?: string; placeholder?: string }[]> = {
        smtp: [
            { key: "host", label: "SMTP Host", placeholder: "smtp.example.com" },
            { key: "port", label: "Port", type: "number", placeholder: "587" },
            { key: "user", label: "Username" },
            { key: "pass", label: "Password", type: "password" },
            { key: "from", label: "From Email", placeholder: "noreply@yourstore.com" },
            { key: "fromName", label: "From Name", placeholder: "KPOS" },
        ],
        brevo: [
            { key: "apiKey", label: "Brevo API Key", type: "password" },
            { key: "from", label: "From Email" },
            { key: "fromName", label: "From Name", placeholder: "KPOS" },
        ],
        sendgrid: [
            { key: "apiKey", label: "SendGrid API Key", type: "password" },
            { key: "from", label: "From Email" },
            { key: "fromName", label: "From Name", placeholder: "KPOS" },
        ],
        mailgun: [
            { key: "apiKey", label: "Mailgun API Key", type: "password" },
            { key: "domain", label: "Domain", placeholder: "mg.yourstore.com" },
            { key: "from", label: "From Email" },
            { key: "fromName", label: "From Name", placeholder: "KPOS" },
        ],
    };

    async function loadEmailProviders() {
        emailProvidersLoading = true;
        try {
            const res = await api.get("settings/email").json<any>();
            emailProviders = res.data || [];
        } catch (e) {
            console.error("Failed to load email providers:", e);
            emailProviders = [];
        } finally {
            emailProvidersLoading = false;
        }
    }

    async function loadEmailTemplates() {
        emailTemplatesLoading = true;
        try {
            const res = await api.get("settings/email/templates").json<any>();
            emailTemplates = res.data || [];
        } catch (e) {
            console.error("Failed to load email templates:", e);
            emailTemplates = [];
        } finally {
            emailTemplatesLoading = false;
        }
    }

    async function loadEmailLogs() {
        emailLogsLoading = true;
        try {
            const res = await api.get("settings/email/logs").json<any>();
            emailLogs = res.data || [];
        } catch (e) {
            console.error("Failed to load email logs:", e);
            emailLogs = [];
        } finally {
            emailLogsLoading = false;
        }
    }

    function openEmailModal(provider?: any) {
        if (provider) {
            editingEmailProvider = provider;
            emailForm = { name: provider.name, type: provider.type, isActive: provider.isActive, isDefault: provider.isDefault, config: {} };
        } else {
            editingEmailProvider = null;
            emailForm = { name: "", type: "smtp", isActive: true, isDefault: false, config: {} };
        }
        showEmailModal = true;
    }

    async function saveEmailProvider() {
        if (!emailForm.name) {
            toast.error("ກະລຸນາປ້ອນຊື່");
            return;
        }
        emailSaving = true;
        try {
            const payload = { name: emailForm.name, type: emailForm.type, isActive: emailForm.isActive, isDefault: emailForm.isDefault, config: emailForm.config };
            if (editingEmailProvider) {
                await api.put(`settings/email/${editingEmailProvider.id}`, { json: payload }).json();
            } else {
                await api.post("settings/email", { json: payload }).json();
            }
            toast.success("ບັນທຶກແລ້ວ");
            showEmailModal = false;
            loadEmailProviders();
        } catch (e) {
            console.error("Failed to save email provider:", e);
            toast.error("ບັນທຶກບໍ່ສຳເລັດ");
        } finally {
            emailSaving = false;
        }
    }

    async function deleteEmailProvider(provider: any) {
        if (!confirm("ຕ້ອງການລຶບ email provider ນີ້ບໍ?")) return;
        try {
            await api.delete(`settings/email/${provider.id}`).json();
            toast.success("ລຶບແລ້ວ");
            loadEmailProviders();
        } catch (e) {
            toast.error("ລຶບບໍ່ສຳເລັດ");
        }
    }

    async function testEmailProvider(provider: any) {
        testingProviderId = provider.id;
        try {
            const body = testEmailAddress ? { testEmail: testEmailAddress } : {};
            await api.post(`settings/email/${provider.id}/test`, { json: body }).json();
            toast.success(testEmailAddress ? "ເຊື່ອມຕໍ່ສຳເລັດ ແລະ ສົ່ງອີເມວທົດສອບແລ້ວ" : "ເຊື່ອມຕໍ່ສຳເລັດ");
        } catch (e: any) {
            console.error("Email test failed:", e);
            toast.error("ການທົດສອບບໍ່ສຳເລັດ — ກວດສອບ credentials");
        } finally {
            testingProviderId = null;
        }
    }

    function openTemplateEditor(template: any) {
        editingTemplate = template;
        templateForm = { subject: template.subject, htmlBody: template.htmlBody };
    }

    async function saveTemplate() {
        if (!editingTemplate) return;
        templateSaving = true;
        try {
            await api.put(`settings/email/templates/${editingTemplate.key}`, { json: templateForm }).json();
            toast.success("ບັນທຶກແມ່ແບບແລ້ວ");
            editingTemplate = null;
            loadEmailTemplates();
        } catch (e) {
            toast.error("ບັນທຶກບໍ່ສຳເລັດ");
        } finally {
            templateSaving = false;
        }
    }

    $effect(() => {
        if (activeTab === "email") {
            if (emailSubTab === "providers") loadEmailProviders();
            else if (emailSubTab === "templates") loadEmailTemplates();
            else if (emailSubTab === "logs") loadEmailLogs();
        }
    });

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
            payment: "bg-success-100 dark:bg-success-900/50 text-success-700 dark:text-success-300",
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
        <button
            onclick={() => (activeTab = "email")}
            class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all {activeTab === 'email' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}"
        >
            <Mail class="w-4 h-4" />
            Email
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
                                    <span class="px-2 py-1 text-xs rounded-full {key.isActive ? 'bg-success-100 dark:bg-success-900/50 text-success-700 dark:text-success-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}">
                                        {key.isActive ? t("integrations.connected") : t("integrations.disconnected")}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <div class="flex items-center justify-center gap-1">
                                        <button onclick={() => openKeyModal(key)} class="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                            <Edit class="w-4 h-4" />
                                        </button>
                                        <button onclick={() => deleteKey(key)} class="p-1.5 text-danger-500 hover:bg-danger-100 dark:hover:bg-danger-900/30 rounded-lg">
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

    <!-- Email Tab -->
    {:else if activeTab === "email"}
        <div class="flex gap-1 mb-6 bg-gray-50 dark:bg-gray-800/50 p-1 rounded-lg w-fit border border-gray-200 dark:border-gray-700">
            <button onclick={() => (emailSubTab = "providers")} class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all {emailSubTab === 'providers' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}">
                <Send class="w-3.5 h-3.5" /> Providers
            </button>
            <button onclick={() => (emailSubTab = "templates")} class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all {emailSubTab === 'templates' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}">
                <FileText class="w-3.5 h-3.5" /> Templates
            </button>
            <button onclick={() => (emailSubTab = "logs")} class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all {emailSubTab === 'logs' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}">
                <History class="w-3.5 h-3.5" /> Log
            </button>
        </div>

        {#if emailSubTab === "providers"}
            <div class="mb-4 flex justify-end">
                <button onclick={() => openEmailModal()} class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
                    <Plus class="w-4 h-4" /> Add Provider
                </button>
            </div>
            {#if emailProvidersLoading}
                <div class="flex justify-center py-12"><Loader2 class="h-8 w-8 animate-spin text-primary-600" /></div>
            {:else if emailProviders.length === 0}
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-16 text-center">
                    <Mail class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">No email provider configured</h3>
                    <p class="text-gray-500 dark:text-gray-400 mt-2 mb-6">Add SMTP, Brevo, SendGrid, or Mailgun to send password resets, receipts, and alerts from your own address.</p>
                    <button onclick={() => openEmailModal()} class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium mx-auto">
                        <Plus class="w-4 h-4" /> Add Provider
                    </button>
                </div>
            {:else}
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table class="w-full">
                        <thead class="bg-gray-50 dark:bg-gray-700/50">
                            <tr class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                                <th class="px-4 py-3">Name</th>
                                <th class="px-4 py-3">Type</th>
                                <th class="px-4 py-3">Status</th>
                                <th class="px-4 py-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                            {#each emailProviders as provider (provider.id)}
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td class="px-4 py-3">
                                        <div class="flex items-center gap-2">
                                            <span class="font-medium text-gray-900 dark:text-white">{provider.name}</span>
                                            {#if provider.isDefault}<span class="px-1.5 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-400 rounded-full">default</span>{/if}
                                        </div>
                                    </td>
                                    <td class="px-4 py-3 text-gray-600 dark:text-gray-400 uppercase text-xs font-mono">{provider.type}</td>
                                    <td class="px-4 py-3">
                                        <span class="px-2 py-1 text-xs rounded-full {provider.isActive ? 'bg-success-100 dark:bg-success-900/50 text-success-700 dark:text-success-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}">
                                            {provider.isActive ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <div class="flex items-center justify-center gap-1">
                                            <button onclick={() => testEmailProvider(provider)} disabled={testingProviderId === provider.id} class="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50" title="Test Connection">
                                                {#if testingProviderId === provider.id}<Loader2 class="w-4 h-4 animate-spin" />{:else}<RefreshCw class="w-4 h-4" />{/if}
                                            </button>
                                            <button onclick={() => openEmailModal(provider)} class="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Edit">
                                                <Edit class="w-4 h-4" />
                                            </button>
                                            <button onclick={() => deleteEmailProvider(provider)} class="p-1.5 text-danger-500 hover:bg-danger-100 dark:hover:bg-danger-900/30 rounded-lg" title="Delete">
                                                <Trash2 class="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
                <div class="mt-4 flex items-center gap-2 max-w-sm">
                    <input type="email" bind:value={testEmailAddress} placeholder="test@example.com (optional, for test send)"
                        class="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
            {/if}
        {:else if emailSubTab === "templates"}
            {#if emailTemplatesLoading}
                <div class="flex justify-center py-12"><Loader2 class="h-8 w-8 animate-spin text-primary-600" /></div>
            {:else}
                <div class="grid gap-4 md:grid-cols-2">
                    {#each emailTemplates as template (template.key)}
                        <button onclick={() => openTemplateEditor(template)} class="text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
                            <div class="flex items-center gap-2 mb-1">
                                <FileText class="w-4 h-4 text-gray-400" />
                                <span class="font-medium text-gray-900 dark:text-white font-mono text-sm">{template.key}</span>
                                {#if !template.tenantId}<span class="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full">system default</span>{/if}
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400 truncate">{template.subject}</p>
                        </button>
                    {/each}
                </div>
            {/if}
        {:else if emailSubTab === "logs"}
            {#if emailLogsLoading}
                <div class="flex justify-center py-12"><Loader2 class="h-8 w-8 animate-spin text-primary-600" /></div>
            {:else if emailLogs.length === 0}
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-16 text-center text-gray-500 dark:text-gray-400">
                    No email activity yet.
                </div>
            {:else}
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table class="w-full">
                        <thead class="bg-gray-50 dark:bg-gray-700/50">
                            <tr class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                                <th class="px-4 py-3">To</th>
                                <th class="px-4 py-3">Template</th>
                                <th class="px-4 py-3">Status</th>
                                <th class="px-4 py-3">Sent</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                            {#each emailLogs as log (log.id)}
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td class="px-4 py-3 text-gray-700 dark:text-gray-300">{log.toEmail}</td>
                                    <td class="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{log.templateKey || "-"}</td>
                                    <td class="px-4 py-3">
                                        <span class="flex items-center gap-1 text-xs {log.status === 'sent' ? 'text-success-600 dark:text-success-400' : log.status === 'failed' ? 'text-danger-600 dark:text-danger-400' : 'text-gray-500'}">
                                            {#if log.status === "sent"}<CheckCircle2 class="w-3.5 h-3.5" />{:else if log.status === "failed"}<XCircle class="w-3.5 h-3.5" />{/if}
                                            {log.status}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{new Date(log.sentAt).toLocaleString()}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
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
                                class="bg-white dark:bg-gray-800 rounded-lg border-2 border-success-200 dark:border-success-800 p-4"
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
                                            <span class="text-xs text-success-600 dark:text-success-400"
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
                                        class="px-3 py-1 text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded flex items-center gap-1"
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
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700">
            <!-- Header -->
            <div class="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-primary-100 dark:bg-primary-900/50 rounded-xl">
                        <Key class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                        <h2 class="text-base font-bold text-gray-900 dark:text-white">
                            {editingKey ? t("integrations.editKey") : t("integrations.addKey")}
                        </h2>
                        <p class="text-xs text-gray-500 dark:text-gray-400">ຈັດການ credentials ສຳລັບບໍລິການພາຍນອກ</p>
                    </div>
                </div>
                <button onclick={() => (showKeyModal = false)} class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                    <X class="w-4 h-4 text-gray-500" />
                </button>
            </div>

            <!-- Security banner -->
            <div class="mx-6 mt-5 flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                <Shield class="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p class="text-xs text-amber-700 dark:text-amber-300">API Keys ຖືກເຂົ້າລະຫັດກ່ອນເກັບໄວ້. ຢ່າແບ່ງປັນ credentials ກັບຜູ້ອື່ນ.</p>
            </div>

            <div class="px-6 py-5 space-y-4">
                <!-- Name + Service row -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="key-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("integrations.keyName")} <span class="text-danger-500">*</span>
                        </label>
                        <input id="key-name" type="text" bind:value={keyForm.name} placeholder="ເຊັ່ນ: BCEL Production"
                            class="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" />
                    </div>
                    <div>
                        <label for="key-service" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {t("integrations.service")}
                        </label>
                        <select id="key-service" bind:value={keyForm.service}
                            class="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
                            <option value="">-- ເລືອກ --</option>
                            <option value="BCEL">BCEL One</option>
                            <option value="LDB">LDB Bank</option>
                            <option value="OnePay">OnePay</option>
                            <option value="LINE">LINE Official</option>
                            <option value="GrabFood">GrabFood</option>
                            <option value="Google Sheets">Google Sheets</option>
                            <option value="other">ອື່ນໆ</option>
                        </select>
                    </div>
                </div>

                <!-- API Key -->
                <div>
                    <label for="key-apikey" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("integrations.keyValue")} <span class="text-danger-500">*</span>
                    </label>
                    <div class="relative">
                        <input id="key-apikey" type="text" bind:value={keyForm.apiKey} placeholder="sk_live_xxxxxxxxxx"
                            class="w-full pl-3 pr-10 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" />
                        {#if keyForm.apiKey}
                            <button onclick={() => copyKey(keyForm.apiKey)} class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary-600 transition-colors" title="ຄັດລອກ">
                                <Copy class="w-4 h-4" />
                            </button>
                        {/if}
                    </div>
                </div>

                <!-- Secret Key -->
                <div>
                    <label for="key-secret" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {t("integrations.keySecret")}
                        <span class="ml-1 text-xs text-gray-400">(optional)</span>
                    </label>
                    <input id="key-secret" type="password" bind:value={keyForm.secretKey} placeholder="Secret / Client Secret"
                        class="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all" />
                </div>

                <!-- Status toggle -->
                <div class="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <div>
                        <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("common.enabled")}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">ໃຊ້ API Key ນີ້ສຳລັບການເຊື່ອມຕໍ່</p>
                    </div>
                    <button
                        aria-label={keyForm.isActive ? "Disable API key" : "Enable API key"}
                        onclick={() => (keyForm.isActive = !keyForm.isActive)}
                        class="relative w-11 h-6 rounded-full transition-colors {keyForm.isActive ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}"
                    >
                        <span class="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform {keyForm.isActive ? 'translate-x-6' : 'translate-x-1'}"></span>
                    </button>
                </div>
            </div>

            <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
                <button onclick={() => (showKeyModal = false)} class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-sm font-medium transition-colors">
                    {t("common.cancel")}
                </button>
                <button onclick={saveKey} disabled={keySaving || !keyForm.name || !keyForm.apiKey}
                    class="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
                    {#if keySaving}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" />{/if}
                    {t("common.save")}
                </button>
            </div>
        </div>
    </div>
{/if}

{#if showEmailModal}
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-primary-100 dark:bg-primary-900/50 rounded-xl">
                        <Mail class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <h2 class="text-base font-bold text-gray-900 dark:text-white">
                        {editingEmailProvider ? "Edit Email Provider" : "Add Email Provider"}
                    </h2>
                </div>
                <button onclick={() => (showEmailModal = false)} class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                    <X class="w-4 h-4 text-gray-500" />
                </button>
            </div>

            <div class="px-6 py-5 space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="email-provider-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name</label>
                        <input id="email-provider-name" type="text" bind:value={emailForm.name} placeholder="Production SMTP"
                            class="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                    </div>
                    <div>
                        <label for="email-provider-type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Type</label>
                        <select id="email-provider-type" bind:value={emailForm.type} disabled={!!editingEmailProvider}
                            class="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 outline-none disabled:opacity-60">
                            <option value="smtp">SMTP</option>
                            <option value="brevo">Brevo</option>
                            <option value="sendgrid">SendGrid</option>
                            <option value="mailgun">Mailgun</option>
                        </select>
                    </div>
                </div>

                {#if editingEmailProvider}
                    <div class="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                        <Shield class="w-4 h-4 mt-0.5 shrink-0" />
                        Stored credentials are never sent back to the browser. Leave fields blank to keep the current value, or fill them in to replace it.
                    </div>
                {/if}

                {#each EMAIL_FIELD_DEFS[emailForm.type] as field (field.key)}
                    <div>
                        <label for="email-field-{field.key}" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{field.label}</label>
                        <input id="email-field-{field.key}" type={field.type || "text"} placeholder={field.placeholder}
                            value={emailForm.config[field.key] ?? ""}
                            oninput={(e) => (emailForm.config[field.key] = (e.target as HTMLInputElement).value)}
                            class="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-primary-500 outline-none" />
                    </div>
                {/each}

                <div class="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("common.enabled")}</p>
                    <button aria-label="toggle active" onclick={() => (emailForm.isActive = !emailForm.isActive)}
                        class="relative w-11 h-6 rounded-full transition-colors {emailForm.isActive ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}">
                        <span class="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform {emailForm.isActive ? 'translate-x-6' : 'translate-x-1'}"></span>
                    </button>
                </div>
                <div class="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Default provider</p>
                    <button aria-label="toggle default" onclick={() => (emailForm.isDefault = !emailForm.isDefault)}
                        class="relative w-11 h-6 rounded-full transition-colors {emailForm.isDefault ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}">
                        <span class="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform {emailForm.isDefault ? 'translate-x-6' : 'translate-x-1'}"></span>
                    </button>
                </div>
            </div>

            <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
                <button onclick={() => (showEmailModal = false)} class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-sm font-medium">
                    {t("common.cancel")}
                </button>
                <button onclick={saveEmailProvider} disabled={emailSaving || !emailForm.name}
                    class="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 text-sm font-semibold disabled:opacity-50">
                    {#if emailSaving}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" />{/if}
                    {t("common.save")}
                </button>
            </div>
        </div>
    </div>
{/if}

{#if editingTemplate}
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-base font-bold text-gray-900 dark:text-white font-mono">{editingTemplate.key}</h2>
                <button onclick={() => (editingTemplate = null)} class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">
                    <X class="w-4 h-4 text-gray-500" />
                </button>
            </div>
            <div class="px-6 py-5 space-y-4">
                <div>
                    <label for="template-subject" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Subject</label>
                    <input id="template-subject" type="text" bind:value={templateForm.subject}
                        class="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
                <div>
                    <label for="template-body" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        HTML Body
                        <span class="ml-1 text-xs text-gray-400 font-normal">Use {"{{"}variableName{"}}"} for placeholders, e.g. {"{{"}name{"}}"}, {"{{"}resetUrl{"}}"}</span>
                    </label>
                    <textarea id="template-body" bind:value={templateForm.htmlBody} rows="12"
                        class="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-primary-500 outline-none"></textarea>
                </div>
            </div>
            <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
                <button onclick={() => (editingTemplate = null)} class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-sm font-medium">
                    {t("common.cancel")}
                </button>
                <button onclick={saveTemplate} disabled={templateSaving}
                    class="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 text-sm font-semibold disabled:opacity-50">
                    {#if templateSaving}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" />{/if}
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
                        <label for="a11y-app-settings-integrations-page-svelte-1001"
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >Merchant ID</label>
                        <input id="a11y-app-settings-integrations-page-svelte-1001"
                            type="text"
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            placeholder="BCEL Merchant ID"
                        />
                    </div>
                    <div>
                        <label for="a11y-app-settings-integrations-page-svelte-1002"
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >API Key</label>
                        <input id="a11y-app-settings-integrations-page-svelte-1002"
                            type="password"
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            placeholder="API Key"
                        />
                    </div>
                {:else if selectedIntegration.id === "line"}
                    <div>
                        <label for="a11y-app-settings-integrations-page-svelte-1003"
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >Channel Access Token</label>
                        <textarea id="a11y-app-settings-integrations-page-svelte-1003"
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            rows="3"
                            placeholder="LINE Channel Access Token"
                        ></textarea>
                    </div>
                {:else if selectedIntegration.id === "google_sheets"}
                    <div>
                        <label for="a11y-app-settings-integrations-page-svelte-1004"
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >Spreadsheet ID</label>
                        <input id="a11y-app-settings-integrations-page-svelte-1004"
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
