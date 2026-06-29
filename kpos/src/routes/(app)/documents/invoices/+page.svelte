<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatCurrency, formatDateTime, formatDate, enforcePhoneInput } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import { onMount } from "svelte";
    import { auth } from "$stores";
    import MoneyInput from "$lib/components/MoneyInput.svelte";
    import {
        FileText,
        Plus,
        Search,
        Eye,
        Printer,
        Edit,
        Trash2,
        X,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Send,
        DollarSign,
        Clock,
        AlertCircle,
        CheckCircle,
        Building2,
        Phone,
        Mail,
        MapPin,
        RefreshCw,
        ThumbsUp,
        ThumbsDown,
    } from "lucide-svelte";

    // State
    let invoices = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let searchQuery = $state("");
    let filterStatus = $state("all");
    let showModal = $state(false);
    let showViewModal = $state(false);
    let showPrintModal = $state(false);
    let editingInvoice = $state<any>(null);
    let viewingInvoice = $state<any>(null);
    let isSaving = $state(false);
    let invoiceSettings = $state<any>({});

    // Pagination
    let currentPage = $state(1);
    let pageSize = $state(10);
    let totalItems = $state(0);
    const pageSizeOptions = [10, 25, 50, 100];

    // Form state
    let formData = $state({
        customerId: "",
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        customerAddress: "",
        dueDate: "",
        notes: "",
        items: [] as Array<{ description: string; quantity: number; unitPrice: number; total: number }>,
        subtotal: 0,
        tax: 0,
        total: 0,
    });

    $effect(() => {
        auth.activeStoreId; // reload on store switch
        loadData();
    });

    onMount(() => {
        loadSettings();
    });

    async function loadSettings() {
        try {
            const response = await api.get("documents/settings").json<any>();
            if (response.success) {
                invoiceSettings = response.data;
            }
        } catch (err) {
            console.error("Failed to load invoice settings:", err);
        }
    }

    async function loadData() {
        loading = true;
        try {
            const params = new URLSearchParams();
            if (filterStatus !== "all") params.append("status", filterStatus);
            params.append("page", currentPage.toString());
            params.append("limit", pageSize.toString());
            if (searchQuery) params.append("search", searchQuery);
            const invBranchId = auth.activeBranchId;
            if (invBranchId && !auth.isSuperAdmin) params.append("branchId", invBranchId);

            const response = await api.get(`documents/invoices?${params}`).json<any>();
            if (response.success && response.data) {
                invoices = response.data;
                totalItems = response.pagination?.total || response.data.length;
                error = null;
            } else {
                invoices = [];
                totalItems = 0;
                error = t("documents.loadFailed");
                toast.error(t("documents.loadFailed"));
            }
        } catch (err) {
            console.error("Failed to load invoices:", err);
            invoices = [];
            totalItems = 0;
            error = t("documents.loadFailed");
            toast.error(t("documents.loadFailed"));
        } finally {
            loading = false;
        }
    }

    function getStatusClass(status: string) {
        switch (status) {
            case "paid":
                return "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400";
            case "pending":
                return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
            case "overdue":
                return "bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400";
            case "sent":
                return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
            case "cancelled":
                return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400";
            default:
                return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400";
        }
    }

    function getStatusLabel(status: string) {
        const labels: Record<string, string> = {
            paid: t("documents.paid"),
            pending: t("documents.pending"),
            pending_approval: t("documents.pendingApproval"),
            approved: t("documents.approved"),
            overdue: t("documents.overdue"),
            sent: t("documents.sent"),
            cancelled: t("documents.cancelled"),
            rejected: t("documents.rejected"),
        };
        return labels[status] || status;
    }

    // Maker/checker
    let canApprove = $derived(auth.isSuperAdmin || (auth.roleLevel ?? 7) <= 4);

    async function approveInvoice(id: string) {
        try {
            await api.patch(`documents/invoices/${id}/approve`).json();
            toast.success(t("documents.invoiceApproved"));
            loadData();
        } catch (e: any) {
            toast.error(e?.message || t("common.error"));
        }
    }

    let invRejectReason = $state("");
    let showInvRejectModal = $state(false);
    let invRejectTargetId = $state<string | null>(null);

    function openInvRejectModal(id: string) {
        invRejectTargetId = id;
        invRejectReason = "";
        showInvRejectModal = true;
    }

    async function confirmInvReject() {
        if (!invRejectTargetId) return;
        try {
            await api.patch(`documents/invoices/${invRejectTargetId}/reject`, { json: { reason: invRejectReason } }).json();
            toast.success(t("documents.invoiceRejected"));
            showInvRejectModal = false;
            invRejectTargetId = null;
            loadData();
        } catch (e: any) {
            toast.error(e?.message || t("common.error"));
        }
    }

    let totalPages = $derived(Math.ceil(totalItems / pageSize));

    // Stats
    let stats = $derived({
        total: invoices.length,
        paid: invoices.filter(i => i.status === "paid").length,
        pending: invoices.filter(i => i.status === "pending").length,
        overdue: invoices.filter(i => i.status === "overdue").length,
        totalAmount: invoices.reduce((sum, i) => sum + (i.total || 0), 0),
    });

    function openModal(invoice?: any) {
        if (invoice) {
            editingInvoice = invoice;
            formData = {
                customerId: invoice.customerId || "",
                customerName: invoice.customer?.name || "",
                customerEmail: invoice.customer?.email || "",
                customerPhone: invoice.customer?.phone || "",
                customerAddress: invoice.customer?.address || "",
                dueDate: invoice.dueDate?.split("T")[0] || "",
                notes: invoice.notes || "",
                items: invoice.items?.length > 0 ? invoice.items : [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
                subtotal: invoice.subtotal || 0,
                tax: invoice.tax || 0,
                total: invoice.total || 0,
            };
        } else {
            editingInvoice = null;
            formData = {
                customerId: "",
                customerName: "",
                customerEmail: "",
                customerPhone: "",
                customerAddress: "",
                dueDate: "",
                notes: "",
                items: [{ description: "", quantity: 1, unitPrice: 0, total: 0 }],
                subtotal: 0,
                tax: 0,
                total: 0,
            };
        }
        showModal = true;
    }

    function closeModal() {
        showModal = false;
        editingInvoice = null;
    }

    function addItem() {
        formData.items = [...formData.items, { description: "", quantity: 1, unitPrice: 0, total: 0 }];
    }

    function removeItem(index: number) {
        formData.items = formData.items.filter((_, i) => i !== index);
        calculateTotals();
    }

    function calculateTotals() {
        formData.items = formData.items.map(item => ({
            ...item,
            total: item.quantity * item.unitPrice,
        }));
        formData.subtotal = formData.items.reduce((sum, item) => sum + item.total, 0);
        const taxRate = invoiceSettings.defaultTaxRate || 10;
        formData.tax = formData.subtotal * (taxRate / 100);
        formData.total = formData.subtotal + formData.tax;
    }

    async function handleSubmit() {
        if (!formData.customerName) {
            toast.error(t("documents.customerRequired"));
            return;
        }

        if (formData.items.length === 0 || formData.items.every(i => !i.description)) {
            toast.error(t("documents.itemsRequired"));
            return;
        }

        isSaving = true;
        try {
            const payload = {
                ...formData,
                dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
            };

            if (editingInvoice) {
                await api.put(`documents/invoices/${editingInvoice.id}`, { json: payload }).json();
                toast.success(t("documents.invoiceUpdated"));
            } else {
                await api.post("documents/invoices", { json: payload }).json();
                toast.success(t("documents.invoiceCreated"));
            }

            closeModal();
            await loadData();
        } catch (error) {
            console.error("Failed to save invoice:", error);
            toast.error(t("documents.saveFailed"));
        } finally {
            isSaving = false;
        }
    }

    function viewInvoice(invoice: any) {
        viewingInvoice = invoice;
        showViewModal = true;
    }

    async function deleteInvoice(id: string) {
        if (!confirm(t("documents.confirmDelete"))) return;

        try {
            await api.delete(`documents/invoices/${id}`).json();
            toast.success(t("documents.invoiceDeleted"));
            await loadData();
        } catch (error) {
            console.error("Failed to delete invoice:", error);
            toast.error(t("documents.deleteFailed"));
        }
    }

    async function markAsPaid(invoice: any) {
        try {
            await api.put(`documents/invoices/${invoice.id}/mark-paid`).json();
            toast.success(t("documents.markedAsPaid"));
            await loadData();
            if (showViewModal) {
                showViewModal = false;
            }
        } catch (error) {
            console.error("Failed to mark as paid:", error);
            toast.error(t("common.error"));
        }
    }

    async function sendInvoice(invoice: any) {
        try {
            await api.post(`documents/invoices/${invoice.id}/send`).json();
            toast.success(t("documents.invoiceSent"));
            await loadData();
        } catch (error) {
            console.error("Failed to send invoice:", error);
            toast.error(t("common.error"));
        }
    }

    function printInvoice(invoice: any) {
        viewingInvoice = invoice;
        showPrintModal = true;
    }

    function doPrint() {
        window.print();
    }

    // Debounced search
    let searchTimeout: ReturnType<typeof setTimeout>;
    function handleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadData();
        }, 300);
    }

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
        }
    }
