<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import { Loader2, Save, Printer, Plus, Trash2, Edit, AlertCircle, RefreshCw } from "lucide-svelte";
    const t = i18n.t;

    let printers = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showModal = $state(false);
    let testingPrinter = $state<string | null>(null);
    let editingPrinter = $state<any>(null);
    let formData = $state({
        name: "",
        type: "receipt",
        connectionType: "usb",
        ipAddress: "",
        port: 9100,
        isDefault: false,
        isActive: true,
        paperWidth: 80,
        settings: {
            printSpeed: "normal",
            density: "medium",
            cutPaper: true,
            openCashDrawer: false,
        },
    });

    const printerTypes = [
        { value: "receipt", label: "ເຄື່ອງພິມໃບບິນ" },
        { value: "kitchen", label: "ເຄື່ອງພິມເຮືອນຄົວ" },
        { value: "label", label: "ເຄື່ອງພິມລາຄາ/ບາໂຄດ" },
        { value: "report", label: "ເຄື່ອງພິມລາຍງານ" },
    ];

    const connectionTypes = [
        { value: "usb", label: "USB" },
        { value: "network", label: "Network (LAN)" },
        { value: "bluetooth", label: "Bluetooth" },
        { value: "serial", label: "Serial Port" },
    ];

    $effect(() => {
        auth.activeStoreId;
        loadPrinters();
    });

    async function loadPrinters() {
        loading = true;
        error = null;
        try {
            const response = await api.get("settings/printers").json<any>();
            if (response.success) {
                printers = response.data || [];
            } else {
                throw new Error(response.message || "Failed to load printers");
            }
        } catch (err) {
            console.error("Failed to load printers:", err);
            printers = [];
            error = "ບໍ່ສາມາດໂຫລດຂໍ້ມູນເຄື່ອງພິມໄດ້";
            toast.error("ບໍ່ສາມາດໂຫລດຂໍ້ມູນເຄື່ອງພິມໄດ້");
        } finally {
            loading = false;
        }
    }

    function openModal(printer?: any) {
        if (printer) {
            editingPrinter = printer;
            formData = { ...printer };
        } else {
            editingPrinter = null;
            formData = {
                name: "",
                type: "receipt",
                connectionType: "usb",
                ipAddress: "",
                port: 9100,
                isDefault: false,
                isActive: true,
                paperWidth: 80,
                settings: {
                    printSpeed: "normal",
                    density: "medium",
                    cutPaper: true,
                    openCashDrawer: false,
                },
            };
        }
        showModal = true;
    }

    async function savePrinter() {
        try {
            if (editingPrinter) {
                await api.put(`settings/printers/${editingPrinter.id}`, {
                    json: formData,
                }).json();
                toast.success("ແກ້ໄຂເຄື່ອງພິມສຳເລັດ");
            } else {
                await api.post("settings/printers", { json: formData }).json();
                toast.success("ເພີ່ມເຄື່ອງພິມສຳເລັດ");
            }
            showModal = false;
            loadPrinters();
        } catch (error) {
            console.error("Failed to save printer:", error);
            toast.error("ບັນທຶກບໍ່ສຳເລັດ");
        }
    }

    async function testPrint(printer: any) {
        testingPrinter = printer.id;
        try {
            await api.post(`settings/printers/${printer.id}/test`).json();
            toast.success("ສົ່ງພິມທົດສອບແລ້ວ");
        } catch (error) {
            console.error("Failed to test print:", error);
            toast.error("ພິມທົດສອບບໍ່ສຳເລັດ");
        } finally {
            testingPrinter = null;
        }
    }

    async function deletePrinter(printer: any) {
        if (!confirm("ຕ້ອງການລົບເຄື່ອງພິມນີ້ບໍ?")) return;
        try {
            await api.delete(`settings/printers/${printer.id}`).json();
            toast.success("ລົບເຄື່ອງພິມສຳເລັດ");
            loadPrinters();
        } catch (error) {
            console.error("Failed to delete printer:", error);
            toast.error("ລົບບໍ່ສຳເລັດ");
        }
    }

    function getStatusColor(status: string): string {
        return status === "online"
            ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
            : "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300";
    }

    function getTypeIcon(type: string): string {
        const icons: Record<string, string> = {
            receipt:
                "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z",
            kitchen:
                "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
            label: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",
            report: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
        };
        return icons[type] || icons.receipt;
    }
</script>

<svelte:head>
    <title>{t("settings.printers")} - KPOS</title>
</svelte:head>

