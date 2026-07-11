<script lang="ts">
    import { auth } from "$stores";
    import { api } from "$api";
    import { t } from "$lib/i18n/index.svelte";
    import { toast } from "svelte-sonner";
    import { Store, Camera, Save, Loader2, ChevronLeft } from "lucide-svelte";

    const canUpdateSettings = $derived(auth.hasPermission('settings:update'));

    let isLoading = $state(true);
    let isSaving = $state(false);
    let storeLogo = $state<string | null>(null);
    let isUploadingLogo = $state(false);

    let form = $state({
        storeName: "",
        storeAddress: "",
        storePhone: "",
        storeEmail: "",
        taxId: "",
        enableTax: true,
        taxRate: 10,
    });

    async function handleLogoUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { toast.error(t("settings.logoTooLarge")); return; }
        isUploadingLogo = true;
        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            try {
                const res = await api.post("upload/single", { json: { image: base64, filename: file.name, folder: "logos" } }).json<any>();
                storeLogo = res.success && res.data?.url ? res.data.url : base64;
            } catch {
                storeLogo = base64;
            }
            toast.success(t("settings.logoUploadSuccess"));
        } catch {
            toast.error(t("settings.logoUploadFailed"));
        } finally {
            isUploadingLogo = false;
        }
    }

    // Store identity (name/logo/address/phone/email/taxId) lives on the branches
    // table — the same source receipts and invoices already read from — instead
    // of a disconnected generic settings blob, so this page always reflects
    // what was actually configured (e.g. via Management > Stores/Branches).
    async function load() {
        isLoading = true;
        try {
            const [branchRes, settingsRes] = await Promise.all([
                auth.activeBranchId ? api.get(`branches/${auth.activeBranchId}`).json<any>() : Promise.resolve(null),
                api.get("settings").json<any>(),
            ]);
            const branch = branchRes?.success ? branchRes.data : null;
            const d = settingsRes?.success ? settingsRes.data : {};
            form = {
                storeName: branch?.name || "",
                storeAddress: branch?.address || "",
                storePhone: branch?.phone || "",
                storeEmail: branch?.email || "",
                taxId: branch?.taxId || "",
                enableTax: d.tax?.vatEnabled ?? true,
                taxRate: d.tax?.vatRate ?? 10,
            };
            storeLogo = branch?.logo || null;
        } catch {}
        isLoading = false;
    }

    async function save() {
        isSaving = true;
        try {
            await Promise.all([
                auth.activeBranchId
                    ? api.put(`branches/${auth.activeBranchId}`, {
                        json: {
                            name: form.storeName,
                            address: form.storeAddress,
                            phone: form.storePhone,
                            email: form.storeEmail,
                            taxId: form.taxId,
                            logo: storeLogo,
                        },
                    }).json()
                    : Promise.resolve(),
                api.post("settings/bulk", {
                    json: {
                        settings: {
                            tax: {
                                vatEnabled: form.enableTax,
                                vatRate: form.taxRate,
                            },
                        },
                    },
                }).json(),
            ]);
            toast.success(t("common.saved"));
        } catch {
            toast.error(t("common.error"));
        } finally {
            isSaving = false;
        }
    }

    $effect(() => {
        auth.activeStoreId;
        load();
    });
</script>

<svelte:head><title>{t("settings.storeInfo")} - KPOS</title></svelte:head>

<div class="p-6 max-w-2xl">
    <div class="flex items-center gap-3 mb-6">
        <a href="/settings" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <ChevronLeft class="w-5 h-5" />
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">{t("settings.storeInfo")}</h1>
    </div>

    {#if isLoading}
        <div class="flex items-center justify-center py-16"><Loader2 class="w-8 h-8 animate-spin text-primary-500" /></div>
    {:else}
        {#if !canUpdateSettings}
            <div class="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
                {t("common.readOnlyNoPermission")}
            </div>
        {/if}
        <fieldset disabled={!canUpdateSettings} class="space-y-6 bg-white dark:bg-gray-900 rounded-xl p-6 disabled:opacity-75">
            <!-- Logo -->
            <div class="flex items-center gap-6">
                <div class="relative group">
                    <div class="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-800">
                        {#if storeLogo}
                            <img src={storeLogo} alt="Logo" class="w-full h-full object-cover" />
                        {:else}
                            <Store class="w-10 h-10 text-gray-300 dark:text-gray-600" />
                        {/if}
                    </div>
                    <label class="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        {#if isUploadingLogo}
                            <Loader2 class="w-6 h-6 text-white animate-spin" />
                        {:else}
                            <Camera class="w-6 h-6 text-white" />
                        {/if}
                        <input type="file" accept="image/*" class="hidden" onchange={handleLogoUpload} />
                    </label>
                </div>
                <div>
                    <p class="font-medium text-gray-900 dark:text-white">{t("settings.storeLogo")}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{t("settings.logoHelp")}</p>
                    {#if storeLogo}
                        <button onclick={() => (storeLogo = null)} class="text-xs text-danger-500 hover:underline mt-1">{t("settings.removeLogo")}</button>
                    {/if}
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div class="col-span-2">
                    <label for="a11y-app-settings-store-page-svelte-1" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("settings.storeName")}</label>
                    <input id="a11y-app-settings-store-page-svelte-1" type="text" bind:value={form.storeName} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>
                <div>
                    <label for="a11y-app-settings-store-page-svelte-2" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("common.phone")}</label>
                    <input id="a11y-app-settings-store-page-svelte-2" type="tel" bind:value={form.storePhone} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>
                <div>
                    <label for="a11y-app-settings-store-page-svelte-3" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("common.email")}</label>
                    <input id="a11y-app-settings-store-page-svelte-3" type="email" bind:value={form.storeEmail} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>
                <div class="col-span-2">
                    <label for="a11y-app-settings-store-page-svelte-4" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("common.address")}</label>
                    <textarea id="a11y-app-settings-store-page-svelte-4" bind:value={form.storeAddress} rows="3" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"></textarea>
                </div>
                <div>
                    <label for="a11y-app-settings-store-page-svelte-5" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("settings.taxId")}</label>
                    <input id="a11y-app-settings-store-page-svelte-5" type="text" bind:value={form.taxId} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>
            </div>

            <hr class="border-gray-100 dark:border-gray-800" />

            <div>
                <h3 class="font-medium text-gray-900 dark:text-white mb-4">{t("settings.vat")}</h3>
                <div class="flex items-center justify-between mb-4">
                    <p class="text-sm text-gray-700 dark:text-gray-300">{t("settings.enableVat")}</p>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" bind:checked={form.enableTax} class="sr-only peer" />
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                </div>
                {#if form.enableTax}
                    <div class="flex items-center gap-3">
                        <input type="number" bind:value={form.taxRate} min="0" max="100" step="0.01" class="w-28 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        <span class="text-gray-500">%</span>
                    </div>
                {/if}
            </div>

            <div class="pt-2">
                <button onclick={save} disabled={isSaving} class="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-60 transition-colors">
                    {#if isSaving}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" />{/if}
                    {t("common.save")}
                </button>
            </div>
        </fieldset>
    {/if}
</div>
