<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import { Loader2, Save, Bell, Mail, MessageSquare, Volume2 } from "lucide-svelte";
    const t = i18n.t;

    let settings = $state({
        lowStock: {
            enabled: true,
            threshold: 10,
            emailAlert: false,
            pushAlert: true,
            soundAlert: true,
        },
        sales: {
            newOrder: true,
            orderCompleted: true,
            refund: true,
            dailySummary: true,
        },
        system: {
            backupReminder: true,
            updateAvailable: true,
            securityAlerts: true,
        },
        email: {
            enabled: false,
            recipients: "",
            sendTime: "08:00",
        },
        sound: {
            enabled: true,
            volume: 70,
            newOrderSound: "bell",
            alertSound: "chime",
        },
    });
    let loading = $state(true);
    let saving = $state(false);

    const soundOptions = [
        { value: "bell", label: "ກະດິ່ງ" },
        { value: "chime", label: "ເຊມ" },
        { value: "ding", label: "ດິງ" },
        { value: "beep", label: "ບີບ" },
    ];

    $effect(() => {
        auth.activeStoreId;
        loadSettings();
    });

    async function loadSettings() {
        loading = true;
        try {
            const response = await api
                .get("settings/notifications")
                .json<any>();
            if (response.success && response.data) {
                settings = { ...settings, ...response.data };
            }
        } catch (error) {
            console.error("Failed to load notification settings:", error);
        } finally {
            loading = false;
        }
    }

    async function saveSettings() {
        saving = true;
        try {
            await api.put("settings/notifications", { json: settings }).json();
            toast.success("ບັນທຶກການຕັ້ງຄ່າສຳເລັດ");
        } catch (error) {
            console.error("Failed to save settings:", error);
            toast.error("ບັນທຶກບໍ່ສຳເລັດ");
        } finally {
            saving = false;
        }
    }

    function testSound(sound: string) {
        // In production, this would play the actual sound
        console.log("Testing sound:", sound);
        toast.info(
            `ທົດສອບສຽງ: ${soundOptions.find((s) => s.value === sound)?.label}`,
        );
    }
</script>

<svelte:head>
    <title>{t("settings.notifications")} - KPOS</title>
</svelte:head>

