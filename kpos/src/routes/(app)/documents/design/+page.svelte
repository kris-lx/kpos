<script lang="ts">
    import { onMount } from "svelte";
    import { cn } from "$utils";
    import { api } from "$api";
    import QRCode from 'qrcode';
    import { t } from "$lib/i18n/index.svelte";
    import { toast } from "svelte-sonner";
    import { tenantSettings } from "$lib/stores/settings.svelte";
    import {
        Save,
        Eye,
        Printer,
        Trash2,
        Image,
        Type,
        AlignLeft,
        AlignCenter,
        AlignRight,
        Bold,
        Italic,
        Settings,
        FileText,
        QrCode,
        Barcode,
        Minus,
        Table,
        LayoutTemplate,
        X,
        Palette,
        ChevronDown,
        ChevronUp,
    } from "lucide-svelte";

    // Receipt paper sizes
    const paperSizes = [
        { id: "58mm", name: "58mm", width: 48, unit: "mm" },
        { id: "80mm", name: "80mm", width: 72, unit: "mm" },
        { id: "A4", name: "A4", width: 210, unit: "mm" },
    ];

    // Available elements for drag & drop
    const availableElements = [
        { type: "logo", name: "Logo", icon: Image },
        { type: "text", name: "ຂໍ້ຄວາມ", icon: Type },
        { type: "storeName", name: "ຊື່ຮ້ານ", icon: FileText },
        { type: "address", name: "ທີ່ຢູ່", icon: FileText },
        { type: "phone", name: "ເບີໂທ", icon: FileText },
        { type: "taxId", name: "ເລກທະບຽນພາສີ", icon: FileText },
        { type: "website", name: "ເວັບໄຊ", icon: FileText },
        { type: "divider", name: "ເສັ້ນແບ່ງ", icon: Minus },
        { type: "date", name: "ວັນທີ/ເວລາ", icon: FileText },
        { type: "receiptNo", name: "ເລກທີບິນ", icon: FileText },
        { type: "cashier", name: "ພະນັກງານ", icon: FileText },
        { type: "customer", name: "ຂໍ້ມູນລູກຄ້າ", icon: FileText },
        { type: "tableNo", name: "ເລກໂຕະ", icon: FileText },
        { type: "items", name: "ລາຍການສິນຄ້າ", icon: Table },
        { type: "subtotal", name: "ລວມ", icon: FileText },
        { type: "discount", name: "ສ່ວນຫຼຸດ", icon: FileText },
        { type: "tax", name: "ພາສີ (VAT)", icon: FileText },
        { type: "rounding", name: "ປັດຈຳນວນ", icon: FileText },
        { type: "total", name: "ຍອດຊຳລະ", icon: FileText },
        { type: "received", name: "ຈ່າຍມາ", icon: FileText },
        { type: "payment", name: "ວິທີຊຳລະ", icon: FileText },
        { type: "change", name: "ເງິນທອນ", icon: FileText },
        { type: "qrcode", name: "QR Code", icon: QrCode },
        { type: "barcode", name: "Barcode", icon: Barcode },
        { type: "signature", name: "ລາຍເຊັນ", icon: FileText },
        { type: "footer", name: "ຂໍ້ຄວາມລຸ່ມ", icon: Type },
    ];

    // Receipt settings (loaded from API — used in preview/print)
    interface ReceiptSettings {
        branchName?: string;
        branchLogo?: string;
        branchAddress?: string;
        branchPhone?: string;
        branchTaxId?: string;
        footerText?: string;
        showLogo?: boolean;
        primaryColor?: string;
        paperSize?: string;
    }
    let receiptSettings = $state<ReceiptSettings>({});
    let receiptSettingsForm = $state({ footerText: '', showLogo: true, primaryColor: '#3b82f6' });

    // QR code data URL cache (generated on-demand)
    let qrDataUrl = $state<string>('');
    let qrFormat = $state<'iso' | 'emvco'>('iso');
    // Pre-populate from tenant settings (loaded from DB via settings store)
    let emvcoMerchantCode = $state<string>(tenantSettings.qrMerchantCode);
    let qrUploadedImageUrl = $state<string>('');
    const QR_PREVIEW_TEXT = 'https://kpos.example.com/receipt/preview';

    // EMVco TLV (Tag-Length-Value) encoding
    function encodeTLV(tag: string, value: string): string {
        const length = value.length.toString(16).padStart(2, '0').toUpperCase();
        return tag + length + value;
    }

    // Generate EMVco compliant QR code payload
    function generateEMVcoPayload(data: {
        merchantAccount?: string;
        amount?: number;
        currency?: string;
        transactionId?: string;
    }): string {
        // Payload Format Indicator (ID 00)
        const payloadFormat = encodeTLV('00', '01');
        
        // Point of Initiation Method (ID 01) - 11 = Static, 12 = Dynamic
        const poiMethod = encodeTLV('01', '12');
        
        // Merchant Account Information (ID 26-51)
        const merchantInfo = encodeTLV('26', data.merchantAccount || '00020101021226580016TH.PROMPTPAY011511234567890352034005802TH530376454541612.34545802TH5910TEST STORE6007BANGKOK6304');
        
        // Transaction Currency (ID 53) — from tenant settings
        const currCode = data.currency || tenantSettings.qrCurrencyCode || tenantSettings.currencyIsoCode;
        const currency = encodeTLV('53', currCode);

        // Transaction Amount (ID 54)
        const amount = data.amount ? encodeTLV('54', data.amount.toFixed(2)) : '';

        // Tip or Convenience Fee Indicator (ID 55)
        const tipIndicator = encodeTLV('55', '02');

        // Transaction Currency (ID 56) — same as main currency
        const tipCurrency = encodeTLV('56', currCode);
        
        // Tip or Convenience Fee Amount (ID 57)
        const tipAmount = encodeTLV('57', '0.00');
        
        // Country Code (ID 58) — from tenant settings
        const countryCode = encodeTLV('58', tenantSettings.config.country || 'LA');

        // Merchant Name (ID 59)
        const merchantName = encodeTLV('59', data.merchantAccount?.split(':')[0] || 'STORE');

        // Merchant City (ID 60) — generic placeholder
        const merchantCity = encodeTLV('60', 'VIENTIANE');

        // Postal Code (ID 61)
        const postalCode = encodeTLV('61', '01000');
        
        // Additional Data Field Template (ID 62)
        const additionalData = encodeTLV('62', data.transactionId ? encodeTLV('05', data.transactionId) : '');
        
        // CRC (ID 63) - CRC16-CCITT
        const payloadWithoutCrc = payloadFormat + poiMethod + merchantInfo + currency + amount + tipIndicator + tipCurrency + tipAmount + countryCode + merchantName + merchantCity + postalCode + additionalData;
        const crc = calculateCRC16(payloadWithoutCrc);
        const crcField = encodeTLV('63', crc);
        
        return payloadWithoutCrc + crcField;
    }

    // CRC16-CCITT calculation for EMVco
    function calculateCRC16(data: string): string {
        let crc = 0xFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= data.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) {
                if ((crc & 0x8000) !== 0) {
                    crc = (crc << 1) ^ 0x1021;
                } else {
                    crc = crc << 1;
                }
            }
        }
        return (crc & 0xFFFF).toString(16).padStart(4, '0').toUpperCase();
    }

    async function generateQrPreview(text: string = QR_PREVIEW_TEXT) {
        try {
            let qrData = text;
            if (qrFormat === 'emvco') {
                if (!emvcoMerchantCode.trim()) {
                    // No merchant code — use uploaded image or blank
                    qrDataUrl = qrUploadedImageUrl;
                    return;
                }
                qrData = generateEMVcoPayload({
                    merchantAccount: emvcoMerchantCode.trim(),
                    currency: tenantSettings.qrCurrencyCode || tenantSettings.currencyIsoCode,
                });
            }
            qrDataUrl = await QRCode.toDataURL(qrData, { width: 80, margin: 1, errorCorrectionLevel: 'M' });
        } catch { qrDataUrl = ''; }
    }

    async function handleQrImageUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            qrUploadedImageUrl = reader.result as string;
            qrDataUrl = qrUploadedImageUrl;
        };
        reader.readAsDataURL(file);
    }

    $effect(() => { generateQrPreview(); });

    // Receipt design state
    let selectedPaperSize = $state("80mm");
    let selectedElementId = $state<string | null>(null);
    let showPreview = $state(false);
    let showTemplateModal = $state(false);
    let showReceiptSettings = $state(false);

    // Elements on the receipt
    let receiptElements = $state([
        {
            id: "1",
            type: "logo",
            content: "",
            align: "center",
            fontSize: 14,
            bold: false,
            italic: false,
        },
        {
            id: "2",
            type: "storeName",
            content: "{{storeName}}",
            align: "center",
            fontSize: 18,
            bold: true,
            italic: false,
        },
        {
            id: "3",
            type: "address",
            content: "{{address}}",
            align: "center",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "4",
            type: "phone",
            content: "{{phone}}",
            align: "center",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "5",
            type: "divider",
            content: "-",
            align: "center",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "6",
            type: "date",
            content: "{{date}} {{time}}",
            align: "left",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "7",
            type: "receiptNo",
            content: "ເລກທີ: {{receiptNo}}",
            align: "left",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "8",
            type: "cashier",
            content: "ພະນັກງານ: {{cashier}}",
            align: "left",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "9",
            type: "divider",
            content: "=",
            align: "center",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "10",
            type: "items",
            content: "",
            align: "left",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "11",
            type: "divider",
            content: "-",
            align: "center",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "12",
            type: "subtotal",
            content: "ລວມ: {{subtotal}}",
            align: "right",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "13",
            type: "discount",
            content: "ສ່ວນຫຼຸດ: -{{discount}}",
            align: "right",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "14",
            type: "tax",
            content: "ພາສີ (VAT 7%): {{tax}}",
            align: "right",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "15",
            type: "divider",
            content: "=",
            align: "center",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "16",
            type: "total",
            content: "ຍອດຊຳລະ: {{total}}",
            align: "right",
            fontSize: 16,
            bold: true,
            italic: false,
        },
        {
            id: "17",
            type: "divider",
            content: "-",
            align: "center",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "18",
            type: "payment",
            content: "ຊຳລະໂດຍ: {{paymentMethod}}",
            align: "left",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "19",
            type: "change",
            content: "ເງິນທອນ: {{change}}",
            align: "left",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "20",
            type: "divider",
            content: "-",
            align: "center",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "21",
            type: "footer",
            content: "ຂອບໃຈທີ່ໃຊ້ບໍລິການ",
            align: "center",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "22",
            type: "qrcode",
            content: "{{qrcode}}",
            align: "center",
            fontSize: 12,
            bold: false,
            italic: false,
        },
    ]);

    // Sample data for preview
    const sampleData = {
        date: "29/01/2026",
        time: "14:30:25",
        receiptNo: "RC-2026012900001",
        cashier: "ສົມສັກ",
        customer: "ທ. ວິໄລ 020-1234-5678",
        tableNo: "T-05",
        taxId: "0101234567890",
        website: "www.kpos.la",
        items: [
            { name: "ກາເຟລາວ", qty: 2, price: 25000, total: 50000 },
            { name: "ເຂົ້າໜຽວໝູປີ້ງ", qty: 1, price: 35000, total: 35000 },
            { name: "ນ້ຳແຂງກະທິ", qty: 1, price: 20000, total: 20000 },
        ],
        subtotal: 105000,
        discount: 5000,
        tax: 7000,
        rounding: -100,
        total: 107000,
        paymentMethod: "ເງິນສົດ",
        received: 110000,
        change: 3000,
    };

    function getSelectedElement() {
        return receiptElements.find((el) => el.id === selectedElementId);
    }

    function addElement(type: string) {
        const newElement = {
            id: Date.now().toString(),
            type,
            content: type === "text" ? "ຂໍ້ຄວາມໃໝ່" : "",
            align: "left" as const,
            fontSize: 12,
            bold: false,
            italic: false,
        };
        receiptElements = [...receiptElements, newElement];
        selectedElementId = newElement.id;
    }

    function removeElement(id: string) {
        receiptElements = receiptElements.filter((el) => el.id !== id);
        if (selectedElementId === id) {
            selectedElementId = null;
        }
    }

    function moveElement(id: string, direction: "up" | "down") {
        const index = receiptElements.findIndex((el) => el.id === id);
        if (index === -1) return;

        const newIndex = direction === "up" ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= receiptElements.length) return;

        const newElements = [...receiptElements];
        [newElements[index], newElements[newIndex]] = [
            newElements[newIndex],
            newElements[index],
        ];
        receiptElements = newElements;
    }

    function updateElement(
        id: string,
        updates: Partial<(typeof receiptElements)[0]>,
    ) {
        receiptElements = receiptElements.map((el) =>
            el.id === id ? { ...el, ...updates } : el,
        );
    }

    function formatCurrency(amount: number): string {
        return new Intl.NumberFormat("lo-LA").format(amount) + "₭";
    }

    function renderContent(element: (typeof receiptElements)[0]): string {
        let content = element.content;
        const storeName = receiptSettings.branchName || '';
        const address = receiptSettings.branchAddress || '';
        const phone = receiptSettings.branchPhone || '';
        const taxId = receiptSettings.branchTaxId || sampleData.taxId;
        // For typed elements that render static branch info
        if (element.type === 'storeName') return storeName;
        if (element.type === 'address') return address;
        if (element.type === 'phone') return phone;
        if (element.type === 'taxId') return taxId;
        if (element.type === 'website') return receiptSettings.branchName ? '' : sampleData.website;
        // Replace {{tokens}}
        content = content.replace("{{storeName}}", storeName);
        content = content.replace("{{address}}", address);
        content = content.replace("{{phone}}", phone);
        content = content.replace("{{taxId}}", taxId);
        content = content.replace("{{date}}", sampleData.date);
        content = content.replace("{{time}}", sampleData.time);
        content = content.replace("{{receiptNo}}", sampleData.receiptNo);
        content = content.replace("{{cashier}}", sampleData.cashier);
        content = content.replace("{{customer}}", sampleData.customer);
        content = content.replace("{{tableNo}}", sampleData.tableNo);
        content = content.replace("{{website}}", sampleData.website);
        content = content.replace("{{subtotal}}", formatCurrency(sampleData.subtotal));
        content = content.replace("{{discount}}", formatCurrency(sampleData.discount));
        content = content.replace("{{tax}}", formatCurrency(sampleData.tax));
        content = content.replace("{{rounding}}", formatCurrency(sampleData.rounding));
        content = content.replace("{{total}}", formatCurrency(sampleData.total));
        content = content.replace("{{received}}", formatCurrency(sampleData.received));
        content = content.replace("{{paymentMethod}}", sampleData.paymentMethod);
        content = content.replace("{{change}}", formatCurrency(sampleData.change));
        return content;
    }

    async function saveDesign() {
        try {
            const design = {
                paperSize: selectedPaperSize,
                elements: receiptElements,
            };
            localStorage.setItem("kpos_receipt_design", JSON.stringify(design));
            await api.put('settings/receipt/design', { json: { value: design } }).json();
            // Also save receipt display settings
            await api.put('settings/receipt', { json: {
                footerText: receiptSettingsForm.footerText,
                showLogo: receiptSettingsForm.showLogo,
                primaryColor: receiptSettingsForm.primaryColor,
                paperSize: selectedPaperSize,
            } }).json().catch(() => {});
            toast.success("ບັນທຶກສຳເລັດ!");
        } catch (e) {
            console.error("Failed to save design:", e);
            toast.error("ບັນທຶກບໍສຳເລັດ");
        }
    }

    async function loadDesign() {
        // Try API first for cross-device sync
        try {
            const res = await api.get('settings/receipt/design').json<{ success: boolean; data: { paperSize?: string; elements?: any[] } | null }>();
            if (res.success && res.data?.elements?.length) {
                if (res.data.paperSize) selectedPaperSize = res.data.paperSize;
                receiptElements = res.data.elements;
                return;
            }
        } catch { /* fallback to localStorage */ }
        try {
            const saved = localStorage.getItem("kpos_receipt_design");
            if (saved) {
                const design = JSON.parse(saved);
                if (design.paperSize) selectedPaperSize = design.paperSize;
                if (design.elements?.length) receiptElements = design.elements;
            }
        } catch {}
    }

    // Load saved design and receipt settings on mount
    onMount(async () => {
        await loadDesign();
        try {
            const res = await api.get('settings/receipt').json<{ success: boolean; data: ReceiptSettings & { footerText?: string; showLogo?: boolean; primaryColor?: string } }>();
            if (res.success && res.data) {
                receiptSettings = res.data;
                receiptSettingsForm = {
                    footerText: res.data.footerText ?? 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ!',
                    showLogo: res.data.showLogo !== false,
                    primaryColor: res.data.primaryColor ?? '#3b82f6',
                };
                if (res.data.paperSize) selectedPaperSize = res.data.paperSize;
            }
        } catch {}
    });

    // ── Preset Templates ──
    function makeId() { return Date.now().toString() + Math.random().toString(36).slice(2, 6); }

    const presetTemplates = [
        {
            id: 'basic',
            name: 'ພື້ນຖານ (Basic)',
            desc: 'ໂລໂກ້, ຊື່ຮ້ານ, ລາຍການ, ຍອດລວມ',
            paperSize: '80mm',
            elements: () => [
                { id: makeId(), type: 'logo',      content: '',                         align: 'center', fontSize: 14, bold: false, italic: false },
                { id: makeId(), type: 'storeName', content: '',                         align: 'center', fontSize: 16, bold: true,  italic: false },
                { id: makeId(), type: 'divider',   content: '-',                        align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'date',      content: '{{date}} {{time}}',        align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'receiptNo', content: 'ເລກທີ: {{receiptNo}}',   align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '=',                        align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'items',     content: '',                         align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '-',                        align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'total',     content: 'ຍອດຊຳລະ: {{total}}',    align: 'right',  fontSize: 16, bold: true,  italic: false },
                { id: makeId(), type: 'divider',   content: '-',                        align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'footer',    content: 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ',   align: 'center', fontSize: 12, bold: false, italic: false },
            ],
        },
        {
            id: 'detailed',
            name: 'ລະອຽດ (Detailed)',
            desc: 'ຂໍ້ມູນຄົບຖ້ວນ: ໂລໂກ້, ທີ່ຢູ່, ພາສີ, QR Code',
            paperSize: '80mm',
            elements: () => [
                { id: makeId(), type: 'logo',      content: '',                             align: 'center', fontSize: 14, bold: false, italic: false },
                { id: makeId(), type: 'storeName', content: '',                             align: 'center', fontSize: 16, bold: true,  italic: false },
                { id: makeId(), type: 'address',   content: '',                             align: 'center', fontSize: 11, bold: false, italic: false },
                { id: makeId(), type: 'phone',     content: '',                             align: 'center', fontSize: 11, bold: false, italic: false },
                { id: makeId(), type: 'taxId',     content: '',                             align: 'center', fontSize: 11, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '-',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'date',      content: '{{date}} {{time}}',            align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'receiptNo', content: 'ເລກທີ: {{receiptNo}}',       align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'cashier',   content: 'ພະນັກງານ: {{cashier}}',     align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'customer',  content: 'ລູກຄ້າ: {{customer}}',       align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '=',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'items',     content: '',                             align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '-',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'subtotal',  content: 'ລວມ: {{subtotal}}',           align: 'right',  fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'discount',  content: 'ສ່ວນຫຼຸດ: -{{discount}}',  align: 'right',  fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'tax',       content: 'ພາສີ (VAT): {{tax}}',        align: 'right',  fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '=',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'total',     content: 'ຍອດຊຳລະ: {{total}}',        align: 'right',  fontSize: 16, bold: true,  italic: false },
                { id: makeId(), type: 'divider',   content: '-',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'payment',   content: 'ຊຳລະໂດຍ: {{paymentMethod}}', align: 'left',  fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'received',  content: 'ຈ່າຍມາ: {{received}}',       align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'change',    content: 'ເງິນທອນ: {{change}}',        align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '-',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'qrcode',    content: '{{qrcode}}',                  align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'footer',    content: 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ',       align: 'center', fontSize: 12, bold: false, italic: false },
            ],
        },
        {
            id: 'restaurant',
            name: 'ຮ້ານອາຫານ (Restaurant)',
            desc: 'ລວມເລກໂຕະ ສຳລັບຮ້ານອາຫານ',
            paperSize: '80mm',
            elements: () => [
                { id: makeId(), type: 'logo',      content: '',                             align: 'center', fontSize: 14, bold: false, italic: false },
                { id: makeId(), type: 'storeName', content: '',                             align: 'center', fontSize: 16, bold: true,  italic: false },
                { id: makeId(), type: 'address',   content: '',                             align: 'center', fontSize: 11, bold: false, italic: false },
                { id: makeId(), type: 'phone',     content: '',                             align: 'center', fontSize: 11, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '=',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'tableNo',   content: 'ໂຕະ: {{tableNo}}',            align: 'center', fontSize: 14, bold: true,  italic: false },
                { id: makeId(), type: 'date',      content: '{{date}} {{time}}',            align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'receiptNo', content: 'ເລກທີ: {{receiptNo}}',       align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'cashier',   content: 'ພະນັກງານ: {{cashier}}',     align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '=',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'items',     content: '',                             align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '-',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'subtotal',  content: 'ລວມ: {{subtotal}}',           align: 'right',  fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'discount',  content: 'ສ່ວນຫຼຸດ: -{{discount}}',  align: 'right',  fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'tax',       content: 'ພາສີ: {{tax}}',               align: 'right',  fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '=',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'total',     content: 'ຍອດຊຳລະ: {{total}}',        align: 'right',  fontSize: 16, bold: true,  italic: false },
                { id: makeId(), type: 'divider',   content: '-',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'payment',   content: 'ຊຳລະໂດຍ: {{paymentMethod}}', align: 'left',  fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'change',    content: 'ເງິນທອນ: {{change}}',        align: 'left',   fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'divider',   content: '-',                            align: 'center', fontSize: 12, bold: false, italic: false },
                { id: makeId(), type: 'footer',    content: 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ',       align: 'center', fontSize: 12, bold: false, italic: false },
            ],
        },
    ];

    function applyPreset(preset: typeof presetTemplates[0]) {
        receiptElements = preset.elements();
        selectedPaperSize = preset.paperSize;
        selectedElementId = null;
        showTemplateModal = false;
        toast.success(`ໂຕິໝາຍ "${preset.name}" ຖືກໂຫຼດສຳເລັດ`);
    }

    const paperWidth = $derived(
        paperSizes.find((p) => p.id === selectedPaperSize)?.width || 72,
    );

    function printReceipt() {
        const storeName = receiptSettings.branchName || '';
        const logoUrl = receiptSettings.branchLogo || '';
        const address = receiptSettings.branchAddress || '';
        const phone = receiptSettings.branchPhone || '';
        const taxId = receiptSettings.branchTaxId || sampleData.taxId;
        const pw = paperWidth * 3;
        const cssRules = [
            `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Lao&display=swap')`,
            `body{margin:0;padding:8px;font-family:'Noto Sans Lao','Courier New',monospace;width:${pw}px}`,
            `.divider{text-align:center;overflow:hidden}.item-row{display:flex;justify-content:space-between}`,
            `.center{text-align:center}.right{text-align:right}.left{text-align:left}`,
            `.bold{font-weight:bold}.italic{font-style:italic}`,
            `.qr,.barcode,.logo{display:flex;justify-content:center;padding:8px 0}`,
            `.qr-box{width:80px;height:80px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:10px}`,
            `.barcode-box{width:120px;height:40px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:10px}`,
            `.logo-box{width:64px;height:64px;background:#eee;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px}`,
        ].join(';');
        let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ທົດສອບໃບບິນ</title>` +
            `<` + `style>${cssRules}<` + `/style></head><body>`;

        for (const el of receiptElements) {
            const fs = el.fontSize;
            const cls = [el.align, el.bold ? 'bold' : '', el.italic ? 'italic' : ''].filter(Boolean).join(' ');
            if (el.type === 'divider') {
                html += `<div class="divider" style="font-size:${fs}px">${el.content.repeat(50)}</div>`;
            } else if (el.type === 'items') {
                for (const item of sampleData.items) {
                    html += `<div class="item-row" style="font-size:${fs}px"><span>${item.name} x${item.qty}</span><span>${formatCurrency(item.total)}</span></div>`;
                }
            } else if (el.type === 'logo') {
                html += logoUrl
                    ? `<div class="logo"><img src="${logoUrl}" style="max-width:80px;max-height:80px;object-fit:contain" alt="Logo"/></div>`
                    : `<div class="logo"><div class="logo-box">LOGO</div></div>`;
            } else if (el.type === 'qrcode') {
                const qrSrc = qrDataUrl || '';
                html += qrSrc
                    ? `<div class="qr"><img src="${qrSrc}" style="width:80px;height:80px" alt="QR Code"/></div>`
                    : `<div class="qr"><div class="qr-box">QR Code</div></div>`;
            } else if (el.type === 'barcode') {
                html += `<div class="barcode"><div class="barcode-box">Barcode</div></div>`;
            } else if (el.type === 'storeName') {
                html += `<div class="${cls}" style="font-size:${fs}px">${storeName}</div>`;
            } else if (el.type === 'address') {
                html += `<div class="${cls}" style="font-size:${fs}px">${address}</div>`;
            } else if (el.type === 'phone') {
                html += `<div class="${cls}" style="font-size:${fs}px">${phone}</div>`;
            } else if (el.type === 'taxId') {
                html += `<div class="${cls}" style="font-size:${fs}px">${taxId}</div>`;
            } else {
                html += `<div class="${cls}" style="font-size:${fs}px">${renderContent(el)}</div>`;
            }
        }

        html += `</body></html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank', `width=${pw + 40},height=600`);
        if (w) w.onload = () => { w.print(); };
    }

</script>

<div class="min-h-screen bg-gray-100 dark:bg-gray-950">
    <!-- Toolbar -->
    <div
        class="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3"
    >
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
                <h1 class="text-xl font-bold text-gray-900 dark:text-white">
                    ອອກແບບໃບບິນ
                </h1>

                <!-- Paper Size -->
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-500 dark:text-gray-400"
                        >ຂະໜາດ:</span
                    >
                    <select
                        bind:value={selectedPaperSize}
                        class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-1.5 text-gray-900 dark:text-white"
                    >
                        {#each paperSizes as size (size.id)}
                            <option value={size.id}>{size.name}</option>
                        {/each}
                    </select>
                </div>
            </div>

            <div class="flex items-center gap-2">
                <button
                    onclick={() => (showTemplateModal = true)}
                    class="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
                >
                    <LayoutTemplate class="w-4 h-4" />
                    ໂຕິໝາຍ
                </button>
                <button
                    onclick={() => (showPreview = !showPreview)}
                    class={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        showPreview
                            ? "bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
                    )}
                >
                    <Eye class="w-4 h-4" />
                    ເບິ່ງຕົວຢ່າງ
                </button>
                <button
                    onclick={printReceipt}
                    class="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
                >
                    <Printer class="w-4 h-4" />
                    ພິມທົດສອບ
                </button>
                <button
                    onclick={saveDesign}
                    class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 text-sm font-medium transition-colors"
                >
                    <Save class="w-4 h-4" />
                    ບັນທຶກ
                </button>
            </div>
        </div>
    </div>

    <div class="flex">
        <!-- Elements Panel -->
        <div
            class="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4 h-[calc(100vh-65px)] overflow-y-auto"
        >
            <h3
                class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3"
            >
                ອົງປະກອບ
            </h3>
            <div class="grid grid-cols-2 gap-2">
                {#each availableElements as element (element.type)}
                    <button
                        onclick={() => addElement(element.type)}
                        class="flex flex-col items-center gap-1 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                    >
                        <element.icon
                            class="w-5 h-5 text-gray-500 dark:text-gray-400"
                        />
                        <span
                            class="text-xs text-gray-600 dark:text-gray-400 text-center"
                            >{element.name}</span
                        >
                    </button>
                {/each}
            </div>
        </div>

        <!-- Design Canvas + Preview -->
        <div class="flex-1 p-8 overflow-auto h-[calc(100vh-65px)]">
            <div class="flex justify-center gap-8 flex-wrap">
                <!-- Editable Canvas -->
                <div>
                    <p class="text-xs text-center text-gray-400 dark:text-gray-500 mb-2">ແກ້ໄຂ — {selectedPaperSize}</p>
                <div
                    class="bg-white shadow-lg rounded-lg overflow-hidden"
                    style="width: {paperWidth * 3}px"
                >
                    <!-- Receipt (always white bg + dark text for print preview) -->
                    <div class="p-4 font-mono text-sm text-gray-900 bg-white">
                        {#each receiptElements as element (element.id)}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                onclick={() => (selectedElementId = element.id)}
                                class={cn(
                                    "group relative py-1 px-2 -mx-2 rounded cursor-pointer transition-colors",
                                    selectedElementId === element.id
                                        ? "bg-primary-50 ring-2 ring-primary-500"
                                        : "hover:bg-gray-50",
                                )}
                            >
                                <!-- Element content -->
                                {#if element.type === "divider"}
                                    <div
                                        class="text-center overflow-hidden"
                                        style="font-size: {element.fontSize}px"
                                    >
                                        {element.content.repeat(50)}
                                    </div>
                                {:else if element.type === "items"}
                                    <div
                                        style="font-size: {element.fontSize}px"
                                    >
                                        {#each sampleData.items as item (item.name)}
                                            <div
                                                class="flex justify-between py-0.5"
                                            >
                                                <span
                                                    >{item.name} x{item.qty}</span
                                                >
                                                <span
                                                    >{formatCurrency(
                                                        item.total,
                                                    )}</span
                                                >
                                            </div>
                                        {/each}
                                    </div>
                                {:else if element.type === "logo"}
                                    <div class="text-center py-2">
                                        <div
                                            class="inline-block w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center"
                                        >
                                            <Image
                                                class="w-8 h-8 text-gray-400"
                                            />
                                        </div>
                                    </div>
                                {:else if element.type === "qrcode"}
                                    <div class="text-center py-2">
                                        <div
                                            class="inline-block w-20 h-20 bg-gray-100 border border-gray-300 rounded flex items-center justify-center"
                                        >
                                            <QrCode
                                                class="w-12 h-12 text-gray-400"
                                            />
                                        </div>
                                    </div>
                                {:else if element.type === "barcode"}
                                    <div class="text-center py-2">
                                        <div
                                            class="inline-block w-32 h-10 bg-gray-100 border border-gray-300 rounded flex items-center justify-center"
                                        >
                                            <Barcode
                                                class="w-20 h-6 text-gray-400"
                                            />
                                        </div>
                                    </div>
                                {:else}
                                    <div
                                        class={cn(
                                            element.bold && "font-bold",
                                            element.italic && "italic",
                                            element.align === "center" &&
                                                "text-center",
                                            element.align === "right" &&
                                                "text-right",
                                        )}
                                        style="font-size: {element.fontSize}px"
                                    >
                                        {renderContent(element)}
                                    </div>
                                {/if}

                                <!-- Actions -->
                                <div
                                    class="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-white shadow rounded px-1"
                                >
                                    <button
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            moveElement(element.id, "up");
                                        }}
                                        class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                        title="ຍ້າຍຂຶ້ນ"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            moveElement(element.id, "down");
                                        }}
                                        class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                        title="ຍ້າຍລົງ"
                                    >
                                        ↓
                                    </button>
                                    <button
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            removeElement(element.id);
                                        }}
                                        class="p-1 hover:bg-danger-100 dark:hover:bg-danger-900/30 text-danger-500 rounded"
                                        title="ລຶບ"
                                    >
                                        <Trash2 class="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
                </div>

                <!-- Print Preview Panel (shown when showPreview is true) -->
                {#if showPreview}
                <div>
                    <p class="text-xs text-center text-gray-400 dark:text-gray-500 mb-2">ຕົວຢ່າງ (Print Preview)</p>
                    <div
                        class="bg-white shadow-xl rounded-lg overflow-hidden border border-gray-300"
                        style="width: {paperWidth * 3}px; font-family: 'Noto Sans Lao', 'Courier New', monospace; font-size: 12px; color: #111;"
                    >
                        <div class="p-3 space-y-0.5">
                            {#each receiptElements as el (el.id)}
                                {#if el.type === 'divider'}
                                    <div class="text-center overflow-hidden" style="font-size:{el.fontSize}px">{el.content.repeat(40)}</div>
                                {:else if el.type === 'items'}
                                    <div style="font-size:{el.fontSize}px">
                                        {#each sampleData.items as item (item.name)}
                                            <div class="flex justify-between"><span>{item.name} x{item.qty}</span><span>{formatCurrency(item.total)}</span></div>
                                        {/each}
                                    </div>
                                {:else if el.type === 'logo'}
                                    <div class="text-center py-1">
                                        {#if receiptSettings.showLogo !== false && receiptSettings.branchLogo}
                                            <img src={receiptSettings.branchLogo} alt="Logo" class="mx-auto max-h-14 max-w-20 object-contain" />
                                        {:else}
                                            <div class="inline-flex w-12 h-12 bg-gray-100 rounded items-center justify-center text-gray-400 text-xs">LOGO</div>
                                        {/if}
                                    </div>
                                {:else if el.type === 'qrcode'}
                                    <div class="text-center py-1">
                                        {#if qrDataUrl}
                                            <img src={qrDataUrl} alt="QR Code" class="mx-auto" style="width:64px;height:64px" />
                                        {:else}
                                            <div class="inline-block w-16 h-16 border border-gray-400 flex items-center justify-center text-xs text-gray-400">QR</div>
                                        {/if}
                                    </div>
                                {:else if el.type === 'barcode'}
                                    <div class="text-center py-1">
                                        <div class="inline-block w-24 h-8 border border-gray-400 flex items-center justify-center text-xs text-gray-400">Barcode</div>
                                    </div>
                                {:else if el.type === 'signature'}
                                    <div class="text-center pt-3 pb-1">
                                        <div class="border-b border-gray-400 w-24 mx-auto mb-1"></div>
                                        <span class="text-xs text-gray-500">ລາຍເຊັນ</span>
                                    </div>
                                {:else}
                                    <div
                                        class={cn(el.bold && 'font-bold', el.italic && 'italic', el.align === 'center' && 'text-center', el.align === 'right' && 'text-right')}
                                        style="font-size:{el.fontSize}px"
                                    >{renderContent(el)}</div>
                                {/if}
                            {/each}
                        </div>
                    </div>
                </div>
                {/if}
            </div>
        </div>

        <!-- Properties Panel -->
        <div
            class="w-72 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 p-4 h-[calc(100vh-65px)] overflow-y-auto"
        >
            {#if selectedElementId}
                {@const selectedElement = getSelectedElement()}
                {#if selectedElement}
                    <h3
                        class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4"
                    >
                        ຄຸນສົມບັດ
                    </h3>

                    <div class="space-y-4">
                        <!-- Logo source info -->
                        {#if selectedElement.type === "logo"}
                            <div class="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
                                {#if receiptSettings.branchLogo}
                                    <img src={receiptSettings.branchLogo} alt="Branch Logo" class="mx-auto max-h-16 max-w-full object-contain rounded" />
                                {:else}
                                    <div class="w-14 h-14 mx-auto bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                                        <Image class="w-7 h-7 text-gray-400" />
                                    </div>
                                {/if}
                                <p class="text-xs text-blue-700 dark:text-blue-300 text-center">
                                    ໂລໂກ້ຖືກດຶງຈາກຂໍ້ມູນສາຂາ
                                </p>
                                <a href="/branches" class="flex items-center justify-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
                                    ຕັ້ງຄ່າໂລໂກ້ທີ່ ສາຂາ →
                                </a>
                            </div>
                        {/if}

                        <!-- Content -->
                        {#if !["divider", "items", "logo", "qrcode", "barcode"].includes(selectedElement.type)}
                            <div>
                                <label
                                    for="element-content"
                                    class="block text-xs text-gray-500 dark:text-gray-400 mb-1"
                                    >ຂໍ້ຄວາມ</label
                                >
                                <textarea
                                    id="element-content"
                                    value={selectedElement.content}
                                    oninput={(e) =>
                                        updateElement(selectedElement.id, {
                                            content: e.currentTarget.value,
                                        })}
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-white"
                                    rows="2"
                                ></textarea>
                            </div>
                        {/if}

                        <!-- QR Code Format -->
                        {#if selectedElement.type === "qrcode"}
                            <div class="space-y-3">
                                <div>
                                    <label for="qr-format" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">QR Code Format</label>
                                    <select
                                        id="qr-format"
                                        bind:value={qrFormat}
                                        onchange={() => generateQrPreview()}
                                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-white"
                                    >
                                        <option value="iso">ISO (Standard)</option>
                                        <option value="emvco">EMVco (Payment)</option>
                                    </select>
                                </div>

                                {#if qrFormat === 'emvco'}
                                    <div>
                                        <label for="emvco-code" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Merchant Account / Payment Code</label>
                                        <input
                                            id="emvco-code"
                                            type="text"
                                            bind:value={emvcoMerchantCode}
                                            oninput={() => generateQrPreview()}
                                            placeholder="e.g. LA.BCEL.01234567890"
                                            class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-white"
                                        />
                                        <p class="text-xs text-gray-400 mt-1">EMVco QR — enter your payment merchant ID</p>
                                    </div>

                                    {#if !emvcoMerchantCode.trim()}
                                        <div>
                                            <p class="text-xs text-amber-500 mb-1">No merchant code — upload a static QR image instead</p>
                                            <label class="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-sm text-gray-700 dark:text-gray-300">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                                                {qrUploadedImageUrl ? 'Replace QR Image' : 'Upload QR Image'}
                                                <input type="file" accept="image/*" class="hidden" onchange={handleQrImageUpload} />
                                            </label>
                                            {#if qrUploadedImageUrl}
                                                <img src={qrUploadedImageUrl} alt="QR" class="mt-2 w-16 h-16 rounded border" />
                                            {/if}
                                        </div>
                                    {/if}
                                {:else}
                                    <p class="text-xs text-gray-400">Standard ISO 18004 QR Code — encodes the receipt URL</p>
                                {/if}
                            </div>
                        {/if}

                        <!-- Divider Character -->
                        {#if selectedElement.type === "divider"}
                            <div>
                                <label
                                    for="divider-char"
                                    class="block text-xs text-gray-500 dark:text-gray-400 mb-1"
                                    >ຕົວອັກສອນ</label
                                >
                                <select
                                    id="divider-char"
                                    value={selectedElement.content}
                                    onchange={(e) =>
                                        updateElement(selectedElement.id, {
                                            content: e.currentTarget.value,
                                        })}
                                    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-white"
                                >
                                    <option value="-">- - - - -</option>
                                    <option value="=">=====</option>
                                    <option value="*">*****</option>
                                    <option value="_">_____</option>
                                </select>
                            </div>
                        {/if}

                        <!-- Alignment -->
                        <div>
                            <!-- svelte-ignore a11y_label_has_associated_control -->
                            <label
                                class="block text-xs text-gray-500 dark:text-gray-400 mb-1"
                                >ຈັດຮຽງ</label
                            >
                            <div class="flex gap-1">
                                <button
                                    onclick={() =>
                                        updateElement(selectedElement.id, {
                                            align: "left",
                                        })}
                                    class={cn(
                                        "flex-1 p-2 rounded-lg border transition-colors",
                                        selectedElement.align === "left"
                                            ? "bg-primary-50 border-primary-500 text-primary-600 dark:bg-primary-900/20"
                                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800",
                                    )}
                                >
                                    <AlignLeft class="w-4 h-4 mx-auto" />
                                </button>
                                <button
                                    onclick={() =>
                                        updateElement(selectedElement.id, {
                                            align: "center",
                                        })}
                                    class={cn(
                                        "flex-1 p-2 rounded-lg border transition-colors",
                                        selectedElement.align === "center"
                                            ? "bg-primary-50 border-primary-500 text-primary-600 dark:bg-primary-900/20"
                                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800",
                                    )}
                                >
                                    <AlignCenter class="w-4 h-4 mx-auto" />
                                </button>
                                <button
                                    onclick={() =>
                                        updateElement(selectedElement.id, {
                                            align: "right",
                                        })}
                                    class={cn(
                                        "flex-1 p-2 rounded-lg border transition-colors",
                                        selectedElement.align === "right"
                                            ? "bg-primary-50 border-primary-500 text-primary-600 dark:bg-primary-900/20"
                                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800",
                                    )}
                                >
                                    <AlignRight class="w-4 h-4 mx-auto" />
                                </button>
                            </div>
                        </div>

                        <!-- Font Size -->
                        <div>
                            <label
                                for="font-size-slider"
                                class="block text-xs text-gray-500 dark:text-gray-400 mb-1"
                                >ຂະໜາດຕົວໜັງສື ({selectedElement.fontSize}px)</label
                            >
                            <input
                                id="font-size-slider"
                                type="range"
                                min="8"
                                max="24"
                                value={selectedElement.fontSize}
                                oninput={(e) =>
                                    updateElement(selectedElement.id, {
                                        fontSize: parseInt(
                                            e.currentTarget.value,
                                        ),
                                    })}
                                class="w-full"
                            />
                        </div>

                        <!-- Font Style -->
                        <div>
                            <!-- svelte-ignore a11y_label_has_associated_control -->
                            <label
                                class="block text-xs text-gray-500 dark:text-gray-400 mb-1"
                                >ຮູບແບບ</label
                            >
                            <div class="flex gap-1">
                                <button
                                    onclick={() =>
                                        updateElement(selectedElement.id, {
                                            bold: !selectedElement.bold,
                                        })}
                                    class={cn(
                                        "flex-1 p-2 rounded-lg border transition-colors",
                                        selectedElement.bold
                                            ? "bg-primary-50 border-primary-500 text-primary-600 dark:bg-primary-900/20"
                                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800",
                                    )}
                                >
                                    <Bold class="w-4 h-4 mx-auto" />
                                </button>
                                <button
                                    onclick={() =>
                                        updateElement(selectedElement.id, {
                                            italic: !selectedElement.italic,
                                        })}
                                    class={cn(
                                        "flex-1 p-2 rounded-lg border transition-colors",
                                        selectedElement.italic
                                            ? "bg-primary-50 border-primary-500 text-primary-600 dark:bg-primary-900/20"
                                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800",
                                    )}
                                >
                                    <Italic class="w-4 h-4 mx-auto" />
                                </button>
                            </div>
                        </div>

                        <!-- Delete -->
                        <button
                            onclick={() => removeElement(selectedElement.id)}
                            class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-danger-50 dark:bg-danger-900/20 text-danger-600 hover:bg-danger-100 dark:hover:bg-danger-900/30 text-sm font-medium transition-colors"
                        >
                            <Trash2 class="w-4 h-4" />
                            ລຶບອົງປະກອບ
                        </button>
                    </div>
                {/if}
            {:else}
                <!-- Receipt Settings when nothing selected -->
                <div class="space-y-4">
                    <div class="text-center py-4 text-gray-400 dark:text-gray-500">
                        <Settings class="w-8 h-8 mx-auto mb-1 opacity-40" />
                        <p class="text-xs">ເລືອກອົງປະກອບເພື່ອແກ້ໄຂ</p>
                    </div>

                    <!-- Receipt settings collapsible -->
                    <div class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                        <button
                            onclick={() => showReceiptSettings = !showReceiptSettings}
                            class="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                            <div class="flex items-center gap-2">
                                <Palette class="w-3.5 h-3.5" />
                                ຕັ້ງຄ່າໃບບິນ
                            </div>
                            {#if showReceiptSettings}
                                <ChevronUp class="w-3.5 h-3.5 text-gray-400" />
                            {:else}
                                <ChevronDown class="w-3.5 h-3.5 text-gray-400" />
                            {/if}
                        </button>
                        {#if showReceiptSettings}
                            <div class="px-3 pb-3 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                                <!-- Branch info (read-only) -->
                                {#if receiptSettings.branchName}
                                    <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-xs text-gray-500">
                                        <p class="font-medium text-gray-700 dark:text-gray-300">{receiptSettings.branchName}</p>
                                        {#if receiptSettings.branchAddress}<p>{receiptSettings.branchAddress}</p>{/if}
                                        {#if receiptSettings.branchPhone}<p>{receiptSettings.branchPhone}</p>{/if}
                                    </div>
                                {/if}
                                <div>
                                    <label for="a11y-app-documents-design-page-svelte-1001" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">ຂໍ້ຄວາມລຸ່ມ (Footer)</label>
                                    <input id="a11y-app-documents-design-page-svelte-1001" type="text" bind:value={receiptSettingsForm.footerText}
                                        class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs px-2 py-1.5 text-gray-900 dark:text-white" />
                                </div>
                                <div>
                                    <label for="a11y-app-documents-design-page-svelte-1" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">ສີຫຼັກ</label>
                                    <div class="flex items-center gap-2">
                                        <input id="a11y-app-documents-design-page-svelte-1" type="color" bind:value={receiptSettingsForm.primaryColor}
                                            class="w-8 h-8 rounded cursor-pointer border border-gray-200 p-0.5" />
                                        <input type="text" bind:value={receiptSettingsForm.primaryColor}
                                            class="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs px-2 py-1.5 font-mono" />
                                    </div>
                                </div>
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" bind:checked={receiptSettingsForm.showLogo}
                                        class="w-3.5 h-3.5 rounded border-gray-300 text-primary-600" />
                                    <span class="text-xs text-gray-600 dark:text-gray-400">ສະແດງໂລໂກ້</span>
                                </label>
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- Template Preset Modal -->
{#if showTemplateModal}
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg mx-4 p-6 shadow-2xl">
        <div class="flex items-center justify-between mb-5">
            <div>
                <h2 class="text-lg font-bold text-gray-900 dark:text-white">ເລືອກໂຕິໝາຍ</h2>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">ໂຕິໝາຍຈະແທນທີ່ອົງປະກອບທີ່ມີຢູ່ທັງໝົດ</p>
            </div>
            <button onclick={() => showTemplateModal = false} class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X class="w-5 h-5 text-gray-400" />
            </button>
        </div>
        <div class="space-y-3">
            {#each presetTemplates as preset (preset.id)}
                <button
                    onclick={() => applyPreset(preset)}
                    class="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all text-left group"
                >
                    <div class="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0 group-hover:bg-primary-200 transition-colors">
                        <LayoutTemplate class="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                        <p class="font-semibold text-gray-900 dark:text-white text-sm">{preset.name}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{preset.desc}</p>
                        <p class="text-xs text-primary-600 dark:text-primary-400 mt-1">{preset.paperSize} · {preset.elements().length} ອົງປະກອບ</p>
                    </div>
                </button>
            {/each}
        </div>
    </div>
</div>
{/if}
