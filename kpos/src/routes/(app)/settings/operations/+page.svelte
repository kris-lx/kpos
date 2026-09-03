<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { auth } from "$lib/stores/auth.svelte";
    import { toast } from "svelte-sonner";
    import { ShieldCheck, Loader2, Save, ArrowLeft } from "lucide-svelte";
    import { goto } from "$app/navigation";

    let loading = $state(true);
    let saving = $state(false);
    let requireMakerChecker = $state(true);

    // Only the tenant owner (roleLevel <= 2) or a super_admin may change this
    // — it's a security control (whether the same person can create AND
    // approve a stock count/transfer/PO, or void/refund their own sale), not
    // an ordinary preference any settings:update-holding manager should be
    // able to weaken. The backend enforces this independently too.
    const canEdit = $derived(auth.isSuperAdmin || auth.roleLevel <= 2);

    async function load() {
        loading = true;
        try {
            const res = await api.get("settings/operations").json<{ success: boolean; data?: { requireMakerChecker: boolean } }>();
            if (res.success && res.data) {
                requireMakerChecker = res.data.requireMakerChecker;
            }
        } catch {
            toast.error(t("common.loadingError"));
        } finally {
            loading = false;
        }
    }

    async function save() {
        if (!canEdit) return;
        saving = true;
        try {
            const res = await api.put("settings/operations", { json: { requireMakerChecker } }).json<{ success: boolean }>();
            if (res.success) {
                toast.success(t("settings.operationsSaved"));
            } else {
                toast.error(t("common.saveFailed"));
            }
        } catch {
            toast.error(t("common.saveFailed"));
        } finally {
            saving = false;
        }
    }

    onMount(load);
</script>

<svelte:head>
    <title>{t("settings.operationsTitle")} - KPOS</title>
</svelte:head>

<div class="p-6 max-w-2xl mx-auto">
    <div class="flex items-center gap-4 mb-6">
        <button
            onclick={() => goto("/settings")}
            class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
            <ArrowLeft class="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShieldCheck class="w-6 h-6 text-primary-600" />
                {t("settings.operationsTitle")}
            </h1>
        </div>
    </div>

    {#if loading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-8 h-8 animate-spin text-primary-500" />
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <p class="text-sm text-gray-600 dark:text-gray-300 mb-6 whitespace-pre-line">
                {t("settings.operationsExplain")}
            </p>

            <label class="flex items-start justify-between gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                <span class="text-sm font-medium text-gray-900 dark:text-white">
                    {t("settings.operationsToggleLabel")}
                </span>
                <input
                    type="checkbox"
                    bind:checked={requireMakerChecker}
                    disabled={!canEdit}
                    class="w-5 h-5 mt-0.5 shrink-0 disabled:opacity-50"
                />
            </label>

            {#if !canEdit}
                <p class="text-xs text-amber-600 dark:text-amber-400 mt-3">
                    {t("settings.operationsOwnerOnly")}
                </p>
            {/if}

            {#if canEdit}
                <button
                    onclick={save}
                    disabled={saving}
                    class="w-full mt-6 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {#if saving}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {:else}
                        <Save class="w-4 h-4" />
                    {/if}
                    {t("common.save")}
                </button>
            {/if}
        </div>
    {/if}
</div>
