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
    } from "lucide-svelte";

    // State
    let activeTab = $state("general");
    let isLoading = $state(true);
    let isSaving = $state(false);

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
            const settingsToSave = [
                { category: "general", key: "businessName", value: settings.storeName },
                { category: "general", key: "address", value: settings.storeAddress },
                { category: "general", key: "phone", value: settings.storePhone },
                { category: "general", key: "email", value: settings.storeEmail },
                { category: "general", key: "taxId", value: settings.taxId },
                { category: "receipt", key: "header", value: settings.receiptHeader },
                { category: "receipt", key: "footer", value: settings.receiptFooter },
                { category: "receipt", key: "showLogo", value: settings.showLogo },
                { category: "tax", key: "vatEnabled", value: settings.enableTax },
                { category: "tax", key: "vatRate", value: settings.taxRate },
                { category: "display", key: "theme", value: settings.theme },
                { category: "display", key: "accentColor", value: settings.accentColor },
                { category: "inventory", key: "lowStockAlert", value: settings.lowStockAlert },
                { category: "inventory", key: "lowStockThreshold", value: settings.lowStockThreshold },
                { category: "notifications", key: "email", value: settings.emailNotifications },
                { category: "pos", key: "quickSale", value: settings.quickSale },
                { category: "pos", key: "requireCustomer", value: settings.requireCustomer },
                { category: "pos", key: "defaultPaymentMethod", value: settings.defaultPaymentMethod },
                { category: "pos", key: "allowNegativeStock", value: settings.allowNegativeStock },
                { category: "pos", key: "enableHoldSale", value: settings.enableHoldSale },
            ];
            
            const response = await api.post("settings/bulk", { 
                json: { settings: settingsToSave } 
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
    
    $effect(() => {
        auth.activeStoreId;
        loadSettings();
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
                    ข้อมูลร้านค้า
                </h2>

                <div class="space-y-6">
                    <div class="grid grid-cols-2 gap-6">
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >ชื่อร้าน</label
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
                                >เลขประจำตัวผู้เสียภาษี</label
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
                            >ที่อยู่</label
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
                                >โทรศัพท์</label
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
                                >อีเมล</label
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
                        การตั้งค่าภาษี
                    </h3>

                    <div class="flex items-center justify-between">
                        <div>
                            <p
                                class="font-medium text-gray-900 dark:text-white"
                            >
                                เปิดใช้งานภาษี
                            </p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                คำนวณภาษีมูลค่าเพิ่มอัตโนมัติ
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
                                >อัตราภาษี (%)</label
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
                <h2
                    class="text-lg font-semibold text-gray-900 dark:text-white mb-6"
                >
                    การตั้งค่าใบเสร็จ
                </h2>

                <div class="space-y-6">
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                            >ข้อความหัวใบเสร็จ</label
                        >
                        <textarea
                            bind:value={settings.receiptHeader}
                            rows="2"
                            placeholder="ข้อความที่แสดงด้านบนใบเสร็จ"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
                        ></textarea>
                    </div>

                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                            >ข้อความท้ายใบเสร็จ</label
                        >
                        <textarea
                            bind:value={settings.receiptFooter}
                            rows="2"
                            placeholder="ข้อความที่แสดงด้านล่างใบเสร็จ"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
                        ></textarea>
                    </div>

                    <div class="flex items-center justify-between">
                        <div>
                            <p
                                class="font-medium text-gray-900 dark:text-white"
                            >
                                แสดงโลโก้
                            </p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                แสดงโลโก้ร้านค้าบนใบเสร็จ
                            </p>
                        </div>
                        <label
                            class="relative inline-flex items-center cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                bind:checked={settings.showLogo}
                                class="sr-only peer"
                            />
                            <div
                                class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"
                            ></div>
                        </label>
                    </div>

                    <!-- Receipt Preview -->
                    <div class="mt-8">
                        <h3
                            class="text-md font-medium text-gray-900 dark:text-white mb-4"
                        >
                            ตัวอย่างใบเสร็จ
                        </h3>
                        <div
                            class="w-80 mx-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 font-mono text-sm"
                        >
                            <div class="text-center mb-4">
                                {#if settings.showLogo}
                                    <div
                                        class="w-16 h-16 mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-2"
                                    >
                                        <Store class="w-8 h-8 text-gray-400" />
                                    </div>
                                {/if}
                                <p class="font-bold">{settings.storeName}</p>
                                {#if settings.receiptHeader}
                                    <p class="text-xs text-gray-500 dark:text-gray-400">
                                        {settings.receiptHeader}
                                    </p>
                                {/if}
                            </div>

                            <hr class="border-dashed border-gray-300 dark:border-gray-600 my-2" />

                            <div class="space-y-1">
                                <div class="flex justify-between">
                                    <span>สินค้า A x 2</span>
                                    <span>100.00</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>สินค้า B x 1</span>
                                    <span>50.00</span>
                                </div>
                            </div>

                            <hr class="border-dashed border-gray-300 dark:border-gray-600 my-2" />

                            <div class="space-y-1">
                                <div class="flex justify-between">
                                    <span>รวม</span>
                                    <span>150.00</span>
                                </div>
                                {#if settings.enableTax}
                                    <div
                                        class="flex justify-between text-xs text-gray-500 dark:text-gray-400"
                                    >
                                        <span>ภาษี {settings.taxRate}%</span>
                                        <span
                                            >{(
                                                (150 * settings.taxRate) /
                                                100
                                            ).toFixed(2)}</span
                                        >
                                    </div>
                                {/if}
                                <div class="flex justify-between font-bold">
                                    <span>รวมทั้งสิ้น</span>
                                    <span
                                        >{(
                                            150 *
                                            (1 +
                                                (settings.enableTax
                                                    ? settings.taxRate / 100
                                                    : 0))
                                        ).toFixed(2)}</span
                                    >
                                </div>
                            </div>

                            {#if settings.receiptFooter}
                                <hr
                                    class="border-dashed border-gray-300 dark:border-gray-600 my-2"
                                />
                                <p class="text-center text-xs text-gray-500 dark:text-gray-400">
                                    {settings.receiptFooter}
                                </p>
                            {/if}
                        </div>
                    </div>
                </div>
            {:else if activeTab === "notifications"}
                <h2
                    class="text-lg font-semibold text-gray-900 dark:text-white mb-6"
                >
                    การแจ้งเตือน
                </h2>

                <div class="space-y-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p
                                class="font-medium text-gray-900 dark:text-white"
                            >
                                แจ้งเตือนสินค้าใกล้หมด
                            </p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                รับการแจ้งเตือนเมื่อสินค้าใกล้หมดสต็อก
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
                                แจ้งเตือนเมื่อสต็อกต่ำกว่า
                            </label>
                            <input
                                type="number"
                                bind:value={settings.lowStockThreshold}
                                min="1"
                                class="w-32 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
                            />
                            <span class="ml-2 text-gray-500 dark:text-gray-400">ชิ้น</span>
                        </div>
                    {/if}

                    <div class="flex items-center justify-between">
                        <div>
                            <p
                                class="font-medium text-gray-900 dark:text-white"
                            >
                                แจ้งเตือนทางอีเมล
                            </p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                รับการแจ้งเตือนผ่านทางอีเมล
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
                    ธีมและการแสดงผล
                </h2>

                <div class="space-y-6">
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4"
                            >โหมดสี</label
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
                                <p class="text-sm font-medium">สว่าง</p>
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
                                <p class="text-sm font-medium">มืด</p>
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
                                <p class="text-sm font-medium">ตามระบบ</p>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4"
                            >สีหลัก</label
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
                                        color === "green" && "bg-green-500",
                                        color === "purple" && "bg-purple-500",
                                        color === "red" && "bg-red-500",
                                        color === "orange" && "bg-orange-500",
                                    )}
                                ></button>
                            {/each}
                        </div>
                    </div>
                </div>
            {:else}
                <div class="text-center py-12 text-gray-500 dark:text-gray-400">
                    <div
                        class="w-16 h-16 mx-auto bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center mb-4"
                    >
                        {#if activeTab === "users"}
                            <User class="w-8 h-8 text-gray-400" />
                        {:else if activeTab === "security"}
                            <Shield class="w-8 h-8 text-gray-400" />
                        {:else}
                            <Database class="w-8 h-8 text-gray-400" />
                        {/if}
                    </div>
                    <p class="text-lg font-medium">เร็วๆ นี้</p>
                    <p class="text-sm">ฟีเจอร์นี้กำลังพัฒนา</p>
                </div>
            {/if}
        </div>
    </div>
</div>
