<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatCurrency } from "$lib/utils";
    import { ArrowUpRight, ArrowDownRight, Calendar, RefreshCw, Loader2, ChevronLeft, ChevronRight } from "lucide-svelte";
    import { cn } from "$lib/utils";

    let loading = $state(false);
    let error = $state<string | null>(null);

    const today = new Date().toISOString().split("T")[0];
    const mtdStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const lastMoStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split("T")[0];
    const lastMoEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split("T")[0];

    let from1 = $state(mtdStart);
    let to1 = $state(today);
    let from2 = $state(lastMoStart);
    let to2 = $state(lastMoEnd);

    let result = $state<any>(null);
    const pageSizeOptions = [5, 10, 20, 50, 70, 100];
    let pageSize = $state(5);
    let currentPage = $state(1);

    async function compare() {
        loading = true;
        error = null;
        try {
            const res = await api.get(`reports/period-compare?from1=${from1}&to1=${to1}&from2=${from2}&to2=${to2}`).json<any>();
            result = res.data || null;
        } catch (e) {
            error = t('common.loadError');
        } finally {
            loading = false;
        }
    }

    function pctBadge(pct: number) {
        if (pct === 0) return null;
        return { positive: pct > 0, label: (pct > 0 ? "+" : "") + pct.toFixed(1) + "%" };
    }

    $effect(() => {
        compare();
    });
</script>

<svelte:head>
    <title>{t("reports.periodCompare")} - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <div class="flex items-center gap-4 mb-6">
        <a href="/reports" class="text-sm text-primary-600 dark:text-primary-400 hover:underline">← {t("reports.title")}</a>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {t("reports.periodCompare")}
        </h1>
    </div>

    <!-- Period Pickers -->
    <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm mb-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Period 1 -->
            <div>
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center">1</span>
                    {t("reports.period1")}
                </h3>
                <div class="flex gap-2">
                    <div class="flex-1">
                        <label for="a11y-app-reports-period-compare-page-svelte-1" class="text-xs text-gray-500 block mb-1">{t("common.from")}</label>
                        <input id="a11y-app-reports-period-compare-page-svelte-1" type="date" bind:value={from1} class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div class="flex-1">
                        <label for="a11y-app-reports-period-compare-page-svelte-2" class="text-xs text-gray-500 block mb-1">{t("common.to")}</label>
                        <input id="a11y-app-reports-period-compare-page-svelte-2" type="date" bind:value={to1} class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                </div>
            </div>
            <!-- Period 2 -->
            <div>
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-gray-400 text-white text-xs flex items-center justify-center">2</span>
                    {t("reports.period2")}
                </h3>
                <div class="flex gap-2">
                    <div class="flex-1">
                        <label for="a11y-app-reports-period-compare-page-svelte-3" class="text-xs text-gray-500 block mb-1">{t("common.from")}</label>
                        <input id="a11y-app-reports-period-compare-page-svelte-3" type="date" bind:value={from2} class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div class="flex-1">
                        <label for="a11y-app-reports-period-compare-page-svelte-4" class="text-xs text-gray-500 block mb-1">{t("common.to")}</label>
                        <input id="a11y-app-reports-period-compare-page-svelte-4" type="date" bind:value={to2} class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                </div>
            </div>
        </div>
        <button
            onclick={compare}
            disabled={loading}
            class="mt-4 flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
            {#if loading}
                <Loader2 class="w-4 h-4 animate-spin" />
            {:else}
                <RefreshCw class="w-4 h-4" />
            {/if}
            {t("reports.compare")}
        </button>
    </div>

    {#if error}
        <div class="p-4 bg-danger-50 dark:bg-danger-900/20 rounded-xl text-danger-700 dark:text-danger-300 text-sm mb-6">{error}</div>
    {/if}

    {#if result}
        <!-- Comparison Table -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t("reports.metric")}</th>
                        <th class="px-6 py-3 text-right text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase">
                            {from1} → {to1}
                        </th>
                        <th class="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                            {from2} → {to2}
                        </th>
                        <th class="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t("reports.change")}</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {#each ([
                        { label: t("reports.totalSales"), v1: formatCurrency(result.period1.sales), v2: formatCurrency(result.period2.sales), pct: result.diff.salesChangePct },
                        { label: t("reports.totalOrders"), v1: new Intl.NumberFormat("lo-LA").format(result.period1.orders), v2: new Intl.NumberFormat("lo-LA").format(result.period2.orders), pct: result.diff.ordersChangePct },
                        { label: t("reports.avgOrderValue"), v1: formatCurrency(result.period1.avgOrder), v2: formatCurrency(result.period2.avgOrder), pct: result.diff.avgOrderChangePct },
                        { label: t("reports.tax"), v1: formatCurrency(result.period1.tax), v2: formatCurrency(result.period2.tax), pct: null },
                        { label: t("reports.discount"), v1: formatCurrency(result.period1.discount), v2: formatCurrency(result.period2.discount), pct: null },
                    ]).slice((currentPage - 1) * pageSize, currentPage * pageSize) as row}
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td class="px-6 py-4 font-medium text-gray-900 dark:text-white">{row.label}</td>
                            <td class="px-6 py-4 text-right font-semibold text-gray-900 dark:text-white">{row.v1}</td>
                            <td class="px-6 py-4 text-right text-gray-500 dark:text-gray-400">{row.v2}</td>
                            <td class="px-6 py-4 text-right">
                                {#if row.pct !== null}
                                    {@const badge = pctBadge(row.pct)}
                                    {#if badge}
                                        <span class={cn("inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full",
                                            badge.positive ? "text-success-700 bg-success-50 dark:text-success-400 dark:bg-success-900/20" : "text-danger-700 bg-danger-50 dark:text-danger-400 dark:bg-danger-900/20"
                                        )}>
                                            {#if badge.positive}<ArrowUpRight class="w-3 h-3" />{:else}<ArrowDownRight class="w-3 h-3" />{/if}
                                            {badge.label}
                                        </span>
                                    {:else}
                                        <span class="text-gray-400 text-xs">—</span>
                                    {/if}
                                {:else}
                                    <span class="text-gray-300 dark:text-gray-600 text-xs">—</span>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <div class="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3">
            <select bind:value={pageSize} onchange={() => currentPage = 1} class="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                {#each pageSizeOptions as size}<option value={size}>{size} / ໜ້າ</option>{/each}
            </select>
            <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500">{currentPage} / {Math.max(1, Math.ceil(5 / pageSize))} · 5 ລາຍການ</span>
                <button onclick={() => currentPage--} disabled={currentPage <= 1} class="p-2 rounded-lg border disabled:opacity-40"><ChevronLeft class="w-4 h-4" /></button>
                <button onclick={() => currentPage++} disabled={currentPage >= Math.ceil(5 / pageSize)} class="p-2 rounded-lg border disabled:opacity-40"><ChevronRight class="w-4 h-4" /></button>
            </div>
        </div>
    {:else if !loading}
        <div class="bg-white dark:bg-gray-800 rounded-xl p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
            <Calendar class="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>{t("reports.selectPeriods")}</p>
        </div>
    {/if}
</div>
