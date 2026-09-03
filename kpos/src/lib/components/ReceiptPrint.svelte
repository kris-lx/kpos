<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { api } from '$api';
    import { t } from "$lib/i18n/index.svelte";
    import { formatCurrency, formatDateTime } from "$lib/utils";
    import { Banknote, CreditCard, QrCode, Image, Loader2, AlertCircle } from "lucide-svelte";
    import { toast } from "svelte-sonner";
    import JsBarcode from "jsbarcode";
    import QRCode from "qrcode";
    import { tenantSettings } from "$lib/stores/settings.svelte";
    import { generateEMVcoPayload } from "$lib/utils/emvcoQr";
    import { createPrintIdempotencyKey, pickStrictPrinter } from "$lib/utils/printerRouting";

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
        customerId?: string;
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
        // Not just '58mm' | '80mm' | 'A4' — the printer config at
        // Settings > Printers offers 57/58/76/80/110mm widths, and this
        // must be able to represent any of them (a receipt printed on a
        // configured-but-uncovered width used to always fall back to
        // hardcoded 80mm sizing here, printing at the wrong size).
        paperSize?: string;
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
    let isPrinting = $state(false);
    let printError = $state<string | null>(null);

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

    // null = A4 (handled as its own fixed case everywhere this is used);
    // otherwise the numeric thermal-paper width in mm, parsed from strings
    // like "57mm"/"76mm"/"110mm". Only an EXPLICIT "A4" maps to null — no
    // setting saved at all (the common case: most stores never touch
    // Settings > Receipt) must keep defaulting to 80mm thermal like every
    // caller here always did before, not silently become A4 the moment the
    // paperSize field is unset.
    function paperWidthMm(size?: string): number | null {
        if (size === 'A4') return null;
        if (!size) return 80;
        const match = /^(\d+(?:\.\d+)?)mm$/.exec(size);
        return match ? Number(match[1]) : 80;
    }

    const printWidthMm = $derived(paperWidthMm(receiptSettings.paperSize));

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
            return pickStrictPrinter(printers, "receipt", "network");
        } catch {
            return null;
        }
    }

    async function waitForPrintJob(jobId: string): Promise<void> {
        for (let attempt = 0; attempt < 24; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 350));
            const response = await api.get(`settings/print-jobs/${jobId}`).json<any>();
            const job = response?.data;
            if (job?.status === "PRINTED") return;
            if (job?.status === "FAILED") throw new Error(job.lastError || t("printing.failed"));
        }
        throw new Error(t("printing.timeout"));
    }

    async function printReceiptViaNetwork(receipt: ReceiptData, automatic: boolean): Promise<void> {
        const printer = await findConfiguredNetworkReceiptPrinter();
        if (!printer) throw new Error(t("printing.receiptPrinterRequired"));
        const payload = await buildEscPosReceiptImage(receipt, receiptSettings);
        const res = await api.post(`settings/printers/${printer.id}/print-receipt`, {
            json: {
                dataBase64: bytesToBase64(payload),
                reference: receipt.transactionNo,
                idempotencyKey: automatic
                    ? `receipt:${receipt.transactionNo}:automatic`
                    : createPrintIdempotencyKey(`receipt:${receipt.transactionNo}:manual`),
            },
        }).json<any>();
        const jobId = res?.data?.job?.id;
        if (!jobId) throw new Error(t("printing.queueFailed"));
        await waitForPrintJob(jobId);
    }

    // ── Direct USB printing (bypasses the OS print dialog entirely) ────────────
    // Only for thermal 58mm/80mm receipts — A4 output doesn't suit raw ESC/POS.
    // ── ESC/POS receipt rendering ───────────────────────────────────────────
    // Thermal printers speak single-byte codepages (CP437/852/1252) with no
    // Lao glyph table, so sending Lao product names / the ₭ currency symbol
    // as raw UTF-8 text bytes silently drops or garbles them — that's why
    // item names and prices were disappearing on real prints. Instead we
    // rasterize the whole receipt to a monochrome bitmap (canvas → ESC/POS
    // "GS v 0" raster image command), which prints correctly on any printer
    // regardless of codepage support.
    function canvasToEscPosRaster(canvas: HTMLCanvasElement): Uint8Array {
        const ctx = canvas.getContext("2d")!;
        const w = canvas.width, h = canvas.height;
        const { data } = ctx.getImageData(0, 0, w, h);
        const bytesPerRow = Math.ceil(w / 8);
        const bandHeight = 240; // keep each raster command modest for wider printer compatibility
        const GS = 0x1d, ESC = 0x1b;
        const out: number[] = [ESC, 0x40, ESC, 0x61, 0x00]; // init, left-align

        for (let bandStart = 0; bandStart < h; bandStart += bandHeight) {
            const bh = Math.min(bandHeight, h - bandStart);
            out.push(GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, bh & 0xff, (bh >> 8) & 0xff);
            for (let row = 0; row < bh; row++) {
                const py = bandStart + row;
                for (let bx = 0; bx < bytesPerRow; bx++) {
                    let byte = 0;
                    for (let bit = 0; bit < 8; bit++) {
                        const px = bx * 8 + bit;
                        if (px < w) {
                            const idx = (py * w + px) * 4;
                            const a = data[idx + 3];
                            const lum = a === 0 ? 255 : (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
                            if (lum < 160) byte |= 0x80 >> bit;
                        }
                    }
                    out.push(byte);
                }
            }
        }

        out.push(GS, 0x56, 0x41, 0x03); // partial cut with feed
        return new Uint8Array(out);
    }

    async function buildEscPosReceiptImage(receipt: ReceiptData, settings: ReceiptSettings): Promise<Uint8Array> {
        const widthPx = Math.round((paperWidthMm(settings.paperSize) ?? 80) * 7.2); // ~203dpi thermal head
        const marginPx = 12;
        const contentWidth = widthPx - marginPx * 2;

        try {
            await Promise.all([
                document.fonts.load('16px "Noto Sans Lao"'),
                document.fonts.load('bold 16px "Noto Sans Lao"'),
            ]);
            await document.fonts.ready;
        } catch { /* best-effort — canvas falls back to a system font */ }

        const FONT = (size: number, bold = false) => `${bold ? "bold " : ""}${size}px "Noto Sans Lao", "Noto Sans", sans-serif`;

        type Op =
            | { kind: "text"; y: number; text: string; size: number; bold: boolean; align: "left" | "center" | "right" }
            | { kind: "row"; y: number; left: string; right: string; size: number; bold: boolean }
            | { kind: "divider"; y: number }
            | { kind: "barcode"; y: number; height: number; value: string }
            | { kind: "qrcode"; y: number; size: number; value: string };

        const mctx = document.createElement("canvas").getContext("2d")!;
        const ops: Op[] = [];
        let y = marginPx;

        function wrapText(text: string, size: number, bold: boolean, maxWidth: number): string[] {
            mctx.font = FONT(size, bold);
            const words = text.split(" ");
            const lines: string[] = [];
            let cur = "";
            for (const w of words) {
                const test = cur ? `${cur} ${w}` : w;
                if (cur && mctx.measureText(test).width > maxWidth) { lines.push(cur); cur = w; }
                else cur = test;
            }
            if (cur) lines.push(cur);
            const final: string[] = [];
            for (const line of lines) {
                if (mctx.measureText(line).width <= maxWidth) { final.push(line); continue; }
                let chunk = "";
                for (const ch of line) {
                    const test = chunk + ch;
                    if (chunk && mctx.measureText(test).width > maxWidth) { final.push(chunk); chunk = ch; }
                    else chunk = test;
                }
                if (chunk) final.push(chunk);
            }
            return final.length ? final : [""];
        }

        function addText(text: string, size: number, bold: boolean, align: "left" | "center" | "right", gap = 4) {
            for (const line of wrapText(text, size, bold, contentWidth)) {
                ops.push({ kind: "text", y, text: line, size, bold, align });
                y += size * 1.35;
            }
            y += gap;
        }
        function addRow(left: string, right: string, size: number, bold = false, gap = 4) {
            ops.push({ kind: "row", y, left, right, size, bold });
            y += size * 1.35 + gap;
        }
        function addDivider(gap = 6) {
            y += gap;
            ops.push({ kind: "divider", y });
            y += gap;
        }

        if (settings.branchName) addText(settings.branchName, 24, true, "center", 2);
        if (settings.branchAddress) addText(settings.branchAddress, 16, false, "center", 2);
        if (settings.branchPhone) addText(`${t("common.phone")}: ${settings.branchPhone}`, 16, false, "center", 2);
        addDivider();

        const date = new Date(receipt.createdAt);
        addRow(t("documents.receiptNo"), receipt.transactionNo, 16, true);
        addRow(t("documents.date"), `${date.toLocaleDateString("lo-LA")} ${date.toLocaleTimeString("lo-LA", { hour: "2-digit", minute: "2-digit" })}`, 16, false);
        if (receipt.cashierName) addRow(t("documents.cashier"), receipt.cashierName, 16, false);
        if (receipt.customerId) addRow(t("documents.customerId"), receipt.customerId, 16, false);
        if (receipt.customerName) addRow(t("documents.customer"), receipt.customerName, 16, false);
        addDivider();

        for (const item of receipt.items) {
            const variant = [item.size, item.color].filter(Boolean).join(" / ");
            addText(variant ? `${item.productName} (${variant})` : item.productName, 17, true, "left", 0);
            addRow(`  x${item.quantity} @ ${formatCurrency(item.unitPrice)}`, formatCurrency(item.total), 15, false, 6);
        }
        addDivider();

        addRow(t("documents.subtotal"), formatCurrency(receipt.subtotal), 16, false);
        if (receipt.discountAmount) addRow(t("documents.discount"), `-${formatCurrency(receipt.discountAmount)}`, 16, false);
        if (receipt.taxAmount) addRow("VAT", formatCurrency(receipt.taxAmount), 16, false);
        addDivider(4);
        addRow(t("documents.grandTotal"), formatCurrency(receipt.total), 22, true, 8);
        addDivider();

        addRow(t("documents.paymentMethod"), getPaymentMethodLabel(receipt.paymentMethod), 16, false);
        if (receipt.paymentMethod?.toUpperCase() === "CASH") {
            addRow(t("documents.received"), formatCurrency(receipt.received), 16, false);
            addRow(t("documents.change"), formatCurrency(receipt.change), 16, false);
        }

        if (settings.footerText) {
            addDivider();
            addText(settings.footerText, 16, false, "center", 2);
        }

        // A QR block placed in the custom design (documents/design) is the
        // user's actual intent to show it. Falls back to showQrCode !== false
        // (not a plain truthy check) to match showLogo/showTaxDetails'
        // convention elsewhere in this file — undefined means "never
        // explicitly turned off," not "hidden."
        if (designElements?.some((el) => el.type === "qrcode") || settings.showQrCode !== false) {
            const qrSize = 120;
            y += 10;
            ops.push({ kind: "qrcode", y, size: qrSize, value: paymentQrContent(receipt) });
            y += qrSize + 10;
        }

        const barcodeHeight = 70;
        y += 10;
        ops.push({ kind: "barcode", y, height: barcodeHeight, value: receipt.transactionNo });
        y += barcodeHeight + 10;

        if (settings.showTaxDetails && settings.branchTaxId) {
            addText(`TIN: ${settings.branchTaxId}`, 14, false, "center", 2);
        }
        y += marginPx;

        // QRCode.toCanvas is async, unlike JsBarcode — pre-render every QR op
        // before the (synchronous) draw loop below.
        const qrCanvases = new Map<Op, HTMLCanvasElement>();
        for (const op of ops) {
            if (op.kind === "qrcode") {
                const qrCanvas = document.createElement("canvas");
                try {
                    await QRCode.toCanvas(qrCanvas, op.value, { width: op.size, margin: 1, errorCorrectionLevel: "M" });
                    qrCanvases.set(op, qrCanvas);
                } catch { /* skip QR if it can't be generated */ }
            }
        }

        const canvas = document.createElement("canvas");
        canvas.width = widthPx;
        canvas.height = Math.ceil(y);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#000000";
        ctx.textBaseline = "top";

        for (const op of ops) {
            if (op.kind === "text") {
                ctx.font = FONT(op.size, op.bold);
                ctx.textAlign = op.align;
                const x = op.align === "left" ? marginPx : op.align === "right" ? widthPx - marginPx : widthPx / 2;
                ctx.fillText(op.text, x, op.y);
            } else if (op.kind === "row") {
                ctx.font = FONT(op.size, op.bold);
                ctx.textAlign = "left";
                ctx.fillText(op.left, marginPx, op.y);
                ctx.textAlign = "right";
                ctx.fillText(op.right, widthPx - marginPx, op.y);
            } else if (op.kind === "divider") {
                ctx.save();
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(marginPx, op.y);
                ctx.lineTo(widthPx - marginPx, op.y);
                ctx.stroke();
                ctx.restore();
            } else if (op.kind === "barcode") {
                try {
                    const bcCanvas = document.createElement("canvas");
                    JsBarcode(bcCanvas, op.value, {
                        format: "CODE128",
                        width: 2,
                        height: op.height - 20,
                        displayValue: true,
                        fontSize: 14,
                        margin: 0,
                        background: "#ffffff",
                        lineColor: "#000000",
                    });
                    const drawWidth = Math.min(bcCanvas.width, contentWidth);
                    const scale = drawWidth / bcCanvas.width;
                    const drawHeight = bcCanvas.height * scale;
                    ctx.drawImage(bcCanvas, (widthPx - drawWidth) / 2, op.y, drawWidth, drawHeight);
                } catch { /* skip barcode if it can't be generated */ }
            } else if (op.kind === "qrcode") {
                const qrCanvas = qrCanvases.get(op);
                if (qrCanvas) {
                    const drawSize = Math.min(op.size, contentWidth);
                    ctx.drawImage(qrCanvas, (widthPx - drawSize) / 2, op.y, drawSize, drawSize);
                }
            }
        }

        return canvasToEscPosRaster(canvas);
    }

    async function printReceipt(automatic = false): Promise<void> {
        if (!data || isPrinting) return;
        isPrinting = true;
        printError = null;
        try {
            await printReceiptViaNetwork(data, automatic);
            toast.success(t("printing.completed"));
        } catch (error) {
            printError = error instanceof Error ? error.message : t("printing.failed");
            toast.error(printError);
        } finally {
            isPrinting = false;
        }
    }

    $effect(() => {
        if (show && data && autoPrint && settingsLoaded && !printTriggered) {
            printTriggered = true;
            setTimeout(() => printReceipt(true), 300);
        }
        if (!show) printTriggered = false;
    });

    function handlePrint() {
        void printReceipt(false);
    }

    function handleBrowserPrint() {
        window.print();
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

    // Svelte action: renders a real CODE128 barcode into a <canvas>, used both
    // on-screen and for the browser print path (thermal ESC/POS printing uses
    // its own raster barcode drawn straight onto the receipt bitmap instead).
    function barcodeAction(node: HTMLCanvasElement, value: string) {
        function draw(v: string) {
            try {
                JsBarcode(node, v || " ", {
                    format: "CODE128",
                    width: 1.5,
                    height: 40,
                    displayValue: true,
                    fontSize: 10,
                    margin: 4,
                    background: "#ffffff",
                    lineColor: "#000000",
                });
            } catch { /* invalid/empty value — leave canvas blank */ }
        }
        draw(value);
        return { update: draw };
    }

    // The receipt's QR encodes a real "scan to pay" EMVco payload (bank apps
    // pre-fill the merchant account + exact amount) when the tenant has a QR
    // merchant account configured in Settings → Payment Methods. Without one,
    // it falls back to the transaction reference — still scannable, just not
    // a payment code. Same payload format as the receipt designer preview
    // (see $lib/utils/emvcoQr), so what a merchant previews while designing
    // their receipt matches what actually prints.
    function paymentQrContent(receipt: ReceiptData): string {
        const merchantAccount = tenantSettings.qrMerchantCode?.trim();
        if (!merchantAccount) return receipt.transactionNo;
        return generateEMVcoPayload({
            merchantAccount,
            amount: receipt.total,
            currency: tenantSettings.qrCurrencyCode || tenantSettings.currencyIsoCode,
            countryCode: tenantSettings.config.country || "LA",
            transactionId: receipt.transactionNo,
        });
    }

    // Svelte action: renders a real QR code into a <canvas> — this used to be
    // a static placeholder icon that never actually encoded anything.
    function qrcodeAction(node: HTMLCanvasElement, value: string) {
        function draw(v: string) {
            QRCode.toCanvas(node, v || " ", { width: 80, margin: 1, errorCorrectionLevel: "M" }).catch(() => { /* leave canvas blank */ });
        }
        draw(value);
        return { update: draw };
    }
</script>

<svelte:head>
    {#if show}
        <style>{`
            @media print {
                @page {
                    size: ${ printWidthMm === null ? 'A4 portrait' : `${printWidthMm}mm auto` };
                    margin: ${ printWidthMm === null ? '10mm' : '0mm' };
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
                    width: ${ printWidthMm === null ? '210mm' : `${printWidthMm}mm` } !important;
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
                    font-size: ${ printWidthMm === null ? '11pt'
                                : printWidthMm <= 60 ? '7pt'
                                : printWidthMm <= 90 ? '8pt'
                                : '9pt' } !important;
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
        `}</style>
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
                    style="width:{printWidthMm === null ? '100%' : `${Math.round(printWidthMm * 3.78)}px`}; font-size:{printWidthMm === null ? '13px' : printWidthMm <= 60 ? '8px' : printWidthMm <= 90 ? '10px' : '12px'}; line-height:1.5;">

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
                                            <div class="py-0.5">
                                                <div class="flex justify-between">
                                                    <span class="flex-1 print-text font-medium">
                                                        {item.productName}
                                                        {#if item.size || item.color}
                                                            <span class="text-gray-500">({[item.size, item.color].filter(Boolean).join(' / ')})</span>
                                                        {/if}
                                                    </span>
                                                    <span class="print-text">{formatCurrency(item.total)}</span>
                                                </div>
                                                <div class="print-text text-gray-500" style="font-size:{Math.max(el.fontSize - 2, 8)}px">
                                                    {formatCurrency(item.unitPrice)} x {item.quantity}
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {:else if el.type === 'qrcode'}
                                    <!-- The element existing in the saved design already means the
                                         merchant put it there — showQrCode (a separate flag with no
                                         settings UI to toggle it) must not additionally gate it, or
                                         a QR added in the design editor silently never renders.
                                         alignClass(el.align), not a fixed text-center — this was
                                         the one element type that never honored the design's actual
                                         left/center/right choice for it. -->
                                    <div class={`${alignClass(el.align)} py-2`}>
                                        <canvas class="inline-block" use:qrcodeAction={paymentQrContent(data)}></canvas>
                                    </div>
                                {:else if el.type === 'barcode'}
                                    <div class="text-center py-2">
                                        <canvas class="inline-block" use:barcodeAction={data.transactionNo}></canvas>
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
                                {#if data.cashierName}
                                    <div class="print-text text-gray-500">{t("documents.cashier")}:</div>
                                    <div class="print-text text-right">{data.cashierName}</div>
                                {/if}
                                {#if data.customerId}
                                    <div class="print-text text-gray-500">{t("documents.customerId")}:</div>
                                    <div class="print-text font-mono text-right">{data.customerId}</div>
                                {/if}
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

                            {#if receiptSettings.showQrCode !== false}
                                <!-- QR Code -->
                                <div class="text-center pt-2">
                                    <canvas class="inline-block" use:qrcodeAction={paymentQrContent(data)}></canvas>
                                </div>
                            {/if}

                            <!-- Barcode -->
                            <div class="text-center pt-2">
                                <canvas class="inline-block" use:barcodeAction={data.transactionNo}></canvas>
                            </div>

                            <!-- Footer -->
                            <div class="text-center pt-4 print-border border-t border-gray-200">
                                <p class="print-text text-sm text-gray-500">
                                    {receiptSettings.footerText ?? t("documents.thankYou")}
                                </p>
                                {#if receiptSettings.showTaxDetails !== false && receiptSettings.branchTaxId}
                                    <p class="print-text text-xs text-gray-400 mt-1">TIN: {receiptSettings.branchTaxId}</p>
                                {/if}
                                <p class="print-text text-xs text-gray-400 mt-1">Powered by KPOS</p>
                            </div>
                        </div>
                    {/if}

                </div>
            </div>

            <!-- Actions -->
            <div class="border-t border-gray-200 dark:border-gray-700 p-4 no-print">
                {#if printError}
                    <div class="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{printError}</span>
                    </div>
                {/if}
                <div class="flex flex-wrap gap-2">
                <button
                    onclick={handlePrint}
                    disabled={isPrinting}
                    class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
                >
                    {#if isPrinting}<Loader2 class="h-5 w-5 animate-spin" />{/if}
                    {t("printing.direct")}
                </button>
                <button
                    onclick={handleBrowserPrint}
                    disabled={isPrinting}
                    class="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                >
                    {t("printing.browserPdf")}
                </button>
                <button
                    onclick={onClose}
                    class="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                >
                    {t("common.close")}
                </button>
                </div>
            </div>
        </div>
    </div>
{/if}
