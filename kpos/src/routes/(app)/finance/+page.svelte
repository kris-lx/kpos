<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { api } from '$lib/api';
    import { auth } from '$lib/stores';
    import { t } from '$lib/i18n/index.svelte';
    import { toast } from 'svelte-sonner';
    import PayrollTaxProfilePanel from '$lib/components/PayrollTaxProfilePanel.svelte';
    import PayrollWorkPolicyPanel from '$lib/components/PayrollWorkPolicyPanel.svelte';
    import MoneyInput from '$lib/components/MoneyInput.svelte';
    import { printHtml } from '$lib/utils/printHtml';
    import { AlertTriangle, Banknote, BadgeDollarSign, Check, ChevronDown, CircleDollarSign, Clock3, Download, FilePlus2, Gift, Loader2, LockKeyhole, Printer, ReceiptText, RefreshCw, RotateCcw, Send, ShieldCheck, TrendingUp, WalletCards, X } from 'lucide-svelte';

    type Tab = 'overview' | 'expenses' | 'payroll';
    type Expense = { id: string; category: string; vendor?: string; description?: string; amount: number; status: string; expenseDate: string; branchName?: string; creatorName?: string };
    type PayrollPeriod = { id: string; storeId?: string; branchId?: string; periodStart: string; periodEnd: string; status: string; totalGross: number; totalDeductions: number; totalIncomeTax: number; totalEmployeeSocial: number; totalEmployerSocial: number; totalEmployerCost: number; totalNet: number; taxProfileId?: string; workPolicyId?: string; createdBy?: string; submittedBy?: string; approvedBy?: string; branchName?: string };

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    let activeTab = $state<Tab>('overview');
    let from = $state(monthStart);
    let to = $state(today);
    let loading = $state(false);
    let saving = $state(false);
    let branches = $state<any[]>([]);
    let staff = $state<any[]>([]);
    let branchId = $state('');

    let pl = $state<any>({ revenue: 0, discount: 0, netRevenue: 0, cogs: 0, operatingExpenses: 0, payrollExpense: 0, grossProfit: 0, netProfit: 0, tax: 0 });
    let cash = $state<any>({ cashIn: 0, cashOut: 0, netCash: 0 });
    let expenses = $state<Expense[]>([]);
    let expenseTotal = $state(0);
    let periods = $state<PayrollPeriod[]>([]);
    let compensation = $state<any[]>([]);
    let hasTaxProfile = $state(false);
    let hasWorkPolicy = $state(false);
    let payrollLoadErrors = $state<string[]>([]);
    let expandedPeriodId = $state('');
    let periodDetails = $state<Record<string, any>>({});
    let detailLoading = $state(false);
    type PayrollDialogKind = 'pay' | 'reject' | 'reverse' | 'adjustment-reject' | 'adjustment-cancel';
    let payrollDialog = $state<{ open: boolean; kind: PayrollDialogKind; period: PayrollPeriod | null; itemId: string; adjustmentId: string; employee: string }>({ open: false, kind: 'pay', period: null, itemId: '', adjustmentId: '', employee: '' });
    let payrollDialogForm = $state({ paymentMethod: 'BANK_TRANSFER', reference: '', reason: '' });

    let expenseForm = $state({ category: 'RENT', vendor: '', amount: 0, expenseDate: today, description: '', paymentMethod: 'CASH' });
    let periodForm = $state({ periodStart: monthStart, periodEnd: today, branchId: '' });
    let compForm = $state({ userId: '', payType: 'MONTHLY', baseRate: 0, allowance: 0, defaultDeduction: 0, taxExemptAmount: 0, commissionRate: 0, socialSecurityEnabled: true, overtimeEligible: true, effectiveFrom: monthStart });
    let adjustmentForm = $state({ userId: '', type: 'BONUS', amount: 0, reason: '' });

    const expenseCategories = ['RENT', 'UTILITIES', 'PAYMENT_FEE', 'SHIPPING', 'MARKETING', 'MAINTENANCE', 'TAX', 'OTHER'];
    const additionTypes = ['BONUS', 'COMMISSION', 'ALLOWANCE', 'REIMBURSEMENT'];
    const deductionTypes = ['DEDUCTION', 'UNPAID_LEAVE', 'LATE_DEDUCTION', 'ABSENCE_DEDUCTION'];
    const payTypeKeys = ['MONTHLY', 'DAILY', 'HOURLY', 'COMMISSION'];

    const canCreateExpense = $derived(auth.hasAnyPermission(['expenses:create', 'finance:manage']));
    const canApproveExpense = $derived(auth.hasAnyPermission(['expenses:approve', 'finance:manage']));
    const canPayExpense = $derived(auth.hasAnyPermission(['expenses:pay', 'finance:manage']));
    const canViewPayroll = $derived(auth.hasPermission('payroll:view'));
    const canViewPayrollDetails = $derived(auth.hasAnyPermission(['payroll:view_detail', 'payroll:manage', 'payroll:approve', 'payroll:pay']));
    const canConfigurePayroll = $derived(auth.hasPermission('payroll:compensation'));
    const canConfigurePayrollPolicies = $derived(auth.hasPermission('payroll:policy'));
    const canManagePayroll = $derived(auth.hasPermission('payroll:manage'));
    const hasApprovePayrollPermission = $derived(auth.hasPermission('payroll:approve'));
    const isAssignedPayrollChecker = $derived(Boolean(auth.user?.isSuperAdmin || auth.user?.checkerEnabled));
    const canApprovePayroll = $derived(hasApprovePayrollPermission && isAssignedPayrollChecker);
    const canPayPayroll = $derived(auth.hasPermission('payroll:pay'));
    const canExportPayroll = $derived(auth.hasPermission('payroll:export'));
    const payrollScopeBranchId = $derived(periodForm.branchId || branchId);
    const payrollScopeBranch = $derived(branches.find((branch: any) => branch.id === payrollScopeBranchId));
    const payrollScopeGrant = $derived(auth.accessibleStores.find((grant) =>
        grant.branchId === payrollScopeBranchId
        || (!grant.branchId && payrollScopeBranch?.storeId && grant.storeId === payrollScopeBranch.storeId)
    ));
    const canWritePayrollScope = $derived(Boolean(auth.user?.isSuperAdmin || payrollScopeGrant?.canWrite || payrollScopeGrant?.canManage));
    const canManagePayrollScope = $derived(Boolean(auth.user?.isSuperAdmin || payrollScopeGrant?.canManage));
    const canConfigureCompensation = $derived(canConfigurePayroll && canWritePayrollScope);
    const canConfigurePolicies = $derived(canConfigurePayrollPolicies && canManagePayrollScope);
    const canRunPayroll = $derived(canManagePayroll && canWritePayrollScope);

    function payrollGrantFor(branchScopeId?: string) {
        if (!branchScopeId) return undefined;
        const branch = branches.find((entry: any) => entry.id === branchScopeId);
        return auth.accessibleStores.find((grant) =>
            grant.branchId === branchScopeId || (!grant.branchId && branch?.storeId && grant.storeId === branch.storeId)
        );
    }

    function canWritePeriod(period: PayrollPeriod) {
        const grant = payrollGrantFor(period.branchId);
        return Boolean(auth.user?.isSuperAdmin || grant?.canWrite || grant?.canManage);
    }

    function canManagePeriod(period: PayrollPeriod) {
        return Boolean(auth.user?.isSuperAdmin || payrollGrantFor(period.branchId)?.canManage);
    }

    function canReviewPeriod(period: PayrollPeriod) {
        if (!canApprovePayroll || !canWritePeriod(period)) return false;
        if (auth.user?.isSuperAdmin) return true;
        return period.createdBy !== auth.user?.id && period.submittedBy !== auth.user?.id;
    }

    function money(value: unknown) {
        return new Intl.NumberFormat('lo-LA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
    }

    async function errorMessage(error: any, fallback = t('finance.actionFailed')) {
        try { const body = await error?.response?.json(); return body?.error?.message || body?.message || fallback; } catch { return fallback; }
    }

    function params(extra: Record<string, string> = {}) {
        const p = new URLSearchParams({ from, to, ...extra });
        if (branchId) p.set('branchId', branchId);
        return p;
    }

    async function loadBranches() {
        try {
            const response = await api.get('branches?limit=200').json<any>();
            branches = response.data || [];
            // Do not silently select the first branch for an owner; that hid
            // payroll periods created in another branch.
            branchId ||= auth.activeBranchId || '';
            periodForm.branchId ||= auth.activeBranchId || '';
        } catch { /* permissions may allow reports without a branch list */ }
    }

    async function loadOverview() {
        loading = true;
        try {
            const [plResponse, cashResponse] = await Promise.all([
                api.get(`finance/pl?${params()}`).json<any>(),
                api.get(`finance/cash-flow?${params()}`).json<any>(),
            ]);
            pl = plResponse.totals || pl;
            cash = cashResponse.totals || cash;
        } catch (error) { toast.error(await errorMessage(error, t('finance.loadReportFailed'))); }
        finally { loading = false; }
    }

    async function loadExpenses() {
        loading = true;
        try {
            const response = await api.get(`finance/expenses?${params({ limit: '100' })}`).json<any>();
            expenses = response.data || [];
            expenseTotal = Number(response.meta?.totalAmount) || 0;
        } catch (error) { toast.error(await errorMessage(error, t('finance.loadExpensesFailed'))); }
        finally { loading = false; }
    }

    async function loadPayroll() {
        if (!canViewPayroll) {
            periods = []; compensation = []; staff = [];
            return;
        }
        loading = true;
        payrollLoadErrors = [];
        try {
            const branchQuery = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
            const [periodResult, compensationResult, staffResult, taxProfileResult, workPolicyResult] = await Promise.allSettled([
                api.get(`finance/payroll/periods${branchQuery}`).json<any>(),
                canViewPayrollDetails || canConfigurePayroll ? api.get(`finance/payroll/compensation${branchQuery}`).json<any>() : Promise.resolve({ data: [] }),
                (canConfigurePayroll || canManagePayroll) && branchId ? api.get(`finance/payroll/staff?branchId=${encodeURIComponent(branchId)}`).json<any>() : Promise.resolve({ data: [] }),
                api.get(`finance/payroll/tax-profiles${branchQuery}`).json<any>(),
                branchId ? api.get(`finance/payroll/work-policies${branchQuery}`).json<any>() : Promise.resolve({ data: [] }),
            ]);
            if (periodResult.status === 'fulfilled') periods = Array.isArray(periodResult.value.data) ? periodResult.value.data : [];
            else payrollLoadErrors = [...payrollLoadErrors, t('finance.periodsLabel')];
            if (compensationResult.status === 'fulfilled') compensation = Array.isArray(compensationResult.value.data) ? compensationResult.value.data : [];
            else payrollLoadErrors = [...payrollLoadErrors, t('finance.compensationLabel')];
            if (staffResult.status === 'fulfilled') staff = Array.isArray(staffResult.value.data) ? staffResult.value.data : [];
            else payrollLoadErrors = [...payrollLoadErrors, t('finance.staffLabel')];
            hasTaxProfile = taxProfileResult.status === 'fulfilled' && Array.isArray(taxProfileResult.value.data) && taxProfileResult.value.data.length > 0;
            hasWorkPolicy = workPolicyResult.status === 'fulfilled' && Array.isArray(workPolicyResult.value.data) && workPolicyResult.value.data.length > 0;
            if (!staff.some(person => person.id === compForm.userId)) compForm.userId = staff[0]?.id || '';
            if (!staff.some(person => person.id === adjustmentForm.userId)) adjustmentForm.userId = staff[0]?.id || '';
            if (payrollLoadErrors.length === 3) toast.error(t('finance.loadPayrollAllFailed'));
        } catch (error) { toast.error(await errorMessage(error, t('finance.loadPayrollFailed'))); }
        finally { loading = false; }
    }

    async function loadTab() {
        if (activeTab === 'overview') return loadOverview();
        if (activeTab === 'expenses') return loadExpenses();
        return loadPayroll();
    }

    function selectTab(tab: Tab) {
        activeTab = tab;
        goto(`/finance?tab=${tab}`, { replaceState: true, noScroll: true, keepFocus: true }).catch(() => {});
        loadTab();
    }

    async function createExpense(event: SubmitEvent) {
        event.preventDefault(); saving = true;
        try {
            await api.post('finance/expenses', { json: { ...expenseForm, branchId: branchId || undefined } }).json();
            toast.success(t('finance.expenseCreated'));
            expenseForm = { ...expenseForm, vendor: '', amount: 0, description: '' };
            await loadExpenses();
        } catch (error) { toast.error(await errorMessage(error)); }
        finally { saving = false; }
    }

    async function expenseAction(expense: Expense, action: 'submit' | 'approve' | 'reject' | 'pay') {
        saving = true;
        try {
            await api.post(`finance/expenses/${expense.id}/${action}`, { json: action === 'reject' ? { reason: t('finance.rejectReasonDefault') } : {} }).json();
            toast.success(action === 'approve' ? t('finance.expenseApproved') : action === 'pay' ? t('finance.expensePaid') : t('finance.expenseStatusUpdated'));
            await loadExpenses();
        } catch (error) { toast.error(await errorMessage(error)); }
        finally { saving = false; }
    }

    async function createCompensation(event: SubmitEvent) {
        event.preventDefault(); saving = true;
        try {
            if (!periodForm.branchId && !branchId) { toast.error(t('finance.selectBranchToast')); return; }
            await api.post('finance/payroll/compensation', { json: { ...compForm, branchId: periodForm.branchId || branchId || undefined } }).json();
            toast.success(t('finance.compensationSaved'));
            await loadPayroll();
        } catch (error) { toast.error(await errorMessage(error)); }
        finally { saving = false; }
    }

    async function createPeriod(event: SubmitEvent) {
        event.preventDefault(); saving = true;
        try {
            await api.post('finance/payroll/periods', { json: periodForm }).json();
            toast.success(t('finance.periodCreated'));
            // Keep the list filter aligned with the scope just created so the
            // new period cannot appear to disappear after a successful POST.
            branchId = periodForm.branchId;
            await loadPayroll();
        } catch (error) { toast.error(await errorMessage(error)); }
        finally { saving = false; }
    }

    async function payrollAction(period: PayrollPeriod, action: 'calculate' | 'submit' | 'approve' | 'close') {
        saving = true;
        try {
            await api.post(`finance/payroll/periods/${period.id}/${action}`).json();
            toast.success(action === 'close' ? t('finance.payrollClosed') : t('finance.payrollUpdated'));
            await loadPayroll();
            if (expandedPeriodId === period.id) await loadPeriodDetails(period.id, true);
        } catch (error) { toast.error(await errorMessage(error)); }
        finally { saving = false; }
    }

    function openPayrollDialog(kind: 'pay' | 'reject' | 'reverse', period: PayrollPeriod, item?: any) {
        payrollDialog = { open: true, kind, period, itemId: item?.id || '', adjustmentId: '', employee: item?.userName || item?.userEmail || '' };
        payrollDialogForm = { paymentMethod: 'BANK_TRANSFER', reference: '', reason: '' };
    }

    function openAdjustmentDialog(kind: 'adjustment-reject' | 'adjustment-cancel', period: PayrollPeriod, adjustment: any) {
        payrollDialog = { open: true, kind, period, itemId: '', adjustmentId: adjustment.id, employee: t(`finance.adjustmentType.${adjustment.type}`) };
        payrollDialogForm = { paymentMethod: 'BANK_TRANSFER', reference: '', reason: '' };
    }

    function closePayrollDialog() {
        payrollDialog = { open: false, kind: 'pay', period: null, itemId: '', adjustmentId: '', employee: '' };
    }

    async function submitPayrollDialog(event: SubmitEvent) {
        event.preventDefault();
        const { period, kind, itemId, adjustmentId } = payrollDialog;
        if (!period) return;
        saving = true;
        try {
            const path = kind === 'pay'
                ? `finance/payroll/periods/${period.id}${itemId ? `/items/${itemId}` : ''}/pay`
                : kind.startsWith('adjustment-')
                    ? `finance/payroll/periods/${period.id}/adjustments/${adjustmentId}/${kind.replace('adjustment-', '')}`
                    : `finance/payroll/periods/${period.id}/${kind}`;
            const json = kind === 'pay'
                ? { paymentMethod: payrollDialogForm.paymentMethod, reference: payrollDialogForm.reference }
                : { reason: payrollDialogForm.reason };
            await api.post(path, { json }).json();
            toast.success(kind === 'pay' ? t('finance.payrollPaid') : kind === 'reject' ? t('finance.payrollRejected') : kind === 'reverse' ? t('finance.payrollReversed') : kind === 'adjustment-reject' ? t('finance.adjustmentRejected') : t('finance.adjustmentCancelled'));
            closePayrollDialog();
            await loadPayroll();
            if (expandedPeriodId === period.id) await loadPeriodDetails(period.id, true);
        } catch (error) { toast.error(await errorMessage(error)); }
        finally { saving = false; }
    }

    async function exportPayroll(period: PayrollPeriod) {
        try {
            const blob = await api.get(`finance/payroll/periods/${period.id}/export`).blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `payroll-${period.periodStart.slice(0, 10)}-${period.periodEnd.slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) { toast.error(await errorMessage(error, t('finance.exportFailed'))); }
    }

    function html(value: unknown) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] || character);
    }

    function printPayslip(period: PayrollPeriod, item: any) {
        printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Payslip</title><style>body{font-family:Arial,sans-serif;color:#172033;padding:36px}.head{display:flex;justify-content:space-between;border-bottom:3px solid #0f766e;padding-bottom:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 28px;margin-top:24px}.row{display:flex;justify-content:space-between;border-bottom:1px solid #dbe3ea;padding:9px 0}.total{margin-top:24px;background:#ecfdf5;border:1px solid #a7f3d0;padding:18px;font-size:20px;font-weight:700;display:flex;justify-content:space-between}.muted{color:#64748b;font-size:12px}</style></head><body><div class="head"><div><h1>${html(t('finance.payslip'))}</h1><div class="muted">${html(period.branchName || t('finance.wholeStore'))}</div></div><div>${html(new Date(period.periodStart).toLocaleDateString('lo-LA'))} — ${html(new Date(period.periodEnd).toLocaleDateString('lo-LA'))}</div></div><h2>${html(item.userName || item.userEmail)}</h2><div class="grid"><div class="row"><span>${html(t('finance.base'))}</span><b>${money(item.basePay)}</b></div><div class="row"><span>${html(t('finance.otPay'))}</span><b>${money(item.overtimePay)}</b></div><div class="row"><span>${html(t('finance.additions'))}</span><b>${money(Number(item.commission) + Number(item.allowance) + Number(item.reimbursement))}</b></div><div class="row"><span>${html(t('finance.attendanceDeduction'))}</span><b>-${money(item.attendanceDeduction)}</b></div><div class="row"><span>${html(t('finance.tax'))}</span><b>-${money(item.incomeTax)}</b></div><div class="row"><span>${html(t('finance.social'))}</span><b>-${money(item.employeeSocialSecurity)}</b></div><div class="row"><span>${html(t('finance.lateMinutes'))}</span><b>${item.lateMinutes || 0}</b></div><div class="row"><span>${html(t('finance.earlyLeaveMinutes'))}</span><b>${item.earlyLeaveMinutes || 0}</b></div></div><div class="total"><span>${html(t('finance.net'))}</span><span>${money(item.netPay)}</span></div></body></html>`);
    }

    async function loadPeriodDetails(periodId: string, force = false) {
        if (expandedPeriodId === periodId && !force) { expandedPeriodId = ''; return; }
        expandedPeriodId = periodId;
        detailLoading = true;
        try {
            const response = await api.get(`finance/payroll/periods/${periodId}`).json<any>();
            periodDetails = { ...periodDetails, [periodId]: response.data };
        } catch (error) { toast.error(await errorMessage(error, t('finance.loadPayslipsFailed'))); }
        finally { detailLoading = false; }
    }

    async function createAdjustment(period: PayrollPeriod, event: SubmitEvent) {
        event.preventDefault(); saving = true;
        try {
            await api.post(`finance/payroll/periods/${period.id}/adjustments`, { json: adjustmentForm }).json();
            toast.success(t('finance.adjustmentSubmitted'));
            adjustmentForm = { ...adjustmentForm, amount: 0, reason: '' };
            await loadPeriodDetails(period.id, true);
        } catch (error) { toast.error(await errorMessage(error)); }
        finally { saving = false; }
    }

    async function approveAdjustment(period: PayrollPeriod, adjustmentId: string) {
        saving = true;
        try {
            await api.post(`finance/payroll/periods/${period.id}/adjustments/${adjustmentId}/approve`).json();
            toast.success(t('finance.adjustmentApproved'));
            await loadPayroll();
            await loadPeriodDetails(period.id, true);
        } catch (error) { toast.error(await errorMessage(error)); }
        finally { saving = false; }
    }

    onMount(async () => {
        const requested = new URLSearchParams(window.location.search).get('tab') as Tab | null;
        if (requested && ['overview', 'expenses', 'payroll'].includes(requested)) activeTab = requested;
        await loadBranches();
        await loadTab();
    });
</script>

<div class="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6">
    <div class="mx-auto max-w-[1500px] space-y-6">
        <section class="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl md:p-8">
            <div class="absolute -right-10 -top-20 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl"></div>
            <div class="relative flex flex-wrap items-center justify-between gap-4">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">{t('finance.controlCenter')}</p>
                    <h1 class="mt-2 flex items-center gap-3 text-2xl font-bold md:text-3xl"><WalletCards class="h-8 w-8 text-emerald-300" /> {t('finance.title')}</h1>
                    <p class="mt-2 text-sm text-slate-300">{t('finance.subtitle')}</p>
                </div>
                <button aria-label={t('finance.refresh')} class="rounded-xl bg-white/10 p-3 hover:bg-white/20" onclick={loadTab}><RefreshCw class="h-5 w-5" /></button>
            </div>
        </section>

        <section class="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
            <label class="text-xs font-medium text-slate-500">{t('finance.fromDate')}<input aria-label={t('finance.fromDate')} type="date" bind:value={from} class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
            <label class="text-xs font-medium text-slate-500">{t('finance.toDate')}<input aria-label={t('finance.toDate')} type="date" bind:value={to} class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
            <label class="text-xs font-medium text-slate-500">{t('finance.branch')}<select aria-label={t('finance.branch')} bind:value={branchId} class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">{t('finance.allBranches')}</option>{#each branches as branch (branch.id)}<option value={branch.id}>{branch.name}</option>{/each}</select></label>
            <button class="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 dark:bg-emerald-400 dark:text-slate-950" onclick={loadTab}><RefreshCw class="h-4 w-4" /> {t('finance.applyFilter')}</button>
        </section>

        <nav class="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-900">
            {#each [{ id: 'overview', label: t('finance.tab.overview'), icon: CircleDollarSign }, { id: 'expenses', label: t('finance.tab.expenses'), icon: ReceiptText }, { id: 'payroll', label: t('finance.tab.payroll'), icon: BadgeDollarSign }] as tab}
                <button class="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition {activeTab === tab.id ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'}" onclick={() => selectTab(tab.id as Tab)}><tab.icon class="h-4 w-4" /> {tab.label}</button>
            {/each}
        </nav>

        {#if loading}
            <div class="flex justify-center py-20"><Loader2 class="h-8 w-8 animate-spin text-emerald-500" /></div>
        {:else if activeTab === 'overview'}
            <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {#each [{ label: t('finance.kpi.netSales'), value: pl.netRevenue, color: 'text-emerald-600', icon: CircleDollarSign }, { label: t('finance.kpi.cogs'), value: pl.cogs, color: 'text-rose-600', icon: ReceiptText }, { label: t('finance.kpi.operatingExpense'), value: pl.operatingExpenses, color: 'text-amber-600', icon: Banknote }, { label: t('finance.kpi.payroll'), value: pl.payrollExpense, color: 'text-violet-600', icon: BadgeDollarSign }, { label: t('finance.kpi.grossProfit'), value: pl.grossProfit, color: 'text-blue-600', icon: TrendingUp }, { label: t('finance.kpi.netProfit'), value: pl.netProfit, color: 'text-teal-600', icon: ShieldCheck }, { label: t('finance.kpi.cashIn'), value: cash.cashIn, color: 'text-cyan-600', icon: Banknote }, { label: t('finance.kpi.cashOut'), value: cash.cashOut, color: 'text-orange-600', icon: Banknote }] as card}
                    <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><card.icon class="h-5 w-5 {card.color}" /><p class="mt-3 text-xs text-slate-500">{card.label}</p><p class="mt-1 text-lg font-bold {card.color}">{money(card.value)}</p></div>
                {/each}
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{t('finance.calcBasis')}</div>
        {:else if activeTab === 'expenses'}
            <div class="grid gap-6 xl:grid-cols-[360px_1fr]">
                {#if canCreateExpense}
                    <form onsubmit={createExpense} class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div class="flex items-center gap-2 font-bold"><FilePlus2 class="h-5 w-5 text-emerald-500" /> {t('finance.addExpense')}</div>
                        <label class="text-xs text-slate-500">{t('finance.category')}<select bind:value={expenseForm.category} class="mt-1 w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">{#each expenseCategories as category}<option value={category}>{t(`finance.category.${category}`)}</option>{/each}</select></label>
                        <label class="text-xs text-slate-500">{t('finance.amount')}<MoneyInput required min={0.01} bind:value={expenseForm.amount} class="mt-1 text-sm" /></label>
                        <label class="text-xs text-slate-500">{t('finance.date')}<input required type="date" bind:value={expenseForm.expenseDate} class="mt-1 w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
                        <label class="text-xs text-slate-500">{t('finance.vendor')}<input bind:value={expenseForm.vendor} class="mt-1 w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
                        <label class="text-xs text-slate-500">{t('finance.reason')}<textarea bind:value={expenseForm.description} class="mt-1 w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"></textarea></label>
                        <button disabled={saving} class="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{t('finance.saveDraft')}</button>
                    </form>
                {:else}
                    <div class="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700">{t('finance.noExpensePermission')}</div>
                {/if}
                <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div class="flex items-center justify-between border-b p-5 dark:border-slate-800"><div><h2 class="font-bold">{t('finance.expenseLedger')}</h2><p class="text-xs text-slate-500">{t('finance.totalForRange')}: {money(expenseTotal)}</p></div><ReceiptText class="h-5 w-5 text-amber-500" /></div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 text-xs text-slate-500 dark:bg-slate-950"><tr><th class="px-4 py-3">{t('finance.date')}</th><th class="px-4 py-3">{t('finance.category')}</th><th class="px-4 py-3">{t('finance.branch')}</th><th class="px-4 py-3 text-right">{t('finance.amount')}</th><th class="px-4 py-3">{t('finance.status')}</th><th class="px-4 py-3">{t('finance.actions')}</th></tr></thead>
                            <tbody class="divide-y dark:divide-slate-800">
                                {#each expenses as expense (expense.id)}
                                    <tr>
                                        <td class="px-4 py-3 whitespace-nowrap">{new Date(expense.expenseDate).toLocaleDateString('lo-LA')}</td>
                                        <td class="px-4 py-3"><div class="font-medium">{t(`finance.category.${expense.category}`)}</div><div class="text-xs text-slate-500">{expense.vendor || expense.description || '-'}</div></td>
                                        <td class="px-4 py-3">{expense.branchName || '-'}</td>
                                        <td class="px-4 py-3 text-right font-semibold">{money(expense.amount)}</td>
                                        <td class="px-4 py-3"><span class="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{t(`finance.expenseStatus.${expense.status}`)}</span></td>
                                        <td class="px-4 py-3">
                                            <div class="flex flex-wrap gap-1">
                                                {#if expense.status === 'DRAFT' || expense.status === 'REJECTED'}<button class="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800" onclick={() => expenseAction(expense, 'submit')}><Send class="inline h-3 w-3" /> {t('finance.submit')}</button>{/if}
                                                {#if expense.status === 'PENDING_APPROVAL' && canApproveExpense}<button class="rounded-lg bg-emerald-100 px-2 py-1 text-xs text-emerald-700" onclick={() => expenseAction(expense, 'approve')}><Check class="inline h-3 w-3" /> {t('finance.approve')}</button><button class="rounded-lg bg-rose-100 px-2 py-1 text-xs text-rose-700" onclick={() => expenseAction(expense, 'reject')}><X class="inline h-3 w-3" /> {t('finance.reject')}</button>{/if}
                                                {#if expense.status === 'APPROVED' && canPayExpense}<button class="rounded-lg bg-violet-100 px-2 py-1 text-xs text-violet-700" onclick={() => expenseAction(expense, 'pay')}><Banknote class="inline h-3 w-3" /> {t('finance.pay')}</button>{/if}
                                            </div>
                                        </td>
                                    </tr>
                                {:else}
                                    <tr><td colspan="6" class="px-4 py-12 text-center text-slate-500">{t('finance.noExpenses')}</td></tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        {:else}
            {#if canViewPayroll && !branchId && !periodForm.branchId}
                <div class="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    <strong>{t('finance.selectBranchFirstTitle')}</strong> — {t('finance.selectBranchFirstBody')}
                </div>
            {/if}
            {#if canViewPayroll && !periods.some(p => p.status === 'APPROVED' || p.status === 'PAID')}
                {@const steps = [
                    { done: hasTaxProfile, label: t('finance.payChecklist.taxProfile') },
                    { done: hasWorkPolicy, label: t('finance.payChecklist.workPolicy') },
                    { done: compensation.length > 0, label: t('finance.payChecklist.compensation') },
                    { done: periods.length > 0, label: t('finance.payChecklist.openPeriod') },
                    { done: periods.some(p => ['PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CLOSED'].includes(p.status)), label: t('finance.payChecklist.calculateSubmit') },
                    { done: periods.some(p => ['APPROVED', 'PARTIALLY_PAID', 'PAID', 'CLOSED'].includes(p.status)), label: t('finance.payChecklist.checkerApprove') },
                ]}
                <div class="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm dark:border-violet-900/50 dark:bg-violet-950/20">
                    <p class="mb-3 font-semibold text-violet-900 dark:text-violet-200">{t('finance.payChecklistTitle')}</p>
                    <ol class="space-y-1.5">
                        {#each steps as step, i}
                            <li class="flex items-center gap-2 {step.done ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}">
                                {#if step.done}<Check class="h-4 w-4 shrink-0" />{:else}<span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-400 text-[10px] dark:border-slate-500">{i + 1}</span>{/if}
                                {step.label}
                            </li>
                        {/each}
                    </ol>
                </div>
            {/if}
            {#if payrollLoadErrors.length}
                <div role="alert" class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    <div><strong>{t('finance.loadPartialFail')}:</strong> {payrollLoadErrors.join(', ')}. {t('finance.stillShowingLoaded')}</div>
                    <button class="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/40" onclick={loadPayroll}>{t('finance.retry')}</button>
                </div>
            {/if}
            <div class="grid gap-6 xl:grid-cols-[360px_1fr]">
                <div class="space-y-6">
                    {#if canManagePayroll}
                        <form onsubmit={createPeriod} class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <h2 class="font-bold">{t('finance.openPayrollPeriod')}</h2>
                            <label class="text-xs text-slate-500">{t('finance.periodStart')}<input required type="date" bind:value={periodForm.periodStart} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label>
                            <label class="text-xs text-slate-500">{t('finance.periodEnd')}<input required type="date" bind:value={periodForm.periodEnd} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label>
                            <label class="text-xs text-slate-500">{t('finance.branch')}<select required bind:value={periodForm.branchId} onchange={() => { branchId = periodForm.branchId; void loadPayroll(); }} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-900"><option value="" disabled>{t('finance.selectBranch')}</option>{#each branches as branch (branch.id)}<option value={branch.id}>{branch.name}</option>{/each}</select></label>
                            <button disabled={saving || !periodForm.branchId || !canWritePayrollScope} class="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{t('finance.openPeriodButton')}</button>
                        </form>
                    {/if}

                    {#if canViewPayroll}
                        <PayrollTaxProfilePanel branchId={periodForm.branchId || branchId} canConfigure={canConfigurePolicies} onSaved={loadPayroll} />
                        <PayrollWorkPolicyPanel branchId={periodForm.branchId || branchId} canConfigure={canConfigurePolicies} onSaved={loadPayroll} />
                    {:else}
                        <div class="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700">{t('finance.noPayrollPermission')}</div>
                    {/if}

                    {#if canConfigureCompensation}
                        <form onsubmit={createCompensation} class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <h2 class="font-bold">{t('finance.setCompensation')}</h2>
                            {#if !branchId && !periodForm.branchId}<div class="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{t('finance.selectBranchForStaff')}</div>{/if}
                            <label class="text-xs text-slate-500">{t('finance.staff')}<select required bind:value={compForm.userId} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-900">{#each staff as person (person.id)}<option value={person.id}>{person.name} · {person.role}</option>{/each}</select></label>
                            <label class="text-xs text-slate-500">{t('finance.payType')}<select bind:value={compForm.payType} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-900">{#each payTypeKeys as key}<option value={key}>{t(`finance.payType.${key}`)}</option>{/each}</select></label>
                            <label class="text-xs text-slate-500">{t('finance.baseSalary')} ({compForm.payType === 'DAILY' ? t('finance.perDay') : compForm.payType === 'HOURLY' ? t('finance.perHour') : t('finance.perMonth')})<MoneyInput required bind:value={compForm.baseRate} class="mt-1" /></label>
                            <label class="text-xs text-slate-500">{t('finance.effectiveFrom')}<input required type="date" bind:value={compForm.effectiveFrom} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label>
                            <label class="text-xs text-slate-500">{t('finance.allowance')}<MoneyInput bind:value={compForm.allowance} class="mt-1" /></label>
                            <label class="text-xs text-slate-500">{t('finance.otherDeduction')}<MoneyInput bind:value={compForm.defaultDeduction} class="mt-1" /></label>
                            <label class="text-xs text-slate-500">{t('finance.taxExemptAmount')}<MoneyInput bind:value={compForm.taxExemptAmount} class="mt-1" /></label>
                            <label class="text-xs text-slate-500">{t('finance.commissionRate')}<input min="0" max="1" step="0.001" type="number" bind:value={compForm.commissionRate} class="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label>
                            <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" bind:checked={compForm.socialSecurityEnabled} class="h-4 w-4 rounded" /> {t('finance.socialSecurityEnabled')}</label>
                            <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" bind:checked={compForm.overtimeEligible} class="h-4 w-4 rounded" /> {t('finance.overtimeEligible')}</label>
                            <button disabled={saving || !compForm.userId || (!branchId && !periodForm.branchId)} class="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-700">{t('finance.saveCompensation')}</button>
                        </form>
                    {/if}
                </div>
                <div class="space-y-6">
                    <div data-testid="payroll-periods" class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div class="border-b p-5 dark:border-slate-800"><h2 class="font-bold">{t('finance.payrollPeriods')}</h2><p class="text-xs text-slate-500">{t('finance.periodFlow')}</p></div>
                        <div class="divide-y dark:divide-slate-800">
                            {#each periods as period (period.id)}
                                <div class="p-4">
                                    <div class="flex flex-wrap items-start justify-between gap-3">
                                        <div><div class="font-semibold">{new Date(period.periodStart).toLocaleDateString('lo-LA')} — {new Date(period.periodEnd).toLocaleDateString('lo-LA')}</div><div class="mt-1 text-xs text-slate-500">{period.branchName || t('finance.wholeStore')} · {t(`finance.periodStatus.${period.status}`)}</div></div>
                                        <div class="text-right"><div class="text-xs text-slate-500">{t('finance.netPayroll')}</div><div class="font-bold text-violet-600">{money(period.totalNet)}</div></div>
                                    </div>
                                    {#if period.taxProfileId}
                                        <dl class="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-5 dark:bg-slate-950">
                                            <div><dt class="text-slate-500">{t('finance.gross')}</dt><dd class="font-semibold">{money(period.totalGross)}</dd></div>
                                            <div><dt class="text-slate-500">{t('finance.incomeTax')}</dt><dd class="font-semibold text-amber-600">{money(period.totalIncomeTax)}</dd></div>
                                            <div><dt class="text-slate-500">{t('finance.employeeSocial')}</dt><dd class="font-semibold">{money(period.totalEmployeeSocial)}</dd></div>
                                            <div><dt class="text-slate-500">{t('finance.employerSocial')}</dt><dd class="font-semibold">{money(period.totalEmployerSocial)}</dd></div>
                                            <div><dt class="text-slate-500">{t('finance.employerCost')}</dt><dd class="font-semibold">{money(period.totalEmployerCost)}</dd></div>
                                        </dl>
                                    {/if}
                                    <div class="mt-3 flex flex-wrap gap-1">
                                        {#if canViewPayrollDetails}<button class="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs dark:border-slate-700" onclick={() => loadPeriodDetails(period.id)}><ChevronDown class="h-3 w-3 transition-transform {expandedPeriodId === period.id ? 'rotate-180' : ''}" /> {t('finance.payslips')}</button>{/if}
                                        {#if (period.status === 'OPEN' || period.status === 'CALCULATING') && canManagePayroll && canWritePeriod(period)}<button class="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800" onclick={() => payrollAction(period, 'calculate')}>{t('finance.calculate')}</button>{/if}
                                        {#if period.status === 'CALCULATING' && canManagePayroll && canWritePeriod(period)}<button class="rounded-lg bg-blue-100 px-2 py-1 text-xs text-blue-700" onclick={() => payrollAction(period, 'submit')}><Send class="inline h-3 w-3" /> {t('finance.submit')}</button>{/if}
                                        {#if period.status === 'PENDING_APPROVAL' && canReviewPeriod(period)}
                                            <button data-testid="payroll-approve" class="rounded-lg bg-emerald-100 px-2 py-1 text-xs text-emerald-700" onclick={() => payrollAction(period, 'approve')}><Check class="inline h-3 w-3" /> {t('finance.approve')}</button>
                                            <button class="rounded-lg bg-rose-100 px-2 py-1 text-xs text-rose-700" onclick={() => openPayrollDialog('reject', period)}><X class="inline h-3 w-3" /> {t('finance.rejectPayroll')}</button>
                                        {/if}
                                        {#if ['APPROVED', 'PARTIALLY_PAID'].includes(period.status) && canPayPayroll && canWritePeriod(period)}<button data-testid="payroll-pay-all" class="rounded-lg bg-violet-100 px-2 py-1 text-xs text-violet-700" onclick={() => openPayrollDialog('pay', period)}><Banknote class="inline h-3 w-3" /> {t('finance.batchPay')}</button>{/if}
                                        {#if period.status === 'PAID' && canManagePayroll && canManagePeriod(period)}<button class="rounded-lg bg-slate-800 px-2 py-1 text-xs text-white dark:bg-slate-200 dark:text-slate-900" onclick={() => payrollAction(period, 'close')}><LockKeyhole class="inline h-3 w-3" /> {t('finance.closePayroll')}</button>{/if}
                                        {#if ['PAID', 'CLOSED'].includes(period.status) && canPayPayroll && canManagePeriod(period)}<button class="rounded-lg bg-rose-100 px-2 py-1 text-xs text-rose-700" onclick={() => openPayrollDialog('reverse', period)}><RotateCcw class="inline h-3 w-3" /> {t('finance.reversePayroll')}</button>{/if}
                                        {#if canExportPayroll}<button class="rounded-lg border border-slate-200 px-2 py-1 text-xs dark:border-slate-700" onclick={() => exportPayroll(period)}><Download class="inline h-3 w-3" /> {t('finance.export')}</button>{/if}
                                    </div>
                                    {#if ['APPROVED', 'PARTIALLY_PAID'].includes(period.status) && !canPayPayroll}
                                        <p class="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">{t('finance.payBlockedPermission')}</p>
                                    {:else if ['APPROVED', 'PARTIALLY_PAID'].includes(period.status) && !canWritePeriod(period)}
                                        <p class="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">{t('finance.payBlockedScope')}</p>
                                    {/if}
                                    {#if period.status === 'PENDING_APPROVAL' && hasApprovePayrollPermission && !isAssignedPayrollChecker}
                                        <p class="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">{t('finance.checkerAssignmentRequired')}</p>
                                    {:else if period.status === 'PENDING_APPROVAL' && canApprovePayroll && !auth.user?.isSuperAdmin && (period.createdBy === auth.user?.id || period.submittedBy === auth.user?.id)}
                                        <p class="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">{t('finance.selfReviewBlocked')}</p>
                                    {/if}
                                    {#if expandedPeriodId === period.id}
                                        <div class="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                                            {#if detailLoading && !periodDetails[period.id]}
                                                <div class="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><Loader2 class="h-4 w-4 animate-spin" /> {t('finance.loadingPayslips')}</div>
                                            {:else if periodDetails[period.id]}
                                                {@const detail = periodDetails[period.id]}
                                                <div class="border-b border-slate-200 p-4 dark:border-slate-800">
                                                    <div class="flex items-center justify-between gap-3"><div><h3 class="font-semibold">{t('finance.payrollAdjustments')}</h3><p class="text-xs text-slate-500">{t('finance.adjustmentsHelp')}</p></div><Gift class="h-5 w-5 text-amber-500" /></div>
                                                    {#if canManagePayroll && canWritePeriod(period) && (period.status === 'OPEN' || period.status === 'CALCULATING')}
                                                        <form onsubmit={(event) => createAdjustment(period, event)} class="mt-3 grid gap-2 sm:grid-cols-[1.2fr_.8fr_.8fr_1.4fr_auto]">
                                                            <select required aria-label={t('finance.staff')} bind:value={adjustmentForm.userId} class="rounded-lg border px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">{#each staff as person (person.id)}<option value={person.id}>{person.name}</option>{/each}</select>
                                                            <select bind:value={adjustmentForm.type} aria-label={t('finance.category')} class="rounded-lg border px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"><optgroup label={t('finance.additions')}>{#each additionTypes as adjType}<option value={adjType}>{t(`finance.adjustmentType.${adjType}`)}</option>{/each}</optgroup><optgroup label={t('finance.deductions')}>{#each deductionTypes as adjType}<option value={adjType}>{t(`finance.adjustmentType.${adjType}`)}</option>{/each}</optgroup></select>
                                                            <MoneyInput required min={0.01} bind:value={adjustmentForm.amount} aria-label={t('finance.amount')} class="text-xs" />
                                                            <input required bind:value={adjustmentForm.reason} placeholder={t('finance.reasonReference')} aria-label={t('finance.reason')} class="rounded-lg border px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900" />
                                                            <button disabled={saving || !adjustmentForm.userId} class="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">{t('finance.add')}</button>
                                                        </form>
                                                    {/if}
                                                    <div class="mt-3 space-y-2">
                                                        {#each detail.adjustments || [] as adjustment (adjustment.id)}
                                                            <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs dark:bg-slate-900"><div><span class="font-semibold">{t(`finance.adjustmentType.${adjustment.type}`)}</span> · {money(adjustment.amount)} <span class="text-slate-500">— {adjustment.reason}</span>{#if adjustment.reviewReason}<div class="mt-1 text-rose-600">{adjustment.reviewReason}</div>{/if}</div><div class="flex items-center gap-2"><span class="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{t(`finance.adjustmentStatus.${adjustment.status}`)}</span>{#if adjustment.status === 'PENDING_APPROVAL' && canApprovePayroll && canWritePeriod(period) && (auth.user?.isSuperAdmin || adjustment.createdBy !== auth.user?.id)}<button class="rounded-lg bg-emerald-100 px-2 py-1 font-semibold text-emerald-700" onclick={() => approveAdjustment(period, adjustment.id)}>{t('finance.approve')}</button><button class="rounded-lg bg-rose-100 px-2 py-1 font-semibold text-rose-700" onclick={() => openAdjustmentDialog('adjustment-reject', period, adjustment)}>{t('finance.rejectPayroll')}</button>{/if}{#if adjustment.status === 'PENDING_APPROVAL' && canManagePayroll && canWritePeriod(period)}<button class="rounded-lg border border-slate-200 px-2 py-1 font-semibold dark:border-slate-700" onclick={() => openAdjustmentDialog('adjustment-cancel', period, adjustment)}>{t('common.cancel')}</button>{/if}</div></div>
                                                        {:else}
                                                            <p class="text-xs text-slate-500">{t('finance.noAdjustments')}</p>
                                                        {/each}
                                                    </div>
                                                </div>
                                                {#if detail.payments?.length}
                                                    <div class="border-b border-slate-200 p-4 dark:border-slate-800">
                                                        <h3 class="font-semibold">{t('finance.paymentHistory')}</h3>
                                                        <div class="mt-3 grid gap-2 sm:grid-cols-2">
                                                            {#each detail.payments as payment (payment.id)}
                                                                <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                                                                    <div><div class="font-semibold">{t(`finance.paymentMethod.${payment.paymentMethod}`)}</div><div class="text-slate-500">{payment.reference || t('finance.noReference')} · {new Date(payment.paidAt).toLocaleString('lo-LA')}</div></div>
                                                                    <div class:text-rose-600={Number(payment.amount) < 0} class="font-bold">{money(payment.amount)}</div>
                                                                </div>
                                                            {/each}
                                                        </div>
                                                    </div>
                                                {/if}
                                                <div class="overflow-x-auto">
                                                    <table class="w-full min-w-[1420px] text-left text-xs">
                                                        <thead class="text-slate-500"><tr><th class="px-3 py-3">{t('finance.employee')}</th><th class="px-3 py-3 text-right">{t('finance.regularHours')}</th><th class="px-3 py-3 text-right">{t('finance.otHours')}</th><th class="px-3 py-3 text-right">{t('finance.weekendHoliday')}</th><th class="px-3 py-3 text-right">{t('finance.lateMinutes')}</th><th class="px-3 py-3 text-right">{t('finance.earlyLeaveMinutes')}</th><th class="px-3 py-3 text-right">{t('finance.base')}</th><th class="px-3 py-3 text-right">{t('finance.otPay')}</th><th class="px-3 py-3 text-right">{t('finance.additions')}</th><th class="px-3 py-3 text-right">{t('finance.tax')}</th><th class="px-3 py-3 text-right">{t('finance.social')}</th><th class="px-3 py-3 text-right">{t('finance.attendanceDeduction')}</th><th class="px-3 py-3 text-right">{t('finance.otherDeduction')}</th><th class="px-3 py-3 text-right">{t('finance.net')}</th><th class="px-3 py-3 text-right">{t('finance.actions')}</th></tr></thead>
                                                        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                                                            {#each detail.items || [] as item (item.id)}
                                                                <tr>
                                                                    <td class="px-3 py-3"><div class="font-semibold">{item.userName || item.userEmail}</div><div class="text-[10px] text-slate-500">{t(`finance.payType.${item.payType}`)} · {item.attendanceDays}/{item.scheduledDays || 0} {t('finance.attendedScheduledDays')}</div>{#if Number(item.absenceDays) > 0}<div class="mt-1 text-[10px] font-semibold text-rose-600">{item.absenceDays} {t('finance.absenceDaysReview')}</div>{/if}{#if item.calculationDetails?.complianceWarnings?.some((warning: string) => warning.startsWith('OT_'))}<div class="mt-1 text-[10px] font-semibold text-amber-600">{t('finance.otComplianceReview')}</div>{/if}</td>
                                                                    <td class="px-3 py-3 text-right">{item.regularHours}</td>
                                                                    <td class="px-3 py-3 text-right font-semibold text-cyan-700">{item.overtimeHours}</td>
                                                                    <td class="px-3 py-3 text-right">{item.weekendHours}/{item.holidayHours}</td>
                                                                    <td class="px-3 py-3 text-right text-amber-700">{item.lateMinutes || 0}</td>
                                                                    <td class="px-3 py-3 text-right text-amber-700">{item.earlyLeaveMinutes || 0}</td>
                                                                    <td class="px-3 py-3 text-right">{money(item.basePay)}</td>
                                                                    <td class="px-3 py-3 text-right text-cyan-700">{money(item.overtimePay)}</td>
                                                                    <td class="px-3 py-3 text-right">{money(Number(item.commission) + Number(item.allowance) + Number(item.reimbursement))}</td>
                                                                    <td class="px-3 py-3 text-right text-amber-700">{money(item.incomeTax)}</td>
                                                                    <td class="px-3 py-3 text-right">{money(item.employeeSocialSecurity)}</td>
                                                                    <td class="px-3 py-3 text-right font-semibold text-rose-700">{money(item.attendanceDeduction)}</td>
                                                                    <td class="px-3 py-3 text-right">{money(item.otherDeductions)}</td>
                                                                    <td class="px-3 py-3 text-right text-sm font-bold text-violet-700">{money(item.netPay)}</td>
                                                                    <td class="px-3 py-3"><div class="flex justify-end gap-1"><button title={t('finance.payslip')} class="rounded-lg border border-slate-200 p-1.5 dark:border-slate-700" onclick={() => printPayslip(period, item)}><Printer class="h-3.5 w-3.5" /></button>{#if ['APPROVED', 'PARTIALLY_PAID'].includes(period.status) && item.status === 'APPROVED' && canPayPayroll && canWritePeriod(period)}<button title={t('finance.payEmployee')} class="rounded-lg bg-violet-100 p-1.5 text-violet-700" onclick={() => openPayrollDialog('pay', period, item)}><Banknote class="h-3.5 w-3.5" /></button>{/if}</div></td>
                                                                </tr>
                                                            {:else}
                                                                <tr><td colspan="15" class="px-4 py-8 text-center text-slate-500">{t('finance.calculateFirst')}</td></tr>
                                                            {/each}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            {:else}
                                <div class="p-12 text-center text-slate-500">{t('finance.noPeriods')}</div>
                            {/each}
                        </div>
                    </div>
                    {#if canViewPayrollDetails}<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div class="border-b p-5 dark:border-slate-800"><h2 class="font-bold">{t('finance.compensationHistory')}</h2></div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-slate-50 text-xs text-slate-500 dark:bg-slate-950"><tr><th class="px-4 py-3">{t('finance.staff')}</th><th class="px-4 py-3">{t('finance.payType')}</th><th class="px-4 py-3 text-right">{t('finance.baseSalary')}</th><th class="px-4 py-3">{t('finance.effectiveFrom')}</th></tr></thead>
                                <tbody class="divide-y dark:divide-slate-800">
                                    {#each compensation as item (item.id)}
                                        <tr>
                                            <td class="px-4 py-3">{item.userName || item.userEmail || item.userId}</td>
                                            <td class="px-4 py-3">{t(`finance.payType.${item.payType}`)}</td>
                                            <td class="px-4 py-3 text-right">{money(item.baseRate)}</td>
                                            <td class="px-4 py-3">{new Date(item.effectiveFrom).toLocaleDateString('lo-LA')}</td>
                                        </tr>
                                    {:else}
                                        <tr><td colspan="4" class="p-8 text-center text-slate-500">{t('finance.noCompensation')}</td></tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>{/if}
                </div>
            </div>
        {/if}
    </div>
</div>

{#if payrollDialog.open && payrollDialog.period}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation" onclick={(event) => event.currentTarget === event.target && closePayrollDialog()}>
        <form data-testid="payroll-action-dialog" onsubmit={submitPayrollDialog} class="w-full max-w-md rounded-3xl border border-white/20 bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <h2 class="text-lg font-bold">{payrollDialog.kind === 'pay' ? (payrollDialog.itemId ? t('finance.payEmployee') : t('finance.batchPay')) : payrollDialog.kind === 'reverse' ? t('finance.reversePayroll') : payrollDialog.kind === 'adjustment-cancel' ? t('finance.cancelAdjustment') : payrollDialog.kind === 'adjustment-reject' ? t('finance.rejectAdjustment') : t('finance.rejectPayroll')}</h2>
                    <p class="mt-1 text-xs text-slate-500">{payrollDialog.employee || payrollDialog.period.branchName || t('finance.wholeStore')}</p>
                </div>
                <button type="button" aria-label={t('common.close')} class="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800" onclick={closePayrollDialog}><X class="h-4 w-4" /></button>
            </div>

            {#if payrollDialog.kind === 'pay'}
                <div class="mt-5 space-y-4">
                    <label class="block text-sm font-medium">{t('finance.paymentMethod')}
                        <select data-testid="payroll-payment-method" bind:value={payrollDialogForm.paymentMethod} class="mt-1.5 w-full rounded-xl border px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                            <option value="BANK_TRANSFER">{t('finance.paymentMethod.BANK_TRANSFER')}</option><option value="CASH">{t('finance.paymentMethod.CASH')}</option><option value="MOBILE">{t('finance.paymentMethod.MOBILE')}</option><option value="OTHER">{t('finance.paymentMethod.OTHER')}</option>
                        </select>
                    </label>
                    <label class="block text-sm font-medium">{t('finance.paymentReference')}
                        <input data-testid="payroll-payment-reference" required={payrollDialogForm.paymentMethod !== 'CASH'} bind:value={payrollDialogForm.reference} placeholder={payrollDialogForm.paymentMethod === 'CASH' ? t('finance.optional') : t('finance.referenceRequired')} class="mt-1.5 w-full rounded-xl border px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                    </label>
                </div>
            {:else}
                <label class="mt-5 block text-sm font-medium">{payrollDialog.kind === 'reverse' ? t('finance.reversalReason') : t('finance.rejectionReason')}
                    <textarea data-testid="payroll-action-reason" required minlength={payrollDialog.kind === 'reverse' ? 5 : 3} bind:value={payrollDialogForm.reason} rows="4" class="mt-1.5 w-full rounded-xl border px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"></textarea>
                </label>
                <div class="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><AlertTriangle class="h-4 w-4 shrink-0" /> {payrollDialog.kind === 'reverse' ? t('finance.reversalWarning') : t('finance.rejectionWarning')}</div>
            {/if}

            <div class="mt-6 flex justify-end gap-2"><button type="button" class="rounded-xl border px-4 py-2 text-sm dark:border-slate-700" onclick={closePayrollDialog}>{t('common.cancel')}</button><button data-testid="payroll-dialog-submit" disabled={saving} class="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? t('common.saving') : t('common.confirm')}</button></div>
        </form>
    </div>
{/if}
