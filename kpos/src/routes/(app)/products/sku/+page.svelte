<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatCurrency } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import MoneyInput from "$lib/components/MoneyInput.svelte";
    import {
        Package,
        Plus,
        Search,
        Edit,
        Trash2,
        X,
        Loader2,
        RefreshCw,
        AlertCircle,
        Barcode,
        Tag,
        ChevronLeft,
        ChevronRight,
        Filter,
        Download,
        Upload,
        Copy,
        Eye,
        Settings,
        Layers,
        Hash,
        DollarSign,
        Boxes,
        MoreVertical,
        Check,
    } from "lucide-svelte";

    // Types
    interface SKUVariant {
        id: string;
        sku: string;
        barcode: string | null;
        productId: string;
        productName: string;
        name: string;
        variant: string;
        attributes: Record<string, string>;
        cost: number;
        price: number;
        unitCost: number;
        sellingPrice: number;
        isActive: boolean;
        createdAt: string;
        updatedAt: string;
        inventory?: {
            quantity: number;
            available: number;
        }[];
    }

    interface Product {
        id: string;
        name: string;
        sku: string | null;
        price: number;
        cost: number;
    }

    // State
    let skuVariants = $state<SKUVariant[]>([]);
    let products = $state<Product[]>([]);
    let availableBarcodes = $state<string[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showModal = $state(false);
    let showDetailModal = $state(false);
    let editingVariant = $state<SKUVariant | null>(null);
    let selectedVariant = $state<SKUVariant | null>(null);
    let isSaving = $state(false);
    let showBarcodeDropdown = $state(false);
    let isGeneratingSku = $state(false);
    let isGeneratingBarcode = $state(false);
    let isInitialized = $state(false);

    // Filters
    let searchQuery = $state("");
    let searchDebounced = $state("");
    let filterProduct = $state<string | null>(null);
    let filterStatus = $state<"all" | "active" | "inactive">("all");
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;

    // Pagination
    let currentPage = $state(1);
    let limit = $state(20);
    let totalItems = $state(0);
    let totalPages = $derived(Math.ceil(totalItems / limit));

    // Stats from API
    let stats = $state({
        total: 0,
        active: 0,
        inactive: 0,
        withStock: 0,
    });

    // Form
    let formData = $state({
        productId: "",
        sku: "",
        barcode: "",
        name: "",
        attributes: {} as Record<string, string>,
        cost: 0,
        price: 0,
        isActive: true,
    });

    // Attribute management
    let newAttrKey = $state("");
    let newAttrValue = $state("");

    // Debounce search input
    function handleSearchInput(value: string) {
        searchQuery = value;
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchDebounced = value;
            currentPage = 1; // Reset to first page on search
        }, 300);
    }

    // Effect to reload data when filters/pagination change
    $effect(() => {
        // Read dependencies to track them
        void searchDebounced;
        void filterProduct;
        void filterStatus;
        void currentPage;
        void limit;
        
        if (isInitialized) {
            loadSkuVariants();
        }
    });

    onMount(async () => {
        // Load static data once (products, barcodes)
        await loadStaticData();
        // Load SKU variants
        await loadSkuVariants();
        isInitialized = true;
    });

    // Load products and barcodes once - these don't change frequently
    async function loadStaticData() {
        try {
            const [productsRes, barcodesRes] = await Promise.all([
                api.get("products?limit=500").json<any>(),
                api.get("products/barcodes").json<any>().catch(() => ({ data: [] })),
            ]);

            if (productsRes.success) {
                products = productsRes.data || [];
            }
            availableBarcodes = (barcodesRes.data || []).filter((b: string) => b);
        } catch (err) {
            console.error("Failed to load static data:", err);
        }
    }

    // Load SKU variants with current filters/pagination
    async function loadSkuVariants() {
        loading = true;
        error = null;
        try {
            const searchParams: Record<string, string | number> = {
                page: currentPage,
                limit: limit,
            };
            if (searchDebounced) searchParams.search = searchDebounced;
            if (filterProduct) searchParams.productId = filterProduct;
            if (filterStatus !== "all") searchParams.status = filterStatus;

            const variantsRes = await api
                .get("products/skus", { searchParams })
                .json<any>();

            if (variantsRes.success) {
                skuVariants = variantsRes.data || [];
                totalItems = variantsRes.meta?.total || skuVariants.length;
                
                // Update stats from API response or calculate locally
                if (variantsRes.meta?.stats) {
                    stats = variantsRes.meta.stats;
                } else {
                    stats = {
                        total: variantsRes.meta?.total || skuVariants.length,
                        active: skuVariants.filter((v) => v.isActive).length,
                        inactive: skuVariants.filter((v) => !v.isActive).length,
                        withStock: skuVariants.filter(
                            (v) => v.inventory && v.inventory.some((i) => i.quantity > 0)
                        ).length,
                    };
                }
            } else {
                throw new Error(variantsRes.error?.message || "Failed to load SKU variants");
            }
        } catch (err: any) {
            console.error("Failed to load data:", err);
            error = err.message || "ບໍ່ສາມາດໂຫລດຂໍ້ມູນໄດ້";
            toast.error("ບໍ່ສາມາດໂຫລດຂໍ້ມູນ SKU ໄດ້");
        } finally {
            loading = false;
        }
    }

    // Reload all data (for refresh button)
    async function loadData() {
        await loadStaticData();
        await loadSkuVariants();
    }

    function openModal(variant?: SKUVariant) {
        if (variant) {
            editingVariant = variant;
            formData = {
                productId: variant.productId,
                sku: variant.sku,
                barcode: variant.barcode || "",
                name: variant.name || variant.variant || "",
                attributes: variant.attributes || {},
                cost: variant.unitCost || variant.cost || 0,
                price: variant.sellingPrice || variant.price || 0,
                isActive: variant.isActive,
            };
        } else {
            editingVariant = null;
            formData = {
                productId: "",
                sku: "",
                barcode: "",
                name: "",
                attributes: {},
                cost: 0,
                price: 0,
                isActive: true,
            };
        }
        newAttrKey = "";
        newAttrValue = "";
        showModal = true;
    }

    function viewDetail(variant: SKUVariant) {
        selectedVariant = variant;
        showDetailModal = true;
    }

    async function generateSku() {
        isGeneratingSku = true;
        try {
            const res = await api
                .get("products/generate/sku", {
                    searchParams: formData.productId
                        ? { productId: formData.productId }
                        : {},
                })
                .json<any>();
            if (res.success && res.data?.sku) {
                formData.sku = res.data.sku;
            }
        } catch {
            // Fallback
            formData.sku = `SKU-${Date.now().toString(36).toUpperCase()}`;
        } finally {
            isGeneratingSku = false;
        }
    }

    async function generateBarcode() {
        isGeneratingBarcode = true;
        try {
            const res = await api.get("products/generate/barcode").json<any>();
            if (res.success && res.data?.barcode) {
                formData.barcode = res.data.barcode;
            }
        } catch {
            // Fallback EAN-13
            const prefix = "885";
            const random = Math.floor(Math.random() * 1000000000)
                .toString()
                .padStart(9, "0");
            let sum = 0;
            const base = prefix + random;
            for (let i = 0; i < 12; i++) {
                sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
            }
            const check = (10 - (sum % 10)) % 10;
            formData.barcode = base + check;
        } finally {
            isGeneratingBarcode = false;
        }
    }

    function addAttribute() {
        if (newAttrKey.trim() && newAttrValue.trim()) {
            formData.attributes = {
                ...formData.attributes,
                [newAttrKey.trim()]: newAttrValue.trim(),
            };
            newAttrKey = "";
            newAttrValue = "";
        }
    }

    function removeAttribute(key: string) {
        const { [key]: removed, ...rest } = formData.attributes;
        formData.attributes = rest;
    }

    async function saveVariant() {
        if (!formData.productId) {
            toast.error("ກະລຸນາເລືອກສິນຄ້າ");
            return;
        }
        if (!formData.sku) {
            toast.error("ກະລຸນາລະບຸ SKU");
            return;
        }

        isSaving = true;
        try {
            const payload: Record<string, any> = {
                productId: formData.productId,
                sku: formData.sku.trim(),
                variant: formData.name,
                productName: products.find((p) => p.id === formData.productId)?.name || "",
                unitCost: Number(formData.cost) || 0,
                sellingPrice: Number(formData.price) || 0,
                attributes: formData.attributes,
                isActive: formData.isActive,
            };
            
            // Only include barcode if it has a value
            if (formData.barcode && formData.barcode.trim() !== '') {
                payload.barcode = formData.barcode.trim();
            }

            if (editingVariant) {
                await api.put(`products/skus/${editingVariant.id}`, { json: payload }).json();
                toast.success("ອັບເດດ SKU ສຳເລັດ");
            } else {
                await api.post("products/skus", { json: payload }).json();
                toast.success("ສ້າງ SKU ສຳເລັດ");
            }

            showModal = false;
            loadData();
        } catch (err: any) {
            console.error("Failed to save:", err);
            // Try to get error message from response
            let errorMsg = "ບໍ່ສາມາດບັນທຶກໄດ້";
            if (err?.response) {
                try {
                    const errorData = await err.response.json();
                    if (errorData?.error?.message) {
                        errorMsg = errorData.error.message;
                    }
                    if (errorData?.error?.field === 'sku') {
                        errorMsg = 'SKU ນີ້ມີຢູ່ແລ້ວ. ກະລຸນາໃຊ້ SKU ອື່ນ.';
                    } else if (errorData?.error?.field === 'barcode') {
                        errorMsg = 'ບາໂຄ້ດນີ້ມີຢູ່ແລ້ວ. ກະລຸນາໃຊ້ບາໂຄ້ດອື່ນ.';
                    }
                } catch {}
            }
            toast.error(errorMsg);
        } finally {
            isSaving = false;
        }
    }

    async function deleteVariant(variant: SKUVariant) {
        if (!confirm(`ຕ້ອງການລົບ SKU "${variant.sku}" ບໍ?`)) return;

        try {
            await api.delete(`products/skus/${variant.id}`).json();
            toast.success("ລົບ SKU ສຳເລັດ");
            loadData();
        } catch (err: any) {
            console.error("Failed to delete:", err);
            toast.error(err.message || "ບໍ່ສາມາດລົບໄດ້");
        }
    }

    async function toggleStatus(variant: SKUVariant) {
        try {
            await api
                .put(`products/skus/${variant.id}`, {
                    json: { ...variant, isActive: !variant.isActive },
                })
                .json();
            toast.success(variant.isActive ? "ປິດການໃຊ້ງານແລ້ວ" : "ເປີດການໃຊ້ງານແລ້ວ");
            loadData();
        } catch (err: any) {
            toast.error(err.message || "ບໍ່ສາມາດປ່ຽນສະຖານະໄດ້");
        }
    }

    function copySku(sku: string) {
        navigator.clipboard.writeText(sku);
        toast.success("ກ໋ອບປີ້ SKU ແລ້ວ");
    }

    function copyBarcode(barcode: string) {
        navigator.clipboard.writeText(barcode);
        toast.success("ກ໋ອບປີ້ Barcode ແລ້ວ");
    }

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            loadData();
        }
    }

    function changeLimit(newLimit: number) {
        limit = newLimit;
        currentPage = 1;
        loadData();
    }

    function getMargin(variant: SKUVariant): number {
        const cost = variant.unitCost || variant.cost || 0;
        const price = variant.sellingPrice || variant.price || 0;
        if (cost === 0) return 100;
        return Math.round(((price - cost) / cost) * 100);
    }

    function getMarginColor(margin: number): string {
        if (margin >= 50) return "text-success-600 dark:text-success-400";
        if (margin >= 20) return "text-amber-600 dark:text-amber-400";
        if (margin >= 0) return "text-orange-600 dark:text-orange-400";
        return "text-danger-600 dark:text-danger-400";
    }
