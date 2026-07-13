<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatCurrency, formatDate, formatDateTime, escapeHtml } from "$lib/utils";
    import { onMount } from "svelte";
    import { auth } from "$stores";
    import {
        FileText,
        Eye,
        Check,
        Printer,
        X,
        ChevronLeft,
        ChevronRight,
        Search,
        Calendar,
        Filter,
        AlertCircle,
        CheckCircle,
        XCircle,
        Plus,
        Edit,
        Trash2,
        Loader2,
        RefreshCw,
        Building2,
        Download,
        FileType,
        ThumbsUp,
        ThumbsDown,
    } from "lucide-svelte";

    // State
    let taxInvoices = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let searchQuery = $state("");
    let dateFilter = $state({ from: "", to: "" });
    let statusFilter = $state("all");
    let showModal = $state(false);
    let modalMode = $state<"view" | "create" | "edit" | "delete">("view");
    let selectedInvoice = $state<any>(null);

    // Pagination state
    let currentPage = $state(1);
    let pageSize = $state(10);
    let totalItems = $state(0);
    let totalPages = $derived(Math.ceil(totalItems / pageSize));

    // Tax rate from settings (loaded dynamically)
    let defaultTaxRate = $state(10);

    // Toast state
    let toasts = $state<Array<{ id: number; message: string; type: "success" | "error" | "info" }>>([]);
    let toastId = 0;

    // Form state for create/edit
    let formData = $state({
        customerName: "",
        taxId: "",
        orderId: "",
        subtotal: 0,
        taxRate: 10,
    });

    const statusOptions = [
        { value: "all", label: "ທັງໝົດ" },
        { value: "pending", label: "ລໍຖ້າ" },
        { value: "issued", label: "ອອກແລ້ວ" },
        { value: "cancelled", label: "ຍົກເລີກ" },
    ];

    const pageSizeOptions = [5, 10, 20, 50, 70, 100];

    // Toast functions
    function showToast(message: string, type: "success" | "error" | "info" = "info") {
        const id = ++toastId;
        toasts = [...toasts, { id, message, type }];
        setTimeout(() => {
            toasts = toasts.filter((t) => t.id !== id);
        }, 3000);
    }

    function removeToast(id: number) {
        toasts = toasts.filter((t) => t.id !== id);
    }

    $effect(() => {
        auth.activeStoreId; // reload on store switch
        loadTaxInvoices();
    });

    onMount(() => {
        loadDefaultTaxRate();
    });

    async function loadDefaultTaxRate() {
        try {
            const res = await api.get('settings/taxes').json<any>();
            const taxes = res.data || [];
            const defaultTax = taxes.find((t: any) => t.isDefault && t.isActive);
            if (defaultTax?.rate) {
                defaultTaxRate = defaultTax.rate;
                formData.taxRate = defaultTax.rate;
            }
        } catch { /* keep default */ }
    }

    async function loadTaxInvoices() {
        loading = true;
        try {
            const params = new URLSearchParams();
            params.append("page", currentPage.toString());
            params.append("limit", pageSize.toString());
            if (dateFilter.from) params.append("from", dateFilter.from);
            if (dateFilter.to) params.append("to", dateFilter.to);
            if (statusFilter !== "all") params.append("status", statusFilter);
            if (searchQuery) params.append("search", searchQuery);
            const taxInvBranchId = auth.activeBranchId;
            if (taxInvBranchId && !auth.isSuperAdmin) params.append("branchId", taxInvBranchId);

            const response = await api
                .get(`documents/tax-invoices?${params}`)
                .json<any>();
            if (response.success) {
                taxInvoices = response.data || [];
                totalItems = response.pagination?.total || response.data?.length || 0;
                error = null;
            } else {
                taxInvoices = [];
                totalItems = 0;
                error = t('common.loadError');
                showToast("ບໍ່ສາມາດໂຫລດຂໍ້ມູນໄດ້", "error");
            }
        } catch (err) {
            console.error("Failed to load tax invoices:", err);
            taxInvoices = [];
            totalItems = 0;
            error = t('common.loadError');
            showToast("ບໍ່ສາມາດໂຫລດຂໍ້ມູນໄດ້", "error");
        } finally {
            loading = false;
        }
    }

    // Pagination functions
    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadTaxInvoices();
        }
    }

    function changePageSize(size: number) {
        pageSize = size;
        currentPage = 1;
        loadTaxInvoices();
    }

    // CRUD functions
    function openCreateModal() {
        formData = {
            customerName: "",
            taxId: "",
            orderId: "",
            subtotal: 0,
            taxRate: defaultTaxRate,
        };
        modalMode = "create";
        showModal = true;
    }

    function viewInvoice(invoice: any) {
        selectedInvoice = invoice;
        modalMode = "view";
        showModal = true;
    }

    function openEditModal(invoice: any) {
        selectedInvoice = invoice;
        formData = {
            customerName: invoice.customerName,
            taxId: invoice.taxId,
            orderId: invoice.orderId,
            subtotal: invoice.subtotal,
            taxRate: invoice.taxRate || defaultTaxRate,
        };
        modalMode = "edit";
        showModal = true;
    }

    function openDeleteModal(invoice: any) {
        selectedInvoice = invoice;
        modalMode = "delete";
        showModal = true;
    }

    async function createInvoice() {
        try {
            const taxAmount = formData.subtotal * (formData.taxRate / 100);
            const total = formData.subtotal + taxAmount;
            await api.post("documents/tax-invoices", {
                json: {
                    ...formData,
                    taxAmount,
                    total,
                },
            }).json();
            showToast("ສ້າງໃບກຳກັບພາສີສຳເລັດ", "success");
            showModal = false;
            loadTaxInvoices();
        } catch (error) {
            console.error("Failed to create invoice:", error);
            showToast("ບໍ່ສາມາດສ້າງໃບກຳກັບພາສີໄດ້", "error");
        }
    }

    async function updateInvoice() {
        if (!selectedInvoice) return;
        try {
            const taxAmount = formData.subtotal * (formData.taxRate / 100);
            const total = formData.subtotal + taxAmount;
            await api.put(`documents/tax-invoices/${selectedInvoice.id}`, {
                json: {
                    ...formData,
                    taxAmount,
                    total,
                },
            }).json();
            showToast("ແກ້ໄຂໃບກຳກັບພາສີສຳເລັດ", "success");
            showModal = false;
            loadTaxInvoices();
        } catch (error) {
            console.error("Failed to update invoice:", error);
            showToast("ບໍ່ສາມາດແກ້ໄຂໃບກຳກັບພາສີໄດ້", "error");
        }
    }

    async function deleteInvoice() {
        if (!selectedInvoice) return;
        try {
            await api.delete(`documents/tax-invoices/${selectedInvoice.id}`).json();
            showToast("ລຶບໃບກຳກັບພາສີສຳເລັດ", "success");
            showModal = false;
            loadTaxInvoices();
        } catch (error) {
            console.error("Failed to delete invoice:", error);
            showToast("ບໍ່ສາມາດລຶບໃບກຳກັບພາສີໄດ້", "error");
        }
    }

    async function issueInvoice(invoice: any) {
        try {
            await api.put(`documents/tax-invoices/${invoice.id}/issue`).json();
            showToast("ອອກໃບກຳກັບພາສີສຳເລັດ", "success");
            loadTaxInvoices();
        } catch (error) {
            console.error("Failed to issue invoice:", error);
            showToast("ບໍ່ສາມາດອອກໃບກຳກັບພາສີໄດ້", "error");
        }
    }

    async function cancelInvoice(invoice: any) {
        selectedInvoice = invoice;
        modalMode = "delete";
        showModal = true;
    }

    async function confirmCancelInvoice() {
        if (!selectedInvoice) return;
        try {
            await api.put(`documents/tax-invoices/${selectedInvoice.id}/cancel`).json();
            showToast("ຍົກເລີກໃບກຳກັບພາສີສຳເລັດ", "success");
            showModal = false;
            loadTaxInvoices();
        } catch (error) {
            console.error("Failed to cancel invoice:", error);
            showToast("ບໍ່ສາມາດຍົກເລີກໃບກຳກັບພາສີໄດ້", "error");
        }
    }

    // Maker/checker
    let canApprove = $derived(auth.isSuperAdmin || (auth.roleLevel ?? 7) <= 4);

    async function approveTaxInvoice(id: string) {
        try {
            await api.patch(`documents/tax-invoices/${id}/approve`).json();
            showToast("ອະນຸມັດໃບກຳກັບພາສີສຳເລັດ", "success");
            loadTaxInvoices();
        } catch (error) {
            showToast("ບໍ່ສາມາດອະນຸມັດໄດ້", "error");
        }
    }

    let taxRejectReason = $state("");
    let showTaxRejectModal = $state(false);
    let taxRejectTargetId = $state<string | null>(null);

    function openTaxRejectModal(id: string) {
        taxRejectTargetId = id;
        taxRejectReason = "";
        showTaxRejectModal = true;
    }

    async function confirmTaxReject() {
        if (!taxRejectTargetId) return;
        try {
            await api.patch(`documents/tax-invoices/${taxRejectTargetId}/reject`, { json: { reason: taxRejectReason } }).json();
            showToast("ປະຕິເສດໃບກຳກັບພາສີສຳເລັດ", "success");
            showTaxRejectModal = false;
            taxRejectTargetId = null;
            loadTaxInvoices();
        } catch (error) {
            showToast("ບໍ່ສາມາດປະຕິເສດໄດ້", "error");
        }
    }

    async function printInvoice(invoice: any) {
        try {
            // This endpoint returns print-ready JSON (invoice + store branding), not a
            // file — it must be rendered into an HTML document here, not opened as a blob.
            const response = await api
                .get(`documents/tax-invoices/${invoice.id}/print`)
                .json<any>();
            if (!response?.success) throw new Error("print data fetch failed");

            const { invoice: inv, store } = response.data;
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Invoice - ${escapeHtml(inv.invoiceNumber)}</title>
                <style>
                    body{font-family:'Noto Sans Lao','Phetsarath OT',sans-serif;margin:0;padding:0}
                    @media print { body { margin: 0; } }
                </style></head><body>
                <div style="max-width:700px;margin:0 auto;padding:30px;">
                    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;border-bottom:2px solid #ddd;padding-bottom:20px;">
                        ${store.logo ? `<img src="${escapeHtml(store.logo)}" style="height:56px;width:auto;object-fit:contain" />` : ""}
                        <div>
                            <h2 style="margin:0;font-size:18px;">${escapeHtml(store.name)}</h2>
                            ${store.address ? `<p style="margin:2px 0;color:#666;font-size:13px;">${escapeHtml(store.address)}</p>` : ""}
                            ${store.phone ? `<p style="margin:2px 0;color:#666;font-size:13px;">Tel: ${escapeHtml(store.phone)}</p>` : ""}
                            ${store.taxId ? `<p style="margin:2px 0;color:#666;font-size:13px;">Tax ID: ${escapeHtml(store.taxId)}</p>` : ""}
                        </div>
                    </div>
                    <div style="text-align:center;margin-bottom:30px;">
                        <h1 style="margin:0;font-size:24px;">ໃບກຳກັບພາສີ / Tax Invoice</h1>
                        <p style="color:#666;margin:5px 0;">ເລກທີ: ${escapeHtml(inv.invoiceNumber)}</p>
                        <p style="color:#666;margin:5px 0;">ວັນທີ: ${formatDate(inv.issuedAt || inv.createdAt)}</p>
                    </div>
                    <table style="width:100%;margin-bottom:20px;">
                        <tr><td style="padding:4px 0;"><strong>ຊື່ລູກຄ້າ:</strong></td><td>${escapeHtml(inv.customerName)}</td></tr>
                        <tr><td style="padding:4px 0;"><strong>ເລກປະຈຳຕົວຜູ້ເສຍອາກອນ:</strong></td><td>${escapeHtml(inv.taxId)}</td></tr>
                    </table>
                    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                        <thead>
                            <tr style="background:#f5f5f5;">
                                <th style="border:1px solid #ddd;padding:10px;text-align:left;">ລາຍການ</th>
                                <th style="border:1px solid #ddd;padding:10px;text-align:right;">ຈຳນວນເງິນ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td style="border:1px solid #ddd;padding:10px;">ຍອດກ່ອນອາກອນ (Subtotal)</td><td style="border:1px solid #ddd;padding:10px;text-align:right;">${formatCurrency(inv.subtotal)}</td></tr>
                            <tr><td style="border:1px solid #ddd;padding:10px;">ອາກອນ (Tax)</td><td style="border:1px solid #ddd;padding:10px;text-align:right;">${formatCurrency(inv.taxAmount)}</td></tr>
                            <tr style="font-weight:bold;background:#f9f9f9;"><td style="border:1px solid #ddd;padding:10px;">ຍອດລວມ (Total)</td><td style="border:1px solid #ddd;padding:10px;text-align:right;">${formatCurrency(inv.total)}</td></tr>
                        </tbody>
                    </table>
                </div>
            </body></html>`;

            const blob = new Blob([html], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const printWindow = window.open(url, "_blank");
            if (printWindow) {
                printWindow.onload = () => printWindow.print();
            }
            showToast("ກຳລັງພິມໃບກຳກັບພາສີ", "info");
        } catch (error) {
            console.error("Failed to print invoice:", error);
            showToast("ບໍ່ສາມາດພິມໃບກຳກັບພາສີໄດ້", "error");
        }
    }

    function downloadFile(content: string, filename: string, mimeType: string) {
        const blob = new Blob(['\ufeff' + content], { type: `${mimeType};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function buildInvoiceHtml(invoice: any): string {
        return `
        <div style="max-width:700px;margin:0 auto;padding:30px;font-family:'Noto Sans Lao','Phetsarath OT',sans-serif;">
            <div style="text-align:center;margin-bottom:30px;">
                <h1 style="margin:0;font-size:24px;">ໃບກຳກັບພາສີ / Tax Invoice</h1>
                <p style="color:#666;margin:5px 0;">ເລກທີ: ${escapeHtml(invoice.invoiceNumber)}</p>
                <p style="color:#666;margin:5px 0;">ວັນທີ: ${formatDate(invoice.issuedAt || invoice.createdAt)}</p>
            </div>
            <table style="width:100%;margin-bottom:20px;">
                <tr><td style="padding:4px 0;"><strong>ຊື່ລູກຄ້າ:</strong></td><td>${escapeHtml(invoice.customerName)}</td></tr>
                <tr><td style="padding:4px 0;"><strong>ເລກປະຈຳຕົວຜູ້ເສຍອາກອນ:</strong></td><td>${escapeHtml(invoice.taxId)}</td></tr>
                <tr><td style="padding:4px 0;"><strong>ສະຖານະ:</strong></td><td>${getStatusLabel(invoice.status)}</td></tr>
            </table>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <thead>
                    <tr style="background:#f5f5f5;">
                        <th style="border:1px solid #ddd;padding:10px;text-align:left;">ລາຍການ</th>
                        <th style="border:1px solid #ddd;padding:10px;text-align:right;">ຈຳນວນເງິນ</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td style="border:1px solid #ddd;padding:10px;">ຍອດກ່ອນອາກອນ (Subtotal)</td><td style="border:1px solid #ddd;padding:10px;text-align:right;">${formatCurrency(invoice.subtotal)}</td></tr>
                    <tr><td style="border:1px solid #ddd;padding:10px;">ອາກອນ (Tax)</td><td style="border:1px solid #ddd;padding:10px;text-align:right;">${formatCurrency(invoice.taxAmount)}</td></tr>
                    <tr style="font-weight:bold;background:#f9f9f9;"><td style="border:1px solid #ddd;padding:10px;">ຍອດລວມ (Total)</td><td style="border:1px solid #ddd;padding:10px;text-align:right;">${formatCurrency(invoice.total)}</td></tr>
                </tbody>
            </table>
        </div>`;
    }

    function exportInvoiceToPdf(invoice: any) {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Invoice - ${escapeHtml(invoice.invoiceNumber)}</title>
            <style>@media print { body { margin: 0; } }</style></head><body>${buildInvoiceHtml(invoice)}</body></html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
            printWindow.onload = () => printWindow.print();
        }
        showToast("ກຳລັງສົ່ງອອກ PDF", "info");
    }

    function exportInvoiceToWord(invoice: any) {
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
            <head><meta charset="utf-8"><title>Tax Invoice</title></head><body>${buildInvoiceHtml(invoice)}</body></html>`;
        downloadFile(html, `tax-invoice-${invoice.invoiceNumber}.doc`, 'application/msword');
        showToast("ສົ່ງອອກ Word ສຳເລັດ", "success");
    }

    function exportListToPdf() {
        const rows = filteredInvoices.map(inv => `
            <tr>
                <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(inv.invoiceNumber)}</td>
                <td style="border:1px solid #ddd;padding:8px;">${formatDate(inv.issuedAt || inv.createdAt)}</td>
                <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(inv.customerName)}</td>
                <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(inv.taxId)}</td>
                <td style="border:1px solid #ddd;padding:8px;text-align:right;">${formatCurrency(inv.subtotal)}</td>
                <td style="border:1px solid #ddd;padding:8px;text-align:right;">${formatCurrency(inv.taxAmount)}</td>
                <td style="border:1px solid #ddd;padding:8px;text-align:right;">${formatCurrency(inv.total)}</td>
                <td style="border:1px solid #ddd;padding:8px;text-align:center;">${getStatusLabel(inv.status)}</td>
            </tr>`).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ລາຍການໃບກຳກັບພາສີ</title>
            <style>body{font-family:'Noto Sans Lao','Phetsarath OT',sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#f5f5f5}.text-right{text-align:right}@media print{body{margin:0}}</style>
            </head><body>
            <h1 style="text-align:center;">ລາຍການໃບກຳກັບພາສີ</h1>
            <p style="text-align:center;color:#666;">${new Date().toLocaleDateString('lo-LA')}</p>
            <table><thead><tr>
                <th>ເລກທີ</th><th>ວັນທີ</th><th>ລູກຄ້າ</th><th>ເລກອາກອນ</th><th class="text-right">ກ່ອນອາກອນ</th><th class="text-right">ອາກອນ</th><th class="text-right">ລວມ</th><th>ສະຖານະ</th>
            </tr></thead><tbody>${rows}</tbody>
            <tfoot><tr style="font-weight:bold;background:#f9f9f9;">
                <td colspan="4" style="border:1px solid #ddd;padding:8px;">ລວມທັງໝົດ (${filteredInvoices.length} ລາຍການ)</td>
                <td style="border:1px solid #ddd;padding:8px;text-align:right;">${formatCurrency(totals.subtotal)}</td>
                <td style="border:1px solid #ddd;padding:8px;text-align:right;">${formatCurrency(totals.tax)}</td>
                <td style="border:1px solid #ddd;padding:8px;text-align:right;">${formatCurrency(totals.total)}</td>
                <td style="border:1px solid #ddd;padding:8px;"></td>
            </tr></tfoot></table></body></html>`;

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
            printWindow.onload = () => printWindow.print();
        }
        showToast("ກຳລັງສົ່ງອອກ PDF", "info");
    }

    function exportListToWord() {
        const rows = filteredInvoices.map(inv => `
            <tr>
                <td style="border:1px solid #000;padding:8px;">${escapeHtml(inv.invoiceNumber)}</td>
                <td style="border:1px solid #000;padding:8px;">${formatDate(inv.issuedAt || inv.createdAt)}</td>
                <td style="border:1px solid #000;padding:8px;">${escapeHtml(inv.customerName)}</td>
                <td style="border:1px solid #000;padding:8px;">${escapeHtml(inv.taxId)}</td>
                <td style="border:1px solid #000;padding:8px;text-align:right;">${formatCurrency(inv.subtotal)}</td>
                <td style="border:1px solid #000;padding:8px;text-align:right;">${formatCurrency(inv.taxAmount)}</td>
                <td style="border:1px solid #000;padding:8px;text-align:right;">${formatCurrency(inv.total)}</td>
                <td style="border:1px solid #000;padding:8px;text-align:center;">${getStatusLabel(inv.status)}</td>
            </tr>`).join('');

        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
            <head><meta charset="utf-8"><title>ລາຍການໃບກຳກັບພາສີ</title>
            <style>body{font-family:'Noto Sans Lao','Phetsarath OT',sans-serif}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:8px}th{background:#f0f0f0}</style>
            </head><body>
            <h1 style="text-align:center;">ລາຍການໃບກຳກັບພາສີ</h1>
            <p style="text-align:center;">${new Date().toLocaleDateString('lo-LA')}</p>
            <table><tr>
                <th>ເລກທີ</th><th>ວັນທີ</th><th>ລູກຄ້າ</th><th>ເລກອາກອນ</th><th>ກ່ອນອາກອນ</th><th>ອາກອນ</th><th>ລວມ</th><th>ສະຖານະ</th>
            </tr>${rows}
            <tr style="font-weight:bold;background:#f0f0f0;">
                <td colspan="4" style="border:1px solid #000;padding:8px;">ລວມທັງໝົດ (${filteredInvoices.length} ລາຍການ)</td>
                <td style="border:1px solid #000;padding:8px;text-align:right;">${formatCurrency(totals.subtotal)}</td>
                <td style="border:1px solid #000;padding:8px;text-align:right;">${formatCurrency(totals.tax)}</td>
                <td style="border:1px solid #000;padding:8px;text-align:right;">${formatCurrency(totals.total)}</td>
                <td style="border:1px solid #000;padding:8px;"></td>
            </tr></table></body></html>`;

        downloadFile(html, `tax-invoices-${new Date().toISOString().slice(0,10)}.doc`, 'application/msword');
        showToast("ສົ່ງອອກ Word ສຳເລັດ", "success");
    }

    function getStatusLabel(status: string): string {
        const labels: Record<string, string> = {
            pending: "ລໍຖ້າ",
            issued: "ອອກແລ້ວ",
            cancelled: "ຍົກເລີກ",
        };
        return labels[status] || status;
    }

    function getStatusColor(status: string): string {
        const colors: Record<string, string> = {
            pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
            issued: "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400",
            cancelled: "bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400",
        };
        return colors[status] || "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }

    let filteredInvoices = $derived(
        taxInvoices.filter(
            (inv) =>
                (inv.invoiceNumber
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase()) ||
                    inv.customerName
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase()) ||
                    inv.taxId.includes(searchQuery)) &&
                (statusFilter === "all" || inv.status === statusFilter),
        ),
    );

    let paginatedInvoices = $derived(filteredInvoices);

    let totals = $derived({
        count: filteredInvoices.length,
        subtotal: filteredInvoices.reduce((sum, inv) => sum + inv.subtotal, 0),
        tax: filteredInvoices.reduce((sum, inv) => sum + inv.taxAmount, 0),
        total: filteredInvoices.reduce((sum, inv) => sum + inv.total, 0),
    });

    // Debounced search
    let searchTimeout: ReturnType<typeof setTimeout>;
    function handleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadTaxInvoices();
        }, 300);
    }
</script>

<svelte:head>
    <title>ໃບກຳກັບພາສີ - KPOS</title>
</svelte:head>

<!-- Toast Notifications -->
<div class="fixed top-4 right-4 z-[100] space-y-2">
    {#each toasts as toast (toast.id)}
        <div
            class="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg transition-all duration-300 {toast.type === 'success'
                ? 'bg-success-500 text-white'
                : toast.type === 'error'
                  ? 'bg-danger-500 text-white'
                  : 'bg-blue-500 text-white'}"
        >
            {#if toast.type === "success"}
                <CheckCircle class="w-5 h-5" />
            {:else if toast.type === "error"}
                <XCircle class="w-5 h-5" />
            {:else}
                <AlertCircle class="w-5 h-5" />
            {/if}
            <span>{toast.message}</span>
            <button
                onclick={() => removeToast(toast.id)}
                class="ml-2 hover:opacity-75"
            >
                <X class="w-4 h-4" />
            </button>
        </div>
    {/each}
</div>

<div class="p-6 dark:bg-gray-900 min-h-screen">
    <div class="flex justify-between items-center mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ໃບກຳກັບພາສີ</h1>
            <p class="text-gray-500 dark:text-gray-400">ຈັດການໃບກຳກັບພາສີ</p>
        </div>
        <div class="flex items-center gap-2">
            <button
                onclick={exportListToPdf}
                class="flex items-center gap-2 px-3 py-2 bg-danger-50 dark:bg-danger-900/20 text-danger-600 dark:text-danger-400 rounded-lg hover:bg-danger-100 dark:hover:bg-danger-900/40 transition-colors text-sm font-medium"
            >
                <FileType class="w-4 h-4" />
                PDF
            </button>
            <button
                onclick={exportListToWord}
                class="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-sm font-medium"
            >
                <Download class="w-4 h-4" />
                Word
            </button>
            <button
                onclick={openCreateModal}
                class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
                <Plus class="w-5 h-5" />
                ສ້າງໃບກຳກັບພາສີ
            </button>
        </div>
    </div>

    <!-- Summary -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <p class="text-sm text-gray-500 dark:text-gray-400">ຈຳນວນໃບກຳກັບພາສີ</p>
            <p class="text-2xl font-bold text-primary-600 dark:text-primary-400">{totals.count}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <p class="text-sm text-gray-500 dark:text-gray-400">ມູນຄ່າກ່ອນພາສີ</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(totals.subtotal)}
            </p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <p class="text-sm text-gray-500 dark:text-gray-400">ພາສີມູນຄ່າເພີ່ມ ({defaultTaxRate}%)</p>
            <p class="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {formatCurrency(totals.tax)}
            </p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <p class="text-sm text-gray-500 dark:text-gray-400">ລວມທັງໝົດ</p>
            <p class="text-2xl font-bold text-success-600 dark:text-success-400">
                {formatCurrency(totals.total)}
            </p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
                <label for="tax-invoice-search" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຄົ້ນຫາ</label>
                <div class="relative">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        id="tax-invoice-search"
                        type="text"
                        bind:value={searchQuery}
                        oninput={handleSearch}
                        placeholder="ເລກທີ່, ຊື່ລູກຄ້າ, ເລກປະຈຳຕົວຜູ້ເສຍພາສີ..."
                        class="w-full pl-10 pr-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500"
                    />
                </div>
            </div>
            <div>
                <label for="tax-invoice-date-from" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຈາກວັນທີ</label>
                <div class="relative">
                    <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        id="tax-invoice-date-from"
                        type="date"
                        bind:value={dateFilter.from}
                        onchange={loadTaxInvoices}
                        class="w-full pl-10 pr-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
            </div>
            <div>
                <label for="tax-invoice-date-to" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ຫາວັນທີ</label>
                <div class="relative">
                    <Calendar class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        id="tax-invoice-date-to"
                        type="date"
                        bind:value={dateFilter.to}
                        onchange={loadTaxInvoices}
                        class="w-full pl-10 pr-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
            </div>
            <div>
                <label for="tax-invoice-status" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ສະຖານະ</label>
                <div class="relative">
                    <Filter class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                        id="tax-invoice-status"
                        bind:value={statusFilter}
                        onchange={() => { currentPage = 1; loadTaxInvoices(); }}
                        class="w-full pl-10 pr-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white appearance-none"
                    >
                        {#each statusOptions as option (option.value)}
                            <option value={option.value}>{option.label}</option>
                        {/each}
                    </select>
                </div>
            </div>
        </div>
    </div>

    <!-- Error State -->
    {#if error && !loading}
        <div class="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-xl p-6 mb-6">
            <div class="flex flex-col items-center justify-center text-center">
                <AlertCircle class="w-12 h-12 text-danger-500 mb-3" />
                <h3 class="text-lg font-semibold text-danger-700 dark:text-danger-400 mb-2">ເກີດຂໍ້ຜິດພາດ</h3>
                <p class="text-danger-600 dark:text-danger-300 mb-4">{error}</p>
                <button
                    onclick={() => loadTaxInvoices()}
                    class="flex items-center gap-2 px-4 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700 transition-colors"
                >
                    <RefreshCw class="w-4 h-4" />
                    ລອງໃໝ່
                </button>
            </div>
        </div>
    {/if}

    <!-- Table -->
    {#if loading}
        <div class="flex justify-center py-12">
            <div
                class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
            ></div>
        </div>
    {:else if paginatedInvoices.length === 0}
        <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
            <FileText class="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
            <p class="mt-4 text-gray-500 dark:text-gray-400">ບໍ່ພົບໃບກຳກັບພາສີ</p>
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                        <tr>
                            <th class="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">ເລກທີ່</th>
                            <th class="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">ລູກຄ້າ</th>
                            <th class="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-300">ເລກປະຈຳຕົວຜູ້ເສຍພາສີ</th>
                            <th class="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-300">ມູນຄ່າ</th>
                            <th class="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-300">ພາສີ</th>
                            <th class="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-300">ລວມ</th>
                            <th class="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-300">ສະຖານະ</th>
                            <th class="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-300">ວັນທີ</th>
                            <th class="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-300">ຈັດການ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y dark:divide-gray-700">
                        {#each paginatedInvoices as invoice (invoice.id)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td class="px-4 py-3">
                                    <p class="font-medium text-primary-600 dark:text-primary-400">
                                        {invoice.invoiceNumber}
                                    </p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">
                                        {invoice.orderId}
                                    </p>
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{invoice.customerName}</td>
                                <td class="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">{invoice.taxId}</td>
                                <td class="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(invoice.subtotal)}</td>
                                <td class="px-4 py-3 text-sm text-right text-orange-600 dark:text-orange-400">{formatCurrency(invoice.taxAmount)}</td>
                                <td class="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(invoice.total)}</td>
                                <td class="px-4 py-3 text-center">
                                    <span class="px-2 py-1 text-xs rounded {getStatusColor(invoice.status)}">
                                        {getStatusLabel(invoice.status)}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-sm text-center text-gray-500 dark:text-gray-400">
                                    {formatDate(invoice.createdAt)}
                                </td>
                                <td class="px-4 py-3">
                                    <div class="flex justify-center gap-1">
                                        <button
                                            onclick={() => viewInvoice(invoice)}
                                            class="p-1.5 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded transition-colors"
                                            title="ເບິ່ງ"
                                        >
                                            <Eye class="w-4 h-4" />
                                        </button>
                                        {#if (invoice.status === "pending" || invoice.status === "pending_approval") && canApprove}
                                            <button
                                                onclick={() => approveTaxInvoice(invoice.id)}
                                                class="p-1.5 text-success-600 dark:text-success-400 hover:bg-success-50 dark:hover:bg-success-900/30 rounded transition-colors"
                                                title="ອະນຸມັດ / ອອກໃບກຳກັບ"
                                            >
                                                <ThumbsUp class="w-4 h-4" />
                                            </button>
                                            <button
                                                onclick={() => openTaxRejectModal(invoice.id)}
                                                class="p-1.5 text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded transition-colors"
                                                title="ປະຕິເສດ"
                                            >
                                                <ThumbsDown class="w-4 h-4" />
                                            </button>
                                        {/if}
                                        {#if invoice.status === "pending"}
                                            <button
                                                onclick={() => openEditModal(invoice)}
                                                class="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                                title="ແກ້ໄຂ"
                                            >
                                                <Edit class="w-4 h-4" />
                                            </button>
                                        {/if}
                                        {#if invoice.status === "issued"}
                                            <button
                                                onclick={() => printInvoice(invoice)}
                                                class="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                                title="ພິມ"
                                            >
                                                <Printer class="w-4 h-4" />
                                            </button>
                                        {/if}
                                        <button
                                            onclick={() => exportInvoiceToPdf(invoice)}
                                            class="p-1.5 text-danger-500 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded transition-colors"
                                            title="ສົ່ງອອກ PDF"
                                        >
                                            <FileType class="w-4 h-4" />
                                        </button>
                                        <button
                                            onclick={() => exportInvoiceToWord(invoice)}
                                            class="p-1.5 text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                            title="ສົ່ງອອກ Word"
                                        >
                                            <Download class="w-4 h-4" />
                                        </button>
                                        {#if invoice.status !== "cancelled"}
                                            <button
                                                onclick={() => cancelInvoice(invoice)}
                                                class="p-1.5 text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded transition-colors"
                                                title="ຍົກເລີກ"
                                            >
                                                <X class="w-4 h-4" />
                                            </button>
                                        {/if}
                                        {#if invoice.status === "pending"}
                                            <button
                                                onclick={() => openDeleteModal(invoice)}
                                                class="p-1.5 text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded transition-colors"
                                                title="ລຶບ"
                                            >
                                                <Trash2 class="w-4 h-4" />
                                            </button>
                                        {/if}
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <!-- Pagination -->
            <div class="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t dark:border-gray-700">
                <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <span>ສະແດງ</span>
                    <select
                        value={pageSize}
                        onchange={(e) => changePageSize(Number((e.target as HTMLSelectElement).value))}
                        class="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        {#each pageSizeOptions as size (size)}
                            <option value={size}>{size}</option>
                        {/each}
                    </select>
                    <span>ລາຍການ | ທັງໝົດ {totalItems} ລາຍການ</span>
                </div>

                <div class="flex items-center gap-1">
                    <button
                        onclick={() => goToPage(1)}
                        disabled={currentPage === 1}
                        class="px-3 py-1.5 text-sm border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800"
                    >
                        ໜ້າທຳອິດ
                    </button>
                    <button
                        onclick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        class="p-1.5 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800"
                    >
                        <ChevronLeft class="w-5 h-5" />
                    </button>

                    <span class="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300">
                        ໜ້າ {currentPage} / {totalPages || 1}
                    </span>

                    <button
                        onclick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        class="p-1.5 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800"
                    >
                        <ChevronRight class="w-5 h-5" />
                    </button>
                    <button
                        onclick={() => goToPage(totalPages)}
                        disabled={currentPage >= totalPages}
                        class="px-3 py-1.5 text-sm border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800"
                    >
                        ໜ້າສຸດທ້າຍ
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>

{#if showModal}
    <div
        class="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4"
        onclick={(e) => e.target === e.currentTarget && (showModal = false)}
        onkeydown={(e) => e.key === "Escape" && (showModal = false)}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div class="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <!-- View Mode -->
            {#if modalMode === "view" && selectedInvoice}
                <div class="p-6 border-b dark:border-gray-700">
                    <div class="flex justify-between items-start">
                        <div>
                            <h2 class="text-xl font-bold text-gray-900 dark:text-white">ໃບກຳກັບພາສີ</h2>
                            <p class="text-primary-600 dark:text-primary-400 font-mono">
                                {selectedInvoice.invoiceNumber}
                            </p>
                        </div>
                        <button
                            onclick={() => (showModal = false)}
                            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors"
                        >
                            <X class="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div class="p-6">
                    <div class="grid grid-cols-2 gap-6 mb-6">
                        <div>
                            <h3 class="font-medium mb-2 text-gray-900 dark:text-white">ຂໍ້ມູນລູກຄ້າ</h3>
                            <p class="text-lg font-semibold text-gray-900 dark:text-white">
                                {selectedInvoice.customerName}
                            </p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                ເລກປະຈຳຕົວຜູ້ເສຍພາສີ: {selectedInvoice.taxId}
                            </p>
                        </div>
                        <div class="text-right">
                            <h3 class="font-medium mb-2 text-gray-900 dark:text-white">ວັນທີອອກ</h3>
                            <p class="text-sm text-gray-600 dark:text-gray-400">
                                ສ້າງ: {formatDateTime(selectedInvoice.createdAt)}
                            </p>
                            {#if selectedInvoice.issuedAt}
                                <p class="text-sm text-gray-600 dark:text-gray-400">
                                    ອອກ: {formatDateTime(selectedInvoice.issuedAt)}
                                </p>
                            {/if}
                        </div>
                    </div>

                    <div class="border dark:border-gray-700 rounded-lg overflow-hidden mb-6">
                        <div class="bg-gray-50 dark:bg-gray-700 px-4 py-2 border-b dark:border-gray-600">
                            <p class="font-medium text-gray-900 dark:text-white">ລາຍການສິນຄ້າ/ບໍລິການ</p>
                        </div>
                        <div class="p-4">
                            <p class="text-sm text-gray-500 dark:text-gray-400 text-center">
                                ເລກທີ່ອ້າງອິງ: {selectedInvoice.orderId}
                            </p>
                        </div>
                    </div>

                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                        <div class="flex justify-between py-2">
                            <span class="text-gray-600 dark:text-gray-400">ມູນຄ່າກ່ອນພາສີ</span>
                            <span class="font-medium text-gray-900 dark:text-white">{formatCurrency(selectedInvoice.subtotal)}</span>
                        </div>
                        <div class="flex justify-between py-2">
                            <span class="text-gray-600 dark:text-gray-400">ພາສີມູນຄ່າເພີ່ມ ({defaultTaxRate}%)</span>
                            <span class="font-medium text-orange-600 dark:text-orange-400">{formatCurrency(selectedInvoice.taxAmount)}</span>
                        </div>
                        <div class="flex justify-between py-2 border-t dark:border-gray-600 font-bold text-lg">
                            <span class="text-gray-900 dark:text-white">ລວມທັງໝົດ</span>
                            <span class="text-primary-600 dark:text-primary-400">{formatCurrency(selectedInvoice.total)}</span>
                        </div>
                    </div>

                    <div class="flex justify-center gap-4 mt-6">
                        {#if selectedInvoice.status === "issued"}
                            <button
                                onclick={() => printInvoice(selectedInvoice)}
                                class="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                            >
                                <Printer class="w-4 h-4" />
                                ພິມໃບກຳກັບ
                            </button>
                        {/if}
                        <button
                            onclick={() => (showModal = false)}
                            class="px-6 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                        >
                            ປິດ
                        </button>
                    </div>
                </div>

            <!-- Create/Edit Mode -->
            {:else if modalMode === "create" || modalMode === "edit"}
                <div class="p-6 border-b dark:border-gray-700">
                    <div class="flex justify-between items-start">
                        <div>
                            <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                                {modalMode === "create" ? "ສ້າງໃບກຳກັບພາສີໃໝ່" : "ແກ້ໄຂໃບກຳກັບພາສີ"}
                            </h2>
                            {#if modalMode === "edit" && selectedInvoice}
                                <p class="text-primary-600 dark:text-primary-400 font-mono">
                                    {selectedInvoice.invoiceNumber}
                                </p>
                            {/if}
                        </div>
                        <button
                            onclick={() => (showModal = false)}
                            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors"
                        >
                            <X class="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <form
                    onsubmit={(e) => {
                        e.preventDefault();
                        modalMode === "create" ? createInvoice() : updateInvoice();
                    }}
                    class="p-6 space-y-4"
                >
                    <div>
                        <label for="tax-invoice-customer-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            ຊື່ລູກຄ້າ <span class="text-danger-500">*</span>
                        </label>
                        <input
                            id="tax-invoice-customer-name"
                            type="text"
                            bind:value={formData.customerName}
                            required
                            class="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            placeholder="ປ້ອນຊື່ລູກຄ້າ"
                        />
                    </div>

                    <div>
                        <label for="tax-invoice-tax-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            ເລກປະຈຳຕົວຜູ້ເສຍພາສີ <span class="text-danger-500">*</span>
                        </label>
                        <input
                            id="tax-invoice-tax-id"
                            type="text"
                            bind:value={formData.taxId}
                            required
                            class="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            placeholder="ປ້ອນເລກປະຈຳຕົວຜູ້ເສຍພາສີ"
                        />
                    </div>

                    <div>
                        <label for="tax-invoice-order-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            ເລກທີ່ອ້າງອິງ (Order ID)
                        </label>
                        <input
                            id="tax-invoice-order-id"
                            type="text"
                            bind:value={formData.orderId}
                            class="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            placeholder="ປ້ອນເລກທີ່ອ້າງອິງ"
                        />
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="tax-invoice-subtotal" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ມູນຄ່າກ່ອນພາສີ <span class="text-danger-500">*</span>
                            </label>
                            <input
                                id="tax-invoice-subtotal"
                                type="number"
                                bind:value={formData.subtotal}
                                required
                                min="0"
                                class="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label for="tax-invoice-tax-rate" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                ອັດຕາພາສີ (%)
                            </label>
                            <input
                                id="tax-invoice-tax-rate"
                                type="number"
                                bind:value={formData.taxRate}
                                min="0"
                                max="100"
                                class="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                    </div>

                    <!-- Preview calculation -->
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mt-4">
                        <div class="flex justify-between py-1 text-sm">
                            <span class="text-gray-600 dark:text-gray-400">ມູນຄ່າກ່ອນພາສີ</span>
                            <span class="text-gray-900 dark:text-white">{formatCurrency(formData.subtotal)}</span>
                        </div>
                        <div class="flex justify-between py-1 text-sm">
                            <span class="text-gray-600 dark:text-gray-400">ພາສີ ({formData.taxRate}%)</span>
                            <span class="text-orange-600 dark:text-orange-400">{formatCurrency(formData.subtotal * (formData.taxRate / 100))}</span>
                        </div>
                        <div class="flex justify-between py-1 border-t dark:border-gray-600 font-bold">
                            <span class="text-gray-900 dark:text-white">ລວມທັງໝົດ</span>
                            <span class="text-primary-600 dark:text-primary-400">{formatCurrency(formData.subtotal * (1 + formData.taxRate / 100))}</span>
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 mt-6 pt-4 border-t dark:border-gray-700">
                        <button
                            type="button"
                            onclick={() => (showModal = false)}
                            class="px-6 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                        >
                            ຍົກເລີກ
                        </button>
                        <button
                            type="submit"
                            class="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                        >
                            {#if modalMode === "create"}
                                <Plus class="w-4 h-4" />
                                ສ້າງໃບກຳກັບພາສີ
                            {:else}
                                <Check class="w-4 h-4" />
                                ບັນທຶກການແກ້ໄຂ
                            {/if}
                        </button>
                    </div>
                </form>

            <!-- Delete/Cancel Confirmation Mode -->
            {:else if modalMode === "delete" && selectedInvoice}
                <div class="p-6 border-b dark:border-gray-700">
                    <div class="flex justify-between items-start">
                        <div>
                            <h2 class="text-xl font-bold text-danger-600 dark:text-danger-400">
                                {selectedInvoice.status === "pending" ? "ຢືນຢັນການລຶບ" : "ຢືນຢັນການຍົກເລີກ"}
                            </h2>
                        </div>
                        <button
                            onclick={() => (showModal = false)}
                            class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors"
                        >
                            <X class="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div class="p-6">
                    <div class="flex items-center justify-center mb-6">
                        <div class="w-16 h-16 rounded-full bg-danger-100 dark:bg-danger-900/30 flex items-center justify-center">
                            <AlertCircle class="w-8 h-8 text-danger-600 dark:text-danger-400" />
                        </div>
                    </div>

                    <p class="text-center text-gray-700 dark:text-gray-300 mb-2">
                        {selectedInvoice.status === "pending"
                            ? "ທ່ານຕ້ອງການລຶບໃບກຳກັບພາສີນີ້ບໍ?"
                            : "ທ່ານຕ້ອງການຍົກເລີກໃບກຳກັບພາສີນີ້ບໍ?"}
                    </p>
                    <p class="text-center text-primary-600 dark:text-primary-400 font-mono font-bold mb-6">
                        {selectedInvoice.invoiceNumber}
                    </p>

                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <span class="text-gray-500 dark:text-gray-400">ລູກຄ້າ:</span>
                            <span class="text-gray-900 dark:text-white">{selectedInvoice.customerName}</span>
                            <span class="text-gray-500 dark:text-gray-400">ມູນຄ່າລວມ:</span>
                            <span class="text-gray-900 dark:text-white">{formatCurrency(selectedInvoice.total)}</span>
                        </div>
                    </div>

                    <div class="flex justify-center gap-4">
                        <button
                            onclick={() => (showModal = false)}
                            class="px-6 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                        >
                            ຍົກເລີກ
                        </button>
                        <button
                            onclick={() => selectedInvoice.status === "pending" ? deleteInvoice() : confirmCancelInvoice()}
                            class="flex items-center gap-2 px-6 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700 transition-colors"
                        >
                            <Trash2 class="w-4 h-4" />
                            {selectedInvoice.status === "pending" ? "ລຶບ" : "ຍົກເລີກໃບກຳກັບ"}
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

<!-- Tax Invoice Reject Modal -->
{#if showTaxRejectModal}
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-danger-500 to-red-600 flex items-center justify-between">
                <h2 class="text-lg font-bold text-white">ປະຕິເສດໃບກຳກັບພາສີ</h2>
                <button onclick={() => (showTaxRejectModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label for="tax-invoice-reject-reason" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ເຫດຜົນ</label>
                    <textarea id="tax-invoice-reject-reason" bind:value={taxRejectReason} rows="3" placeholder="ລະບຸເຫດຜົນ..." class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                </div>
                <div class="flex justify-end gap-3">
                    <button onclick={() => (showTaxRejectModal = false)} class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium">ຍົກເລີກ</button>
                    <button onclick={confirmTaxReject} class="px-5 py-2.5 bg-gradient-to-r from-danger-500 to-red-600 text-white rounded-xl font-medium">ຢືນຢັນປະຕິເສດ</button>
                </div>
            </div>
        </div>
    </div>
{/if}
