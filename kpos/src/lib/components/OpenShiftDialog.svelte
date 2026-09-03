<!-- ═══════════════════════════════════════════════════════════════════════════
     Mandatory "open shift" dialog — shown after login for any non-admin,
     non-store_owner user with no active shift. Cannot be dismissed (no
     backdrop-click close, no Escape) since a shift is a hard prerequisite
     for ringing up sales (backend enforces this too — see SHIFT_REQUIRED
     in sales/presentation/routes.ts). Requires the opening cash drawer
     amount, formatted as the app's standard xxx,xxx,xxx.xx money format.
     ═══════════════════════════════════════════════════════════════════════════ -->
<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { Lock } from "lucide-svelte";
    import MoneyInput from "./MoneyInput.svelte";

    interface Props {
        open: boolean;
        onSubmit: (openingBalance: number) => Promise<boolean>;
    }

    let { open, onSubmit }: Props = $props();

    let openingBalance = $state(0);
    let submitting = $state(false);
    let error = $state("");

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        error = "";
        if (openingBalance < 0) {
            error = t("shifts.openingBalanceRequired");
            return;
        }
        submitting = true;
        try {
            const ok = await onSubmit(openingBalance);
            if (!ok) error = t("shifts.openShiftFailed");
        } finally {
            submitting = false;
        }
    }
</script>

{#if open}
    <div
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
        role="presentation"
    >
        <div
            class="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="open-shift-title"
        >
            <form onsubmit={handleSubmit} class="p-6">
                <div class="flex items-start gap-4 mb-5">
                    <div class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-warning-500 bg-warning-50 dark:bg-warning-900/20">
                        <Lock class="w-5 h-5" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 id="open-shift-title" class="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                            {t("shifts.openShiftRequiredTitle")}
                        </h3>
                        <p class="text-sm text-gray-600 dark:text-gray-300">
                            {t("shifts.openShiftRequiredDesc")}
                        </p>
                    </div>
                </div>

                <label for="opening-balance" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    {t("shifts.openingBalance")}
                </label>
                <MoneyInput
                    id="opening-balance"
                    bind:value={openingBalance}
                    min={0}
                    required
                    aria-label={t("shifts.openingBalance")}
                />
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                    {t("shifts.openingBalanceHint")}
                </p>

                {#if error}
                    <p class="text-sm text-danger-600 dark:text-danger-400 mt-2">{error}</p>
                {/if}

                <button
                    type="submit"
                    data-testid="shift-required-open"
                    disabled={submitting}
                    class="w-full mt-5 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {submitting ? "..." : t("shifts.openShift")}
                </button>
            </form>
        </div>
    </div>
{/if}
