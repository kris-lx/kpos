<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$api";
    import { toast } from "svelte-sonner";
    import {
        Receipt,
        Save,
        Loader2,
        FileText,
        Building,
        Phone,
        MapPin,
        Type,
        Hash,
        Image,
        AlignLeft,
        AlignCenter,
        AlignRight,
        Eye,
    } from "lucide-svelte";

    // State
    let isLoading = $state(true);
    let isSaving = $state(false);
    let showPreview = $state(false);

    // Form
    let formData = $state({
        businessName: "",
        address: "",
        phone: "",
        taxId: "",
        logoUrl: "",
        headerText: "",
        footerText: "",
        showLogo: true,
        showTaxId: true,
        paperWidth: "80mm",
        fontSize: "normal",
        alignment: "center",
        showBarcode: true,
        showQRCode: false,
        thankYouMessage: "ຂອບໃຈທີ່ໃຊ້ບໍລິການ!",
    });

    async function loadData() {
        isLoading = true;
        try {
            const res = await api.get("settings/receipt").json<any>();
            if (res.data) {
                formData = { ...formData, ...res.data };
            }
        } catch (e) {
            console.error("Failed to load:", e);
        } finally {
            isLoading = false;
        }
    }

    async function handleSubmit() {
        isSaving = true;
        try {
            await api.put("settings/receipt", { json: formData }).json();
            toast.success("ບັນທຶກສຳເລັດ");
        } catch (e) {
            console.error("Failed to save:", e);
            toast.error(t("common.error"));
        } finally {
            isSaving = false;
        }
    }

    onMount(() => loadData());
</script>