<div class="p-6">
    <div class="flex justify-between items-center mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Printer class="w-6 h-6" />
                {t("settings.printers")}
            </h1>
            <p class="text-gray-500 dark:text-gray-400">{t('printers.subtitle')}</p>
        </div>
        <button
            onclick={() => openModal()}
            class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
        >
            <Plus class="w-4 h-4" />
            {t('printers.addPrinter')}
        </button>
    </div>

    {#if loading}
        <div class="flex justify-center py-12">
            <Loader2 class="h-8 w-8 animate-spin text-primary-600" />
        </div>
    {:else if error}
        <div class="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle class="h-12 w-12 text-red-500 mb-4" />
            <p class="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <button
                onclick={() => loadPrinters()}
                class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
            >
                <RefreshCw class="w-4 h-4" />
                {t('common.tryAgain')}
            </button>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each printers as printer (printer.id)}
                <div
                    class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
                >
                    <div class="flex items-start justify-between">
                        <div class="flex items-center gap-3">
                            <div
                                class="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center"
                            >
                                <Printer class="w-6 h-6 text-gray-600 dark:text-gray-300" />
                            </div>
                            <div>
                                <h3 class="font-medium text-gray-900 dark:text-white">
                                    {printer.name}
                                </h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                    {printerTypes.find(
                                        (t) => t.value === printer.type,
                                    )?.label}
                                </p>
                            </div>
                        </div>
                        <span
                            class="px-2 py-1 text-xs rounded {getStatusColor(
                                printer.status || 'offline',
                            )}"
                        >
                            {printer.status === "online" ? "ອອນລາຍ" : "ອອບລາຍ"}
                        </span>
                    </div>

                    <div class="mt-3 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                        <p>
                            ການເຊື່ອມຕໍ່: {connectionTypes.find(
                                (c) => c.value === printer.connectionType,
                            )?.label}
                        </p>
                        {#if printer.ipAddress}
                            <p>
                                IP: {printer.ipAddress}:{printer.port || 9100}
                            </p>
                        {/if}
                        <p>ຂະໜາດກະດາດ: {printer.paperWidth}mm</p>
                    </div>

                    <div class="mt-3 flex items-center gap-2">
                        {#if printer.isDefault}
                            <span
                                class="px-2 py-1 text-xs bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded"
                                >ຄ່າເລີ່ມຕົ້ນ</span
                            >
                        {/if}
                        {#if !printer.isActive}
                            <span
                                class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded"
                                >ປິດໃຊ້ງານ</span
                            >
                        {/if}
                    </div>

                    <div class="mt-4 flex gap-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                        <button
                            onclick={() => testPrint(printer)}
                            disabled={testingPrinter === printer.id}
                            class="px-3 py-1 text-sm bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 rounded disabled:opacity-50 flex items-center gap-1"
                        >
                            {#if testingPrinter === printer.id}
                                <Loader2 class="w-3 h-3 animate-spin" />
                                ກຳລັງທົດສອບ...
                            {:else}
                                <Printer class="w-3 h-3" />
                                ທົດສອບ
                            {/if}
                        </button>
                        <button
                            onclick={() => openModal(printer)}
                            class="px-3 py-1 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded flex items-center gap-1"
                        >
                            <Edit class="w-3 h-3" />
                            ແກ້ໄຂ
                        </button>
                        <button
                            onclick={() => deletePrinter(printer)}
                            class="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded flex items-center gap-1"
                        >
                            <Trash2 class="w-3 h-3" />
                            ລົບ
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

{#if showModal}
    <div
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
        <div
            class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        >
            <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                {#if editingPrinter}
                    <Edit class="w-5 h-5" />
                    ແກ້ໄຂເຄື່ອງພິມ
                {:else}
                    <Plus class="w-5 h-5" />
                    ເພີ່ມເຄື່ອງພິມ
                {/if}
            </h2>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >ຊື່ເຄື່ອງພິມ</label
                    >
                    <input
                        type="text"
                        bind:value={formData.name}
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >ປະເພດ</label
                        >
                        <select
                            bind:value={formData.type}
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                            {#each printerTypes as type (type.value)}
                                <option value={type.value}>{type.label}</option>
                            {/each}
                        </select>
                    </div>
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >ການເຊື່ອມຕໍ່</label
                        >
                        <select
                            bind:value={formData.connectionType}
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                            {#each connectionTypes as conn (conn.value)}
                                <option value={conn.value}>{conn.label}</option>
                            {/each}
                        </select>
                    </div>
                </div>
                {#if formData.connectionType === "network"}
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >IP Address</label
                            >
                            <input
                                type="text"
                                bind:value={formData.ipAddress}
                                placeholder="192.168.1.100"
                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >Port</label
                            >
                            <input
                                type="number"
                                bind:value={formData.port}
                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                    </div>
                {/if}
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >ຂະໜາດກະດາດ (mm)</label
                    >
                    <select
                        bind:value={formData.paperWidth}
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                        <option value={57}>57mm (ມ້ວນນ້ອຍ)</option>
                        <option value={80}>80mm (ມ້ວນໃຫຍ່)</option>
                    </select>
                </div>
                <div class="flex items-center gap-4">
                    <label class="flex items-center gap-2">
                        <input
                            type="checkbox"
                            bind:checked={formData.isActive}
                        />
                        <span class="text-sm text-gray-700 dark:text-gray-300">{t('printers.enabled')}</span>
                    </label>
                    <label class="flex items-center gap-2">
                        <input
                            type="checkbox"
                            bind:checked={formData.isDefault}
                        />
                        <span class="text-sm text-gray-700 dark:text-gray-300"
                            >ຕັ້ງເປັນຄ່າເລີ່ມຕົ້ນ</span
                        >
                    </label>
                </div>
            </div>
            <div class="flex justify-end gap-3 mt-6">
                <button
                    onclick={() => (showModal = false)}
                    class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                    ຍົກເລີກ
                </button>
                <button
                    onclick={savePrinter}
                    class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
                >
                    <Save class="w-4 h-4" />
                    ບັນທຶກ
                </button>
            </div>
        </div>
    </div>
{/if}
