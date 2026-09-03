<script lang="ts">
    import { api } from '$lib/api';
    import { toast } from 'svelte-sonner';
    import { t } from '$lib/i18n/index.svelte';
    import { CalendarClock, FileCheck2, Loader2, ShieldAlert } from 'lucide-svelte';

    type WorkPolicy = {
        id: string; name: string; effectiveFrom: string; standardHoursPerDay: number;
        monthlyWorkDays: number; overtimeMultiplier: number; weekendMultiplier: number;
        holidayMultiplier: number; roundingMinutes: number; maxShiftHours: number;
        overtimeEveningMultiplier: number; overtimeNightMultiplier: number;
        weekendEveningMultiplier: number; weekendNightMultiplier: number;
        holidayEveningMultiplier: number; holidayNightMultiplier: number;
        nightShiftPremiumRate: number;
        weekendDays: number[]; holidayDates: string[]; sourceReference?: string; timezone: string;
        lateGraceMinutes: number; earlyLeaveGraceMinutes: number;
        lateDeductionMultiplier: number; earlyLeaveDeductionMultiplier: number;
    };

    let { branchId = '', canConfigure = false, onSaved = () => {} }: {
        branchId?: string; canConfigure?: boolean; onSaved?: () => void | Promise<void>;
    } = $props();

    const today = new Date().toISOString().slice(0, 10);
    const weekDayKeys = [0, 1, 2, 3, 4, 5, 6];
    let policies = $state<WorkPolicy[]>([]);
    let loading = $state(false);
    let saving = $state(false);
    let editing = $state(false);
    let holidayDatesText = $state('');
    let form = $state({
        name: t('finance.workPolicy.defaultName'), effectiveFrom: today,
        standardHoursPerDay: '8', monthlyWorkDays: '26', overtimeMultiplier: '1.5',
        overtimeEveningMultiplier: '2', overtimeNightMultiplier: '3',
        weekendMultiplier: '2.5', weekendEveningMultiplier: '3', weekendNightMultiplier: '3.5',
        holidayMultiplier: '2.5', holidayEveningMultiplier: '3', holidayNightMultiplier: '3.5',
        nightShiftPremiumRate: '0.15', roundingMinutes: '1',
        maxShiftHours: '24', weekendDays: [0] as number[], timezone: 'Asia/Vientiane',
        lateGraceMinutes: '5', earlyLeaveGraceMinutes: '5',
        lateDeductionMultiplier: '1', earlyLeaveDeductionMultiplier: '1', sourceReference: '',
    });
    const current = $derived(policies[0]);

    async function message(error: any, fallback: string) {
        try { const body = await error?.response?.json(); return body?.error?.message || fallback; } catch { return fallback; }
    }

    async function load() {
        if (!branchId) { policies = []; return; }
        loading = true;
        try {
            const response = await api.get(`finance/payroll/work-policies?branchId=${encodeURIComponent(branchId)}`).json<any>();
            policies = Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            policies = [];
            toast.error(await message(error, t('finance.workPolicy.loadFailed')));
        } finally { loading = false; }
    }

    function toggleWeekend(day: number) {
        form.weekendDays = form.weekendDays.includes(day)
            ? form.weekendDays.filter(item => item !== day)
            : [...form.weekendDays, day].sort();
    }

    async function save(event: SubmitEvent) {
        event.preventDefault();
        if (!branchId) { toast.error(t('finance.workPolicy.selectBranchFirst')); return; }
        saving = true;
        try {
            await api.post('finance/payroll/work-policies', { json: {
                ...form, branchId,
                standardHoursPerDay: Number(form.standardHoursPerDay),
                monthlyWorkDays: Number(form.monthlyWorkDays),
                overtimeMultiplier: Number(form.overtimeMultiplier),
                overtimeEveningMultiplier: Number(form.overtimeEveningMultiplier),
                overtimeNightMultiplier: Number(form.overtimeNightMultiplier),
                weekendMultiplier: Number(form.weekendMultiplier),
                weekendEveningMultiplier: Number(form.weekendEveningMultiplier),
                weekendNightMultiplier: Number(form.weekendNightMultiplier),
                holidayMultiplier: Number(form.holidayMultiplier),
                holidayEveningMultiplier: Number(form.holidayEveningMultiplier),
                holidayNightMultiplier: Number(form.holidayNightMultiplier),
                nightShiftPremiumRate: Number(form.nightShiftPremiumRate),
                roundingMinutes: Number(form.roundingMinutes),
                maxShiftHours: Number(form.maxShiftHours),
                lateGraceMinutes: Number(form.lateGraceMinutes),
                earlyLeaveGraceMinutes: Number(form.earlyLeaveGraceMinutes),
                lateDeductionMultiplier: Number(form.lateDeductionMultiplier),
                earlyLeaveDeductionMultiplier: Number(form.earlyLeaveDeductionMultiplier),
                holidayDates: holidayDatesText.split(',').map(value => value.trim()).filter(Boolean),
            } }).json();
            toast.success(t('finance.workPolicy.saveSuccess'));
            editing = false;
            await load();
            await onSaved();
        } catch (error) { toast.error(await message(error, t('finance.workPolicy.saveFailed'))); }
        finally { saving = false; }
    }

    $effect(() => { branchId; void load(); });
