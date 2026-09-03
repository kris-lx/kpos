<script lang="ts">
    import { api } from '$lib/api';
    import { toast } from 'svelte-sonner';
    import { t } from '$lib/i18n/index.svelte';
    import { Calculator, FileCheck2, Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-svelte';
    import MoneyInput from '$lib/components/MoneyInput.svelte';

    type BracketDraft = { upTo: string; rate: string };
    type TaxProfile = {
        id: string; name: string; currency: string; effectiveFrom: string;
        taxBrackets: Array<{ upTo: number | null; rate: number }>;
        taxableDeduction: number; employeeSocialRate: number; employerSocialRate: number;
        socialContributionCap: number; sourceReference?: string;
    };

    let { branchId = '', canConfigure = false, onSaved = () => {} }: {
        branchId?: string; canConfigure?: boolean; onSaved?: () => void | Promise<void>;
    } = $props();

    const today = new Date().toISOString().slice(0, 10);
    let profiles = $state<TaxProfile[]>([]);
    let loading = $state(false);
    let saving = $state(false);
    let editing = $state(false);
    let form = $state({
        name: t('finance.taxProfile.defaultName'), effectiveFrom: today, currency: 'LAK', taxableDeduction: 0,
        employeeSocialRate: '0', employerSocialRate: '0', socialContributionCap: 0,
        sourceReference: '',
    });
    let brackets = $state<BracketDraft[]>([{ upTo: '', rate: '0' }]);
    const current = $derived(profiles[0]);

    async function message(error: any, fallback: string) {
        try { const body = await error?.response?.json(); return body?.error?.message || fallback; } catch { return fallback; }
    }

    async function load() {
        loading = true;
        try {
            const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
            const response = await api.get(`finance/payroll/tax-profiles${query}`).json<any>();
            profiles = Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            profiles = [];
            toast.error(await message(error, t('finance.taxProfile.loadFailed')));
        } finally { loading = false; }
    }

    function addBracket() {
        brackets = [...brackets.slice(0, -1), { upTo: '', rate: '0' }, brackets.at(-1) || { upTo: '', rate: '0' }];
    }

    function removeBracket(index: number) {
        if (index === brackets.length - 1 || brackets.length === 1) return;
        brackets = brackets.filter((_, itemIndex) => itemIndex !== index);
    }

    async function save(event: SubmitEvent) {
        event.preventDefault();
        if (!form.sourceReference.trim()) {
            toast.error(t('finance.taxProfile.needReference'));
            return;
        }
        saving = true;
        try {
            await api.post('finance/payroll/tax-profiles', { json: {
                ...form, branchId: branchId || undefined,
                taxableDeduction: form.taxableDeduction,
                employeeSocialRate: Number(form.employeeSocialRate) / 100,
                employerSocialRate: Number(form.employerSocialRate) / 100,
                socialContributionCap: form.socialContributionCap,
                taxBrackets: brackets.map((bracket, index) => ({
                    upTo: index === brackets.length - 1 ? null : Number(bracket.upTo),
                    rate: Number(bracket.rate) / 100,
                })),
            } }).json();
            toast.success(t('finance.taxProfile.saveSuccess'));
            editing = false;
            await load();
            await onSaved();
        } catch (error) { toast.error(await message(error, t('finance.taxProfile.saveFailed'))); }
        finally { saving = false; }
    }

    $effect(() => { branchId; void load(); });
</script>

<section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <header class="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
        <div>
            <div class="flex items-center gap-2 font-bold"><Calculator class="h-4 w-4 text-violet-500" /> {t('finance.taxProfile.title')}</div>
            <p class="mt-1 text-xs text-slate-500">{t('finance.taxProfile.subtitle')}</p>
        </div>
        {#if canConfigure}
            <button type="button" class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onclick={() => editing = !editing}>{editing ? t('finance.taxProfile.cancel') : t('finance.taxProfile.newProfile')}</button>
        {:else}
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{t('finance.policyReadOnly')}</span>
        {/if}
    </header>

    {#if loading}
        <div class="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 class="h-4 w-4 animate-spin" /> {t('finance.taxProfile.loading')}</div>
    {:else if current && !editing}
        <div class="space-y-4 p-5 text-sm">
            <div class="flex items-start gap-3"><FileCheck2 class="mt-0.5 h-5 w-5 text-emerald-500" /><div><div class="font-semibold">{current.name}</div><div class="text-xs text-slate-500">{t('finance.taxProfile.effective')} {new Date(current.effectiveFrom).toLocaleDateString('lo-LA')} · {current.currency}</div></div></div>
            <dl class="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950">
                <div><dt class="text-slate-500">{t('finance.taxProfile.employeeSocial')}</dt><dd class="mt-1 font-semibold">{current.employeeSocialRate * 100}%</dd></div>
                <div><dt class="text-slate-500">{t('finance.taxProfile.employerSocial')}</dt><dd class="mt-1 font-semibold">{current.employerSocialRate * 100}%</dd></div>
                <div><dt class="text-slate-500">{t('finance.taxProfile.contributionCap')}</dt><dd class="mt-1 font-semibold">{current.socialContributionCap.toLocaleString()}</dd></div>
                <div><dt class="text-slate-500">{t('finance.taxProfile.taxBrackets')}</dt><dd class="mt-1 font-semibold">{current.taxBrackets.length}</dd></div>
            </dl>
            <p class="break-words text-xs text-slate-500">{t('finance.taxProfile.source')}: {current.sourceReference || t('finance.taxProfile.notRecorded')}</p>
        </div>
    {:else if !editing}
        <div class="p-5">
            <div class="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"><ShieldAlert class="h-5 w-5 shrink-0" /><div><strong>{t('finance.taxProfile.blockedTitle')}</strong><p class="mt-1 text-xs">{t('finance.taxProfile.blockedBody')}</p></div></div>
        </div>
    {:else}
        <form class="space-y-4 p-5" onsubmit={save}>
            <div class="grid gap-3 sm:grid-cols-2">
                <label class="text-xs text-slate-500">{t('finance.taxProfile.name')}<input required bind:value={form.name} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.taxProfile.effective')}<input required type="date" bind:value={form.effectiveFrom} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.taxProfile.currency')}<select bind:value={form.currency} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"><option value="LAK">LAK</option><option value="THB">THB</option><option value="USD">USD</option></select></label>
                <label class="text-xs text-slate-500">{t('finance.taxProfile.taxableDeduction')}<MoneyInput bind:value={form.taxableDeduction} class="mt-1" /></label>
                <label class="text-xs text-slate-500">{t('finance.taxProfile.contributionCap')}<MoneyInput bind:value={form.socialContributionCap} class="mt-1" /></label>
                <label class="text-xs text-slate-500">{t('finance.taxProfile.employeeSocialPct')}<input min="0" max="100" step="0.01" type="number" bind:value={form.employeeSocialRate} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.taxProfile.employerSocialPct')}<input min="0" max="100" step="0.01" type="number" bind:value={form.employerSocialRate} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
            </div>
            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div class="mb-3 flex items-center justify-between"><div><div class="text-sm font-semibold">{t('finance.taxProfile.progressiveBrackets')}</div><p class="text-xs text-slate-500">{t('finance.taxProfile.bracketsHelp')}</p></div><button type="button" class="rounded-lg border p-1.5" aria-label={t('finance.taxProfile.addBracket')} onclick={addBracket}><Plus class="h-4 w-4" /></button></div>
                <div class="space-y-2">{#each brackets as bracket, index}
                    <div class="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <label class="text-[11px] text-slate-500">{t('finance.taxProfile.upTo')}<input required={index < brackets.length - 1} disabled={index === brackets.length - 1} placeholder={index === brackets.length - 1 ? t('finance.taxProfile.noLimit') : t('finance.taxProfile.amount')} min="0" step="0.01" type="number" bind:value={bracket.upTo} class="mt-1 w-full rounded-lg border px-2 py-1.5 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800" /></label>
                        <label class="text-[11px] text-slate-500">{t('finance.taxProfile.ratePct')}<input required min="0" max="100" step="0.01" type="number" bind:value={bracket.rate} class="mt-1 w-full rounded-lg border px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                        <button type="button" disabled={index === brackets.length - 1} class="mt-5 rounded-lg p-2 text-slate-400 hover:text-rose-600 disabled:opacity-20" aria-label={t('finance.taxProfile.removeBracket')} onclick={() => removeBracket(index)}><Trash2 class="h-4 w-4" /></button>
                    </div>
                {/each}</div>
            </div>
            <label class="block text-xs text-slate-500">{t('finance.taxProfile.sourceReference')}<input required bind:value={form.sourceReference} placeholder={t('finance.taxProfile.sourceReferencePlaceholder')} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
            <button disabled={saving} class="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{#if saving}<Loader2 class="h-4 w-4 animate-spin" />{/if} {t('finance.taxProfile.save')}</button>
        </form>
    {/if}
</section>
