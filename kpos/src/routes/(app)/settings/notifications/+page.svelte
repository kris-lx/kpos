<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import { Loader2, Save, Bell, Mail, MessageSquare, Volume2, BellRing, MessageCircle, Send, CheckCircle2, XCircle } from "lucide-svelte";

    let settings = $state({
        lowStock: { enabled: true, threshold: 10, emailAlert: false, pushAlert: true, soundAlert: true },
        sales: { newOrder: true, orderCompleted: true, refund: true, dailySummary: true },
        system: { backupReminder: true, updateAvailable: true, securityAlerts: true },
        email: { enabled: false, recipients: "", sendTime: "08:00" },
        sound: { enabled: true, volume: 70, newOrderSound: "bell", alertSound: "chime" },
    });
    let loading = $state(true);
    let saving = $state(false);

    // --- Push Notifications ---
    let pushPermission = $state<NotificationPermission>('default');
    let pushSubscribed = $state(false);
    let pushLoading = $state(false);

    async function checkPushStatus() {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
        pushPermission = Notification.permission;
        if (pushPermission !== 'granted') { pushSubscribed = false; return; }
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            pushSubscribed = !!sub;
        } catch {}
    }

    async function subscribePush() {
        pushLoading = true;
        try {
            const { data } = await api.get('notifications/push/key').json<any>();
            const reg = await navigator.serviceWorker.ready;
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') { pushPermission = permission; toast.error(t('notifications.pushDenied')); return; }
            pushPermission = permission;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(data.publicKey),
            });
            await api.post('notifications/push/subscribe', { json: sub.toJSON() }).json<any>();
            pushSubscribed = true;
            toast.success(t('notifications.pushEnabled'));
        } catch {
            toast.error(t('notifications.pushSubscribeError'));
        } finally {
            pushLoading = false;
        }
    }

    async function unsubscribePush() {
        pushLoading = true;
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await api.post('notifications/push/unsubscribe', { json: { endpoint: sub.endpoint } }).json<any>();
                await sub.unsubscribe();
            }
            pushSubscribed = false;
            toast.success(t('notifications.pushDisabled'));
        } catch {
            toast.error(t('notifications.pushUnsubscribeError'));
        } finally {
            pushLoading = false;
        }
    }

    function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))).buffer;
    }

    // --- LINE Notify ---
    let lineToken = $state('');
    let savedLineToken = $state(false);
    let testingLine = $state(false);
    let savingLine = $state(false);

    async function saveLineToken() {
        if (!lineToken.trim()) return;
        savingLine = true;
        try {
            await api.put('settings/notifications', { json: { lineToken: lineToken.trim() } }).json<any>();
            savedLineToken = true;
            toast.success(t('notifications.lineTokenSaved'));
        } catch {
            toast.error(t('notifications.lineTokenSaveFailed'));
        } finally {
            savingLine = false;
        }
    }

    async function testLineNotify() {
        if (!lineToken.trim()) { toast.error(t('notifications.lineTokenRequired')); return; }
        testingLine = true;
        try {
            await api.post('settings/notifications/test-line', { json: { token: lineToken } }).json<any>();
            toast.success(t('notifications.lineTestSuccess'));
        } catch (e: any) {
            toast.error(e?.message || t('notifications.lineTestFailed'));
        } finally {
            testingLine = false;
        }
    }

    const soundOptions = [
        { value: 'bell', labelKey: 'notifications.soundBell' },
        { value: 'chime', labelKey: 'notifications.soundChime' },
        { value: 'ding', labelKey: 'notifications.soundDing' },
        { value: 'beep', labelKey: 'notifications.soundBeep' },
    ];

    $effect(() => {
        auth.activeStoreId;
        loadSettings();
    });

    onMount(() => { checkPushStatus(); });

    async function loadSettings() {
        loading = true;
        try {
            const response = await api.get('settings/notifications').json<any>();
            if (response.success && response.data) {
                const { lineToken: savedToken, ...rest } = response.data;
                settings = { ...settings, ...rest };
                if (savedToken) { lineToken = savedToken; savedLineToken = true; }
            }
        } catch (error) {
            console.error('Failed to load notification settings:', error);
        } finally {
            loading = false;
        }
    }

    async function saveSettings() {
        saving = true;
        try {
            await api.put('settings/notifications', { json: settings }).json();
            toast.success(t('settings.saved'));
        } catch {
            toast.error(t('settings.saveFailed'));
        } finally {
            saving = false;
        }
    }

    function testSound(sound: string) {
        toast.info(t('notifications.testingSound', { sound: t(soundOptions.find((s) => s.value === sound)?.labelKey || 'notifications.sound') }));
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
                            <label for="a11y-app-settings-notifications-page-svelte-1001" class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                >{t("inventory.minimumQuantity")}</label>
                            <input id="a11y-app-settings-notifications-page-svelte-1001"
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
                    {t("notifications.salesNotifications")}
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
                    {t("notifications.systemNotifications")}
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
                    {t("notifications.soundSettings")}
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
                            <label for="a11y-app-settings-notifications-page-svelte-1002" class="block text-sm text-gray-600 dark:text-gray-400 mb-2"
                                >{t("notifications.volume")}: {settings.sound.volume}%</label>
                            <input id="a11y-app-settings-notifications-page-svelte-1002"
                                type="range"
                                bind:value={settings.sound.volume}
                                min="0"
                                max="100"
                                class="w-full"
                            />
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label for="a11y-app-settings-notifications-page-svelte-1003" class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                    >{t("notifications.newOrderSound")}</label>
                                <div class="flex gap-2">
                                    <select id="a11y-app-settings-notifications-page-svelte-1003"
                                        bind:value={
                                            settings.sound.newOrderSound
                                        }
                                        class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                                    >
                                        {#each soundOptions as sound (sound.value)}
                                            <option value={sound.value}
                                                >{t(sound.labelKey)}</option
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
                                <label for="a11y-app-settings-notifications-page-svelte-1004" class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                    >{t("notifications.alertSound")}</label>
                                <div class="flex gap-2">
                                    <select id="a11y-app-settings-notifications-page-svelte-1004"
                                        bind:value={settings.sound.alertSound}
                                        class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                                    >
                                        {#each soundOptions as sound (sound.value)}
                                            <option value={sound.value}
                                                >{t(sound.labelKey)}</option
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

            <!-- Browser Push Notifications -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <BellRing class="w-5 h-5 text-blue-500" />
                    {t("notifications.pushTitle")}
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{t("notifications.pushDesc")}</p>
                {#if !('Notification' in window)}
                    <p class="text-sm text-gray-400">{t("notifications.pushDenied")}</p>
                {:else if pushPermission === 'denied'}
                    <div class="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                        <XCircle class="w-4 h-4" />
                        {t("notifications.pushDenied")}
                    </div>
                {:else if pushSubscribed}
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle2 class="w-4 h-4" />
                            {t("notifications.pushEnabled")}
                        </div>
                        <button
                            onclick={unsubscribePush}
                            disabled={pushLoading}
                            class="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-sm font-medium transition-colors"
                        >
                            {#if pushLoading}<Loader2 class="w-4 h-4 animate-spin" />{/if}
                            {t("notifications.pushDisable")}
                        </button>
                    </div>
                {:else}
                    <button
                        onclick={subscribePush}
                        disabled={pushLoading}
                        class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
                    >
                        {#if pushLoading}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Bell class="w-4 h-4" />{/if}
                        {t("notifications.pushEnable")}
                    </button>
                {/if}
            </div>

            <!-- LINE Notify -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <MessageCircle class="w-5 h-5 text-green-500" />
                    LINE Notify
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {t("notifications.lineNotifyDesc")} <a href="https://notify-bot.line.me/en/" target="_blank" rel="noopener" class="text-primary-600 hover:underline">{t("notifications.getToken")}</a>
                </p>
                <div class="flex gap-3">
                    <input
                        type="password"
                        bind:value={lineToken}
                        placeholder={t("notifications.lineTokenPlaceholder")}
                        class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                    <button
                        onclick={saveLineToken}
                        disabled={savingLine || !lineToken.trim()}
                        class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
                    >
                        {#if savingLine}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" />{/if}
                        {t("notifications.lineTokenSave")}
                    </button>
                    <button
                        onclick={testLineNotify}
                        disabled={testingLine || !lineToken.trim()}
                        class="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm font-medium transition-colors"
                    >
                        {#if testingLine}
                            <Loader2 class="w-4 h-4 animate-spin" />
                        {:else}
                            <Send class="w-4 h-4" />
                        {/if}
                        {t("common.test")}
                    </button>
                </div>
                {#if savedLineToken}
                    <p class="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                        <CheckCircle2 class="w-3 h-3" />{t("notifications.lineSaveHint")}
                    </p>
                {/if}
            </div>
            <!-- Email Settings -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Mail class="w-5 h-5" />
                    {t("notifications.emailSettings")}
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
                            <label for="a11y-app-settings-notifications-page-svelte-1005" class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                >{t("notifications.emailRecipients")}</label>
                            <input id="a11y-app-settings-notifications-page-svelte-1005"
                                type="text"
                                bind:value={settings.email.recipients}
                                placeholder="admin@example.com, manager@example.com"
                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
                            />
                        </div>
                        <div>
                            <label for="a11y-app-settings-notifications-page-svelte-1006" class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                >{t("notifications.dailySummaryTime")}</label>
                            <input id="a11y-app-settings-notifications-page-svelte-1006"
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
