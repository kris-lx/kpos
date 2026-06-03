<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { api } from "$lib/api";
    import { auth } from "$lib/stores/auth.svelte";
    import { toast } from "svelte-sonner";
    import { cn } from "$lib/utils";
    import {
        Plus, Trash2, X, Loader2, Briefcase, Search, Edit, Users, Save,
    } from "lucide-svelte";

    let positions = $state<any[]>([]);
    let isLoading = $state(true);
    let isSaving = $state(false);
    let showModal = $state(false);
    let editingPosition = $state<any>(null);
    let showDeleteModal = $state(false);
    let deletingPosition = $state<any>(null);
    let searchQuery = $state("");

    let formData = $state({
        name: "",
        displayName: "",
        description: "",
    });

    let filteredPositions = $derived(
        positions.filter(p =>
            p.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.name?.toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    onMount(async () => {
        if (!auth.user) { goto("/login"); return; }
        if (auth.roleLevel > 5) { goto("/dashboard"); return; }
        await loadPositions();
    });

    async function loadPositions() {
        isLoading = true;
        try {
            const res = await api.get("roles?limit=200").json<any>();
            // Show only non-system, non-elevated roles — these are "positions"
            const elevated = ['super_admin', 'admin', 'hq_admin', 'hq_manager', 'store_owner', 'branch_admin'];
            positions = (res.data || []).filter((r: any) => !r.isSystem && !elevated.includes(r.name));
        } catch {
            toast.error("ບໍ່ສາມາດໂຫຼດຂໍ້ມູນຕຳແໜ່ງໄດ້");
        } finally {
            isLoading = false;
        }
    }

    function openCreate() {
        editingPosition = null;
        formData = { name: "", displayName: "", description: "" };
        showModal = true;
    }

    function openEdit(pos: any) {
        editingPosition = pos;
        formData = { name: pos.name || "", displayName: pos.displayName || "", description: pos.description || "" };
        showModal = true;
    }

    function openDelete(pos: any) {
        deletingPosition = pos;
        showDeleteModal = true;
    }

    function slugify(text: string) {
        return text.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }

    async function handleSave() {
        if (!formData.displayName.trim()) {
            toast.error("ກະລຸນາປ້ອນຊື່ຕຳແໜ່ງ");
            return;
        }
        if (!formData.name.trim()) {
            formData.name = slugify(formData.displayName);
        }
        isSaving = true;
        try {
            let res: any;
            const payload = {
                name: formData.name,
                displayName: formData.displayName,
                description: formData.description,
                isSystem: false,
                permissions: [],
            };
            if (editingPosition) {
                res = await api.put(`roles/${editingPosition.id}`, { json: payload }).json<any>();
            } else {
                res = await api.post("roles", { json: payload }).json<any>();
            }
            if (res.success) {
                toast.success(editingPosition ? "ແກ້ໄຂຕຳແໜ່ງສຳເລັດ" : "ສ້າງຕຳແໜ່ງສຳເລັດ");
                showModal = false;
                await loadPositions();
            } else {
                toast.error(res.error?.message || "ເກີດຂໍ້ຜິດພາດ");
            }
        } catch (e: any) {
            const errData = await e.response?.json?.();
            toast.error(errData?.error?.message || "ເກີດຂໍ້ຜິດພາດ");
        } finally {
            isSaving = false;
        }
    }

    async function handleDelete() {
        if (!deletingPosition) return;
        isSaving = true;
        try {
            const res = await api.delete(`roles/${deletingPosition.id}`).json<any>();
            if (res.success) {
                toast.success("ລົບຕຳແໜ່ງສຳເລັດ");
                showDeleteModal = false;
                deletingPosition = null;
                await loadPositions();
            } else {
                toast.error(res.error?.message || "ເກີດຂໍ້ຜິດພາດ");
            }
        } catch {
            toast.error("ເກີດຂໍ້ຜິດພາດ");
        } finally {
            isSaving = false;
        }
    }
</script>

<svelte:head>
    <title>ຕຳແໜ່ງພະນັກງານ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div class="flex items-center gap-3">
            <div class="p-2.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg">
                <Briefcase class="w-6 h-6 text-white" />
            </div>
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ຕຳແໜ່ງພະນັກງານ</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400">ຈັດການຕຳແໜ່ງ ແລະ ໜ້າທີ່ຂອງພະນັກງານ</p>
            </div>
        </div>
        <button
            onclick={openCreate}
            class="mt-4 sm:mt-0 flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors shadow-lg"
        >
            <Plus class="w-4 h-4" />
            ເພີ່ມຕຳແໜ່ງ
        </button>
    </div>

    <!-- Search -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-6">
        <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
                type="text"
                bind:value={searchQuery}
                placeholder="ຄົ້ນຫາຕຳແໜ່ງ..."
                class="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
        </div>
    </div>

    <!-- Positions Grid -->
    {#if isLoading}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each Array(6) as _, i (i)}
                <div class="bg-white dark:bg-gray-800 rounded-xl p-5 animate-pulse">
                    <div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-3"></div>
                    <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                </div>
            {/each}
        </div>
    {:else if filteredPositions.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
            <Briefcase class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p class="text-gray-500 dark:text-gray-400 font-medium">
                {searchQuery ? "ບໍ່ພົບຕຳແໜ່ງທີ່ຄົ້ນຫາ" : "ຍັງບໍ່ມີຕຳແໜ່ງ"}
            </p>
            {#if !searchQuery}
                <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">ກົດ "ເພີ່ມຕຳແໜ່ງ" ເພື່ອສ້າງຕຳແໜ່ງໃໝ່</p>
            {/if}
        </div>
    {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each filteredPositions as pos (pos.id)}
                <div class="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 group relative">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                            <Briefcase class="w-5 h-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="font-semibold text-gray-900 dark:text-white truncate">{pos.displayName}</h3>
                            <p class="text-xs text-gray-400 dark:text-gray-500 font-mono">{pos.name}</p>
                            {#if pos.description}
                                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{pos.description}</p>
                            {/if}
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onclick={() => openEdit(pos)}
                            class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-violet-600"
                            title="ແກ້ໄຂ"
                        >
                            <Edit class="w-4 h-4" />
                        </button>
                        <button
                            onclick={() => openDelete(pos)}
                            class="p-1.5 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded-lg text-gray-400 hover:text-danger-500"
                            title="ລົບ"
                        >
                            <Trash2 class="w-4 h-4" />
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- Create/Edit Modal -->
{#if showModal}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick={() => (showModal = false)} role="button" tabindex="-1"></div>
    <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-lg font-bold text-gray-900 dark:text-white">
                {editingPosition ? "ແກ້ໄຂຕຳແໜ່ງ" : "ເພີ່ມຕຳແໜ່ງໃໝ່"}
            </h2>
            <button onclick={() => (showModal = false)} class="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <X class="w-5 h-5" />
            </button>
        </div>
        <div class="p-6 space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ຊື່ຕຳແໜ່ງ (ສະແດງ) <span class="text-danger-500">*</span>
                </label>
                <input
                    type="text"
                    bind:value={formData.displayName}
                    oninput={() => { if (!editingPosition) formData.name = slugify(formData.displayName); }}
                    placeholder="ເຊັ່ນ: ພະນັກງານຂາຍ, ຫົວໜ້ານັກງານ"
                    class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ລະຫັດ (ພາສາອັງກິດ, ບໍ່ມີຊ່ອງ)
                </label>
                <input
                    type="text"
                    bind:value={formData.name}
                    placeholder="ເຊັ່ນ: sales_staff, head_cashier"
                    class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
                <p class="text-xs text-gray-400 mt-1">ໃຊ້ສຳລັບລະບົບ, ສ້າງໂດຍອັດຕະໂນມັດຈາກຊື່ຕຳແໜ່ງ</p>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ຄຳອະທິບາຍ
                </label>
                <textarea
                    bind:value={formData.description}
                    rows={3}
                    placeholder="ອະທິບາຍໜ້າທີ່ຂອງຕຳແໜ່ງນີ້..."
                    class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                ></textarea>
            </div>
        </div>
        <div class="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
                onclick={() => (showModal = false)}
                class="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
            >ຍົກເລີກ</button>
            <button
                onclick={handleSave}
                disabled={isSaving}
                class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 font-medium transition-colors disabled:opacity-50"
            >
                {#if isSaving}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" />{/if}
                {editingPosition ? "ບັນທຶກ" : "ສ້າງຕຳແໜ່ງ"}
            </button>
        </div>
    </div>
</div>
{/if}

<!-- Delete Confirm -->
{#if showDeleteModal && deletingPosition}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick={() => (showDeleteModal = false)} role="button" tabindex="-1"></div>
    <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">ຢືນຢັນການລົບ</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
            ລົບຕຳແໜ່ງ <strong>"{deletingPosition.displayName}"</strong>? ພະນັກງານທີ່ໃຊ້ຕຳແໜ່ງນີ້ຈະຖືກກຳນົດເປັນ "staff" ໂດຍອັດຕະໂນມັດ.
        </p>
        <div class="flex gap-3">
            <button onclick={() => (showDeleteModal = false)} class="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-medium">ຍົກເລີກ</button>
            <button
                onclick={handleDelete}
                disabled={isSaving}
                class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-danger-600 text-white rounded-xl hover:bg-danger-700 font-medium disabled:opacity-50"
            >
                {#if isSaving}<Loader2 class="w-4 h-4 animate-spin" />{/if}
                ລົບ
            </button>
        </div>
    </div>
</div>
{/if}
