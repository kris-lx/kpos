<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatCurrency, formatDateTime } from "$lib/utils";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Clock, User, Loader2, X, Calendar, CreditCard, Banknote, Receipt, Timer, AlertCircle, RefreshCw } from "lucide-svelte";
    const t = i18n.t;

    let shifts = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showModal = $state(false);
    let selectedShift = $state<any>(null);
    let dateFilter = $state(new Date().toISOString().split("T")[0]);

    onMount(() => {
        loadShifts();
    });

    async function loadShifts() {
        loading = true;
        error = null;
        try {
            const response = await api
                .get(`management/shifts?date=${dateFilter}`)
                .json<any>();
            if (response.success) {
                shifts = response.data || [];
            }
        } catch (err) {
            console.error("Failed to load shifts:", err);
            error = "ບໍ່ສາມາດໂຫຼດຂໍ້ມູນກະການເຮັດວຽກໄດ້";
            toast.error("ບໍ່ສາມາດໂຫຼດຂໍ້ມູນກະການເຮັດວຽກໄດ້");
            shifts = [];
        } finally {
            loading = false;
        }
    }

    function viewDetails(shift: any) {
        selectedShift = shift;
        showModal = true;
    }

    function getDuration(start: string, end?: string): string {
        const startDate = new Date(start);
        const endDate = end ? new Date(end) : new Date();
        const diff = endDate.getTime() - startDate.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}ຊມ ${minutes}ນທ`;
    }

    function getStatusColor(status: string): string {
        return status === "active"
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }

    $effect(() => {
        if (dateFilter) {
            loadShifts();
        }
    });
</script>

<svelte:head>
    <title>ກະການເຮັດວຽກ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ກະການເຮັດວຽກ</h1>
            <p class="text-gray-500 dark:text-gray-400">ປະຫວັດການເຂົ້າກະຂອງພະນັກງານ</p>
        </div>
        <div class="flex items-center gap-2">
            <Calendar class="w-5 h-5 text-gray-400" />
            <input
                type="date"
                bind:value={dateFilter}
                class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
            />
        </div>
    </div>

    <!-- Stats Summary -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Clock class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ກະທັງໝົດ</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{shifts.length}</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Timer class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ກຳລັງເຮັດວຽກ</p>
                    <p class="text-2xl font-bold text-green-600 dark:text-green-400">
                        {shifts.filter((s) => s.status === "active").length}
                    </p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Receipt class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ລາຍການຂາຍລວມ</p>
                    <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {shifts.reduce((sum, s) => sum + s.transactions, 0)}
                    </p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <Banknote class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ຍອດຂາຍລວມ</p>
                    <p class="text-xl font-bold text-primary-600 dark:text-primary-400">
                        {formatCurrency(
                            shifts.reduce(
                                (sum, s) =>
                                    sum + (s.cashSales || 0) + (s.cardSales || 0),
                                0,
                            ),
                        )}
                    </p>
                </div>
            </div>
        </div>
    </div>

    {#if loading}
        <div class="flex justify-center py-12">
            <Loader2 class="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin" />
        </div>
    {:else if error}
        <div class="flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <AlertCircle class="w-12 h-12 text-red-500 dark:text-red-400 mb-4" />
            <p class="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
            <button
                onclick={() => loadShifts()}
                class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 transition-colors"
            >
                <RefreshCw class="w-4 h-4" />
                ລອງໃໝ່
            </button>
        </div>
    {:else if shifts.length === 0}
        <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <Clock class="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
            <p class="mt-4 text-gray-500 dark:text-gray-400">ບໍ່ມີຂໍ້ມູນກະສຳລັບວັນທີ່ນີ້</p>
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ພະນັກງານ</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ເຄົາເຕີ</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ເວລາເຂົ້າ</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ໄລຍະເວລາ</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ລາຍການ</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ຍອດຂາຍ</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ສະຖານະ</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"></th>
                    </tr>
                </thead>
                <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {#each shifts as shift}
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                                        <User class="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                    </div>
                                    <div>
                                        <p class="font-medium text-gray-900 dark:text-white">{shift.staff.name}</p>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">{shift.staff.role}</p>
                                    </div>
                                </div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                {shift.register.name}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                {formatDateTime(shift.startTime)}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                {getDuration(shift.startTime, shift.endTime)}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                {shift.transactions}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600 dark:text-green-400">
                                {formatCurrency((shift.cashSales || 0) + (shift.cardSales || 0))}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="px-2 py-1 text-xs rounded {getStatusColor(shift.status)}">
                                    {shift.status === "active" ? "ກຳລັງເຮັດວຽກ" : "ອອກກະແລ້ວ"}
                                </span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                                <button
                                    onclick={() => viewDetails(shift)}
                                    class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                >
                                    ລາຍລະອຽດ
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

{#if showModal && selectedShift}
    <div
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onclick={() => (showModal = false)}
        onkeydown={(e) => e.key === "Escape" && (showModal = false)}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div
            class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg"
            onclick={(e) => e.stopPropagation()}
            role="document"
        >
            <div class="flex justify-between items-start mb-4">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">ລາຍລະອຽດກະ</h2>
                <button
                    onclick={() => (showModal = false)}
                    class="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>

            <div class="space-y-4">
                <div class="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div class="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <User class="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                        <p class="font-medium text-gray-900 dark:text-white">{selectedShift.staff.name}</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">{selectedShift.staff.role}</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">ເຄົາເຕີ</p>
                        <p class="font-medium text-gray-900 dark:text-white">{selectedShift.register.name}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">ສະຖານະ</p>
                        <span class="px-2 py-1 text-xs rounded {getStatusColor(selectedShift.status)}">
                            {selectedShift.status === "active" ? "ກຳລັງເຮັດວຽກ" : "ອອກກະແລ້ວ"}
                        </span>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">ເວລາເຂົ້າກະ</p>
                        <p class="font-medium text-gray-900 dark:text-white">{formatDateTime(selectedShift.startTime)}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">ເວລາອອກກະ</p>
                        <p class="font-medium text-gray-900 dark:text-white">
                            {selectedShift.endTime ? formatDateTime(selectedShift.endTime) : "-"}
                        </p>
                    </div>
                </div>

                <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 class="font-medium text-gray-900 dark:text-white mb-3">ສະຫຼຸບການເງິນ</h3>
                    <div class="space-y-2">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400">ເງິນເລີ່ມຕົ້ນ:</span>
                            <span class="text-gray-900 dark:text-white">{formatCurrency(selectedShift.openingBalance)}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                <Banknote class="w-4 h-4" />
                                ຍອດຂາຍເງິນສົດ:
                            </span>
                            <span class="text-green-600 dark:text-green-400">{formatCurrency(selectedShift.cashSales || 0)}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                <CreditCard class="w-4 h-4" />
                                ຍອດຂາຍບັດ:
                            </span>
                            <span class="text-blue-600 dark:text-blue-400">{formatCurrency(selectedShift.cardSales || 0)}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-600 dark:text-gray-400">ຈຳນວນລາຍການ:</span>
                            <span class="text-gray-900 dark:text-white">{selectedShift.transactions} ລາຍການ</span>
                        </div>
                        {#if selectedShift.status === "closed"}
                            <div class="flex justify-between text-sm border-t border-gray-200 dark:border-gray-700 pt-2">
                                <span class="text-gray-600 dark:text-gray-400">ເງິນປິດກະ:</span>
                                <span class="font-bold text-gray-900 dark:text-white">{formatCurrency(selectedShift.closingBalance || 0)}</span>
                            </div>
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-600 dark:text-gray-400">ສ່ວນຕ່າງ:</span>
                                <span class={selectedShift.variance === 0
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"}>
                                    {formatCurrency(selectedShift.variance || 0)}
                                </span>
                            </div>
                        {:else}
                            <div class="flex justify-between text-sm border-t border-gray-200 dark:border-gray-700 pt-2">
                                <span class="text-gray-600 dark:text-gray-400">ຍອດປັດຈຸບັນ:</span>
                                <span class="font-bold text-green-600 dark:text-green-400">{formatCurrency(selectedShift.currentBalance || 0)}</span>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>

            <div class="flex justify-end mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => (showModal = false)}
                    class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                    ປິດ
                </button>
            </div>
        </div>
    </div>
{/if}
