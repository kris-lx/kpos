<script lang="ts">
    import { auth } from "$stores";
    import { api } from "$api";
    import { t } from "$lib/i18n/index.svelte";
    import { toast } from "svelte-sonner";
    import { Hash, Save, Loader2, ChevronLeft, RefreshCw } from "lucide-svelte";

    let isLoading = $state(true);
    let isSaving = $state(false);

    let docs = $state([
        { key: "tx", labelKey: "documents.type.tx", prefix: "TX", separator: "-", padLength: 6, sample: "" },
        { key: "inv", labelKey: "documents.type.inv", prefix: "INV", separator: "-", padLength: 6, sample: "" },
        { key: "po", labelKey: "documents.type.po", prefix: "PO", separator: "-", padLength: 6, sample: "" },
        { key: "rcp", labelKey: "documents.type.rcp", prefix: "RCP", separator: "-", padLength: 4, sample: "" },
        { key: "ref", labelKey: "documents.type.ref", prefix: "REF", separator: "-", padLength: 6, sample: "" },
    ]);

    function buildSample(doc: (typeof docs)[0]) {
        const num = "1".padStart(doc.padLength, "0");
        return `${doc.prefix}${doc.separator}YYYYMMDD${doc.separator}${num}`;
    }

    $effect(() => {
        docs = docs.map((d) => ({ ...d, sample: buildSample(d) }));
    });

    async function load() {
        isLoading = true;
        try {
            const res = await api.get("settings/category/documents").json<any>();
            // Backend returns { data: { tx: value, inv: value, ... } } (object keyed by setting key)
            // Backend returns { data: { tx: value, inv: value, ... } } where each value is JSONB (object or string)
            const dataObj: Record<string, any> = (res.data && typeof res.data === "object" && !Array.isArray(res.data)) ? res.data : {};
            docs = docs.map((d) => {
                const raw = dataObj[d.key];
                if (!raw) return d;
                const v = typeof raw === "string" ? JSON.parse(raw) : raw;
                return { ...d, ...v };
            });
        } catch {}
        isLoading = false;
    }

    async function save() {
        isSaving = true;
        try {
            await Promise.all(
                docs.map((d) =>
                    api.put(`settings/documents/${d.key}`, {
                        json: { value: { prefix: d.prefix, separator: d.separator, padLength: d.padLength } },
                    }).json()
                )
            );
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

<svelte:head><title>{t("settings.documentNumbers")} - KPOS</title></svelte:head>

<div class="p-6 max-w-3xl">
    <div class="flex items-center gap-3 mb-6">
        <a href="/settings" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <ChevronLeft class="w-5 h-5" />
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">{t("settings.documentNumbers")}</h1>
    </div>

    <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t("settings.documentNumbersDesc")} <code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">PREFIX-YYYYMMDD-000001</code>
    </p>

    {#if isLoading}
        <div class="flex items-center justify-center py-16"><Loader2 class="w-8 h-8 animate-spin text-primary-500" /></div>
    {:else}
        <div class="space-y-4">
            {#each docs as doc, i}
                <div class="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-100 dark:border-gray-800">
                    <div class="flex items-center gap-2 mb-4">
                        <Hash class="w-4 h-4 text-primary-500" />
                        <h3 class="font-medium text-gray-900 dark:text-white">{t(doc.labelKey)}</h3>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <div>
                            <label for="a11y-app-settings-documents-page-svelte-1" class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Prefix</label>
                            <input id="a11y-app-settings-documents-page-svelte-1" type="text" bind:value={docs[i].prefix} maxlength="10"
                                class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        </div>
                        <div>
                            <label for="a11y-app-settings-documents-page-svelte-2" class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t("settings.separator")}</label>
                            <select id="a11y-app-settings-documents-page-svelte-2" bind:value={docs[i].separator}
                                class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                                <option value="-">- (dash)</option>
                                <option value="/"># (slash)</option>
                                <option value="">{t("common.none")}</option>
                            </select>
                        </div>
                        <div>
                            <label for="a11y-app-settings-documents-page-svelte-3" class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t("settings.digitCount")}</label>
                            <input id="a11y-app-settings-documents-page-svelte-3" type="number" bind:value={docs[i].padLength} min="3" max="10"
                                class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        </div>
                    </div>
                    <div class="mt-3 text-xs text-gray-400 dark:text-gray-500 font-mono">
                        {t("common.example")}: <span class="text-primary-600 dark:text-primary-400">{doc.sample}</span>
                    </div>
                </div>
            {/each}

            <div class="flex justify-end pt-2">
                <button onclick={save} disabled={isSaving} class="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-60 transition-colors">
                    {#if isSaving}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" />{/if}
                    {t("common.save")}
                </button>
            </div>
        </div>
    {/if}
</div>
