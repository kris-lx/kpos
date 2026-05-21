<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { cn, formatCurrency, formatDateTime } from "$utils";
    import { toast } from "svelte-sonner";
    import {
        FileText,
        Printer,
        Download,
        Eye,
        Search,
        Settings,
        Receipt,
        ChevronLeft,
        ChevronRight,
        Loader2,
        RefreshCw,
        AlertCircle,
        X,
        CreditCard,
        Banknote,
    } from "lucide-svelte";

    // State
    let activeDocType = $state<"all" | "receipt" | "credit">("all");
    let searchQuery = $state("");
    let documents = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    
    // Pagination
    let currentPage = $state(1);
    let rowsPerPage = $state(10);
    let totalRecords = $state(0);
    
    // Preview
    let showPreview = $state(false);
    let previewDoc = $state<any>(null);
    let loadingPreview = $state(false);

    // Paper sizes
    let paperSizes = $derived([
        { id: "58mm", name: "58mm (Thermal)", description: t("documents.thermalSmall") },
        { id: "80mm", name: "80mm (Thermal)", description: t("documents.thermalMedium") },
        { id: "a4", name: "A4", description: t("documents.paperA4") },
    ]);
    let selectedPaperSize = $state({ id: "80mm", name: "80mm (Thermal)", description: "" });

    // Document types
    let documentTypes = $derived([
        { id: "all", label: t("documents.all"), icon: FileText },
        { id: "receipt", label: t("documents.receipts"), icon: Receipt },
        { id: "credit", label: t("documents.credit"), icon: CreditCard },
    ]);

    onMount(() => {
        loadDocuments();
    });

    async function loadDocuments() {
        loading = true;
        error = null;
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: rowsPerPage.toString(),
            });
            
            if (searchQuery) {
                params.append("search", searchQuery);
            }

            const response = await api.get(`sales?${params}`).json<any>();
            if (response.success) {
                documents = response.data || [];
                totalRecords = response.meta?.total || documents.length;
            } else {
                error = response.error?.message || t("documents.loadError");
                documents = [];
            }
        } catch (err) {
            console.error("Failed to load documents:", err);
            error = t("documents.connectionError");
            documents = [];
        } finally {
            loading = false;
        }
    }

    let filteredDocuments = $derived(
        documents.filter((doc) => {
            if (activeDocType === "all") return true;
            if (activeDocType === "credit") return doc.isCredit === true;
            if (activeDocType === "receipt") return doc.type === "SALE" && !doc.isCredit;
            return true;
        })
    );

    let totalPages = $derived(Math.ceil(totalRecords / rowsPerPage) || 1);

    let stats = $derived({
        totalSales: documents.filter(d => d.type === "SALE" && d.status === "COMPLETED").length,
        totalCredit: documents.filter(d => d.isCredit).length,
        totalVoided: documents.filter(d => d.status === "VOIDED").length,
    });

    async function openPreview(doc: any) {
        loadingPreview = true;
        try {
            const response = await api.get(`sales/${doc.id}`).json<any>();
            if (response.success) {
                previewDoc = response.data;
                showPreview = true;
            } else {
                toast.error(t("documents.previewError"));
            }
        } catch (err) {
            console.error("Failed to load document details:", err);
            toast.error(t("common.error"));
        } finally {
            loadingPreview = false;
        }
    }

    function printDocument(doc: any) {
        // Open preview first if not already open
        if (!showPreview || previewDoc?.id !== doc.id) {
            openPreview(doc).then(() => {
                setTimeout(() => {
                    window.print();
                }, 300);
            });
        } else {
            window.print();
        }
        toast.success(`${t("documents.printing")} ${doc.transactionNo}`);
    }

    function downloadDocument(doc: any) {
        toast.info(`${t("documents.downloading")} ${doc.transactionNo}`);
    }

    function getStatusColor(status: string): string {
        switch (status) {
            case "COMPLETED": return "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400";
            case "PENDING": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
            case "VOIDED": return "bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400";
            default: return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
        }
    }

    function getStatusLabel(status: string): string {
        switch (status) {
            case "COMPLETED": return t("documents.statusCompleted");
            case "PENDING": return t("documents.statusPending");
            case "VOIDED": return t("documents.statusVoided");
            default: return status;
        }
    }

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadDocuments();
        }
    }

    function handleSearch() {
        currentPage = 1;
        loadDocuments();
    }
</script>

