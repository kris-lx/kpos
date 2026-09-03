<script lang="ts">
    import { onMount } from "svelte";
    import { api } from "$lib/api";
    import { auth } from "$stores";
    import { dialogStore } from "$lib/stores/dialog.svelte";
    import { toast } from "svelte-sonner";
    import {
        CalendarClock, Clock3, LogIn, LogOut, Pencil, Plus, RefreshCw,
        Search, ShieldAlert, TimerReset, UserRound, X,
    } from "lucide-svelte";

    interface AttendanceRecord {
        id: string; branchId: string; branchName?: string; userId: string;
        userName?: string; userEmail?: string; workDate: string;
        clockInAt: string; clockOutAt: string | null; scheduledStartAt: string | null;
        scheduledEndAt: string | null; timezone: string; status: string;
        lateMinutes: number; earlyLeaveMinutes: number; workedMinutes: number;
        note?: string | null; adjustmentReason?: string | null;
    }
    interface BranchOption { id: string; name: string; storeId: string }
    interface StaffOption { id: string; name: string; email: string; role: string }

    const canClock = $derived(auth.hasPermission("attendance:clock"));
    const canView = $derived(auth.hasPermission("attendance:view"));
    const canManage = $derived(auth.hasPermission("attendance:manage"));
    let current = $state<AttendanceRecord | null>(null);
    let records = $state<AttendanceRecord[]>([]);
    let branches = $state<BranchOption[]>([]);
    let staff = $state<StaffOption[]>([]);
    let loading = $state(true);
    let saving = $state(false);
    let clockBusy = $state(false);
    let modalOpen = $state(false);
    let editing = $state<AttendanceRecord | null>(null);
    let branchId = $state("");
    let dateFrom = $state(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
    let dateTo = $state(new Date().toISOString().slice(0, 10));
    let search = $state("");
    let form = $state({ userId: "", branchId: "", clockInAt: "", clockOutAt: "", reason: "", note: "" });

    const filteredRecords = $derived(records.filter((row) => {
        const value = `${row.userName || ""} ${row.userEmail || ""} ${row.branchName || ""}`.toLowerCase();
        return value.includes(search.trim().toLowerCase());
    }));
    const summary = $derived({
        total: records.filter((row) => row.status !== "VOID").length,
        late: records.filter((row) => row.status !== "VOID" && row.lateMinutes > 0).length,
        early: records.filter((row) => row.status !== "VOID" && row.earlyLeaveMinutes > 0).length,
        minutes: records.filter((row) => row.status !== "VOID").reduce((sum, row) => sum + row.workedMinutes, 0),
    });

    function errorMessage(error: any): string {
        return error?.response?.status === 403
            ? "ທ່ານບໍ່ມີສິດເຮັດລາຍການນີ້"
            : error?.message || "ບໍ່ສາມາດດຳເນີນການໄດ້";
    }
    function formatTime(value?: string | null): string {
        return value ? new Date(value).toLocaleString("lo-LA", { dateStyle: "medium", timeStyle: "short" }) : "—";
    }
    function duration(minutes: number): string {
        return `${Math.floor(minutes / 60)} ຊມ. ${minutes % 60} ນາທີ`;
    }
    function toLocalInput(value?: string | null): string {
        if (!value) return "";
        const date = new Date(value);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    }
    function statusClass(status: string): string {
        if (status === "OPEN") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
        if (status === "VOID") return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
        if (status === "ADJUSTED") return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
        return "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300";
    }

    async function loadBranches() {
        try {
            const response = await api.get("staff/branches/list").json<any>();
            branches = response.data || [];
            if (!branchId && branches.length === 1) branchId = branches[0].id;
        } catch { branches = []; }
    }
    async function loadCurrent() {
        if (!canClock) return;
        try {
            const response = await api.get("staff/attendance/current").json<any>();
            current = response.data || null;
        } catch (error) { console.error("Failed to load current attendance", error); }
    }
    async function loadRecords() {
        if (!canView) { records = []; return; }
        loading = true;
        if (auth.isSuperAdmin && !branchId) {
            // Platform accounts have no tenant-wide attendance scope. Wait
            // for an explicit branch instead of sending a guaranteed 400.
            records = [];
            loading = false;
            return;
        }
        try {
            const searchParams: Record<string, string> = { dateFrom, dateTo, limit: "200" };
            if (branchId) searchParams.branchId = branchId;
            const response = await api.get("staff/attendance", { searchParams }).json<any>();
            records = response.data || [];
        } catch (error) {
            records = [];
            toast.error(errorMessage(error));
        } finally { loading = false; }
    }
    async function loadStaff(targetBranchId: string) {
        staff = [];
        if (!targetBranchId || !canView) return;
        try {
            const response = await api.get("staff/attendance/staff-options", { searchParams: { branchId: targetBranchId } }).json<any>();
            staff = response.data || [];
        } catch (error) { toast.error(errorMessage(error)); }
    }
    async function clockIn() {
        if (!canClock || clockBusy) return;
        clockBusy = true;
        try {
            const response = await api.post("staff/attendance/clock-in", { json: branchId ? { branchId } : {} }).json<any>();
            current = response.data;
            toast.success(current?.lateMinutes ? `ເຂົ້າວຽກສຳເລັດ — ມາຊ້າ ${current.lateMinutes} ນາທີ` : "ເຂົ້າວຽກສຳເລັດ");
            await loadRecords();
        } catch (error) { toast.error(errorMessage(error)); }
        finally { clockBusy = false; }
    }
    async function clockOut() {
        if (!canClock || !current || clockBusy) return;
        const confirmed = await dialogStore.confirm("ຢືນຢັນການອອກວຽກຕອນນີ້? ລະບົບຈະຄຳນວນເວລາເຮັດວຽກ ແລະເວລາກັບໄວໃຫ້ອັດຕະໂນມັດ.", { title: "ອອກວຽກ", variant: "warning" });
        if (!confirmed) return;
        clockBusy = true;
        try {
            const response = await api.post("staff/attendance/clock-out").json<any>();
            current = null;
            toast.success(response.data?.earlyLeaveMinutes ? `ອອກວຽກສຳເລັດ — ກັບໄວ ${response.data.earlyLeaveMinutes} ນາທີ` : "ອອກວຽກສຳເລັດ");
            await loadRecords();
        } catch (error) { toast.error(errorMessage(error)); }
        finally { clockBusy = false; }
    }
    async function openCreate() {
        editing = null;
        const defaultBranch = branchId || branches[0]?.id || "";
        const now = toLocalInput(new Date().toISOString());
        form = { userId: "", branchId: defaultBranch, clockInAt: now, clockOutAt: now, reason: "", note: "" };
        await loadStaff(defaultBranch);
        modalOpen = true;
    }
    async function openEdit(row: AttendanceRecord) {
        editing = row;
        form = {
            userId: row.userId, branchId: row.branchId, clockInAt: toLocalInput(row.clockInAt),
            clockOutAt: toLocalInput(row.clockOutAt), reason: "", note: row.note || "",
        };
        await loadStaff(row.branchId);
        modalOpen = true;
    }
    async function saveRecord() {
        if (!canManage || saving) return;
        if (!form.userId || !form.branchId || !form.clockInAt || form.reason.trim().length < 3) {
            toast.error("ກະລຸນາປ້ອນພະນັກງານ, ສາຂາ, ເວລາເຂົ້າ ແລະເຫດຜົນ"); return;
        }
        saving = true;
        const payload = {
            userId: form.userId, branchId: form.branchId,
            clockInAt: new Date(form.clockInAt).toISOString(),
            clockOutAt: form.clockOutAt ? new Date(form.clockOutAt).toISOString() : null,
            reason: form.reason.trim(), note: form.note.trim(),
        };
        try {
            if (editing) await api.put(`staff/attendance/${editing.id}`, { json: payload }).json();
            else await api.post("staff/attendance/manual", { json: payload }).json();
            toast.success(editing ? "ແກ້ໄຂບັນທຶກສຳເລັດ" : "ເພີ່ມບັນທຶກສຳເລັດ");
            modalOpen = false;
            await Promise.all([loadCurrent(), loadRecords()]);
        } catch (error) { toast.error(errorMessage(error)); }
        finally { saving = false; }
    }
    async function voidRecord(row: AttendanceRecord) {
        if (!canManage) return;
        const reason = await dialogStore.prompt("ລະບຸເຫດຜົນທີ່ຍົກເລີກບັນທຶກນີ້", { title: "ຍົກເລີກບັນທຶກເວລາ", variant: "danger", inputType: "textarea", confirmLabel: "common.confirm" });
        if (!reason?.trim()) return;
        try {
            await api.post(`staff/attendance/${row.id}/void`, { json: { reason: reason.trim() } }).json();
            toast.success("ຍົກເລີກບັນທຶກແລ້ວ"); await Promise.all([loadCurrent(), loadRecords()]);
        } catch (error) { toast.error(errorMessage(error)); }
    }

    onMount(async () => {
        await loadBranches();
        await Promise.all([loadCurrent(), loadRecords()]);
    });
</script>

<svelte:head><title>Attendance | KPOS</title></svelte:head>

<div class="min-h-full bg-slate-50/70 p-4 dark:bg-slate-950/40 md:p-6">
    <div class="mx-auto max-w-[1500px] space-y-5">
        <section class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-900 p-6 text-white shadow-xl md:p-8">
            <div class="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl"></div>
            <div class="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <div class="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                        <CalendarClock class="h-4 w-4" /> WORK ATTENDANCE
                    </div>
                    <h1 class="text-2xl font-bold tracking-tight md:text-3xl">ບັນທຶກເຂົ້າ–ອອກວຽກ</h1>
                    <p class="mt-2 max-w-2xl text-sm text-emerald-100/80">ວັດເວລາເຮັດວຽກຈິງ, ມາຊ້າ ແລະກັບໄວຕາມຕາຕະລາງຂອງແຕ່ລະສາຂາ — ແຍກຈາກກະເງິນ POS.</p>
                </div>
                {#if canClock}
                    <div class="min-w-[290px] rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                        {#if current}
                            <p class="text-xs font-medium uppercase tracking-wider text-emerald-200">ກຳລັງເຮັດວຽກ</p>
                            <p class="mt-1 text-lg font-bold">ເຂົ້າ {formatTime(current.clockInAt)}</p>
                            <p class="mt-1 text-xs text-emerald-100/75">{current.lateMinutes > 0 ? `ມາຊ້າ ${current.lateMinutes} ນາທີ` : "ມາຕາມເວລາ"}</p>
                            <button onclick={clockOut} disabled={clockBusy} class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-400 disabled:opacity-50"><LogOut class="h-4 w-4" /> ອອກວຽກ</button>
                        {:else}
                            <p class="text-xs font-medium uppercase tracking-wider text-amber-200">ຍັງບໍ່ເຂົ້າວຽກ</p>
                            {#if branches.length > 1}
                                <select bind:value={branchId} aria-label="ສາຂາທີ່ເຂົ້າວຽກ" class="mt-3 w-full rounded-xl border border-white/20 bg-slate-900/70 px-3 py-2 text-sm text-white"><option value="">ເລືອກສາຂາ</option>{#each branches as branch}<option value={branch.id}>{branch.name}</option>{/each}</select>
                            {/if}
                            <button onclick={clockIn} disabled={clockBusy || (!branchId && branches.length > 1)} class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-emerald-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-300 disabled:opacity-50"><LogIn class="h-4 w-4" /> ເຂົ້າວຽກ</button>
                        {/if}
                    </div>
                {:else}
                    <div class="flex max-w-sm gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100"><ShieldAlert class="h-5 w-5 shrink-0" /><span>ຕ້ອງໃຫ້ Owner ມອບສິດ <code>attendance:clock</code> ກ່ອນ.</span></div>
                {/if}
            </div>
        </section>

        {#if canView}
            <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p class="text-xs text-slate-500">ບັນທຶກທັງໝົດ</p><p class="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{summary.total}</p></div>
                <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20"><p class="text-xs text-amber-700 dark:text-amber-300">ມາຊ້າ</p><p class="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">{summary.late}</p></div>
                <div class="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20"><p class="text-xs text-rose-700 dark:text-rose-300">ກັບໄວ</p><p class="mt-1 text-2xl font-bold text-rose-800 dark:text-rose-200">{summary.early}</p></div>
                <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20"><p class="text-xs text-emerald-700 dark:text-emerald-300">ຊົ່ວໂມງລວມ</p><p class="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-200">{(summary.minutes / 60).toFixed(1)}</p></div>
            </section>

            <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div class="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 xl:flex-row xl:items-end">
                    <div class="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label class="text-xs font-medium text-slate-600 dark:text-slate-300">ສາຂາ<select bind:value={branchId} class="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="">ທຸກສາຂາ</option>{#each branches as branch}<option value={branch.id}>{branch.name}</option>{/each}</select></label>
                        <label class="text-xs font-medium text-slate-600 dark:text-slate-300">ຈາກວັນທີ<input type="date" bind:value={dateFrom} class="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
                        <label class="text-xs font-medium text-slate-600 dark:text-slate-300">ເຖິງວັນທີ<input type="date" bind:value={dateTo} class="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
                        <label class="text-xs font-medium text-slate-600 dark:text-slate-300">ຄົ້ນຫາ<div class="relative mt-1"><Search class="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input bind:value={search} placeholder="ຊື່ / ອີເມວ" class="block w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></div></label>
                    </div>
                    <div class="flex gap-2">
                        <button onclick={loadRecords} class="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><RefreshCw class="h-4 w-4" /> ໂຫຼດ</button>
                        {#if canManage}<button onclick={openCreate} class="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-emerald-500 dark:text-emerald-950"><Plus class="h-4 w-4" /> ເພີ່ມບັນທຶກ</button>{/if}
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full text-left text-sm">
                        <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/60"><tr><th class="px-4 py-3">ພະນັກງານ</th><th class="px-4 py-3">ສາຂາ / ວັນທີ</th><th class="px-4 py-3">ເຂົ້າ–ອອກ</th><th class="px-4 py-3 text-right">ເວລາເຮັດວຽກ</th><th class="px-4 py-3 text-right">ມາຊ້າ / ກັບໄວ</th><th class="px-4 py-3">ສະຖານະ</th>{#if canManage}<th class="px-4 py-3 text-right">ຈັດການ</th>{/if}</tr></thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                            {#if loading}<tr><td colspan={canManage ? 7 : 6} class="px-4 py-12 text-center text-slate-500">ກຳລັງໂຫຼດ...</td></tr>
                            {:else if filteredRecords.length === 0}<tr><td colspan={canManage ? 7 : 6} class="px-4 py-14 text-center"><TimerReset class="mx-auto h-8 w-8 text-slate-300" /><p class="mt-2 text-slate-500">ບໍ່ພົບບັນທຶກເວລາ</p></td></tr>
                            {:else}{#each filteredRecords as row}
                                <tr class:opacity-50={row.status === "VOID"} class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                    <td class="px-4 py-3"><div class="flex items-center gap-3"><div class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"><UserRound class="h-4 w-4" /></div><div><p class="font-semibold text-slate-900 dark:text-white">{row.userName || "—"}</p><p class="text-xs text-slate-500">{row.userEmail}</p></div></div></td>
                                    <td class="px-4 py-3"><p class="font-medium">{row.branchName || "—"}</p><p class="text-xs text-slate-500">{row.workDate}</p></td>
                                    <td class="px-4 py-3"><p>{formatTime(row.clockInAt)}</p><p class="text-xs text-slate-500">{formatTime(row.clockOutAt)}</p></td>
                                    <td class="px-4 py-3 text-right font-semibold">{duration(row.workedMinutes)}</td>
                                    <td class="px-4 py-3 text-right"><span class:text-amber-600={row.lateMinutes > 0}>{row.lateMinutes} ນາທີ</span><span class="mx-1 text-slate-300">/</span><span class:text-rose-600={row.earlyLeaveMinutes > 0}>{row.earlyLeaveMinutes} ນາທີ</span></td>
                                    <td class="px-4 py-3"><span class={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{row.status}</span></td>
                                    {#if canManage}<td class="px-4 py-3"><div class="flex justify-end gap-1"><button onclick={() => openEdit(row)} disabled={row.status === "VOID"} title="ແກ້ໄຂ" class="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600 disabled:hidden dark:hover:bg-blue-950"><Pencil class="h-4 w-4" /></button><button onclick={() => voidRecord(row)} disabled={row.status === "VOID"} title="ຍົກເລີກ" class="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:hidden dark:hover:bg-rose-950"><X class="h-4 w-4" /></button></div></td>{/if}
                                </tr>
                            {/each}{/if}
                        </tbody>
                    </table>
                </div>
            </section>
        {/if}
    </div>
</div>

{#if modalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation">
        <div class="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="attendance-dialog-title">
        <form onsubmit={(event) => { event.preventDefault(); saveRecord(); }}>
            <div class="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><p class="text-xs font-semibold uppercase tracking-widest text-emerald-600">ATTENDANCE RECORD</p><h2 id="attendance-dialog-title" class="mt-1 text-xl font-bold text-slate-900 dark:text-white">{editing ? "ແກ້ໄຂບັນທຶກເວລາ" : "ເພີ່ມບັນທຶກດ້ວຍມື"}</h2><p class="mt-1 text-xs text-slate-500">ການແກ້ໄຂຕ້ອງລະບຸເຫດຜົນ ແລະຈະຖືກບັນທຶກໃນ Audit.</p></div><button type="button" onclick={() => (modalOpen = false)} class="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X class="h-5 w-5" /></button></div>
            <div class="grid gap-4 p-5 sm:grid-cols-2">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-200">ສາຂາ<select bind:value={form.branchId} onchange={() => loadStaff(form.branchId)} disabled={!!editing} required class="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"><option value="">ເລືອກສາຂາ</option>{#each branches as branch}<option value={branch.id}>{branch.name}</option>{/each}</select></label>
                <label class="text-sm font-medium text-slate-700 dark:text-slate-200">ພະນັກງານ<select bind:value={form.userId} disabled={!!editing} required class="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"><option value="">ເລືອກພະນັກງານ</option>{#each staff as person}<option value={person.id}>{person.name} — {person.email}</option>{/each}</select></label>
                <label class="text-sm font-medium text-slate-700 dark:text-slate-200">ເວລາເຂົ້າ<input type="datetime-local" bind:value={form.clockInAt} required class="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-sm font-medium text-slate-700 dark:text-slate-200">ເວລາອອກ <span class="font-normal text-slate-400">(ປ່ອຍຫວ່າງ = ຍັງເຮັດວຽກ)</span><input type="datetime-local" bind:value={form.clockOutAt} class="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label class="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">ເຫດຜົນການເພີ່ມ/ແກ້ໄຂ <span class="text-rose-500">*</span><textarea bind:value={form.reason} required minlength="3" rows="2" placeholder="ຕົວຢ່າງ: ພະນັກງານລືມກົດເຂົ້າວຽກ" class="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"></textarea></label>
                <label class="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">ໝາຍເຫດ<textarea bind:value={form.note} rows="2" class="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"></textarea></label>
            </div>
            <div class="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/50"><button type="button" onclick={() => (modalOpen = false)} class="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800">ຍົກເລີກ</button><button type="submit" disabled={saving} class="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{saving ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກ"}</button></div>
        </form>
        </div>
    </div>
{/if}
