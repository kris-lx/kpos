<script lang="ts">
    import { api } from "$api";
    import { toast } from "svelte-sonner";
    import { CalendarClock, Clock3, Loader2, X } from "lucide-svelte";

    type DayRow = {
        dayOfWeek: number;
        label: string;
        enabled: boolean;
        startTime: string;
        endTime: string;
        earlyClockOutGraceMinutes: number;
    };

    let { staff, branchId, branchOptions = [], onclose }: { staff: any; branchId: string | null; branchOptions?: { id: string; name: string }[]; onclose: () => void } = $props();
    // When the staff member has no single fixed branch (store-level
    // assignment across many branches), branchId is null and the caller
    // supplies branchOptions instead — let the owner pick which branch's
    // schedule they're setting.
    let selectedBranchId = $state("");
    let initializedBranch = false;
    let isLoading = $state(true);
    let isSaving = $state(false);
    let timezone = $state("Asia/Vientiane");
    function defaultDays(): DayRow[] {
        return [
            { dayOfWeek: 1, label: "Monday", enabled: true, startTime: "09:00", endTime: "17:00", earlyClockOutGraceMinutes: 0 },
            { dayOfWeek: 2, label: "Tuesday", enabled: true, startTime: "09:00", endTime: "17:00", earlyClockOutGraceMinutes: 0 },
            { dayOfWeek: 3, label: "Wednesday", enabled: true, startTime: "09:00", endTime: "17:00", earlyClockOutGraceMinutes: 0 },
            { dayOfWeek: 4, label: "Thursday", enabled: true, startTime: "09:00", endTime: "17:00", earlyClockOutGraceMinutes: 0 },
            { dayOfWeek: 5, label: "Friday", enabled: true, startTime: "09:00", endTime: "17:00", earlyClockOutGraceMinutes: 0 },
            { dayOfWeek: 6, label: "Saturday", enabled: false, startTime: "09:00", endTime: "17:00", earlyClockOutGraceMinutes: 0 },
            { dayOfWeek: 0, label: "Sunday", enabled: false, startTime: "09:00", endTime: "17:00", earlyClockOutGraceMinutes: 0 },
        ];
    }
    let days = $state<DayRow[]>(defaultDays());

    async function loadSchedule() {
        // Reset first — switching the branch picker must not leave a
        // sibling branch's enabled days/times showing under a branch that
        // has no schedule saved yet.
        days = defaultDays();
        if (!selectedBranchId) {
            isLoading = false;
            return;
        }
        isLoading = true;
        try {
            const response = await api.get(`staff/${staff.id}/work-schedules?branchId=${encodeURIComponent(selectedBranchId)}`).json<any>();
            if (response.success && response.data?.length) {
                const existing = new Map(response.data.map((row: any) => [row.dayOfWeek, row]));
                timezone = response.data[0].timezone || timezone;
                days = days.map((day) => {
                    const row: any = existing.get(day.dayOfWeek);
                    return row ? {
                        ...day,
                        enabled: true,
                        startTime: row.startTime,
                        endTime: row.endTime,
                        earlyClockOutGraceMinutes: row.earlyClockOutGraceMinutes ?? 0,
                    } : { ...day, enabled: false };
                });
            }
        } catch (error: any) {
            const body = await error.response?.json?.();
            toast.error(body?.error?.message || "Unable to load work schedule");
        } finally {
            isLoading = false;
        }
    }

    async function saveSchedule() {
        if (!selectedBranchId) return;
        isSaving = true;
        try {
            const response = await api.put(`staff/${staff.id}/work-schedules`, {
                json: {
                    branchId: selectedBranchId,
                    timezone,
                    schedules: days.filter((day) => day.enabled).map(({ label: _label, enabled: _enabled, ...day }) => day),
                },
            }).json<any>();
            if (response.success) {
                toast.success("Work schedule saved");
                onclose();
            }
        } catch (error: any) {
            const body = await error.response?.json?.();
            toast.error(body?.error?.message || "Unable to save work schedule");
        } finally {
            isSaving = false;
        }
    }

    // Runs on mount (reads selectedBranchId, so it always fires once
    // immediately) and again whenever the branch picker below changes it.
    // The modal previously never called loadSchedule() at all — it opened
    // permanently stuck on the loading spinner with Save disabled, which is
    // the direct cause of "can't set a schedule" independent of the
    // branch-picker gap this component also fixes.
    $effect(() => {
        if (!initializedBranch) {
            initializedBranch = true;
            selectedBranchId = branchId || branchOptions[0]?.id || "";
            return;
        }
        selectedBranchId;
        loadSchedule();
    });
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
    <button class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" aria-label="Close schedule" onclick={onclose}></button>
    <section class="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header class="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <div class="flex items-center gap-3">
                <div class="rounded-xl bg-primary-100 p-2.5 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                    <CalendarClock class="h-5 w-5" />
                </div>
                <div>
                    <h2 id="schedule-title" class="text-lg font-bold text-slate-900 dark:text-white">Work schedule</h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400">{staff.name} · {staff.branch || "Assigned branch"}</p>
                </div>
            </div>
            <button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Close" onclick={onclose}>
                <X class="h-5 w-5" />
            </button>
        </header>

        <div class="overflow-y-auto p-5">
            <div class="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <Clock3 class="mt-0.5 h-4 w-4 shrink-0" />
                <p>Employees cannot close their own shift before the configured end time. Set grace to 0 for strict enforcement. Overnight schedules are supported.</p>
            </div>

            {#if !branchId && branchOptions.length > 0}
                <label class="mb-5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    ສາຂາ
                    <select bind:value={selectedBranchId} class="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                        {#each branchOptions as branch (branch.id)}
                            <option value={branch.id}>{branch.name}</option>
                        {/each}
                    </select>
                    <span class="mt-1 block text-xs font-normal text-slate-400 dark:text-slate-500">ພະນັກງານຄົນນີ້ຖືກມອບໝາຍຫຼາຍສາຂາ — ຕາຕະລາງເວລາຕັ້ງແຍກຕໍ່ສາຂາ</span>
                </label>
            {/if}

            <label class="mb-5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Timezone
                <select bind:value={timezone} class="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    <option value="Asia/Vientiane">Asia/Vientiane (UTC+7)</option>
                    <option value="Asia/Bangkok">Asia/Bangkok (UTC+7)</option>
                </select>
            </label>

            {#if isLoading}
                <div class="flex min-h-48 items-center justify-center text-slate-500"><Loader2 class="mr-2 h-5 w-5 animate-spin" /> Loading schedule…</div>
            {:else}
                <div class="space-y-2">
                    <div class="hidden grid-cols-[1.25fr_1fr_1fr_0.8fr] gap-3 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:grid">
                        <span>Work day</span><span>Start</span><span>End</span><span>Grace</span>
                    </div>
                    {#each days as day (day.dayOfWeek)}
                        <div class="grid gap-3 rounded-xl border p-3 transition-colors sm:grid-cols-[1.25fr_1fr_1fr_0.8fr] sm:items-center {day.enabled ? 'border-primary-200 bg-primary-50/40 dark:border-primary-900/70 dark:bg-primary-950/20' : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40'}">
                            <label class="flex items-center gap-3 font-medium text-slate-800 dark:text-slate-200">
                                <input type="checkbox" bind:checked={day.enabled} class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                                {day.label}
                            </label>
                            <label class="text-xs text-slate-500 sm:text-transparent">Start<input aria-label={`${day.label} start time`} type="time" bind:value={day.startTime} disabled={!day.enabled} class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 disabled:opacity-40 sm:mt-0 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                            <label class="text-xs text-slate-500 sm:text-transparent">End<input aria-label={`${day.label} end time`} type="time" bind:value={day.endTime} disabled={!day.enabled} class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 disabled:opacity-40 sm:mt-0 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                            <label class="text-xs text-slate-500 sm:text-transparent">Grace<input aria-label={`${day.label} grace minutes`} type="number" min="0" max="180" step="1" bind:value={day.earlyClockOutGraceMinutes} disabled={!day.enabled} class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 disabled:opacity-40 sm:mt-0 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <footer class="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
            <button class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" onclick={onclose}>Cancel</button>
            <button class="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50" onclick={saveSchedule} disabled={isLoading || isSaving || !selectedBranchId}>
                {#if isSaving}<Loader2 class="h-4 w-4 animate-spin" />{/if}
                Save schedule
            </button>
        </footer>
    </section>
</div>
