<!-- ═══════════════════════════════════════════════════════════════════════════
     Store Selector Component - Multi-store/branch switching
     ═══════════════════════════════════════════════════════════════════════════ -->
<script lang="ts">
    import { auth, type StoreAccess } from '$stores/auth.svelte';
    import { t } from '$lib/i18n/index.svelte';
    import { cn } from '$utils';
    import {
        Store,
        Building2,
        ChevronDown,
        Check,
        MapPin,
        Shield,
        ShieldCheck,
        ShieldX
    } from 'lucide-svelte';

    let isOpen = $state(false);
    let searchQuery = $state('');

    // Filtered stores based on search. Stores are the top-level tier now — a
    // store's `branchId`/`branchName` (when set) means this particular grant
    // is narrowed to one branch WITHIN that store, not "the branch this store
    // belongs to". So this is a flat list of stores, not stores grouped under
    // branch headers.
    const filteredStores = $derived.by(() => {
        if (!searchQuery) return auth.accessibleStores;
        const query = searchQuery.toLowerCase();
        return auth.accessibleStores.filter(
            (s) =>
                s.storeName.toLowerCase().includes(query) ||
                (s.branchName ?? '').toLowerCase().includes(query)
        );
    });

    function selectStore(storeId: string) {
        auth.setActiveStore(storeId);
        isOpen = false;
        searchQuery = '';
    }

    function getAccessBadge(store: StoreAccess) {
        if (store.canManage) return { icon: ShieldCheck, label: t('access.manage'), color: 'text-success-500' };
        if (store.canWrite) return { icon: Shield, label: t('access.write'), color: 'text-blue-500' };
        if (store.canRead) return { icon: Shield, label: t('access.read'), color: 'text-gray-500' };
        return { icon: ShieldX, label: t('access.none'), color: 'text-danger-500' };
    }

    // Close on click outside
    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.store-selector')) {
            isOpen = false;
        }
    }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="store-selector relative">
    <!-- Trigger Button -->
    <button
        type="button"
        class={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg transition-all',
            'bg-base-200 hover:bg-base-300 border border-base-300',
            'text-sm font-medium',
            isOpen && 'ring-2 ring-primary/50'
        )}
        onclick={() => (isOpen = !isOpen)}
    >
        <Store class="h-4 w-4 text-primary" />
        <div class="flex flex-col items-start">
            {#if auth.activeStore}
                <span class="text-sm font-medium">{auth.activeStore.storeName}</span>
                {#if auth.activeStore.branchName}
                    <span class="text-xs text-base-content/60">{auth.activeStore.branchName}</span>
                {/if}
            {:else}
                <span class="text-sm">{t('stores.selectStore')}</span>
            {/if}
        </div>
        <ChevronDown class={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
    </button>

    <!-- Dropdown -->
    {#if isOpen}
        <div
            class={cn(
                'absolute top-full left-0 mt-2 w-80 z-50',
                'bg-base-100 rounded-xl shadow-xl border border-base-200',
                'max-h-96 overflow-hidden flex flex-col'
            )}
        >
            <!-- Search -->
            <div class="p-3 border-b border-base-200">
                <input
                    type="text"
                    placeholder={t('stores.searchPlaceholder')}
                    class="input input-sm input-bordered w-full"
                    bind:value={searchQuery}
                    onclick={(e) => e.stopPropagation()}
                />
            </div>

            <!-- Store List -->
            <div class="overflow-y-auto flex-1 p-2">
                {#if auth.accessibleStores.length === 0}
                    <div class="text-center py-8 text-base-content/60">
                        <Store class="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p class="text-sm">{t('stores.noAccessibleStores')}</p>
                    </div>
                {:else}
                    {#each filteredStores as store}
                        {@const accessBadge = getAccessBadge(store)}
                        <button
                            type="button"
                            class={cn(
                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all',
                                'hover:bg-base-200 text-left',
                                auth.activeStoreId === store.storeId && 'bg-primary/10 border border-primary/30'
                            )}
                            onclick={() => selectStore(store.storeId)}
                        >
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="font-medium truncate">{store.storeName}</span>
                                    {#if store.isDefault}
                                        <span class="badge badge-xs badge-primary">{t('common.default')}</span>
                                    {/if}
                                </div>
                                {#if store.branchName}
                                    <div class="flex items-center gap-1 text-xs text-base-content/60 mt-0.5">
                                        <Building2 class="h-3 w-3" />
                                        <span class="truncate">{store.branchName}</span>
                                    </div>
                                {/if}
                                <div class="flex items-center gap-1 text-xs text-base-content/60 mt-0.5">
                                    {#if accessBadge.icon}
                                        {@const IconComponent = accessBadge.icon}
                                        <IconComponent class={cn('h-3 w-3', accessBadge.color)} />
                                    {/if}
                                    <span>{accessBadge.label}</span>
                                </div>
                            </div>

                            {#if auth.activeStoreId === store.storeId}
                                <Check class="h-4 w-4 text-primary shrink-0" />
                            {/if}
                        </button>
                    {/each}
                {/if}
            </div>

            <!-- Footer Info -->
            <div class="p-3 border-t border-base-200 bg-base-50 text-xs text-base-content/60">
                <div class="flex items-center gap-2">
                    <MapPin class="h-3 w-3" />
                    <span>
                        {t('stores.summaryCount', { stores: auth.accessibleStores.length })}
                    </span>
                </div>
            </div>
        </div>
    {/if}
</div>
