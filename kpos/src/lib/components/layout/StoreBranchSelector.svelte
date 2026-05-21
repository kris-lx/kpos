<!-- ═══════════════════════════════════════════════════════════════════════════
     Branch Selector — visible to hq_admin and above for cross-branch switching
     ═══════════════════════════════════════════════════════════════════════════ -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '$api';
    import { auth } from '$stores/auth.svelte';
    import { Building2, ChevronDown, Check, Search, Loader2 } from 'lucide-svelte';
    import { cn } from '$utils';

    interface Branch {
        id: string;
        name: string;
        code: string;
        parentBranchId: string | null;
        branchPath: string;
        isMain: boolean;
        logo: string | null;
    }

    let branches = $state<Branch[]>([]);
    let loading = $state(false);
    let isOpen = $state(false);
    let search = $state('');
    let selectedBranchId = $state<string | null>(auth.activeBranchId);

    const filtered = $derived(
        search
            ? branches.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || b.code.toLowerCase().includes(search.toLowerCase()))
            : branches
    );

    const selected = $derived(branches.find(b => b.id === selectedBranchId) ?? null);

    async function loadBranches() {
        loading = true;
        try {
            const res = await api.get('branches/accessible').json<{ success: boolean; data: Branch[] }>();
            if (res.success) branches = res.data;
        } catch {
            branches = [];
        } finally {
            loading = false;
        }
    }

    function select(id: string) {
        selectedBranchId = id;
        isOpen = false;
        search = '';
        // Emit selected branch so parent layout can inject X-Branch-Id header
        document.dispatchEvent(new CustomEvent('branch-changed', { detail: { branchId: id } }));
    }

    function handleClickOutside(e: MouseEvent) {
        if (!(e.target as HTMLElement).closest('.branch-selector')) isOpen = false;
    }

    // Only show for HQ level and above (roleLevel <= 4)
    const show = $derived(auth.isHQLevel && branches.length > 1);

    onMount(() => {
        if (auth.isHQLevel) loadBranches();
    });
</script>

<svelte:window onclick={handleClickOutside} />

{#if show}
<div class="branch-selector relative">
    <button
        type="button"
        class={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg transition-all',
            'bg-base-200 hover:bg-base-300 border border-base-300 text-sm font-medium',
            isOpen && 'ring-2 ring-primary/50'
        )}
        onclick={() => (isOpen = !isOpen)}
    >
        <Building2 class="h-4 w-4 text-primary" />
        <span class="max-w-[140px] truncate">
            {#if loading}
                <Loader2 class="h-3 w-3 animate-spin inline" />
            {:else}
                {selected?.name ?? 'ທຸກສາຂາ'}
            {/if}
        </span>
        <ChevronDown class={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
    </button>

    {#if isOpen}
        <div class="absolute top-full left-0 mt-2 w-72 z-50 bg-base-100 rounded-xl shadow-xl border border-base-200 max-h-80 flex flex-col">
            <div class="p-2 border-b border-base-200">
                <div class="flex items-center gap-2 px-2">
                    <Search class="h-3.5 w-3.5 text-base-content/50" />
                    <input
                        type="text"
                        placeholder="ຄົ້ນຫາສາຂາ..."
                        class="flex-1 bg-transparent text-sm outline-none py-1"
                        bind:value={search}
                        onclick={e => e.stopPropagation()}
                    />
                </div>
            </div>

            <div class="overflow-y-auto flex-1 p-1">
                {#each filtered as branch}
                    <button
                        type="button"
                        class={cn(
                            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-base-200',
                            selectedBranchId === branch.id && 'bg-primary/10 border border-primary/30'
                        )}
                        onclick={() => select(branch.id)}
                    >
                        <Building2 class="h-4 w-4 shrink-0 text-base-content/50" />
                        <div class="flex-1 min-w-0">
                            <div class="font-medium truncate text-sm">{branch.name}</div>
                            <div class="text-xs text-base-content/50">{branch.code}</div>
                        </div>
                        {#if branch.isMain}
                            <span class="badge badge-xs badge-primary">HQ</span>
                        {/if}
                        {#if selectedBranchId === branch.id}
                            <Check class="h-4 w-4 text-primary shrink-0" />
                        {/if}
                    </button>
                {/each}

                {#if filtered.length === 0}
                    <div class="text-center py-6 text-base-content/50 text-sm">ບໍ່ພົບສາຂາ</div>
                {/if}
            </div>
        </div>
    {/if}
</div>
{/if}
