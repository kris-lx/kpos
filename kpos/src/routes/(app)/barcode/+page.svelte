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
    import { isUsbPrintUnavailable, markUsbPrintUnavailable } from "$lib/utils/usbPrint";

    interface PrinterConfig {
        id: string;
        name?: string;
        type?: string;
        connectionType?: string;
        ipAddress?: string;
        port?: number;
        isDefault?: boolean;
        isActive?: boolean;
        paperWidth?: number;
        settings?: {
            cutPaper?: boolean;
            protocol?: "escpos" | "tspl";
            labelWidthMm?: number;
            labelHeightMm?: number;
            labelGapMm?: number;
        };
    }

    interface BarcodeProduct {
        id: string;
        name: string;
        sku: string;
        barcode: string;
        price: number;
        source?: "product" | "sku";
    }

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
        // Where the product name sits relative to the barcode/QR block —
        // shared across both tabs so the print layout and preview stay
        // consistent when switching between barcode/QR.
        namePosition: "top" as "top" | "bottom",
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

    // Products and printer config data
    let products = $state<BarcodeProduct[]>([]);
    let skuList = $state<any[]>([]);
    let printerConfigs = $state<PrinterConfig[]>([]);
    let configuredLabelPrinter = $state<PrinterConfig | null>(null);
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let isGeneratingBarcode = $state(false);

    // Print @page size must fit the FULL grid (columns x rows of labels), not
    // just a single label — otherwise the page is narrower than the grid and
    // the browser tiles the overflow onto extra pages even for a few labels.
    const PRINT_GRID_GAP_MM = 2; // matches .print-area's grid gap
    const PRINT_GRID_PADDING_MM = 2; // matches .print-area's grid padding
    let printLabelWidthMm = $derived(selectedLabelSize.type === "custom" ? customLabelWidth : selectedLabelSize.width);
    let printLabelHeightMm = $derived(selectedLabelSize.type === "custom" ? customLabelHeight : selectedLabelSize.height);
    let printLabelGapMm = $derived(configuredLabelPrinter?.settings?.labelGapMm ?? PRINT_GRID_GAP_MM);
    let printColumns = $derived(Math.max(1, barcodeSettings.columns));
    let printRows = $derived(Math.max(1, Math.ceil(selectedProducts.length / printColumns)));
    let printPageWidthMm = $derived(
        printLabelWidthMm * printColumns + printLabelGapMm * (printColumns - 1) + PRINT_GRID_PADDING_MM * 2
    );
    let printPageHeightMm = $derived(
        printLabelHeightMm * printRows + printLabelGapMm * (printRows - 1) + PRINT_GRID_PADDING_MM * 2
    );

    onMount(() => {
        loadProducts();
        loadAvailableData();
        loadPrinterConfig();
    });

    function moneyValue(value: unknown): number {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function normalizeProductForLabel(p: any): BarcodeProduct {
        return {
            id: String(p.id),
            name: String(p.name || p.productName || p.variant || "-"),
            sku: String(p.sku || ""),
            barcode: String(p.barcode || ""),
            price: moneyValue(p.salePrice ?? p.sellingPrice ?? p.price),
            source: p.source || "product",
        };
    }

    function normalizeSkuForLabel(sku: any): BarcodeProduct {
        const name = [sku.productName, sku.variant || sku.name].filter(Boolean).join(" - ");
        return {
            id: `sku:${sku.id}`,
            name: name || sku.productName || sku.name || "-",
            sku: String(sku.sku || ""),
            barcode: String(sku.barcode || ""),
            price: moneyValue(sku.sellingPrice ?? sku.price),
            source: "sku",
        };
    }

    function pickLabelPrinter(printers: PrinterConfig[]): PrinterConfig | null {
        const activePrinters = printers.filter((p) => p.isActive !== false);
        return (
            activePrinters.find((p) => p.type === "label" && p.isDefault) ||
            activePrinters.find((p) => p.type === "label") ||
            activePrinters.find((p) => p.isDefault) ||
            activePrinters[0] ||
            null
        );
    }

    function applyPrinterLabelSize(printer: PrinterConfig | null) {
        if (!printer || printer.type !== "label") return;
        const width = Number(printer.settings?.labelWidthMm ?? printer.paperWidth ?? 0);
        const height = Number(printer.settings?.labelHeightMm ?? 0);
        if (width <= 0 || height <= 0) return;

        const existing = labelSizes.find((size) => size.width === width && size.height === height);
        if (existing) {
            selectedLabelSize = existing;
            return;
        }

        customLabelWidth = width;
        customLabelHeight = height;
        selectedLabelSize = labelSizes[labelSizes.length - 1];
    }

    async function loadPrinterConfig() {
        try {
            const res = await api.get("settings/printers").json<any>();
            printerConfigs = res?.success ? (res.data || []) : [];
            configuredLabelPrinter = pickLabelPrinter(printerConfigs);
            applyPrinterLabelSize(configuredLabelPrinter);
        } catch {
            printerConfigs = [];
            configuredLabelPrinter = null;
        }
    }

    async function loadProducts() {
        isLoading = true;
        error = null;
        try {
            const [barcodeResponse, skuResponse] = await Promise.all([
                api.get("products/barcodes").json<any>(),
                api.get("products/skus?limit=500&status=active").json<any>().catch(() => null),
            ]);
            const productLabels = barcodeResponse?.success ? (barcodeResponse.data || []).map(normalizeProductForLabel) : [];
            const skuLabels = skuResponse?.success
                ? (skuResponse.data || []).filter((s: any) => s.barcode).map(normalizeSkuForLabel)
                : [];
            const merged = new Map<string, BarcodeProduct>();
            for (const item of [...productLabels, ...skuLabels]) {
                if (item.barcode) merged.set(`${item.source}:${item.id}`, item);
            }
            if (barcodeResponse?.success) {
                products = Array.from(merged.values());
                selectedProducts = selectedProducts.filter((id) => products.some((p) => p.id === id));
                error = null;
                return;
            }

            const response = await api.get("products?limit=200").json<any>();
            if (response.success && response.data) {
                products = response.data.map(normalizeProductForLabel).filter((p: BarcodeProduct) => p.barcode);
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

    // JsBarcode natively supports all of our format values (CODE128, EAN13,
    // EAN8, CODE39, UPC, ITF14, MSI, pharmacode) — pass through as-is instead
    // of remapping, and fall back to CODE128 (accepts any value) if the
    // chosen format rejects this specific barcode (e.g. wrong digit count).
    function renderBarcodeToSvg(svg: SVGElement, barcodeValue: string, format: string, opts: {
        width: number; height: number; displayValue: boolean; fontSize: number; margin: number;
    }, responsive = false) {
        const baseOptions = {
            width: opts.width,
            height: opts.height,
            displayValue: opts.displayValue,
            fontSize: opts.fontSize,
            margin: opts.margin,
        };
        try {
            JsBarcode(svg, barcodeValue, { format, ...baseOptions });
        } catch {
            try {
                JsBarcode(svg, barcodeValue, { format: "CODE128", ...baseOptions });
            } catch (fallbackError) {
                console.error("Failed to generate barcode:", fallbackError);
                return false;
            }
        }
        // Print-only: make the SVG scale responsively instead of being clipped
        // on small labels — add a viewBox from JsBarcode's own width/height and
        // let the print CSS (.barcode-svg) size it. The on-screen settings-panel
        // preview keeps JsBarcode's natural fixed pixel size (skips this), since
        // stripping width/height there has nothing to constrain it and the SVG
        // collapses to invisible inside its unconstrained flex container.
        if (responsive) {
            // getAttribute can return a CSS-unit string (e.g. "244px"), which is
            // not valid inside a viewBox — parseFloat strips the unit suffix.
            const w = parseFloat(svg.getAttribute("width") || "");
            const h = parseFloat(svg.getAttribute("height") || "");
            if (w > 0 && h > 0) {
                svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
                svg.removeAttribute("width");
                svg.removeAttribute("height");
            }
        }
        return true;
    }

    // Generate real barcode SVG
    function generateBarcodeSvg(barcodeValue: string, container: HTMLElement) {
        if (!barcodeValue || !container) return;
        container.innerHTML = "";
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        container.appendChild(svg);

        const ok = renderBarcodeToSvg(svg, barcodeValue, barcodeSettings.format, {
            width: barcodeSettings.width,
            height: barcodeSettings.height * 0.6,
            displayValue: barcodeSettings.showText,
            fontSize: barcodeSettings.fontSize,
            margin: barcodeSettings.margin,
        });
        if (!ok) {
            container.innerHTML = `<span class="text-danger-500 text-xs">Invalid barcode</span>`;
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

    // Stepper +/- for numeric settings (mirrors the range sliders alongside them)
    function stepSetting<T extends Record<string, any>>(store: T, field: keyof T, delta: number, min: number, max: number) {
        const next = Math.round((Number(store[field]) + delta) * 10) / 10;
        store[field] = Math.min(max, Math.max(min, next)) as T[keyof T];
    }

    // Svelte action: renders a small live barcode/QR thumbnail into a product
    // card without re-running the full print pipeline — reuses the same
    // JsBarcode helper as the settings-panel preview.
    function barcodeThumb(node: HTMLElement, product: BarcodeProduct) {
        function render(p: BarcodeProduct) {
            node.innerHTML = "";
            if (activeTab === "qrcode") {
                const value = p.barcode || p.sku || p.id;
                generateQrCodeDataUrl(value).then((url) => {
                    if (url) node.innerHTML = `<img src="${url}" class="w-10 h-10" alt="" />`;
                });
                return;
            }
            if (!p.barcode) return;
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            node.appendChild(svg);
            renderBarcodeToSvg(svg, p.barcode, barcodeSettings.format, {
                width: 1.2,
                height: 32,
                displayValue: false,
                fontSize: 8,
                margin: 0,
            });
        }
        render(product);
        return { update: render };
    }

    // Preview barcode element
    let previewBarcodeEl = $state<HTMLElement | null>(null);
    let previewQrDataUrl = $state("");
    let previewSelectedProduct = $derived(products.find(p => selectedProducts.includes(p.id)));

    // Update preview when selection or settings change — always renders
    // something (falls back to demo data) so the preview reflects style
    // changes live, even before a product is selected.
    const DEMO_BARCODE = "0000000000";
    $effect(() => {
        if (previewBarcodeEl && activeTab === "barcode") {
            const firstSelected = products.find(p => selectedProducts.includes(p.id));
            generateBarcodeSvg(firstSelected?.barcode || DEMO_BARCODE, previewBarcodeEl);
        }
    });

    $effect(() => {
        if (activeTab === "qrcode") {
            const firstSelected = products.find(p => selectedProducts.includes(p.id));
            const qrValue = firstSelected?.barcode || firstSelected?.sku || firstSelected?.id || "DEMO-0000";
            generateQrCodeDataUrl(qrValue).then(url => {
                previewQrDataUrl = url;
            });
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
                renderBarcodeToSvg(svg as unknown as SVGElement, barcodeValue, format, {
                    width: 2,
                    height: Math.round(barcodeSettings.height * 0.6),
                    displayValue: false,
                    fontSize: barcodeSettings.fontSize,
                    margin: 5,
                }, true);
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

    // ── Direct USB printing (bypasses the OS print dialog entirely) ────────────
    // ESC/POS "GS k" function-B barcode type codes (length-prefixed form).
    const ESC_POS_BARCODE_TYPE: Record<string, number> = {
        UPC: 65,     // UPC-A
        EAN13: 67,   // JAN13/EAN13
        EAN8: 68,    // JAN8/EAN8
        CODE39: 69,
        ITF14: 70,   // ITF
        CODE128: 73,
        // MSI and pharmacode have no widely-supported GS k code — fall back to CODE128
    };

    async function findConfiguredUsbPrinter(): Promise<PrinterConfig | null> {
        if (!configuredLabelPrinter) await loadPrinterConfig();
        const candidates = printerConfigs.filter((p) => p.connectionType === "usb" && p.isActive !== false);
        return pickLabelPrinter(candidates);
    }

    async function findConfiguredNetworkPrinter(): Promise<PrinterConfig | null> {
        if (!configuredLabelPrinter) await loadPrinterConfig();
        const candidates = printerConfigs.filter((p) => p.connectionType === "network" && p.isActive !== false);
        return pickLabelPrinter(candidates);
    }

    // Renders text to a 1-bit raster bitmap for ESC/POS's "GS v 0" raster
    // image command. Most clone thermal printers only ship Latin/CP437-style
    // codepages, so Lao product names sent as UTF-8 text bytes print as
    // blank or garbled glyphs — the browser already renders Lao correctly
    // (via canvas + system font), so we rasterize here and blit pixels
    // instead of relying on the printer's text/codepage support at all.
    function rasterizeTextForEscPos(text: string, maxWidthDots: number): { width: number; height: number; data: Uint8Array } | null {
        if (!text) return null;
        const canvas = document.createElement("canvas");
        const width = Math.max(8, Math.floor(maxWidthDots / 8) * 8); // widthBytes must be whole
        const height = 40;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#000";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        let fontSize = 28;
        ctx.font = `bold ${fontSize}px sans-serif`;
        while (ctx.measureText(text).width > width - 4 && fontSize > 10) {
            fontSize -= 2;
            ctx.font = `bold ${fontSize}px sans-serif`;
        }
        ctx.fillText(text, width / 2, height / 2, width - 4);

        const { data: pixels } = ctx.getImageData(0, 0, width, height);
        const widthBytes = width / 8;
        const data = new Uint8Array(widthBytes * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                // Luminance threshold — treat dark pixels (incl. anti-aliased
                // edges) as printed dots.
                const luminance = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
                const alpha = pixels[i + 3];
                if (luminance < 128 && alpha > 64) {
                    data[y * widthBytes + (x >> 3)] |= 0x80 >> (x % 8);
                }
            }
        }
        return { width, height, data };
    }

    function bytesToBase64(bytes: Uint8Array): string {
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function buildEscPosLabel(product: BarcodeProduct): Uint8Array {
        const ESC = 0x1b, GS = 0x1d;
        const chunks: number[][] = [];
        chunks.push([ESC, 0x40]); // initialize
        chunks.push([ESC, 0x61, 0x01]); // center align

        const showName = barcodeSettings.showProductName || qrSettings.showProductName;
        const maxWidthDots = Math.max(8, Math.round(printLabelWidthMm * 8) - 16);
        const nameRaster = showName ? rasterizeTextForEscPos(product.name || "", maxWidthDots) : null;
        const printName = () => {
            if (nameRaster) {
                const widthBytes = nameRaster.width / 8;
                chunks.push([
                    GS, 0x76, 0x30, 0x00,
                    widthBytes & 0xff, (widthBytes >> 8) & 0xff,
                    nameRaster.height & 0xff, (nameRaster.height >> 8) & 0xff,
                    ...Array.from(nameRaster.data),
                ]);
            } else {
                chunks.push([...new TextEncoder().encode(product.name || ""), 0x0a]);
            }
        };
        if (showName && barcodeSettings.namePosition === "top") printName();

        if (activeTab === "barcode" && product.barcode) {
            const typeCode = ESC_POS_BARCODE_TYPE[barcodeSettings.format] ?? ESC_POS_BARCODE_TYPE.CODE128;
            const data = Array.from(new TextEncoder().encode(product.barcode));
            chunks.push([GS, 0x68, Math.max(80, Math.round(barcodeSettings.height * 0.6))]); // barcode height (GS h) — floor of 80 dots (~10mm) so it stays scannable
            chunks.push([GS, 0x77, Math.max(2, Math.round(barcodeSettings.width))]); // module width (GS w)
            // Native HRI (GS H) is unreliable across clone firmware — some
            // units never render it even though the bars print fine. Disable
            // it and print the code ourselves as plain text below instead.
            chunks.push([GS, 0x48, 0x00]);
            chunks.push([GS, 0x6b, typeCode, data.length, ...data]); // GS k (function B)
        } else if (activeTab === "qrcode") {
            const value = product.barcode || product.sku || product.id || "";
            const data = Array.from(new TextEncoder().encode(value));
            const storeLen = data.length + 3;
            const pL = storeLen & 0xff, pH = (storeLen >> 8) & 0xff;
            chunks.push([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]); // model 2
            chunks.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]); // module size 6
            chunks.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]); // error correction M
            chunks.push([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...data]); // store data
            chunks.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]); // print stored QR
        }

        chunks.push([0x0a]); // feed line after code
        if (activeTab === "barcode" && barcodeSettings.showText && product.barcode) {
            chunks.push([...new TextEncoder().encode(product.barcode), 0x0a]);
        }
        if (showName && barcodeSettings.namePosition === "bottom") printName();
        if (barcodeSettings.showPrice || qrSettings.showPrice) {
            chunks.push([...new TextEncoder().encode(formatCurrency(product.price)), 0x0a]);
        }
        // Feed well past the print head before cutting — the cutting blade sits
        // physically below the print head (commonly 30-50mm on 58mm thermal
        // printers), so a short feed here cuts through content that hasn't
        // cleared the head yet, truncating the last printed line(s).
        chunks.push([0x0a, 0x0a, 0x0a, 0x0a, 0x0a]); // feed gap clear of the print head
        chunks.push([GS, 0x56, 0x41, 0x40]); // feed 64 more units, then partial cut

        return new Uint8Array(chunks.flat());
    }

    function tsplSafe(value: unknown): string {
        return String(value ?? "").replace(/"/g, "'");
    }

    function buildTsplLabel(product: BarcodeProduct): Uint8Array {
        const width = Math.max(10, Number(printLabelWidthMm) || 58);
        const height = Math.max(10, Number(printLabelHeightMm) || 30);
        const gap = Math.max(0, Number(printLabelGapMm) || 0);
        const code = tsplSafe(product.barcode || product.sku || product.id);
        const name = tsplSafe(product.name || "-").slice(0, 36);
        const price = tsplSafe(formatCurrency(product.price));
        const barcodeHeightDots = Math.max(80, Math.min(180, Math.round(barcodeSettings.height * 0.6)));
        const lines = [
            `SIZE ${width} mm,${height} mm`,
            `GAP ${gap} mm,0 mm`,
            "DIRECTION 1",
            "REFERENCE 0,0",
            "CLS",
        ];

        const showName = barcodeSettings.showProductName || qrSettings.showProductName;
        let codeY = activeTab === "qrcode" ? 20 : 16;
        if (showName && barcodeSettings.namePosition === "top") {
            lines.push(`TEXT 20,20,"0",0,1,1,"${name}"`);
            codeY += 24;
        }

        if (activeTab === "qrcode") {
            lines.push(`QRCODE 20,${codeY},L,4,A,0,"${code}"`);
        } else {
            lines.push(`BARCODE 20,${codeY},"128",${barcodeHeightDots},${barcodeSettings.showText ? 1 : 0},0,2,2,"${code}"`);
        }

        let textY = codeY + (activeTab === "qrcode" ? 90 : Math.min(160, 12 + barcodeHeightDots));
        if (showName && barcodeSettings.namePosition === "bottom") {
            lines.push(`TEXT 20,${textY},"0",0,1,1,"${name}"`);
            textY += 24;
        }
        if (barcodeSettings.showPrice || qrSettings.showPrice) {
            lines.push(`TEXT 20,${textY},"0",0,1,1,"${price}"`);
        }
        lines.push("PRINT 1,1", "");
        return new TextEncoder().encode(lines.join("\r\n"));
    }

    function buildRawLabel(product: BarcodeProduct, printer?: PrinterConfig | null): Uint8Array {
        return printer?.settings?.protocol === "tspl" ? buildTsplLabel(product) : buildEscPosLabel(product);
    }

    async function printViaNetworkPrinter(): Promise<boolean> {
        const printer = await findConfiguredNetworkPrinter();
        if (!printer) return false;

        const selectedData = getSelectedProductsData();
        if (selectedData.length === 0) return false;

        try {
            const res = await api.post(`settings/printers/${printer.id}/print-labels`, {
                json: {
                    type: activeTab,
                    barcodeFormat: barcodeSettings.format,
                    barcodeWidth: barcodeSettings.width,
                    barcodeHeight: Math.round(barcodeSettings.height * 0.6),
                    labelWidthMm: printLabelWidthMm,
                    labelHeightMm: printLabelHeightMm,
                    labelGapMm: printLabelGapMm,
                    showText: barcodeSettings.showText,
                    showProductName: activeTab === "barcode" ? barcodeSettings.showProductName : qrSettings.showProductName,
                    showPrice: activeTab === "barcode" ? barcodeSettings.showPrice : qrSettings.showPrice,
                    namePosition: barcodeSettings.namePosition,
                    cutPaper: printer.settings?.cutPaper ?? true,
                    labels: selectedData.map((p) => {
                        const showName = activeTab === "barcode" ? barcodeSettings.showProductName : qrSettings.showProductName;
                        const raster = showName
                            ? rasterizeTextForEscPos(p.name || "", Math.max(8, Math.round(printLabelWidthMm * 8) - 16))
                            : null;
                        return {
                            name: p.name,
                            sku: p.sku,
                            barcode: p.barcode,
                            price: p.price,
                            nameBitmap: raster
                                ? { width: raster.width, height: raster.height, data: bytesToBase64(raster.data) }
                                : undefined,
                        };
                    }),
                },
            }).json<any>();
            if (res?.success) return true;
            toast.error(res?.error?.message || t("printers.testFailed"));
        } catch (err: any) {
            toast.error(err?.message || t("printers.testFailed"));
        }
        return false;
    }

    async function printViaUsb(): Promise<boolean> {
        if (!("usb" in navigator)) return false;
        if (isUsbPrintUnavailable()) return false;
        if (configuredLabelPrinter?.connectionType === "windowsPrint") return false;
        const printerConfig = await findConfiguredUsbPrinter();
        if (!printerConfig) return false;

        // Never show the browser's USB device picker here — that "connection"
        // prompt belongs only to the one-time setup step (Settings → Printers
        // → Test Print). Reuse a device the user already authorized there; if
        // none exists yet, fall back to the print dialog instead of prompting
        // mid-print.
        const authorizedDevices = await (navigator as any).usb.getDevices();
        if (authorizedDevices.length === 0) return false;

        let device: any = authorizedDevices[0];
        try {
            await device.open();
            const config = device.configuration || (await device.selectConfiguration(1));
            const iface = config?.interfaces?.[0];
            if (!iface) throw new Error("No USB interface found");
            await device.claimInterface(iface.interfaceNumber);
            const ep = iface.alternate.endpoints.find((e: any) => e.direction === "out");
            if (!ep) throw new Error("No OUT endpoint found");

            for (const product of getSelectedProductsData()) {
                const payload = buildRawLabel(product, printerConfig);
                await device.transferOut(ep.endpointNumber, payload);
            }

            await device.releaseInterface(iface.interfaceNumber);
            await device.close();
            return true;
        } catch (err: any) {
            if (device) {
                try { await device.close(); } catch { /* already closed */ }
            }
            if (err?.name === "SecurityError") {
                // Windows has bound its own driver to this USB interface (or another
                // app has it open), blocking raw WebUSB access. This isn't fixable
                // from here — falls back to the OS print dialog below, and we stop
                // trying WebUSB for the rest of the session so the device picker
                // doesn't pop up again on every print click just to fail the same way.
                markUsbPrintUnavailable();
                console.warn("USB printer access denied by the OS/driver, falling back to print dialog:", err);
                toast.error(t("printers.usbAccessDenied"));
            } else {
                console.warn("Direct USB print failed, falling back to print dialog:", err);
            }
            return false;
        }
    }

    async function generateBarcodes() {
        if (selectedProducts.length === 0) {
            toast.error(t("barcode.selectProducts"));
            return;
        }
        isGenerating = true;

        try {
            const networkPrinted = await printViaNetworkPrinter().catch(() => false);
            if (networkPrinted) {
                toast.success(t("barcode.print"));
                return;
            }

            const printed = await printViaUsb().catch(() => false);
            if (printed) {
                toast.success(t("barcode.print"));
                return;
            }

            await generateBarcodesForPrint();
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
    {@html `<style>
        @media print {
            @page {
                size: ${
                    selectedLabelSize.type === 'a4' ? 'A4 portrait' :
                    printPageWidthMm + 'mm ' + printPageHeightMm + 'mm'
                };
                margin: ${selectedLabelSize.type === 'a4' ? '10mm' : '0mm'};
            }
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: ${printPageWidthMm}mm; }
            .no-print { display: none !important; }
            .print-barcode-item {
                ${selectedLabelSize.type !== 'a4' ?
                    'width:' + (selectedLabelSize.type === 'custom' ? customLabelWidth : selectedLabelSize.width) + 'mm !important;' +
                    'height:' + (selectedLabelSize.type === 'custom' ? customLabelHeight : selectedLabelSize.height) + 'mm !important;'
                    : ''}
                display: flex !important;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                page-break-inside: avoid;
                box-sizing: border-box;
                padding: 1mm !important;
            }
            /* Barcode/QR block scales to fill nearly the whole label, leaving
               just enough room below for name + price so text still fits
               without clipping. */
            .print-barcode-item > div {
                min-height: 0;
                flex-shrink: 1;
            }
            .print-barcode-item .barcode-svg {
                width: 100%;
                max-height: 72%;
                min-height: 0;
            }
            .print-barcode-item .qrcode-canvas {
                max-width: 80%;
                max-height: 72%;
                height: auto;
            }
            .print-barcode-item p {
                flex-shrink: 0;
                margin: 0;
                line-height: 1.1;
            }
        }
    </style>`}
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

            <!-- Products Grid -->
            <div class="p-4">
                {#if isLoading}
                    <div class="flex items-center justify-center py-12">
                        <Loader2 class="w-8 h-8 animate-spin text-primary-500" />
                    </div>
                {:else if error}
                    <div class="flex flex-col items-center justify-center py-12 text-center">
                        <AlertCircle class="w-12 h-12 text-danger-500 mb-3" />
                        <h3 class="text-lg font-semibold text-danger-700 dark:text-danger-400 mb-2">{t("common.error")}</h3>
                        <p class="text-danger-600 dark:text-danger-300 mb-4">{error}</p>
                        <button
                            onclick={() => loadProducts()}
                            class="flex items-center gap-2 px-4 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700 transition-colors"
                        >
                            <RefreshCw class="w-4 h-4" />
                            {t("common.retry")}
                        </button>
                    </div>
                {:else}
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {#each paginatedProducts as product (product.id)}
                        {@const selected = selectedProducts.includes(product.id)}
                        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                        <div
                            role="button"
                            tabindex="0"
                            onclick={() => toggleProduct(product.id)}
                            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProduct(product.id); } }}
                            class={cn(
                                "relative flex flex-col items-center text-center p-3 pt-6 rounded-xl border cursor-pointer transition-all",
                                selected
                                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500"
                                    : "border-gray-200 dark:border-gray-700 hover:border-primary-300 bg-white dark:bg-gray-800",
                            )}
                        >
                            <input
                                type="checkbox"
                                checked={selected}
                                onclick={(e) => e.stopPropagation()}
                                onchange={() => toggleProduct(product.id)}
                                class="absolute top-2 left-2 rounded border-gray-300 dark:border-gray-600"
                            />
                            <button
                                type="button"
                                onclick={(e) => { e.stopPropagation(); openSkuModal(product); }}
                                class="absolute top-2 right-2 text-[11px] text-primary-600 hover:text-primary-700 font-medium"
                            >
                                {t("common.edit")}
                            </button>
                            <p class="text-sm font-medium text-gray-900 dark:text-white truncate w-full">{product.name}</p>
                            <p class="text-[11px] text-gray-400 truncate w-full">{product.sku || "-"}</p>
                            <div class="h-8 flex items-center justify-center my-2 w-full" use:barcodeThumb={product}></div>
                            <p class="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(product.price)}</p>
                        </div>
                    {/each}
                </div>
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
            <!-- Live Preview -->
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                <div class="flex justify-center">
                    <div class="border border-gray-200 dark:border-gray-600 rounded-lg px-5 py-4 bg-white shadow-sm text-center min-w-[160px]">
                        {#if (barcodeSettings.showProductName || qrSettings.showProductName) && barcodeSettings.namePosition === "top"}
                            <p class="text-xs font-medium text-gray-700 mb-1 truncate max-w-[180px]">{previewSelectedProduct?.name || "ສິນຄ້າທົດສອບ"}</p>
                        {/if}
                        {#if activeTab === "barcode"}
                            <div class="flex flex-col items-center">
                                <div bind:this={previewBarcodeEl}></div>
                            </div>
                        {:else}
                            <div class="flex justify-center">
                                {#if previewQrDataUrl}
                                    <img src={previewQrDataUrl} alt="QR Code" class="mx-auto" style="width: 90px" />
                                {/if}
                            </div>
                        {/if}
                        {#if (barcodeSettings.showProductName || qrSettings.showProductName) && barcodeSettings.namePosition === "bottom"}
                            <p class="text-xs font-medium text-gray-700 mt-1 truncate max-w-[180px]">{previewSelectedProduct?.name || "ສິນຄ້າທົດສອບ"}</p>
                        {/if}
                        {#if barcodeSettings.showPrice || qrSettings.showPrice}
                            <p class="text-sm font-semibold text-primary-600 mt-1">{formatCurrency(previewSelectedProduct?.price ?? 100000)}</p>
                        {/if}
                    </div>
                </div>
                {#if selectedProducts.length > 0}
                    <p class="text-xs text-gray-400 text-center mt-3">
                        {selectedProducts.length} {t("barcode.itemsSelected")}
                    </p>
                {/if}
            </div>

            <!-- Paper / Label Profile -->
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                <div class="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
                    <FileText class="w-4 h-4 text-primary-600" />
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                        ກະດາດບາໂຄດ
                    </h3>
                </div>
                <label for="label-profile" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    ໂປຣໄຟລ໌
                </label>
                <select
                    id="label-profile"
                    bind:value={selectedLabelSize}
                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-2 px-3 text-gray-900 dark:text-white mb-3"
                >
                    {#each labelSizes as size (size.name)}
                        <option value={size}>{size.name}</option>
                    {/each}
                </select>
                {#if selectedLabelSize.type === "custom"}
                    <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1" for="paper-custom-width">
                        {t("barcode.customSize")} (ມມ.)
                    </label>
                    <div id="paper-custom-width" class="grid grid-cols-2 gap-2">
                        <div>
                            <label for="paper-w" class="block text-[11px] text-gray-400 mb-0.5">ກວ້າງ</label>
                            <input id="paper-w" type="number" bind:value={customLabelWidth} min="10" max="300"
                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-1.5 px-2 text-gray-900 dark:text-white" />
                        </div>
                        <div>
                            <label for="paper-h" class="block text-[11px] text-gray-400 mb-0.5">ສູງ</label>
                            <input id="paper-h" type="number" bind:value={customLabelHeight} min="10" max="300"
                                class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-1.5 px-2 text-gray-900 dark:text-white" />
                        </div>
                    </div>
                {:else}
                    <p class="text-xs text-gray-400">
                        {selectedLabelSize.width}×{selectedLabelSize.height} ມມ.
                    </p>
                {/if}
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
                                <div class="flex items-center justify-between mb-1">
                                    <label for="barcode-width" class="text-xs text-gray-600 dark:text-gray-400">
                                        ຄວາມກວ້າງເສັ້ນ <span class="text-gray-400">({barcodeSettings.width}px)</span>
                                    </label>
                                    <div class="flex items-center gap-1">
                                        <button type="button" onclick={() => stepSetting(barcodeSettings, 'width', -0.5, 1, 5)} class="w-6 h-6 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 leading-none">−</button>
                                        <button type="button" onclick={() => stepSetting(barcodeSettings, 'width', 0.5, 1, 5)} class="w-6 h-6 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 leading-none">+</button>
                                    </div>
                                </div>
                                <input id="barcode-width" type="range" bind:value={barcodeSettings.width} min="1" max="5" step="0.5" class="w-full accent-primary-600" />
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1">
                                    <label for="barcode-height" class="text-xs text-gray-600 dark:text-gray-400">
                                        {t("barcode.height")} <span class="text-gray-400">({barcodeSettings.height}px)</span>
                                    </label>
                                    <div class="flex items-center gap-1">
                                        <button type="button" onclick={() => stepSetting(barcodeSettings, 'height', -5, 30, 200)} class="w-6 h-6 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 leading-none">−</button>
                                        <button type="button" onclick={() => stepSetting(barcodeSettings, 'height', 5, 30, 200)} class="w-6 h-6 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 leading-none">+</button>
                                    </div>
                                </div>
                                <input id="barcode-height" type="range" bind:value={barcodeSettings.height} min="30" max="200" class="w-full accent-primary-600" />
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1">
                                    <label for="barcode-fontSize" class="text-xs text-gray-600 dark:text-gray-400">
                                        ຂະໜາດຕົວອັກສອນ <span class="text-gray-400">({barcodeSettings.fontSize}px)</span>
                                    </label>
                                    <div class="flex items-center gap-1">
                                        <button type="button" onclick={() => stepSetting(barcodeSettings, 'fontSize', -1, 8, 24)} class="w-6 h-6 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 leading-none">−</button>
                                        <button type="button" onclick={() => stepSetting(barcodeSettings, 'fontSize', 1, 8, 24)} class="w-6 h-6 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 leading-none">+</button>
                                    </div>
                                </div>
                                <input id="barcode-fontSize" type="range" bind:value={barcodeSettings.fontSize} min="8" max="24" class="w-full accent-primary-600" />
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1">
                                    <label for="barcode-margin" class="text-xs text-gray-600 dark:text-gray-400">
                                        ຂອບ <span class="text-gray-400">({barcodeSettings.margin}px)</span>
                                    </label>
                                    <div class="flex items-center gap-1">
                                        <button type="button" onclick={() => stepSetting(barcodeSettings, 'margin', -1, 0, 30)} class="w-6 h-6 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 leading-none">−</button>
                                        <button type="button" onclick={() => stepSetting(barcodeSettings, 'margin', 1, 0, 30)} class="w-6 h-6 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 leading-none">+</button>
                                    </div>
                                </div>
                                <input id="barcode-margin" type="range" bind:value={barcodeSettings.margin} min="0" max="30" class="w-full accent-primary-600" />
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
                                <div class="flex items-center justify-between mb-1">
                                    <label for="barcode-columns" class="text-xs text-gray-600 dark:text-gray-400">
                                        {t("barcode.columns")} <span class="text-gray-400">({barcodeSettings.columns})</span>
                                    </label>
                                    <div class="flex items-center gap-1">
                                        <button type="button" onclick={() => stepSetting(barcodeSettings, 'columns', -1, 1, 6)} class="w-6 h-6 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 leading-none">−</button>
                                        <button type="button" onclick={() => stepSetting(barcodeSettings, 'columns', 1, 1, 6)} class="w-6 h-6 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 leading-none">+</button>
                                    </div>
                                </div>
                                <input id="barcode-columns" type="range" bind:value={barcodeSettings.columns} min="1" max="6" step="1" class="w-full accent-primary-600" />
                            </div>

                            <!-- Toggle switches -->
                            <div class="grid grid-cols-3 gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                                <label class="flex flex-col items-center gap-1.5 cursor-pointer">
                                    <span class="text-xs text-gray-600 dark:text-gray-400 text-center">{t("barcode.showText")}</span>
                                    <span class="relative inline-flex items-center">
                                        <input type="checkbox" bind:checked={barcodeSettings.showText} class="peer sr-only" />
                                        <span class="w-9 h-5 rounded-full bg-gray-200 dark:bg-gray-600 peer-checked:bg-primary-600 transition-colors"></span>
                                        <span class="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"></span>
                                    </span>
                                </label>
                                <label class="flex flex-col items-center gap-1.5 cursor-pointer">
                                    <span class="text-xs text-gray-600 dark:text-gray-400 text-center">ຊື່ສິນຄ້າ</span>
                                    <span class="relative inline-flex items-center">
                                        <input type="checkbox" bind:checked={barcodeSettings.showProductName} class="peer sr-only" />
                                        <span class="w-9 h-5 rounded-full bg-gray-200 dark:bg-gray-600 peer-checked:bg-primary-600 transition-colors"></span>
                                        <span class="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"></span>
                                    </span>
                                </label>
                                <label class="flex flex-col items-center gap-1.5 cursor-pointer">
                                    <span class="text-xs text-gray-600 dark:text-gray-400 text-center">ລາຄາ</span>
                                    <span class="relative inline-flex items-center">
                                        <input type="checkbox" bind:checked={barcodeSettings.showPrice} class="peer sr-only" />
                                        <span class="w-9 h-5 rounded-full bg-gray-200 dark:bg-gray-600 peer-checked:bg-primary-600 transition-colors"></span>
                                        <span class="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"></span>
                                    </span>
                                </label>
                            </div>

                            <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
                                <label for="name-position" class="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    ຕໍາແໜ່ງຊື່ສິນຄ້າ
                                </label>
                                <select
                                    id="name-position"
                                    bind:value={barcodeSettings.namePosition}
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-2 px-3 text-gray-900 dark:text-white"
                                >
                                    <option value="top">ເທິງ (ຢູ່ເໜືອບາໂຄດ)</option>
                                    <option value="bottom">ລຸ່ມ (ຢູ່ໃຕ້ບາໂຄດ)</option>
                                </select>
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
                            <div>
                                <label for="name-position-qr" class="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    ຕໍາແໜ່ງຊື່ສິນຄ້າ
                                </label>
                                <select
                                    id="name-position-qr"
                                    bind:value={barcodeSettings.namePosition}
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm py-2 px-3 text-gray-900 dark:text-white"
                                >
                                    <option value="top">ເທິງ (ຢູ່ເໜືອ QR)</option>
                                    <option value="bottom">ລຸ່ມ (ຢູ່ໃຕ້ QR)</option>
                                </select>
                            </div>
                        </div>
                    {/if}
                </div>
            {/if}

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
    <div style="display:grid; grid-template-columns: repeat({barcodeSettings.columns}, {printLabelWidthMm}mm); gap: {printLabelGapMm}mm; padding: 2mm;">
        {#each getSelectedProductsData() as product (product.id)}
            <div class="border border-gray-300 p-1 rounded text-center bg-white print-barcode-item">
                {#if (barcodeSettings.showProductName || qrSettings.showProductName) && barcodeSettings.namePosition === "top"}
                    <p class="text-sm font-medium mb-2">{product.name}</p>
                {/if}
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
                {#if (barcodeSettings.showProductName || qrSettings.showProductName) && barcodeSettings.namePosition === "bottom"}
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
