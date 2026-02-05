<script lang="ts">
    import { cn } from "$utils";
    import { t } from "$lib/i18n/index.svelte";
    import { toast } from "svelte-sonner";
    import {
        Save,
        Undo,
        Redo,
        Eye,
        Printer,
        GripVertical,
        Plus,
        Trash2,
        Image,
        Type,
        AlignLeft,
        AlignCenter,
        AlignRight,
        Bold,
        Italic,
        Underline,
        ChevronDown,
        Settings,
        FileText,
        QrCode,
        Barcode,
        Minus,
        Table,
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
        { type: "divider", name: "ເສັ້ນແບ່ງ", icon: Minus },
        { type: "date", name: "ວັນທີ/ເວລາ", icon: FileText },
        { type: "receiptNo", name: "ເລກທີບິນ", icon: FileText },
        { type: "cashier", name: "ພະນັກງານ", icon: FileText },
        { type: "items", name: "ລາຍການສິນຄ້າ", icon: Table },
        { type: "subtotal", name: "ລວມ", icon: FileText },
        { type: "discount", name: "ສ່ວນຫຼຸດ", icon: FileText },
        { type: "tax", name: "ພາສີ", icon: FileText },
        { type: "total", name: "ຍອດຊຳລະ", icon: FileText },
        { type: "payment", name: "ວິທີຊຳລະ", icon: FileText },
        { type: "change", name: "ເງິນທອນ", icon: FileText },
        { type: "qrcode", name: "QR Code", icon: QrCode },
        { type: "barcode", name: "Barcode", icon: Barcode },
        { type: "footer", name: "ຂໍ້ຄວາມລຸ່ມ", icon: Type },
    ];

    // Receipt design state
    let selectedPaperSize = $state("80mm");
    let selectedElementId = $state<string | null>(null);
    let showPreview = $state(false);

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
            content: "KPOS Demo Store",
            align: "center",
            fontSize: 18,
            bold: true,
            italic: false,
        },
        {
            id: "3",
            type: "address",
            content: "123 ຖະໜົນລ້ານຊ້າງ, ນະຄອນຫຼວງວຽງຈັນ",
            align: "center",
            fontSize: 12,
            bold: false,
            italic: false,
        },
        {
            id: "4",
            type: "phone",
            content: "ໂທ: 021-123456",
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
        items: [
            { name: "ກາເຟລາວ", qty: 2, price: 25000, total: 50000 },
            { name: "ເຂົ້າໜຽວໝູປີ້ງ", qty: 1, price: 35000, total: 35000 },
            { name: "ນ້ຳແຂງກະທິ", qty: 1, price: 20000, total: 20000 },
        ],
        subtotal: 105000,
        discount: 5000,
        tax: 7000,
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

        // Replace placeholders with sample data
        content = content.replace("{{date}}", sampleData.date);
        content = content.replace("{{time}}", sampleData.time);
        content = content.replace("{{receiptNo}}", sampleData.receiptNo);
        content = content.replace("{{cashier}}", sampleData.cashier);
        content = content.replace(
            "{{subtotal}}",
            formatCurrency(sampleData.subtotal),
        );
        content = content.replace(
            "{{discount}}",
            formatCurrency(sampleData.discount),
        );
        content = content.replace("{{tax}}", formatCurrency(sampleData.tax));
        content = content.replace(
            "{{total}}",
            formatCurrency(sampleData.total),
        );
        content = content.replace(
            "{{paymentMethod}}",
            sampleData.paymentMethod,
        );
        content = content.replace(
            "{{change}}",
            formatCurrency(sampleData.change),
        );

        return content;
    }

    function saveDesign() {
        try {
            const design = {
                paperSize: selectedPaperSize,
                elements: receiptElements,
            };
            localStorage.setItem("kpos_receipt_design", JSON.stringify(design));
            toast.success("ບັນທຶກສຳເລັດ!");
        } catch (e) {
            console.error("Failed to save design:", e);
            toast.error("ບັນທຶກບໍ່ສຳເລັດ");
        }
    }

    function loadDesign() {
        const saved = localStorage.getItem("kpos_receipt_design");
        if (saved) {
            const design = JSON.parse(saved);
            selectedPaperSize = design.paperSize;
            receiptElements = design.elements;
        }
    }

    // Load saved design on mount
    $effect(() => {
        loadDesign();
    });

    const paperWidth = $derived(
        paperSizes.find((p) => p.id === selectedPaperSize)?.width || 72,
    );
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
                        {#each paperSizes as size}
                            <option value={size.id}>{size.name}</option>
                        {/each}
                    </select>
                </div>
            </div>

            <div class="flex items-center gap-2">
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
                {#each availableElements as element}
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

        <!-- Design Canvas -->
        <div class="flex-1 p-8 overflow-auto h-[calc(100vh-65px)]">
            <div class="flex justify-center">
                <div
                    class="bg-white shadow-lg rounded-lg overflow-hidden"
                    style="width: {paperWidth * 3}px"
                >
                    <!-- Receipt -->
                    <div class="p-4 font-mono text-sm">
                        {#each receiptElements as element}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                onclick={() => (selectedElementId = element.id)}
                                class={cn(
                                    "group relative py-1 px-2 -mx-2 rounded cursor-pointer transition-colors",
                                    selectedElementId === element.id
                                        ? "bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500"
                                        : "hover:bg-gray-50 dark:hover:bg-gray-800",
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
                                        {#each sampleData.items as item}
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
                                            class="inline-block w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center"
                                        >
                                            <Image
                                                class="w-8 h-8 text-gray-400"
                                            />
                                        </div>
                                    </div>
                                {:else if element.type === "qrcode"}
                                    <div class="text-center py-2">
                                        <div
                                            class="inline-block w-20 h-20 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded flex items-center justify-center"
                                        >
                                            <QrCode
                                                class="w-12 h-12 text-gray-400"
                                            />
                                        </div>
                                    </div>
                                {:else if element.type === "barcode"}
                                    <div class="text-center py-2">
                                        <div
                                            class="inline-block w-32 h-10 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded flex items-center justify-center"
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
                                    class="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-white dark:bg-gray-800 shadow rounded px-1"
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
                                        class="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded"
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
                            class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 text-sm font-medium transition-colors"
                        >
                            <Trash2 class="w-4 h-4" />
                            ລຶບອົງປະກອບ
                        </button>
                    </div>
                {/if}
            {:else}
                <div class="text-center py-8 text-gray-400 dark:text-gray-500">
                    <Settings class="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p class="text-sm">ເລືອກອົງປະກອບເພື່ອແກ້ໄຂ</p>
                </div>
            {/if}
        </div>
    </div>
</div>
