<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import { tenantSettings } from "$lib/stores/settings.svelte";
    import {
        Plus, Loader2, X, CreditCard, Wallet, Edit, AlertCircle, RefreshCw, QrCode, Save,
        Banknote, Landmark, Smartphone, HandCoins, Lock, ShieldCheck, ChevronDown, Layers,
        Globe, Settings2, Percent, BadgeCheck, CircleDashed, Star, Check,
    } from "lucide-svelte";
    const t = i18n.t;

    // Payment methods CRUD requires payments:manage; QR/EMVco config requires settings:update —
    // these are two separate backend permissions on this one page.
    const canManagePayments = $derived(auth.hasPermission('payments:manage'));
    const canUpdateSettings = $derived(auth.hasPermission('settings:update'));

    // Three distinct concerns live on this page — kept in separate tabs so each
    // has its own scope and its own "add" affordance, rather than one long scroll.
    type Tab = 'methods' | 'qr' | 'gateways';
    let activeTab = $state<Tab>('methods');
    const tabs: { id: Tab; label: string; icon: typeof Layers }[] = [
        { id: 'methods', label: 'ວິທີການຊຳລະ', icon: Wallet },
        { id: 'qr', label: 'QR / EMVco', icon: QrCode },
        { id: 'gateways', label: 'Gateway ອອນລາຍ', icon: Globe },
    ];

    // ── QR / EMVco merchant config ──────────────────────────────────────────
    let qrMerchantCode = $state(tenantSettings.qrMerchantCode);
    let qrCurrencyCode = $state(tenantSettings.qrCurrencyCode);
    let savingQr = $state(false);

    const currencyOptions = [
        { code: '418', label: 'LAK — ກີບລາວ' },
        { code: '764', label: 'THB — บาทไทย' },
        { code: '840', label: 'USD — US Dollar' },
        { code: '978', label: 'EUR — Euro' },
    ];
    let useCustomCurrency = $state(!currencyOptions.some((c) => c.code === tenantSettings.qrCurrencyCode));

    async function saveQrSettings() {
        savingQr = true;
        try {
            await Promise.all([
                api.put('settings/payments/qrMerchantCode', { json: { value: qrMerchantCode } }).json(),
                api.put('settings/payments/qrCurrencyCode', { json: { value: qrCurrencyCode } }).json(),
            ]);
            tenantSettings.patch({ qrMerchantCode, qrCurrencyCode });
            toast.success(t('common.saved'));
        } catch (e) {
            toast.error(t('common.saveFailed'));
        } finally {
            savingQr = false;
        }
    }

    // ── Dynamic QR gateways (SwiftPass Alipay/WeChat, JDB Yes Pay) ──────────
    // Separate from the static EMVco config above. Secrets are never sent back
    // from the API (masked), so editing an already-configured gateway means
    // re-entering the secret fields; only isActive/environment reflect what's
    // already saved.
    type GatewayProvider = 'swiftpass_alipay' | 'swiftpass_wechat' | 'jdb_yespay';

    const gatewayMeta: Record<GatewayProvider, {
        label: string; brand: string; accent: string; gradient: string;
        fields: { key: string; label: string; type?: string; secret?: boolean }[];
    }> = {
        swiftpass_alipay: {
            label: 'SwiftPass', brand: 'Alipay Web Pay',
            accent: 'text-sky-600 dark:text-sky-400',
            gradient: 'from-sky-500 to-blue-600',
            fields: [
                { key: 'mchId', label: 'Merchant ID (mch_id)' },
                { key: 'deviceInfo', label: 'Device Info / Terminal ID' },
                { key: 'signType', label: 'Sign Type (MD5 / SHA256 / RSA_1_256)' },
                { key: 'signKey', label: 'Sign Key / RSA Private Key', type: 'textarea', secret: true },
            ],
        },
        swiftpass_wechat: {
            label: 'SwiftPass', brand: 'WeChat WAP Pay',
            accent: 'text-emerald-600 dark:text-emerald-400',
            gradient: 'from-emerald-500 to-green-600',
            fields: [
                { key: 'mchId', label: 'Merchant ID (mch_id)' },
                { key: 'deviceInfo', label: 'Device Info / Terminal ID' },
                { key: 'signType', label: 'Sign Type (MD5 / SHA256 / RSA_1_256)' },
                { key: 'signKey', label: 'Sign Key / RSA Private Key', type: 'textarea', secret: true },
            ],
        },
        jdb_yespay: {
            label: 'JDB', brand: 'Yes Pay (deeplink)',
            accent: 'text-violet-600 dark:text-violet-400',
            gradient: 'from-violet-500 to-purple-600',
            fields: [
                { key: 'baseUrl', label: 'Base URL (provided by JDB)' },
                { key: 'partnerId', label: 'Partner ID' },
                { key: 'clientId', label: 'Client ID' },
                { key: 'clientSecret', label: 'Client Secret', secret: true },
                { key: 'merchantId', label: 'Merchant ID' },
                { key: 'terminalId', label: 'Terminal ID (optional)' },
            ],
        },
    };
    const gatewayProviders = Object.keys(gatewayMeta) as GatewayProvider[];

    let gatewayConfigs = $state<Record<string, any>>({});
    let gatewayForms = $state<Record<GatewayProvider, Record<string, string>>>({
        swiftpass_alipay: {}, swiftpass_wechat: {}, jdb_yespay: {},
    });
    let gatewaySavingProvider = $state<GatewayProvider | null>(null);

    async function loadGatewayConfigs() {
        try {
            const res = await api.get('payment-gateways/configs').json<any>();
            const byProvider: Record<string, any> = {};
            for (const row of res.data || []) byProvider[row.provider] = row;
            gatewayConfigs = byProvider;
        } catch { /* leave empty — page still usable to create new configs */ }
    }

    async function saveGatewayConfig(provider: GatewayProvider) {
        gatewaySavingProvider = provider;
        try {
            const existing = gatewayConfigs[provider];
            await api.put(`payment-gateways/configs/${provider}`, {
                json: { config: gatewayForms[provider], isActive: existing?.isActive ?? true, environment: existing?.environment ?? 'sandbox' },
            }).json();
            toast.success(t('common.saved'));
            await loadGatewayConfigs();
        } catch (e) {
            toast.error(t('common.saveFailed'));
        } finally {
            gatewaySavingProvider = null;
        }
    }

    async function toggleGatewayActive(provider: GatewayProvider) {
        const existing = gatewayConfigs[provider];
        if (!existing) return;
        try {
            // No `config` field — keeps the already-stored, encrypted credentials untouched.
            await api.put(`payment-gateways/configs/${provider}`, {
                json: { isActive: !existing.isActive, environment: existing.environment },
            }).json();
            await loadGatewayConfigs();
        } catch {
            toast.error(t('common.saveFailed'));
        }
    }

    // ── Payment methods (POS-facing) ────────────────────────────────────────
    let paymentMethods = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showModal = $state(false);
    let editingMethod = $state<any>(null);

    function blankFormData() {
        return {
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
    let formData = $state(blankFormData());

    const defaultPaymentTypes = [
        { value: "cash", label: "ເງິນສົດ" },
        { value: "card", label: "ບັດເຄຣດິດ/ເດບິດ" },
        { value: "qr", label: "QR Code" },
        { value: "bank_transfer", label: "ໂອນເງິນ" },
        { value: "ewallet", label: "E-Wallet" },
        { value: "credit", label: "ສິນເຊື່ອ" },
    ];
    let paymentTypes = $state(defaultPaymentTypes);

    // One glyph + one accent per payment type — used on cards, the type picker, and badges.
    const typeStyle: Record<string, { icon: typeof Banknote; classes: string }> = {
        cash: { icon: Banknote, classes: "bg-success-100 dark:bg-success-900/50 text-success-700 dark:text-success-300" },
        card: { icon: CreditCard, classes: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300" },
        qr: { icon: QrCode, classes: "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300" },
        bank_transfer: { icon: Landmark, classes: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300" },
        ewallet: { icon: Smartphone, classes: "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300" },
        credit: { icon: HandCoins, classes: "bg-danger-100 dark:bg-danger-900/50 text-danger-700 dark:text-danger-300" },
    };
    function getTypeStyle(type: string) {
        return typeStyle[type] || { icon: Wallet, classes: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300" };
    }

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
        loadGatewayConfigs();
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
            formData = {
                ...blankFormData(),
                ...method,
                settings: { ...blankFormData().settings, ...(method.settings || {}) },
            };
        } else {
            editingMethod = null;
            formData = blankFormData();
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
</script>

<svelte:head>
    <title>{t("settings.payments")} - KPOS</title>
</svelte:head>

<div class="p-6 max-w-6xl mx-auto">
    <!-- Page Header -->
    <div class="flex items-center gap-3 mb-6">
        <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-600/20 shrink-0">
            <CreditCard class="w-5.5 h-5.5 text-white" />
        </div>
        <div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                {t("settings.payments")}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">ຕັ້ງຄ່າວິທີການຊຳລະເງິນ, EMVco QR ແລະ Gateway ອອນລາຍ</p>
        </div>
    </div>

    <!-- Tab Bar -->
    <div class="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800 mb-6 overflow-x-auto scrollbar-none">
        {#each tabs as tab (tab.id)}
            <button
                onclick={() => (activeTab = tab.id)}
                class="relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors {activeTab === tab.id
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}"
            >
                <tab.icon class="w-4 h-4" />
                {tab.label}
                {#if activeTab === tab.id}
                    <span class="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400 rounded-full"></span>
                {/if}
            </button>
        {/each}
    </div>

    <!-- ═══════════════════════════════ Payment Methods ═══════════════════════════════ -->
    {#if activeTab === 'methods'}
        <div class="animate-fade-in">
            <div class="flex items-center justify-between mb-4">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                    ວິທີການຊຳລະທີ່ຮ້ານຄ້າຮັບຢູ່ໜ້າ POS — {paymentMethods.length} ລາຍການ
                </p>
                {#if canManagePayments}
                    <button
                        onclick={() => openModal()}
                        class="flex items-center gap-2 px-3.5 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors shadow-sm shadow-primary-600/20"
                    >
                        <Plus class="w-4 h-4" />
                        ເພີ່ມວິທີການຊຳລະ
                    </button>
                {/if}
            </div>

            {#if loading}
                <div class="flex justify-center py-16">
                    <Loader2 class="h-7 w-7 animate-spin text-primary-500" />
                </div>
            {:else if error}
                <div class="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                    <AlertCircle class="h-10 w-10 text-danger-500 mb-3" />
                    <p class="text-danger-600 dark:text-danger-400 mb-4">{error}</p>
                    <button
                        onclick={() => loadPaymentMethods()}
                        class="flex items-center gap-2 px-4 py-2 bg-danger-600 text-white text-sm rounded-xl hover:bg-danger-700"
                    >
                        <RefreshCw class="w-4 h-4" />
                        ລອງໃໝ່
                    </button>
                </div>
            {:else if paymentMethods.length === 0}
                <div class="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
                    <div class="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                        <Wallet class="h-6 w-6 text-gray-400" />
                    </div>
                    <p class="font-medium text-gray-900 dark:text-white mb-1">ຍັງບໍ່ມີວິທີການຊຳລະ</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">ເພີ່ມວິທີການຊຳລະທຳອິດເພື່ອໃຫ້ນຳໃຊ້ຢູ່ໜ້າ POS</p>
                    {#if canManagePayments}
                        <button
                            onclick={() => openModal()}
                            class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-xl hover:bg-primary-700"
                        >
                            <Plus class="w-4 h-4" />
                            ເພີ່ມວິທີການຊຳລະ
                        </button>
                    {/if}
                </div>
            {:else}
                <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {#each paymentMethods as method (method.id)}
                        {@const style = getTypeStyle(method.type)}
                        <div class="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all">
                            <div class="flex items-start justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 {style.classes}">
                                        <style.icon class="w-5 h-5" />
                                    </div>
                                    <div class="min-w-0">
                                        <h3 class="font-semibold text-gray-900 dark:text-white truncate">
                                            {method.name}
                                        </h3>
                                        <p class="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">
                                            {method.code}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    aria-label={method.isActive ? "Disable payment method" : "Enable payment method"}
                                    onclick={() => toggleActive(method)}
                                    disabled={!canManagePayments}
                                    class="w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed {method.isActive
                                        ? 'bg-success-500'
                                        : 'bg-gray-300 dark:bg-gray-600'}"
                                >
                                    <div
                                        class="w-3.5 h-3.5 rounded-full bg-white shadow transform transition-transform {method.isActive
                                            ? 'translate-x-4'
                                            : 'translate-x-1'}"
                                    ></div>
                                </button>
                            </div>

                            <div class="mt-3 flex flex-wrap items-center gap-1.5">
                                {#if method.isDefault}
                                    <span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full">
                                        <Star class="w-3 h-3 fill-current" />
                                        ຄ່າເລີ່ມຕົ້ນ
                                    </span>
                                {/if}
                                <span class="px-2 py-0.5 text-xs rounded-full {style.classes}">
                                    {paymentTypes.find((t) => t.value === method.type)?.label || method.type}
                                </span>
                            </div>

                            {#if method.settings?.processingFee || method.settings?.minAmount || method.settings?.maxAmount}
                                <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 grid grid-cols-3 gap-2 text-center">
                                    <div>
                                        <p class="text-xs text-gray-400">ຄ່າທຳນຽມ</p>
                                        <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">{method.settings?.processingFee || 0}%</p>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-400">ຕ່ຳສຸດ</p>
                                        <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">{method.settings?.minAmount || 0}</p>
                                    </div>
                                    <div>
                                        <p class="text-xs text-gray-400">ສູງສຸດ</p>
                                        <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">{method.settings?.maxAmount || '∞'}</p>
                                    </div>
                                </div>
                            {/if}

                            {#if canManagePayments}
                                <div class="mt-4 flex gap-2">
                                    <button
                                        onclick={() => openModal(method)}
                                        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
                                    >
                                        <Edit class="w-3.5 h-3.5" />
                                        ແກ້ໄຂ
                                    </button>
                                    {#if !method.isDefault}
                                        <button
                                            onclick={() => setDefault(method)}
                                            class="flex-1 px-3 py-1.5 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 border border-transparent rounded-lg transition-colors"
                                        >
                                            ຕັ້ງເປັນຄ່າເລີ່ມຕົ້ນ
                                        </button>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <!-- ═══════════════════════════════ QR / EMVco ═══════════════════════════════ -->
    {#if activeTab === 'qr'}
        <div class="animate-fade-in max-w-lg">
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
                        <QrCode class="w-4.5 h-4.5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                        <h2 class="font-semibold text-gray-900 dark:text-white">EMVco Merchant QR</h2>
                        <p class="text-xs text-gray-500 dark:text-gray-400">QR ຄົງທີ່ສຳລັບໃບບິນ — ອີງຕາມມາດຕະຖານທະນາຄານ</p>
                    </div>
                </div>

                <fieldset disabled={!canUpdateSettings} class="p-5 space-y-4 disabled:opacity-60">
                    <div>
                        <label for="qr-merchant-code" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            Merchant Account / Payment Code
                        </label>
                        <input id="qr-merchant-code"
                            type="text"
                            bind:value={qrMerchantCode}
                            placeholder="e.g. LA.BCEL.0102012345678"
                            class="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm font-mono text-gray-900 dark:text-white"
                        />
                        <p class="text-xs text-gray-400 mt-1.5">ລະຫັດ merchant ສຳລັບສ້າງ EMVco QR Code ໃນໃບບິນ</p>
                    </div>

                    <div>
                        <label for="qr-currency" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ສະກຸນເງິນ (ISO 4217)
                        </label>
                        {#if useCustomCurrency}
                            <div class="flex gap-2">
                                <input id="qr-currency"
                                    type="text"
                                    bind:value={qrCurrencyCode}
                                    placeholder="418"
                                    maxlength="3"
                                    class="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm font-mono text-gray-900 dark:text-white"
                                />
                                <button
                                    type="button"
                                    onclick={() => { useCustomCurrency = false; if (!currencyOptions.some(c => c.code === qrCurrencyCode)) qrCurrencyCode = '418'; }}
                                    class="px-3 text-xs text-gray-500 hover:text-primary-600 border border-gray-200 dark:border-gray-700 rounded-xl"
                                >
                                    ລາຍການ
                                </button>
                            </div>
                        {:else}
                            <select id="qr-currency"
                                bind:value={qrCurrencyCode}
                                onchange={(e) => { if (e.currentTarget.value === '__custom') useCustomCurrency = true; }}
                                class="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white"
                            >
                                {#each currencyOptions as opt (opt.code)}
                                    <option value={opt.code}>{opt.label}</option>
                                {/each}
                                <option value="__custom">ອື່ນໆ (ປ້ອນເອງ)</option>
                            </select>
                        {/if}
                        <p class="text-xs text-gray-400 mt-1.5">418 = LAK · 764 = THB · 840 = USD · 978 = EUR</p>
                    </div>

                    <button
                        onclick={saveQrSettings}
                        disabled={savingQr}
                        class="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-60 text-sm font-medium transition-colors"
                    >
                        {#if savingQr}
                            <Loader2 class="w-4 h-4 animate-spin" />
                        {:else}
                            <Save class="w-4 h-4" />
                        {/if}
                        ບັນທຶກ QR Settings
                    </button>
                </fieldset>
            </div>
        </div>
    {/if}

    <!-- ═══════════════════════════════ Gateway Integrations ═══════════════════════════════ -->
    {#if activeTab === 'gateways'}
        <div class="animate-fade-in">
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                ເຊື່ອມຕໍ່ Gateway ອອນລາຍເພື່ອສ້າງ QR ຊຳລະເງິນແບບ Dynamic ຢູ່ໜ້າ POS
            </p>
            <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {#each gatewayProviders as provider (provider)}
                    {@const meta = gatewayMeta[provider]}
                    {@const existing = gatewayConfigs[provider]}
                    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <!-- Brand header -->
                        <div class="bg-gradient-to-r {meta.gradient} px-4 py-3.5 flex items-center justify-between">
                            <div class="text-white">
                                <p class="text-xs font-medium opacity-80 leading-none mb-1">{meta.label}</p>
                                <p class="font-semibold leading-none">{meta.brand}</p>
                            </div>
                            {#if existing}
                                <button
                                    onclick={() => toggleGatewayActive(provider)}
                                    class="w-9 h-5 rounded-full bg-white/25 transition-colors relative shrink-0"
                                    aria-label={existing.isActive ? 'Deactivate gateway' : 'Activate gateway'}
                                >
                                    <div class="w-3.5 h-3.5 rounded-full bg-white shadow transform transition-transform absolute top-[3px] {existing.isActive ? 'translate-x-4 left-[3px]' : 'translate-x-0 left-[3px]'}"></div>
                                </button>
                            {/if}
                        </div>

                        <div class="p-4 space-y-3">
                            <!-- Status -->
                            {#if existing?.isActive}
                                <div class="flex items-center gap-1.5 text-xs font-medium {meta.accent}">
                                    <BadgeCheck class="w-3.5 h-3.5" />
                                    ນຳໃຊ້ຢູ່
                                    {#if existing.environment === 'production'}
                                        <span class="ml-auto px-1.5 py-0.5 rounded bg-danger-100 dark:bg-danger-900/40 text-danger-600 dark:text-danger-400 text-[10px] font-semibold">PRODUCTION</span>
                                    {:else}
                                        <span class="ml-auto px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] font-semibold">SANDBOX</span>
                                    {/if}
                                </div>
                            {:else if existing}
                                <div class="flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
                                    <CircleDashed class="w-3.5 h-3.5" />
                                    ຕັ້ງຄ່າແລ້ວ — ປິດໃຊ້ງານ
                                </div>
                            {:else}
                                <div class="flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
                                    <CircleDashed class="w-3.5 h-3.5" />
                                    ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ
                                </div>
                            {/if}

                            <fieldset disabled={!canUpdateSettings} class="space-y-3 disabled:opacity-60">
                                {#each meta.fields as field (field.key)}
                                    <div>
                                        <label for={`gw-${provider}-${field.key}`} class="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                            {#if field.secret}<Lock class="w-3 h-3 text-gray-400" />{/if}
                                            {field.label}
                                        </label>
                                        {#if field.type === 'textarea'}
                                            <textarea
                                                id={`gw-${provider}-${field.key}`}
                                                bind:value={gatewayForms[provider][field.key]}
                                                rows="2"
                                                placeholder={existing ? '••••••••••••' : ''}
                                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-mono"
                                            ></textarea>
                                        {:else}
                                            <input
                                                id={`gw-${provider}-${field.key}`}
                                                type="text"
                                                bind:value={gatewayForms[provider][field.key]}
                                                placeholder={existing ? '••••••••••••' : ''}
                                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-2.5 py-1.5 text-xs font-mono text-gray-900 dark:text-white"
                                            />
                                        {/if}
                                    </div>
                                {/each}
                                <button
                                    onclick={() => saveGatewayConfig(provider)}
                                    disabled={gatewaySavingProvider === provider}
                                    class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:opacity-90 disabled:opacity-60 text-xs font-medium transition-opacity"
                                >
                                    {#if gatewaySavingProvider === provider}
                                        <Loader2 class="w-3.5 h-3.5 animate-spin" />
                                    {:else}
                                        <Save class="w-3.5 h-3.5" />
                                    {/if}
                                    ບັນທຶກ
                                </button>
                            </fieldset>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>

{#if showModal}
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div class="sticky top-0 bg-white dark:bg-gray-800 flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 class="text-lg font-bold text-gray-900 dark:text-white">
                    {editingMethod ? "ແກ້ໄຂວິທີການຊຳລະ" : "ເພີ່ມວິທີການຊຳລະ"}
                </h2>
                <button onclick={() => (showModal = false)} class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                    <X class="w-5 h-5" />
                </button>
            </div>

            <div class="p-6 space-y-5">
                <!-- Type picker -->
                <div>
                    <span class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ປະເພດ</span>
                    <div class="grid grid-cols-3 gap-2">
                        {#each paymentTypes as type (type.value)}
                            {@const style = getTypeStyle(type.value)}
                            <button
                                type="button"
                                onclick={() => (formData.type = type.value)}
                                class="flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-colors {formData.type === type.value
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}"
                            >
                                <div class="w-8 h-8 rounded-lg flex items-center justify-center {style.classes}">
                                    <style.icon class="w-4 h-4" />
                                </div>
                                <span class="text-xs text-gray-600 dark:text-gray-300 text-center leading-tight px-1">{type.label}</span>
                            </button>
                        {/each}
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="method-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຊື່</label>
                        <input id="method-name"
                            type="text"
                            bind:value={formData.name}
                            class="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                        />
                    </div>
                    <div>
                        <label for="method-code" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ລະຫັດ</label>
                        <input id="method-code"
                            type="text"
                            bind:value={formData.code}
                            class="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono"
                        />
                    </div>
                </div>

                <!-- Limits & fees -->
                <div class="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
                    <div class="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
                        <Settings2 class="w-3.5 h-3.5" />
                        ຄ່າທຳນຽມ ແລະ ຂອບເຂດ
                    </div>
                    <div class="grid grid-cols-3 gap-3">
                        <div>
                            <label for="method-fee" class="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
                                <Percent class="w-3 h-3" /> ຄ່າທຳນຽມ
                            </label>
                            <input id="method-fee" type="number" min="0" step="0.1"
                                bind:value={formData.settings.processingFee}
                                class="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                            />
                        </div>
                        <div>
                            <label for="method-min" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">ຕ່ຳສຸດ</label>
                            <input id="method-min" type="number" min="0"
                                bind:value={formData.settings.minAmount}
                                class="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                            />
                        </div>
                        <div>
                            <label for="method-max" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">ສູງສຸດ</label>
                            <input id="method-max" type="number" min="0"
                                bind:value={formData.settings.maxAmount}
                                class="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                            />
                        </div>
                    </div>
                </div>

                <!-- Toggles -->
                <div class="space-y-2">
                    <label class="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 cursor-pointer">
                        <span class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <ShieldCheck class="w-4 h-4 text-gray-400" />
                            ຕ້ອງການເລກອ້າງອີງ
                        </span>
                        <input type="checkbox" bind:checked={formData.settings.requireReference} class="sr-only peer" />
                        <div class="w-9 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:bg-primary-600 transition-colors relative">
                            <div class="w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] left-[3px] peer-checked:translate-x-4 transition-transform"></div>
                        </div>
                    </label>
                    <label class="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 cursor-pointer">
                        <span class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <Check class="w-4 h-4 text-gray-400" />
                            ຕ້ອງການອະນຸມັດກ່ອນ
                        </span>
                        <input type="checkbox" bind:checked={formData.settings.requireApproval} class="sr-only peer" />
                        <div class="w-9 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:bg-primary-600 transition-colors relative">
                            <div class="w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] left-[3px] peer-checked:translate-x-4 transition-transform"></div>
                        </div>
                    </label>
                    <label class="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 cursor-pointer">
                        <span class="text-sm text-gray-700 dark:text-gray-300">ເປີດໃຊ້ງານ</span>
                        <input type="checkbox" bind:checked={formData.isActive} class="sr-only peer" />
                        <div class="w-9 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:bg-success-500 transition-colors relative">
                            <div class="w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] left-[3px] peer-checked:translate-x-4 transition-transform"></div>
                        </div>
                    </label>
                </div>
            </div>

            <div class="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                <button
                    onclick={() => (showModal = false)}
                    class="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors"
                >
                    ຍົກເລີກ
                </button>
                {#if canManagePayments}
                    <button
                        onclick={saveMethod}
                        class="px-4 py-2.5 bg-primary-600 text-white text-sm rounded-xl hover:bg-primary-700 font-medium transition-colors"
                    >
                        ບັນທຶກ
                    </button>
                {/if}
            </div>
        </div>
    </div>
{/if}
