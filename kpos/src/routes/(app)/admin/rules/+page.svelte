<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { api } from "$lib/api";
    import { auth } from "$lib/stores/auth.svelte";
    import { toast } from "svelte-sonner";
    import { cn } from "$lib/utils";
    import {
        ShieldCheck,
        Loader2,
        Save,
        RefreshCw,
        Check,
        X,
        Eye,
        Plus,
        Pencil,
        Trash2,
        ArrowLeft,
        Sparkles,
        Search,
        Copy,
        ChevronDown,
        ChevronRight,
        Users,
        Shield,
        BarChart3,
        AlertTriangle,
        Info,
        CheckCheck,
        XCircle,
    } from "lucide-svelte";

    // ── Types ──
    interface Rule {
        id: string;
        name: string;
        displayName: string;
        module: string;
        icon: string | null;
        routes: string[];
        permissions: string[];
        order: number;
    }

    interface Role {
        id: string;
        name: string;
        displayName: string;
        description?: string;
        isSystem?: boolean;
    }

    type CrudFlags = { r: boolean; c: boolean; u: boolean; d: boolean };
    type Matrix = Record<string, Record<string, CrudFlags>>;
    type RoleStats = Record<string, { total: number; read: number; create: number; update: number; delete: number }>;

    // ── State ──
    let canAccess = $state(false);
    let isLoading = $state(true);
    let isSaving = $state(false);
    let isSeeding = $state(false);
    let isCopying = $state(false);

    let rules = $state<Rule[]>([]);
    let roles = $state<Role[]>([]);
    let matrix = $state<Matrix>({});
    let savedMatrix = $state<string>('');
    let roleStats = $state<RoleStats>({});
    let searchQuery = $state('');
    let activeTab = $state<'matrix' | 'by-role'>('matrix');
    let showCopyModal = $state(false);
    let copyTargetRoleId = $state<string | null>(null);
    let copySourceRoleId = $state<string | null>(null);
    let collapsedRoles = $state<Set<string>>(new Set());

    // ── Derived ──
    const hasUnsavedChanges = $derived(JSON.stringify(matrix) !== savedMatrix);

    const filteredRules = $derived.by(() => {
        if (!searchQuery.trim()) return rules;
        const q = searchQuery.toLowerCase();
        return rules.filter(r =>
            r.displayName.toLowerCase().includes(q) ||
            r.name.toLowerCase().includes(q) ||
            r.module.toLowerCase().includes(q)
        );
    });

    const visibleRoles = $derived(roles.filter(r => r.name !== 'super_admin'));

    const totalPermissions = $derived.by(() => {
        let total = 0;
        for (const roleId of Object.keys(matrix)) {
            for (const ruleId of Object.keys(matrix[roleId] || {})) {
                const c = matrix[roleId][ruleId];
                if (c.r) total++;
                if (c.c) total++;
                if (c.u) total++;
                if (c.d) total++;
            }
        }
        return total;
    });

    const computedRoleStats = $derived.by(() => {
        const stats: RoleStats = {};
        for (const role of visibleRoles) {
            const s = { total: rules.length, read: 0, create: 0, update: 0, delete: 0 };
            for (const rule of rules) {
                const c = matrix[role.id]?.[rule.id];
                if (c?.r) s.read++;
                if (c?.c) s.create++;
                if (c?.u) s.update++;
                if (c?.d) s.delete++;
            }
            stats[role.id] = s;
        }
        return stats;
    });

    // ── Lifecycle ──
    onMount(async () => {
        const user = auth.user;
        if (!user?.isSuperAdmin && user?.role !== 'admin') {
            goto("/dashboard");
            return;
        }
        canAccess = true;
        await loadData();
    });

    // ── Data Loading ──
    async function loadData() {
        isLoading = true;
        try {
            const res = await api.get('admin/rules/matrix').json<any>();
            if (res.success && res.data) {
                roles = res.data.roles || [];
                rules = res.data.rules || [];
                matrix = res.data.matrix || {};
                roleStats = res.data.roleStats || {};
                savedMatrix = JSON.stringify(matrix);
            }
        } catch (error) {
            console.error('Failed to load rules matrix:', error);
            toast.error('ບໍ່ສາມາດໂຫຼດຂໍ້ມູນ Rules ໄດ້');
        } finally {
            isLoading = false;
        }
    }

    // ── Matrix Operations ──
    function toggleCrud(roleId: string, ruleId: string, field: keyof CrudFlags) {
        if (matrix[roleId]?.[ruleId]) {
            matrix[roleId][ruleId] = { ...matrix[roleId][ruleId], [field]: !matrix[roleId][ruleId][field] };
        }
    }

    function toggleAllForRole(roleId: string, value: boolean) {
        for (const rule of rules) {
            if (matrix[roleId]?.[rule.id]) {
                matrix[roleId][rule.id] = { r: value, c: value, u: value, d: value };
            }
        }
    }

    function toggleColumnForRule(ruleId: string, field: keyof CrudFlags) {
        const allOn = visibleRoles.every(role => matrix[role.id]?.[ruleId]?.[field]);
        for (const role of visibleRoles) {
            if (matrix[role.id]?.[ruleId]) {
                matrix[role.id][ruleId] = { ...matrix[role.id][ruleId], [field]: !allOn };
            }
        }
    }

    function toggleEntireRule(ruleId: string, value: boolean) {
        for (const role of visibleRoles) {
            if (matrix[role.id]?.[ruleId]) {
                matrix[role.id][ruleId] = { r: value, c: value, u: value, d: value };
            }
        }
    }

    function toggleRoleCollapse(roleId: string) {
        const next = new Set(collapsedRoles);
        if (next.has(roleId)) next.delete(roleId);
        else next.add(roleId);
        collapsedRoles = next;
    }

    // ── Save ──
    async function saveAll() {
        isSaving = true;
        try {
            const res = await api.put('admin/rules/matrix', {
                json: { matrix }
            }).json<any>();

            if (res.success) {
                savedMatrix = JSON.stringify(matrix);
                toast.success(res.message || 'ບັນທຶກ Rules ທັງໝົດສຳເລັດ');
            } else {
                toast.error('ບັນທຶກບໍ່ສຳເລັດ');
            }
        } catch (error) {
            toast.error('ເກີດຂໍ້ຜິດພາດ');
        } finally {
            isSaving = false;
        }
    }

    // ── Seed ──
    async function seedRules() {
        if (!confirm('ການ Seed ຈະລົບ Rules ເກົ່າທັງໝົດແລ້ວສ້າງໃໝ່. ດຳເນີນການຕໍ່ບໍ?')) return;
        isSeeding = true;
        try {
            await api.post('admin/roles/seed').json<any>();
            const res = await api.post('admin/rules/seed').json<any>();
            if (res.success) {
                toast.success(res.message || 'Seed ສຳເລັດ');
                await loadData();
            }
        } catch (error) {
            toast.error('Seed ບໍ່ສຳເລັດ');
        } finally {
            isSeeding = false;
        }
    }

    // ── Copy Rules ──
    function openCopyModal(targetRoleId: string) {
        copyTargetRoleId = targetRoleId;
        copySourceRoleId = null;
        showCopyModal = true;
    }

    async function executeCopy() {
        if (!copyTargetRoleId || !copySourceRoleId) return;
        isCopying = true;
        try {
            const res = await api.post(`admin/roles/${copyTargetRoleId}/copy-rules`, {
                json: { sourceRoleId: copySourceRoleId }
            }).json<any>();

            if (res.success) {
                toast.success(res.message || 'ຄັດລອກສຳເລັດ');
                showCopyModal = false;
                await loadData();
            }
        } catch (error) {
            toast.error('ຄັດລອກບໍ່ສຳເລັດ');
        } finally {
            isCopying = false;
        }
    }

    // ── Helpers ──
    function getCrudCount(roleId: string): number {
        let count = 0;
        for (const rule of rules) {
            const c = matrix[roleId]?.[rule.id];
            if (c?.r) count++;
            if (c?.c) count++;
            if (c?.u) count++;
            if (c?.d) count++;
        }
        return count;
    }

    function getRoleCoverage(roleId: string): number {
        const maxPossible = rules.length * 4;
        if (maxPossible === 0) return 0;
        return Math.round((getCrudCount(roleId) / maxPossible) * 100);
    }

    function getCoverageColor(pct: number): string {
        if (pct >= 80) return 'text-green-600 dark:text-green-400';
        if (pct >= 50) return 'text-amber-600 dark:text-amber-400';
        if (pct >= 20) return 'text-orange-600 dark:text-orange-400';
        return 'text-red-600 dark:text-red-400';
    }

    function getCoverageBarColor(pct: number): string {
        if (pct >= 80) return 'bg-green-500';
        if (pct >= 50) return 'bg-amber-500';
        if (pct >= 20) return 'bg-orange-500';
        return 'bg-red-500';
    }

    const CRUD_DEFS = [
        { key: 'r' as const, label: 'R', full: 'Read', icon: Eye, bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-300 dark:ring-blue-700' },
        { key: 'c' as const, label: 'C', full: 'Create', icon: Plus, bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-600 dark:text-green-400', ring: 'ring-green-300 dark:ring-green-700' },
        { key: 'u' as const, label: 'U', full: 'Update', icon: Pencil, bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-300 dark:ring-amber-700' },
        { key: 'd' as const, label: 'D', full: 'Delete', icon: Trash2, bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-600 dark:text-red-400', ring: 'ring-red-300 dark:ring-red-700' },
    ];
</script>

<svelte:head>
    <title>Rules Management - KPOS</title>
</svelte:head>

{#if !canAccess}
    <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 class="w-8 h-8 animate-spin text-primary-500" />
    </div>
{:else}
<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6 lg:p-8">
    <!-- ═══ Header ═══ -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div class="flex items-center gap-3">
            <button
                onclick={() => goto('/admin')}
                class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-all"
            >
                <ArrowLeft class="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div class="p-2.5 bg-linear-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg">
                <ShieldCheck class="w-6 h-6 text-white" />
            </div>
            <div>
                <div class="flex items-center gap-2">
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Rules Management</h1>
                    {#if hasUnsavedChanges}
                        <span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 animate-pulse">
                            ยັງບໍ່ໄດ້ບັນທຶກ
                        </span>
                    {/if}
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400">ຈັດການ CRUD Matrix — ກຳນົດສິດການເຂົ້າເຖິງຕາມບົດບາດ</p>
            </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
            <button
                onclick={seedRules}
                disabled={isSeeding}
                class="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-sm font-medium transition-all disabled:opacity-50"
            >
                {#if isSeeding}
                    <Loader2 class="w-4 h-4 animate-spin" />
                {:else}
                    <Sparkles class="w-4 h-4" />
                {/if}
                Seed Default
            </button>
            <button
                onclick={loadData}
                disabled={isLoading}
                class="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-medium transition-all"
            >
                <RefreshCw class={cn("w-4 h-4", isLoading && "animate-spin")} />
                ໂຫຼດໃໝ່
            </button>
            <button
                onclick={saveAll}
                disabled={isSaving || !hasUnsavedChanges}
                class={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition-all disabled:opacity-50",
                    hasUnsavedChanges
                        ? "bg-linear-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                )}
            >
                {#if isSaving}
                    <Loader2 class="w-4 h-4 animate-spin" />
                {:else}
                    <Save class="w-4 h-4" />
                {/if}
                ບັນທຶກທັງໝົດ
            </button>
        </div>
    </div>

    {#if isLoading}
        <div class="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 class="w-10 h-10 text-violet-500 animate-spin" />
            <p class="text-sm text-gray-500 dark:text-gray-400">ກຳລັງໂຫຼດຂໍ້ມູນ...</p>
        </div>
    {:else if rules.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 text-center">
            <ShieldCheck class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mt-4">ບໍ່ມີ Rules</h3>
            <p class="text-gray-500 dark:text-gray-400 mt-2 mb-6">ກົດ "Seed Default" ເພື່ອສ້າງ Rules ແລະ Role mappings ເລີ່ມຕົ້ນ</p>
            <button
                onclick={seedRules}
                disabled={isSeeding}
                class="inline-flex items-center gap-2 px-6 py-3 bg-linear-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold shadow-lg hover:from-amber-600 hover:to-orange-600 transition-all"
            >
                <Sparkles class="w-5 h-5" />
                Seed Default Rules
            </button>
        </div>
    {:else}

        <!-- ═══ Stats Cards ═══ -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                        <Shield class="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">{rules.length}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Rules (ໂມດູນ)</p>
                    </div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Users class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">{visibleRoles.length}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Roles (ບົດບາດ)</p>
                    </div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <BarChart3 class="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">{totalPermissions}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Active Permissions</p>
                    </div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                        <CheckCheck class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-gray-900 dark:text-white">{rules.length * visibleRoles.length * 4}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Max Possible</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ Tab Switcher ═══ -->
        <div class="flex items-center gap-1 mb-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-1 w-fit">
            <button
                onclick={() => activeTab = 'matrix'}
                class={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeTab === 'matrix'
                        ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                )}
            >
                Unified Matrix
            </button>
            <button
                onclick={() => activeTab = 'by-role'}
                class={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeTab === 'by-role'
                        ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                )}
            >
                By Role
            </button>
        </div>

        <!-- ═══ Search Bar ═══ -->
        <div class="relative mb-4 max-w-sm">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
                type="text"
                placeholder="ຄົ້ນຫາ Rule..."
                bind:value={searchQuery}
                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500"
            />
        </div>

        <!-- ═══ TAB: Unified Matrix ═══ -->
        {#if activeTab === 'matrix'}
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="border-b-2 border-gray-200 dark:border-gray-700">
                                <th class="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 min-w-50 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                    Rule / Module
                                </th>
                                {#each visibleRoles as role}
                                    {@const coverage = getRoleCoverage(role.id)}
                                    <th class="text-center px-2 py-3 min-w-35" colspan="1">
                                        <div class="flex flex-col items-center gap-1">
                                            <span class="text-xs font-bold text-gray-900 dark:text-white truncate max-w-30" title={role.displayName}>{role.displayName}</span>
                                            <span class="text-[10px] text-gray-400 dark:text-gray-500">{role.name}</span>
                                            <div class="flex items-center gap-1.5 mt-0.5">
                                                <div class="w-12 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                                    <div class={cn("h-full rounded-full transition-all", getCoverageBarColor(coverage))} style="width: {coverage}%"></div>
                                                </div>
                                                <span class={cn("text-[10px] font-semibold", getCoverageColor(coverage))}>{coverage}%</span>
                                            </div>
                                        </div>
                                    </th>
                                {/each}
                            </tr>
                        </thead>
                        <tbody>
                            {#each filteredRules as rule, idx (rule.id)}
                                <tr class={cn(
                                    "border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/70 dark:hover:bg-gray-700/20 transition-colors",
                                    idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50/50 dark:bg-gray-800/60"
                                )}>
                                    <td class="px-4 py-3 sticky left-0 bg-inherit z-10">
                                        <div class="flex items-center gap-2">
                                            <div class="w-1.5 h-8 rounded-full bg-violet-400 dark:bg-violet-600 shrink-0"></div>
                                            <div>
                                                <span class="font-semibold text-gray-900 dark:text-white text-sm">{rule.displayName}</span>
                                                <div class="flex items-center gap-2 mt-0.5">
                                                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-mono">{rule.module}</span>
                                                    <span class="text-[10px] text-gray-400">{rule.routes.length} routes</span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    {#each visibleRoles as role}
                                        {@const crud = matrix[role.id]?.[rule.id] || { r: false, c: false, u: false, d: false }}
                                        <td class="text-center px-2 py-2.5">
                                            <div class="flex items-center justify-center gap-0.5">
                                                {#each CRUD_DEFS as def}
                                                    <button
                                                        onclick={() => toggleCrud(role.id, rule.id, def.key)}
                                                        title="{def.full} — {role.displayName} / {rule.displayName}"
                                                        class={cn(
                                                            "w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold transition-all",
                                                            crud[def.key]
                                                                ? cn(def.bg, def.text, "ring-1", def.ring)
                                                                : "bg-gray-50 dark:bg-gray-700/50 text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                        )}
                                                    >
                                                        {def.label}
                                                    </button>
                                                {/each}
                                            </div>
                                        </td>
                                    {/each}
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                <!-- Legend -->
                <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                    <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <span class="font-medium">Legend:</span>
                        {#each CRUD_DEFS as def}
                            <div class="flex items-center gap-1">
                                <span class={cn("w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold", def.bg, def.text)}>{def.label}</span>
                                <span>{def.full}</span>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>

        <!-- ═══ TAB: By Role (Expandable Cards) ═══ -->
        {:else if activeTab === 'by-role'}
            <div class="space-y-4">
                {#each visibleRoles as role (role.id)}
                    {@const coverage = getRoleCoverage(role.id)}
                    {@const stats = computedRoleStats[role.id]}
                    {@const isCollapsed = collapsedRoles.has(role.id)}
                    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                        <!-- Role Card Header -->
                        <button
                            onclick={() => toggleRoleCollapse(role.id)}
                            class="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                        >
                            <div class="flex items-center gap-3">
                                {#if isCollapsed}
                                    <ChevronRight class="w-5 h-5 text-gray-400" />
                                {:else}
                                    <ChevronDown class="w-5 h-5 text-gray-400" />
                                {/if}
                                <div class="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                                    <ShieldCheck class="w-5 h-5 text-violet-600 dark:text-violet-400" />
                                </div>
                                <div class="text-left">
                                    <h2 class="font-bold text-gray-900 dark:text-white">{role.displayName}</h2>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">{role.name}{role.description ? ` — ${role.description}` : ''}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-4">
                                <!-- Mini Stats -->
                                {#if stats}
                                    <div class="hidden sm:flex items-center gap-3 text-xs">
                                        <span class="flex items-center gap-1 text-blue-600 dark:text-blue-400"><Eye class="w-3 h-3" />{stats.read}</span>
                                        <span class="flex items-center gap-1 text-green-600 dark:text-green-400"><Plus class="w-3 h-3" />{stats.create}</span>
                                        <span class="flex items-center gap-1 text-amber-600 dark:text-amber-400"><Pencil class="w-3 h-3" />{stats.update}</span>
                                        <span class="flex items-center gap-1 text-red-600 dark:text-red-400"><Trash2 class="w-3 h-3" />{stats.delete}</span>
                                    </div>
                                {/if}
                                <!-- Coverage Bar -->
                                <div class="flex items-center gap-2">
                                    <div class="w-20 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                        <div class={cn("h-full rounded-full transition-all", getCoverageBarColor(coverage))} style="width: {coverage}%"></div>
                                    </div>
                                    <span class={cn("text-xs font-bold w-10 text-right", getCoverageColor(coverage))}>{coverage}%</span>
                                </div>
                            </div>
                        </button>

                        {#if !isCollapsed}
                            <!-- Action Bar -->
                            <div class="flex items-center gap-2 px-5 py-2.5 border-t border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-800/50">
                                <button
                                    onclick={() => toggleAllForRole(role.id, true)}
                                    class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-all"
                                >
                                    <CheckCheck class="w-3 h-3" />
                                    ເລືອກທັງໝົດ
                                </button>
                                <button
                                    onclick={() => toggleAllForRole(role.id, false)}
                                    class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all"
                                >
                                    <XCircle class="w-3 h-3" />
                                    ຍົກເລີກທັງໝົດ
                                </button>
                                <button
                                    onclick={() => openCopyModal(role.id)}
                                    class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all"
                                >
                                    <Copy class="w-3 h-3" />
                                    ຄັດລອກຈາກ Role ອື່ນ
                                </button>
                            </div>

                            <!-- CRUD Table -->
                            <div class="overflow-x-auto">
                                <table class="w-full text-sm">
                                    <thead>
                                        <tr class="border-b border-gray-200 dark:border-gray-700">
                                            <th class="text-left px-4 py-2.5 font-semibold text-gray-700 dark:text-gray-300 w-56">Rule</th>
                                            {#each CRUD_DEFS as def}
                                                <th class="text-center px-3 py-2.5 w-20">
                                                    <div class="flex flex-col items-center gap-0.5">
                                                        <def.icon class={cn("w-3.5 h-3.5", def.text)} />
                                                        <span class="text-[10px] font-medium text-gray-500 dark:text-gray-400">{def.full}</span>
                                                    </div>
                                                </th>
                                            {/each}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each filteredRules as rule (rule.id)}
                                            {@const crud = matrix[role.id]?.[rule.id] || { r: false, c: false, u: false, d: false }}
                                            <tr class="border-b border-gray-50 dark:border-gray-700/30 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                                                <td class="px-4 py-2">
                                                    <span class="font-medium text-gray-900 dark:text-white">{rule.displayName}</span>
                                                    <p class="text-[10px] text-gray-400 mt-0.5">{rule.module} — {rule.routes.length} routes</p>
                                                </td>
                                                {#each CRUD_DEFS as def}
                                                    <td class="text-center px-3 py-2">
                                                        <button
                                                            onclick={() => toggleCrud(role.id, rule.id, def.key)}
                                                            class={cn(
                                                                "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                                                crud[def.key]
                                                                    ? cn(def.bg, def.text, "ring-1.5", def.ring, "shadow-sm")
                                                                    : "bg-gray-100 dark:bg-gray-700/60 text-gray-300 dark:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
                                                            )}
                                                        >
                                                            {#if crud[def.key]}
                                                                <Check class="w-4 h-4" />
                                                            {:else}
                                                                <X class="w-3 h-3" />
                                                            {/if}
                                                        </button>
                                                    </td>
                                                {/each}
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}

    {/if}
</div>

<!-- ═══ Copy Rules Modal ═══ -->
{#if showCopyModal}
    {@const targetRole = visibleRoles.find(r => r.id === copyTargetRoleId)}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-md">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">ຄັດລອກ Rules</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    ຄັດລອກ Rules ຈາກ Role ອື່ນ → <span class="font-semibold text-violet-600 dark:text-violet-400">{targetRole?.displayName}</span>
                </p>
            </div>
            <div class="p-6">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ເລືອກ Role ຕົ້ນທາງ</label>
                <select
                    bind:value={copySourceRoleId}
                    class="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                    <option value={null}>-- ເລືອກ Role --</option>
                    {#each visibleRoles.filter(r => r.id !== copyTargetRoleId) as role}
                        <option value={role.id}>{role.displayName} ({role.name})</option>
                    {/each}
                </select>

                {#if copySourceRoleId}
                    {@const srcCoverage = getRoleCoverage(copySourceRoleId)}
                    <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-xs text-blue-700 dark:text-blue-400">
                        <div class="flex items-center gap-2">
                            <Info class="w-4 h-4 shrink-0" />
                            <span>Coverage: <strong>{srcCoverage}%</strong> ({getCrudCount(copySourceRoleId)} permissions)</span>
                        </div>
                    </div>
                {/if}

                <div class="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                    <div class="flex items-center gap-2">
                        <AlertTriangle class="w-4 h-4 shrink-0" />
                        <span>ການຄັດລອກຈະແທນທີ່ Rules ທີ່ມີຢູ່ໃນ {targetRole?.displayName} ທັງໝົດ</span>
                    </div>
                </div>
            </div>
            <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
                <button
                    onclick={() => showCopyModal = false}
                    class="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                    ຍົກເລີກ
                </button>
                <button
                    onclick={executeCopy}
                    disabled={!copySourceRoleId || isCopying}
                    class="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold shadow-lg hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-50"
                >
                    {#if isCopying}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {:else}
                        <Copy class="w-4 h-4" />
                    {/if}
                    ຄັດລອກ
                </button>
            </div>
        </div>
    </div>
{/if}
{/if}
