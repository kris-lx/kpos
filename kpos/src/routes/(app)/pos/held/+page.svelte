<script lang="ts">
    import { onMount } from "svelte";
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { auth } from "$stores";
    import { formatCurrency, formatDateTime } from "$lib/utils";
    import { goto } from "$app/navigation";
    import { toast } from "svelte-sonner";
    import {
        Clock,
        ShoppingCart,
        X,
        RefreshCw,
        Loader2,
        AlertCircle,
        ArrowRight,
        Trash2,
        Eye,
        ArrowLeft,
        ClipboardList,
        StickyNote,
    } from "lucide-svelte";

    const t = i18n.t;

    let heldOrders = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showModal = $state(false);
    let selectedOrder = $state<any>(null);
    let resumingOrderId = $state<string | null>(null);
    let deletingOrderId = $state<string | null>(null);

    onMount(() => {
        loadHeldOrders();
    });

    async function ensureAuthReady(): Promise<boolean> {
        if (auth.isAuthenticated) return true;
        if (!auth.user) return false;
        return auth.refresh();
    }

    function isAuthError(err: unknown): boolean {
        const status = (err as { response?: { status?: number } })?.response?.status;
        return status === 401 || status === 403;
    }

    async function loadHeldOrders() {
        loading = true;
        error = null;
        try {
            if (!(await ensureAuthReady())) return;
            const response = await api.get("sales/held").json<any>();
            if (response.success) {
                heldOrders = response.data || [];
            } else {
                error = response.error?.message || t('common.loadError');
                heldOrders = [];
            }
        } catch (err) {
            if (isAuthError(err)) return;
            console.error("Failed to load held orders:", err);
            error = t('common.connectError');
            heldOrders = [];
        } finally {
            loading = false;
        }
    }

    function viewDetails(order: any) {
        selectedOrder = order;
        showModal = true;
    }

    async function resumeOrder(order: any) {
        resumingOrderId = order.id;
        try {
            // Delete the held order first
            await api.delete(`sales/held/${order.id}`).json();
            
            // Navigate to POS with order data in URL state
            toast.success(t('pos.billRecalled'));
            // Store order data temporarily for POS page to pick up
            sessionStorage.setItem('kpos_resume_order', JSON.stringify(order));
            goto("/pos");
        } catch (err) {
            console.error("Failed to resume order:", err);
            toast.error("ບໍ່ສາມາດດຳເນີນອໍເດີຕໍ່ໄດ້");
        } finally {
            resumingOrderId = null;
        }
    }

    async function deleteOrder(order: any) {
        if (!confirm("ຕ້ອງການລົບອໍເດີນີ້ບໍ?")) return;
        deletingOrderId = order.id;
        try {
            await api.delete(`sales/held/${order.id}`).json();
            toast.success("ລົບອໍເດີສຳເລັດແລ້ວ");
            await loadHeldOrders();
        } catch (err) {
            console.error("Failed to delete order:", err);
            toast.error("ບໍ່ສາມາດລົບອໍເດີໄດ້");
        } finally {
            deletingOrderId = null;
        }
    }

    function getTimeSince(date: string): string {
        const now = new Date();
        const created = new Date(date);
        const diff = now.getTime() - created.getTime();
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours} ຊົ່ວໂມງ ${minutes % 60} ນາທີ`;
        }
        return `${minutes} ນາທີ`;
    }
</script>

<svelte:head>
    <title>ອໍເດີຄ້າງ - KPOS</title>
</svelte:head>

<div class="p-6 dark:bg-gray-900 min-h-screen">
    <div class="flex justify-between items-center mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ອໍເດີຄ້າງ</h1>
            <p class="text-gray-500 dark:text-gray-400">ອໍເດີທີ່ຖືກເກັບໄວ້ຊົ່ວຄາວ</p>
        </div>
        <a
            href="/pos"
            class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
            <ArrowLeft class="w-4 h-4" />
            ກັບໄປໜ້າຂາຍ
        </a>
    </div>

    {#if loading}
        <div class="flex flex-col items-center justify-center py-12">
            <Loader2 class="w-8 h-8 text-primary-600 animate-spin" />
            <p class="mt-3 text-gray-500 dark:text-gray-400">ກຳລັງໂຫລດຂໍ້ມູນ...</p>
        </div>
    {:else if error}
        <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <AlertCircle class="w-16 h-16 mx-auto text-danger-400" />
            <p class="mt-4 text-gray-700 dark:text-gray-300 font-medium">{error}</p>
            <p class="mt-1 text-gray-500 dark:text-gray-400 text-sm">ກະລຸນາລອງໃໝ່ອີກຄັ້ງ</p>
            <button
                onclick={() => loadHeldOrders()}
                class="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
                <RefreshCw class="w-4 h-4" />
                ລອງໃໝ່
            </button>
        </div>
    {:else if heldOrders.length === 0}
        <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <ClipboardList class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <p class="mt-4 text-gray-500 dark:text-gray-400">ບໍ່ມີອໍເດີຄ້າງ</p>
            <a
                href="/pos"
                class="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
                <ShoppingCart class="w-4 h-4" />
                ໄປໜ້າຂາຍ
            </a>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each heldOrders as order (order.id)}
                <div
                    class="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow"
                >
                    <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="font-bold text-gray-900 dark:text-white">
                                    {order.name || 'ອໍເດີຄ້າງ'}
                                </p>
                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                    {formatDateTime(order.createdAt)}
                                </p>
                            </div>
                            <div class="text-right">
                                <p class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 justify-end">
                                    <Clock class="w-3 h-3" />
                                    ຄ້າງມາ
                                </p>
                                <p class="text-sm font-medium text-orange-600 dark:text-orange-400">
                                    {getTimeSince(order.createdAt)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="p-4">
                        <div class="space-y-2 mb-3">
                            {#each (order.items || []).slice(0, 3) as item (item.productName || item.name)}
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-600 dark:text-gray-300"
                                        >{item.productName || item.name} x{item.quantity}</span
                                    >
                                    <span class="text-gray-900 dark:text-white"
                                        >{formatCurrency(item.total || (item.unitPrice * item.quantity))}</span
                                    >
                                </div>
                            {/each}
                            {#if (order.items || []).length > 3}
                                <p class="text-sm text-gray-400 dark:text-gray-500">
                                    ... ແລະ {order.items.length - 3} ລາຍການອື່ນ
                                </p>
                            {/if}
                        </div>

                        {#if order.note}
                            <div
                                class="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-yellow-700 dark:text-yellow-400 mb-3 flex items-start gap-2"
                            >
                                <StickyNote class="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{order.note}</span>
                            </div>
                        {/if}

                        <div
                            class="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700"
                        >
                            <div>
                                <p class="text-xs text-gray-500 dark:text-gray-400">ຍອດລວມ</p>
                                <p class="text-lg font-bold text-primary-600 dark:text-primary-400">
                                    {formatCurrency(order.subtotal)}
                                </p>
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400">
                                {(order.items || []).length} ລາຍການ
                            </p>
                        </div>
                    </div>

                    <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg flex gap-2 border-t border-gray-200 dark:border-gray-700">
                        <button
                            onclick={() => resumeOrder(order)}
                            disabled={resumingOrderId === order.id}
                            class="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {#if resumingOrderId === order.id}
                                <Loader2 class="w-4 h-4 animate-spin" />
                            {:else}
                                <ArrowRight class="w-4 h-4" />
                            {/if}
                            ດຳເນີນຕໍ່
                        </button>
                        <button
                            onclick={() => viewDetails(order)}
                            class="px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <Eye class="w-5 h-5" />
                        </button>
                        <button
                            onclick={() => deleteOrder(order)}
                            disabled={deletingOrderId === order.id}
                            class="px-3 py-2 text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {#if deletingOrderId === order.id}
                                <Loader2 class="w-5 h-5 animate-spin" />
                            {:else}
                                <Trash2 class="w-5 h-5" />
                            {/if}
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

{#if showModal && selectedOrder}
    <div
        class="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50"
        role="dialog"
        aria-modal="true"
    >
        <div
            class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
        >
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">{selectedOrder.name || 'ອໍເດີຄ້າງ'}</h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {formatDateTime(selectedOrder.createdAt)}
                    </p>
                </div>
                <button
                    onclick={() => (showModal = false)}
                    aria-label="ປິດ"
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                    <X class="w-6 h-6" />
                </button>
            </div>

            <div class="space-y-2 mb-4">
                {#each (selectedOrder.items || []) as item (item.productName || item.name)}
                    <div class="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                        <div>
                            <p class="font-medium text-gray-900 dark:text-white">{item.productName || item.name}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                {formatCurrency(item.unitPrice || item.price)} x {item.quantity}
                            </p>
                        </div>
                        <p class="font-medium text-gray-900 dark:text-white">{formatCurrency(item.total || (item.unitPrice * item.quantity))}</p>
                    </div>
                {/each}
            </div>

            <div class="flex justify-between py-3 border-t-2 border-gray-900 dark:border-gray-100">
                <span class="font-bold text-lg text-gray-900 dark:text-white">ລວມ</span>
                <span class="font-bold text-lg text-primary-600 dark:text-primary-400"
                    >{formatCurrency(selectedOrder.subtotal)}</span
                >
            </div>

            {#if selectedOrder.note}
                <div class="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg mt-4 flex items-start gap-2">
                    <StickyNote class="w-4 h-4 text-yellow-700 dark:text-yellow-400 shrink-0 mt-0.5" />
                    <p class="text-sm text-yellow-700 dark:text-yellow-400">
                        {selectedOrder.note}
                    </p>
                </div>
            {/if}

            <div class="mt-4 text-sm text-gray-500 dark:text-gray-400 space-y-1">
                <p>{(selectedOrder.items || []).length} ລາຍການ</p>
                <p class="flex items-center gap-1">
                    <Clock class="w-3 h-3" />
                    ເວລາ: {formatDateTime(selectedOrder.createdAt)}
                </p>
            </div>

            <div class="flex gap-3 mt-6">
                <button
                    onclick={() => {
                        showModal = false;
                        resumeOrder(selectedOrder);
                    }}
                    disabled={resumingOrderId === selectedOrder.id}
                    class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {#if resumingOrderId === selectedOrder.id}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {:else}
                        <ArrowRight class="w-4 h-4" />
                    {/if}
                    ດຳເນີນຕໍ່
                </button>
                <button
                    onclick={() => (showModal = false)}
                    class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                    ປິດ
                </button>
            </div>
        </div>
    </div>
{/if}
