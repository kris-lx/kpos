<script lang="ts">
    import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
    import { get } from 'svelte/store';
    import { api } from '$lib/api';
    import { toast } from 'svelte-sonner';
    import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, RefreshCw, ChevronDown, ChevronRight, Tag, Loader2, X, Check, Shield } from 'lucide-svelte';

    const queryClient = useQueryClient();

    // ── State ──────────────────────────────────────────────────────────────────
    let expandedTypes = $state<Set<string>>(new Set());
    let showAddModal = $state(false);
    let showEditModal = $state(false);
    let editingEnum = $state<any>(null);
    let selectedType = $state('');
    let seedLoading = $state(false);

    let addForm = $state({ type: '', value: '', label: '', labelLao: '', order: 0 });
    let editForm = $state({ label: '', labelLao: '', order: 0, isActive: true });

    // ── Queries ────────────────────────────────────────────────────────────────
    const enumsQuery = createQuery({
        queryKey: ['admin-enums'],
        queryFn: () => api.get('admin/enums').json<any>(),
    });

    // ── Derived ────────────────────────────────────────────────────────────────
    let data = $derived($enumsQuery.data?.data);
    let types = $derived<string[]>(data?.types ?? []);
    let grouped = $derived<Record<string,any[]>>(data?.grouped ?? {});

    // ── Mutations ──────────────────────────────────────────────────────────────
    const addMutation = createMutation({
        mutationFn: (body: any) => api.post('admin/enums', { json: body }).json<any>(),
        onSuccess: () => {
            toast.success('ເພີ່ມສຳເລັດ');
            get(enumsQuery).refetch();
            showAddModal = false;
            addForm = { type: '', value: '', label: '', labelLao: '', order: 0 };
        },
        onError: (e: any) => toast.error(e?.message ?? 'ເກີດຂໍ້ຜິດພາດ'),
    });

    const updateMutation = createMutation({
        mutationFn: ({ id, body }: { id: string; body: any }) =>
            api.put(`admin/enums/${id}`, { json: body }).json<any>(),
        onSuccess: () => {
            toast.success('ບັນທຶກສຳເລັດ');
            get(enumsQuery).refetch();
            showEditModal = false;
        },
        onError: (e: any) => toast.error(e?.message ?? 'ເກີດຂໍ້ຜິດພາດ'),
    });

    const deleteMutation = createMutation({
        mutationFn: (id: string) => api.delete(`admin/enums/${id}`).json<any>(),
        onSuccess: () => {
            toast.success('ລຶບສຳເລັດ');
            get(enumsQuery).refetch();
        },
        onError: (e: any) => toast.error(e?.message ?? 'ລຶບບໍ່ໄດ້: ' + (e?.message ?? '')),
    });

    // ── Helpers ────────────────────────────────────────────────────────────────
    const TYPE_LABELS: Record<string, string> = {
        business_type: 'ປະເພດທຸລະກິດ',
        stockout_reason: 'ສາເຫດນຳສິນຄ້າອອກ',
        adjust_reason: 'ສາເຫດປັບສາງ',
        promotion_type: 'ປະເພດໂປຣໂມຊັ່ນ',
        coupon_type: 'ປະເພດຄູປ໋ອງ',
        discount_type: 'ປະເພດສ່ວນຫຼຸດ',
        gender: 'ເພດ',
        payment_method: 'ວິທີຊຳລະ',
        id_type: 'ປະເພດບັດ/ເອກະສານ',
        nationality: 'ສັນຊາດ',
    };

    function toggle(type: string) {
        if (expandedTypes.has(type)) {
            expandedTypes.delete(type);
        } else {
            expandedTypes.add(type);
        }
        expandedTypes = new Set(expandedTypes);
    }

    function openAdd(type = '') {
        addForm = { type, value: '', label: '', labelLao: '', order: 0 };
        selectedType = type;
        showAddModal = true;
    }

    function openEdit(e: any) {
        editingEnum = e;
        editForm = { label: e.label, labelLao: e.labelLao ?? '', order: e.order, isActive: e.isActive };
        showEditModal = true;
    }

    async function handleSeed() {
        if (!confirm('ເພີ່ມຂໍ້ມູນ enum ເລີ່ມຕົ້ນທັງໝົດເຂົ້າ DB? ຂໍ້ມູນທີ່ມີຢູ່ຈະຖືກຂ້າມ.')) return;
        seedLoading = true;
        try {
            const res = await api.post('admin/enums/seed').json<any>();
            toast.success(`Seeded: ${res.data.inserted} ລາຍການ, ຂ້າມ: ${res.data.skipped}`);
            queryClient.invalidateQueries({ queryKey: ['admin-enums'] });
            queryClient.invalidateQueries({ queryKey: ['enums'] });
        } catch (e: any) {
            toast.error('Seed ລົ້ມເຫຼວ');
        } finally {
            seedLoading = false;
        }
    }

    function toggleActive(e: any) {
        $updateMutation.mutate({ id: e.id, body: { isActive: !e.isActive } });
    }

    function confirmDelete(e: any) {
        if (e.isSystem) { toast.error('ລຶບ System Enum ບໍ່ໄດ້ — ປິດໃຊ້ງານແທນ'); return; }
        if (!confirm(`ລຶບ "${e.label}" ອອກ?`)) return;
        $deleteMutation.mutate(e.id);
    }