</script>

<svelte:head>
    <title>{t("documents.invoices")} - KPOS</title>
    <style>
        @media print {
            body * {
                visibility: hidden;
            }
            #print-area, #print-area * {
                visibility: visible;
            }
            #print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
            }
        }
    </style>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {t("documents.invoices")}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t("documents.invoicesDesc")}
            </p>
        </div>
        <button
            onclick={() => openModal()}
            class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors mt-4 sm:mt-0"
        >
            <Plus class="w-4 h-4" />
            {t("documents.createInvoice")}
        </button>
    </div>

    <!-- Error State -->
    {#if error && !loading}
        <div class="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-xl p-6 mb-6">
            <div class="flex flex-col items-center justify-center text-center">
                <AlertCircle class="w-12 h-12 text-danger-500 mb-3" />
                <h3 class="text-lg font-semibold text-danger-700 dark:text-danger-400 mb-2">{t("common.error")}</h3>
                <p class="text-danger-600 dark:text-danger-300 mb-4">{error}</p>
                <button
                    onclick={() => loadData()}
                    class="flex items-center gap-2 px-4 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700 transition-colors"
                >
                    <RefreshCw class="w-4 h-4" />
                    {t("common.retry")}
                </button>
            </div>
        </div>
    {/if}

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <FileText class="w-5 h-5 text-blue-500" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{t("documents.totalInvoices")}</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-success-50 dark:bg-success-900/20 rounded-lg">
                    <CheckCircle class="w-5 h-5 text-success-500" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{stats.paid}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{t("documents.paid")}</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <Clock class="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{t("documents.pending")}</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-danger-50 dark:bg-danger-900/20 rounded-lg">
                    <AlertCircle class="w-5 h-5 text-danger-500" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{stats.overdue}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{t("documents.overdue")}</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm col-span-2 md:col-span-1">
            <div>
                <p class="text-2xl font-bold text-primary-600 dark:text-primary-400">{formatCurrency(stats.totalAmount)}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">{t("documents.totalAmount")}</p>
            </div>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-6">
        <div class="flex flex-wrap gap-4">
            <div class="relative flex-1 min-w-[200px]">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    oninput={handleSearch}
                    placeholder="{t('common.search')}..."
                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                />
            </div>
            <select
                bind:value={filterStatus}
                onchange={() => { currentPage = 1; loadData(); }}
                class="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
            >
                <option value="all">{t("common.all")}</option>
                <option value="pending">{t("documents.pending")}</option>
                <option value="paid">{t("documents.paid")}</option>
                <option value="sent">{t("documents.sent")}</option>
                <option value="overdue">{t("documents.overdue")}</option>
                <option value="cancelled">{t("documents.cancelled")}</option>
            </select>
            <select
                bind:value={pageSize}
                onchange={() => { currentPage = 1; loadData(); }}
                class="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
            >
                {#each pageSizeOptions as size (size)}
                    <option value={size}>{size} {t("common.perPage")}</option>
                {/each}
            </select>
        </div>
    </div>

    <!-- Table -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        {#if loading}
            <div class="flex items-center justify-center py-12">
                <Loader2 class="w-8 h-8 animate-spin text-primary-600" />
            </div>
        {:else if invoices.length === 0}
            <div class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                <FileText class="w-12 h-12 mb-3 opacity-50" />
                <p>{t("common.noData")}</p>
            </div>
        {:else}
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t("documents.invoiceNo")}</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t("common.date")}</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t("documents.customer")}</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t("documents.dueDate")}</th>
                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t("common.amount")}</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t("common.status")}</th>
                            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t("common.actions")}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                        {#each invoices as invoice (invoice.id)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td class="px-4 py-3 font-medium text-primary-600 dark:text-primary-400">{invoice.invoiceNo}</td>
                                <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(invoice.createdAt)}</td>
                                <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{invoice.customer?.name || "-"}</td>
                                <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{invoice.dueDate ? formatDate(invoice.dueDate) : "-"}</td>
                                <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white text-right">{formatCurrency(invoice.total || 0)}</td>
                                <td class="px-4 py-3">
                                    <span class="px-2 py-1 rounded-full text-xs font-medium {getStatusClass(invoice.status)}">
                                        {getStatusLabel(invoice.status)}
                                    </span>
                                </td>
                                <td class="px-4 py-3">
                                    <div class="flex items-center justify-center gap-1">
                                        <button
                                            onclick={() => viewInvoice(invoice)}
                                            class="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                            title={t("common.view")}
                                        >
                                            <Eye class="w-4 h-4" />
                                        </button>
                                        <button
                                            onclick={() => printInvoice(invoice)}
                                            class="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                            title={t("documents.print")}
                                        >
                                            <Printer class="w-4 h-4" />
                                        </button>
                                        {#if invoice.status === "pending_approval" && canApprove}
                                            <button
                                                onclick={() => approveInvoice(invoice.id)}
                                                class="p-2 text-success-600 hover:bg-success-50 dark:hover:bg-success-900/30 rounded-lg"
                                                title={t("common.approve")}
                                            >
                                                <ThumbsUp class="w-4 h-4" />
                                            </button>
                                            <button
                                                onclick={() => openInvRejectModal(invoice.id)}
                                                class="p-2 text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded-lg"
                                                title={t("common.reject")}
                                            >
                                                <ThumbsDown class="w-4 h-4" />
                                            </button>
                                        {/if}
                                        {#if invoice.status === "pending"}
                                            <button
                                                onclick={() => markAsPaid(invoice)}
                                                class="p-2 text-gray-500 hover:text-success-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                                title={t("documents.markAsPaid")}
                                            >
                                                <DollarSign class="w-4 h-4" />
                                            </button>
                                            <button
                                                onclick={() => sendInvoice(invoice)}
                                                class="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                                title={t("documents.send")}
                                            >
                                                <Send class="w-4 h-4" />
                                            </button>
                                        {/if}
                                        <button
                                            onclick={() => openModal(invoice)}
                                            class="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                            title={t("common.edit")}
                                        >
                                            <Edit class="w-4 h-4" />
                                        </button>
                                        <button
                                            onclick={() => deleteInvoice(invoice.id)}
                                            class="p-2 text-gray-500 hover:text-danger-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                            title={t("common.delete")}
                                        >
                                            <Trash2 class="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <!-- Pagination -->
            <div class="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                    {t("common.showing")} {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalItems)} {t("common.of")} {totalItems}
                </p>
                <div class="flex items-center gap-2">
                    <button
                        onclick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        class="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft class="w-4 h-4" />
                    </button>
                    <span class="text-sm text-gray-700 dark:text-gray-300">
                        {currentPage} / {totalPages || 1}
                    </span>
                    <button
                        onclick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        class="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight class="w-4 h-4" />
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

<!-- Create/Edit Invoice Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            role="button"
            tabindex="0"
            onclick={closeModal}
            onkeydown={(e) => e.key === 'Escape' && closeModal()}
        ></div>
        
        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
            <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {editingInvoice ? t("documents.editInvoice") : t("documents.createInvoice")}
                </h2>
                <button
                    onclick={closeModal}
                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>
            
            <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-180px)]">
                <!-- Customer Info -->
                <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                    <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <Building2 class="w-4 h-4" />
                        {t("documents.customerInfo")}
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="md:col-span-2">
                            <label for="a11y-app-documents-invoices-page-svelte-1" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("documents.customerName")} <span class="text-danger-500">*</span>
                            </label>
                            <input id="a11y-app-documents-invoices-page-svelte-1"
                                type="text"
                                bind:value={formData.customerName}
                                placeholder={t("documents.customerNamePlaceholder")}
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                                required
                            />
                        </div>
                        <div>
                            <label for="a11y-app-documents-invoices-page-svelte-2" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("documents.customerEmail")}
                            </label>
                            <input id="a11y-app-documents-invoices-page-svelte-2"
                                type="email"
                                bind:value={formData.customerEmail}
                                placeholder="email@example.com"
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <div>
                            <label for="a11y-app-documents-invoices-page-svelte-3" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("documents.customerPhone")}
                            </label>
                            <input id="a11y-app-documents-invoices-page-svelte-3"
                                type="tel"
                                bind:value={formData.customerPhone}
                                oninput={(e) => { formData.customerPhone = enforcePhoneInput(e.currentTarget.value); }}
                                placeholder="20xxxxxxxx"
                                maxlength="10"
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <div class="md:col-span-2">
                            <label for="a11y-app-documents-invoices-page-svelte-4" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t("documents.customerAddress")}
                            </label>
                            <input id="a11y-app-documents-invoices-page-svelte-4"
                                type="text"
                                bind:value={formData.customerAddress}
                                placeholder={t("documents.customerAddressPlaceholder")}
                                class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                    </div>
                </div>

                <!-- Due Date -->
                <div>
                    <label for="a11y-app-documents-invoices-page-svelte-5" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("documents.dueDate")}
                    </label>
                    <input id="a11y-app-documents-invoices-page-svelte-5"
                        type="date"
                        bind:value={formData.dueDate}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                    />
                </div>

                <!-- Items -->
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <label for="a11y-app-documents-invoices-page-svelte-1001" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t("documents.items")}
                        </label>
                        <button
                            type="button"
                            onclick={addItem}
                            class="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                        >
                            <Plus class="w-4 h-4" />
                            {t("documents.addItem")}
                        </button>
                    </div>
                    <div class="space-y-2">
                        <div class="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 px-2">
                            <div class="col-span-5">{t("documents.itemDescription")}</div>
                            <div class="col-span-2 text-center">{t("common.quantity")}</div>
                            <div class="col-span-2 text-right">{t("common.unitPrice")}</div>
                            <div class="col-span-2 text-right">{t("common.total")}</div>
                            <div class="col-span-1"></div>
                        </div>
                        {#each formData.items as item, index}
                            <div class="grid grid-cols-12 gap-2 items-center">
                                <input id="a11y-app-documents-invoices-page-svelte-1001"
                                    type="text"
                                    bind:value={item.description}
                                    placeholder={t("documents.itemDescription")}
                                    class="col-span-5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                                <input
                                    type="number"
                                    bind:value={item.quantity}
                                    min="1"
                                    oninput={calculateTotals}
                                    class="col-span-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center"
                                />
                                <div class="col-span-2">
                                    <MoneyInput
                                        bind:value={item.unitPrice}
                                        min={0}
                                        onchange={calculateTotals}
                                        placeholder="0"
                                        class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-right"
                                    />
                                </div>
                                <span class="col-span-2 text-sm font-medium text-gray-900 dark:text-white text-right">
                                    {formatCurrency(item.total)}
                                </span>
                                <button
                                    type="button"
                                    onclick={() => removeItem(index)}
                                    class="col-span-1 p-1.5 text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded flex justify-center"
                                    disabled={formData.items.length <= 1}
                                >
                                    <X class="w-4 h-4" />
                                </button>
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- Totals -->
                <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2">
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500 dark:text-gray-400">{t("documents.subtotal")}</span>
                        <span class="text-gray-900 dark:text-white font-medium">{formatCurrency(formData.subtotal)}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500 dark:text-gray-400">{t("documents.tax")} ({invoiceSettings.defaultTaxRate || 10}%)</span>
                        <span class="text-gray-900 dark:text-white">{formatCurrency(formData.tax)}</span>
                    </div>
                    <div class="flex justify-between text-lg font-bold border-t border-gray-200 dark:border-gray-600 pt-2">
                        <span class="text-gray-900 dark:text-white">{t("documents.total")}</span>
                        <span class="text-primary-600 dark:text-primary-400">{formatCurrency(formData.total)}</span>
                    </div>
                </div>

                <!-- Notes -->
                <div>
                    <label for="a11y-app-documents-invoices-page-svelte-6" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t("documents.notes")}
                    </label>
                    <textarea id="a11y-app-documents-invoices-page-svelte-6"
                        bind:value={formData.notes}
                        rows="2"
                        placeholder={t("documents.notesPlaceholder")}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 resize-none"
                    ></textarea>
                </div>
            </form>

            <div class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onclick={closeModal}
                    class="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                >
                    {t("common.cancel")}
                </button>
                <button
                    type="button"
                    onclick={handleSubmit}
                    disabled={isSaving}
                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 font-medium disabled:opacity-50"
                >
                    {#if isSaving}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {/if}
                    {editingInvoice ? t("common.save") : t("common.create")}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- View Invoice Modal -->
{#if showViewModal && viewingInvoice}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            role="button"
            tabindex="0"
            onclick={() => showViewModal = false}
            onkeydown={(e) => e.key === 'Escape' && (showViewModal = false)}
        ></div>
        
        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <div>
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                        {viewingInvoice.invoiceNo}
                    </h2>
                    <span class="px-2 py-1 rounded-full text-xs font-medium {getStatusClass(viewingInvoice.status)}">
                        {getStatusLabel(viewingInvoice.status)}
                    </span>
                </div>
                <button
                    onclick={() => showViewModal = false}
                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>
            
            <div class="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                <!-- Customer & Date Info -->
                <div class="grid grid-cols-2 gap-6">
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                        <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">{t("documents.customer")}</h3>
                        <p class="font-semibold text-gray-900 dark:text-white">{viewingInvoice.customer?.name || "-"}</p>
                        {#if viewingInvoice.customer?.email}
                            <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                                <Mail class="w-3 h-3" /> {viewingInvoice.customer.email}
                            </p>
                        {/if}
                        {#if viewingInvoice.customer?.phone}
                            <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                <Phone class="w-3 h-3" /> {viewingInvoice.customer.phone}
                            </p>
                        {/if}
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                        <div class="space-y-2">
                            <div>
                                <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t("common.date")}</p>
                                <p class="text-gray-900 dark:text-white">{formatDateTime(viewingInvoice.createdAt)}</p>
                            </div>
                            {#if viewingInvoice.dueDate}
                                <div>
                                    <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t("documents.dueDate")}</p>
                                    <p class="text-gray-900 dark:text-white">{formatDate(viewingInvoice.dueDate)}</p>
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>

                <!-- Items -->
                {#if viewingInvoice.items && viewingInvoice.items.length > 0}
                    <div class="border dark:border-gray-700 rounded-xl overflow-hidden">
                        <div class="bg-gray-50 dark:bg-gray-700/50 px-4 py-2 border-b dark:border-gray-700">
                            <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t("documents.items")}</p>
                        </div>
                        <table class="w-full">
                            <thead class="bg-gray-50 dark:bg-gray-700/30 text-xs text-gray-500 dark:text-gray-400">
                                <tr>
                                    <th class="px-4 py-2 text-left">{t("documents.itemDescription")}</th>
                                    <th class="px-4 py-2 text-center">{t("common.quantity")}</th>
                                    <th class="px-4 py-2 text-right">{t("common.unitPrice")}</th>
                                    <th class="px-4 py-2 text-right">{t("common.total")}</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y dark:divide-gray-700">
                                {#each viewingInvoice.items as item (item.description)}
                                    <tr>
                                        <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{item.description}</td>
                                        <td class="px-4 py-3 text-sm text-center text-gray-500 dark:text-gray-400">{item.quantity}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-500 dark:text-gray-400">{formatCurrency(item.unitPrice)}</td>
                                        <td class="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">{formatCurrency(item.total)}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}

                <!-- Totals -->
                <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-500 dark:text-gray-400">{t("documents.subtotal")}</span>
                        <span class="text-gray-900 dark:text-white">{formatCurrency(viewingInvoice.subtotal || 0)}</span>
                    </div>
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-500 dark:text-gray-400">{t("documents.tax")}</span>
                        <span class="text-gray-900 dark:text-white">{formatCurrency(viewingInvoice.tax || 0)}</span>
                    </div>
                    <div class="flex justify-between text-xl font-bold border-t border-gray-200 dark:border-gray-600 pt-2">
                        <span class="text-gray-900 dark:text-white">{t("documents.total")}</span>
                        <span class="text-primary-600 dark:text-primary-400">{formatCurrency(viewingInvoice.total || 0)}</span>
                    </div>
                </div>

                {#if viewingInvoice.notes}
                    <div class="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4">
                        <p class="text-xs font-semibold text-yellow-600 dark:text-yellow-400 uppercase mb-1">{t("documents.notes")}</p>
                        <p class="text-sm text-gray-700 dark:text-gray-300">{viewingInvoice.notes}</p>
                    </div>
                {/if}
            </div>

            <div class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => printInvoice(viewingInvoice)}
                    class="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    <Printer class="w-4 h-4" />
                    {t("documents.print")}
                </button>
                {#if viewingInvoice.status === "pending"}
                    <button
                        onclick={() => markAsPaid(viewingInvoice)}
                        class="flex items-center gap-2 px-4 py-2 rounded-xl bg-success-600 text-white hover:bg-success-700"
                    >
                        <DollarSign class="w-4 h-4" />
                        {t("documents.markAsPaid")}
                    </button>
                {/if}
            </div>
        </div>
    </div>
{/if}

<!-- Reject Invoice Modal -->
{#if showInvRejectModal}
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-danger-500 to-red-600 flex items-center justify-between">
                <h2 class="text-lg font-bold text-white">{t("documents.rejectInvoice")}</h2>
                <button onclick={() => (showInvRejectModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label for="a11y-app-documents-invoices-page-svelte-7" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("inventory.reason")}</label>
                    <textarea id="a11y-app-documents-invoices-page-svelte-7" bind:value={invRejectReason} rows="3" placeholder={t("documents.rejectReasonPlaceholder")} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                </div>
                <div class="flex justify-end gap-3">
                    <button onclick={() => (showInvRejectModal = false)} class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium">{t("common.cancel")}</button>
                    <button onclick={confirmInvReject} class="px-5 py-2.5 bg-gradient-to-r from-danger-500 to-red-600 text-white rounded-xl font-medium">{t("documents.confirmReject")}</button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Print Invoice Modal -->
{#if showPrintModal && viewingInvoice}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-900">
        <div class="absolute top-4 right-4 flex items-center gap-2 print:hidden">
            <button
                onclick={doPrint}
                class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
                <Printer class="w-4 h-4" />
                {t("documents.print")}
            </button>
            <button
                onclick={() => showPrintModal = false}
                class="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
                <X class="w-5 h-5" />
            </button>
        </div>
        
        <div id="print-area" class="bg-white shadow-xl rounded-lg w-full max-w-[210mm] mx-auto p-8">
            <!-- Invoice Header with Logo -->
            <div class="flex justify-between items-start mb-8 border-b pb-6">
                <div class="flex items-center gap-4">
                    {#if invoiceSettings.logo}
                        <img src={invoiceSettings.logo} alt="Logo" class="h-16 w-auto object-contain" />
                    {:else}
                        <div class="w-16 h-16 bg-primary-100 rounded-xl flex items-center justify-center">
                            <Building2 class="w-8 h-8 text-primary-600" />
                        </div>
                    {/if}
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">{invoiceSettings.companyName || "KPOS"}</h1>
                        {#if invoiceSettings.companyAddress}
                            <p class="text-sm text-gray-500">{invoiceSettings.companyAddress}</p>
                        {/if}
                        {#if invoiceSettings.companyPhone}
                            <p class="text-sm text-gray-500">Tel: {invoiceSettings.companyPhone}</p>
                        {/if}
                        {#if invoiceSettings.companyTaxId}
                            <p class="text-sm text-gray-500">Tax ID: {invoiceSettings.companyTaxId}</p>
                        {/if}
                    </div>
                </div>
                <div class="text-right">
                    <h2 class="text-3xl font-bold text-primary-600">INVOICE</h2>
                    <p class="text-lg font-semibold text-gray-700 mt-1">{viewingInvoice.invoiceNo}</p>
                    <p class="text-sm text-gray-500 mt-2">{t("common.date")}: {formatDate(viewingInvoice.createdAt)}</p>
                    {#if viewingInvoice.dueDate}
                        <p class="text-sm text-gray-500">{t("documents.dueDate")}: {formatDate(viewingInvoice.dueDate)}</p>
                    {/if}
                </div>
            </div>

            <!-- Bill To -->
            <div class="mb-8">
                <h3 class="text-xs font-semibold text-gray-500 uppercase mb-2">Bill To</h3>
                <div class="bg-gray-50 rounded-lg p-4">
                    <p class="font-semibold text-gray-900">{viewingInvoice.customer?.name || "-"}</p>
                    {#if viewingInvoice.customer?.address}
                        <p class="text-sm text-gray-600">{viewingInvoice.customer.address}</p>
                    {/if}
                    {#if viewingInvoice.customer?.phone}
                        <p class="text-sm text-gray-600">Tel: {viewingInvoice.customer.phone}</p>
                    {/if}
                    {#if viewingInvoice.customer?.email}
                        <p class="text-sm text-gray-600">Email: {viewingInvoice.customer.email}</p>
                    {/if}
                </div>
            </div>

            <!-- Items Table -->
            <table class="w-full mb-8">
                <thead>
                    <tr class="bg-gray-800 text-white">
                        <th class="px-4 py-3 text-left text-sm font-semibold">#</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold">{t("documents.itemDescription")}</th>
                        <th class="px-4 py-3 text-center text-sm font-semibold">{t("common.quantity")}</th>
                        <th class="px-4 py-3 text-right text-sm font-semibold">{t("common.unitPrice")}</th>
                        <th class="px-4 py-3 text-right text-sm font-semibold">{t("common.total")}</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    {#each viewingInvoice.items || [] as item, index}
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                            <td class="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                            <td class="px-4 py-3 text-sm text-center text-gray-500">{item.quantity}</td>
                            <td class="px-4 py-3 text-sm text-right text-gray-500">{formatCurrency(item.unitPrice)}</td>
                            <td class="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(item.total)}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>

            <!-- Totals -->
            <div class="flex justify-end mb-8">
                <div class="w-72">
                    <div class="flex justify-between py-2 text-sm">
                        <span class="text-gray-500">{t("documents.subtotal")}</span>
                        <span class="text-gray-900">{formatCurrency(viewingInvoice.subtotal || 0)}</span>
                    </div>
                    <div class="flex justify-between py-2 text-sm">
                        <span class="text-gray-500">{t("documents.tax")} ({invoiceSettings.defaultTaxRate || 10}%)</span>
                        <span class="text-gray-900">{formatCurrency(viewingInvoice.tax || 0)}</span>
                    </div>
                    <div class="flex justify-between py-3 border-t-2 border-gray-800 text-lg font-bold">
                        <span class="text-gray-900">{t("documents.total")}</span>
                        <span class="text-primary-600">{formatCurrency(viewingInvoice.total || 0)}</span>
                    </div>
                </div>
            </div>

            <!-- Status Badge -->
            <div class="flex justify-center mb-6">
                <span class="px-6 py-2 rounded-full text-sm font-bold uppercase {viewingInvoice.status === 'paid' ? 'bg-success-100 text-success-700' : viewingInvoice.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}">
                    {getStatusLabel(viewingInvoice.status)}
                </span>
            </div>

            <!-- Notes -->
            {#if viewingInvoice.notes}
                <div class="bg-gray-50 rounded-lg p-4 mb-6">
                    <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">{t("documents.notes")}</h4>
                    <p class="text-sm text-gray-700">{viewingInvoice.notes}</p>
                </div>
            {/if}

            <!-- Footer -->
            <div class="border-t pt-6 text-center">
                <p class="text-sm text-gray-500">{invoiceSettings.footerText || t("documents.thankYou")}</p>
            </div>
        </div>
    </div>
{/if}
