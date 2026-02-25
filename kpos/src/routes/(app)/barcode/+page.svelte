<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import { toast } from "svelte-sonner";
    import { onMount, tick } from "svelte";
    import {
        Barcode,
        QrCode,
        Printer,
        Download,
        Search,
        Plus,
        Settings,
        FileText,
        Grid3X3,
        LayoutGrid,
        X,
        Loader2,
        ChevronLeft,
        ChevronRight,
        AlertCircle,
        RefreshCw,
    } from "lucide-svelte";
    import JsBarcode from "jsbarcode";
    import QRCode from "qrcode";

    // State
    let activeTab = $state<"barcode" | "qrcode">("barcode");
    let searchQuery = $state("");
    let selectedProducts = $state<string[]>([]);
    let isGenerating = $state(false);
    let showSettings = $state(false);
    let showSkuModal = $state(false);
    let editingSku = $state<any>(null);
    let isSaving = $state(false);
    
    // Pagination
    let currentPage = $state(1);
    let pageSize = $state(10);
    let pageSizeOptions = [5, 10, 20, 50, 70, 100];

    // SKU Form
    let skuForm = $state({
        sku: "",
        barcode: "",
        productId: "",
        productName: "",
        price: 0,
    });

    // Available barcodes, SKUs and products for dropdown
    let availableBarcodes = $state<string[]>([]);
    let availableSkus = $state<string[]>([]);
    let availableProducts = $state<any[]>([]);

    // Barcode font standards
    const barcodeFontStandards = [
        { value: "CODE128", label: "Code 128 (ມາດຕະຖານ)", description: "ຮອງຮັບທຸກຕົວອັກສອນ ASCII" },
        { value: "EAN13", label: "EAN-13", description: "ສິນຄ້າທົ່ວໄປ 13 ຕົວເລກ" },
        { value: "EAN8", label: "EAN-8", description: "ສິນຄ້າຂະໜາດນ້ອຍ 8 ຕົວເລກ" },
        { value: "CODE39", label: "Code 39", description: "ຕົວອັກສອນ A-Z, 0-9" },
        { value: "UPC", label: "UPC-A", description: "ສິນຄ້າ USA 12 ຕົວເລກ" },
        { value: "ITF14", label: "ITF-14", description: "ສຳລັບກ່ອງ/ຫີບ" },
        { value: "MSI", label: "MSI", description: "ສຳລັບສາງ/ຄັງ" },
        { value: "pharmacode", label: "Pharmacode", description: "ຢາ ແລະ ເວດຊະພັນ" },
    ];

    // Barcode settings
    let barcodeSettings = $state({
        format: "CODE128",
        width: 2,
        height: 100,
        showText: true,
        fontSize: 14,
        margin: 10,
        showPrice: true,
        showProductName: true,
        fontFamily: "monospace",
        columns: 3,
    });

    // QR Code settings
    let qrSettings = $state({
        size: 200,
        errorCorrection: "M",
        margin: 4,
        darkColor: "#000000",
        lightColor: "#ffffff",
        showPrice: true,
        showProductName: true,
    });

    // Label size presets (mm) + custom
    let labelSizes = $state([
        { name: "20mm x 10mm", width: 20, height: 10, type: "small" },
        { name: "30mm x 15mm", width: 30, height: 15, type: "small2" },
        { name: "40mm x 20mm", width: 40, height: 20, type: "medium" },
        { name: "50mm x 25mm", width: 50, height: 25, type: "medium2" },
        { name: "58mm x 30mm", width: 58, height: 30, type: "receipt" },
        { name: "58mm x 40mm", width: 58, height: 40, type: "receipt2" },
        { name: "80mm x 40mm", width: 80, height: 40, type: "large" },
        { name: "100mm x 50mm", width: 100, height: 50, type: "xlarge" },
        { name: "A4 (21cm x 29.7cm)", width: 210, height: 297, type: "a4" },
        { name: "ກຳນົດເອງ", width: 0, height: 0, type: "custom" },
    ]);
    let selectedLabelSize = $state(labelSizes[4]);
    let customLabelWidth = $state(50);
    let customLabelHeight = $state(30);

    // Products data
    let products = $state<any[]>([]);
    let skuList = $state<any[]>([]);
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let isGeneratingBarcode = $state(false);

    onMount(() => {
        loadProducts();
        loadAvailableData();
    });

    async function loadProducts() {
        isLoading = true;
        error = null;
        try {
            const response = await api.get("products?limit=200").json<any>();
            if (response.success && response.data) {
                products = response.data.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    sku: p.sku || "",
                    barcode: p.barcode || "",
                    price: p.salePrice || p.price || 0,
                }));
                error = null;
            } else {
                products = [];
                error = t("barcode.loadFailed");
                toast.error(t("barcode.loadFailed"));
            }
        } catch (err) {
            console.error("Failed to load products:", err);
            products = [];
            error = t("barcode.loadFailed");
            toast.error(t("barcode.loadFailed"));
        } finally {
            isLoading = false;
        }
    }

    async function loadAvailableData() {
        try {
            // Load SKU list from API (SKU variants)
            const skuResponse = await api.get("products/skus").json<any>();
            if (skuResponse.success) {
                skuList = skuResponse.data || [];
                // Extract barcodes from SKU list
                availableBarcodes = skuList.map((s: any) => s.barcode).filter(Boolean);
                // Extract SKUs from SKU list
                availableSkus = skuList.map((s: any) => s.sku).filter(Boolean);
            }
        } catch {
            // Use products data as fallback
            skuList = products.filter(p => p.sku || p.barcode).map(p => ({
                id: p.id,
                sku: p.sku,
                barcode: p.barcode,
                productId: p.id,
                productName: p.name,
                sellingPrice: p.price,
            }));
            availableBarcodes = products.map(p => p.barcode).filter(Boolean);
            availableSkus = products.map(p => p.sku).filter(Boolean);
        }

        try {
            // Load available products
            const productResponse = await api.get("products?limit=200").json<any>();
            if (productResponse.success) {
                availableProducts = productResponse.data || [];
            }
        } catch {
            availableProducts = products;
        }
    }

    async function generateBarcodeFromAPI(): Promise<string> {
        try {
            const response = await api.get("products/generate/barcode").json<any>();
            if (response.data?.barcode) {
                return response.data.barcode;
            }
        } catch {
            // Fallback to local generation
        }
        return "885" + Math.random().toString().slice(2, 12);
    }

    async function generateSkuFromAPI(): Promise<string> {
        try {
            const params = skuForm.productId ? `?productId=${skuForm.productId}` : '';
            const response = await api.get(`products/generate/sku${params}`).json<any>();
            if (response.data?.sku) {
                return response.data.sku;
            }
        } catch {
            // Fallback to local generation
        }
        return `SKU-${Date.now().toString(36).toUpperCase()}`;
    }

    function generateBarcode(): string {
        return "885" + Math.random().toString().slice(2, 12);
    }

    // Generate real barcode SVG
    function generateBarcodeSvg(barcodeValue: string, container: HTMLElement) {
        if (!barcodeValue || !container) return;
        try {
            // Clear previous content
            container.innerHTML = "";
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            container.appendChild(svg);
            
            JsBarcode(svg, barcodeValue, {
                format: barcodeSettings.format === "EAN13" ? "EAN13" : 
                        barcodeSettings.format === "EAN8" ? "EAN8" :
                        barcodeSettings.format === "CODE39" ? "CODE39" :
                        barcodeSettings.format === "UPC" ? "UPC" : "CODE128",
                width: barcodeSettings.width,
                height: barcodeSettings.height * 0.6,
                displayValue: barcodeSettings.showText,
                fontSize: barcodeSettings.fontSize,
                margin: barcodeSettings.margin,
                valid: () => true,
            });
        } catch (error) {
            console.error("Failed to generate barcode:", error);
            container.innerHTML = `<span class="text-red-500 text-xs">Invalid barcode</span>`;
        }
    }

    // Generate QR Code
    async function generateQrCodeDataUrl(value: string): Promise<string> {
        try {
            return await QRCode.toDataURL(value, {
                width: qrSettings.size,
                margin: qrSettings.margin,
                errorCorrectionLevel: qrSettings.errorCorrection as "L" | "M" | "Q" | "H",
                color: {
                    dark: qrSettings.darkColor,
                    light: qrSettings.lightColor,
                }
            });
        } catch (error) {
            console.error("Failed to generate QR code:", error);
            return "";
        }
    }

    // Preview barcode element
    let previewBarcodeEl = $state<HTMLElement | null>(null);
    let previewQrDataUrl = $state("");

    // Update preview when selection or settings change
    $effect(() => {
        if (selectedProducts.length > 0 && previewBarcodeEl) {
            const firstSelected = products.find(p => selectedProducts.includes(p.id));
            if (firstSelected?.barcode && activeTab === "barcode") {
                generateBarcodeSvg(firstSelected.barcode, previewBarcodeEl);
            }
        }
    });

    $effect(() => {
        if (selectedProducts.length > 0 && activeTab === "qrcode") {
            const firstSelected = products.find(p => selectedProducts.includes(p.id));
            if (firstSelected) {
                const qrValue = firstSelected.barcode || firstSelected.sku || firstSelected.id;
                generateQrCodeDataUrl(qrValue).then(url => {
                    previewQrDataUrl = url;
                });
            }
        }
    });

    // Pagination - filteredProducts must be declared before totalPages
    let filteredProducts = $derived(
        products.filter(
            (p) =>
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.barcode.includes(searchQuery),
        ),
    );
    
    let totalPages = $derived(Math.ceil(filteredProducts.length / pageSize));

    let paginatedProducts = $derived(
        filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    );

    function toggleProduct(id: string) {
        if (selectedProducts.includes(id)) {
            selectedProducts = selectedProducts.filter((p) => p !== id);
        } else {
            selectedProducts = [...selectedProducts, id];
        }
    }

    function selectAll() {
        if (selectedProducts.length === paginatedProducts.length) {
            selectedProducts = [];
        } else {
            selectedProducts = paginatedProducts.map((p) => p.id);
        }
    }

    function getSelectedProductsData() {
        return products.filter(p => selectedProducts.includes(p.id));
    }

    async function generateBarcodesForPrint() {
        // Wait for DOM to update
        await tick();
        
        // Generate barcodes for all SVG elements
        const barcodeSvgs = document.querySelectorAll('.print-barcode-item .barcode-svg');
        barcodeSvgs.forEach((svg) => {
            const barcodeValue = svg.getAttribute('data-barcode');
            const format = svg.getAttribute('data-format') || 'CODE128';
            if (barcodeValue) {
                try {
                    JsBarcode(svg, barcodeValue, {
                        format: format === "EAN13" ? "EAN13" : 
                                format === "EAN8" ? "EAN8" :
                                format === "CODE39" ? "CODE39" :
                                format === "UPC" ? "UPC" : "CODE128",
                        width: 2,
                        height: 60,
                        displayValue: false,
                        margin: 5,
                    });
                } catch (e) {
                    console.error('Failed to generate barcode:', e);
                }
            }
        });

        // Generate QR codes for all canvas elements
        const qrCanvases = document.querySelectorAll('.print-barcode-item .qrcode-canvas');
        for (const canvas of qrCanvases) {
            const value = canvas.getAttribute('data-value');
            if (value) {
                try {
                    await QRCode.toCanvas(canvas, value, {
                        width: 80,
                        margin: 1,
                    });
                } catch (e) {
                    console.error('Failed to generate QR code:', e);
                }
            }
        }
    }

    async function generateBarcodes() {
        if (selectedProducts.length === 0) {
            toast.error(t("barcode.selectProducts"));
            return;
        }
        isGenerating = true;

        try {
            // Generate all barcodes/QR codes first
            await generateBarcodesForPrint();
            // Small delay to ensure rendering
            await new Promise((resolve) => setTimeout(resolve, 300));
            window.print();
        } finally {
            isGenerating = false;
        }
    }

    async function downloadLabels() {
        if (selectedProducts.length === 0) {
            toast.error(t("barcode.selectProducts"));
            return;
        }
        isGenerating = true;

        try {
            // Generate barcodes first
            await generateBarcodesForPrint();
            await new Promise((resolve) => setTimeout(resolve, 300));
            
            // Use jsPDF to generate PDF
            const { default: jsPDF } = await import('jspdf');
            const doc = new jsPDF();
            
            const selectedData = getSelectedProductsData();
            let yPosition = 20;
            
            for (const product of selectedData) {
                if (yPosition > 270) {
                    doc.addPage();
                    yPosition = 20;
                }
                
                doc.setFontSize(12);
                doc.text(product.name, 20, yPosition);
                doc.setFontSize(10);
                doc.text(`SKU: ${product.sku || '-'}`, 20, yPosition + 6);
                doc.text(`Barcode: ${product.barcode || '-'}`, 20, yPosition + 12);
                doc.text(`Price: ${formatCurrency(product.price)}`, 20, yPosition + 18);
                
                yPosition += 30;
            }
            
            doc.save('barcodes.pdf');
            toast.success(t("barcode.downloadStarted"));
        } catch (error) {
            console.error('Failed to generate PDF:', error);
            toast.error(t("common.error"));
        } finally {
            isGenerating = false;
        }
    }

    function formatCurrency(amount: number): string {
        return "₭" + new Intl.NumberFormat("lo-LA", { minimumFractionDigits: 0 }).format(amount);
    }

    // SKU Modal functions
    function openSkuModal(sku?: any) {
        if (sku) {
            editingSku = sku;
            skuForm = {
                sku: sku.sku,
                barcode: sku.barcode,
                productId: sku.id,
                productName: sku.name,
                price: sku.price,
            };
        } else {
            editingSku = null;
            skuForm = {
                sku: "",
                barcode: "",
                productId: "",
                productName: "",
                price: 0,
            };
        }
        showSkuModal = true;
    }

    function closeSkuModal() {
        showSkuModal = false;
        editingSku = null;
    }

    async function saveSku() {
        if (!skuForm.sku || !skuForm.barcode) {
            toast.error(t("barcode.fillRequired"));
            return;
        }

        isSaving = true;
        try {
            if (editingSku) {
                await api.put(`products/${editingSku.id}`, {
                    json: { sku: skuForm.sku, barcode: skuForm.barcode }
                }).json();
                toast.success(t("barcode.skuUpdated"));
            } else {
                // Create SKU variant
                await api.post("products/skus", { 
                    json: {
                        productId: skuForm.productId,
                        productName: skuForm.productName,
                        sku: skuForm.sku,
                        barcode: skuForm.barcode,
                        sellingPrice: skuForm.price,
                        variant: skuForm.productName,
                    }
                }).json();
                toast.success(t("barcode.skuCreated"));
            }
            closeSkuModal();
            await loadProducts();
        } catch (error) {
            toast.error(t("barcode.saveFailed"));
        } finally {
            isSaving = false;
        }
    }

    function selectProductForSku(product: any) {
        skuForm.productId = product.id;
        skuForm.productName = product.name;
        skuForm.price = product.salePrice || product.price || 0;
    }
