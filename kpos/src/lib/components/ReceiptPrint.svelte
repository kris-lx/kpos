<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '$api';
    import { t } from "$lib/i18n/index.svelte";
    import { formatCurrency, formatDateTime } from "$lib/utils";
    import { Banknote, CreditCard, QrCode, Image } from "lucide-svelte";

    interface ReceiptItem {
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        total: number;
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
        paperSize?: '58mm' | '80mm';
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

    $effect(() => {
        if (show && data && autoPrint && settingsLoaded && !printTriggered) {
            printTriggered = true;
            setTimeout(() => window.print(), 300);
        }
        if (!show) printTriggered = false;
    });

    function handlePrint() {
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
</script>

<svelte:head>
    {#if show}
        <style>
            @media print {
                @page {
                    size: {receiptSettings.paperSize === '58mm' ? '58mm' : receiptSettings.paperSize === 'A4' ? 'A4' : '80mm'};
                    margin: 4mm;
                }
                body * { visibility: hidden !important; }
                #pos-receipt, #pos-receipt * { visibility: visible !important; }
                #pos-receipt {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: {receiptSettings.paperSize === '58mm' ? '58mm' : receiptSettings.paperSize === 'A4' ? '210mm' : '80mm'} !important;
                    background: white !important;
                    color: black !important;
                    padding: 4mm !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                    font-size: {receiptSettings.paperSize === 'A4' ? '14px' : '12px'} !important;
                    font-family: 'Noto Sans Lao', 'Phetsarath OT', sans-serif !important;
                }
                #pos-receipt .no-print { display: none !important; }
                #pos-receipt .print-text { color: black !important; }
                #pos-receipt .print-border { border-color: black !important; }
            }
        </style>
    {/if}
</svelte:head>

{#if show && data}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 no-print" role="dialog" aria-modal="true">
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
                <div id="pos-receipt" class="bg-white rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden font-mono text-sm text-gray-900">

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
                                                <span class="flex-1 print-text">{item.productName} x{item.quantity}</span>
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
                        <!-- Default receipt layout (no saved design) -->
                        <div class="bg-gray-900 text-white p-4 text-center">
                            {#if receiptSettings.showLogo !== false && receiptSettings.branchLogo}
                                <img src={receiptSettings.branchLogo} alt="Logo" class="mx-auto mb-2 max-h-16 max-w-24 object-contain" />
                            {/if}
                            <h3 class="font-bold text-lg">{receiptSettings.branchName ?? t("documents.storeName")}</h3>
                            {#if receiptSettings.branchAddress}
                                <p class="text-xs opacity-80 mt-0.5">{receiptSettings.branchAddress}</p>
                            {/if}
                            {#if receiptSettings.branchPhone}
                                <p class="text-xs opacity-80">{t("common.phone")}: {receiptSettings.branchPhone}</p>
                            {/if}
                        </div>

                        <div class="p-4 space-y-4">
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
                                            <p class="print-text font-medium">{item.productName}</p>
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

                            <div class="print-border border-t-2 border-gray-900 pt-2">
                                <div class="flex justify-between text-lg font-bold">
                                    <span class="print-text">{t("documents.grandTotal")}</span>
                                    <span class="print-text text-primary-600">{formatCurrency(data.total)}</span>
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
