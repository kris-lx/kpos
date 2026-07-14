<script lang="ts">
    import { auth } from "$lib/stores/auth.svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$lib/utils";
    import { Building2, Store, ChevronDown, Check } from "lucide-svelte";

    let { 
        showBranchSelector = true,
        compact = false,
        onchange
    }: {
        showBranchSelector?: boolean;
        compact?: boolean;
        onchange?: (detail: { storeId: string }) => void;
    } = $props();

    let isOpen = $state(false);

    // Get user info from auth store
    const user = $derived(auth.user);
    const isSuperAdmin = $derived(user?.isSuperAdmin || false);
    const isAdmin = $derived(user?.role === 'admin');
    const canSeeAllStores = $derived(isSuperAdmin || isAdmin);
    const accessibleStores = $derived(auth.accessibleStores || []);
    const activeStore = $derived(auth.activeStore);

    function selectStore(storeId: string) {
        auth.setActiveStore(storeId);
        isOpen = false;
        onchange?.({ storeId });
    }

    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.store-selector')) {
            isOpen = false;
        }
    }
</script>

<svelte:window onclick={handleClickOutside} />

{#if showBranchSelector && !canSeeAllStores && accessibleStores.length > 0}
    <div class="store-selector relative">
        <button
            type="button"
            onclick={() => isOpen = !isOpen}
            class={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl border transition-all",
                "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700",
                "hover:border-primary-300 dark:hover:border-primary-600",
                "text-gray-700 dark:text-gray-300",
                compact ? "text-sm" : "text-base"
            )}
        >
            <Store class={cn("text-primary-500", compact ? "w-4 h-4" : "w-5 h-5")} />
            <span class="font-medium truncate max-w-[150px]">
                {activeStore?.storeName || t("stores.selectStore")}
            </span>
            <ChevronDown class={cn("transition-transform", isOpen && "rotate-180", compact ? "w-4 h-4" : "w-5 h-5")} />
        </button>

        {#if isOpen}
            <div class="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl z-50 overflow-hidden">
                <div class="p-2 border-b border-gray-100 dark:border-gray-700">
                    <p class="text-xs text-gray-500 dark:text-gray-400 px-2">{t("stores.selectStoreBranch")}</p>
                </div>
                <div class="max-h-64 overflow-y-auto p-2 space-y-1">
                    {#each accessibleStores as store}
                        <button
                            type="button"
                            onclick={() => selectStore(store.storeId)}
                            class={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left",
                                activeStore?.storeId === store.storeId
                                    ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                                    : "hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300"
                            )}
                        >
                            <div class={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center",
                                activeStore?.storeId === store.storeId
                                    ? "bg-primary-100 dark:bg-primary-800"
                                    : "bg-gray-100 dark:bg-gray-700"
                            )}>
                                <Store class="w-4 h-4" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="font-medium truncate">{store.storeName}</p>
                                {#if store.branchName}
                                    <p class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                        <Building2 class="w-3 h-3" />
                                        {store.branchName}
                                    </p>
                                {/if}
                            </div>
                            {#if activeStore?.storeId === store.storeId}
                                <Check class="w-5 h-5 text-primary-500" />
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
{:else if canSeeAllStores}
    <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800">
        <Store class="w-5 h-5 text-amber-600 dark:text-amber-400" />
        <span class="text-sm font-medium text-amber-700 dark:text-amber-300">
            {t("stores.adminAllStores", { role: isSuperAdmin ? "Super Admin" : "Admin" })}
        </span>
    </div>
{/if}