</script>

<svelte:head>
    <title>{t("barcode.title")} - KPOS</title>
    <style>
        @media print {
            body * {
                visibility: hidden;
            }
            .print-area, .print-area * {
                visibility: visible;
            }
            .print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
            }
            .no-print {
                display: none !important;
            }
        }
    </style>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6"
    >
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {t("barcode.title")}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t("barcode.subtitle")}
            </p>
        </div>
        <div class="flex items-center gap-3 mt-4 sm:mt-0">
            <button
                onclick={() => (showSettings = !showSettings)}
                class={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    "border border-gray-300 dark:border-gray-600",
                    "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300",
                    "hover:bg-gray-50 dark:hover:bg-gray-700",
                )}
            >
                <Settings class="w-4 h-4" />
                {t("barcode.settings")}
            </button>
        </div>
    </div>

    <!-- Tabs -->
    <div
        class="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit"
    >
        <button
            onclick={() => (activeTab = "barcode")}
            class={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === "barcode"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
            )}
        >
            <Barcode class="w-4 h-4" />
            {t("barcode.barcode")}
        </button>
        <button
            onclick={() => (activeTab = "qrcode")}
            class={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === "qrcode"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
            )}
        >
            <QrCode class="w-4 h-4" />
            {t("barcode.qrcode")}
        </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Product List -->
        <div
            class="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm"
        >
            <!-- Search & Actions -->
            <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                <div class="flex flex-col sm:flex-row gap-3">
                    <div class="relative flex-1">
                        <Search
                            class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                        />
                        <input
                            type="text"
                            bind:value={searchQuery}
                            placeholder={t("barcode.searchProducts")}
                            class={cn(
                                "w-full pl-10 pr-4 py-2 rounded-lg border",
                                "border-gray-300 dark:border-gray-600",
                                "bg-white dark:bg-gray-700",
                                "text-gray-900 dark:text-white",
                                "placeholder-gray-400 dark:placeholder-gray-500",
                                "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                            )}
                        />
                    </div>
                    <div class="flex gap-2">
                        <button
                            onclick={selectAll}
                            class={cn(
                                "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                "border border-gray-300 dark:border-gray-600",
                                "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300",
                                "hover:bg-gray-50 dark:hover:bg-gray-600",
                            )}
                        >
                            {selectedProducts.length === paginatedProducts.length
                                ? t("common.deselectAll")
                                : t("common.selectAll")}
                        </button>
                        <button
                            onclick={() => openSkuModal()}
                            class={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                "bg-primary-600 text-white hover:bg-primary-700",
                            )}
                        >
                            <Plus class="w-4 h-4" />
                            {t("barcode.addSku")}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Products Table -->
            <div class="overflow-x-auto">
                {#if isLoading}
                    <div class="flex items-center justify-center py-12">
                        <Loader2 class="w-8 h-8 animate-spin text-primary-500" />
                    </div>
                {:else if error}
                    <div class="flex flex-col items-center justify-center py-12 text-center">
                        <AlertCircle class="w-12 h-12 text-red-500 mb-3" />
                        <h3 class="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">{t("common.error")}</h3>
                        <p class="text-red-600 dark:text-red-300 mb-4">{error}</p>
                        <button
                            onclick={() => loadProducts()}
                            class="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                            <RefreshCw class="w-4 h-4" />
                            {t("common.retry")}
                        </button>
                    </div>
                {:else}
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr
                            class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase"
                        >
                            <th class="px-4 py-3 w-12">
                                <input
                                    type="checkbox"
                                    checked={selectedProducts.length ===
                                        paginatedProducts.length &&
                                        paginatedProducts.length > 0}
                                    onchange={selectAll}
                                    class="rounded border-gray-300 dark:border-gray-600"
                                />
                            </th>
                            <th class="px-4 py-3">{t("barcode.product")}</th>
                            <th class="px-4 py-3">{t("barcode.sku")}</th>
                            <th class="px-4 py-3"
                                >{t("barcode.barcodeNumber")}</th
                            >
                            <th class="px-4 py-3 text-right"
                                >{t("barcode.price")}</th
                            >
                            <th class="px-4 py-3 text-center">{t("common.actions")}</th>
                        </tr>
                    </thead>
                    <tbody
                        class="divide-y divide-gray-100 dark:divide-gray-700"
                    >
                        {#each paginatedProducts as product (product.id)}
                            <tr
                                class={cn(
                                    "hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors",
                                    selectedProducts.includes(product.id) &&
                                        "bg-primary-50 dark:bg-primary-900/20",
                                )}
                                onclick={() => toggleProduct(product.id)}
                            >
                                <td class="px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedProducts.includes(
                                            product.id,
                                        )}
                                        onclick={(e) => e.stopPropagation()}
                                        onchange={() =>
                                            toggleProduct(product.id)}
                                        class="rounded border-gray-300 dark:border-gray-600"
                                    />
                                </td>
                                <td class="px-4 py-3">
                                    <div
                                        class="font-medium text-gray-900 dark:text-white"
                                    >
                                        {product.name}
                                    </div>
                                </td>
                                <td
                                    class="px-4 py-3 text-gray-500 dark:text-gray-400"
                                >
                                    {product.sku}
                                </td>
                                <td
                                    class="px-4 py-3 font-mono text-gray-600 dark:text-gray-300"
                                >
                                    {product.barcode}
                                </td>
                                <td
                                    class="px-4 py-3 text-right font-medium text-gray-900 dark:text-white"
                                >
                                    {formatCurrency(product.price)}
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <button
                                        onclick={(e) => { e.stopPropagation(); openSkuModal(product); }}
                                        class="text-primary-600 hover:text-primary-700 text-sm font-medium"
                                    >
                                        {t("common.edit")}
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
                {/if}
            </div>

            <!-- Pagination -->
            <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-500 dark:text-gray-400">{t("common.rowsPerPage")}:</span>
                    <select
                        bind:value={pageSize}
                        onchange={() => currentPage = 1}
                        class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-1 px-2 text-gray-900 dark:text-white"
                    >
                        {#each pageSizeOptions as size (size)}
                            <option value={size}>{size}</option>
                        {/each}
                    </select>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-500 dark:text-gray-400">
                        {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredProducts.length)} {t("common.of")} {filteredProducts.length}
                    </span>
                    <div class="flex gap-1">
                        <button
                            onclick={() => currentPage = Math.max(1, currentPage - 1)}
                            disabled={currentPage === 1}
                            class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                        <button
                            onclick={() => currentPage = Math.min(totalPages, currentPage + 1)}
                            disabled={currentPage === totalPages}
                            class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Settings & Preview -->
        <div class="space-y-6">
            <!-- Label Size -->
            <div
                class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
            >
                <h3
                    class="text-sm font-semibold text-gray-900 dark:text-white mb-3"
                >
                    {t("barcode.labelSize")}
                </h3>
                <div class="grid grid-cols-2 gap-2">
                    {#each labelSizes as size (size.name)}
                        <button
                            onclick={() => (selectedLabelSize = size)}
                            class={cn(
                                "px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                                selectedLabelSize.name === size.name
                                    ? "bg-primary-600 text-white border-primary-600"
                                    : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-primary-500",
                            )}
                        >
                            {size.name}
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Barcode/QR Settings -->
            {#if showSettings}
                <div
                    class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
                >
                    <h3
                        class="text-sm font-semibold text-gray-900 dark:text-white mb-3"
                    >
                        {activeTab === "barcode"
                            ? t("barcode.barcodeSettings")
                            : t("barcode.qrSettings")}
                    </h3>

                    {#if activeTab === "barcode"}
                        <div class="space-y-3">
                            <div>
                                <label
                                    for="barcode-format"
                                    class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                                >
                                    {t("barcode.format")} ({t("common.standard")})
                                </label>
                                <select
                                    id="barcode-format"
                                    bind:value={barcodeSettings.format}
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-2 px-3 text-gray-900 dark:text-white"
                                >
                                    {#each barcodeFontStandards as std (std.value)}
                                        <option value={std.value}>{std.label}</option>
                                    {/each}
                                </select>
                                {#if barcodeSettings.format}
                                    <p class="text-xs text-gray-400 mt-1">
                                        {barcodeFontStandards.find(s => s.value === barcodeSettings.format)?.description || ''}
                                    </p>
                                {/if}
                            </div>
                            <div>
                                <label
                                    for="barcode-width"
                                    class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                                >
                                    ຄວາມກວ້າງເສັ້ນ ({barcodeSettings.width}px)
                                </label>
                                <input
                                    id="barcode-width"
                                    type="range"
                                    bind:value={barcodeSettings.width}
                                    min="1"
                                    max="5"
                                    step="0.5"
                                    class="w-full"
                                />
                            </div>
                            <div>
                                <label
                                    for="barcode-height"
                                    class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                                >
                                    {t("barcode.height")} ({barcodeSettings.height}px)
                                </label>
                                <input
                                    id="barcode-height"
                                    type="range"
                                    bind:value={barcodeSettings.height}
                                    min="30"
                                    max="200"
                                    class="w-full"
                                />
                            </div>
                            <div>
                                <label
                                    for="barcode-fontSize"
                                    class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                                >
                                    ຂະໜາດຕົວອັກສອນ ({barcodeSettings.fontSize}px)
                                </label>
                                <input
                                    id="barcode-fontSize"
                                    type="range"
                                    bind:value={barcodeSettings.fontSize}
                                    min="8"
                                    max="24"
                                    class="w-full"
                                />
                            </div>
                            <div>
                                <label
                                    for="barcode-margin"
                                    class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                                >
                                    ຂອບ ({barcodeSettings.margin}px)
                                </label>
                                <input
                                    id="barcode-margin"
                                    type="range"
                                    bind:value={barcodeSettings.margin}
                                    min="0"
                                    max="30"
                                    class="w-full"
                                />
                            </div>
                            <div>
                                <label
                                    for="barcode-font"
                                    class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                                >
                                    {t("barcode.fontStandard")}
                                </label>
                                <select
                                    id="barcode-font"
                                    bind:value={barcodeSettings.fontFamily}
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-2 px-3 text-gray-900 dark:text-white"
                                >
                                    <option value="monospace">Monospace (ມາດຕະຖານ)</option>
                                    <option value="'Libre Barcode 39', cursive">Libre Barcode 39</option>
                                    <option value="'Libre Barcode 128', cursive">Libre Barcode 128</option>
                                    <option value="'OCR-B', monospace">OCR-B</option>
                                    <option value="Consolas, monospace">Consolas</option>
                                    <option value="'Courier New', monospace">Courier New</option>
                                </select>
                            </div>
                            <div>
                                <label for="barcode-columns" class="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    {t("barcode.columns")} ({barcodeSettings.columns})
                                </label>
                                <input id="barcode-columns" type="range" bind:value={barcodeSettings.columns} min="1" max="6" step="1" class="w-full" />
                            </div>
                            <div class="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    bind:checked={barcodeSettings.showText}
                                    id="showText"
                                    class="rounded border-gray-300 dark:border-gray-600"
                                />
                                <label
                                    for="showText"
                                    class="text-sm text-gray-700 dark:text-gray-300"
                                >
                                    {t("barcode.showText")}
                                </label>
                            </div>
                            <div class="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    bind:checked={barcodeSettings.showProductName}
                                    id="showProductName"
                                    class="rounded border-gray-300 dark:border-gray-600"
                                />
                                <label
                                    for="showProductName"
                                    class="text-sm text-gray-700 dark:text-gray-300"
                                >
                                    ສະແດງຊື່ສິນຄ້າ
                                </label>
                            </div>
                            <div class="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    bind:checked={barcodeSettings.showPrice}
                                    id="showPrice"
                                    class="rounded border-gray-300 dark:border-gray-600"
                                />
                                <label
                                    for="showPrice"
                                    class="text-sm text-gray-700 dark:text-gray-300"
                                >
                                    ສະແດງລາຄາ
                                </label>
                            </div>
                            
                            <!-- Label Size -->
                            <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
                                <label
                                    for="label-size"
                                    class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                                >
                                    ຂະໜາດປ້າຍ
                                </label>
                                <select
                                    id="label-size"
                                    bind:value={selectedLabelSize}
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-2 px-3 text-gray-900 dark:text-white"
                                >
                                    {#each labelSizes as size (size.name)}
                                        <option value={size}>{size.name}</option>
                                    {/each}
                                </select>
                                {#if selectedLabelSize.type === "custom"}
                                    <div class="grid grid-cols-2 gap-2 mt-2">
                                        <div>
                                            <label class="block text-xs text-gray-500 mb-1">ກວ້າງ (mm)</label>
                                            <input
                                                type="number"
                                                bind:value={customLabelWidth}
                                                min="10"
                                                max="300"
                                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-1.5 px-2"
                                            />
                                        </div>
                                        <div>
                                            <label class="block text-xs text-gray-500 mb-1">ສູງ (mm)</label>
                                            <input
                                                type="number"
                                                bind:value={customLabelHeight}
                                                min="10"
                                                max="300"
                                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-1.5 px-2"
                                            />
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <div class="space-y-3">
                            <div>
                                <label
                                    for="qr-size"
                                    class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                                >
                                    {t("barcode.qrSize")} ({qrSettings.size}px)
                                </label>
                                <input
                                    id="qr-size"
                                    type="range"
                                    bind:value={qrSettings.size}
                                    min="100"
                                    max="400"
                                    step="50"
                                    class="w-full"
                                />
                            </div>
                            <div>
                                <label
                                    for="qr-error-correction"
                                    class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                                >
                                    {t("barcode.errorCorrection")}
                                </label>
                                <select
                                    id="qr-error-correction"
                                    bind:value={qrSettings.errorCorrection}
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-2 px-3 text-gray-900 dark:text-white"
                                >
                                    <option value="L">Low (7%)</option>
                                    <option value="M">Medium (15%)</option>
                                    <option value="Q">Quartile (25%)</option>
                                    <option value="H">High (30%)</option>
                                </select>
                            </div>
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Preview -->
            <div
                class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm"
            >
                <h3
                    class="text-sm font-semibold text-gray-900 dark:text-white mb-3"
                >
                    {t("barcode.preview")}
                </h3>
                <div
                    class="border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg p-4 flex items-center justify-center min-h-36"
                >
                    {#if selectedProducts.length === 0}
                        <p
                            class="text-sm text-gray-400 dark:text-gray-500 text-center"
                        >
                            {t("barcode.selectProductsToPreview")}
                        </p>
                    {:else}
                        {@const firstSelected = products.find(p => selectedProducts.includes(p.id))}
                        <div class="text-center">
                            {#if activeTab === "barcode"}
                                <div class="bg-white p-3 inline-block rounded">
                                    <div class="flex flex-col items-center">
                                        <!-- Real barcode display -->
                                        <div bind:this={previewBarcodeEl}></div>
                                        {#if !firstSelected?.barcode}
                                            <p class="text-xs text-gray-400 mt-1">ບໍ່ມີບາໂຄດ</p>
                                        {/if}
                                    </div>
                                </div>
                            {:else}
                                <div class="bg-white p-2 inline-block rounded">
                                    {#if previewQrDataUrl}
                                        <img src={previewQrDataUrl} alt="QR Code" class="mx-auto" style="width: {qrSettings.size * 0.5}px" />
                                    {:else}
                                        <p class="text-xs text-gray-400">ບໍ່ມີຂໍ້ມູນ QR</p>
                                    {/if}
                                </div>
                            {/if}
                            {#if firstSelected}
                                {#if barcodeSettings.showProductName || qrSettings.showProductName}
                                    <p class="text-sm font-medium mt-2">{firstSelected.name}</p>
                                {/if}
                                {#if barcodeSettings.showPrice || qrSettings.showPrice}
                                    <p class="text-lg font-bold text-primary-600">{formatCurrency(firstSelected.price)}</p>
                                {/if}
                            {/if}
                            <p
                                class="text-xs text-gray-500 dark:text-gray-400 mt-2"
                            >
                                {selectedProducts.length}
                                {t("barcode.itemsSelected")}
                            </p>
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Actions -->
            <div class="flex flex-col gap-2">
                <button
                    onclick={generateBarcodes}
                    disabled={selectedProducts.length === 0 || isGenerating}
                    class={cn(
                        "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                        "bg-primary-600 text-white hover:bg-primary-700",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                >
                    <Printer class="w-4 h-4" />
                    {t("barcode.print")}
                </button>
                <button
                    onclick={downloadLabels}
                    disabled={selectedProducts.length === 0 || isGenerating}
                    class={cn(
                        "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                        "border border-gray-300 dark:border-gray-600",
                        "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300",
                        "hover:bg-gray-50 dark:hover:bg-gray-600",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                >
                    <Download class="w-4 h-4" />
                    {t("barcode.downloadPDF")}
                </button>
            </div>
        </div>
    </div>
</div>

<!-- Print-only area: shows only barcodes with prices -->
<div class="print-area hidden print:block">
    <div class="grid grid-cols-3 gap-4 p-4">
        {#each getSelectedProductsData() as product (product.id)}
            <div class="border border-gray-300 p-4 rounded text-center bg-white print-barcode-item">
                {#if activeTab === "barcode"}
                    <!-- Real Barcode -->
                    <div class="flex flex-col items-center justify-center">
                        {#if product.barcode}
                            <svg 
                                class="barcode-svg"
                                data-barcode={product.barcode}
                                data-format={barcodeSettings.format}
                            ></svg>
                        {:else}
                            <p class="text-xs text-gray-400">ບໍ່ມີບາໂຄດ</p>
                        {/if}
                        {#if barcodeSettings.showText && product.barcode}
                            <p class="font-mono text-sm">{product.barcode}</p>
                        {/if}
                    </div>
                {:else}
                    <!-- QR Code -->
                    <div class="flex justify-center mb-2">
                        <canvas 
                            class="qrcode-canvas"
                            data-value={product.barcode || product.sku || product.id}
                        ></canvas>
                    </div>
                {/if}
                {#if barcodeSettings.showProductName || qrSettings.showProductName}
                    <p class="text-sm font-medium mt-2">{product.name}</p>
                {/if}
                {#if barcodeSettings.showPrice || qrSettings.showPrice}
                    <p class="text-lg font-bold text-primary-600">{formatCurrency(product.price)}</p>
                {/if}
            </div>
        {/each}
    </div>
</div>

<!-- SKU Modal -->
{#if showSkuModal}
    <div 
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" 
        onclick={closeSkuModal}
        onkeydown={(e) => e.key === 'Escape' && closeSkuModal()}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
            class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="document"
        >
            <!-- Header -->
            <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {editingSku ? t("barcode.editSku") : t("barcode.addSku")}
                </h2>
                <button
                    onclick={closeSkuModal}
                    class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    <X class="w-5 h-5 text-gray-500" />
                </button>
            </div>

            <!-- Form -->
            <div class="p-6 space-y-4">
                <!-- Product Dropdown -->
                <div>
                    <label for="sku-product" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t("barcode.product")} *
                    </label>
                    <select
                        id="sku-product"
                        bind:value={skuForm.productId}
                        onchange={(e) => {
                            const product = availableProducts.find(p => p.id === e.currentTarget.value);
                            if (product) selectProductForSku(product);
                        }}
                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2.5 px-3 text-gray-900 dark:text-white"
                    >
                        <option value="">{t("barcode.selectProduct")}</option>
                        {#each availableProducts as product (product.id)}
                            <option value={product.id}>{product.name}</option>
                        {/each}
                    </select>
                </div>

                <!-- SKU -->
                <div>
                    <label for="sku-code" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t("barcode.sku")} *
                    </label>
                    <div class="flex gap-2">
                        <select
                            id="sku-code"
                            bind:value={skuForm.sku}
                            class="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2.5 px-3 text-gray-900 dark:text-white"
                        >
                            <option value="">ເລືອກ SKU ຫຼື ພິມໃໝ່</option>
                            {#each skuList as sku (sku.sku)}
                                <option value={sku.sku}>{sku.sku} - {sku.productName}</option>
                            {/each}
                        </select>
                        <button
                            type="button"
                            onclick={async () => { skuForm.sku = await generateSkuFromAPI(); }}
                            class="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                            {t("barcode.generate")}
                        </button>
                    </div>
                    <input
                        type="text"
                        bind:value={skuForm.sku}
                        placeholder="ຫຼື ພິມ SKU ໃໝ່ ເຊັ່ນ: CF-001"
                        class="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 px-3 text-gray-900 dark:text-white placeholder-gray-400 text-sm"
                    />
                </div>

                <!-- Barcode Dropdown -->
                <div>
                    <label for="sku-barcode" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t("barcode.barcodeNumber")} *
                    </label>
                    <div class="flex gap-2">
                        <select
                            id="sku-barcode"
                            bind:value={skuForm.barcode}
                            class="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2.5 px-3 text-gray-900 dark:text-white"
                        >
                            <option value="">ເລືອກ Barcode ຫຼື ພິມໃໝ່</option>
                            {#each skuList as sku (sku.sku)}
                                {#if sku.barcode}
                                    <option value={sku.barcode}>{sku.barcode} - {sku.productName}</option>
                                {/if}
                            {/each}
                        </select>
                        <button
                            type="button"
                            disabled={isGeneratingBarcode}
                            onclick={async () => { 
                                isGeneratingBarcode = true;
                                skuForm.barcode = await generateBarcodeFromAPI();
                                isGeneratingBarcode = false;
                            }}
                            class="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50"
                        >
                            {#if isGeneratingBarcode}
                                <Loader2 class="w-4 h-4 animate-spin" />
                            {:else}
                                {t("barcode.generate")}
                            {/if}
                        </button>
                    </div>
                    <input
                        type="text"
                        bind:value={skuForm.barcode}
                        placeholder="ຫຼື ພິມ Barcode ໃໝ່ ເຊັ່ນ: 8858112900001"
                        class="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 px-3 text-gray-900 dark:text-white placeholder-gray-400 text-sm"
                    />
                </div>

                <!-- Price (readonly) -->
                <div>
                    <label for="sku-price" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t("barcode.price")}
                    </label>
                    <input
                        id="sku-price"
                        type="text"
                        value={formatCurrency(skuForm.price)}
                        readonly
                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-600 py-2.5 px-3 text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            <!-- Footer -->
            <div class="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={closeSkuModal}
                    class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    {t("common.cancel")}
                </button>
                <button
                    onclick={saveSku}
                    disabled={isSaving || !skuForm.sku || !skuForm.barcode}
                    class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {#if isSaving}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {/if}
                    {editingSku ? t("common.save") : t("common.create")}
                </button>
            </div>
        </div>
    </div>
{/if}
