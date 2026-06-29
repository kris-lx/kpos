<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { auth } from "$stores";
    import {
        Loader2, Save, Printer, Plus, Trash2, Edit, AlertCircle,
        RefreshCw, ChevronLeft, Wifi, Bluetooth, Usb, Settings2,
        CheckCircle2, XCircle, Zap,
    } from "lucide-svelte";

    // ── Types ────────────────────────────────────────────────────────────────
    interface PrinterConfig {
        id: string;
        name: string;
        type: string;
        connectionType: string;
        ipAddress?: string;
        port?: number;
        serialPort?: string;
        usbDevice?: string;
        isDefault: boolean;
        isActive: boolean;
        paperWidth: number;
        characterEncoding: string;
        settings: {
            printSpeed: string;
            density: string;
            cutPaper: boolean;
            openCashDrawer: boolean;
        };
        status?: string;
    }

    // ── State ────────────────────────────────────────────────────────────────
    let printers = $state<PrinterConfig[]>([]);
    let loading = $state(true);
    let saving = $state(false);
    let testingId = $state<string | null>(null);
    let showModal = $state(false);
    let editingId = $state<string | null>(null);
    let showAdvanced = $state(false);

    const defaultForm = (): Omit<PrinterConfig, 'id'> => ({
        name: "",
        type: "receipt",
        connectionType: "network",
        ipAddress: "",
        port: 9100,
        serialPort: "COM1",
        usbDevice: "",
        isDefault: false,
        isActive: true,
        paperWidth: 80,
        characterEncoding: "UTF-8",
        settings: {
            printSpeed: "normal",
            density: "medium",
            cutPaper: true,
            openCashDrawer: false,
        },
    });

    let form = $state(defaultForm());

    // ── Lookup tables ─────────────────────────────────────────────────────────
    const printerTypes = $derived([
        { value: "receipt",     label: t("printers.receipt") },
        { value: "kitchen",     label: t("printers.kitchen") },
        { value: "label",       label: t("printers.label") },
        { value: "report",      label: t("printers.report") },
    ]);

    const connectionTypes = $derived([
        { value: "network",      label: t("printers.network") },
        { value: "usb",          label: t("printers.usb") },
        { value: "bluetooth",    label: t("printers.bluetooth") },
        { value: "serial",       label: t("printers.serial") },
        { value: "windowsPrint", label: t("printers.windowsPrint") },
    ]);

    const paperWidths = $derived([
        { value: 57,  label: t("printers.paper57") },
        { value: 58,  label: t("printers.paper58") },
        { value: 76,  label: t("printers.paper76") },
        { value: 80,  label: t("printers.paper80") },
        { value: 110, label: t("printers.paper110") },
    ]);

    const encodings = [
        { value: "UTF-8",   label: "UTF-8 (Universal)" },
        { value: "TIS-620", label: "TIS-620 (Thai)" },
        { value: "CP437",   label: "CP437 (Latin/English)" },
        { value: "CP850",   label: "CP850 (Western Europe)" },
        { value: "GB18030", label: "GB18030 (Chinese)" },
        { value: "Shift-JIS", label: "Shift-JIS (Japanese)" },
    ];

    // ── Load ─────────────────────────────────────────────────────────────────
    $effect(() => {
        void auth.activeStoreId;
        loadPrinters();
    });

    async function loadPrinters() {
        loading = true;
        try {
            const res = await api.get("settings/printers").json<any>();
            printers = res.success ? (res.data || []) : [];
        } catch {
            toast.error(t("printers.loadFailed"));
            printers = [];
        } finally {
            loading = false;
        }
    }

    // ── Modal ─────────────────────────────────────────────────────────────────
    function openAdd() {
        editingId = null;
        form = defaultForm();
        showAdvanced = false;
        showModal = true;
    }

    function openEdit(p: PrinterConfig) {
        editingId = p.id;
        form = {
            name: p.name,
            type: p.type,
            connectionType: p.connectionType,
            ipAddress: p.ipAddress ?? "",
            port: p.port ?? 9100,
            serialPort: p.serialPort ?? "COM1",
            usbDevice: p.usbDevice ?? "",
            isDefault: p.isDefault,
            isActive: p.isActive,
            paperWidth: p.paperWidth ?? 80,
            characterEncoding: p.characterEncoding ?? "UTF-8",
            settings: {
                printSpeed: p.settings?.printSpeed ?? "normal",
                density: p.settings?.density ?? "medium",
                cutPaper: p.settings?.cutPaper ?? true,
                openCashDrawer: p.settings?.openCashDrawer ?? false,
            },
        };
        showAdvanced = false;
        showModal = true;
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    async function savePrinter() {
        if (!form.name.trim()) return;
        saving = true;
        try {
            const payload = { ...form };
            if (editingId) {
                await api.put(`settings/printers/${editingId}`, { json: payload }).json();
                toast.success(t("printers.updateSuccess"));
            } else {
                await api.post("settings/printers", { json: payload }).json();
                toast.success(t("printers.addSuccess"));
            }
            showModal = false;
            loadPrinters();
        } catch {
            toast.error(t("printers.saveFailed"));
        } finally {
            saving = false;
        }
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    async function deletePrinter(p: PrinterConfig) {
        if (!confirm(t("printers.confirmDelete"))) return;
        try {
            await api.delete(`settings/printers/${p.id}`).json();
            toast.success(t("printers.deleteSuccess"));
            loadPrinters();
        } catch {
            toast.error(t("printers.deleteFailed"));
        }
    }

    // ── Test print ────────────────────────────────────────────────────────────
    async function testPrint(p: PrinterConfig) {
        testingId = p.id;
        try {
            if (p.connectionType === "windowsPrint") {
                // System print dialog — open a test page in a new window
                const w = window.open("", "_blank", "width=400,height=300");
                if (w) {
                    w.document.write(`<html><body style="font-family:monospace;text-align:center">
                        <h2>** KPOS TEST PRINT **</h2>
                        <hr/><p>Printer: ${p.name}</p>
                        <p>Time: ${new Date().toLocaleString()}</p>
                        <hr/><p>PRINTER OK</p>
                    </body></html>`);
                    w.document.close();
                    w.print();
                    w.close();
                }
                toast.success(t("printers.testSuccess"));
                return;
            }

            if (p.connectionType === "usb" && "usb" in navigator) {
                // Try Web USB API
                try {
                    const device = await (navigator as any).usb.requestDevice({ filters: [] });
                    await device.open();
                    const config = device.configuration || await device.selectConfiguration(1);
                    const iface = config?.interfaces?.[0];
                    if (iface) {
                        await device.claimInterface(iface.interfaceNumber);
                        const ep = iface.alternate.endpoints.find((e: any) => e.direction === "out");
                        if (ep) {
                            const ESC = 0x1B; const GS = 0x1D;
                            const data = new Uint8Array([
                                ESC, 0x40,
                                ESC, 0x61, 0x01,
                                ...new TextEncoder().encode("** KPOS TEST **\nPRINTER OK\n\n\n"),
                                GS, 0x56, 0x41, 0x03,
                            ]);
                            await device.transferOut(ep.endpointNumber, data);
                        }
                        await device.releaseInterface(iface.interfaceNumber);
                    }
                    await device.close();
                    toast.success(t("printers.testSuccess"));
                    return;
                } catch (usbErr: any) {
                    if (usbErr?.name === "NotFoundError") {
                        toast.error("No USB printer selected");
                        return;
                    }
                    // Fall through to backend test
                }
            }

            // For network and others: call backend
            const res = await api.post(`settings/printers/${p.id}/test`, {}).json<any>();
            if (res.success) {
                toast.success(t("printers.testSuccess"));
            } else {
                toast.error(res.error?.message || t("printers.testFailed"));
            }
        } catch (err: any) {
            const msg = err?.message || t("printers.testFailed");
            toast.error(msg.includes("PRINTER_UNREACHABLE") ? t("printers.testFailed") + ": " + msg : t("printers.testFailed"));
        } finally {
            testingId = null;
        }
    }

    // ── USB detection ─────────────────────────────────────────────────────────
    async function detectUsb() {
        if (!("usb" in navigator)) {
            toast.error("Web USB API is not supported in this browser. Use Chrome or Edge.");
            return;
        }
        try {
            const device = await (navigator as any).usb.requestDevice({ filters: [] });
            form = { ...form, connectionType: "usb", usbDevice: device.productName || device.serialNumber || "USB Printer" };
            toast.success(`Found: ${device.productName || "USB Device"}`);
        } catch (err: any) {
            if (err?.name !== "NotFoundError") toast.error("USB detection failed");
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function typeLabel(v: string) {
        return printerTypes.find(p => p.value === v)?.label ?? v;
    }
    function connLabel(v: string) {
        return connectionTypes.find(c => c.value === v)?.label ?? v;
    }
    function paperLabel(v: number) {
        return paperWidths.find(p => p.value === v)?.label ?? `${v}mm`;
    }

    const connIcon: Record<string, any> = {
        network: Wifi,
        bluetooth: Bluetooth,
        usb: Usb,
        serial: Settings2,
        windowsPrint: Printer,
    };
</script>

<svelte:head><title>{t("settings.printers")} - KPOS</title></svelte:head>

<div class="p-6 max-w-4xl">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
            <a href="/settings" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <ChevronLeft class="w-5 h-5" />
            </a>
            <div>
                <h1 class="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Printer class="w-5 h-5" />
                    {t("printers.title")}
                </h1>
                <p class="text-sm text-gray-500 dark:text-gray-400">{t("printers.subtitle")}</p>
            </div>
        </div>
        <button onclick={openAdd}
            class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium transition-colors">
            <Plus class="w-4 h-4" />
            {t("printers.addPrinter")}
        </button>
    </div>

    <!-- Content -->
    {#if loading}
        <div class="flex justify-center py-16">
            <Loader2 class="w-8 h-8 animate-spin text-primary-600" />
        </div>
    {:else if printers.length === 0}
        <div class="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
            <Printer class="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
            <p class="text-gray-500 dark:text-gray-400 mb-4">{t("printers.noPrinters")}</p>
            <button onclick={openAdd}
                class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
                <Plus class="w-4 h-4" />
                {t("printers.addPrinter")}
            </button>
        </div>
    {:else}
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {#each printers as printer (printer.id)}
                {@const ConnIcon = connIcon[printer.connectionType] ?? Printer}
                <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                    <!-- Card header -->
                    <div class="flex items-start justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                                <Printer class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{printer.name}</h3>
                                <p class="text-xs text-gray-500 dark:text-gray-400">{typeLabel(printer.type)}</p>
                            </div>
                        </div>
                        <!-- Status badge -->
                        <span class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium {printer.status === 'online'
                            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}">
                            {#if printer.status === 'online'}
                                <CheckCircle2 class="w-3 h-3" />
                                {t("printers.online")}
                            {:else}
                                <XCircle class="w-3 h-3" />
                                {t("printers.offline")}
                            {/if}
                        </span>
                    </div>

                    <!-- Details -->
                    <div class="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <div class="flex items-center gap-1.5">
                            <ConnIcon class="w-3.5 h-3.5 shrink-0" />
                            <span>{t("printers.connectionLabel")} {connLabel(printer.connectionType)}</span>
                        </div>
                        {#if printer.connectionType === "network" && printer.ipAddress}
                            <p class="pl-5">IP: {printer.ipAddress}:{printer.port ?? 9100}</p>
                        {/if}
                        {#if printer.connectionType === "serial" && printer.serialPort}
                            <p class="pl-5">{printer.serialPort}</p>
                        {/if}
                        <p class="flex items-center gap-1">
                            <span>{t("printers.paperWidthLabel")}</span>
                            <span>{paperLabel(printer.paperWidth ?? 80)}</span>
                        </p>
                    </div>

                    <!-- Tags -->
                    <div class="flex flex-wrap gap-1.5">
                        {#if printer.isDefault}
                            <span class="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-full">
                                {t("printers.default")}
                            </span>
                        {/if}
                        {#if !printer.isActive}
                            <span class="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
                                {t("printers.disabled")}
                            </span>
                        {/if}
                    </div>

                    <!-- Actions -->
                    <div class="flex gap-2 border-t border-gray-100 dark:border-gray-800 pt-3 mt-auto">
                        <button onclick={() => testPrint(printer)} disabled={testingId === printer.id}
                            class="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50 transition-colors">
                            {#if testingId === printer.id}
                                <Loader2 class="w-3 h-3 animate-spin" />
                                {t("printers.testing")}
                            {:else}
                                <Zap class="w-3 h-3" />
                                {t("printers.testPrint")}
                            {/if}
                        </button>
                        <button onclick={() => openEdit(printer)}
                            class="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                            <Edit class="w-3 h-3" />
                            {t("common.edit")}
                        </button>
                        <button onclick={() => deletePrinter(printer)}
                            class="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <Trash2 class="w-3 h-3" />
                            {t("common.delete")}
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        role="dialog" aria-modal="true" tabindex="-1"
        onkeydown={(e) => e.key === "Escape" && (showModal = false)}>
        <div class="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
            <div class="p-6">
                <!-- Modal header -->
                <h2 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                    {#if editingId}
                        <Edit class="w-5 h-5" />
                        {t("printers.editPrinter")}
                    {:else}
                        <Plus class="w-5 h-5" />
                        {t("printers.addPrinter")}
                    {/if}
                </h2>

                <div class="space-y-4">
                    <!-- Name -->
                    <div>
                        <label for="pr-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("printers.name")} <span class="text-red-500">*</span>
                        </label>
                        <input id="pr-name" type="text" bind:value={form.name} placeholder="e.g. Front Desk Printer"
                            class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm" />
                    </div>

                    <!-- Type + Connection -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label for="pr-type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("printers.type")}</label>
                            <select id="pr-type" bind:value={form.type}
                                class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm">
                                {#each printerTypes as pt}
                                    <option value={pt.value}>{pt.label}</option>
                                {/each}
                            </select>
                        </div>
                        <div>
                            <label for="pr-conn" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("printers.connection")}</label>
                            <select id="pr-conn" bind:value={form.connectionType}
                                class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm">
                                {#each connectionTypes as ct}
                                    <option value={ct.value}>{ct.label}</option>
                                {/each}
                            </select>
                        </div>
                    </div>

                    <!-- Network fields -->
                    {#if form.connectionType === "network"}
                        <div class="grid grid-cols-3 gap-3">
                            <div class="col-span-2">
                                <label for="pr-ip" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("printers.ipAddress")}</label>
                                <input id="pr-ip" type="text" bind:value={form.ipAddress} placeholder="192.168.1.100"
                                    class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm font-mono" />
                            </div>
                            <div>
                                <label for="pr-port" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("printers.port")}</label>
                                <input id="pr-port" type="number" bind:value={form.port} min="1" max="65535"
                                    class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm font-mono" />
                            </div>
                        </div>
                    {/if}

                    <!-- Serial fields -->
                    {#if form.connectionType === "serial"}
                        <div>
                            <label for="pr-serial" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("printers.serialPort")}</label>
                            <input id="pr-serial" type="text" bind:value={form.serialPort} placeholder="COM1 or /dev/ttyUSB0"
                                class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm font-mono" />
                        </div>
                    {/if}

                    <!-- USB fields -->
                    {#if form.connectionType === "usb"}
                        <div>
                            <label for="pr-usb" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("printers.usbDevice")}</label>
                            <div class="flex gap-2">
                                <input id="pr-usb" type="text" bind:value={form.usbDevice} placeholder="USB Printer Name"
                                    class="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm" />
                                <button type="button" onclick={detectUsb}
                                    class="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm transition-colors whitespace-nowrap flex items-center gap-1">
                                    <Usb class="w-4 h-4" />
                                    {t("printers.detectUsb")}
                                </button>
                            </div>
                            <p class="text-xs text-gray-400 mt-1">Requires Chrome or Edge browser</p>
                        </div>
                    {/if}

                    <!-- System print info -->
                    {#if form.connectionType === "windowsPrint"}
                        <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                            Uses the browser's built-in print dialog — works with any OS printer (Windows, macOS, Linux). No driver needed.
                        </div>
                    {/if}

                    <!-- Paper width + Encoding -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label for="pr-paper" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("printers.paperSize")}</label>
                            <select id="pr-paper" bind:value={form.paperWidth}
                                class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm">
                                {#each paperWidths as pw}
                                    <option value={pw.value}>{pw.label}</option>
                                {/each}
                            </select>
                        </div>
                        <div>
                            <label for="pr-enc" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("printers.characterEncoding")}</label>
                            <select id="pr-enc" bind:value={form.characterEncoding}
                                class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm">
                                {#each encodings as enc}
                                    <option value={enc.value}>{enc.label}</option>
                                {/each}
                            </select>
                        </div>
                    </div>

                    <!-- Checkboxes -->
                    <div class="flex flex-wrap gap-4">
                        <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input type="checkbox" bind:checked={form.isActive} class="rounded" />
                            {t("printers.enabled")}
                        </label>
                        <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input type="checkbox" bind:checked={form.isDefault} class="rounded" />
                            {t("printers.setDefault")}
                        </label>
                    </div>

                    <!-- Advanced settings toggle -->
                    <button type="button" onclick={() => showAdvanced = !showAdvanced}
                        class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                        <Settings2 class="w-4 h-4" />
                        {t("printers.advancedSettings")}
                        <span class="text-xs">{showAdvanced ? "▲" : "▼"}</span>
                    </button>

                    {#if showAdvanced}
                        <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl space-y-3">
                            <!-- Print speed -->
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label for="pr-speed" class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("printers.printSpeed")}</label>
                                    <select id="pr-speed" bind:value={form.settings.printSpeed}
                                        class="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg text-sm">
                                        <option value="slow">{t("printers.slow")}</option>
                                        <option value="normal">{t("printers.normal")}</option>
                                        <option value="fast">{t("printers.fast")}</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="pr-density" class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("printers.density")}</label>
                                    <select id="pr-density" bind:value={form.settings.density}
                                        class="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg text-sm">
                                        <option value="low">{t("printers.low")}</option>
                                        <option value="medium">{t("printers.medium")}</option>
                                        <option value="high">{t("printers.high")}</option>
                                    </select>
                                </div>
                            </div>
                            <!-- Cut + Drawer checkboxes -->
                            <div class="flex flex-wrap gap-4">
                                <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                    <input type="checkbox" bind:checked={form.settings.cutPaper} class="rounded" />
                                    {t("printers.cutPaper")}
                                </label>
                                <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                    <input type="checkbox" bind:checked={form.settings.openCashDrawer} class="rounded" />
                                    {t("printers.openDrawer")}
                                </label>
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- Footer -->
                <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <button onclick={() => (showModal = false)}
                        class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                        {t("common.cancel")}
                    </button>
                    <button onclick={savePrinter} disabled={saving || !form.name.trim()}
                        class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60 text-sm font-medium transition-colors">
                        {#if saving}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" />{/if}
                        {t("common.save")}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
