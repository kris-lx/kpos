<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '$lib/api';
    import { t } from '$lib/i18n/index.svelte';
    import { toast } from 'svelte-sonner';
    import { BadgeDollarSign, ChevronDown, Loader2, ReceiptText } from 'lucide-svelte';

    type PayslipSummary = {
        id: string; periodStart: string; periodEnd: string; status: string; currency: string;
        branchName?: string; grossPay: number; deductions: number; netPay: number;
    };

    let periods = $state<PayslipSummary[]>([]);
    let details = $state<Record<string, any>>({});
    let expandedId = $state('');
    let loading = $state(true);
    let detailLoading = $state(false);

    function money(value: unknown, currency = 'LAK') {
        return `${new Intl.NumberFormat('lo-LA', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${currency}`;
    }

    async function errorMessage(error: any) {
        try { const body = await error?.response?.json(); return body?.error?.message || t('payslips.loadFailed'); }
        catch { return t('payslips.loadFailed'); }
    }

    async function loadPeriods() {
        loading = true;
        try {
            const response = await api.get('finance/payroll/me/periods').json<any>();
            periods = Array.isArray(response.data) ? response.data : [];
        } catch (error) { toast.error(await errorMessage(error)); }
        finally { loading = false; }
    }

    async function toggle(period: PayslipSummary) {
        if (expandedId === period.id) { expandedId = ''; return; }
        expandedId = period.id;
        if (details[period.id]) return;
        detailLoading = true;
        try {
            const response = await api.get(`finance/payroll/me/periods/${period.id}`).json<any>();
            details = { ...details, [period.id]: response.data };
        } catch (error) { toast.error(await errorMessage(error)); expandedId = ''; }
        finally { detailLoading = false; }
    }

    onMount(loadPeriods);
</script>

<div class="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 md:p-6">
    <div class="mx-auto max-w-5xl space-y-6">
        <header class="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950 via-slate-950 to-cyan-950 p-6 text-white shadow-xl md:p-8">
            <div class="flex items-center gap-4"><div class="rounded-2xl bg-white/10 p-3"><BadgeDollarSign class="h-7 w-7 text-cyan-300" /></div><div><h1 class="text-2xl font-bold">{t('payslips.title')}</h1><p class="mt-1 text-sm text-slate-300">{t('payslips.subtitle')}</p></div></div>
        </header>

        {#if loading}
            <div class="flex items-center justify-center gap-2 rounded-2xl border bg-white p-12 text-slate-500 dark:border-slate-800 dark:bg-slate-900"><Loader2 class="h-5 w-5 animate-spin" /> {t('common.loading')}</div>
        {:else if periods.length === 0}
            <div class="rounded-2xl border bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900"><ReceiptText class="mx-auto h-10 w-10 text-slate-300" /><p class="mt-3 text-slate-500">{t('payslips.empty')}</p></div>
        {:else}
            <div class="space-y-3">
                {#each periods as period (period.id)}
                    <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <button type="button" class="flex w-full items-center justify-between gap-4 p-5 text-left" onclick={() => toggle(period)}>
                            <div><div class="font-semibold">{new Date(period.periodStart).toLocaleDateString('lo-LA')} — {new Date(period.periodEnd).toLocaleDateString('lo-LA')}</div><div class="mt-1 text-xs text-slate-500">{period.branchName || t('finance.wholeStore')} · {t(`finance.periodStatus.${period.status}`)}</div></div>
                            <div class="flex items-center gap-4"><div class="text-right"><div class="text-xs text-slate-500">{t('finance.net')}</div><div class="font-bold text-violet-600">{money(period.netPay, period.currency)}</div></div><ChevronDown class="h-4 w-4 transition-transform {expandedId === period.id ? 'rotate-180' : ''}" /></div>
                        </button>
                        {#if expandedId === period.id}
                            {#if detailLoading && !details[period.id]}
                                <div class="flex justify-center border-t p-8 dark:border-slate-800"><Loader2 class="h-5 w-5 animate-spin" /></div>
                            {:else if details[period.id]}
                                {@const item = details[period.id]}
                                <div class="grid gap-3 border-t border-slate-200 bg-slate-50 p-5 text-sm dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-2 lg:grid-cols-4">
                                    {#each [
                                        [t('finance.base'), item.basePay], [t('finance.otPay'), item.overtimePay],
                                        [t('finance.additions'), Number(item.commission) + Number(item.allowance) + Number(item.reimbursement)],
                                        [t('finance.gross'), item.grossPay], [t('finance.tax'), item.incomeTax],
                                        [t('finance.social'), item.employeeSocialSecurity], [t('finance.otherDeduction'), item.otherDeductions],
                                        [t('finance.net'), item.netPay]
                                    ] as row}
                                        <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><div class="text-xs text-slate-500">{row[0]}</div><div class="mt-1 font-semibold">{money(row[1], item.currency)}</div></div>
                                    {/each}
                                </div>
                            {/if}
                        {/if}
                    </article>
                {/each}
            </div>
        {/if}
    </div>
</div>