</script>

<section data-testid="payroll-work-policy" class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <header class="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
        <div><div class="flex items-center gap-2 font-bold"><CalendarClock class="h-4 w-4 text-cyan-500" /> {t('finance.workPolicy.title')}</div><p class="mt-1 text-xs text-slate-500">{t('finance.workPolicy.subtitle')}</p></div>
        {#if canConfigure && branchId}
            <button type="button" class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onclick={() => editing = !editing}>{editing ? t('finance.workPolicy.cancel') : t('finance.workPolicy.newPolicy')}</button>
        {:else if branchId}
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{t('finance.policyReadOnly')}</span>
        {/if}
    </header>

    {#if !branchId}
        <div class="p-5 text-sm text-slate-500">{t('finance.workPolicy.selectBranch')}</div>
    {:else if loading}
        <div class="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 class="h-4 w-4 animate-spin" /> {t('finance.workPolicy.loading')}</div>
    {:else if current && !editing}
        <div class="space-y-4 p-5 text-sm">
            <div class="flex items-start gap-3"><FileCheck2 class="mt-0.5 h-5 w-5 text-emerald-500" /><div><div class="font-semibold">{current.name}</div><div class="text-xs text-slate-500">{t('finance.workPolicy.effective')} {new Date(current.effectiveFrom).toLocaleDateString('lo-LA')}</div></div></div>
            <dl class="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950">
                <div><dt class="text-slate-500">{t('finance.workPolicy.standardDay')}</dt><dd class="mt-1 font-semibold">{current.standardHoursPerDay} ຊມ</dd></div>
                <div><dt class="text-slate-500">{t('finance.workPolicy.monthlyWorkdays')}</dt><dd class="mt-1 font-semibold">{current.monthlyWorkDays}</dd></div>
                <div><dt class="text-slate-500">{t('finance.workPolicy.normalOt')}</dt><dd class="mt-1 font-semibold">×{current.overtimeMultiplier} / ×{current.overtimeEveningMultiplier} / ×{current.overtimeNightMultiplier}</dd></div>
                <div><dt class="text-slate-500">{t('finance.workPolicy.weekendHoliday')}</dt><dd class="mt-1 font-semibold">×{current.weekendMultiplier}–×{current.weekendNightMultiplier} / ×{current.holidayMultiplier}–×{current.holidayNightMultiplier}</dd></div>
                <div><dt class="text-slate-500">{t('finance.workPolicy.nightPremium')}</dt><dd class="mt-1 font-semibold">{Number(current.nightShiftPremiumRate || 0) * 100}%</dd></div>
                <div><dt class="text-slate-500">{t('finance.workPolicy.lateRule')}</dt><dd class="mt-1 font-semibold">{current.lateGraceMinutes} min · ×{current.lateDeductionMultiplier}</dd></div>
                <div><dt class="text-slate-500">{t('finance.workPolicy.earlyRule')}</dt><dd class="mt-1 font-semibold">{current.earlyLeaveGraceMinutes} min · ×{current.earlyLeaveDeductionMultiplier}</dd></div>
            </dl>
            <p class="break-words text-xs text-slate-500">{t('finance.workPolicy.source')}: {current.sourceReference || t('finance.workPolicy.notRecorded')}</p>
        </div>
    {:else if !editing}
        <div class="p-5"><div class="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"><ShieldAlert class="h-5 w-5 shrink-0" /><div><strong>{t('finance.workPolicy.blockedTitle')}</strong><p class="mt-1 text-xs">{t('finance.workPolicy.blockedBody')}</p></div></div></div>
    {:else}
        <form class="space-y-4 p-5" onsubmit={save}>
            <div class="grid gap-3 sm:grid-cols-2">
                <label class="text-xs text-slate-500">{t('finance.workPolicy.name')}<input required bind:value={form.name} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.effective')}<input required type="date" bind:value={form.effectiveFrom} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.timezone')}<select bind:value={form.timezone} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"><option value="Asia/Vientiane">Asia/Vientiane (UTC+7)</option><option value="UTC">UTC</option><option value="Asia/Bangkok">Asia/Bangkok (UTC+7)</option></select></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.hoursPerDay')}<input required min="0.25" max="24" step="0.25" type="number" bind:value={form.standardHoursPerDay} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.workdaysPerMonth')}<input required min="1" max="31" step="0.5" type="number" bind:value={form.monthlyWorkDays} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.otMultiplier')}<input required min="0" max="10" step="0.01" type="number" bind:value={form.overtimeMultiplier} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.otEveningMultiplier')}<input required min="0" max="10" step="0.01" type="number" bind:value={form.overtimeEveningMultiplier} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.otNightMultiplier')}<input required min="0" max="10" step="0.01" type="number" bind:value={form.overtimeNightMultiplier} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.weekendMultiplier')}<input required min="0" max="10" step="0.01" type="number" bind:value={form.weekendMultiplier} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.weekendEveningMultiplier')}<input required min="0" max="10" step="0.01" type="number" bind:value={form.weekendEveningMultiplier} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.weekendNightMultiplier')}<input required min="0" max="10" step="0.01" type="number" bind:value={form.weekendNightMultiplier} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.holidayMultiplier')}<input required min="0" max="10" step="0.01" type="number" bind:value={form.holidayMultiplier} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.holidayEveningMultiplier')}<input required min="0" max="10" step="0.01" type="number" bind:value={form.holidayEveningMultiplier} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.holidayNightMultiplier')}<input required min="0" max="10" step="0.01" type="number" bind:value={form.holidayNightMultiplier} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.nightPremium')}<input required min="0" max="1" step="0.01" type="number" bind:value={form.nightShiftPremiumRate} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.roundingMinutes')}<input required min="1" max="60" type="number" bind:value={form.roundingMinutes} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-500">{t('finance.workPolicy.maxShiftHours')}<input required min="0.25" max="48" step="0.25" type="number" bind:value={form.maxShiftHours} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
            </div>
            <fieldset class="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/20"><legend class="px-1 text-xs font-semibold text-amber-900 dark:text-amber-200">{t('finance.workPolicy.attendanceDeductions')}</legend><p class="mb-3 text-xs text-amber-800/80 dark:text-amber-200/70">{t('finance.workPolicy.attendanceHelp')}</p><div class="grid gap-3 sm:grid-cols-2">
                <label class="text-xs text-slate-600 dark:text-slate-300">{t('finance.workPolicy.lateGrace')}<input required min="0" max="180" type="number" bind:value={form.lateGraceMinutes} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-600 dark:text-slate-300">{t('finance.workPolicy.lateMultiplier')}<input required min="0" max="10" step="0.01" type="number" bind:value={form.lateDeductionMultiplier} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-600 dark:text-slate-300">{t('finance.workPolicy.earlyGrace')}<input required min="0" max="180" type="number" bind:value={form.earlyLeaveGraceMinutes} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-xs text-slate-600 dark:text-slate-300">{t('finance.workPolicy.earlyMultiplier')}<input required min="0" max="10" step="0.01" type="number" bind:value={form.earlyLeaveDeductionMultiplier} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
            </div></fieldset>
            <fieldset class="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><legend class="px-1 text-xs font-semibold">{t('finance.workPolicy.weekendDays')}</legend><div class="mt-2 grid grid-cols-4 gap-2 text-xs">{#each weekDayKeys as day}<label class="flex items-center gap-1.5"><input type="checkbox" checked={form.weekendDays.includes(day)} onchange={() => toggleWeekend(day)} /> {t(`finance.workPolicy.day.${day}`)}</label>{/each}</div></fieldset>
            <label class="block text-xs text-slate-500">{t('finance.workPolicy.holidayDates')}<input bind:value={holidayDatesText} placeholder="2026-12-02, 2027-01-01" class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
            <label class="block text-xs text-slate-500">{t('finance.workPolicy.sourceReference')}<input required bind:value={form.sourceReference} placeholder={t('finance.workPolicy.sourceReferencePlaceholder')} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
            <button disabled={saving} class="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{#if saving}<Loader2 class="h-4 w-4 animate-spin" />{/if} {t('finance.workPolicy.save')}</button>
        </form>
    {/if}
</section>
