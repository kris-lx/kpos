<!-- ═══════════════════════════════════════════════════════════════════════════
     Global Dialog - renders whatever dialogStore.confirm()/alert() queued.
     Mounted once in the root (app) layout. Replaces window.confirm()/alert().
     ═══════════════════════════════════════════════════════════════════════════ -->
<script lang="ts">
    import { dialogStore } from "$lib/stores/dialog.svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-svelte";
    import { cn } from "$utils";

    const dialogState = $derived(dialogStore.state);
    let dialogElement: HTMLDivElement | undefined = $state();
    let confirmButton: HTMLButtonElement | undefined = $state();
    let inputElement: HTMLInputElement | HTMLTextAreaElement | undefined = $state();
    let promptValue = $state("");
    let previousFocus: HTMLElement | null = null;

    const iconByVariant = {
        info: Info,
        success: CheckCircle2,
        warning: AlertTriangle,
        danger: XCircle,
    };

    const colorByVariant = {
        info: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
        success: "text-success-500 bg-success-50 dark:bg-success-900/20",
        warning: "text-warning-500 bg-warning-50 dark:bg-warning-900/20",
        danger: "text-danger-500 bg-danger-50 dark:bg-danger-900/20",
    };

    function handleKeydown(e: KeyboardEvent) {
        if (!dialogState.open) return;
        if (e.key === "Escape") {
            e.preventDefault();
            dialogStore.respond(dialogState.mode === "prompt" ? null : false);
            return;
        }
        if (e.key === "Tab" && dialogElement) {
            const focusable = Array.from(dialogElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')) as HTMLElement[];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    $effect(() => {
        if (!dialogState.open || typeof document === "undefined") return;
        previousFocus = document.activeElement as HTMLElement | null;
        promptValue = dialogState.initialValue;
        queueMicrotask(() => (dialogState.mode === "prompt" ? inputElement : confirmButton ?? dialogElement)?.focus());
        return () => previousFocus?.focus();
    });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if dialogState.open}
    {@const Icon = iconByVariant[dialogState.variant]}
    <div
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
        role="presentation"
        onclick={(e) => { if (e.target === e.currentTarget && dialogState.mode === "alert") dialogStore.respond(true); }}
    >
        <div
            bind:this={dialogElement}
            class="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-xl"
            role={dialogState.mode === "alert" ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-labelledby="global-dialog-title"
            aria-describedby="global-dialog-message"
            tabindex="-1"
        >
            <div class="p-6">
                <div class="flex items-start gap-4">
                    <div class={cn("shrink-0 w-10 h-10 rounded-full flex items-center justify-center", colorByVariant[dialogState.variant])}>
                        <Icon class="w-5 h-5" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <h2 id="global-dialog-title" class="text-lg font-semibold text-gray-900 dark:text-white mb-1">{dialogState.title || t("common.confirm")}</h2>
                        <p id="global-dialog-message" class="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{dialogState.message}</p>
                        {#if dialogState.mode === "prompt"}
                            <label class="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-200">
                                {dialogState.inputLabel}
                                {#if dialogState.inputType === "textarea"}
                                    <textarea bind:this={inputElement} bind:value={promptValue} rows="4" placeholder={dialogState.inputPlaceholder} class="mt-1 block w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"></textarea>
                                {:else}
                                    <input bind:this={inputElement} bind:value={promptValue} type="text" placeholder={dialogState.inputPlaceholder} class="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
                                {/if}
                            </label>
                        {/if}
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
                {#if dialogState.mode === "confirm" || dialogState.mode === "prompt"}
                    <button
                        type="button"
                        onclick={() => dialogStore.respond(dialogState.mode === "prompt" ? null : false)}
                        class="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        {t(dialogState.cancelLabel)}
                    </button>
                {/if}
                <button
                    bind:this={confirmButton}
                    type="button"
                    onclick={() => dialogStore.respond(dialogState.mode === "prompt" ? promptValue : true)}
                    class={cn(
                        "px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors",
                        dialogState.variant === "danger" ? "bg-danger-600 hover:bg-danger-700" : "bg-primary-600 hover:bg-primary-700"
                    )}
                >
                    {t(dialogState.confirmLabel)}
                </button>
            </div>
        </div>
    </div>
{/if}
