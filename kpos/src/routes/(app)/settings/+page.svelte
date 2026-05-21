<script lang="ts">
    import { onMount } from "svelte";
    import { auth } from "$stores";
    import { api } from "$api";
    import { cn } from "$utils";
    import { toast } from "svelte-sonner";
    import {
        User,
        Store,
        Bell,
        Printer,
        Shield,
        Database,
        Palette,
        Globe,
        Save,
        Loader2,
        Camera,
        Upload,
        Image,
        ExternalLink,
        Eye,
        EyeOff,
    } from "lucide-svelte";

    // State
    let activeTab = $state("general");
    let isLoading = $state(true);
    let isSaving = $state(false);

    // Logo upload state
    let storeLogo = $state<string | null>(null);
    let isUploadingLogo = $state(false);

    async function handleLogoUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { toast.error('ຮູບຕ້ອງນ້ອຍກວ່າ 2MB'); return; }
        isUploadingLogo = true;
        try {
            // Convert to base64 data URL then upload as JSON to the single-upload endpoint
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            try {
                const res = await api.post('upload/single', { json: { image: base64, folder: 'logos' } }).json<any>();
                storeLogo = res.success && res.data?.url ? res.data.url : base64;
            } catch {
                storeLogo = base64; // keep local data URL if Cloudinary not configured
            }
            toast.success('ອັບໂຫຼດ logo ສຳເລັດ');
        } catch {
            toast.error('ອັບໂຫຼດ logo ລົ້ມເຫຼວ');
        } finally {
            isUploadingLogo = false;
        }
    }

    // Settings State
    let settings = $state({
        // General
        storeName: "",
        storeAddress: "",
        storePhone: "",
        storeEmail: "",
        taxId: "",

        // Receipt
        receiptHeader: "",
        receiptFooter: "",
        showLogo: true,

        // Tax
        enableTax: true,
        taxRate: 7,

        // Theme
        theme: "light",
        accentColor: "blue",

        // Notifications
        lowStockAlert: true,
        lowStockThreshold: 10,
        emailNotifications: false,
        
        // POS
        quickSale: true,
        requireCustomer: false,
        defaultPaymentMethod: "CASH",
        allowNegativeStock: false,
        enableHoldSale: true,
    });

    const tabs = [
        { id: "general", name: "ທົ່ວໄປ", icon: Store },
        { id: "receipt", name: "ໃບບິນ", icon: Printer },
        { id: "notifications", name: "ການແຈ້ງເຕືອນ", icon: Bell },
        { id: "appearance", name: "ຮູບລັກສະນະ", icon: Palette },
        { id: "users", name: "ຜູ້ໃຊ້", icon: User },
        { id: "security", name: "ຄວາມປອດໄພ", icon: Shield },
        { id: "backup", name: "ສຳຮອງຂໍ້ມູນ", icon: Database },
    ];

    // Load settings from API
    async function loadSettings() {
        isLoading = true;
        try {
            const response = await api.get("settings").json<any>();
            if (response.success && response.data) {
                const data = response.data;
                // Map API data to local state
                settings = {
                    storeName: data.general?.businessName || data.general?.storeName || "",
                    storeAddress: data.general?.address || "",
                    storePhone: data.general?.phone || "",
                    storeEmail: data.general?.email || "",
                    taxId: data.general?.taxId || "",
                    receiptHeader: data.receipt?.header || "",
                    receiptFooter: data.receipt?.footer || "",
                    showLogo: data.receipt?.showLogo ?? true,
                    enableTax: data.tax?.vatEnabled ?? true,
                    taxRate: data.tax?.vatRate || 7,
                    theme: data.display?.theme || "light",
                    accentColor: data.display?.accentColor || "blue",
                    lowStockAlert: data.inventory?.lowStockAlert ?? true,
                    lowStockThreshold: data.inventory?.lowStockThreshold || 10,
                    emailNotifications: data.notifications?.email ?? false,
                    quickSale: data.pos?.quickSale ?? true,
                    requireCustomer: data.pos?.requireCustomer ?? false,
                    defaultPaymentMethod: data.pos?.defaultPaymentMethod || "CASH",
                    allowNegativeStock: data.pos?.allowNegativeStock ?? false,
                    enableHoldSale: data.pos?.enableHoldSale ?? true,
                };
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        } finally {
            isLoading = false;
        }
    }

    async function saveSettings() {
        isSaving = true;
        try {
            // Prepare settings for bulk update
            const response = await api.post("settings/bulk", {
                json: {
                    settings: {
                        general: {
                            businessName: settings.storeName,
                            address: settings.storeAddress,
                            phone: settings.storePhone,
                            email: settings.storeEmail,
                            taxId: settings.taxId,
                        },
                        receipt: {
                            header: settings.receiptHeader,
                            footer: settings.receiptFooter,
                            showLogo: settings.showLogo,
                        },
                        tax: {
                            vatEnabled: settings.enableTax,
                            vatRate: settings.taxRate,
                        },
                        display: {
                            theme: settings.theme,
                            accentColor: settings.accentColor,
                        },
                        inventory: {
                            lowStockAlert: settings.lowStockAlert,
                            lowStockThreshold: settings.lowStockThreshold,
                        },
                        notifications: {
                            email: settings.emailNotifications,
                        },
                        pos: {
                            quickSale: settings.quickSale,
                            requireCustomer: settings.requireCustomer,
                            defaultPaymentMethod: settings.defaultPaymentMethod,
                            allowNegativeStock: settings.allowNegativeStock,
                            enableHoldSale: settings.enableHoldSale,
                        },
                    },
                },
            }).json<any>();
            
            if (response.success) {
                toast.success("ບັນທຶກການຕັ້ງຄ່າສຳເລັດ");
            } else {
                toast.error(response.error?.message || "ເກີດຂໍ້ຜິດພາດ");
            }
        } catch (error) {
            console.error("Failed to save settings:", error);
            toast.error("ເກີດຂໍ້ຜິດພາດໃນການບັນທຶກ");
        } finally {
            isSaving = false;
        }
    }
    
    // Receipt quick settings
    let receiptQuick = $state({ footerText: 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ!', showLogo: true, paperSize: '80mm' as '58mm' | '80mm' | 'A4' });
    let receiptQuickLoaded = $state(false);
    let savingReceipt = $state(false);

    async function loadReceiptSettings() {
        try {
            const res = await api.get('settings/receipt').json<any>();
            if (res.success && res.data) {
                receiptQuick = {
                    footerText: res.data.footerText ?? 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ!',
                    showLogo: res.data.showLogo !== false,
                    paperSize: res.data.paperSize ?? '80mm',
                };
            }
        } catch {}
        receiptQuickLoaded = true;
    }

    async function saveReceiptSettings() {
        savingReceipt = true;
        try {
            await api.put('settings/receipt', { json: receiptQuick });
            toast.success('ບັນທຶກການຕັ້ງຄ່າໃບບິນສຳເລັດ');
        } catch {
            toast.error('ເກີດຂໍ້ຜິດພາດ');
        } finally {
            savingReceipt = false;
        }
    }

    // Security — password change
    let securityForm = $state({ currentPassword: '', newPassword: '', confirmPassword: '' });
    let showCurrentPw = $state(false);
    let showNewPw = $state(false);
    let savingSecurity = $state(false);

    async function changePassword() {
        if (!securityForm.currentPassword || !securityForm.newPassword) {
            toast.error('ກະລຸນາປ້ອນລະຫັດຜ່ານ');
            return;
        }
        if (securityForm.newPassword !== securityForm.confirmPassword) {
            toast.error('ລະຫັດຜ່ານໃໝ່ບໍ່ຕົງກັນ');
            return;
        }
        if (securityForm.newPassword.length < 6) {
            toast.error('ລະຫັດຜ່ານຕ້ອງມີຢ່າງໜ້ອຍ 6 ຕົວອັກສອນ');
            return;
        }
        savingSecurity = true;
        try {
            await api.put('users/me/password', {
                json: { currentPassword: securityForm.currentPassword, newPassword: securityForm.newPassword }
            });
            toast.success('ປ່ຽນລະຫັດຜ່ານສຳເລັດ');
            securityForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
        } catch (err: any) {
            toast.error(err?.message || 'ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ');
        } finally {
            savingSecurity = false;
        }
    }

    $effect(() => {
        auth.activeStoreId;
        loadSettings();
        if (!receiptQuickLoaded) loadReceiptSettings();
    });
</script>

<svelte:head>
    <title>ຕັ້ງຄ່າ - KPOS</title>
</svelte:head>

<div class="p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                ຕັ້ງຄ່າ
            </h1>
            <p class="text-gray-500 dark:text-gray-400">ຈັດການການຕັ້ງຄ່າລະບົບ</p>
        </div>
        <button
            onclick={saveSettings}
            disabled={isSaving || isLoading}
            class="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50"
        >
            {#if isSaving}
                <Loader2 class="w-4 h-4 animate-spin" />
            {:else}
                <Save class="w-4 h-4" />
            {/if}
            <span>ບັນທຶກ</span>
        </button>
    </div>

    <div class="flex gap-6">
        <!-- Sidebar -->
        <div class="w-64 shrink-0">
            <nav class="bg-white dark:bg-gray-900 rounded-xl p-2">
                {#each tabs as tab (tab.id)}
                    <button
                        onclick={() => (activeTab = tab.id)}
                        class={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left",
                            activeTab === tab.id
                                ? "bg-primary-50 text-primary-600 dark:bg-primary-900/20"
                                : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800",
                        )}
                    >
                        <tab.icon class="w-5 h-5" />
                        <span>{tab.name}</span>
                    </button>
                {/each}
            </nav>
        </div>

        <!-- Content -->
        <div class="flex-1 bg-white dark:bg-gray-900 rounded-xl p-6">
            {#if activeTab === "general"}
                <h2
                    class="text-lg font-semibold text-gray-900 dark:text-white mb-6"
                >
                    ຂໍ້ມູນຮ້ານຄ້າ
                </h2>

                <div class="space-y-6">
                    <!-- Logo Upload -->
                    <div class="flex items-center gap-6">
                        <div class="relative group">
                            <div class="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-800">
                                {#if storeLogo}
                                    <img src={storeLogo} alt="Logo" class="w-full h-full object-cover" />
                                {:else}
                                    <Store class="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                {/if}
                            </div>
                            <label class="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                {#if isUploadingLogo}
                                    <Loader2 class="w-6 h-6 text-white animate-spin" />
                                {:else}
                                    <Camera class="w-6 h-6 text-white" />
                                {/if}
                                <input type="file" accept="image/*" class="hidden" onchange={handleLogoUpload} />
                            </label>
                        </div>
                        <div>
                            <p class="font-medium text-gray-900 dark:text-white">ໂລໂກ້ຮ້ານ</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ອັບໂຫຼດຮູບໂລໂກ້ (ສູງສຸດ 2MB)</p>
                            {#if storeLogo}
                                <button onclick={() => storeLogo = null} class="text-xs text-danger-500 hover:underline mt-1">ລຶບໂລໂກ້</button>
                            {/if}
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-6">
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >ຊື່ຮ້ານ</label
                            >
                            <input
                                type="text"
                                bind:value={settings.storeName}
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >ເລກທີພາສີ (Tax ID)</label
                            >
                            <input
                                type="text"
                                bind:value={settings.taxId}
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                            >ທີ່ຢູ່</label
                        >
                        <textarea
                            bind:value={settings.storeAddress}
                            rows="3"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
                        ></textarea>
                    </div>

                    <div class="grid grid-cols-2 gap-6">
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >ເບີໂທ</label
                            >
                            <input
                                type="tel"
                                bind:value={settings.storePhone}
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >ອີເມວ</label
                            >
                            <input
                                type="email"
                                bind:value={settings.storeEmail}
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                    </div>

                    <hr class="border-gray-200 dark:border-gray-700" />

                    <h3
                        class="text-md font-medium text-gray-900 dark:text-white"
                    >
                        ຕັ້ງຄ່າພາສີ
                    </h3>

                    <div class="flex items-center justify-between">
                        <div>
                            <p
                                class="font-medium text-gray-900 dark:text-white"
                            >
                                ເປີດໃຊ້ພາສີ
                            </p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                ຄິດໄລ່ພາສີມູນຄ່າເພີ່ມອັດຕະໂນມັດ
                            </p>
                        </div>
                        <label
                            class="relative inline-flex items-center cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                bind:checked={settings.enableTax}
                                class="sr-only peer"
                            />
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"
                            ></div>
                        </label>
                    </div>

                    {#if settings.enableTax}
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >ອັດຕາພາສີ (%)</label
                            >
                            <input
                                type="number"
                                bind:value={settings.taxRate}
                                min="0"
                                max="100"
                                step="0.01"
                                class="w-32 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                    {/if}
                </div>
            {:else if activeTab === "receipt"}
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                    ຕັ້ງຄ່າໃບບິນ
                </h2>

                <!-- Link to full design page -->
                <div class="mb-6 p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl flex items-center justify-between gap-4">
                    <div>
                        <p class="font-medium text-primary-900 dark:text-primary-100">ອອກແບບໃບບິນແບບລະອຽດ</p>
                        <p class="text-sm text-primary-700 dark:text-primary-300">ເພີ່ມ / ຈັດວາງ / ອອກແບບ Layout ໃບບິນຢ່າງລະອຽດໃນໜ້າ Documents</p>
                    </div>
                    <a
                        href="/documents/design"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors whitespace-nowrap text-sm font-medium"
                    >
                        <ExternalLink class="w-4 h-4" />
                        ອອກແບບໃບບິນ
                    </a>
                </div>

                <!-- Quick settings -->
                <div class="space-y-5">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ຂໍ້ຄວາມທ້າຍໃບບິນ
                        </label>
                        <input
                            type="text"
                            bind:value={receiptQuick.footerText}
                            placeholder="ຂອບໃຈທີ່ໃຊ້ບໍລິການ!"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ຂະໜາດກະດາດ
                        </label>
                        <div class="flex gap-3">
                            {#each (['58mm', '80mm', 'A4'] as const) as size (size)}
                                <button
                                    onclick={() => (receiptQuick.paperSize = size)}
                                    class={cn(
                                        "px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors",
                                        receiptQuick.paperSize === size
                                            ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                                            : "border-gray-200 dark:border-gray-700 hover:border-primary-300"
                                    )}
                                >{size}</button>
                            {/each}
                        </div>
                    </div>

                    <div class="flex items-center justify-between">
                        <div>
                            <p class="font-medium text-gray-900 dark:text-white">ສະແດງໂລໂກ້</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ສະແດງໂລໂກ້ຮ້ານຄ້າໃນໃບບິນ</p>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" bind:checked={receiptQuick.showLogo} class="sr-only peer" />
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                        </label>
                    </div>

                    <div class="pt-2">
                        <button
                            onclick={saveReceiptSettings}
                            disabled={savingReceipt}
                            class="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-60 transition-colors"
                        >
                            {#if savingReceipt}
                                <Loader2 class="w-4 h-4 animate-spin" />
                            {:else}
                                <Save class="w-4 h-4" />
                            {/if}
                            ບັນທຶກ
                        </button>
                    </div>
                </div>
            {:else if activeTab === "notifications"}
                <h2
                    class="text-lg font-semibold text-gray-900 dark:text-white mb-6"
                >
                    ການແຈ້ງເຕືອນ
                </h2>

                <div class="space-y-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p
                                class="font-medium text-gray-900 dark:text-white"
                            >
                                ແຈ້ງເຕືອນສິນຄ້າໃກ້ໝົດ
                            </p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                ຮັບການແຈ້ງເຕືອນເມື່ອສິນຄ້າໃກ້ໝົດສະຕ໋ອກ
                            </p>
                        </div>
                        <label
                            class="relative inline-flex items-center cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                bind:checked={settings.lowStockAlert}
                                class="sr-only peer"
                            />
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"
                            ></div>
                        </label>
                    </div>

                    {#if settings.lowStockAlert}
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                            >
                                ແຈ້ງເຕືອນເມື່ອສະຕ໋ອກຕ່ຳກວ່າ
                            </label>
                            <input
                                type="number"
                                bind:value={settings.lowStockThreshold}
                                min="1"
                                class="w-32 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
                            />
                            <span class="ml-2 text-gray-500 dark:text-gray-400">ຊິ້ນ</span>
                        </div>
                    {/if}

                    <div class="flex items-center justify-between">
                        <div>
                            <p
                                class="font-medium text-gray-900 dark:text-white"
                            >
                                ແຈ້ງເຕືອນທາງອີເມວ
                            </p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                ຮັບການແຈ້ງເຕືອນຜ່ານທາງອີເມວ
                            </p>
                        </div>
                        <label
                            class="relative inline-flex items-center cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                bind:checked={settings.emailNotifications}
                                class="sr-only peer"
                            />
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"
                            ></div>
                        </label>
                    </div>
                </div>
            {:else if activeTab === "appearance"}
                <h2
                    class="text-lg font-semibold text-gray-900 dark:text-white mb-6"
                >
                    ທີມ ແລະ ການສະແດງຜົນ
                </h2>

                <div class="space-y-6">
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4"
                            >ໂໝດສີ</label
                        >
                        <div class="grid grid-cols-3 gap-4">
                            <button
                                onclick={() => (settings.theme = "light")}
                                class={cn(
                                    "p-4 rounded-xl border-2 transition-colors",
                                    settings.theme === "light"
                                        ? "border-primary-500"
                                        : "border-gray-200 dark:border-gray-700 hover:border-primary-300",
                                )}
                            >
                                <div
                                    class="w-full h-20 bg-white rounded-lg mb-2 border"
                                ></div>
                                <p class="text-sm font-medium">ແຈ້ງ</p>
                            </button>
                            <button
                                onclick={() => (settings.theme = "dark")}
                                class={cn(
                                    "p-4 rounded-xl border-2 transition-colors",
                                    settings.theme === "dark"
                                        ? "border-primary-500"
                                        : "border-gray-200 dark:border-gray-700 hover:border-primary-300",
                                )}
                            >
                                <div
                                    class="w-full h-20 bg-gray-900 rounded-lg mb-2"
                                ></div>
                                <p class="text-sm font-medium">ມືດ</p>
                            </button>
                            <button
                                onclick={() => (settings.theme = "system")}
                                class={cn(
                                    "p-4 rounded-xl border-2 transition-colors",
                                    settings.theme === "system"
                                        ? "border-primary-500"
                                        : "border-gray-200 dark:border-gray-700 hover:border-primary-300",
                                )}
                            >
                                <div
                                    class="w-full h-20 bg-gradient-to-r from-white to-gray-900 rounded-lg mb-2 border"
                                ></div>
                                <p class="text-sm font-medium">ຕາມລະບົບ</p>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4"
                            >ສີຫຼັກ</label
                        >
                        <div class="flex gap-3">
                            {#each ["blue", "green", "purple", "red", "orange"] as color (color)}
                                <button
                                    onclick={() =>
                                        (settings.accentColor = color)}
                                    class={cn(
                                        "w-10 h-10 rounded-full transition-transform",
                                        settings.accentColor === color
                                            ? "scale-110 ring-2 ring-offset-2 ring-gray-400"
                                            : "hover:scale-105",
                                        color === "blue" && "bg-blue-500",
                                        color === "green" && "bg-success-500",
                                        color === "purple" && "bg-purple-500",
                                        color === "red" && "bg-danger-500",
                                        color === "orange" && "bg-orange-500",
                                    )}
                                ></button>
                            {/each}
                        </div>
                    </div>
                </div>
            {:else if activeTab === "users"}
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-6">ຜູ້ໃຊ້</h2>
                <div class="p-5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-between gap-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-primary-100 dark:bg-primary-900/40 rounded-xl flex items-center justify-center">
                            <User class="w-6 h-6 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                            <p class="font-medium text-gray-900 dark:text-white">ໂປຣໄຟລ໌ ແລະ ລະຫັດຜ່ານ</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">ແກ້ໄຂຂໍ້ມູນສ່ວນຕົວ, ຮູບໂປຣໄຟລ໌ ແລະ ລະຫັດຜ່ານ</p>
                        </div>
                    </div>
                    <a
                        href="/settings/profile"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors whitespace-nowrap text-sm font-medium"
                    >
                        <ExternalLink class="w-4 h-4" />
                        ໄປຫາໂປຣໄຟລ໌
                    </a>
                </div>

            {:else if activeTab === "security"}
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-6">ຄວາມປອດໄພ</h2>
                <div class="max-w-md space-y-5">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ລະຫັດຜ່ານປັດຈຸບັນ</label>
                        <div class="relative">
                            <input
                                type={showCurrentPw ? 'text' : 'password'}
                                bind:value={securityForm.currentPassword}
                                placeholder="••••••••"
                                class="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onclick={() => (showCurrentPw = !showCurrentPw)}
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                {#if showCurrentPw}<EyeOff class="w-4 h-4" />{:else}<Eye class="w-4 h-4" />{/if}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ລະຫັດຜ່ານໃໝ່</label>
                        <div class="relative">
                            <input
                                type={showNewPw ? 'text' : 'password'}
                                bind:value={securityForm.newPassword}
                                placeholder="••••••••"
                                class="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onclick={() => (showNewPw = !showNewPw)}
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                {#if showNewPw}<EyeOff class="w-4 h-4" />{:else}<Eye class="w-4 h-4" />{/if}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ຢືນຍັນລະຫັດຜ່ານໃໝ່</label>
                        <input
                            type="password"
                            bind:value={securityForm.confirmPassword}
                            placeholder="••••••••"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                        />
                    </div>
                    <button
                        onclick={changePassword}
                        disabled={savingSecurity || !securityForm.currentPassword || !securityForm.newPassword || !securityForm.confirmPassword}
                        class="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-60 transition-colors"
                    >
                        {#if savingSecurity}
                            <Loader2 class="w-4 h-4 animate-spin" />
                        {:else}
                            <Shield class="w-4 h-4" />
                        {/if}
                        ປ່ຽນລະຫັດຜ່ານ
                    </button>
                </div>

            {:else if activeTab === "backup"}
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-6">ສຳຮອງຂໍ້ມູນ</h2>
                <div class="text-center py-12 text-gray-500 dark:text-gray-400">
                    <div class="w-16 h-16 mx-auto bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center mb-4">
                        <Database class="w-8 h-8 text-gray-400" />
                    </div>
                    <p class="text-lg font-medium text-gray-700 dark:text-gray-300">ກຳລັງພັດທະນາ</p>
                    <p class="text-sm mt-1">ຟີເຈີນີ້ຈະມີໃຫ້ໃຊ້ໃນໄວໆນີ້</p>
                </div>

            {:else}
                <div class="text-center py-12 text-gray-500 dark:text-gray-400">
                    <p class="text-lg font-medium text-gray-700 dark:text-gray-300">ກຳລັງພັດທະນາ</p>
                </div>
            {/if}
        </div>
    </div>
</div>
