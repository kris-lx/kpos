<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$lib/stores/auth.svelte";
    import { formatCurrency, formatDate } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import MoneyInput from "$lib/components/MoneyInput.svelte";
    import {
        ShoppingCart,
        Plus,
        Search,
        X,
        Loader2,
        ChevronLeft,
        ChevronRight,
        Package,
        Truck,
        Calendar,
        FileText,
        Eye,
        Edit,
        Trash2,
        Check,
        Clock,
        AlertCircle,
        Building2,
        Download,
        Filter,
    } from "lucide-svelte";

    // State
    let searchQuery = $state("");
    let statusFilter = $state<string | null>(null);
    let isLoading = $state(true);
    let showModal = $state(false);
    let showViewModal = $state(false);
    let editingOrder = $state<any>(null);
    let viewingOrder = $state<any>(null);
    let currentPage = $state(1);
    let itemsPerPage = $state(10);
    let totalItems = $state(0);
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Data
    let purchaseOrders = $state<any[]>([]);
    let vendors = $state<any[]>([]);
    let products = $state<any[]>([]);

    // Form
    let formData = $state({
        vendorId: "",
        expectedDate: "",
        notes: "",
        items: [] as { productId: string; quantity: number; unitCost: number }[],
    });

    // Stats
    let stats = $derived({
        total: totalItems,
        pending: purchaseOrders.filter((o) => o.status === "pending").length,
        received: purchaseOrders.filter((o) => o.status === "received").length,
        totalValue: purchaseOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    });

    function getStatusConfig(status: string) {
        switch (status) {
            case "received":
                return { bg: "bg-success-100 dark:bg-success-900/50", text: "text-success-700 dark:text-success-400", label: "ຮັບແລ້ວ", icon: Check };
            case "pending":
                return { bg: "bg-amber-100 dark:bg-amber-900/50", text: "text-amber-700 dark:text-amber-400", label: "ລໍຖ້າ", icon: Clock };
            case "cancelled":
                return { bg: "bg-danger-100 dark:bg-danger-900/50", text: "text-danger-700 dark:text-danger-400", label: "ຍົກເລີກ", icon: AlertCircle };
            default:
                return { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", label: status, icon: Clock };
        }
    }

    async function loadData() {
        isLoading = true;
        try {
            const activeBranchId = auth.activeBranchId;
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
                ...(activeBranchId && { branchId: activeBranchId }),
            });
            if (searchQuery.trim()) {
                params.append("search", searchQuery.trim());
            }
            if (statusFilter) {
                params.append("status", statusFilter);
            }
            const [poRes, vendorRes, prodRes] = await Promise.all([
                api.get(`inventory/purchase-orders?${params}`).json<any>(),
                api.get(`inventory/vendors?all=true${activeBranchId ? `&branchId=${activeBranchId}` : ''}`).json<any>(),
                api.get(`products?all=true${activeBranchId ? `&branchId=${activeBranchId}` : ''}`).json<any>(),
            ]);
            purchaseOrders = poRes.data || [];
            totalItems = poRes.meta?.total || 0;
            vendors = vendorRes.data || [];
            products = prodRes.data || [];
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            isLoading = false;
        }
    }

    function handleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadData();
        }, 300);
    }

    function handleFilterChange() {
        currentPage = 1;
        loadData();
    }

    async function handleSubmit() {
        try {
            const itemsWithNames = formData.items.map(item => ({
                productId: item.productId,
                productName: getProductName(item.productId),
                quantity: Number(item.quantity),
                unitCost: Number(item.unitCost),
            }));
            const data = {
                vendorId: formData.vendorId,
                branchId: auth.user?.branchId || '',
                expectedDate: formData.expectedDate ? new Date(formData.expectedDate).toISOString() : undefined,
                notes: formData.notes || undefined,
                items: itemsWithNames,
            };
            if (editingOrder) {
                const { items, ...updateData } = data;
                await api.put(`inventory/purchase-orders/${editingOrder.id}`, { json: updateData }).json();
                toast.success(t('common.updated'));
            } else {
                await api.post("inventory/purchase-orders", { json: data }).json();
                toast.success("ສ້າງຄຳສັ່ງຊື້ສຳເລັດ");
            }
            showModal = false;
            resetForm();
            loadData();
        } catch (e) {
            console.error("Failed to save:", e);
            toast.error(t("common.error"));
        }
    }

    function addItem() {
        formData.items = [...formData.items, { productId: "", quantity: 1, unitCost: 0 }];
    }

    function removeItem(index: number) {
        formData.items = formData.items.filter((_, i) => i !== index);
    }

    let totalAmount = $derived(formData.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0));

    function getVendorName(vendorId: string) {
        return vendors.find((v) => v.id === vendorId)?.name || "-";
    }

    function getProductName(productId: string) {
        return products.find((p) => p.id === productId)?.name || "-";
    }

    function openView(order: any) {
        viewingOrder = order;
        showViewModal = true;
    }

    function resetForm() {
        editingOrder = null;
        formData = { vendorId: "", expectedDate: "", notes: "", items: [] };
    }

    let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
        }
    }

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

    async function exportToCsv() {
        try {
            const activeBranchId = auth.activeBranchId;
            const res = await api.get(`inventory/purchase-orders?all=true${activeBranchId ? `&branchId=${activeBranchId}` : ''}`).json<any>();
            const rows: any[] = res.data || [];
            let csv = '﻿';
            csv += 'ວັນທີ,ເລກ PO,ຜູ້ສະໜອງ,ຈຳນວນລາຍການ,ມູນຄ່າລວມ,ສະຖານະ\n';
            for (const order of rows) {
                const vendorName = vendors.find((v: any) => v.id === order.vendorId)?.name || order.vendor?.name || '';
                const statusLabel = order.status === 'completed' ? 'ສຳເລັດ' : order.status === 'pending' ? 'ລໍຖ້າ' : order.status === 'draft' ? 'ຮ່າງ' : order.status;
                const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString('lo-LA') : '';
                csv += `"${date}","${order.poNumber || order.orderNo || ''}","${vendorName}","${order.items?.length || 0}","${order.total || 0}","${statusLabel}"\n`;
            }
            downloadFile(csv, `purchase-orders-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
            toast.success(t('common.exportSuccess'));
        } catch {
            toast.error(t('common.exportFailed'));
        }
    }

    async function exportToPdf() {
        try {
            const activeBranchId = auth.activeBranchId;
            const res = await api.get(`inventory/purchase-orders?all=true${activeBranchId ? `&branchId=${activeBranchId}` : ''}`).json<any>();
            const rows: any[] = res.data || [];
            let totalValue = rows.reduce((s, r) => s + (r.total || r.totalAmount || 0), 0);

            const rows_html = rows.map((order, i) => {
                const vendorName = vendors.find((v: any) => v.id === order.vendorId)?.name || order.vendor?.name || '';
                const statusLabel = order.status === 'received' ? 'ຮັບແລ້ວ' : order.status === 'pending' ? 'ລໍຖ້າ' : order.status === 'cancelled' ? 'ຍົກເລີກ' : order.status;
                const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString('lo-LA') : '';
                return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
                    <td style="border:1px solid #e5e7eb;padding:8px">${date}</td>
                    <td style="border:1px solid #e5e7eb;padding:8px">${order.poNumber || order.orderNo || ''}</td>
                    <td style="border:1px solid #e5e7eb;padding:8px">${vendorName}</td>
                    <td style="border:1px solid #e5e7eb;padding:8px;text-align:center">${order.items?.length || 0}</td>
                    <td style="border:1px solid #e5e7eb;padding:8px;text-align:right">${(order.total || order.totalAmount || 0).toLocaleString()}</td>
                    <td style="border:1px solid #e5e7eb;padding:8px">${statusLabel}</td>
                </tr>`;
            }).join('');

            const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
                <style>body{font-family:'Noto Sans Lao','Phetsarath OT',sans-serif;margin:20px}
                h2{text-align:center}table{width:100%;border-collapse:collapse;font-size:12px}
                th{background:#4f46e5;color:#fff;border:1px solid #e5e7eb;padding:8px;text-align:left}
                tfoot td{font-weight:bold;background:#ede9fe;border:1px solid #e5e7eb;padding:8px}
                @media print{@page{size:A4 landscape;margin:10mm}}</style></head>
                <body><h2>ລາຍການຄຳສັ່ງຊື້</h2>
                <p>ວັນທີ: ${new Date().toLocaleDateString('lo-LA')}</p>
                <table><thead><tr>
                    <th>ວັນທີ</th><th>ເລກ PO</th><th>ຜູ້ສະໜອງ</th><th>ລາຍການ</th><th>ມູນຄ່າລວມ</th><th>ສະຖານະ</th>
                </tr></thead><tbody>${rows_html}</tbody>
                <tfoot><tr><td colspan="4">ລວມທັງໝົດ</td><td style="text-align:right">${totalValue.toLocaleString()}</td><td></td></tr></tfoot>
                </table></body></html>`;

            const win = window.open('', '_blank');
            if (win) { win.document.write(html); win.document.close(); win.print(); }
            toast.success(t('common.exportSuccess'));
        } catch {
            toast.error(t('common.exportFailed'));
        }
    }

    $effect(() => {
        auth.activeStoreId;
        loadData();
    });
</script>

<svelte:head>
    <title>ຄຳສັ່ງຊື້ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                    <ShoppingCart class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ຄຳສັ່ງຊື້</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ຈັດການຄຳສັ່ງຊື້ຈາກຜູ້ສະໜອງ</p>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <button onclick={exportToCsv} class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                <Download class="w-4 h-4" />
                CSV
            </button>
            <button onclick={exportToPdf} class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                <FileText class="w-4 h-4" />
                PDF
            </button>
            <button
                onclick={() => { resetForm(); showModal = true; }}
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:from-indigo-600 hover:to-purple-700 transition-all"
            >
                <Plus class="w-5 h-5" />
                ສ້າງຄຳສັ່ງຊື້
            </button>
        </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                    <FileText class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <span class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ທັງໝົດ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Clock class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ລໍຖ້າ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-success-100 dark:bg-success-900/50 rounded-lg">
                    <Check class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <span class="text-2xl font-bold text-success-600 dark:text-success-400">{stats.received}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ຮັບແລ້ວ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Truck class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span class="text-2xl font-bold text-purple-600 dark:text-purple-400">{formatCurrency(stats.totalValue)}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ມູນຄ່າລວມ</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    oninput={handleSearch}
                    placeholder="ຄົ້ນຫາເລກຄຳສັ່ງ, ຜູ້ສະໜອງ..."
                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
            </div>
            <div class="flex gap-2">
                {#each [{ id: null, label: "ທັງໝົດ" }, { id: "pending", label: "ລໍຖ້າ" }, { id: "received", label: "ຮັບແລ້ວ" }, { id: "cancelled", label: "ຍົກເລີກ" }] as filter (filter.id)}
                    <button
                        onclick={() => { statusFilter = filter.id; handleFilterChange(); }}
                        class={cn("px-3 py-2 rounded-lg text-sm font-medium transition-all", statusFilter === filter.id ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
                    >
                        {filter.label}
                    </button>
                {/each}
            </div>
        </div>
    </div>

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-indigo-500 animate-spin" />
        </div>
    {:else if purchaseOrders.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <ShoppingCart class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີຄຳສັ່ງຊື້</h3>
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ເລກຄຳສັ່ງ</th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຜູ້ສະໜອງ</th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ວັນທີຄາດຮັບ</th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ມູນຄ່າ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ສະຖານະ</th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase">ຈັດການ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each purchaseOrders as order (order.id)}
                            {@const statusConfig = getStatusConfig(order.status)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                                <td class="px-6 py-4">
                                    <span class="font-mono font-semibold text-gray-900 dark:text-white">{order.orderNo || order.id?.slice(-8)}</span>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-2">
                                        <Building2 class="w-4 h-4 text-gray-400" />
                                        <span class="text-gray-700 dark:text-gray-300">{getVendorName(order.vendorId)}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-2">
                                        <Calendar class="w-4 h-4 text-gray-400" />
                                        <span class="text-gray-600 dark:text-gray-400">{order.expectedDate ? formatDate(order.expectedDate) : "-"}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-semibold text-gray-900 dark:text-white">{formatCurrency(order.totalAmount || 0)}</span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span class={cn("px-2.5 py-1 rounded-full text-xs font-medium", statusConfig.bg, statusConfig.text)}>
                                        {statusConfig.label}
                                    </span>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-center gap-1">
                                        <button onclick={() => openView(order)} class="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all">
                                            <Eye class="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}

    <!-- Pagination -->
    {#if totalPages >= 1}
        <div class="flex items-center justify-between mt-6 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-600 dark:text-gray-400">ສະແດງ</span>
                <select
                    bind:value={itemsPerPage}
                    onchange={() => { currentPage = 1; loadData(); }}
                    class="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                >
                    {#each [5, 10, 20, 50, 70, 100] as size (size)}
                        <option value={size}>{size}</option>
                    {/each}
                </select>
                <span class="text-sm text-gray-600 dark:text-gray-400">ລາຍການ</span>
            </div>
            <div class="flex items-center gap-2">
                <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <ChevronLeft class="w-5 h-5" />
                </button>
                <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{currentPage} / {totalPages} (ທັງໝົດ {totalItems})</span>
                <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <ChevronRight class="w-5 h-5" />
                </button>
            </div>
        </div>
    {/if}
</div>

<!-- Create Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">ສ້າງຄຳສັ່ງຊື້ໃໝ່</h2>
                <button onclick={() => (showModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg transition-all">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="a11y-app-inventory-purchase-orders-page-svelte-1" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຜູ້ສະໜອງ *</label>
                        <select id="a11y-app-inventory-purchase-orders-page-svelte-1" bind:value={formData.vendorId} required class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                            <option value="">ເລືອກຜູ້ສະໜອງ</option>
                            {#each vendors as vendor (vendor.id)}
                                <option value={vendor.id}>{vendor.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div>
                        <label for="a11y-app-inventory-purchase-orders-page-svelte-2" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ວັນທີຄາດຮັບ</label>
                        <input id="a11y-app-inventory-purchase-orders-page-svelte-2" type="date" bind:value={formData.expectedDate} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                </div>

                <div>
                    <label for="a11y-app-inventory-purchase-orders-page-svelte-3" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ໝາຍເຫດ</label>
                    <textarea id="a11y-app-inventory-purchase-orders-page-svelte-3" bind:value={formData.notes} rows="2" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                </div>

                <!-- Items -->
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <label for="a11y-app-inventory-purchase-orders-page-svelte-4" class="text-sm font-medium text-gray-700 dark:text-gray-300">ລາຍການສິນຄ້າ</label>
                        <button type="button" onclick={addItem} class="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700">
                            <Plus class="w-4 h-4" /> ເພີ່ມ
                        </button>
                    </div>
                    <div class="space-y-2">
                        {#each formData.items as item, i}
                            <div class="flex gap-2 items-center">
                                <select id="a11y-app-inventory-purchase-orders-page-svelte-4" bind:value={item.productId} class="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm">
                                    <option value="">ເລືອກສິນຄ້າ</option>
                                    {#each products as product (product.id)}
                                        <option value={product.id}>{product.name}</option>
                                    {/each}
                                </select>
                                <input type="number" bind:value={item.quantity} min="1" placeholder="ຈຳນວນ" class="w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm" />
                                <MoneyInput bind:value={item.unitCost} min={0} placeholder="ລາຄາ" class="w-28 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm" />
                                <button type="button" onclick={() => removeItem(i)} class="p-2 text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded-lg">
                                    <Trash2 class="w-4 h-4" />
                                </button>
                            </div>
                        {/each}
                    </div>
                </div>

                <div class="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div class="text-lg font-semibold text-gray-900 dark:text-white">
                        ລວມ: {formatCurrency(totalAmount)}
                    </div>
                    <div class="flex gap-3">
                        <button type="button" onclick={() => (showModal = false)} class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
                            ຍົກເລີກ
                        </button>
                        <button type="submit" class="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium shadow-lg">
                            ບັນທຶກ
                        </button>
                    </div>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- View Modal -->
{#if showViewModal && viewingOrder}
    {@const statusConfig = getStatusConfig(viewingOrder.status)}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">ລາຍລະອຽດຄຳສັ່ງຊື້</h2>
                <button onclick={() => (showViewModal = false)} class="p-1.5 hover:bg-white/20 rounded-lg">
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>
            <div class="p-6 space-y-4">
                <div class="flex items-center justify-between">
                    <span class="font-mono text-lg font-bold text-gray-900 dark:text-white">#{viewingOrder.orderNo || viewingOrder.id?.slice(-8)}</span>
                    <span class={cn("px-3 py-1 rounded-full text-sm font-medium", statusConfig.bg, statusConfig.text)}>{statusConfig.label}</span>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                        <p class="text-xs text-gray-500 dark:text-gray-400">ຜູ້ສະໜອງ</p>
                        <p class="font-semibold text-gray-900 dark:text-white">{getVendorName(viewingOrder.vendorId)}</p>
                    </div>
                    <div class="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                        <p class="text-xs text-gray-500 dark:text-gray-400">ວັນທີຄາດຮັບ</p>
                        <p class="font-semibold text-gray-900 dark:text-white">{viewingOrder.expectedDate ? formatDate(viewingOrder.expectedDate) : "-"}</p>
                    </div>
                </div>
                <div class="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
                    <p class="text-sm text-indigo-600/70 dark:text-indigo-400/70">ມູນຄ່າລວມ</p>
                    <p class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(viewingOrder.totalAmount || 0)}</p>
                </div>
                <button onclick={() => (showViewModal = false)} class="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium">ປິດ</button>
            </div>
        </div>
    </div>
{/if}
