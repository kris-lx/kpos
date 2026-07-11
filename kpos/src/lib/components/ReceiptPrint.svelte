<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '$api';
    import { t } from "$lib/i18n/index.svelte";
    import { formatCurrency, formatDateTime } from "$lib/utils";
    import { Banknote, CreditCard, QrCode, Image } from "lucide-svelte";
    import { isUsbPrintUnavailable, markUsbPrintUnavailable } from "$lib/utils/usbPrint";

    interface ReceiptItem {
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        total: number;
        size?: string;
        color?: string;
    }

    interface ReceiptData {
        transactionNo: string;
        items: ReceiptItem[];
        subtotal: number;
        discountAmount: number;
        taxAmount?: number;
        total: number;
        received: number;
        change: number;
        paymentMethod: string;
        customerName?: string;
        cashierName?: string;
        createdAt: Date;
    }

    interface ReceiptSettings {
        branchName?: string;
        branchLogo?: string;
        branchAddress?: string;
        branchPhone?: string;
        branchTaxId?: string;
        ownerName?: string;
        footerText?: string;
        showLogo?: boolean;
        showTaxDetails?: boolean;
        showQrCode?: boolean;
        primaryColor?: string;
        paperSize?: '58mm' | '80mm' | 'A4';
    }

    interface DesignElement {
        id: string;
        type: string;
        content: string;
        align: 'left' | 'center' | 'right';
        fontSize: number;
        bold: boolean;
        italic: boolean;
    }

    interface Props {
        data: ReceiptData | null;
        show: boolean;
        onClose: () => void;
        autoPrint?: boolean;
    }

    let { data, show, onClose, autoPrint = true }: Props = $props();

    let receiptSettings = $state<ReceiptSettings>({});
    let designElements = $state<DesignElement[] | null>(null);
    let settingsLoaded = $state(false);
    let printTriggered = $state(false);

    onMount(async () => {
        try {
            const res = await api.get('settings/receipt').json<{ success: boolean; data: ReceiptSettings }>();
            if (res.success) receiptSettings = res.data;
        } catch {}

        try {
            const res = await api.get('settings/receipt/design').json<any>();
            if (res.success && res.data?.elements?.length) {
                designElements = res.data.elements;
            }
        } catch {}

        if (!designElements) {
            try {
                const saved = localStorage.getItem('kpos_receipt_design');
                if (saved) {
                    const d = JSON.parse(saved);
                    if (d.elements?.length) designElements = d.elements;
                }
            } catch {}
        }

        settingsLoaded = true;
    });

    function bytesToBase64(bytes: Uint8Array): string {
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    // ── Direct network printing (bypasses the OS print dialog entirely) ────────
    // Only for thermal 58mm/80mm receipts — A4 output doesn't suit raw ESC/POS.
    async function findConfiguredNetworkReceiptPrinter(): Promise<any | null> {
        if (receiptSettings.paperSize === "A4") return null;
        try {
            const res = await api.get("settings/printers").json<any>();
            const printers: any[] = res?.data || [];
            const candidates = printers.filter((p) => p.connectionType === "network" && p.isActive !== false);
            if (candidates.length === 0) return null;
            return (
                candidates.find((p) => p.type === "receipt" && p.isDefault) ||
                candidates.find((p) => p.type === "receipt") ||
                candidates.find((p) => p.isDefault) ||
                candidates[0] ||
                null
            );
        } catch {
            return null;
        }
    }

    async function printReceiptViaNetwork(receipt: ReceiptData): Promise<boolean> {
        const printer = await findConfiguredNetworkReceiptPrinter();
        if (!printer) return false;
        try {
            const payload = buildEscPosReceipt(receipt, receiptSettings);
            const res = await api.post(`settings/printers/${printer.id}/print-receipt`, {
                json: { dataBase64: bytesToBase64(payload) },
            }).json<any>();
            return !!res?.success;
        } catch (err) {
            console.warn("Direct network receipt print failed, falling back:", err);
            return false;
        }
    }

    // ── Direct USB printing (bypasses the OS print dialog entirely) ────────────
    // Only for thermal 58mm/80mm receipts — A4 output doesn't suit raw ESC/POS.
    async function findConfiguredUsbReceiptPrinter(): Promise<boolean> {
        if (!("usb" in navigator)) return false;
        if (receiptSettings.paperSize === "A4") return false;
        try {
            const res = await api.get("settings/printers").json<any>();
            const printers: any[] = res?.data || [];
            const candidates = printers.filter((p) => p.connectionType === "usb" && p.isActive !== false);
            if (candidates.length === 0) return false;
            return !!(
                candidates.find((p) => p.type === "receipt" && p.isDefault) ||
                candidates.find((p) => p.type === "receipt") ||
                candidates.find((p) => p.isDefault) ||
                candidates[0]
            );
        } catch {
            return false;
        }
    }

    function padRight(text: string, width: number): string {
        if (text.length >= width) return text.slice(0, width);
        return text + " ".repeat(width - text.length);
    }
    function padLeft(text: string, width: number): string {
        if (text.length >= width) return text.slice(0, width);
        return " ".repeat(width - text.length) + text;
    }
    function twoColumn(left: string, right: string, width: number): string {
        const rightPart = right.length >= width ? right.slice(0, width) : right;
        const leftWidth = Math.max(0, width - rightPart.length);
        return padRight(left, leftWidth).slice(0, leftWidth) + rightPart;
    }
    function centerLine(text: string, width: number): string {
        if (text.length >= width) return text.slice(0, width);
        const padTotal = width - text.length;
        const padStart = Math.floor(padTotal / 2);
        return " ".repeat(padStart) + text;
    }

    function buildEscPosReceipt(receipt: ReceiptData, settings: ReceiptSettings): Uint8Array {
        const width = settings.paperSize === "58mm" ? 32 : 42; // font-A columns
        const ESC = 0x1b, GS = 0x1d;
        const lines: string[] = [];
        const divider = "-".repeat(width);

        if (settings.branchName) lines.push(centerLine(settings.branchName, width));
        if (settings.branchAddress) lines.push(centerLine(settings.branchAddress, width));
        if (settings.branchPhone) lines.push(centerLine(settings.branchPhone, width));
        if (settings.showTaxDetails && settings.branchTaxId) lines.push(centerLine(`Tax ID: ${settings.branchTaxId}`, width));
        lines.push(divider);

        const date = new Date(receipt.createdAt);
        lines.push(`${date.toLocaleDateString("lo-LA")} ${date.toLocaleTimeString("lo-LA", { hour: "2-digit", minute: "2-digit" })}`);
        lines.push(`${t("documents.receiptNo")}: ${receipt.transactionNo}`);
        if (receipt.cashierName) lines.push(`ພະນັກງານຂາຍ: ${receipt.cashierName}`);
        if (receipt.customerName) lines.push(`${t("documents.customer")}: ${receipt.customerName}`);
        lines.push(divider);

        for (const item of receipt.items) {
            const variant = [item.size, item.color].filter(Boolean).join(' / ');
            lines.push(padRight(variant ? `${item.productName} (${variant})` : item.productName, width));
            lines.push(twoColumn(`  x${item.quantity} @ ${formatCurrency(item.unitPrice)}`, formatCurrency(item.total), width));
        }
        lines.push(divider);

        lines.push(twoColumn(t("documents.subtotal"), formatCurrency(receipt.subtotal), width));
        if (receipt.discountAmount) lines.push(twoColumn(t("documents.discount"), `-${formatCurrency(receipt.discountAmount)}`, width));
        if (receipt.taxAmount) lines.push(twoColumn(t("documents.tax"), formatCurrency(receipt.taxAmount), width));
        lines.push(twoColumn(t("documents.total"), formatCurrency(receipt.total), width));
        lines.push(divider);

        lines.push(twoColumn(t("documents.paymentMethod"), getPaymentMethodLabel(receipt.paymentMethod), width));
        if (receipt.paymentMethod?.toUpperCase() === "CASH") {
            lines.push(twoColumn(t("documents.received"), formatCurrency(receipt.received), width));
            lines.push(twoColumn(t("documents.change"), formatCurrency(receipt.change), width));
        }

        if (settings.footerText) {
            lines.push(divider);
            lines.push(centerLine(settings.footerText, width));
        }

        const textBytes = Array.from(new TextEncoder().encode(lines.join("\n") + "\n\n\n"));
        return new Uint8Array([
            ESC, 0x40, // initialize
            ESC, 0x61, 0x00, // left align
            ...textBytes,
            GS, 0x56, 0x41, 0x03, // partial cut with feed
        ]);
    }

    async function printReceiptViaUsb(receipt: ReceiptData): Promise<boolean> {
        if (isUsbPrintUnavailable()) return false;
        if (!(await findConfiguredUsbReceiptPrinter())) return false;

        // Auto-print must never show the browser's USB device picker — that
        // "connection" prompt is only for the one-time setup step (Settings →
        // Printers → Test Print). Here we only silently reconnect to a device
        // the user already authorized in that step; if none exists yet, skip
        // straight to the print dialog instead of interrupting checkout.
        const authorizedDevices = await (navigator as any).usb.getDevices();
        if (authorizedDevices.length === 0) return false;

        let device: any = authorizedDevices[0];
        try {
            await device.open();
            const config = device.configuration || (await device.selectConfiguration(1));
            const iface = config?.interfaces?.[0];
            if (!iface) throw new Error("No USB interface found");
            await device.claimInterface(iface.interfaceNumber);
            const ep = iface.alternate.endpoints.find((e: any) => e.direction === "out");
            if (!ep) throw new Error("No OUT endpoint found");

            await device.transferOut(ep.endpointNumber, buildEscPosReceipt(receipt, receiptSettings));

            await device.releaseInterface(iface.interfaceNumber);
            await device.close();
            return true;
        } catch (err: any) {
            if (device) {
                try { await device.close(); } catch { /* already closed */ }
            }
            if (err?.name === "SecurityError") {
                // Same OS/driver conflict as the barcode-label printer — stop
                // retrying WebUSB for the rest of the session.
                markUsbPrintUnavailable();
                console.warn("USB receipt printer access denied by the OS/driver, falling back to print dialog:", err);
            } else {
                console.warn("Direct USB receipt print failed, falling back to print dialog:", err);
            }
            return false;
        }
    }

    async function printReceipt(): Promise<void> {
        if (!data) return;
        // Always fall back to the OS print dialog if no direct printer is
        // configured/reachable — never abort silently with nothing shown.
        const networkPrinted = await printReceiptViaNetwork(data).catch(() => false);
        if (networkPrinted) return;
        const usbPrinted = await printReceiptViaUsb(data).catch(() => false);
        if (usbPrinted) return;
        window.print();
    }

    $effect(() => {
        if (show && data && autoPrint && settingsLoaded && !printTriggered) {
            printTriggered = true;
            setTimeout(() => printReceipt(), 300);
        }
        if (!show) printTriggered = false;
    });

    function handlePrint() {
        printReceipt();
    }

    function getPaymentMethodLabel(method: string) {
        switch (method?.toUpperCase()) {
            case 'CASH': return t("documents.cash");
            case 'CARD': return t("documents.card");
            case 'QR': return 'QR Code';
            default: return method;
        }
    }

    function renderToken(content: string): string {
        if (!data) return content;
        const date = new Date(data.createdAt);
        const dateStr = date.toLocaleDateString('lo-LA');
        const timeStr = date.toLocaleTimeString('lo-LA', { hour: '2-digit', minute: '2-digit' });
        return content
            .replace('{{date}}', dateStr)
            .replace('{{time}}', timeStr)
            .replace('{{receiptNo}}', data.transactionNo)
            .replace('{{cashier}}', data.cashierName ?? '-')
            .replace('{{customer}}', data.customerName ?? '-')
            .replace('{{tableNo}}', '-')
            .replace('{{taxId}}', receiptSettings.branchTaxId ?? '')
            .replace('{{website}}', '')
            .replace('{{subtotal}}', formatCurrency(data.subtotal))
            .replace('{{discount}}', formatCurrency(data.discountAmount))
            .replace('{{tax}}', formatCurrency(data.taxAmount ?? 0))
            .replace('{{rounding}}', '')
            .replace('{{total}}', formatCurrency(data.total))
            .replace('{{received}}', formatCurrency(data.received))
            .replace('{{paymentMethod}}', getPaymentMethodLabel(data.paymentMethod))
            .replace('{{change}}', formatCurrency(data.change));
    }

    const alignClass = (align: string) =>
        align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
</script>

<svelte:head>
    {#if show}
        {@html `<style>
            @media print {
                @page {
                    size: ${ receiptSettings.paperSize === '58mm' ? '58mm auto'
                            : receiptSettings.paperSize === 'A4'  ? 'A4 portrait'
                            : '80mm auto' };
                    margin: ${ receiptSettings.paperSize === 'A4' ? '10mm' : '0mm' };
                }
                /* Hide all other UI — position:fixed breaks out of modal overflow:hidden */
                body * { visibility: hidden !important; }
                #pos-receipt, #pos-receipt * { visibility: visible !important; }

                #pos-receipt {
                    position: fixed !important;
                    left: 0 !important;
                    top: 0 !important;
                    right: auto !important;
                    bottom: auto !important;
                    width: ${ receiptSettings.paperSize === '58mm' ? '58mm'
                             : receiptSettings.paperSize === 'A4'  ? '210mm'
                             : '80mm' } !important;
                    max-width: none !important;
                    max-height: none !important;
                    height: auto !important;
                    overflow: visible !important;
                    background: white !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                    border: none !important;
                    border-radius: 0 !important;
                    font-size: ${ receiptSettings.paperSize === 'A4'  ? '11pt'
                                : receiptSettings.paperSize === '58mm' ? '7pt'
                                : '8pt' } !important;
                    font-family: 'Courier New', 'Noto Sans Lao', monospace !important;
                    line-height: 1.5 !important;
                }

                /* Force ALL text to black — thermal printers only do black */
                #pos-receipt, #pos-receipt * { color: black !important; }

                /* Dark header → white background with bottom border */
                #pos-receipt .bg-gray-900,
                #pos-receipt .bg-gray-800,
                #pos-receipt .bg-gray-700 {
                    background-color: white !important;
                    border-bottom: 2px solid black !important;
                }

                /* Strip all other colored backgrounds */
                #pos-receipt [class*="bg-primary"],
                #pos-receipt [class*="bg-green"],
                #pos-receipt [class*="bg-red"],
                #pos-receipt [class*="bg-blue"] {
                    background-color: transparent !important;
                }

                /* Borders */
                #pos-receipt .border-dashed { border-color: #888 !important; }
                #pos-receipt .border-gray-200,
                #pos-receipt .border-gray-300 { border-color: #aaa !important; }
                #pos-receipt .border-gray-900,
                #pos-receipt .border-t-2 { border-color: black !important; }

                /* Remove decorative radius */
                #pos-receipt * { border-radius: 0 !important; }

                /* Icons: keep them small & black */
                #pos-receipt svg { width: 10px !important; height: 10px !important; stroke: black !important; }

                /* No page-break mid-content */
                #pos-receipt { page-break-after: avoid; break-after: avoid; }
                #pos-receipt * { page-break-inside: avoid; break-inside: avoid; }

                /* Hide screen-only elements */
                .no-print { display: none !important; }
            }
        </style>`}
    {/if}
</svelte:head>

{#if show && data}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <!-- Modal Header -->
            <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center no-print">
                <div>
                    <h2 class="text-lg font-bold text-gray-900 dark:text-white">{t("documents.receiptTitle")}</h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400 font-mono">{data.transactionNo}</p>
                </div>
                <button onclick={onClose} class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">✕</button>
            </div>

            <!-- Receipt Content -->
            <div class="p-4 overflow-y-auto flex-1">
                <div id="pos-receipt"
                    class="bg-white border border-gray-300 font-mono text-gray-900 mx-auto"
                    style="width:{receiptSettings.paperSize === '58mm' ? '220px' : receiptSettings.paperSize === 'A4' ? '100%' : '302px'}; font-size:{receiptSettings.paperSize === '58mm' ? '8px' : receiptSettings.paperSize === 'A4' ? '13px' : '10px'}; line-height:1.5;">

                    {#if designElements && designElements.length > 0}
                        <!-- Render using saved design -->
                        <div class="p-3 space-y-0.5">
                            {#each designElements as el (el.id)}
                                {#if el.type === 'logo'}
                                    {#if receiptSettings.showLogo !== false && receiptSettings.branchLogo}
                                        <div class="text-center py-2">
                                            <img src={receiptSettings.branchLogo} alt="Logo" class="mx-auto max-h-16 max-w-24 object-contain" />
                                        </div>
                                    {/if}
                                {:else if el.type === 'image'}
                                    {#if el.content}
                                        <div class="text-center py-2">
                                            <img src={el.content} alt="" class="mx-auto max-h-20 max-w-[70%] object-contain" />
                                        </div>
                                    {/if}
                                {:else if el.type === 'storeName'}
                                    <div class={`${alignClass(el.align)} ${el.bold ? 'font-bold' : ''} ${el.italic ? 'italic' : ''}`} style="font-size:{el.fontSize}px">
                                        {receiptSettings.branchName ?? el.content}
                                    </div>
                                {:else if el.type === 'address'}
                                    {#if receiptSettings.branchAddress}
                                        <div class={`${alignClass(el.align)} ${el.bold ? 'font-bold' : ''} ${el.italic ? 'italic' : ''}`} style="font-size:{el.fontSize}px">
                                            {receiptSettings.branchAddress}
                                        </div>
                                    {/if}
                                {:else if el.type === 'phone'}
                                    {#if receiptSettings.branchPhone}
                                        <div class={`${alignClass(el.align)} ${el.bold ? 'font-bold' : ''} ${el.italic ? 'italic' : ''}`} style="font-size:{el.fontSize}px">
                                            {receiptSettings.branchPhone}
                                        </div>
                                    {/if}
                                {:else if el.type === 'taxId'}
                                    {#if receiptSettings.branchTaxId}
                                        <div class={`${alignClass(el.align)} ${el.bold ? 'font-bold' : ''} ${el.italic ? 'italic' : ''}`} style="font-size:{el.fontSize}px">
                                            {receiptSettings.branchTaxId}
                                        </div>
                                    {/if}
                                {:else if el.type === 'divider'}
                                    <div class="text-center overflow-hidden print-border" style="font-size:{el.fontSize}px">
                                        {el.content.repeat(40)}
                                    </div>
                                {:else if el.type === 'items'}
                                    <div style="font-size:{el.fontSize}px">
                                        {#each data.items as item (item.productId)}
                                            <div class="flex justify-between py-0.5">
                                                <span class="flex-1 print-text">
                                                    {item.productName}
                                                    {#if item.size || item.color}
                                                        <span class="text-gray-500">({[item.size, item.color].filter(Boolean).join(' / ')})</span>
                                                    {/if}
                                                    x{item.quantity}
                                                </span>
                                                <span class="print-text">{formatCurrency(item.total)}</span>
                                            </div>
                                        {/each}
                                    </div>
                                {:else if el.type === 'qrcode'}
                                    {#if receiptSettings.showQrCode}
                                        <div class="text-center py-2">
                                            <div class="inline-block w-20 h-20 border border-gray-400 flex items-center justify-center">
                                                <QrCode class="w-12 h-12 text-gray-400" />
                                            </div>
                                        </div>
                                    {/if}
                                {:else if el.type === 'barcode'}
                                    <div class="text-center py-2">
                                        <div class="inline-block w-32 h-10 border border-gray-400 flex items-center justify-center text-xs text-gray-500">
                                            {data.transactionNo}
                                        </div>
                                    </div>
                                {:else if el.type === 'signature'}
                                    <div class="text-center pt-4 pb-1">
                                        <div class="border-b border-gray-400 w-32 mx-auto mb-1"></div>
                                        <span class="text-xs text-gray-500 print-text">{t("documents.signature")}</span>
                                    </div>
                                {:else}
                                    <!-- text, date, receiptNo, cashier, customer, subtotal, discount, tax, total, payment, change, footer, received, rounding, website, tableNo -->
                                    <div class={`${alignClass(el.align)} ${el.bold ? 'font-bold' : ''} ${el.italic ? 'italic' : ''} print-text`} style="font-size:{el.fontSize}px">
                                        {renderToken(el.content)}
                                    </div>
                                {/if}
                            {/each}
                        </div>

                    {:else}
                        <!-- Default receipt layout — thermal style (white bg so on-screen matches print) -->
                        <div class="bg-white text-gray-900 p-3 text-center border-b-2 border-gray-900">
                            {#if receiptSettings.showLogo !== false && receiptSettings.branchLogo}
                                <img src={receiptSettings.branchLogo} alt="Logo" class="mx-auto mb-2 max-h-14 max-w-20 object-contain" />
                            {/if}
                            <h3 class="font-bold">{receiptSettings.branchName ?? t("documents.storeName")}</h3>
                            {#if receiptSettings.branchAddress}
                                <p class="text-xs text-gray-600 mt-0.5">{receiptSettings.branchAddress}</p>
                            {/if}
                            {#if receiptSettings.branchPhone}
                                <p class="text-xs text-gray-600">{t("common.phone")}: {receiptSettings.branchPhone}</p>
                            {/if}
                        </div>

                        <div class="p-3 space-y-3">
                            <!-- Info -->
                            <div class="grid grid-cols-2 gap-2 text-sm">
                                <div class="print-text text-gray-500">{t("documents.receiptNo")}:</div>
                                <div class="print-text font-mono font-medium text-right">{data.transactionNo}</div>
                                <div class="print-text text-gray-500">{t("documents.date")}:</div>
                                <div class="print-text text-right">{formatDateTime(data.createdAt)}</div>
                                {#if data.customerName}
                                    <div class="print-text text-gray-500">{t("documents.customer")}:</div>
                                    <div class="print-text text-right">{data.customerName}</div>
                                {/if}
                            </div>

                            <div class="print-border border-t border-dashed border-gray-300"></div>

                            <!-- Items -->
                            <div class="space-y-2">
                                {#each data.items as item (item.productId)}
                                    <div class="flex justify-between text-sm">
                                        <div class="flex-1">
                                            <p class="print-text font-medium">
                                                {item.productName}
                                                {#if item.size || item.color}
                                                    <span class="text-gray-500 font-normal">({[item.size, item.color].filter(Boolean).join(' / ')})</span>
                                                {/if}
                                            </p>
                                            <p class="print-text text-xs text-gray-500">
                                                {formatCurrency(item.unitPrice)} x {item.quantity}
                                            </p>
                                        </div>
                                        <span class="print-text font-medium">{formatCurrency(item.total)}</span>
                                    </div>
                                {/each}
                            </div>

                            <div class="print-border border-t border-dashed border-gray-300"></div>

                            <!-- Totals -->
                            <div class="space-y-1 text-sm">
                                <div class="flex justify-between">
                                    <span class="print-text text-gray-500">{t("documents.subtotal")}</span>
                                    <span class="print-text">{formatCurrency(data.subtotal)}</span>
                                </div>
                                {#if data.discountAmount > 0}
                                    <div class="flex justify-between text-red-600">
                                        <span class="print-text">{t("documents.discount")}</span>
                                        <span class="print-text">-{formatCurrency(data.discountAmount)}</span>
                                    </div>
                                {/if}
                                {#if data.taxAmount && data.taxAmount > 0 && receiptSettings.showTaxDetails !== false}
                                    <div class="flex justify-between">
                                        <span class="print-text text-gray-500">VAT</span>
                                        <span class="print-text">{formatCurrency(data.taxAmount)}</span>
                                    </div>
                                {/if}
                            </div>

                            <div class="print-border border-t-2 border-gray-900 pt-1.5">
                                <div class="flex justify-between font-bold" style="font-size:1.1em;">
                                    <span class="print-text">{t("documents.grandTotal")}</span>
                                    <span class="print-text">{formatCurrency(data.total)}</span>
                                </div>
                            </div>

                            <!-- Payment -->
                            <div class="space-y-1 text-sm">
                                <div class="flex justify-between">
                                    <span class="print-text text-gray-500">{t("documents.paymentMethod")}:</span>
                                    <span class="print-text flex items-center gap-1">
                                        {#if data.paymentMethod?.toUpperCase() === 'CASH'}
                                            <Banknote class="w-4 h-4" />
                                        {:else if data.paymentMethod?.toUpperCase() === 'CARD'}
                                            <CreditCard class="w-4 h-4" />
                                        {:else}
                                            <QrCode class="w-4 h-4" />
                                        {/if}
                                        {getPaymentMethodLabel(data.paymentMethod)}
                                    </span>
                                </div>
                                {#if data.received > 0}
                                    <div class="flex justify-between">
                                        <span class="print-text text-gray-500">{t("documents.received")}</span>
                                        <span class="print-text">{formatCurrency(data.received)}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="print-text text-gray-500">{t("documents.change")}</span>
                                        <span class="print-text text-green-600 font-medium">{formatCurrency(data.change)}</span>
                                    </div>
                                {/if}
                            </div>

                            <!-- Footer -->
                            <div class="text-center pt-4 print-border border-t border-gray-200">
                                <p class="print-text text-sm text-gray-500">
                                    {receiptSettings.footerText ?? t("documents.thankYou")}
                                </p>
                                <p class="print-text text-xs text-gray-400 mt-1">Powered by KPOS</p>
                            </div>
                        </div>
                    {/if}

                </div>
            </div>

            <!-- Actions -->
            <div class="border-t border-gray-200 dark:border-gray-700 p-4 flex gap-2 no-print">
                <button
                    onclick={handlePrint}
                    class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
                >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    {t("documents.print")}
                </button>
                <button
                    onclick={onClose}
                    class="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                >
                    {t("common.close")}
                </button>
            </div>
        </div>
    </div>
{/if}
