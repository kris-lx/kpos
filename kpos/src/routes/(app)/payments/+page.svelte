<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { formatCurrency, formatDateTime } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import {
        CreditCard,
        Banknote,
        QrCode,
        Smartphone,
        Receipt,
        Clock,
        Check,
        X,
        Search,
        Download,
        RefreshCw,
        ArrowUpRight,
        DollarSign,
        Wallet,
        Building,
        ChevronRight,
        Loader2,
        Eye,
        Filter,
        TrendingUp,
        ShoppingBag,
        Calendar,
        CheckCircle,
        XCircle,
        AlertCircle,
        Settings,
        ToggleLeft,
        ToggleRight,
        Percent,
    } from "lucide-svelte";

    // State
    let activeTab = $state<"transactions" | "methods" | "settlements">("transactions");
    let searchQuery = $state("");
    let dateFilter = $state<"today" | "week" | "month" | "all">("today");
    let statusFilter = $state<"all" | "completed" | "pending" | "failed">("all");
    let isLoading = $state(true);
    let showDetailModal = $state(false);
    let selectedTransaction = $state<any>(null);
    let showMethodModal = $state(false);
    let editingMethod = $state<any>(null);

    // Data
    let transactions = $state<any[]>([]);
    let paymentMethods = $state<any[]>([]);
    let settlements = $state<any[]>([]);

    // Icon map for payment methods
    const iconMap: Record<string, any> = {
        cash: Banknote,
        card: CreditCard,
        credit_card: CreditCard,
        debit_card: CreditCard,
        promptpay: QrCode,
        qr: QrCode,
        truewallet: Wallet,
        linepay: Smartphone,
        shopee: Smartphone,
        grab: Smartphone,
        bank: Building,
        transfer: Building,
    };

    function getMethodIcon(code: string) {
        return iconMap[code?.toLowerCase()] || Wallet;
    }

    // Stats
    let stats = $derived({
        todayTotal: transactions
            .filter((t) => t.status === "completed")
            .reduce((sum, t) => sum + (t.amount || 0), 0),
        todayCount: transactions.filter((t) => t.status === "completed").length,
        pendingCount: transactions.filter((t) => t.status === "pending").length,
        failedCount: transactions.filter((t) => t.status === "failed").length,
        cashTotal: transactions
            .filter((t) => t.method === "cash" && t.status === "completed")
            .reduce((sum, t) => sum + (t.amount || 0), 0),
        cardTotal: transactions
            .filter((t) => (t.method === "card" || t.method === "credit_card") && t.status === "completed")
            .reduce((sum, t) => sum + (t.amount || 0), 0),
        ewalletTotal: transactions
            .filter((t) => ["promptpay", "truewallet", "linepay", "qr"].includes(t.method) && t.status === "completed")
            .reduce((sum, t) => sum + (t.amount || 0), 0),
    });

    function getStatusConfig(status: string) {
        switch (status) {
            case "completed":
                return {
                    bg: "bg-green-100 dark:bg-green-900/50",
                    text: "text-green-700 dark:text-green-400",
                    icon: CheckCircle,
                    label: t("payments.completed"),
                };
            case "pending":
                return {
                    bg: "bg-amber-100 dark:bg-amber-900/50",
                    text: "text-amber-700 dark:text-amber-400",
                    icon: Clock,
                    label: t("payments.pending"),
                };
            case "failed":
                return {
                    bg: "bg-red-100 dark:bg-red-900/50",
                    text: "text-red-700 dark:text-red-400",
                    icon: XCircle,
                    label: t("payments.failed"),
                };
            default:
                return {
                    bg: "bg-gray-100 dark:bg-gray-700",
                    text: "text-gray-600 dark:text-gray-400",
                    icon: AlertCircle,
                    label: status,
                };
        }
    }

    async function loadTransactions() {
        isLoading = true;
        try {
            const params = new URLSearchParams();
            params.append("limit", "50");
            if (statusFilter !== "all") {
                params.append("status", statusFilter.toUpperCase());
            }

            const response = await api.get(`payments/transactions?${params}`).json<any>();
            if (response.success && response.data) {
                transactions = response.data.map((t: any) => ({
                    id: t.id,
                    transactionNo: t.transactionNo || t.id.slice(-8).toUpperCase(),
                    amount: t.total || t.amount || 0,
                    method: t.payments?.[0]?.paymentMethod?.code || t.paymentMethod || "cash",
                    methodName: t.payments?.[0]?.paymentMethod?.name || t.paymentMethodName || "ເງິນສົດ",
                    status: (t.status || "completed").toLowerCase(),
                    createdAt: t.createdAt,
                    customer: t.customer?.name || t("pos.walkIn"),
                    staff: t.user?.name || "-",
                    storeName: t.store?.name || null,
                    items: t.items || [],
                    discount: t.discount || 0,
                    tax: t.tax || 0,
                }));
            }
        } catch (error) {
            console.error("Failed to load transactions:", error);
            transactions = [];
        } finally {
            isLoading = false;
        }
    }

    async function loadPaymentMethods() {
        try {
            const response = await api.get("payments/methods").json<any>();
            if (response.success && response.data) {
                paymentMethods = response.data.map((m: any) => ({
                    id: m.id,
                    code: m.code,
                    name: m.name,
                    icon: getMethodIcon(m.code),
                    isActive: m.isActive,
                    fee: m.fee || 0,
                    description: m.description || "",
                }));
            }
        } catch (error) {
            console.error("Failed to load payment methods:", error);
            // Default methods
            paymentMethods = [
                { id: "1", code: "cash", name: "ເງິນສົດ", icon: Banknote, isActive: true, fee: 0 },
                { id: "2", code: "card", name: "ບັດເຄຣດິດ/ເດບິດ", icon: CreditCard, isActive: true, fee: 2.5 },
                { id: "3", code: "promptpay", name: "QR Code", icon: QrCode, isActive: true, fee: 0.25 },
                { id: "4", code: "bank", name: "ໂອນເງິນ", icon: Building, isActive: true, fee: 0 },
            ];
        }
    }

    async function togglePaymentMethod(method: any) {
        try {
            await api.put(`payments/methods/${method.id}`, {
                json: { isActive: !method.isActive }
            }).json();
            method.isActive = !method.isActive;
            toast.success(t("common.success"));
        } catch (e) {
            console.error("Failed to update:", e);
            toast.error(t("common.error"));
        }
    }

    function openTransactionDetail(transaction: any) {
        selectedTransaction = transaction;
        showDetailModal = true;
    }

    function formatDate(date: string): string {
        return formatDateTime(date);
    }

    function formatShortDate(date: string): string {
        if (!date) return "-";
        return new Intl.DateTimeFormat("lo-LA", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(date));
    }

    // Export functions
    let showExportMenu = $state(false);

    function downloadFile(content: string, filename: string, type: string) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function exportToCSV() {
        let csv = '\ufeff';
        csv += 'ວັນທີ,ລະຫັດ,ລູກຄ້າ,ວິທີຊຳລະ,ຍອດເງິນ,ສະຖານະ\n';
        for (const tx of filteredTransactions) {
            csv += `"${formatDate(tx.createdAt)}","${tx.transactionNo}","${tx.customer}","${tx.methodName}","${tx.amount}","${tx.status}"\n`;
        }
        downloadFile(csv, `payments-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
        toast.success('ສົ່ງອອກ CSV ສຳເລັດ');
    }

    function exportToPDF() {
        const rows = filteredTransactions.map(tx =>
            `<tr><td>${formatDate(tx.createdAt)}</td><td>${tx.transactionNo}</td><td>${tx.customer}</td><td>${tx.methodName}</td><td style="text-align:right">${formatCurrency(tx.amount)}</td><td>${tx.status}</td></tr>`
        ).join('');
        const total = filteredTransactions.reduce((s, tx) => s + (tx.amount || 0), 0);
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ລາຍງານການຊຳລະ</title>
<style>body{font-family:'Noto Sans Lao',sans-serif;padding:20px}h1{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:12px}th{background:#f5f5f5}tfoot td{font-weight:bold;background:#f9f9f9}</style></head>
<body><h1>ລາຍງານການຊຳລະ</h1><p style="text-align:center">${new Date().toLocaleDateString('lo-LA')}</p>
<table><thead><tr><th>ວັນທີ</th><th>ລະຫັດ</th><th>ລູກຄ້າ</th><th>ວິທີຊຳລະ</th><th>ຍອດເງິນ</th><th>ສະຖານະ</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="4">ລວມ</td><td style="text-align:right">${formatCurrency(total)}</td><td>${filteredTransactions.length} ລາຍການ</td></tr></tfoot></table></body></html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (w) w.onload = () => w.print();
        toast.success('ສົ່ງອອກ PDF ສຳເລັດ');
    }

    function exportToWord() {
        const rows = filteredTransactions.map(tx =>
            `<tr><td>${formatDate(tx.createdAt)}</td><td>${tx.transactionNo}</td><td>${tx.customer}</td><td>${tx.methodName}</td><td>${formatCurrency(tx.amount)}</td><td>${tx.status}</td></tr>`
        ).join('');
        const total = filteredTransactions.reduce((s, tx) => s + (tx.amount || 0), 0);
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:8px}th{background:#f0f0f0}tfoot td{font-weight:bold}</style></head>
<body><h1 style="text-align:center">ລາຍງານການຊຳລະ</h1><p style="text-align:center">${new Date().toLocaleDateString('lo-LA')}</p>
<table><thead><tr><th>ວັນທີ</th><th>ລະຫັດ</th><th>ລູກຄ້າ</th><th>ວິທີຊຳລະ</th><th>ຍອດເງິນ</th><th>ສະຖານະ</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="4">ລວມ</td><td>${formatCurrency(total)}</td><td>${filteredTransactions.length} ລາຍການ</td></tr></tfoot></table></body></html>`;
        downloadFile(html, `payments-${new Date().toISOString().split('T')[0]}.doc`, 'application/msword');
        toast.success('ສົ່ງອອກ Word ສຳເລັດ');
    }

    // Filtered transactions
    let filteredTransactions = $derived.by(() => {
        return transactions.filter((t) => {
            const matchSearch =
                t.transactionNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.customer?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchStatus = statusFilter === "all" || t.status === statusFilter;
            return matchSearch && matchStatus;
        });
    });

    // Reload transactions when active store changes
    $effect(() => {
        const _storeId = auth.activeStoreId;
        loadTransactions();
    });

    onMount(() => {
        loadPaymentMethods();
    });
</script>

<svelte:head>
    <title>{t("payments.title")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-lg">
                    <CreditCard class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        {t("payments.title")}
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {t("payments.subtitle")}
                    </p>
                </div>
            </div>
        </div>
        
        <div class="flex items-center gap-3">
            <button
                onclick={() => { loadTransactions(); loadPaymentMethods(); }}
                class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            >
                <RefreshCw class="w-4 h-4" />
                {t("common.refresh")}
            </button>
            <div class="relative">
                <button
                    onclick={() => showExportMenu = !showExportMenu}
                    class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:from-emerald-600 hover:to-green-700 transition-all"
                >
                    <Download class="w-4 h-4" />
                    {t("payments.exportReport")}
                </button>
                {#if showExportMenu}
                    <div class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                        <button onclick={() => { exportToCSV(); showExportMenu = false; }} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">
                            📊 Excel (CSV)
                        </button>
                        <button onclick={() => { exportToPDF(); showExportMenu = false; }} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">
                            📄 PDF
                        </button>
                        <button onclick={() => { exportToWord(); showExportMenu = false; }} class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">
                            📝 Word
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <DollarSign class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
            </div>
            <p class="text-xl font-bold text-gray-900 dark:text-white mt-3">{formatCurrency(stats.todayTotal)}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("payments.todayTotal")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <ShoppingBag class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
            </div>
            <p class="text-xl font-bold text-gray-900 dark:text-white mt-3">{stats.todayCount}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("payments.transactions")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Clock class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
            </div>
            <p class="text-xl font-bold text-gray-900 dark:text-white mt-3">{stats.pendingCount}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("payments.pending")}</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                    <Banknote class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
            </div>
            <p class="text-xl font-bold text-gray-900 dark:text-white mt-3">{formatCurrency(stats.cashTotal)}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">ເງິນສົດ</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <CreditCard class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
            </div>
            <p class="text-xl font-bold text-gray-900 dark:text-white mt-3">{formatCurrency(stats.cardTotal)}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">ບັດ</p>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-cyan-100 dark:bg-cyan-900/50 rounded-lg">
                    <QrCode class="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
            </div>
            <p class="text-xl font-bold text-gray-900 dark:text-white mt-3">{formatCurrency(stats.ewalletTotal)}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">QR / E-Wallet</p>
        </div>
    </div>

    <!-- Tabs & Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <!-- Tabs -->
            <div class="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                {#each [
                    { id: "transactions", icon: Receipt, label: t("payments.transactions") },
                    { id: "methods", icon: Settings, label: t("payments.methods") },
                    { id: "settlements", icon: Building, label: t("payments.settlements") },
                ] as tab}
                    <button
                        onclick={() => (activeTab = tab.id as any)}
                        class={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            activeTab === tab.id
                                ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        )}
                    >
                        <tab.icon class="w-4 h-4" />
                        {tab.label}
                    </button>
                {/each}
            </div>
            
            <div class="flex-1"></div>
            
            {#if activeTab === "transactions"}
                <!-- Search -->
                <div class="relative">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder={t("common.search")}
                        class="pl-10 pr-4 py-2.5 w-full lg:w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                </div>
                
                <!-- Status Filter -->
                <div class="flex gap-2">
                    {#each ["all", "completed", "pending", "failed"] as status (status)}
                        {@const config = getStatusConfig(status)}
                        <button
                            onclick={() => (statusFilter = status as any)}
                            class={cn(
                                "px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                statusFilter === status
                                    ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400"
                                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                            )}
                        >
                            {status === "all" ? t("common.all") : config.label}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    <!-- Content -->
    {#if activeTab === "transactions"}
        {#if isLoading}
            <div class="flex items-center justify-center py-20">
                <div class="flex flex-col items-center gap-4">
                    <Loader2 class="w-10 h-10 text-emerald-500 animate-spin" />
                    <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
                </div>
            </div>
        {:else if filteredTransactions.length === 0}
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
                <Receipt class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">{t("payments.noTransactions")}</h3>
                <p class="text-gray-500 dark:text-gray-400 mt-2">ບໍ່ມີທຸລະກຳ</p>
            </div>
        {:else}
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {t("payments.transactionId")}
                                </th>
                                <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {t("payments.customer")}
                                </th>
                                <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {t("payments.method")}
                                </th>
                                <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {t("payments.amount")}
                                </th>
                                <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {t("payments.status")}
                                </th>
                                <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {t("common.date")}
                                </th>
                                <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {t("common.actions")}
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                            {#each filteredTransactions as transaction (transaction.id)}
                                {@const statusConfig = getStatusConfig(transaction.status)}
                                {@const MethodIcon = getMethodIcon(transaction.method)}
                                
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                                    <td class="px-6 py-4">
                                        <span class="font-mono text-sm font-medium text-gray-900 dark:text-white">
                                            #{transaction.transactionNo}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4">
                                        <div class="flex flex-col gap-0.5">
                                            <span class="text-sm text-gray-700 dark:text-gray-300">{transaction.customer}</span>
                                            {#if transaction.storeName}
                                                <span class="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary w-fit">{transaction.storeName}</span>
                                            {/if}
                                        </div>
                                    </td>
                                    <td class="px-6 py-4">
                                        <div class="flex items-center gap-2">
                                            <div class="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                                <MethodIcon class="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                            </div>
                                            <span class="text-sm text-gray-700 dark:text-gray-300">{transaction.methodName}</span>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 text-right">
                                        <span class="font-semibold text-gray-900 dark:text-white">{formatCurrency(transaction.amount)}</span>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        <span class={cn(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                                            statusConfig.bg, statusConfig.text
                                        )}>
                                            <statusConfig.icon class="w-3.5 h-3.5" />
                                            {statusConfig.label}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4">
                                        <span class="text-sm text-gray-500 dark:text-gray-400">{formatShortDate(transaction.createdAt)}</span>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        <button
                                            onclick={() => openTransactionDetail(transaction)}
                                            class="p-2 text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-all"
                                        >
                                            <Eye class="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>
        {/if}
    {:else if activeTab === "methods"}
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each paymentMethods as method (method.id)}
                {@const Icon = method.icon || Wallet}
                
                <div class={cn(
                    "bg-white dark:bg-gray-800 rounded-2xl border shadow-sm overflow-hidden transition-all",
                    method.isActive
                        ? "border-emerald-200 dark:border-emerald-800"
                        : "border-gray-200 dark:border-gray-700 opacity-60"
                )}>
                    <div class="p-5">
                        <div class="flex items-start justify-between">
                            <div class="flex items-center gap-4">
                                <div class={cn(
                                    "p-3 rounded-xl",
                                    method.isActive
                                        ? "bg-emerald-100 dark:bg-emerald-900/50"
                                        : "bg-gray-100 dark:bg-gray-700"
                                )}>
                                    <Icon class={cn(
                                        "w-6 h-6",
                                        method.isActive
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : "text-gray-500"
                                    )} />
                                </div>
                                <div>
                                    <h3 class="font-semibold text-gray-900 dark:text-white">{method.name}</h3>
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{method.code}</p>
                                </div>
                            </div>
                            <button
                                onclick={() => togglePaymentMethod(method)}
                                class="p-1"
                            >
                                {#if method.isActive}
                                    <ToggleRight class="w-8 h-8 text-emerald-500" />
                                {:else}
                                    <ToggleLeft class="w-8 h-8 text-gray-400" />
                                {/if}
                            </button>
                        </div>
                        
                        {#if method.fee > 0}
                            <div class="mt-4 flex items-center gap-2 text-sm">
                                <Percent class="w-4 h-4 text-gray-400" />
                                <span class="text-gray-600 dark:text-gray-400">ຄ່າທຳນຽມ:</span>
                                <span class="font-medium text-gray-900 dark:text-white">{method.fee}%</span>
                            </div>
                        {/if}
                    </div>
                    
                    <div class={cn(
                        "px-5 py-3 border-t flex items-center justify-between text-xs",
                        method.isActive
                            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800"
                            : "bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700"
                    )}>
                        <span class={cn(
                            "font-medium",
                            method.isActive
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-gray-500"
                        )}>
                            {method.isActive ? t("common.active") : t("common.inactive")}
                        </span>
                    </div>
                </div>
            {/each}
        </div>
    {:else if activeTab === "settlements"}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
            <Building class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">{t("payments.noSettlements")}</h3>
            <p class="text-gray-500 dark:text-gray-400 mt-2">ບໍ່ມີຂໍ້ມູນການສົ່ງເງິນ</p>
        </div>
    {/if}
</div>

<!-- Transaction Detail Modal -->
{#if showDetailModal && selectedTransaction}
    {@const statusConfig = getStatusConfig(selectedTransaction.status)}
    {@const MethodIcon = getMethodIcon(selectedTransaction.method)}
    
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Header -->
            <div class="px-6 py-4 bg-gradient-to-r from-emerald-500 to-green-600 flex items-center justify-between">
                <div>
                    <h2 class="text-xl font-bold text-white">{t("payments.transactionDetails")}</h2>
                    <p class="text-sm text-white/80 mt-0.5">#{selectedTransaction.transactionNo}</p>
                </div>
                <button
                    onclick={() => (showDetailModal = false)}
                    class="p-1.5 hover:bg-white/20 rounded-lg transition-all"
                >
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <!-- Content -->
            <div class="p-6 space-y-6">
                <!-- Status -->
                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                    <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{t("payments.status")}</span>
                    <span class={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium",
                        statusConfig.bg, statusConfig.text
                    )}>
                        <statusConfig.icon class="w-4 h-4" />
                        {statusConfig.label}
                    </span>
                </div>

                <!-- Details Grid -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("payments.customer")}</p>
                        <p class="font-medium text-gray-900 dark:text-white">{selectedTransaction.customer}</p>
                    </div>
                    <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("common.staff")}</p>
                        <p class="font-medium text-gray-900 dark:text-white">{selectedTransaction.staff}</p>
                    </div>
                    <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("payments.method")}</p>
                        <div class="flex items-center gap-2">
                            <MethodIcon class="w-4 h-4 text-gray-500" />
                            <span class="font-medium text-gray-900 dark:text-white">{selectedTransaction.methodName}</span>
                        </div>
                    </div>
                    <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("common.date")}</p>
                        <p class="font-medium text-gray-900 dark:text-white">{formatDate(selectedTransaction.createdAt)}</p>
                    </div>
                </div>

                <!-- Amount -->
                <div class="p-6 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl text-center">
                    <p class="text-sm text-emerald-600 dark:text-emerald-400 mb-1">{t("payments.totalAmount")}</p>
                    <p class="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(selectedTransaction.amount)}</p>
                </div>

                <!-- Actions -->
                <div class="flex gap-3 pt-4">
                    <button
                        onclick={() => (showDetailModal = false)}
                        class="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                        {t("common.close")}
                    </button>
                    <button
                        class="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl font-medium hover:from-emerald-600 hover:to-green-700 transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                        <Receipt class="w-4 h-4" />
                        {t("payments.printReceipt")}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