<svelte:head>
    <title>{t("documents.title")} - KPOS</title>
    <style>
        @media print {
            body * {
                visibility: hidden !important;
            }
            #print-receipt, #print-receipt * {
                visibility: visible !important;
            }
            #print-receipt {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 80mm !important;
                background: white !important;
                color: black !important;
                padding: 10px !important;
                margin: 0 !important;
                box-shadow: none !important;
            }
            #print-receipt .no-print {
                display: none !important;
            }
            #print-receipt .print-header {
                background: white !important;
                color: black !important;
                border-bottom: 2px solid black !important;
            }
            #print-receipt .print-text {
                color: black !important;
            }
            #print-receipt .print-border {
                border-color: black !important;
            }
        }
    </style>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{t("documents.title")}</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("documents.subtitle")}</p>
        </div>
        <button
            onclick={() => loadDocuments()}
            disabled={loading}
            class="flex items-center gap-2 px-4 py-2 mt-4 sm:mt-0 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
            <RefreshCw class={cn("w-4 h-4", loading && "animate-spin")} />
            {t("documents.refresh")}
        </button>
    </div>

    <!-- Document Type Tabs -->
    <div class="flex flex-wrap gap-2 mb-6">
        {#each documentTypes as docType (docType.id)}
            <button
                onclick={() => { activeDocType = docType.id as any; currentPage = 1; }}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeDocType === docType.id
                        ? "bg-primary-600 text-white"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-primary-500",
                )}
            >
                <docType.icon class="w-4 h-4" />
                {docType.label}
            </button>
        {/each}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <!-- Document List -->
        <div class="lg:col-span-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <!-- Search -->
            <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                <div class="flex gap-3">
                    <div class="relative flex-1">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            bind:value={searchQuery}
                            onkeydown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder={t("documents.searchPlaceholder")}
                            class="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                    <button
                        onclick={handleSearch}
                        class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                    >
                        {t("documents.search")}
                    </button>
                </div>
            </div>

            {#if loading}
                <div class="flex flex-col items-center justify-center py-12">
                    <Loader2 class="w-8 h-8 text-primary-600 animate-spin" />
                    <p class="mt-3 text-gray-500 dark:text-gray-400">{t("documents.loading")}</p>
                </div>
            {:else if error}
                <div class="text-center py-12">
                    <AlertCircle class="w-12 h-12 mx-auto text-danger-400" />
                    <p class="mt-4 text-gray-700 dark:text-gray-300">{error}</p>
                    <button onclick={() => loadDocuments()} class="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                        {t("common.tryAgain")}
                    </button>
                </div>
            {:else if filteredDocuments.length === 0}
                <div class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                    <FileText class="w-12 h-12 mb-3 opacity-50" />
                    <p>{t("documents.noDocuments")}</p>
                </div>
            {:else}
                <!-- Documents Table -->
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50 dark:bg-gray-700/50">
                            <tr class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                                <th class="px-4 py-3">{t("documents.transactionNo")}</th>
                                <th class="px-4 py-3">{t("documents.customer")}</th>
                                <th class="px-4 py-3">{t("documents.date")}</th>
                                <th class="px-4 py-3">{t("documents.items")}</th>
                                <th class="px-4 py-3 text-right">{t("documents.total")}</th>
                                <th class="px-4 py-3">{t("documents.status")}</th>
                                <th class="px-4 py-3 text-center">{t("documents.actions")}</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                            {#each filteredDocuments as doc (doc.id)}
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td class="px-4 py-3">
                                        <div class="flex items-center gap-2">
                                            {#if doc.isCredit}
                                                <CreditCard class="w-4 h-4 text-blue-500" />
                                            {:else}
                                                <Receipt class="w-4 h-4 text-gray-400" />
                                            {/if}
                                            <span class="font-medium text-gray-900 dark:text-white font-mono text-sm">
                                                {doc.transactionNo}
                                            </span>
                                        </div>
                                    </td>
                                    <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
                                        {doc.customer?.name || t("documents.walkInCustomer")}
                                    </td>
                                    <td class="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">
                                        {formatDateTime(doc.createdAt)}
                                    </td>
                                    <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
                                        {doc.items?.length || 0} {t("documents.items")}
                                    </td>
                                    <td class="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                                        {formatCurrency(doc.total)}
                                    </td>
                                    <td class="px-4 py-3">
                                        <span class={cn("px-2 py-1 rounded-full text-xs font-medium", getStatusColor(doc.status))}>
                                            {getStatusLabel(doc.status)}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <div class="flex items-center justify-center gap-1">
                                            <button
                                                onclick={() => openPreview(doc)}
                                                disabled={loadingPreview}
                                                class="p-2 text-gray-500 hover:text-primary-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                                                title={t("documents.view")}
                                            >
                                                <Eye class="w-4 h-4" />
                                            </button>
                                            <button
                                                onclick={() => printDocument(doc)}
                                                class="p-2 text-gray-500 hover:text-primary-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                                title={t("documents.print")}
                                            >
                                                <Printer class="w-4 h-4" />
                                            </button>
                                            <button
                                                onclick={() => downloadDocument(doc)}
                                                class="p-2 text-gray-500 hover:text-primary-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                                title={t("documents.download")}
                                            >
                                                <Download class="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                <!-- Pagination -->
                <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                        ສະແດງ {(currentPage - 1) * rowsPerPage + 1} - {Math.min(currentPage * rowsPerPage, totalRecords)} ຈາກ {totalRecords} ລາຍການ
                    </div>
                    <div class="flex items-center gap-2">
                        <select
                            bind:value={rowsPerPage}
                            onchange={() => { currentPage = 1; loadDocuments(); }}
                            class="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                            <option value={10}>10 ລາຍການ</option>
                            <option value={25}>25 ລາຍການ</option>
                            <option value={50}>50 ລາຍການ</option>
                        </select>
                        <div class="flex items-center gap-1">
                            <button
                                onclick={() => goToPage(currentPage - 1)}
                                disabled={currentPage === 1}
                                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft class="w-5 h-5" />
                            </button>
                            {#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let start = Math.max(1, currentPage - 2);
                                let end = Math.min(totalPages, start + 4);
                                start = Math.max(1, end - 4);
                                return start + i;
                            }).filter(p => p <= totalPages) as page}
                                <button
                                    onclick={() => goToPage(page)}
                                    class={cn(
                                        "w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                                        page === currentPage
                                            ? "bg-primary-600 text-white"
                                            : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                                    )}
                                >
                                    {page}
                                </button>
                            {/each}
                            <button
                                onclick={() => goToPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronRight class="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Sidebar -->
        <div class="space-y-6">
            <!-- Paper Size -->
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Settings class="w-4 h-4" />
                    {t("documents.paperSize")}
                </h3>
                <div class="space-y-2">
                    {#each paperSizes as size (size.id)}
                        <button
                            onclick={() => selectedPaperSize = size}
                            class={cn(
                                "w-full flex flex-col items-start p-3 rounded-lg border transition-all text-left",
                                selectedPaperSize.id === size.id
                                    ? "bg-primary-50 dark:bg-primary-900/20 border-primary-500"
                                    : "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:border-primary-300",
                            )}
                        >
                            <span class={cn("text-sm font-medium", selectedPaperSize.id === size.id ? "text-primary-700 dark:text-primary-400" : "text-gray-900 dark:text-white")}>
                                {size.name}
                            </span>
                            <span class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{size.description}</span>
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Stats -->
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t("documents.statistics")}</h3>
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                            <Receipt class="w-4 h-4" />
                            {t("documents.totalReceipts")}
                        </span>
                        <span class="font-semibold text-gray-900 dark:text-white">{stats.totalSales}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                            <CreditCard class="w-4 h-4" />
                            {t("documents.creditSales")}
                        </span>
                        <span class="font-semibold text-gray-900 dark:text-white">{stats.totalCredit}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                            <X class="w-4 h-4" />
                            {t("documents.voided")}
                        </span>
                        <span class="font-semibold text-gray-900 dark:text-white">{stats.totalVoided}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Bill Preview Modal -->
{#if showPreview && previewDoc}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 no-print" role="dialog" aria-modal="true">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <!-- Header -->
            <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center no-print">
                <div>
                    <h2 class="text-lg font-bold text-gray-900 dark:text-white">{t("documents.receiptTitle")}</h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400 font-mono">{previewDoc.transactionNo}</p>
                </div>
                <button onclick={() => showPreview = false} class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <X class="w-5 h-5" />
                </button>
            </div>

            <!-- Bill Content - Printable Area -->
            <div class="p-4 overflow-y-auto flex-1">
                <div id="print-receipt" class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <!-- Store Header -->
                    <div class="print-header bg-gradient-to-r from-primary-600 to-primary-700 dark:from-primary-700 dark:to-primary-800 text-white p-4 text-center">
                        <h3 class="font-bold text-lg">{t("documents.storeName")}</h3>
                        <p class="text-xs opacity-90">{t("documents.storeDesc")}</p>
                    </div>

                    <div class="p-4 space-y-4 bg-white dark:bg-gray-900">
                        <!-- Info -->
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <div class="print-text text-gray-500 dark:text-gray-400">{t("documents.receiptNo")}:</div>
                            <div class="print-text font-mono font-medium text-gray-900 dark:text-white text-right">{previewDoc.transactionNo}</div>
                            <div class="print-text text-gray-500 dark:text-gray-400">{t("documents.date")}:</div>
                            <div class="print-text text-gray-900 dark:text-white text-right">{formatDateTime(previewDoc.createdAt)}</div>
                            <div class="print-text text-gray-500 dark:text-gray-400">{t("documents.customer")}:</div>
                            <div class="print-text text-gray-900 dark:text-white text-right">{previewDoc.customer?.name || t("documents.walkInCustomer")}</div>
                        </div>

                        <div class="print-border border-t border-dashed border-gray-300 dark:border-gray-600"></div>

                        <!-- Items -->
                        <div class="space-y-2">
                            {#each previewDoc.items || [] as item (item.productName)}
                                <div class="flex justify-between text-sm">
                                    <div>
                                        <p class="print-text font-medium text-gray-900 dark:text-white">{item.productName}</p>
                                        <p class="print-text text-xs text-gray-500 dark:text-gray-400">{formatCurrency(item.unitPrice)} x {item.quantity}</p>
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
                                <span class="print-text text-gray-900 dark:text-white">{formatCurrency(previewDoc.subtotal)}</span>
                            </div>
                            {#if previewDoc.discountAmount > 0}
                                <div class="flex justify-between text-danger-600 dark:text-danger-400">
                                    <span class="print-text">{t("documents.discount")}</span>
                                    <span class="print-text">-{formatCurrency(previewDoc.discountAmount)}</span>
                                </div>
                            {/if}
                        </div>

                        <div class="print-border border-t-2 border-gray-900 dark:border-white pt-2">
                            <div class="flex justify-between text-lg font-bold">
                                <span class="print-text text-gray-900 dark:text-white">{t("documents.grandTotal")}</span>
                                <span class="print-text text-primary-600 dark:text-primary-400">{formatCurrency(previewDoc.total)}</span>
                            </div>
                        </div>

                        {#if previewDoc.received > 0}
                            <div class="space-y-1 text-sm">
                                <div class="flex justify-between">
                                    <span class="print-text text-gray-500 dark:text-gray-400">{t("documents.received")}</span>
                                    <span class="print-text text-gray-900 dark:text-white">{formatCurrency(previewDoc.received)}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="print-text text-gray-500 dark:text-gray-400">{t("documents.change")}</span>
                                    <span class="print-text text-success-600 dark:text-success-400 font-medium">{formatCurrency(previewDoc.change)}</span>
                                </div>
                            </div>
                        {/if}

                        <!-- Payment Method -->
                        {#if previewDoc.paymentMethod}
                            <div class="print-border border-t border-dashed border-gray-300 dark:border-gray-600 pt-2">
                                <div class="flex justify-between text-sm">
                                    <span class="print-text text-gray-500 dark:text-gray-400">{t("documents.paymentMethod")}:</span>
                                    <span class="print-text text-gray-900 dark:text-white flex items-center gap-1">
                                        {#if previewDoc.paymentMethod === 'CASH'}
                                            <Banknote class="w-4 h-4" />
                                            {t("documents.cash")}
                                        {:else if previewDoc.paymentMethod === 'CARD'}
                                            <CreditCard class="w-4 h-4" />
                                            {t("documents.card")}
                                        {:else}
                                            {previewDoc.paymentMethod}
                                        {/if}
                                    </span>
                                </div>
                            </div>
                        {/if}

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
                <button onclick={() => printDocument(previewDoc)} class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                    <Printer class="w-4 h-4" />
                    {t("documents.print")}
                </button>
                <button onclick={() => downloadDocument(previewDoc)} class="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Download class="w-4 h-4" />
                    {t("documents.download")}
                </button>
                <button onclick={() => showPreview = false} class="px-4 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">{t("common.close")}</button>
            </div>
        </div>
    </div>
{/if}