<svelte:head>
    <title>ຕັ້ງຄ່າໃບບິນ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
            <div class="flex items-center gap-3">
                <div class="p-2.5 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl shadow-lg">
                    <Receipt class="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ຕັ້ງຄ່າໃບບິນ</h1>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ປັບແຕ່ງຮູບແບບໃບບິນ</p>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <button
                onclick={() => (showPreview = true)}
                class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium"
            >
                <Eye class="w-4 h-4" />
                ເບິ່ງຕົວຢ່າງ
            </button>
            <button
                onclick={handleSubmit}
                disabled={isSaving}
                class="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl text-sm font-semibold shadow-lg disabled:opacity-50"
            >
                {#if isSaving}
                    <Loader2 class="w-5 h-5 animate-spin" />
                {:else}
                    <Save class="w-5 h-5" />
                {/if}
                ບັນທຶກ
            </button>
        </div>
    </div>

    {#if isLoading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-blue-500 animate-spin" />
        </div>
    {:else}
        <div class="grid md:grid-cols-2 gap-6">
            <!-- Business Info -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Building class="w-5 h-5 text-blue-500" />
                    ຂໍ້ມູນທຸລະກິດ
                </h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຊື່ທຸລະກິດ</label>
                        <input type="text" bind:value={formData.businessName} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ທີ່ຢູ່</label>
                        <textarea bind:value={formData.address} rows="2" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ເບີໂທ</label>
                            <input type="text" bind:value={formData.phone} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ເລກປະຈຳຕົວພາສີ</label>
                            <input type="text" bind:value={formData.taxId} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">URL ໂລໂກ້</label>
                        <input type="url" bind:value={formData.logoUrl} placeholder="https://..." class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                </div>
            </div>

            <!-- Header/Footer -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <FileText class="w-5 h-5 text-blue-500" />
                    ຫົວ/ທ້າຍໃບບິນ
                </h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຂໍ້ຄວາມຫົວ</label>
                        <textarea bind:value={formData.headerText} rows="2" placeholder="ຂໍ້ຄວາມທີ່ຈະສະແດງທາງເທິງ" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຂໍ້ຄວາມທ້າຍ</label>
                        <textarea bind:value={formData.footerText} rows="2" placeholder="ຂໍ້ຄວາມທີ່ຈະສະແດງທາງລຸ່ມ" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"></textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຂໍ້ຄວາມຂອບໃຈ</label>
                        <input type="text" bind:value={formData.thankYouMessage} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    </div>
                </div>
            </div>

            <!-- Display Options -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Image class="w-5 h-5 text-blue-500" />
                    ຕົວເລືອກການສະແດງ
                </h3>
                <div class="space-y-4">
                    <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <span class="text-gray-700 dark:text-gray-300">ສະແດງໂລໂກ້</span>
                        <input type="checkbox" bind:checked={formData.showLogo} class="w-5 h-5 rounded text-blue-600" />
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <span class="text-gray-700 dark:text-gray-300">ສະແດງເລກພາສີ</span>
                        <input type="checkbox" bind:checked={formData.showTaxId} class="w-5 h-5 rounded text-blue-600" />
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <span class="text-gray-700 dark:text-gray-300">ສະແດງ Barcode</span>
                        <input type="checkbox" bind:checked={formData.showBarcode} class="w-5 h-5 rounded text-blue-600" />
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <span class="text-gray-700 dark:text-gray-300">ສະແດງ QR Code</span>
                        <input type="checkbox" bind:checked={formData.showQRCode} class="w-5 h-5 rounded text-blue-600" />
                    </div>
                </div>
            </div>

            <!-- Print Settings -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Type class="w-5 h-5 text-blue-500" />
                    ຕັ້ງຄ່າການພິມ
                </h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຂະໜາດເຈ້ຍ</label>
                        <select bind:value={formData.paperWidth} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                            <option value="58mm">58mm</option>
                            <option value="80mm">80mm</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ຂະໜາດຕົວອັກສອນ</label>
                        <select bind:value={formData.fontSize} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                            <option value="small">ນ້ອຍ</option>
                            <option value="normal">ປົກກະຕິ</option>
                            <option value="large">ໃຫຍ່</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ການຈັດຮຽງ</label>
                        <div class="flex gap-2">
                            <button
                                type="button"
                                onclick={() => (formData.alignment = "left")}
                                class="flex-1 p-3 rounded-xl border-2 transition-all {formData.alignment === 'left' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700'}"
                            >
                                <AlignLeft class="w-5 h-5 mx-auto text-gray-600 dark:text-gray-400" />
                            </button>
                            <button
                                type="button"
                                onclick={() => (formData.alignment = "center")}
                                class="flex-1 p-3 rounded-xl border-2 transition-all {formData.alignment === 'center' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700'}"
                            >
                                <AlignCenter class="w-5 h-5 mx-auto text-gray-600 dark:text-gray-400" />
                            </button>
                            <button
                                type="button"
                                onclick={() => (formData.alignment = "right")}
                                class="flex-1 p-3 rounded-xl border-2 transition-all {formData.alignment === 'right' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700'}"
                            >
                                <AlignRight class="w-5 h-5 mx-auto text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>

<!-- Preview Modal -->
{#if showPreview}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-blue-500 to-cyan-600 flex items-center justify-between">
                <h2 class="text-xl font-bold text-white">ຕົວຢ່າງໃບບິນ</h2>
                <button onclick={() => (showPreview = false)} class="p-1.5 hover:bg-white/20 rounded-lg text-white">✕</button>
            </div>

            <div class="p-6 bg-white text-center" style="font-family: monospace;">
                {#if formData.showLogo && formData.logoUrl}
                    <img src={formData.logoUrl} alt="Logo" class="w-16 h-16 mx-auto mb-2 object-contain" />
                {/if}
                <h4 class="font-bold text-lg">{formData.businessName || "ຊື່ທຸລະກິດ"}</h4>
                <p class="text-sm text-gray-600">{formData.address || "ທີ່ຢູ່"}</p>
                <p class="text-sm text-gray-600">{formData.phone || "ເບີໂທ"}</p>
                {#if formData.showTaxId && formData.taxId}
                    <p class="text-sm text-gray-600">ເລກພາສີ: {formData.taxId}</p>
                {/if}
                {#if formData.headerText}
                    <p class="text-sm mt-2">{formData.headerText}</p>
                {/if}
                <div class="border-t border-dashed border-gray-300 my-4"></div>
                <div class="text-left text-sm space-y-1">
                    <div class="flex justify-between"><span>ສິນຄ້າ 1</span><span>₭50,000</span></div>
                    <div class="flex justify-between"><span>ສິນຄ້າ 2</span><span>₭30,000</span></div>
                </div>
                <div class="border-t border-dashed border-gray-300 my-4"></div>
                <div class="text-left text-sm space-y-1">
                    <div class="flex justify-between font-bold"><span>ລວມ:</span><span>₭80,000</span></div>
                </div>
                <div class="border-t border-dashed border-gray-300 my-4"></div>
                {#if formData.showBarcode}
                    <div class="h-12 bg-gray-200 flex items-center justify-center text-xs text-gray-500">[ Barcode ]</div>
                {/if}
                {#if formData.showQRCode}
                    <div class="w-24 h-24 bg-gray-200 mx-auto mt-2 flex items-center justify-center text-xs text-gray-500">[ QR ]</div>
                {/if}
                <p class="text-sm mt-4">{formData.thankYouMessage}</p>
                {#if formData.footerText}
                    <p class="text-xs text-gray-500 mt-2">{formData.footerText}</p>
                {/if}
            </div>
        </div>
    </div>
{/if}
