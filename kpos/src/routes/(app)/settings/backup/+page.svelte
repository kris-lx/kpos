<script lang="ts">
    import { api } from "$api";
    import { t } from "$lib/i18n/index.svelte";
    import { auth } from "$stores";
    import { toast } from "svelte-sonner";
    import { onMount } from "svelte";
    import { Database, Download, Upload, Clock, ChevronLeft, Loader2, CheckCircle, Shield, Save, Play } from "lucide-svelte";

    let exporting = $state(false);
    let exportingDb = $state(false);
    let importing = $state(false);
    let runningBackup = $state(false);
    let savingSchedule = $state(false);
    let lastExport = $state<string | null>(null);
    let lastDbExport = $state<string | null>(null);
    let lastScheduledRun = $state<string | null>(null);
    let schedule = $state('');
    let fileInput: HTMLInputElement;

    const isSuperAdmin = $derived(auth.user?.isSuperAdmin === true);
    const hasSettingsUpdate = $derived(auth.hasPermission('settings:update'));

    const PRESET_SCHEDULES = [
        { label: t('settings.backupScheduleDaily'), value: '0 2 * * *' },
        { label: t('settings.backupScheduleWeekly'), value: '0 2 * * 0' },
        { label: t('settings.backupScheduleMonthly'), value: '0 2 1 * *' },
    ];

    onMount(async () => {
        try {
            const res = await api.get('settings/backup/schedule').json<any>();
            if (res.success) schedule = res.data.schedule || '';
        } catch {}
    });

    async function exportSettings() {
        exporting = true;
        try {
            const res = await api.get("settings/export").json<any>();
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `kpos-settings-${new Date().toISOString().split("T")[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            lastExport = new Date().toLocaleString();
            toast.success(t("settings.exportSuccess"));
        } catch {
            toast.error(t("settings.exportFailed"));
        } finally {
            exporting = false;
        }
    }

    async function exportFullDb() {
        exportingDb = true;
        try {
            const res = await api.post("admin/backup", {}).json<any>();
            const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `kpos-backup-${new Date().toISOString().split("T")[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            lastDbExport = new Date().toLocaleString();
            toast.success(t("settings.exportSuccess"));
        } catch {
            toast.error(t("settings.exportFailed"));
        } finally {
            exportingDb = false;
        }
    }

    async function runNow() {
        runningBackup = true;
        try {
            const res = await api.post('settings/backup/run', {}).json<any>();
            lastScheduledRun = new Date().toLocaleString();
            toast.success(t('settings.backupRunSuccess'));
        } catch {
            toast.error(t('settings.backupRunFailed'));
        } finally {
            runningBackup = false;
        }
    }

    async function saveSchedule() {
        savingSchedule = true;
        try {
            await api.put('settings/backup/schedule', { json: { schedule } }).json<any>();
            toast.success(t('settings.backupScheduleSaved'));
        } catch {
            toast.error(t('settings.saveFailed'));
        } finally {
            savingSchedule = false;
        }
    }

    async function handleRestoreFile(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        if (!file.name.endsWith(".json")) {
            toast.error(t("common.invalidFile"));
            return;
        }
        importing = true;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            await api.post("settings/import", data).json<any>();
            toast.success(t("common.importSuccess"));
        } catch {
            toast.error(t("common.importFailed"));
        } finally {
            importing = false;
            input.value = "";
        }
    }
</script>

<svelte:head><title>{t("settings.backup")} - KPOS</title></svelte:head>

<div class="p-6 max-w-2xl">
    <div class="flex items-center gap-3 mb-6">
        <a href="/settings" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <ChevronLeft class="w-5 h-5" />
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">{t("settings.backup")}</h1>
    </div>

    <div class="space-y-4">
        <!-- Settings Export -->
        <div class="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-100 dark:border-gray-800">
            <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Download class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div class="flex-1">
                    <h3 class="font-medium text-gray-900 dark:text-white">{t("settings.settingsExport")}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("settings.settingsExportDesc")}</p>
                    {#if lastExport}
                        <p class="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                            <CheckCircle class="w-3 h-3" />{t("settings.lastExport")}: {lastExport}
                        </p>
                    {/if}
                </div>
                <button onclick={exportSettings} disabled={exporting}
                    class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 text-sm font-medium transition-colors">
                    {#if exporting}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Download class="w-4 h-4" />{/if}
                    {t("common.export")}
                </button>
            </div>
        </div>

        <!-- Full DB Backup -->
        {#if isSuperAdmin}
        <div class="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-100 dark:border-gray-800">
            <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                    <Database class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <h3 class="font-medium text-gray-900 dark:text-white">{t("settings.dbBackup")}</h3>
                        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                            <Shield class="w-3 h-3" /> Super Admin
                        </span>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("settings.dbBackupDesc")}</p>
                    {#if lastDbExport}
                        <p class="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                            <CheckCircle class="w-3 h-3" />{t("settings.lastExport")}: {lastDbExport}
                        </p>
                    {/if}
                </div>
                <button onclick={exportFullDb} disabled={exportingDb}
                    class="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60 text-sm font-medium transition-colors">
                    {#if exportingDb}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Database class="w-4 h-4" />{/if}
                    {t("common.export")}
                </button>
            </div>
        </div>
        {:else}
        <div class="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-100 dark:border-gray-800 opacity-60">
            <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                    <Database class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div class="flex-1">
                    <h3 class="font-medium text-gray-900 dark:text-white">{t("settings.dbBackup")}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("settings.backupSuperAdminOnly")}</p>
                </div>
                <button disabled class="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed">
                    <Database class="w-4 h-4" />{t("common.export")}
                </button>
            </div>
        </div>
        {/if}

        <!-- Scheduled Backup -->
        <div class="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-100 dark:border-gray-800">
            <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                    <Clock class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div class="flex-1">
                    <h3 class="font-medium text-gray-900 dark:text-white">{t("settings.scheduledBackup")}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("settings.scheduledBackupDesc")}</p>

                    <!-- Preset buttons -->
                    <div class="flex flex-wrap gap-2 mt-3">
                        {#each PRESET_SCHEDULES as preset}
                            <button onclick={() => schedule = preset.value}
                                class="px-2.5 py-1 text-xs rounded-full border transition-colors {schedule === preset.value ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-400 text-indigo-700 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300'}">
                                {preset.label}
                            </button>
                        {/each}
                        {#if schedule}
                            <button onclick={() => schedule = ''} class="px-2.5 py-1 text-xs rounded-full border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                {t('common.clear')}
                            </button>
                        {/if}
                    </div>

                    <!-- Cron input -->
                    <div class="flex gap-2 mt-3">
                        <input type="text" bind:value={schedule} placeholder="0 2 * * * (cron expression)"
                            class="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono" />
                        <button onclick={saveSchedule} disabled={savingSchedule}
                            class="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 text-sm font-medium transition-colors">
                            {#if savingSchedule}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" />{/if}
                            {t('common.save')}
                        </button>
                        <button onclick={runNow} disabled={runningBackup}
                            class="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 text-sm font-medium transition-colors" title={t('settings.backupRunNow')}>
                            {#if runningBackup}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Play class="w-4 h-4" />{/if}
                        </button>
                    </div>
                    {#if lastScheduledRun}
                        <p class="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                            <CheckCircle class="w-3 h-3" />{t('settings.lastExport')}: {lastScheduledRun}
                        </p>
                    {/if}
                </div>
            </div>
        </div>

        <!-- Restore / Import -->
        <div class="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-100 dark:border-gray-800">
            <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                    <Upload class="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div class="flex-1">
                    <h3 class="font-medium text-gray-900 dark:text-white">{t("settings.dbRestore")}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("settings.dbRestoreDesc")}</p>
                </div>
                <button onclick={() => fileInput.click()} disabled={importing}
                    class="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-60 text-sm font-medium transition-colors">
                    {#if importing}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Upload class="w-4 h-4" />{/if}
                    {t("common.import")}
                </button>
                <input bind:this={fileInput} type="file" accept=".json" class="hidden" onchange={handleRestoreFile} />
            </div>
        </div>
    </div>
</div>