<div class="p-6 max-w-4xl">
    <div class="flex justify-between items-center mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Bell class="w-6 h-6" />
                {t("settings.notifications")}
            </h1>
            <p class="text-gray-500 dark:text-gray-400">{t('notifications.subtitle')}</p>
        </div>
        <button
            onclick={saveSettings}
            disabled={saving}
            class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
        >
            {#if saving}
                <Loader2 class="w-4 h-4 animate-spin" />
                {t('notifications.saving')}
            {:else}
                <Save class="w-4 h-4" />
                {t('notifications.saveSettings')}
            {/if}
        </button>
    </div>

    {#if loading}
        <div class="flex justify-center py-12">
            <Loader2 class="h-8 w-8 animate-spin text-primary-600" />
        </div>
    {:else}
        <div class="space-y-6">
            <!-- Low Stock Alerts -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Bell class="w-5 h-5" />
                    {t('notifications.lowStockAlerts')}
                </h2>
                <div class="space-y-4">
                    <label class="flex items-center justify-between">
                        <span class="text-gray-700 dark:text-gray-300">{t('notifications.enableNotifications')}</span>
                        <input
                            type="checkbox"
                            bind:checked={settings.lowStock.enabled}
                            class="w-5 h-5"
                        />
                    </label>
                    {#if settings.lowStock.enabled}
                        <div>
                            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                >ຈຳນວນຂັ້ນຕ່ຳ</label
                            >
                            <input
                                type="number"
                                bind:value={settings.lowStock.threshold}
                                min="1"
                                class="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            />
                        </div>
                        <div class="flex flex-wrap gap-4">
                            <label class="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    bind:checked={settings.lowStock.pushAlert}
                                />
                                <span class="text-sm text-gray-700 dark:text-gray-300"
                                    >Push Notification</span
                                >
                            </label>
                            <label class="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    bind:checked={settings.lowStock.emailAlert}
                                />
                                <span class="text-sm text-gray-700 dark:text-gray-300">Email</span>
                            </label>
                            <label class="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    bind:checked={settings.lowStock.soundAlert}
                                />
                                <span class="text-sm text-gray-700 dark:text-gray-300">{t('notifications.sound')}</span>
                            </label>
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Sales Notifications -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <MessageSquare class="w-5 h-5" />
                    ແຈ້ງເຕືອນການຂາຍ
                </h2>
                <div class="space-y-3">
                    <label class="flex items-center justify-between">
                        <span class="text-gray-700 dark:text-gray-300">{t('notifications.newOrder')}</span>
                        <input
                            type="checkbox"
                            bind:checked={settings.sales.newOrder}
                            class="w-5 h-5"
                        />
                    </label>
                    <label class="flex items-center justify-between">
                        <span class="text-gray-700 dark:text-gray-300">{t('notifications.orderCompleted')}</span>
                        <input
                            type="checkbox"
                            bind:checked={settings.sales.orderCompleted}
                            class="w-5 h-5"
                        />
                    </label>
                    <label class="flex items-center justify-between">
                        <span class="text-gray-700 dark:text-gray-300">{t('notifications.refund')}</span>
                        <input
                            type="checkbox"
                            bind:checked={settings.sales.refund}
                            class="w-5 h-5"
                        />
                    </label>
                    <label class="flex items-center justify-between">
                        <span class="text-gray-700 dark:text-gray-300">{t('notifications.dailySummary')}</span>
                        <input
                            type="checkbox"
                            bind:checked={settings.sales.dailySummary}
                            class="w-5 h-5"
                        />
                    </label>
                </div>
            </div>

            <!-- System Notifications -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Bell class="w-5 h-5" />
                    ແຈ້ງເຕືອນລະບົບ
                </h2>
                <div class="space-y-3">
                    <label class="flex items-center justify-between">
                        <span class="text-gray-700 dark:text-gray-300">{t('notifications.backupReminder')}</span>
                        <input
                            type="checkbox"
                            bind:checked={settings.system.backupReminder}
                            class="w-5 h-5"
                        />
                    </label>
                    <label class="flex items-center justify-between">
                        <span class="text-gray-700 dark:text-gray-300">{t('notifications.updateAvailable')}</span>
                        <input
                            type="checkbox"
                            bind:checked={settings.system.updateAvailable}
                            class="w-5 h-5"
                        />
                    </label>
                    <label class="flex items-center justify-between">
                        <span class="text-gray-700 dark:text-gray-300">{t('notifications.securityAlerts')}</span>
                        <input
                            type="checkbox"
                            bind:checked={settings.system.securityAlerts}
                            class="w-5 h-5"
                        />
                    </label>
                </div>
            </div>

            <!-- Sound Settings -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Volume2 class="w-5 h-5" />
                    ການຕັ້ງຄ່າສຽງ
                </h2>
                <div class="space-y-4">
                    <label class="flex items-center justify-between">
                        <span class="text-gray-700 dark:text-gray-300">{t('notifications.enableSound')}</span>
                        <input
                            type="checkbox"
                            bind:checked={settings.sound.enabled}
                            class="w-5 h-5"
                        />
                    </label>
                    {#if settings.sound.enabled}
                        <div>
                            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-2"
                                >ລະດັບສຽງ: {settings.sound.volume}%</label
                            >
                            <input
                                type="range"
                                bind:value={settings.sound.volume}
                                min="0"
                                max="100"
                                class="w-full"
                            />
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                    >ສຽງອໍເດີໃໝ່</label
                                >
                                <div class="flex gap-2">
                                    <select
                                        bind:value={
                                            settings.sound.newOrderSound
                                        }
                                        class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                                    >
                                        {#each soundOptions as sound (sound.value)}
                                            <option value={sound.value}
                                                >{sound.label}</option
                                            >
                                        {/each}
                                    </select>
                                    <button
                                        onclick={() =>
                                            testSound(
                                                settings.sound.newOrderSound,
                                            )}
                                        class="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                                    >
                                        ▶️
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                    >ສຽງແຈ້ງເຕືອນ</label
                                >
                                <div class="flex gap-2">
                                    <select
                                        bind:value={settings.sound.alertSound}
                                        class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                                    >
                                        {#each soundOptions as sound (sound.value)}
                                            <option value={sound.value}
                                                >{sound.label}</option
                                            >
                                        {/each}
                                    </select>
                                    <button
                                        onclick={() =>
                                            testSound(
                                                settings.sound.alertSound,
                                            )}
                                        class="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                                    >
                                        ▶️
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Email Settings -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Mail class="w-5 h-5" />
                    ການຕັ້ງຄ່າອີເມວ
                </h2>
                <div class="space-y-4">
                    <label class="flex items-center justify-between">
                        <span class="text-gray-700 dark:text-gray-300">{t('notifications.sendEmail')}</span>
                        <input
                            type="checkbox"
                            bind:checked={settings.email.enabled}
                            class="w-5 h-5"
                        />
                    </label>
                    {#if settings.email.enabled}
                        <div>
                            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                >ອີເມວຜູ້ຮັບ (ແຍກດ້ວຍ ,)</label
                            >
                            <input
                                type="text"
                                bind:value={settings.email.recipients}
                                placeholder="admin@example.com, manager@example.com"
                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            />
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                >ເວລາສົ່ງສະຫຼຸບປະຈຳວັນ</label
                            >
                            <input
                                type="time"
                                bind:value={settings.email.sendTime}
                                class="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            />
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>
