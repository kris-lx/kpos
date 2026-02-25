<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { formatCurrency, formatDateTime } from "$lib/utils";
    import { Banknote, CreditCard, QrCode } from "lucide-svelte";

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
        total: number;
        received: number;
        change: number;
        paymentMethod: string;
        customerName?: string;
        createdAt: Date;
    }

    interface Props {
        data: ReceiptData | null;
        show: boolean;
        onClose: () => void;
        autoPrint?: boolean;
    }

    let { data, show, onClose, autoPrint = true }: Props = $props();

    $effect(() => {
        if (show && data && autoPrint) {
            // Auto print after a short delay to ensure rendering
            setTimeout(() => {
                window.print();
            }, 300);
        }
    });

    function handlePrint() {
        window.print();
    }

    function getPaymentMethodIcon(method: string) {
        switch (method?.toUpperCase()) {
            case 'CASH': return Banknote;
            case 'CARD': return CreditCard;
            case 'QR': return QrCode;
            default: return Banknote;
        }
    }

    function getPaymentMethodLabel(method: string) {
        switch (method?.toUpperCase()) {
            case 'CASH': return t("documents.cash");
            case 'CARD': return t("documents.card");
            case 'QR': return 'QR Code';
            default: return method;
        }
    }
</script>

<svelte:head>
    {#if show}
        <style>
            @media print {
                body * {
                    visibility: hidden !important;
                }
                #pos-receipt, #pos-receipt * {
                    visibility: visible !important;
                }
                #pos-receipt {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 80mm !important;
                    background: white !important;
                    color: black !important;
                    padding: 10px !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                    font-size: 12px !important;
                    font-family: 'Noto Sans Lao', 'Phetsarath OT', sans-serif !important;
                }
                #pos-receipt .no-print {
                    display: none !important;
                }
                #pos-receipt .print-text {
                    color: black !important;
                }
                #pos-receipt .print-border {
                    border-color: black !important;
                }
            }
        </style>
    {/if}
</svelte:head>

{#if show && data}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 no-print" role="dialog" aria-modal="true">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <!-- Header -->
            <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center no-print">
                <div>
                    <h2 class="text-lg font-bold text-gray-900 dark:text-white">{t("documents.receiptTitle")}</h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400 font-mono">{data.transactionNo}</p>
                </div>
                <button onclick={onClose} class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    ✕
                </button>
            </div>

            <!-- Receipt Content - Printable Area -->
            <div class="p-4 overflow-y-auto flex-1">
                <div id="pos-receipt" class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <!-- Store Header -->
                    <div class="bg-gray-900 dark:bg-gray-800 text-white p-4 text-center">
                        <h3 class="font-bold text-lg">{t("documents.storeName")}</h3>
                        <p class="text-xs opacity-90">{t("documents.storeDesc")}</p>
                    </div>

                    <div class="p-4 space-y-4 bg-white dark:bg-gray-900">
                        <!-- Info -->
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <div class="print-text text-gray-500 dark:text-gray-400">{t("documents.receiptNo")}:</div>
                            <div class="print-text font-mono font-medium text-gray-900 dark:text-white text-right">{data.transactionNo}</div>
                            <div class="print-text text-gray-500 dark:text-gray-400">{t("documents.date")}:</div>
                            <div class="print-text text-gray-900 dark:text-white text-right">{formatDateTime(data.createdAt)}</div>
                            {#if data.customerName}
                                <div class="print-text text-gray-500 dark:text-gray-400">{t("documents.customer")}:</div>
                                <div class="print-text text-gray-900 dark:text-white text-right">{data.customerName}</div>
                            {/if}
                        </div>

                        <div class="print-border border-t border-dashed border-gray-300 dark:border-gray-600"></div>

                        <!-- Items -->
                        <div class="space-y-2">
                            {#each data.items as item}
                                <div class="flex justify-between text-sm">
                                    <div class="flex-1">
                                        <p class="print-text font-medium text-gray-900 dark:text-white">{item.productName}</p>
                                        <p class="print-text text-xs text-gray-500 dark:text-gray-400">
                                            {formatCurrency(item.unitPrice)} x {item.quantity}
                                        </p>
                                    </div>
                                    <span class="print-text font-medium text-gray-900 dark:text-white">{formatCurrency(item.total)}</span>
                                </div>
                            {/each}
                        </div>

                        <div class="print-border border-t border-dashed border-gray-300 dark:border-gray-600"></div>

                        <!-- Totals -->
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between">
                                <span class="print-text text-gray-500 dark:text-gray-400">{t("documents.subtotal")}</span>
                                <span class="print-text text-gray-900 dark:text-white">{formatCurrency(data.subtotal)}</span>
                            </div>
                            {#if data.discountAmount > 0}
                                <div class="flex justify-between text-red-600 dark:text-red-400">
                                    <span class="print-text">{t("documents.discount")}</span>
                                    <span class="print-text">-{formatCurrency(data.discountAmount)}</span>
                                </div>
                            {/if}
                        </div>

                        <div class="print-border border-t-2 border-gray-900 dark:border-white pt-2">
                            <div class="flex justify-between text-lg font-bold">
                                <span class="print-text text-gray-900 dark:text-white">{t("documents.grandTotal")}</span>
                                <span class="print-text text-primary-600 dark:text-primary-400">{formatCurrency(data.total)}</span>
                            </div>
                        </div>

                        <!-- Payment Info -->
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between">
                                <span class="print-text text-gray-500 dark:text-gray-400">{t("documents.paymentMethod")}:</span>
                                <span class="print-text text-gray-900 dark:text-white flex items-center gap-1">
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
                                    <span class="print-text text-gray-500 dark:text-gray-400">{t("documents.received")}</span>
                                    <span class="print-text text-gray-900 dark:text-white">{formatCurrency(data.received)}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="print-text text-gray-500 dark:text-gray-400">{t("documents.change")}</span>
                                    <span class="print-text text-green-600 dark:text-green-400 font-medium">{formatCurrency(data.change)}</span>
                                </div>
                            {/if}
                        </div>

                        <!-- Footer -->
                        <div class="text-center pt-4 print-border border-t border-gray-200 dark:border-gray-700">
                            <p class="print-text text-sm text-gray-500 dark:text-gray-400">{t("documents.thankYou")}</p>
                            <p class="print-text text-xs text-gray-400 dark:text-gray-500 mt-1">Powered by KPOS</p>
                        </div>
                    </div>
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
