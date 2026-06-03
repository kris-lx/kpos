<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { formatCurrency } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import MoneyInput from "$lib/components/MoneyInput.svelte";
    import StoreBranchSelector from "$lib/components/StoreBranchSelector.svelte";
    
    import {
        Package,
        Plus,
        Search,
        Edit,
        Trash2,
        Image,
        Barcode,
        Tag,
        X,
        Loader2,
        ChevronLeft,
        ChevronRight,
        ChevronDown,
        Grid3X3,
        List,
        Filter,
        Download,
        Upload,
        Layers,
        DollarSign,
        Box,
        AlertTriangle,
        Eye,
        Copy,
        MoreVertical,
        Check,
        Camera,
        Sparkles,
    } from "lucide-svelte";

    // Rule-based CRUD checks — also requires write access to active store
    const hasWriteAccess = $derived(auth.hasStoreAccess('write') || !auth.activeStoreId);
    const canCreateProduct = $derived(auth.canCreate('products') && hasWriteAccess);
    const canUpdateProduct = $derived(auth.canUpdate('products') && hasWriteAccess);
    const canDeleteProduct = $derived(auth.canDelete('products') && hasWriteAccess);
    const canEdit = $derived(canCreateProduct || canUpdateProduct);
    
    // State
    let viewMode = $state<"grid" | "list">("grid");
    let searchQuery = $state("");
    let selectedCategory = $state<string | null>(null);
    let stockFilter = $state<"all" | "instock" | "lowstock" | "outofstock">("all");
    let isLoading = $state(true);
    let showModal = $state(false);
    let showDetailModal = $state(false);
    let editingProduct = $state<any>(null);
    let selectedProduct = $state<any>(null);
    let currentPage = $state(1);
    let itemsPerPage = $state(18);

    // Data
    let products = $state<any[]>([]);
    let categories = $state<any[]>([]);
    let vendors = $state<any[]>([]);
    let skuVariants = $state<any[]>([]);
    
    // SKU/Barcode dropdown states
    let showSkuDropdown = $state(false);
    let showBarcodeDropdown = $state(false);
    let skuSearch = $state("");
    let barcodeSearch = $state("");

    // Image
    let imagePreview = $state<string | null>(null);
    let isUploading = $state(false);

    // Excel import
    let isImporting = $state(false);

    // Form
    let formData = $state({
        name: "",
        sku: "",
        barcode: "",
        categoryId: "",
        vendorId: "",
        price: "",
        cost: "",
        unit: "ຊິ້ນ",
        isActive: true,
        image: "",
        description: "",
        stock: 0,
        minStock: 10,
    });

    // Stats
    let stats = $derived({
        total: products.length,
        active: products.filter((p) => p.isActive !== false).length,
        lowStock: products.filter((p) => p.stock <= (p.minStock || 5) && p.stock > 0).length,
        outOfStock: products.filter((p) => p.stock <= 0).length,
        totalValue: products.reduce((sum, p) => sum + ((p.price || 0) * (p.stock || 0)), 0),
    });

    function getStockStatus(product: any) {
        if (product.stock <= 0) return "outofstock";
        if (product.stock <= (product.minStock || 5)) return "lowstock";
        return "instock";
    }

    function getStockConfig(status: string) {
        switch (status) {
            case "instock":
                return {
                    bg: "bg-success-100 dark:bg-success-900/50",
                    text: "text-success-700 dark:text-success-400",
                    label: "ມີສິນຄ້າ",
                };
            case "lowstock":
                return {
                    bg: "bg-amber-100 dark:bg-amber-900/50",
                    text: "text-amber-700 dark:text-amber-400",
                    label: "ໃກ້ໝົດ",
                };
            case "outofstock":
                return {
                    bg: "bg-danger-100 dark:bg-danger-900/50",
                    text: "text-danger-700 dark:text-danger-400",
                    label: "ໝົດສິນຄ້າ",
                };
            default:
                return {
                    bg: "bg-gray-100 dark:bg-gray-700",
                    text: "text-gray-600 dark:text-gray-400",
                    label: status,
                };
        }
    }

    async function loadData() {
        isLoading = true;
        try {
            const [prodRes, catRes, skuRes, vendorRes] = await Promise.all([
                api.get("products").json<any>(),
                api.get("categories").json<any>(),
                api.get("products/skus?limit=1000").json<any>(),
                api.get("inventory/vendors").json<any>(),
            ]);
            products = prodRes.data || [];
            categories = catRes.data || [];
            skuVariants = skuRes.data || [];
            vendors = vendorRes.data || [];
        } catch (e) {
            console.error("Failed to load:", e);
            products = [];
            categories = [];
            skuVariants = [];
            vendors = [];
        } finally {
            isLoading = false;
        }
    }

    // Filtered SKU/Barcode lists for dropdown
    let filteredSkuList = $derived.by(() => {
        const search = skuSearch.toLowerCase();
        // Get existing SKUs from products
        const productSkus = products
            .filter(p => p.sku && p.sku.toLowerCase().includes(search))
            .map(p => ({ value: p.sku, label: `${p.sku} - ${p.name}`, type: 'product' }));
        // Get SKUs from SKU variants
        const variantSkus = skuVariants
            .filter(v => v.sku && v.sku.toLowerCase().includes(search))
            .map(v => ({ value: v.sku, label: `${v.sku} - ${v.productName || 'Variant'}`, type: 'variant' }));
        // Combine and dedupe
        const allSkus = [...productSkus, ...variantSkus];
        const seen = new Set();
        return allSkus.filter(item => {
            if (seen.has(item.value)) return false;
            seen.add(item.value);
            return true;
        }).slice(0, 20);
    });

    let filteredBarcodeList = $derived.by(() => {
        const search = barcodeSearch.toLowerCase();
        // Get existing barcodes from products
        const productBarcodes = products
            .filter(p => p.barcode && p.barcode.toLowerCase().includes(search))
            .map(p => ({ value: p.barcode, label: `${p.barcode} - ${p.name}`, type: 'product' }));
        // Get barcodes from SKU variants
        const variantBarcodes = skuVariants
            .filter(v => v.barcode && v.barcode.toLowerCase().includes(search))
            .map(v => ({ value: v.barcode, label: `${v.barcode} - ${v.productName || 'Variant'}`, type: 'variant' }));
        // Combine and dedupe
        const allBarcodes = [...productBarcodes, ...variantBarcodes];
        const seen = new Set();
        return allBarcodes.filter(item => {
            if (seen.has(item.value)) return false;
            seen.add(item.value);
            return true;
        }).slice(0, 20);
    });

    async function handleSubmit() {
        try {
            const data: Record<string, any> = {
                name: formData.name,
                price: Number(formData.price) || 0,
                cost: Number(formData.cost) || 0,
                unit: formData.unit || "ຊິ້ນ",
                isActive: formData.isActive,
            };
            
            // Add optional fields only if they have values
            if (formData.sku && formData.sku.trim() !== '') data.sku = formData.sku.trim();
            if (formData.barcode && formData.barcode.trim() !== '') data.barcode = formData.barcode.trim();
            if (formData.categoryId && formData.categoryId !== '') data.categoryId = formData.categoryId;
            if (formData.vendorId && formData.vendorId !== '') data.vendorId = formData.vendorId;
            if (formData.description && formData.description.trim() !== '') data.description = formData.description.trim();
            if (formData.image && formData.image.trim() !== '') data.image = formData.image;
            if (formData.stock !== undefined && formData.stock > 0) data.stock = Number(formData.stock);
            if (formData.minStock !== undefined) data.minStock = Number(formData.minStock);
            
            console.log("Submitting product data:", data);
            
            if (editingProduct) {
                await api.put(`products/${editingProduct.id}`, { json: data }).json();
                toast.success("ອັບເດດສິນຄ້າສຳເລັດ");
            } else {
                await api.post("products", { json: data }).json();
                toast.success("ສ້າງສິນຄ້າສຳເລັດ");
            }
            showModal = false;
            resetForm();
            loadData();
        } catch (e: any) {
            console.error("Failed to save:", e);
            // Try to parse error message
            let errorMsg = t("common.error");
            if (e?.response) {
                try {
                    const errorData = await e.response.json();
                    console.error("Error response:", errorData);
                    if (errorData?.error?.message) {
                        errorMsg = errorData.error.message;
                    }
                    // Check for duplicate key error
                    if (errorMsg.includes('sku') || errorMsg.includes('SKU')) {
                        errorMsg = 'SKU ນີ້ມີຢູ່ແລ້ວ. ກະລຸນາໃຊ້ SKU ອື່ນ.';
                    } else if (errorMsg.includes('barcode') || errorMsg.includes('Barcode')) {
                        errorMsg = 'ບາໂຄ້ດນີ້ມີຢູ່ແລ້ວ. ກະລຸນາໃຊ້ບາໂຄ້ດອື່ນ.';
                    }
                } catch {}
            }
            toast.error(errorMsg);
        }
    }

    async function handleDelete(product: any) {
        if (!confirm(t("common.confirmDelete"))) return;
        try {
            await api.delete(`products/${product.id}`).json();
            toast.success("ລຶບສິນຄ້າສຳເລັດ");
            loadData();
        } catch (e) {
            console.error("Failed to delete:", e);
            toast.error(t("common.error"));
        }
    }

    function openEdit(product: any) {
        editingProduct = product;
        formData = {
            name: product.name || "",
            sku: product.sku || "",
            barcode: product.barcode || "",
            price: product.price || 0,
            cost: product.cost || 0,
            categoryId: product.categoryId || "",
            vendorId: product.vendorId || "",
            description: product.description || "",
            stock: product.stock || 0,
            minStock: product.minStock || 5,
            unit: product.unit || "ຊິ້ນ",
            isActive: product.isActive ?? true,
            image: product.image || "",
        };
        imagePreview = product.image || null;
        showModal = true;
    }

    function openDetail(product: any) {
        selectedProduct = product;
        showDetailModal = true;
    }

    function resetForm() {
        editingProduct = null;
        imagePreview = null;
        formData = {
            name: "",
            sku: "",
            barcode: "",
            price: 0,
            cost: 0,
            categoryId: "",
            vendorId: "",
            description: "",
            stock: 0,
            minStock: 5,
            unit: "ຊິ້ນ",
            isActive: true,
            image: "",
        };
    }

    let isGeneratingSku = $state(false);
    let isGeneratingBarcode = $state(false);

    async function generateSku() {
        isGeneratingSku = true;
        try {
            const params = formData.categoryId ? `?categoryId=${formData.categoryId}` : '';
            const res = await api.get(`products/generate/sku${params}`).json<any>();
            if (res.data?.sku) {
                formData.sku = res.data.sku;
                toast.success("ສ້າງ SKU ສຳເລັດ");
            }
        } catch (e) {
            console.error("Failed to generate SKU:", e);
            // Fallback to local generation
            const prefix = formData.categoryId ? "PRD" : "GEN";
            const number = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
            formData.sku = `${prefix}-${number}`;
        } finally {
            isGeneratingSku = false;
        }
    }

    async function generateBarcode() {
        isGeneratingBarcode = true;
        try {
            const res = await api.get("products/generate/barcode").json<any>();
            if (res.data?.barcode) {
                formData.barcode = res.data.barcode;
                toast.success("ສ້າງບາໂຄ້ດສຳເລັດ");
            }
        } catch (e) {
            console.error("Failed to generate barcode:", e);
            // Fallback to local generation (14 digits)
            const timestamp = Date.now().toString().slice(-10);
            const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            formData.barcode = "0" + timestamp + random;
        } finally {
            isGeneratingBarcode = false;
        }
    }

    async function handleImageUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        isUploading = true;
        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const res = await api.post("upload/single", {
                json: { image: base64, folder: "products" },
            }).json<any>();
            if (!res.success) throw new Error(res.error?.message || "Upload failed");
            formData.image = res.data.url;
            imagePreview = res.data.url;
            toast.success("ອັບໂຫລດຮູບພາບສຳເລັດ");
        } catch (e) {
            console.error("Image upload failed:", e);
            toast.error("ອັບໂຫລດຮູບພາບບໍ່ສຳເລັດ");
        } finally {
            isUploading = false;
        }
    }

    function copySku(sku: string) {
        navigator.clipboard.writeText(sku);
        toast.success("ຄັດລອກ SKU ແລ້ວ");
    }

    function getCategoryName(categoryId: string): string {
        const category = categories.find((c) => c.id === categoryId);
        return category?.name || "-";
    }

    // Filtered and paginated
    let filteredProducts = $derived.by(() => {
        return products.filter((product) => {
            const matchSearch =
                product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                product.barcode?.includes(searchQuery);
            
            const matchCategory = !selectedCategory || product.categoryId === selectedCategory;
            
            const stockStatus = getStockStatus(product);
            const matchStock = stockFilter === "all" || stockStatus === stockFilter;

            return matchSearch && matchCategory && matchStock;
        });
    });

    let paginatedProducts = $derived.by(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredProducts.slice(start, start + itemsPerPage);
    });

    let totalPages = $derived(Math.ceil(filteredProducts.length / itemsPerPage));

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

    async function importFromExcel(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        (e.target as HTMLInputElement).value = '';

        isImporting = true;
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post('products/import/excel', { body: formData }).json<{ success: boolean; data: { total: number; created: number; errors: { row: number; message: string }[] } }>();
            if (res.success) {
                toast.success(`ນຳເຂົ້າ ${res.data.created}/${res.data.total} ລາຍການ`);
                if (res.data.errors.length) {
                    console.warn('Import errors:', res.data.errors);
                    toast.warning(`${res.data.errors.length} ແຖວມີຂໍ້ຜິດພາດ — ກວດສອບ console`);
                }
                await loadData();
            }
        } catch (err: any) {
            toast.error('ນຳເຂົ້າບໍ່ສຳເລັດ');
        } finally {
            isImporting = false;
        }
    }

    function exportToCsv() {
        let csv = '﻿';
        csv += 'ຊື່ສິນຄ້າ,SKU,ບາໂຄດ,ໝວດໝູ່,ລາຄາຂາຍ,ລາຄາທຶນ,ສະຕ໋ອກ,ສະຖານະ\n';
        for (const p of filteredProducts) {
            const status = getStockStatus(p);
            const statusLabel = status === 'outofstock' ? 'ໝົດສິນຄ້າ' : status === 'lowstock' ? 'ໃກ້ໝົດ' : 'ມີສິນຄ້າ';
            csv += `"${p.name || ''}","${p.sku || ''}","${p.barcode || ''}","${getCategoryName(p.categoryId)}","${p.price || 0}","${p.cost || 0}","${p.stock ?? 0}","${statusLabel}"\n`;
        }
        downloadFile(csv, `products-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
        toast.success('ສົ່ງອອກ CSV ສຳເລັດ');
    }

    // Reload when active store switches
    $effect(() => {
        auth.activeStoreId; // track dependency
        loadData();
    });
</script>

<svelte:head>
    <title>{t("nav.products")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                    <Package class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                        {t("nav.products")}
                    </h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        ຈັດການສິນຄ້າ ແລະ ສະຕ໋ອກ
                    </p>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <StoreBranchSelector onchange={() => loadData()} />
            <label class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all cursor-pointer {isImporting ? 'opacity-60 pointer-events-none' : ''}">
                {#if isImporting}
                    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                {:else}
                    <Upload class="w-4 h-4" />
                {/if}
                ນຳເຂົ້າ Excel
                <input type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange={importFromExcel} disabled={isImporting} />
            </label>
            <button
                onclick={exportToCsv}
                class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            >
                <Download class="w-4 h-4" />
                ສົ່ງອອກ
            </button>
            {#if canEdit}
            <button
                onclick={() => {
                    resetForm();
                    showModal = true;
                }}
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg hover:from-blue-600 hover:to-indigo-700 transition-all"
            >
                <Plus class="w-5 h-5" />
                ເພີ່ມສິນຄ້າ
            </button>
            {/if}
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Package class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ສິນຄ້າທັງໝົດ</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-success-100 dark:bg-success-900/50 rounded-lg">
                    <Check class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <span class="text-2xl font-bold text-success-600 dark:text-success-400">{stats.active}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ເປີດຂາຍ</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <AlertTriangle class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.lowStock}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ສະຕ໋ອກຕ່ຳ</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-danger-100 dark:bg-danger-900/50 rounded-lg">
                    <Box class="w-5 h-5 text-danger-600 dark:text-danger-400" />
                </div>
                <span class="text-2xl font-bold text-danger-600 dark:text-danger-400">{stats.outOfStock}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">ໝົດສະຕ໋ອກ</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div class="flex items-center justify-between">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <DollarSign class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
            </div>
            <p class="text-lg font-bold text-purple-600 dark:text-purple-400 mt-1">{formatCurrency(stats.totalValue)}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">ມູນຄ່າສະຕ໋ອກ</p>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <!-- Search -->
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="ຄົ້ນຫາຊື່, SKU, ບາໂຄ້ດ..."
                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
            </div>

            <!-- Category Filter -->
            <select
                bind:value={selectedCategory}
                class="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
                <option value={null}>ທຸກໝວດໝູ່</option>
                {#each categories as category (category.id)}
                    <option value={category.id}>{category.name}</option>
                {/each}
            </select>

            <!-- Stock Filter -->
            <div class="flex gap-2">
                {#each [
                    { id: "all", label: "ທັງໝົດ" },
                    { id: "instock", label: "ມີສິນຄ້າ" },
                    { id: "lowstock", label: "ໃກ້ໝົດ" },
                    { id: "outofstock", label: "ໝົດ" },
                ] as filter}
                    <button
                        onclick={() => { stockFilter = filter.id as any; currentPage = 1; }}
                        class={cn(
                            "px-3 py-2 rounded-lg text-sm font-medium transition-all",
                            stockFilter === filter.id
                                ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        )}
                    >
                        {filter.label}
                    </button>
                {/each}
            </div>

            <!-- View Mode -->
            <div class="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                    onclick={() => (viewMode = "grid")}
                    class={cn(
                        "p-2 rounded-lg transition-all",
                        viewMode === "grid"
                            ? "bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm"
                            : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    )}
                >
                    <Grid3X3 class="w-4 h-4" />
                </button>
                <button
                    onclick={() => (viewMode = "list")}
                    class={cn(
                        "p-2 rounded-lg transition-all",
                        viewMode === "list"
                            ? "bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm"
                            : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    )}
                >
                    <List class="w-4 h-4" />
                </button>
            </div>
        </div>
    </div>

    <!-- Content -->
    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-10 h-10 text-blue-500 animate-spin" />
                <p class="text-gray-500 dark:text-gray-400">{t("common.loading")}...</p>
            </div>
        </div>
    {:else if paginatedProducts.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center shadow-sm">
            <Package class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີສິນຄ້າ</h3>
            <p class="text-gray-500 dark:text-gray-400 mt-2">ເພີ່ມສິນຄ້າໃໝ່ເພື່ອເລີ່ມຕົ້ນ</p>
        </div>
    {:else if viewMode === "grid"}
        <div class="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {#each paginatedProducts as product (product.id)}
                {@const stockStatus = getStockStatus(product)}
                {@const stockConfig = getStockConfig(stockStatus)}

                <div 
                    class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-all cursor-pointer group"
                    onclick={() => openDetail(product)}
                    role="button"
                    tabindex="0"
                >
                    <!-- Image -->
                    <div class="relative aspect-square bg-gray-100 dark:bg-gray-700">
                        {#if product.image}
                            <img
                                src={product.image}
                                alt={product.name}
                                class="w-full h-full object-cover"
                            />
                        {:else}
                            <div class="w-full h-full flex items-center justify-center">
                                <Package class="w-16 h-16 text-gray-300 dark:text-gray-600" />
                            </div>
                        {/if}
                        
                        <!-- Stock Badge -->
                        <div class="absolute top-2 right-2">
                            <span class={cn(
                                "px-2 py-1 rounded-lg text-xs font-medium",
                                stockConfig.bg, stockConfig.text
                            )}>
                                {stockConfig.label}
                            </span>
                        </div>

                        <!-- Quick Actions -->
                        {#if canEdit}
                        <div class="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                                onclick={(e) => { e.stopPropagation(); openEdit(product); }}
                                class="p-2 bg-white/90 dark:bg-gray-800/90 rounded-lg shadow hover:bg-white dark:hover:bg-gray-700 transition-all"
                            >
                                <Edit class="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button
                                onclick={(e) => { e.stopPropagation(); handleDelete(product); }}
                                class="p-2 bg-white/90 dark:bg-gray-800/90 rounded-lg shadow hover:bg-danger-50 dark:hover:bg-danger-900/30 transition-all"
                            >
                                <Trash2 class="w-4 h-4 text-danger-500" />
                            </button>
                        </div>
                        {/if}
                    </div>

                    <!-- Content -->
                    <div class="p-4">
                        <div class="flex items-start justify-between gap-2 mb-2">
                            <h3 class="font-semibold text-gray-900 dark:text-white line-clamp-1">
                                {product.name}
                            </h3>
                        </div>

                        {#if product.sku}
                            <div class="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-2">
                                <Tag class="w-3 h-3" />
                                <span class="font-mono">{product.sku}</span>
                            </div>
                        {/if}

                        <div class="flex items-center justify-between">
                            <span class="text-lg font-bold text-blue-600 dark:text-blue-400">
                                {formatCurrency(product.price)}
                            </span>
                            <span class="text-sm text-gray-500 dark:text-gray-400">
                                {product.stock} {product.unit || "ຊິ້ນ"}
                            </span>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {:else}
        <!-- List View -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ສິນຄ້າ
                            </th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                SKU
                            </th>
                            <th class="text-left px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ໝວດໝູ່
                            </th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ລາຄາ
                            </th>
                            <th class="text-right px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ສະຕ໋ອກ
                            </th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ສະຖານະ
                            </th>
                            <th class="text-center px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ຈັດການ
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each paginatedProducts as product (product.id)}
                            {@const stockStatus = getStockStatus(product)}
                            {@const stockConfig = getStockConfig(stockStatus)}

                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-3">
                                        <div class="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                                            {#if product.image}
                                                <img src={product.image} alt={product.name} class="w-full h-full object-cover" />
                                            {:else}
                                                <div class="w-full h-full flex items-center justify-center">
                                                    <Package class="w-6 h-6 text-gray-400" />
                                                </div>
                                            {/if}
                                        </div>
                                        <div>
                                            <p class="font-medium text-gray-900 dark:text-white">{product.name}</p>
                                            {#if product.barcode}
                                                <p class="text-xs text-gray-500 dark:text-gray-400 font-mono">{product.barcode}</p>
                                            {/if}
                                        </div>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <span class="font-mono text-sm text-gray-600 dark:text-gray-400">{product.sku || "-"}</span>
                                </td>
                                <td class="px-6 py-4">
                                    <span class="text-sm text-gray-600 dark:text-gray-400">{getCategoryName(product.categoryId)}</span>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-semibold text-gray-900 dark:text-white">{formatCurrency(product.price)}</span>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <span class="text-gray-700 dark:text-gray-300">{product.stock} {product.unit || "ຊິ້ນ"}</span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span class={cn(
                                        "px-2.5 py-1 rounded-full text-xs font-medium",
                                        stockConfig.bg, stockConfig.text
                                    )}>
                                        {stockConfig.label}
                                    </span>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-center gap-1">
                                        <button
                                            onclick={() => openDetail(product)}
                                            class="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                                        >
                                            <Eye class="w-4 h-4" />
                                        </button>
                                        {#if canEdit}
                                        <button
                                            onclick={() => openEdit(product)}
                                            class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                                        >
                                            <Edit class="w-4 h-4" />
                                        </button>
                                        <button
                                            onclick={() => handleDelete(product)}
                                            class="p-2 text-gray-400 hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded-lg transition-all"
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
        </div>
    {/if}

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="flex items-center justify-center gap-2 mt-6">
            <button
                onclick={() => (currentPage = Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            >
                <ChevronLeft class="w-5 h-5" />
            </button>
            <span class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                {currentPage} / {totalPages}
            </span>
            <button
                onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            >
                <ChevronRight class="w-5 h-5" />
            </button>
        </div>
    {/if}
</div>

<!-- Add/Edit Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Modal Header -->
            <div class="px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">
                    {editingProduct ? "ແກ້ໄຂສິນຄ້າ" : "ເພີ່ມສິນຄ້າໃໝ່"}
                </h2>
                <button
                    onclick={() => (showModal = false)}
                    class="p-1.5 hover:bg-white/20 rounded-lg transition-all"
                >
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <!-- Modal Content -->
            <form
                onsubmit={(e) => {
                    e.preventDefault();
                    handleSubmit();
                }}
                class="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
            >
                <!-- Image Upload -->
                <div class="flex items-center gap-4">
                    <div class="w-24 h-24 rounded-xl bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                        {#if imagePreview}
                            <img src={imagePreview} alt="Preview" class="w-full h-full object-cover" />
                        {:else}
                            <div class="w-full h-full flex items-center justify-center">
                                <Camera class="w-8 h-8 text-gray-400" />
                            </div>
                        {/if}
                    </div>
                    <div>
                        <label class="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-all {isUploading ? 'opacity-60 pointer-events-none' : ''}">
                            {#if isUploading}
                                <Loader2 class="w-4 h-4 animate-spin" />
                                <span class="text-sm font-medium">ກຳລັງອັບໂຫລດ...</span>
                            {:else}
                                <Image class="w-4 h-4" />
                                <span class="text-sm font-medium">ອັບໂຫລດຮູບພາບ</span>
                            {/if}
                            <input
                                type="file"
                                accept="image/*"
                                class="hidden"
                                disabled={isUploading}
                                onchange={handleImageUpload}
                            />
                        </label>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">PNG, JPG ບໍ່ເກີນ 5MB</p>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ຊື່ສິນຄ້າ *
                    </label>
                    <input
                        type="text"
                        bind:value={formData.name}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="relative">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            SKU
                        </label>
                        <div class="flex gap-2">
                            <div class="relative flex-1">
                                <input
                                    type="text"
                                    bind:value={formData.sku}
                                    oninput={(e) => { skuSearch = e.currentTarget.value; showSkuDropdown = true; }}
                                    onfocus={() => { skuSearch = formData.sku; showSkuDropdown = true; }}
                                    onblur={() => setTimeout(() => showSkuDropdown = false, 200)}
                                    placeholder="ພິມເພື່ອຄົ້ນຫາ ຫຼື ສ້າງໃໝ່"
                                    class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                {#if showSkuDropdown && filteredSkuList.length > 0}
                                    <div class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                        {#each filteredSkuList as item (item.value)}
                                            <button
                                                type="button"
                                                class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white flex items-center justify-between"
                                                onmousedown={() => { formData.sku = item.value; showSkuDropdown = false; }}
                                            >
                                                <span class="font-mono">{item.value}</span>
                                                <span class="text-xs text-gray-500 dark:text-gray-400 truncate ml-2">{item.label.split(' - ')[1] || ''}</span>
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                            <button
                                type="button"
                                onclick={generateSku}
                                disabled={isGeneratingSku}
                                title="ສ້າງ SKU ໃໝ່"
                                class="px-3 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                            >
                                {#if isGeneratingSku}
                                    <Loader2 class="w-5 h-5 animate-spin" />
                                {:else}
                                    <Sparkles class="w-5 h-5" />
                                {/if}
                            </button>
                        </div>
                    </div>
                    <div class="relative">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ບາໂຄ້ດ
                        </label>
                        <div class="flex gap-2">
                            <div class="relative flex-1">
                                <input
                                    type="text"
                                    bind:value={formData.barcode}
                                    oninput={(e) => { barcodeSearch = e.currentTarget.value; showBarcodeDropdown = true; }}
                                    onfocus={() => { barcodeSearch = formData.barcode; showBarcodeDropdown = true; }}
                                    onblur={() => setTimeout(() => showBarcodeDropdown = false, 200)}
                                    placeholder="ພິມເພື່ອຄົ້ນຫາ ຫຼື ສ້າງໃໝ່"
                                    class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                {#if showBarcodeDropdown && filteredBarcodeList.length > 0}
                                    <div class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                        {#each filteredBarcodeList as item (item.value)}
                                            <button
                                                type="button"
                                                class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white flex items-center justify-between"
                                                onmousedown={() => { formData.barcode = item.value; showBarcodeDropdown = false; }}
                                            >
                                                <span class="font-mono">{item.value}</span>
                                                <span class="text-xs text-gray-500 dark:text-gray-400 truncate ml-2">{item.label.split(' - ')[1] || ''}</span>
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                            <button
                                type="button"
                                onclick={generateBarcode}
                                disabled={isGeneratingBarcode}
                                title="ສ້າງບາໂຄ້ດໃໝ່"
                                class="px-3 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                            >
                                {#if isGeneratingBarcode}
                                    <Loader2 class="w-5 h-5 animate-spin" />
                                {:else}
                                    <Barcode class="w-5 h-5" />
                                {/if}
                            </button>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ລາຄາຂາຍ *
                        </label>
                        <MoneyInput
                            bind:value={formData.price}
                            required
                            min={0}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ລາຄາທຶນ
                        </label>
                        <MoneyInput
                            bind:value={formData.cost}
                            min={0}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ໝວດໝູ່
                    </label>
                    <select
                        bind:value={formData.categoryId}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">ເລືອກໝວດໝູ່</option>
                        {#each categories as category (category.id)}
                            <option value={category.id}>{category.name}</option>
                        {/each}
                    </select>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ເຈົ້າຂອງສິນຄ້າ (Vendor)
                    </label>
                    <select
                        bind:value={formData.vendorId}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">ເລືອກເຈົ້າຂອງສິນຄ້າ (ບໍ່ບັງຄັບ)</option>
                        {#each vendors as vendor (vendor.id)}
                            <option value={vendor.id}>{vendor.name}</option>
                        {/each}
                    </select>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        ລາຍລະອຽດ
                    </label>
                    <textarea
                        bind:value={formData.description}
                        rows="2"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    ></textarea>
                </div>

                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ສະຕ໋ອກ
                        </label>
                        <input
                            type="number"
                            bind:value={formData.stock}
                            min="0"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ສະຕ໋ອກຕ່ຳສຸດ
                        </label>
                        <input
                            type="number"
                            bind:value={formData.minStock}
                            min="0"
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            ຫົວໜ່ວຍ
                        </label>
                        <input
                            type="text"
                            bind:value={formData.unit}
                            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" bind:checked={formData.isActive} class="sr-only peer" />
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">ເປີດຂາຍ</span>
                </div>

                <div class="flex justify-end gap-3 pt-4">
                    <button
                        type="button"
                        onclick={() => (showModal = false)}
                        class="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="submit"
                        class="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg"
                    >
                        {t("common.save")}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- Detail Modal -->
{#if showDetailModal && selectedProduct}
    {@const stockStatus = getStockStatus(selectedProduct)}
    {@const stockConfig = getStockConfig(stockStatus)}

    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Image -->
            <div class="relative aspect-video bg-gray-100 dark:bg-gray-700">
                {#if selectedProduct.image}
                    <img
                        src={selectedProduct.image}
                        alt={selectedProduct.name}
                        class="w-full h-full object-cover"
                    />
                {:else}
                    <div class="w-full h-full flex items-center justify-center">
                        <Package class="w-24 h-24 text-gray-300 dark:text-gray-600" />
                    </div>
                {/if}
                <button
                    onclick={() => (showDetailModal = false)}
                    class="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-lg transition-all"
                >
                    <X class="w-5 h-5 text-white" />
                </button>
            </div>

            <!-- Content -->
            <div class="p-6">
                <div class="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <h2 class="text-xl font-bold text-gray-900 dark:text-white">{selectedProduct.name}</h2>
                        {#if selectedProduct.sku}
                            <button
                                onclick={() => copySku(selectedProduct.sku)}
                                class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-500 mt-1"
                            >
                                <Tag class="w-3 h-3" />
                                <span class="font-mono">{selectedProduct.sku}</span>
                                <Copy class="w-3 h-3" />
                            </button>
                        {/if}
                    </div>
                    <span class={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium",
                        stockConfig.bg, stockConfig.text
                    )}>
                        {stockConfig.label}
                    </span>
                </div>

                {#if selectedProduct.description}
                    <p class="text-gray-600 dark:text-gray-400 text-sm mb-4">{selectedProduct.description}</p>
                {/if}

                <!-- Details Grid -->
                <div class="grid grid-cols-2 gap-3 mb-6">
                    <div class="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
                        <p class="text-xs text-blue-600/70 dark:text-blue-400/70 mb-0.5">ລາຄາຂາຍ</p>
                        <p class="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency(selectedProduct.price)}</p>
                    </div>
                    <div class="p-3 bg-success-50 dark:bg-success-900/30 rounded-xl">
                        <p class="text-xs text-success-600/70 dark:text-success-400/70 mb-0.5">ລາຄາທຶນ</p>
                        <p class="text-lg font-bold text-success-600 dark:text-success-400">{formatCurrency(selectedProduct.cost || 0)}</p>
                    </div>
                    <div class="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl">
                        <p class="text-xs text-purple-600/70 dark:text-purple-400/70 mb-0.5">ສະຕ໋ອກ</p>
                        <p class="text-lg font-bold text-purple-600 dark:text-purple-400">{selectedProduct.stock} {selectedProduct.unit || "ຊິ້ນ"}</p>
                    </div>
                    <div class="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-xl">
                        <p class="text-xs text-amber-600/70 dark:text-amber-400/70 mb-0.5">ໝວດໝູ່</p>
                        <p class="text-lg font-bold text-amber-600 dark:text-amber-400">{getCategoryName(selectedProduct.categoryId)}</p>
                    </div>
                </div>

                <!-- Actions -->
                {#if canEdit}
                <div class="flex gap-3">
                    <button
                        onclick={() => { showDetailModal = false; openEdit(selectedProduct); }}
                        class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                        <Edit class="w-4 h-4" />
                        ແກ້ໄຂ
                    </button>
                    <button
                        onclick={() => { showDetailModal = false; handleDelete(selectedProduct); }}
                        class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/30 font-medium transition-all"
                    >
                        <Trash2 class="w-4 h-4" />
                        ລຶບ
                    </button>
                </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