</script>

<svelte:head>
    <title>ຈັດການ SKU - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <div class="p-2 bg-primary-100 dark:bg-primary-900/50 rounded-xl">
                    <Layers class="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                ຈັດການ SKU Variants
            </h1>
            <p class="text-gray-500 dark:text-gray-400 mt-1">
                ຈັດການລະຫັດສິນຄ້າ, ບາໂຄດ ແລະ ລາຄາຂາຍແຕ່ລະ variant
            </p>
        </div>
        <div class="flex flex-wrap gap-3">
            <button
                onclick={() => loadData()}
                class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
                <RefreshCw class="w-4 h-4" />
                ໂຫລດໃໝ່
            </button>
            <button
                onclick={() => openModal()}
                class="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/25"
            >
                <Plus class="w-4 h-4" />
                ເພີ່ມ SKU ໃໝ່
            </button>
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Hash class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">SKU ທັງໝົດ</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-success-100 dark:bg-success-900/50 rounded-lg">
                    <Check class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{stats.active}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ເປີດໃຊ້ງານ</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <X class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{stats.inactive}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ປິດການໃຊ້ງານ</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Boxes class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{stats.withStock}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ມີສະຕ໋ອກ</p>
                </div>
            </div>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div class="flex flex-col lg:flex-row gap-4">
            <div class="flex-1 relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    value={searchQuery}
                    oninput={(e) => handleSearchInput(e.currentTarget.value)}
                    placeholder="ຄົ້ນຫາ SKU, ບາໂຄດ, ຊື່ສິນຄ້າ..."
                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                />
            </div>
            <div class="flex gap-3">
                <select
                    bind:value={filterProduct}
                    onchange={() => { currentPage = 1; }}
                    class="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                >
                    <option value={null}>ສິນຄ້າທັງໝົດ</option>
                    {#each products as product (product.id)}
                        <option value={product.id}>{product.name}</option>
                    {/each}
                </select>
                <select
                    bind:value={filterStatus}
                    onchange={() => { currentPage = 1; }}
                    class="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                >
                    <option value="all">ສະຖານະທັງໝົດ</option>
                    <option value="active">ເປີດໃຊ້ງານ</option>
                    <option value="inactive">ປິດການໃຊ້ງານ</option>
                </select>
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
                    onclick={() => loadData()}
                    class="flex items-center gap-2 px-4 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700 transition-colors"
                >
                    <RefreshCw class="w-4 h-4" />
                    ລອງໃໝ່
                </button>
            </div>
        </div>
    {/if}

    <!-- Loading State -->
    {#if loading}
        <div class="flex flex-col items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-primary-600 animate-spin mb-4" />
            <p class="text-gray-500 dark:text-gray-400">ກຳລັງໂຫລດຂໍ້ມູນ...</p>
        </div>
    {:else if skuVariants.length === 0 && !error}
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <Layers class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">ບໍ່ພົບ SKU</h3>
            <p class="text-gray-500 dark:text-gray-400 mb-6">ຍັງບໍ່ມີ SKU variants ໃນລະບົບ ຫຼື ບໍ່ກົງກັບຕົວກອງ</p>
            <button
                onclick={() => openModal()}
                class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
                <Plus class="w-4 h-4" />
                ເພີ່ມ SKU ທຳອິດ
            </button>
        </div>
    {:else if !error}
        <!-- SKU Table -->
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                SKU / Barcode
                            </th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ສິນຄ້າ
                            </th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Attributes
                            </th>
                            <th class="px-6 py-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ຕົ້ນທຶນ
                            </th>
                            <th class="px-6 py-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ລາຄາຂາຍ
                            </th>
                            <th class="px-6 py-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ກຳໄລ
                            </th>
                            <th class="px-6 py-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ສະຖານະ
                            </th>
                            <th class="px-6 py-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                ຈັດການ
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each skuVariants as variant (variant.id)}
                            {@const margin = getMargin(variant)}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td class="px-6 py-4">
                                    <div class="flex flex-col gap-1">
                                        <div class="flex items-center gap-2">
                                            <span class="font-mono font-semibold text-gray-900 dark:text-white">
                                                {variant.sku}
                                            </span>
                                            <button
                                                onclick={() => copySku(variant.sku)}
                                                class="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                                title="ກ໋ອບປີ້"
                                            >
                                                <Copy class="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        {#if variant.barcode}
                                            <div class="flex items-center gap-2">
                                                <Barcode class="w-3.5 h-3.5 text-gray-400" />
                                                <span class="text-sm font-mono text-gray-500 dark:text-gray-400">
                                                    {variant.barcode}
                                                </span>
                                                <button
                                                    onclick={() => copyBarcode(variant.barcode!)}
                                                    class="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                                    title="ກ໋ອບປີ້"
                                                >
                                                    <Copy class="w-3 h-3" />
                                                </button>
                                            </div>
                                        {:else}
                                            <span class="text-sm text-gray-400 dark:text-gray-500 italic">ບໍ່ມີ barcode</span>
                                        {/if}
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <div>
                                        <p class="font-medium text-gray-900 dark:text-white">
                                            {variant.productName}
                                        </p>
                                        {#if variant.name || variant.variant}
                                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                                {variant.name || variant.variant}
                                            </p>
                                        {/if}
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    {#if variant.attributes && Object.keys(variant.attributes).length > 0}
                                        <div class="flex flex-wrap gap-1">
                                            {#each Object.entries(variant.attributes) as [key, value]}
                                                <span class="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                                                    {key}: {value}
                                                </span>
                                            {/each}
                                        </div>
                                    {:else}
                                        <span class="text-gray-400 dark:text-gray-500">-</span>
                                    {/if}
                                </td>
                                <td class="px-6 py-4 text-right font-mono text-gray-600 dark:text-gray-400">
                                    {formatCurrency(variant.unitCost || variant.cost || 0)}
                                </td>
                                <td class="px-6 py-4 text-right font-mono font-semibold text-gray-900 dark:text-white">
                                    {formatCurrency(variant.sellingPrice || variant.price || 0)}
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <span class="font-semibold {getMarginColor(margin)}">
                                        {margin}%
                                    </span>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <button
                                        onclick={() => toggleStatus(variant)}
                                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors {variant.isActive
                                            ? 'bg-success-100 text-success-700 dark:bg-success-900/50 dark:text-success-400 hover:bg-success-200'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200'}"
                                    >
                                        {variant.isActive ? "ເປີດ" : "ປິດ"}
                                    </button>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <div class="flex items-center justify-end gap-1">
                                        <button
                                            onclick={() => viewDetail(variant)}
                                            class="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                            title="ເບິ່ງລາຍລະອຽດ"
                                        >
                                            <Eye class="w-4 h-4" />
                                        </button>
                                        <button
                                            onclick={() => openModal(variant)}
                                            class="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                                            title="ແກ້ໄຂ"
                                        >
                                            <Edit class="w-4 h-4" />
                                        </button>
                                        <button
                                            onclick={() => deleteVariant(variant)}
                                            class="p-2 text-gray-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-lg transition-colors"
                                            title="ລົບ"
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
            {#if totalPages > 1 || totalItems > 20}
                <div class="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-gray-200 dark:border-gray-700">
                    <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span>ສະແດງ</span>
                        <select
                            value={limit}
                            onchange={(e) => changeLimit(Number(e.currentTarget.value))}
                            class="px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={70}>70</option>
                            <option value={100}>100</option>
                        </select>
                        <span>ຕໍ່ໜ້າ</span>
                        <span class="ml-4 text-gray-500">
                            {(currentPage - 1) * limit + 1} - {Math.min(currentPage * limit, totalItems)} ຈາກ {totalItems}
                        </span>
                    </div>

                    <div class="flex items-center gap-1">
                        <button
                            onclick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            class="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft class="w-4 h-4" />
                        </button>

                        {#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                            return startPage + i;
                        }).filter((p) => p >= 1 && p <= totalPages) as page}
                            <button
                                onclick={() => goToPage(page)}
                                class="min-w-[40px] h-10 px-3 rounded-lg border text-sm font-medium transition-colors {page ===
                                currentPage
                                    ? 'bg-primary-600 border-primary-600 text-white'
                                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                            >
                                {page}
                            </button>
                        {/each}

                        <button
                            onclick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            class="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight class="w-4 h-4" />
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>

<!-- Create/Edit Modal -->
{#if showModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            role="button"
            tabindex="0"
            onclick={() => (showModal = false)}
            onkeydown={(e) => e.key === "Escape" && (showModal = false)}
        ></div>

        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {editingVariant ? "ແກ້ໄຂ SKU Variant" : "ເພີ່ມ SKU Variant ໃໝ່"}
                </h2>
                <button
                    onclick={() => (showModal = false)}
                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>

            <form
                onsubmit={(e) => {
                    e.preventDefault();
                    saveVariant();
                }}
                class="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-180px)]"
            >
                <!-- Product Selection -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ສິນຄ້າ <span class="text-danger-500">*</span>
                    </label>
                    <select
                        bind:value={formData.productId}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                    >
                        <option value="">-- ເລືອກສິນຄ້າ --</option>
                        {#each products as product (product.id)}
                            <option value={product.id}>{product.name}</option>
                        {/each}
                    </select>
                </div>

                <!-- SKU & Barcode -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            SKU <span class="text-danger-500">*</span>
                        </label>
                        <div class="flex gap-2">
                            <input
                                type="text"
                                bind:value={formData.sku}
                                required
                                class="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-primary-500"
                                placeholder="SKU-XXXX"
                            />
                            <button
                                type="button"
                                onclick={generateSku}
                                disabled={isGeneratingSku}
                                class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                            >
                                {#if isGeneratingSku}
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                {:else}
                                    ສ້າງ
                                {/if}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Barcode
                        </label>
                        <div class="flex gap-2 relative">
                            <div class="flex-1 relative">
                                <input
                                    type="text"
                                    bind:value={formData.barcode}
                                    onfocus={() => showBarcodeDropdown = true}
                                    onblur={() => setTimeout(() => showBarcodeDropdown = false, 200)}
                                    class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-primary-500"
                                    placeholder="ພິມ ຫຼື ເລືອກ barcode..."
                                />
                                {#if showBarcodeDropdown && availableBarcodes.length > 0}
                                    <div class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                        {#each availableBarcodes.filter(b => !formData.barcode || b.includes(formData.barcode)) as barcode (barcode)}
                                            <button
                                                type="button"
                                                onclick={() => { formData.barcode = barcode; showBarcodeDropdown = false; }}
                                                class="w-full text-left px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 font-mono text-sm transition-colors first:rounded-t-xl last:rounded-b-xl"
                                            >
                                                {barcode}
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                            <button
                                type="button"
                                onclick={generateBarcode}
                                disabled={isGeneratingBarcode}
                                class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                            >
                                {#if isGeneratingBarcode}
                                    <Loader2 class="w-4 h-4 animate-spin" />
                                {:else}
                                    ສ້າງໃໝ່
                                {/if}
                            </button>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">ພິມເພື່ອຄົ້ນຫາ ຫຼື ກົດ "ສ້າງໃໝ່" ເພື່ອສ້າງ barcode ໃໝ່</p>
                    </div>
                </div>

                <!-- Variant Name -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ຊື່ Variant
                    </label>
                    <input
                        type="text"
                        bind:value={formData.name}
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                        placeholder="ເຊັ່ນ: ແກ້ວໃຫຍ່, ສີແດງ, Size L"
                    />
                </div>

                <!-- Attributes -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Attributes
                    </label>
                    <div class="space-y-3">
                        {#if Object.keys(formData.attributes).length > 0}
                            <div class="flex flex-wrap gap-2">
                                {#each Object.entries(formData.attributes) as [key, value]}
                                    <div class="flex items-center gap-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-lg">
                                        <span class="text-sm text-primary-700 dark:text-primary-300">
                                            <strong>{key}:</strong> {value}
                                        </span>
                                        <button
                                            type="button"
                                            onclick={() => removeAttribute(key)}
                                            class="text-primary-500 hover:text-danger-500"
                                        >
                                            <X class="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                        <div class="flex gap-2">
                            <input
                                type="text"
                                bind:value={newAttrKey}
                                placeholder="ຊື່ (ເຊັ່ນ: ຂະໜາດ)"
                                class="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                            <input
                                type="text"
                                bind:value={newAttrValue}
                                placeholder="ຄ່າ (ເຊັ່ນ: L)"
                                class="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                            <button
                                type="button"
                                onclick={addAttribute}
                                disabled={!newAttrKey.trim() || !newAttrValue.trim()}
                                class="px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <Plus class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Cost & Price -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ຕົ້ນທຶນ (₭)
                        </label>
                        <div class="relative">
                            <DollarSign class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <MoneyInput
                                bind:value={formData.cost}
                                min={0}
                                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ລາຄາຂາຍ (₭)
                        </label>
                        <div class="relative">
                            <DollarSign class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <MoneyInput
                                bind:value={formData.price}
                                min={0}
                                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                    </div>
                </div>

                <!-- Margin Preview -->
                {#if formData.price > 0}
                    {@const marginPct =
                        formData.cost > 0
                            ? Math.round(((formData.price - formData.cost) / formData.cost) * 100)
                            : 100}
                    <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-gray-600 dark:text-gray-400">ອັດຕາກຳໄລ</span>
                            <span class="text-lg font-bold {getMarginColor(marginPct)}">
                                {marginPct}%
                            </span>
                        </div>
                        <div class="flex items-center justify-between mt-1">
                            <span class="text-sm text-gray-600 dark:text-gray-400">ກຳໄລຕໍ່ໜ່ວຍ</span>
                            <span class="text-lg font-semibold text-gray-900 dark:text-white">
                                {formatCurrency(formData.price - formData.cost)}
                            </span>
                        </div>
                    </div>
                {/if}

                <!-- Status Toggle -->
                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <div>
                        <p class="font-medium text-gray-900 dark:text-white">ສະຖານະການໃຊ້ງານ</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">ເປີດ/ປິດການໃຊ້ງານ SKU ນີ້</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" bind:checked={formData.isActive} class="sr-only peer" />
                        <div
                            class="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-primary-600"
                        ></div>
                    </label>
                </div>
            </form>

            <div class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onclick={() => (showModal = false)}
                    class="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                >
                    ຍົກເລີກ
                </button>
                <button
                    type="button"
                    onclick={saveVariant}
                    disabled={isSaving || !formData.productId || !formData.sku}
                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {#if isSaving}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {/if}
                    ບັນທຶກ
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Detail Modal -->
{#if showDetailModal && selectedVariant}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            role="button"
            tabindex="0"
            onclick={() => (showDetailModal = false)}
            onkeydown={(e) => e.key === "Escape" && (showDetailModal = false)}
        ></div>

        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">ລາຍລະອຽດ SKU</h2>
                <button
                    onclick={() => (showDetailModal = false)}
                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>

            <div class="p-6 space-y-4">
                <div class="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <p class="text-3xl font-mono font-bold text-gray-900 dark:text-white mb-2">
                        {selectedVariant.sku}
                    </p>
                    {#if selectedVariant.barcode}
                        <p class="text-sm font-mono text-gray-500 dark:text-gray-400">
                            {selectedVariant.barcode}
                        </p>
                    {/if}
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <p class="text-sm text-gray-500 dark:text-gray-400">ສິນຄ້າ</p>
                        <p class="font-semibold text-gray-900 dark:text-white">{selectedVariant.productName}</p>
                    </div>
                    <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <p class="text-sm text-gray-500 dark:text-gray-400">Variant</p>
                        <p class="font-semibold text-gray-900 dark:text-white">
                            {selectedVariant.name || selectedVariant.variant || "-"}
                        </p>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="p-4 bg-danger-50 dark:bg-danger-900/20 rounded-xl">
                        <p class="text-sm text-danger-600 dark:text-danger-400">ຕົ້ນທຶນ</p>
                        <p class="text-xl font-bold text-danger-700 dark:text-danger-300">
                            {formatCurrency(selectedVariant.unitCost || selectedVariant.cost || 0)}
                        </p>
                    </div>
                    <div class="p-4 bg-success-50 dark:bg-success-900/20 rounded-xl">
                        <p class="text-sm text-success-600 dark:text-success-400">ລາຄາຂາຍ</p>
                        <p class="text-xl font-bold text-success-700 dark:text-success-300">
                            {formatCurrency(selectedVariant.sellingPrice || selectedVariant.price || 0)}
                        </p>
                    </div>
                </div>

                {#if selectedVariant.attributes && Object.keys(selectedVariant.attributes).length > 0}
                    <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">Attributes</p>
                        <div class="flex flex-wrap gap-2">
                            {#each Object.entries(selectedVariant.attributes) as [key, value]}
                                <span class="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm">
                                    {key}: {value}
                                </span>
                            {/each}
                        </div>
                    </div>
                {/if}

                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <span class="text-gray-600 dark:text-gray-400">ສະຖານະ</span>
                    <span
                        class="px-3 py-1 rounded-full text-sm font-medium {selectedVariant.isActive
                            ? 'bg-success-100 text-success-700 dark:bg-success-900/50 dark:text-success-400'
                            : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}"
                    >
                        {selectedVariant.isActive ? "ເປີດໃຊ້ງານ" : "ປິດການໃຊ້ງານ"}
                    </span>
                </div>
            </div>

            <div class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => {
                        showDetailModal = false;
                        openModal(selectedVariant!);
                    }}
                    class="px-5 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 font-medium transition-colors"
                >
                    ແກ້ໄຂ
                </button>
            </div>
        </div>
    </div>
{/if}
