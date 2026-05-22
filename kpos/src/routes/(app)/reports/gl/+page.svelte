<script lang="ts">
    import { onMount } from "svelte";
    import { cn, formatCurrency } from "$utils";
    import { api } from "$api";
    import { auth } from "$stores";
    import { toast } from "svelte-sonner";
    import {
        BookOpen, FileText, ShieldCheck, Banknote, Download,
        Loader2, TrendingUp, TrendingDown, Search, ChevronLeft, ChevronRight,
        Building2, Calendar, Filter, RefreshCw,
    } from "lucide-svelte";

    // ── Tabs ─────────────────────────────────────────────────────────────────
    type Tab = 'pl' | 'tax' | 'audit' | 'cashflow';
    let activeTab = $state<Tab>('pl');

    // ── Date range ────────────────────────────────────────────────────────────
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    let dateFrom = $state(firstOfMonth);
    let dateTo = $state(today);

    // ── Shared state ──────────────────────────────────────────────────────────
    let isLoading = $state(false);
    let branches = $state<any[]>([]);
    let selectedBranch = $state('');

    // ── P&L state ─────────────────────────────────────────────────────────────
    let plRows = $state<any[]>([]);
    let plTotals = $state<any>({ revenue: 0, discount: 0, netRevenue: 0, tax: 0, cogs: 0, grossProfit: 0, txCount: 0 });

    // ── Tax state ─────────────────────────────────────────────────────────────
    let taxRows = $state<any[]>([]);
    let taxTotals = $state<any>({ grossSales: 0, discount: 0, netSales: 0, taxAmount: 0, txCount: 0 });
    let taxPeriod = $state<'daily' | 'monthly'>('monthly');

    // ── Audit state ───────────────────────────────────────────────────────────
    let auditLogs = $state<any[]>([]);
    let auditTotal = $state(0);
    let auditPage = $state(1);
    let auditLimit = 50;
    let auditSearch = $state('');
    let auditAction = $state('');
    let auditActions = $state<string[]>([]);
    let auditSearchTimeout: ReturnType<typeof setTimeout>;

    // ── Cash flow state ───────────────────────────────────────────────────────
    let cashRows = $state<any[]>([]);
    let cashTotals = $state<any>({ cashIn: 0, cashOut: 0, netCash: 0 });

    // ─── Load branches list ───────────────────────────────────────────────────
    async function loadBranches() {
        try {
            const res = await api.get('branches?limit=200').json<any>();
            branches = res.data || [];
        } catch {}
    }

    // ─── P&L ─────────────────────────────────────────────────────────────────
    async function loadPL() {
        isLoading = true;
        try {
            const p = new URLSearchParams({ from: dateFrom, to: dateTo });
            if (selectedBranch) p.append('branchId', selectedBranch);
            const res = await api.get(`finance/pl?${p}`).json<any>();
            plRows = res.data || [];
            plTotals = res.totals || plTotals;
        } catch (e: any) {
            const msg = await e?.response?.json?.().catch(() => null);
            toast.error(msg?.error?.message || 'ບໍ່ສາມາດໂຫລດ P&L ໄດ້');
        } finally { isLoading = false; }
    }

    // ─── Tax Summary ─────────────────────────────────────────────────────────
    async function loadTax() {
        isLoading = true;
        try {
            const p = new URLSearchParams({ from: dateFrom, to: dateTo, period: taxPeriod });
            if (selectedBranch) p.append('branchId', selectedBranch);
            const res = await api.get(`finance/tax-summary?${p}`).json<any>();
            taxRows = res.data || [];
            taxTotals = res.totals || taxTotals;
        } catch (e: any) {
            const msg = await e?.response?.json?.().catch(() => null);
            toast.error(msg?.error?.message || 'ໂຫລດສະຫຼຸບພາສີບໍ່ໄດ້');
        } finally { isLoading = false; }
    }

    // ─── Audit Trail ─────────────────────────────────────────────────────────
    async function loadAudit() {
        isLoading = true;
        try {
            const p = new URLSearchParams({ from: dateFrom, to: dateTo, page: String(auditPage), limit: String(auditLimit) });
            if (auditSearch) p.append('search', auditSearch);
            if (auditAction) p.append('action', auditAction);
            const res = await api.get(`finance/audit-trail?${p}`).json<any>();
            auditLogs = res.data || [];
            auditTotal = res.meta?.total || 0;
            auditActions = res.filterOptions?.actions || auditActions;
        } catch (e: any) {
            const msg = await e?.response?.json?.().catch(() => null);
            toast.error(msg?.error?.message || 'ໂຫລດ Audit Trail ບໍ່ໄດ້');
        } finally { isLoading = false; }
    }

    // ─── Cash Flow ───────────────────────────────────────────────────────────
    async function loadCashFlow() {
        isLoading = true;
        try {
            const p = new URLSearchParams({ from: dateFrom, to: dateTo });
            if (selectedBranch) p.append('branchId', selectedBranch);
            const res = await api.get(`finance/cash-flow?${p}`).json<any>();
            cashRows = res.data || [];
            cashTotals = res.totals || cashTotals;
        } catch (e: any) {
            const msg = await e?.response?.json?.().catch(() => null);
            toast.error(msg?.error?.message || 'ໂຫລດ Cash Flow ບໍ່ໄດ້');
        } finally { isLoading = false; }
    }

    function loadActiveTab() {
        if (activeTab === 'pl') loadPL();
        else if (activeTab === 'tax') loadTax();
        else if (activeTab === 'audit') loadAudit();
        else if (activeTab === 'cashflow') loadCashFlow();
    }

    function applyFilters() {
        auditPage = 1;
        loadActiveTab();
    }

    function handleAuditSearch() {
        clearTimeout(auditSearchTimeout);
        auditSearchTimeout = setTimeout(() => { auditPage = 1; loadAudit(); }, 350);
    }

    // ─── Export P&L CSV ───────────────────────────────────────────────────────
    function exportPLCsv() {
        const bom = '﻿';
        const headers = ['ສາຂາ', 'ລາຍຮັບລວມ', 'ສ່ວນຫລຸດ', 'ລາຍຮັບສຸດທິ', 'ພາສີ', 'ຕົ້ນທຶນ (COGS)', 'ກຳໄລຂັ້ນຕົ້ນ', 'ອັດຕາກຳໄລ (%)', 'ຈຳນວນທຸລະກຳ'];
        const rows = plRows.map(r => [
            r.branchName, r.revenue, r.discount, r.netRevenue, r.tax, r.cogs, r.grossProfit, r.grossMargin, r.txCount,
        ]);
        rows.push(['ລວມ', plTotals.revenue, plTotals.discount, plTotals.netRevenue, plTotals.tax, plTotals.cogs, plTotals.grossProfit, '', plTotals.txCount]);
        const csv = bom + [headers, ...rows].map(r => r.join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = `pl_${dateFrom}_${dateTo}.csv`; a.click();
        URL.revokeObjectURL(url);
    }

    // ─── Export Audit CSV ─────────────────────────────────────────────────────
    function exportAuditCsv() {
        const bom = '﻿';
        const headers = ['ວັນທີ', 'ຜູ້ໃຊ້', 'ອີເມວ', 'ສິດ', 'ການກະທຳ', 'ລາຍລະອຽດ', 'Entity', 'IP'];
        const rows = auditLogs.map(r => [
            new Date(r.createdAt).toLocaleString(), r.userName || '', r.userEmail || '', r.userRole || '',
            r.action, r.description || '', r.entity || '', r.ip || '',
        ]);
        const csv = bom + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = `audit_trail_${dateFrom}_${dateTo}.csv`; a.click();
        URL.revokeObjectURL(url);
    }

    function formatPct(n: number) { return n.toFixed(1) + '%'; }
    function formatDate(d: any) { return d ? new Date(d).toLocaleDateString('lo-LA') : '-'; }
    function formatDateTime(d: any) { return d ? new Date(d).toLocaleString('lo-LA') : '-'; }

    const auditTotalPages = $derived(Math.ceil(auditTotal / auditLimit));

    onMount(async () => {
        await loadBranches();
        loadPL();
    });
</script>

<!-- ─── Page Header ─────────────────────────────────────────────────────────── -->
<div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <BookOpen class="w-6 h-6 text-violet-600" />
                GL / ການເງິນ & ການກວດກາ
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">P&L ຕາມສາຂາ · ສະຫຼຸບພາສີ · Audit Trail · Cash Flow</p>
        </div>
    </div>

    <!-- ─── Filters Bar ───────────────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex flex-wrap gap-3 items-end">
        <div class="flex flex-col gap-1">
            <label class="text-xs text-gray-500 dark:text-gray-400 font-medium">ຈາກວັນທີ</label>
            <input type="date" bind:value={dateFrom} class="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white" />
        </div>
        <div class="flex flex-col gap-1">
            <label class="text-xs text-gray-500 dark:text-gray-400 font-medium">ຫາວັນທີ</label>
            <input type="date" bind:value={dateTo} class="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white" />
        </div>
        {#if activeTab !== 'audit'}
        <div class="flex flex-col gap-1">
            <label class="text-xs text-gray-500 dark:text-gray-400 font-medium">ສາຂາ</label>
            <select bind:value={selectedBranch} class="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white min-w-[160px]">
                <option value="">ທຸກສາຂາ</option>
                {#each branches as b (b.id)}
                    <option value={b.id}>{b.name}</option>
                {/each}
            </select>
        </div>
        {/if}
        {#if activeTab === 'tax'}
        <div class="flex flex-col gap-1">
            <label class="text-xs text-gray-500 dark:text-gray-400 font-medium">ຈັດກຸ່ມ</label>
            <select bind:value={taxPeriod} class="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
                <option value="daily">ລາຍວັນ</option>
                <option value="monthly">ລາຍເດືອນ</option>
            </select>
        </div>
        {/if}
        <button onclick={applyFilters} class="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
            <RefreshCw class="w-4 h-4" />
            ກອງຂໍ້ມູນ
        </button>
    </div>

    <!-- ─── Tabs ──────────────────────────────────────────────────────────────── -->
    <div class="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {#each [
            { id: 'pl', label: 'P&L ຕາມສາຂາ', icon: TrendingUp },
            { id: 'tax', label: 'ສະຫຼຸບພາສີ', icon: FileText },
            { id: 'audit', label: 'Audit Trail', icon: ShieldCheck },
            { id: 'cashflow', label: 'Cash Flow', icon: Banknote },
        ] as tab}
            <button
                onclick={() => { activeTab = tab.id as Tab; loadActiveTab(); }}
                class={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeTab === tab.id
                        ? "bg-white dark:bg-gray-700 text-violet-700 dark:text-violet-300 shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                )}
            >
                <tab.icon class="w-4 h-4" />
                {tab.label}
            </button>
        {/each}
    </div>

    <!-- ─── Loading ───────────────────────────────────────────────────────────── -->
    {#if isLoading}
        <div class="flex justify-center py-16">
            <Loader2 class="w-8 h-8 animate-spin text-violet-500" />
        </div>

    <!-- ════════════════════════════════════════════════════════════════════════
         TAB: P&L
         ════════════════════════════════════════════════════════════════════════ -->
    {:else if activeTab === 'pl'}
        <!-- Summary cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {#each [
                { label: 'ລາຍຮັບລວມ', value: plTotals.revenue, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
                { label: 'ສ່ວນຫລຸດ', value: plTotals.discount, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                { label: 'ຕົ້ນທຶນ (COGS)', value: plTotals.cogs, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
                { label: 'ກຳໄລຂັ້ນຕົ້ນ', value: plTotals.grossProfit, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20' },
            ] as card}
                <div class={cn("rounded-2xl p-4 border border-gray-100 dark:border-gray-700", card.bg)}>
                    <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">{card.label}</p>
                    <p class={cn("text-xl font-bold mt-1", card.color)}>{formatCurrency(card.value)}</p>
                </div>
            {/each}
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 class="font-semibold text-gray-900 dark:text-white">P&L ຕາມສາຂາ</h2>
                <button onclick={exportPLCsv} class="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors">
                    <Download class="w-4 h-4" /> CSV
                </button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            {#each ['ສາຂາ', 'ລາຍຮັບລວມ', 'ສ່ວນຫລຸດ', 'ລາຍຮັບສຸດທິ', 'ພາສີ', 'COGS', 'ກຳໄລຂັ້ນຕົ້ນ', 'ອັດຕາ %', 'ທຸລະກຳ'] as h}
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                            {/each}
                        </tr>
                    </thead>
                    <tbody>
                        {#each plRows as r (r.branchId)}
                            <tr class="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.branchName}</td>
                                <td class="px-4 py-3 text-green-600 dark:text-green-400 font-medium">{formatCurrency(r.revenue)}</td>
                                <td class="px-4 py-3 text-amber-600 dark:text-amber-400">{formatCurrency(r.discount)}</td>
                                <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{formatCurrency(r.netRevenue)}</td>
                                <td class="px-4 py-3 text-gray-600 dark:text-gray-400">{formatCurrency(r.tax)}</td>
                                <td class="px-4 py-3 text-red-600 dark:text-red-400">{formatCurrency(r.cogs)}</td>
                                <td class="px-4 py-3 font-bold {r.grossProfit >= 0 ? 'text-violet-600 dark:text-violet-400' : 'text-red-600 dark:text-red-400'}">{formatCurrency(r.grossProfit)}</td>
                                <td class="px-4 py-3 {r.grossMargin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600'}">{formatPct(r.grossMargin)}</td>
                                <td class="px-4 py-3 text-gray-600 dark:text-gray-400">{r.txCount}</td>
                            </tr>
                        {:else}
                            <tr><td colspan="9" class="text-center py-12 text-gray-400">ບໍ່ມີຂໍ້ມູນ</td></tr>
                        {/each}
                    </tbody>
                    {#if plRows.length > 0}
                    <tfoot class="bg-violet-50 dark:bg-violet-900/20 font-bold border-t-2 border-violet-200 dark:border-violet-700">
                        <tr>
                            <td class="px-4 py-3 text-violet-700 dark:text-violet-300">ລວມທັງໝົດ</td>
                            <td class="px-4 py-3 text-green-700 dark:text-green-300">{formatCurrency(plTotals.revenue)}</td>
                            <td class="px-4 py-3 text-amber-700 dark:text-amber-300">{formatCurrency(plTotals.discount)}</td>
                            <td class="px-4 py-3">{formatCurrency(plTotals.netRevenue)}</td>
                            <td class="px-4 py-3">{formatCurrency(plTotals.tax)}</td>
                            <td class="px-4 py-3 text-red-700 dark:text-red-300">{formatCurrency(plTotals.cogs)}</td>
                            <td class="px-4 py-3 text-violet-700 dark:text-violet-300">{formatCurrency(plTotals.grossProfit)}</td>
                            <td class="px-4 py-3"></td>
                            <td class="px-4 py-3">{plTotals.txCount}</td>
                        </tr>
                    </tfoot>
                    {/if}
                </table>
            </div>
        </div>

    <!-- ════════════════════════════════════════════════════════════════════════
         TAB: TAX SUMMARY
         ════════════════════════════════════════════════════════════════════════ -->
    {:else if activeTab === 'tax'}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {#each [
                { label: 'ຍອດຂາຍລວມ', value: taxTotals.grossSales, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
                { label: 'ສ່ວນຫລຸດ', value: taxTotals.discount, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                { label: 'ຍອດຂາຍສຸດທິ', value: taxTotals.netSales, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                { label: 'ພາສີທີ່ເກັບໄດ້', value: taxTotals.taxAmount, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20' },
            ] as card}
                <div class={cn("rounded-2xl p-4 border border-gray-100 dark:border-gray-700", card.bg)}>
                    <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">{card.label}</p>
                    <p class={cn("text-xl font-bold mt-1", card.color)}>{formatCurrency(card.value)}</p>
                </div>
            {/each}
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 class="font-semibold text-gray-900 dark:text-white">ສະຫຼຸບພາສີ / VAT — {taxPeriod === 'daily' ? 'ລາຍວັນ' : 'ລາຍເດືອນ'}</h2>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            {#each ['ໄລຍະ', 'ສາຂາ', 'ຍອດຂາຍລວມ', 'ສ່ວນຫລຸດ', 'ຍອດຂາຍສຸດທິ', 'ພາສີ (VAT)', 'ທຸລະກຳ'] as h}
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                            {/each}
                        </tr>
                    </thead>
                    <tbody>
                        {#each taxRows as r, i (i)}
                            <tr class="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                <td class="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{r.period ? new Date(r.period).toLocaleDateString('lo-LA') : '-'}</td>
                                <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.branchName}</td>
                                <td class="px-4 py-3 text-green-600 dark:text-green-400">{formatCurrency(r.grossSales)}</td>
                                <td class="px-4 py-3 text-amber-600 dark:text-amber-400">{formatCurrency(r.discount)}</td>
                                <td class="px-4 py-3 font-medium">{formatCurrency(r.netSales)}</td>
                                <td class="px-4 py-3 text-violet-600 dark:text-violet-400 font-medium">{formatCurrency(r.taxAmount)}</td>
                                <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{r.txCount}</td>
                            </tr>
                        {:else}
                            <tr><td colspan="7" class="text-center py-12 text-gray-400">ບໍ່ມີຂໍ້ມູນ</td></tr>
                        {/each}
                    </tbody>
                    {#if taxRows.length > 0}
                    <tfoot class="bg-violet-50 dark:bg-violet-900/20 font-bold border-t-2 border-violet-200 dark:border-violet-700">
                        <tr>
                            <td colspan="2" class="px-4 py-3 text-violet-700 dark:text-violet-300">ລວມທັງໝົດ</td>
                            <td class="px-4 py-3 text-green-700 dark:text-green-300">{formatCurrency(taxTotals.grossSales)}</td>
                            <td class="px-4 py-3 text-amber-700 dark:text-amber-300">{formatCurrency(taxTotals.discount)}</td>
                            <td class="px-4 py-3">{formatCurrency(taxTotals.netSales)}</td>
                            <td class="px-4 py-3 text-violet-700 dark:text-violet-300">{formatCurrency(taxTotals.taxAmount)}</td>
                            <td class="px-4 py-3">{taxTotals.txCount}</td>
                        </tr>
                    </tfoot>
                    {/if}
                </table>
            </div>
        </div>

    <!-- ════════════════════════════════════════════════════════════════════════
         TAB: AUDIT TRAIL
         ════════════════════════════════════════════════════════════════════════ -->
    {:else if activeTab === 'audit'}
        <!-- Audit filters -->
        <div class="flex flex-wrap gap-3 items-center">
            <div class="relative flex-1 min-w-[200px]">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text" bind:value={auditSearch}
                    oninput={handleAuditSearch}
                    placeholder="ຄົ້ນຫາ..."
                    class="pl-9 pr-4 py-2 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                />
            </div>
            <select bind:value={auditAction} onchange={() => { auditPage = 1; loadAudit(); }} class="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white min-w-[160px]">
                <option value="">ທຸກການກະທຳ</option>
                {#each auditActions as a (a)}
                    <option value={a}>{a}</option>
                {/each}
            </select>
            <button onclick={exportAuditCsv} class="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors">
                <Download class="w-4 h-4" /> CSV
            </button>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h2 class="font-semibold text-gray-900 dark:text-white">Audit Trail — {auditTotal} ລາຍການ</h2>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            {#each ['ວັນທີ-ເວລາ', 'ຜູ້ໃຊ້', 'ສິດ', 'ການກະທຳ', 'ລາຍລະອຽດ', 'IP'] as h}
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                            {/each}
                        </tr>
                    </thead>
                    <tbody>
                        {#each auditLogs as log (log.id)}
                            <tr class="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                <td class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">{formatDateTime(log.createdAt)}</td>
                                <td class="px-4 py-3">
                                    <div class="font-medium text-gray-900 dark:text-white text-xs">{log.userName || '-'}</div>
                                    <div class="text-gray-400 text-xs">{log.userEmail || ''}</div>
                                </td>
                                <td class="px-4 py-3">
                                    <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{log.userRole || '-'}</span>
                                </td>
                                <td class="px-4 py-3">
                                    <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">{log.action}</span>
                                </td>
                                <td class="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs max-w-[260px] truncate" title={log.description}>{log.description || '-'}</td>
                                <td class="px-4 py-3 text-gray-400 text-xs font-mono">{log.ip || '-'}</td>
                            </tr>
                        {:else}
                            <tr><td colspan="6" class="text-center py-12 text-gray-400">ບໍ່ມີ Audit Log</td></tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            <!-- Pagination -->
            {#if auditTotalPages > 1}
            <div class="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                <p class="text-sm text-gray-500 dark:text-gray-400">ໜ້າ {auditPage} / {auditTotalPages}</p>
                <div class="flex gap-2">
                    <button onclick={() => { auditPage--; loadAudit(); }} disabled={auditPage <= 1} class="p-2 rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <ChevronLeft class="w-4 h-4" />
                    </button>
                    <button onclick={() => { auditPage++; loadAudit(); }} disabled={auditPage >= auditTotalPages} class="p-2 rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <ChevronRight class="w-4 h-4" />
                    </button>
                </div>
            </div>
            {/if}
        </div>

    <!-- ════════════════════════════════════════════════════════════════════════
         TAB: CASH FLOW
         ════════════════════════════════════════════════════════════════════════ -->
    {:else if activeTab === 'cashflow'}
        <div class="grid grid-cols-3 gap-4">
            {#each [
                { label: 'ເງິນເຂົ້າລວມ', value: cashTotals.cashIn, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
                { label: 'ເງິນອອກລວມ', value: cashTotals.cashOut, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
                { label: 'ເງິນສຸດທິ', value: cashTotals.netCash, color: cashTotals.netCash >= 0 ? 'text-violet-600 dark:text-violet-400' : 'text-red-600', bg: 'bg-violet-50 dark:bg-violet-900/20' },
            ] as card}
                <div class={cn("rounded-2xl p-4 border border-gray-100 dark:border-gray-700", card.bg)}>
                    <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">{card.label}</p>
                    <p class={cn("text-xl font-bold mt-1", card.color)}>{formatCurrency(card.value)}</p>
                </div>
            {/each}
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 class="font-semibold text-gray-900 dark:text-white">Cash Flow ຕາມສາຂາ</h2>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            {#each ['ສາຂາ', 'ເງິນເຂົ້າ', 'ເງິນອອກ', 'ສຸດທິ'] as h}
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                            {/each}
                        </tr>
                    </thead>
                    <tbody>
                        {#each cashRows as r (r.branchId)}
                            <tr class="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.branchName}</td>
                                <td class="px-4 py-3 text-green-600 dark:text-green-400 font-medium">{formatCurrency(r.cashIn)}</td>
                                <td class="px-4 py-3 text-red-600 dark:text-red-400">{formatCurrency(r.cashOut)}</td>
                                <td class="px-4 py-3 font-bold {r.netCash >= 0 ? 'text-violet-600 dark:text-violet-400' : 'text-red-600 dark:text-red-400'}">{formatCurrency(r.netCash)}</td>
                            </tr>
                        {:else}
                            <tr><td colspan="4" class="text-center py-12 text-gray-400">ບໍ່ມີຂໍ້ມູນ</td></tr>
                        {/each}
                    </tbody>
                    {#if cashRows.length > 0}
                    <tfoot class="bg-violet-50 dark:bg-violet-900/20 font-bold border-t-2 border-violet-200 dark:border-violet-700">
                        <tr>
                            <td class="px-4 py-3 text-violet-700 dark:text-violet-300">ລວມ</td>
                            <td class="px-4 py-3 text-green-700 dark:text-green-300">{formatCurrency(cashTotals.cashIn)}</td>
                            <td class="px-4 py-3 text-red-700 dark:text-red-300">{formatCurrency(cashTotals.cashOut)}</td>
                            <td class="px-4 py-3 text-violet-700 dark:text-violet-300">{formatCurrency(cashTotals.netCash)}</td>
                        </tr>
                    </tfoot>
                    {/if}
                </table>
            </div>
        </div>
    {/if}
</div>
