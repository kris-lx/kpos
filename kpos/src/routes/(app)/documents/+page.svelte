<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { cn, formatCurrency, formatDateTime } from "$utils";
    import { toast } from "svelte-sonner";
    import ReceiptPrint from "$lib/components/ReceiptPrint.svelte";
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
    let autoPrintReceipt = $state(false);

    // Maps the raw `GET sales/:id` transaction shape into what ReceiptPrint expects,
    // so this preview uses the exact same store logo/name + design-page layout as
    // the POS checkout receipt (settings/receipt + settings/receipt/design).
    let receiptData = $derived.by(() => {
        if (!previewDoc) return null;
        return {
            transactionNo: previewDoc.transactionNo,
            items: (previewDoc.items || []).map((item: any) => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.total,
            })),
            subtotal: previewDoc.subtotal,
            discountAmount: previewDoc.discountAmount,
            taxAmount: previewDoc.taxAmount,
            total: previewDoc.total,
            received: previewDoc.received,
            change: previewDoc.change,
            paymentMethod: previewDoc.payments?.[0]?.methodName || "CASH",
            customerName: previewDoc.customer?.name,
            cashierName: previewDoc.user?.name,
            createdAt: previewDoc.createdAt,
        };
    });

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

    async function openPreview(doc: any, autoPrint = false) {
        loadingPreview = true;
        autoPrintReceipt = autoPrint;
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
                                                onclick={() => openPreview(doc, true)}
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
                        {t("common.showing")} {(currentPage - 1) * rowsPerPage + 1} - {Math.min(currentPage * rowsPerPage, totalRecords)} {t("common.of")} {totalRecords} {t("common.items")}
                    </div>
                    <div class="flex items-center gap-2">
                        <select
                            bind:value={rowsPerPage}
                            onchange={() => { currentPage = 1; loadDocuments(); }}
                            class="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                            <option value={10}>10 {t("common.items")}</option>
                            <option value={25}>25 {t("common.items")}</option>
                            <option value={50}>50 {t("common.items")}</option>
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
<ReceiptPrint
    data={receiptData}
    show={showPreview}
    onClose={() => (showPreview = false)}
    autoPrint={autoPrintReceipt}
/>
