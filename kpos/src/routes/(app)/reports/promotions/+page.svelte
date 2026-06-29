<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { cn } from "$lib/utils";
    import { Loader2, Tag, Ticket, CheckCircle, XCircle, ChevronLeft, ChevronRight } from "lucide-svelte";

    let loading = $state(true);
    let error = $state<string | null>(null);
    let data = $state<{ promotions: any[]; coupons: any[] }>({ promotions: [], coupons: [] });
    let totals = $state({ promotions: 0, coupons: 0 });
    let tab = $state<"promotions" | "coupons">("promotions");
    const pageSizeOptions = [5, 10, 20, 50, 70, 100];
    let pageSize = $state(10);
    let currentPage = $state(1);
    const activeRows = $derived(tab === "promotions" ? data.promotions : data.coupons);
    const activeTotal = $derived(tab === "promotions" ? totals.promotions : totals.coupons);
    const totalPages = $derived(Math.max(1, Math.ceil(activeTotal / pageSize)));
    const paginatedRows = $derived(activeRows);

    function typeLabel(type: string) {
        const map: Record<string, string> = { PERCENTAGE: "%", FIXED: "₭", BOGO: "BOGO", ITEM_DISCOUNT: "Item" };
        return map[type] || type;
    }

    function formatValue(type: string, value: number) {
        if (type === "PERCENTAGE") return value.toFixed(1) + "%";
        return new Intl.NumberFormat("lo-LA").format(value) + " ₭";
    }

    async function load() {
        loading = true;
        error = null;
        try {
            const res = await api.get(`reports/promotions?page=${currentPage}&limit=${pageSize}`).json<any>();
            data = res.data || { promotions: [], coupons: [] };
            totals = {
                promotions: res.pagination?.promotionsTotal ?? data.promotions.length,
                coupons: res.pagination?.couponsTotal ?? data.coupons.length,
            };
        } catch (e) {
            error = t('common.loadError');
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        tab;
        currentPage;
        pageSize;
        load();
    });
</script>

<svelte:head>
    <title>{t("reports.promotions")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <div class="flex items-center gap-4 mb-6">
        <a href="/reports" class="text-sm text-primary-600 dark:text-primary-400 hover:underline">← {t("reports.title")}</a>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {t("reports.promotions")}
        </h1>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit mb-6">
        <button
            onclick={() => { tab = "promotions"; currentPage = 1; }}
            class={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                tab === "promotions" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            )}
        >
            <Tag class="w-4 h-4" />
            {t("promotions.promotions")}
            {#if data.promotions.length > 0}
                <span class="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 px-1.5 py-0.5 rounded-full">{data.promotions.length}</span>
            {/if}
        </button>
        <button
            onclick={() => { tab = "coupons"; currentPage = 1; }}
            class={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                tab === "coupons" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            )}
        >
            <Ticket class="w-4 h-4" />
            {t("promotions.coupons")}
            {#if data.coupons.length > 0}
                <span class="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 px-1.5 py-0.5 rounded-full">{data.coupons.length}</span>
            {/if}
        </button>
    </div>

    {#if loading}
        <div class="flex items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-primary-500 animate-spin" />
        </div>
    {:else if error}
        <div class="p-4 bg-danger-50 dark:bg-danger-900/20 rounded-xl text-danger-700 dark:text-danger-300 text-sm">{error}</div>
    {:else if tab === "promotions"}
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            {#if data.promotions.length === 0}
                <div class="py-16 text-center text-gray-400 dark:text-gray-500">
                    <Tag class="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>{t("promotions.noPromotions")}</p>
                </div>
            {:else}
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            <th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t("common.name")}</th>
                            <th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t("promotions.type")}</th>
                            <th class="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t("promotions.value")}</th>
                            <th class="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">{t("promotions.status")}</th>
                            <th class="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t("reports.usageCount")}</th>
                            <th class="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t("reports.usageLimit")}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {#each paginatedRows as p}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                <td class="px-5 py-3 font-medium text-gray-900 dark:text-white">{p.name}</td>
                                <td class="px-5 py-3">
                                    <span class="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium">{typeLabel(p.type)}</span>
                                </td>
                                <td class="px-5 py-3 text-right text-gray-900 dark:text-white">{formatValue(p.type, p.value)}</td>
                                <td class="px-5 py-3 text-center">
                                    {#if p.isActive}
                                        <CheckCircle class="w-4 h-4 text-success-500 mx-auto" />
                                    {:else}
                                        <XCircle class="w-4 h-4 text-gray-300 dark:text-gray-600 mx-auto" />
                                    {/if}
                                </td>
                                <td class="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white">{new Intl.NumberFormat("lo-LA").format(p.usageCount)}</td>
                                <td class="px-5 py-3 text-right text-gray-500 dark:text-gray-400">
                                    {#if p.usageLimit}
                                        {new Intl.NumberFormat("lo-LA").format(p.usageLimit)}
                                        <span class="text-xs text-gray-400">({p.usagePct}%)</span>
                                    {:else}
                                        <span class="text-gray-300 dark:text-gray-600">∞</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </div>
    {:else}
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            {#if data.coupons.length === 0}
                <div class="py-16 text-center text-gray-400 dark:text-gray-500">
                    <Ticket class="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>{t("promotions.noCoupons")}</p>
                </div>
            {:else}
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            <th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t("promotions.code")}</th>
                            <th class="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t("common.name")}</th>
                            <th class="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t("promotions.value")}</th>
                            <th class="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">{t("promotions.status")}</th>
                            <th class="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t("reports.usageCount")}</th>
                            <th class="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t("reports.usageLimit")}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {#each paginatedRows as c}
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                <td class="px-5 py-3">
                                    <code class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded font-mono font-bold">{c.code}</code>
                                </td>
                                <td class="px-5 py-3 text-gray-900 dark:text-white">{c.name}</td>
                                <td class="px-5 py-3 text-right text-gray-900 dark:text-white">{formatValue(c.type, c.value)}</td>
                                <td class="px-5 py-3 text-center">
                                    {#if c.isActive}
                                        <CheckCircle class="w-4 h-4 text-success-500 mx-auto" />
                                    {:else}
                                        <XCircle class="w-4 h-4 text-gray-300 dark:text-gray-600 mx-auto" />
                                    {/if}
                                </td>
                                <td class="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white">{new Intl.NumberFormat("lo-LA").format(c.usageCount)}</td>
                                <td class="px-5 py-3 text-right text-gray-500 dark:text-gray-400">
                                    {#if c.usageLimit}
                                        {new Intl.NumberFormat("lo-LA").format(c.usageLimit)}
                                        <span class="text-xs text-gray-400">({c.usagePct}%)</span>
                                    {:else}
                                        <span class="text-gray-300 dark:text-gray-600">∞</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </div>
    {/if}
    {#if !loading && !error && activeTotal > 0}
        <div class="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3">
            <select bind:value={pageSize} onchange={() => currentPage = 1} class="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                {#each pageSizeOptions as size}<option value={size}>{size} / ໜ້າ</option>{/each}
            </select>
            <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500">{currentPage} / {totalPages} · {activeTotal} ລາຍການ</span>
                <button onclick={() => currentPage--} disabled={currentPage <= 1} class="p-2 rounded-lg border disabled:opacity-40"><ChevronLeft class="w-4 h-4" /></button>
                <button onclick={() => currentPage++} disabled={currentPage >= totalPages} class="p-2 rounded-lg border disabled:opacity-40"><ChevronRight class="w-4 h-4" /></button>
            </div>
        </div>
    {/if}
</div>
