<!-- ═══════════════════════════════════════════════════════════════════════════
     Store Selector Component - Multi-store/branch switching
     ═══════════════════════════════════════════════════════════════════════════ -->
<script lang="ts">
    import { auth, type StoreAccess } from '$stores/auth.svelte';
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

    // Filtered stores based on search
    const filteredStores = $derived.by(() => {
        if (!searchQuery) return auth.accessibleStores;
        const query = searchQuery.toLowerCase();
        return auth.accessibleStores.filter(
            (s) =>
                s.storeName.toLowerCase().includes(query) ||
                s.branchName.toLowerCase().includes(query)
        );
    });

    // Group stores by branch
    const groupedStores = $derived.by(() => {
        const grouped: Record<string, { branchName: string; stores: StoreAccess[] }> = {};
        for (const store of filteredStores) {
            if (!grouped[store.branchId]) {
                grouped[store.branchId] = {
                    branchName: store.branchName,
                    stores: []
                };
            }
            grouped[store.branchId].stores.push(store);
        }
        return grouped;
    });

    function selectStore(storeId: string) {
        auth.setActiveStore(storeId);
        isOpen = false;
        searchQuery = '';
    }

    function getAccessBadge(store: StoreAccess) {
        if (store.canManage) return { icon: ShieldCheck, label: 'ຈັດການ', color: 'text-success-500' };
        if (store.canWrite) return { icon: Shield, label: 'ແກ້ໄຂ', color: 'text-blue-500' };
        if (store.canRead) return { icon: Shield, label: 'ອ່ານ', color: 'text-gray-500' };
        return { icon: ShieldX, label: 'ບໍ່ມີ', color: 'text-danger-500' };
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
                <span class="text-xs text-base-content/60">{auth.activeStore.branchName}</span>
            {:else}
                <span class="text-sm">ເລືອກຮ້ານ</span>
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
                    placeholder="ຄົ້ນຫາຮ້ານ..."
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
                        <p class="text-sm">ບໍ່ມີຮ້ານທີ່ເຂົ້າເຖິງໄດ້</p>
                    </div>
                {:else}
                    {#each Object.entries(groupedStores) as [branchId, group]}
                        <div class="mb-3">
                            <!-- Branch Header -->
                            <div class="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-base-content/70 uppercase">
                                <Building2 class="h-3 w-3" />
                                {group.branchName}
                            </div>

                            <!-- Stores in Branch -->
                            {#each group.stores as store}
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
                                                <span class="badge badge-xs badge-primary">ຄ່າເລີ່ມຕົ້ນ</span>
                                            {/if}
                                        </div>
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
                        </div>
                    {/each}
                {/if}
            </div>

            <!-- Footer Info -->
            <div class="p-3 border-t border-base-200 bg-base-50 text-xs text-base-content/60">
                <div class="flex items-center gap-2">
                    <MapPin class="h-3 w-3" />
                    <span>
                        {auth.accessibleStores.length} ຮ້ານ ໃນ {auth.accessibleBranchIds.length} ສາຂາ
                    </span>
                </div>
            </div>
        </div>
    {/if}
</div>