</script>

<div class="p-6 space-y-6 max-w-5xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ຈັດການ Enums</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ຈັດການຄ່າ dropdown ທັງໝົດໃນລະບົບ — ເກັບໃນ Database</p>
        </div>
        <div class="flex items-center gap-3">
            <button onclick={handleSeed} disabled={seedLoading}
                class="flex items-center gap-2 px-4 py-2 border border-amber-400 text-amber-700 dark:text-amber-400 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 text-sm font-medium disabled:opacity-50">
                {#if seedLoading}<Loader2 class="w-4 h-4 animate-spin" />{:else}<RefreshCw class="w-4 h-4" />{/if}
                Seed ຂໍ້ມູນເລີ່ມຕົ້ນ
            </button>
            <button onclick={() => openAdd()}
                class="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium">
                <Plus class="w-4 h-4" />ເພີ່ມ Enum
            </button>
        </div>
    </div>

    <!-- Stats -->
    {#if data}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p class="text-xs text-gray-500 mb-1">ປະເພດທັງໝົດ</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{types.length}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p class="text-xs text-gray-500 mb-1">ລາຍການທັງໝົດ</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{data.flat?.length ?? 0}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p class="text-xs text-gray-500 mb-1">ເປີດໃຊ້ງານ</p>
            <p class="text-2xl font-bold text-emerald-600">{data.flat?.filter((e: any) => e.isActive).length ?? 0}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p class="text-xs text-gray-500 mb-1">System (ລົ້ມບໍ່ໄດ້)</p>
            <p class="text-2xl font-bold text-blue-600">{data.flat?.filter((e: any) => e.isSystem).length ?? 0}</p>
        </div>
    </div>
    {/if}

    <!-- Enum Groups -->
    {#if $enumsQuery.isPending}
        <div class="flex items-center justify-center py-20"><Loader2 class="w-8 h-8 animate-spin text-primary-500" /></div>
    {:else if types.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
            <Tag class="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p class="text-gray-500 mb-4">ຍັງບໍ່ມີ Enum ໃນ Database</p>
            <button onclick={handleSeed} disabled={seedLoading}
                class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium">
                Seed ຂໍ້ມູນເລີ່ມຕົ້ນ
            </button>
        </div>
    {:else}
        <div class="space-y-3">
            {#each types as type (type)}
                {@const items = grouped[type] ?? []}
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <!-- Type header -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div onclick={() => toggle(type)}
                        class="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors cursor-pointer">
                        <div class="flex items-center gap-3">
                            {#if expandedTypes.has(type)}
                                <ChevronDown class="w-4 h-4 text-gray-400" />
                            {:else}
                                <ChevronRight class="w-4 h-4 text-gray-400" />
                            {/if}
                            <div>
                                <span class="font-semibold text-gray-900 dark:text-white">{TYPE_LABELS[type] ?? type}</span>
                                <code class="ml-2 text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{type}</code>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-gray-400">{items.length} ລາຍການ</span>
                            <button onclick={(e) => { e.stopPropagation(); openAdd(type); }}
                                class="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 px-2 py-1 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20">
                                <Plus class="w-3.5 h-3.5" />ເພີ່ມ
                            </button>
                        </div>
                    </div>

                    <!-- Items -->
                    {#if expandedTypes.has(type)}
                        <div class="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                            {#each items as item (item.id)}
                                <div class="flex items-center gap-3 px-5 py-3 {item.isActive ? '' : 'opacity-50'}">
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="text-sm font-medium text-gray-900 dark:text-white">{item.labelLao || item.label}</span>
                                            {#if item.labelLao}
                                                <span class="text-xs text-gray-400">{item.label}</span>
                                            {/if}
                                            {#if item.isSystem}
                                                <span class="flex items-center gap-0.5 text-[10px] text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">
                                                    <Shield class="w-3 h-3" />System
                                                </span>
                                            {/if}
                                            {#if !item.isActive}
                                                <span class="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">ປິດ</span>
                                            {/if}
                                        </div>
                                        <code class="text-xs text-gray-400">{item.value}</code>
                                    </div>
                                    <span class="text-xs text-gray-400 w-6 text-center">{item.order}</span>
                                    <div class="flex items-center gap-1">
                                        <button onclick={() => toggleActive(item)} title="{item.isActive ? 'ປິດ' : 'ເປີດ'}ໃຊ້ງານ"
                                            class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600">
                                            {#if item.isActive}
                                                <ToggleRight class="w-4 h-4 text-emerald-500" />
                                            {:else}
                                                <ToggleLeft class="w-4 h-4" />
                                            {/if}
                                        </button>
                                        <button onclick={() => openEdit(item)}
                                            class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600">
                                            <Pencil class="w-4 h-4" />
                                        </button>
                                        <button onclick={() => confirmDelete(item)} disabled={item.isSystem}
                                            class="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed">
                                            <Trash2 class="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- Add Modal -->
{#if showAddModal}
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
            <h2 class="font-semibold text-gray-900 dark:text-white">ເພີ່ມ Enum ໃໝ່</h2>
            <button onclick={() => showAddModal = false} class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X class="w-4 h-4" /></button>
        </div>
        <div class="p-5 space-y-4">
            <div>
                <label for="add-type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ປະເພດ (type) <span class="text-red-500">*</span></label>
                <input id="add-type" type="text" bind:value={addForm.type} placeholder="business_type"
                    list="type-list"
                    class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500" />
                <datalist id="type-list">
                    {#each types as tp}<option value={tp}></option>{/each}
                </datalist>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label for="add-value" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Value <span class="text-red-500">*</span></label>
                    <input id="add-value" type="text" bind:value={addForm.value} placeholder="retail"
                        class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                    <label for="add-order" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ລຳດັບ</label>
                    <input id="add-order" type="number" bind:value={addForm.order} min="0"
                        class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500" />
                </div>
            </div>
            <div>
                <label for="add-label" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label (ພາສາອັງກິດ) <span class="text-red-500">*</span></label>
                <input id="add-label" type="text" bind:value={addForm.label} placeholder="Retail Shop"
                    class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
                <label for="add-label-lao" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label (ພາສາລາວ)</label>
                <input id="add-label-lao" type="text" bind:value={addForm.labelLao} placeholder="ຮ້ານຂາຍຍ່ອຍ"
                    class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500" />
            </div>
        </div>
        <div class="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
            <button onclick={() => showAddModal = false} class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700">ຍົກເລີກ</button>
            <button onclick={() => $addMutation.mutate(addForm)} disabled={$addMutation.isPending || !addForm.type || !addForm.value || !addForm.label}
                class="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                {#if $addMutation.isPending}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Check class="w-4 h-4" />{/if}
                ບັນທຶກ
            </button>
        </div>
    </div>
</div>
{/if}

<!-- Edit Modal -->
{#if showEditModal && editingEnum}
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
            <div>
                <h2 class="font-semibold text-gray-900 dark:text-white">ແກ້ໄຂ Enum</h2>
                <code class="text-xs text-gray-400">{editingEnum.type} / {editingEnum.value}</code>
            </div>
            <button onclick={() => showEditModal = false} class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X class="w-4 h-4" /></button>
        </div>
        <div class="p-5 space-y-4">
            <div>
                <label for="edit-label" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label (ພາສາອັງກິດ)</label>
                <input id="edit-label" type="text" bind:value={editForm.label}
                    class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
                <label for="edit-label-lao" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label (ພາສາລາວ)</label>
                <input id="edit-label-lao" type="text" bind:value={editForm.labelLao}
                    class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500" />
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label for="edit-order" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ລຳດັບ</label>
                    <input id="edit-order" type="number" bind:value={editForm.order} min="0"
                        class="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500" />
                </div>
                <div class="flex flex-col justify-end">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" bind:checked={editForm.isActive} class="rounded" />
                        <span class="text-sm text-gray-700 dark:text-gray-300">ເປີດໃຊ້ງານ</span>
                    </label>
                </div>
            </div>
        </div>
        <div class="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
            <button onclick={() => showEditModal = false} class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700">ຍົກເລີກ</button>
            <button onclick={() => $updateMutation.mutate({ id: editingEnum.id, body: editForm })}
                disabled={$updateMutation.isPending}
                class="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                {#if $updateMutation.isPending}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Check class="w-4 h-4" />{/if}
                ບັນທຶກ
            </button>
        </div>
    </div>
</div>
{/if}
